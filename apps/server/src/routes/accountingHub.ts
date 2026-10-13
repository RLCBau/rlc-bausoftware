import deliveryReviewRouter from "./deliveryReview";
import {deliveryBillMetadata} from "../services/deliveryAccounting";
import recurringLedgerRouter from "./recurringLedger";
import {journalInput,ledgerText} from "../domain/recurringLedger";
import {planningDate} from "../domain/resourcePlanning";
import {berlinToday} from "../domain/machineUsage";

import { paymentCents, paymentOpenCents } from "../domain/paymentControl";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import fs from "fs";
import { createHash, randomUUID } from "crypto";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { archiveProjectFileVersion } from "../services/dmsArchive";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";
import { createSelfBillingGutschrift } from "../services/pdf/selfBillingGutschrift";

const router = Router();

function accountingRole(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

router.use((req: any, res, next) => {
  const role = accountingRole(req);
  if (req.method === "GET" || req.method === "HEAD") {
    if (["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG", "BAULEITER"].includes(role)) return next();
    return res.status(403).json({ ok: false, error: "ACCOUNTING_READ_FORBIDDEN" });
  }
  if(req.path.startsWith("/delivery-review") && req.method==="PUT" && role==="BAULEITER")return next();
  if(/^\/vendor-bills\/[^/]+\/review$/.test(req.path) && req.method==="POST" && role==="BAULEITER")return next();
  if (!["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG"].includes(role)) {
    return res.status(403).json({ ok: false, error: "ACCOUNTING_WRITE_FORBIDDEN" });
  }
  return next();
});

function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function jsonObject(value: any) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}

function vendorBillStatus(value: any): string {
  return String(value || "captured").trim().toLowerCase();
}

function isVendorBillLocked(bill: any): boolean {
  return ["booked", "cancelled", "corrected"].includes(vendorBillStatus(bill?.status));
}

function vendorVersion(row:any){return JSON.stringify([row.number,row.date,row.supplierId,String(row.netAmount),String(row.taxAmount),String(row.grossAmount),row.status,row.pdfDocId,row.data]);}

function paymentMeta(payment: any) {
  return jsonObject(payment?.data);
}

async function resolveProject(req: any) {
  const cid = companyId(req);
  const userId = String(req?.auth?.sub || req?.auth?.userId || "").trim();
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();

  if (!cid || !userId) {
    throw new Error("COMPANY_REQUIRED");
  }

  const isAdmin = role === "ADMIN" || role === "ADMINISTRATOR" || role === "BUCHHALTUNG";
  const token = String(
    req.query?.projectId ||
    req.body?.projectId ||
    ""
  ).trim();

  if (token) {
    const project = await prisma.project.findFirst({
      where: {
        companyId: cid,
        OR: [
          { id: token },
          { code: token }
        ],
        ...(isAdmin ? {} : { projectMembers: { some: { userId } } })
      }
    });

    if (project) return project;
    throw new Error("PROJECT_FORBIDDEN");
  }

  const project = await prisma.project.findFirst({
    where: {
      companyId: cid,
      ...(isAdmin ? {} : { projectMembers: { some: { userId } } })
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!project) {
    throw new Error("PROJECT_REQUIRED");
  }

  return project;
}

async function context(req: any) {
  const project = await resolveProject(req);

  const accounting = await prisma.accountingRoot.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      currency: "EUR"
    }
  });

  return {
    project,
    accounting
  };
}

function errorResponse(res: any, error: any) {
  console.error(error);
  const code = error?.message || "ACCOUNTING_FAILED";
  const status = code === "PROJECT_FORBIDDEN" || code.endsWith("_FORBIDDEN") ? 403 : code === "VENDOR_BILL_CONFLICT" ? 409 : 400;

  res.status(status).json({ ok: false, error: code });
}

/* =========================================================
   PROJECTS
========================================================= */

router.get("/projects", async (req: any, res) => {
  try {
    const cid = companyId(req);

    if (!cid) {
      throw new Error("COMPANY_REQUIRED");
    }

    const userId = String(req?.auth?.sub || req?.auth?.userId || "").trim();
    const role = accountingRole(req);
    const privileged = role === "ADMIN" || role === "ADMINISTRATOR" || role === "BUCHHALTUNG";
    const items = await prisma.project.findMany({
      where: {
        companyId: cid,
        ...(privileged ? {} : { projectMembers: { some: { userId } } }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    res.json({
      ok: true,
      items
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* =========================================================
   SUMMARY
========================================================= */

router.get("/summary", async (req: any, res) => {
  try {
    const { project, accounting } = await context(req);

    const [invoices, bills, payments, ledger] =
      await Promise.all([
        prisma.invoice.findMany({
          where: { accountingId: accounting.id }
        }),

        prisma.vendorBill.findMany({
          where: { accountingId: accounting.id }
        }),

        prisma.payment.findMany({
          where: { accountingId: accounting.id }
        }),

        prisma.ledgerEntry.findMany({
          where: { accountingId: accounting.id }
        })
      ]);

    const invoiceGross = invoices.reduce(
      (s, x) => s + num(x.grossAmount),
      0
    );

    const billGross = bills.reduce(
      (s, x) => s + num(x.grossAmount),
      0
    );

    // Include reversals with their actual direction for net cash movements.
    const incoming = payments.reduce((s, x) =>
      s + (String(x.direction).toUpperCase() === "IN" ? num(x.amount) : 0), 0);
    const outgoing = payments.reduce((s, x) =>
      s + (String(x.direction).toUpperCase() === "OUT" ? num(x.amount) : 0), 0);
    const invoicePayments = payments.filter(x => x.refType === "INVOICE")
      .reduce((s, x) => s + (String(x.direction).toUpperCase() === "IN" ? 1 : -1) * num(x.amount), 0);
    const billPayments = payments.filter(x => x.refType === "VENDOR_BILL")
      .reduce((s, x) => s + (String(x.direction).toUpperCase() === "OUT" ? 1 : -1) * num(x.amount), 0);

    const ledgerBalance = ledger.reduce(
      (s, x) => s + num(x.amount),
      0
    );

    res.json({
      ok: true,

      project: {
        id: project.id,
        code: project.code,
        name: project.name
      },

      invoiceGross,
      billGross,

      incoming,
      outgoing,

      openReceivables: Math.max(
        0,
        invoiceGross - invoicePayments
      ),

      openPayables: Math.max(
        0,
        billGross - billPayments
      ),

      cashflow: incoming - outgoing,

      ledgerBalance
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* Read-only document-level reconciliation. No automatic accounting adjustments. */
router.get("/reconciliation", async (req: any, res) => {
  try {
    if (!["ADMIN","ADMINISTRATOR","BUCHHALTUNG"].includes(accountingRole(req)))
      return res.status(403).json({ok:false,error:"ACCOUNTING_RECONCILIATION_FORBIDDEN"});
    const {accounting,project}=await context(req);
    const [invoices,bills,payments,ledger]=await Promise.all([
      prisma.invoice.findMany({where:{accountingId:accounting.id}}),
      prisma.vendorBill.findMany({where:{accountingId:accounting.id}}),
      prisma.payment.findMany({where:{accountingId:accounting.id}}),
      prisma.ledgerEntry.findMany({where:{accountingId:accounting.id,refType:{in:["PAYMENT","PAYMENT_REVERSAL"]}}})
    ]);
    const cents=(n:any)=>Math.round(num(n)*100);
    const rows=[...invoices.map(x=>({type:"INVOICE",document:x})),...bills.map(x=>({type:"VENDOR_BILL",document:x}))].map(({type,document}:any)=>{
      const expected=type==="INVOICE"?"IN":"OUT";
      const attached=payments.filter(p=>p.refType===type&&p.refId===document.id);
      const paidCents=attached.reduce((sum,p)=>sum+(p.direction===expected?1:-1)*cents(p.amount),0);
      const dueCents=cents(document.grossAmount);
      const journalIssues:string[]=[];
      for(const payment of attached){
        const entryType=(payment.data as any)?.reversesPaymentId?"PAYMENT_REVERSAL":"PAYMENT";
        const entries=ledger.filter(l=>l.refId===payment.id&&l.refType===entryType);
        if(entries.length!==1||cents(entries[0]?.amount)!==(payment.direction==="IN"?1:-1)*cents(payment.amount))
          journalIssues.push(payment.id);
      }
      return {type,id:document.id,number:document.number,status:document.status,
        gross:dueCents/100,paid:paidCents/100,open:(dueCents-paidCents)/100,
        paymentCount:attached.length,journalIssueCount:journalIssues.length,
        journalIssuePaymentIds:journalIssues,overpaid:paidCents>dueCents};
    });
    return res.json({ok:true,project:{id:project.id,code:project.code},
      items:rows,summary:{documents:rows.length,journalIssues:rows.reduce((n,r)=>n+r.journalIssueCount,0),
      overpaid:rows.filter(r=>r.overpaid).length}});
  }catch(e){errorResponse(res,e);}
});

/* =========================================================
   INVOICES
========================================================= */

router.get("/invoices", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const invoices = await prisma.invoice.findMany({
      where: {
        accountingId: accounting.id
      },
      include: {
        customer: true,
        pdfDoc: true
      },
      orderBy: {
        date: "desc"
      }
    });

    const payments = await prisma.payment.findMany({
      where: {
        accountingId: accounting.id,
        refType: "INVOICE"
      }
    });

    const paidMap = new Map<string, number>();

    for (const payment of payments) {
      if (!payment.refId) continue;

      paidMap.set(
        payment.refId,
        (paidMap.get(payment.refId) || 0) +
          (payment.direction === "IN" ? 1 : -1) * num(payment.amount)
      );
    }

    const items = invoices.map((invoice: any) => {
      const paid = paidMap.get(invoice.id) || 0;

      return {
        ...invoice,
        paidAmount: paid,
        openAmount: Math.max(
          0,
          num(invoice.grossAmount) - paid
        )
      };
    });

    res.json({
      ok: true,
      items
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* =========================================================
   VENDOR BILLS
========================================================= */

router.get("/vendor-bills", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const bills = await prisma.vendorBill.findMany({
      where: {
        accountingId: accounting.id
      },
      include: {
        supplier: true,
        pdfDoc: true
      },
      orderBy: {
        date: "desc"
      }
    });

    const payments = await prisma.payment.findMany({
      where: {
        accountingId: accounting.id,
        refType: "VENDOR_BILL"
      }
    });

    const paidMap = new Map<string, number>();

    for (const payment of payments) {
      if (!payment.refId) continue;

      paidMap.set(
        payment.refId,
        (paidMap.get(payment.refId) || 0) +
          (payment.direction === "IN" ? 1 : -1) * num(payment.amount)
      );
    }

    const items = bills.map((bill: any) => {
      const paid = -(paidMap.get(bill.id) || 0);

      return {
        ...bill,
        paidAmount: paid,
        openAmount: Math.max(
          0,
          num(bill.grossAmount) - paid
        )
      };
    });

    res.json({
      ok: true,
      items
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.post("/vendor-bills", async (req: any, res) => {
  try {
    const {project,accounting} = await context(req);

    const b = req.body || {};
    const deliveryMetadata=await deliveryBillMetadata(project,b);
    const cid = companyId(req);

    const supplierName =
      String(b.supplier || "").trim() ||
      "Unbekannter Lieferant";

    let supplier = await prisma.party.findFirst({
      where: {
        companyId: cid,
        name: supplierName
      }
    });

    if (!supplier) {
      supplier = await prisma.party.create({
        data: {
          companyId: cid,
          name: supplierName,
          type: "SUPPLIER"
        } as any
      });
    }

    const netAmount = num(b.netAmount);
    const taxAmount = num(b.taxAmount);

    const item = await prisma.$transaction(async tx=>{
    const row = await tx.vendorBill.create({
      data: {
        accountingId: accounting.id,

        number:
          String(b.number || "").trim() ||
          `ER-${Date.now()}`,

        date:
          b.date
            ? new Date(b.date)
            : new Date(),

        supplierId: supplier.id,

        netAmount,
        taxAmount,

        grossAmount:
          b.grossAmount !== undefined
            ? num(b.grossAmount)
            : netAmount + taxAmount,

        status: "captured",

        data: {
          dueDate: b.dueDate || null,
          costCenter: b.costCenter || null,
          note: b.note || null,
          ...deliveryMetadata,
          editRevision:1,
            documentType: String(b.documentType || b?.data?.documentType || "EINGANGSRECHNUNG"),
            serviceDate: b.serviceDate || b?.data?.serviceDate || null,
            serviceDescription: b.serviceDescription || b?.data?.serviceDescription || null,
            supplierStreet: b.supplierStreet || b?.data?.supplierStreet || null,
            supplierPostalCode: b.supplierPostalCode || b?.data?.supplierPostalCode || null,
            supplierCity: b.supplierCity || b?.data?.supplierCity || null,
            supplierCountry: b.supplierCountry || b?.data?.supplierCountry || "DE",
            supplierEmail: b.supplierEmail || b?.data?.supplierEmail || null,
            supplierVatId: b.supplierVatId || b?.data?.supplierVatId || null,
            supplierTaxNumber: b.supplierTaxNumber || b?.data?.supplierTaxNumber || null,
            supplierIban: b.supplierIban || b?.data?.supplierIban || null,
            supplierBic: b.supplierBic || b?.data?.supplierBic || null,
            supplierPhone: b.supplierPhone || b?.data?.supplierPhone || null,
            buyerReference: b.buyerReference || b?.data?.buyerReference || null,
            capturedAt: new Date().toISOString(),
            capturedBy: String(req?.auth?.email || req?.auth?.userId || req?.auth?.sub || "").trim() || null
        }
      },
      include: {
        supplier: true
      }
    });

    await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"VENDOR_BILL_CAPTURE",resource:"vendor-bill:"+row.id,meta:{after:JSON.parse(JSON.stringify(row))}}});
    return row;
    });

    res.json({
      ok: true,
      item
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.patch("/vendor-bills/:id", async (req: any, res) => {
  try {
    const { project, accounting } = await context(req);

    const old = await prisma.vendorBill.findFirst({
      where: {
        id: req.params.id,
        accountingId: accounting.id
      }
    });

    if (!old) {
      throw new Error("VENDOR_BILL_NOT_FOUND");
    }

    if (isVendorBillLocked(old)) {
      throw new Error("VENDOR_BILL_FISCALLY_LOCKED");
    }

    const b = req.body || {};
    // Any invoice edit invalidates earlier approvals (enforced again at booking).

    let supplierId = old.supplierId;

    if (b.supplier !== undefined) {
      const supplierName =
        String(b.supplier || "").trim();

      if (supplierName) {
        let supplier = await prisma.party.findFirst({
          where: {
            companyId: companyId(req),
            name: supplierName
          }
        });

        if (!supplier) {
          supplier = await prisma.party.create({
            data: {
              companyId: companyId(req),
              name: supplierName,
              type: "SUPPLIER"
            } as any
          });
        }

        supplierId = supplier.id;
      }
    }

    if (b.pdfDocId !== undefined && b.pdfDocId !== null && String(b.pdfDocId).trim()) {
      const pdfDoc = await prisma.document.findFirst({
        where: { id: String(b.pdfDocId), projectId: project.id, deletedAt: null },
        select: { id: true },
      });
      if (!pdfDoc) throw new Error("VENDOR_BILL_PDF_DOCUMENT_NOT_IN_PROJECT");
    }

    const oldMeta = jsonObject(old.data);
    const patchMeta = jsonObject(b.data);
    const deliveryMetadata=await deliveryBillMetadata(project,b,oldMeta);

    const item = await prisma.$transaction(async tx=>{
     await tx.$queryRawUnsafe('SELECT id FROM "VendorBill" WHERE id = $1 FOR UPDATE',old.id);
     const current=await tx.vendorBill.findUnique({where:{id:old.id}});
     if(!current || vendorVersion(current)!==vendorVersion(old) || (b.editRevision!==undefined && b.editRevision!==Number(oldMeta.editRevision||0)))throw new Error("VENDOR_BILL_CONFLICT");
     if(isVendorBillLocked(current))throw new Error("VENDOR_BILL_FISCALLY_LOCKED");
     const row = await tx.vendorBill.update({
      where: {
        id: old.id
      },
      data: {
        number:
          b.number !== undefined
            ? String(b.number)
            : undefined,

        date:
          b.date !== undefined
            ? new Date(b.date)
            : undefined,

        supplierId,

        netAmount:
          b.netAmount !== undefined
            ? num(b.netAmount)
            : undefined,

        taxAmount:
          b.taxAmount !== undefined
            ? num(b.taxAmount)
            : undefined,

        grossAmount:
          b.grossAmount !== undefined
            ? num(b.grossAmount)
            : undefined,

        status: "captured",

        pdfDocId:
          b.pdfDocId !== undefined
            ? b.pdfDocId
            : undefined,

        data: {
          ...oldMeta,
          ...patchMeta,
          ...deliveryMetadata,
          approvals: {},
          editRevision:Number(oldMeta.editRevision||0)+1,

          dueDate:
            b.dueDate !== undefined
              ? b.dueDate
              : oldMeta.dueDate,

          costCenter:
            b.costCenter !== undefined
              ? b.costCenter
              : oldMeta.costCenter,

          note:
            b.note !== undefined
              ? b.note
              : oldMeta.note,
          documentType: b.documentType !== undefined ? b.documentType : oldMeta.documentType,
          serviceDate: b.serviceDate !== undefined ? b.serviceDate : oldMeta.serviceDate,
          serviceDescription: b.serviceDescription !== undefined ? b.serviceDescription : oldMeta.serviceDescription,
          supplierStreet: b.supplierStreet !== undefined ? b.supplierStreet : oldMeta.supplierStreet,
          supplierPostalCode: b.supplierPostalCode !== undefined ? b.supplierPostalCode : oldMeta.supplierPostalCode,
          supplierCity: b.supplierCity !== undefined ? b.supplierCity : oldMeta.supplierCity,
          supplierCountry: b.supplierCountry !== undefined ? b.supplierCountry : oldMeta.supplierCountry,
          supplierEmail: b.supplierEmail !== undefined ? b.supplierEmail : oldMeta.supplierEmail,
          supplierVatId: b.supplierVatId !== undefined ? b.supplierVatId : oldMeta.supplierVatId,
          supplierTaxNumber: b.supplierTaxNumber !== undefined ? b.supplierTaxNumber : oldMeta.supplierTaxNumber,
          supplierIban: b.supplierIban !== undefined ? b.supplierIban : oldMeta.supplierIban,
          supplierBic: b.supplierBic !== undefined ? b.supplierBic : oldMeta.supplierBic,
          supplierPhone: b.supplierPhone !== undefined ? b.supplierPhone : oldMeta.supplierPhone,
          buyerReference: b.buyerReference !== undefined ? b.buyerReference : oldMeta.buyerReference
        }
      },
      include: {
        supplier: true,
        pdfDoc: true
      }
    });

     await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"VENDOR_BILL_UPDATE",resource:"vendor-bill:"+row.id,meta:{before:JSON.parse(JSON.stringify(old)),after:JSON.parse(JSON.stringify(row))}}});
     return row;
    });

    res.json({
      ok: true,
      item
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

// Two-role approval stages, persisted in VendorBill.data and audited.
router.post("/vendor-bills/:id/review", async (req:any,res)=>{
 try{
  const {project,accounting}=await context(req);
  const actor=String(req.auth?.sub||req.auth?.userId||"").trim();
  if(!actor)throw Error("VENDOR_APPROVAL_ACTOR_REQUIRED");
  const role=accountingRole(req);
  const stage=String(req.body?.stage||"").toUpperCase();
  if(stage!=="TECHNICAL"&&stage!=="ACCOUNTING")throw Error("VENDOR_APPROVAL_STAGE_INVALID");
  if(stage==="TECHNICAL"&&!["BAULEITER","ADMIN","ADMINISTRATOR"].includes(role))throw Error("VENDOR_TECH_REVIEW_FORBIDDEN");
  if(stage==="ACCOUNTING"&&!["BUCHHALTUNG","ADMIN","ADMINISTRATOR"].includes(role))throw Error("VENDOR_ACCOUNTING_REVIEW_FORBIDDEN");
  const item=await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT id FROM "VendorBill" WHERE id = $1 FOR UPDATE',req.params.id);
   const current=await tx.vendorBill.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
   if(!current)throw Error("VENDOR_BILL_NOT_FOUND");
   if(isVendorBillLocked(current))throw Error("VENDOR_BILL_FISCALLY_LOCKED");
   const meta=jsonObject(current.data);
   if(String(meta.documentType||"").toUpperCase()==="GUTSCHRIFT_14")throw Error("USE_SELF_BILLING_ISSUE");
   if(!current.pdfDocId)throw Error("VENDOR_BILL_ORIGINAL_DOCUMENT_REQUIRED");
   const existing=jsonObject(meta.approvals);
   if(stage==="TECHNICAL"&&existing.technical)throw Error("VENDOR_TECH_REVIEW_ALREADY_APPROVED");
   if(stage==="ACCOUNTING"&&existing.accounting)throw Error("VENDOR_ACCOUNTING_REVIEW_ALREADY_APPROVED");
   if(stage==="ACCOUNTING"&&!existing.technical)throw Error("VENDOR_TECH_REVIEW_REQUIRED");
   if(stage==="ACCOUNTING"&&String(existing.technical?.userId||"")===actor)throw Error("VENDOR_FOUR_EYES_REQUIRED");
   const approvals={...existing,[stage==="TECHNICAL"?"technical":"accounting"]:{userId:actor,at:new Date().toISOString(),role}};
   if(stage==="TECHNICAL")delete approvals.accounting;
   const updated=await tx.vendorBill.update({where:{id:current.id},data:{data:{...meta,approvals}}});
   await tx.auditLog.create({data:{companyId:project.companyId,userId:actor,action:"VENDOR_BILL_"+stage+"_APPROVE",resource:"vendor-bill:"+current.id,meta:{stage,previous:existing,next:approvals}}});
   return updated;
  });
  res.json({ok:true,item});
 }catch(e){errorResponse(res,e);}
});

router.post("/vendor-bills/:id/book", async (req: any, res) => {
  try {
    const { project, accounting } = await context(req);
    const item = await prisma.vendorBill.findFirst({
      where: { id: req.params.id, accountingId: accounting.id },
      include: { supplier: true, pdfDoc: true }
    });
    if (!item) throw new Error("VENDOR_BILL_NOT_FOUND");
    if (vendorBillStatus(item.status) === "booked") return res.json({ ok: true, item });
    if (isVendorBillLocked(item)) throw new Error("VENDOR_BILL_FISCALLY_LOCKED");
    if (!String(item.number || "").trim()) throw new Error("VENDOR_BILL_NUMBER_REQUIRED");
    if (!item.supplierId) throw new Error("VENDOR_BILL_SUPPLIER_REQUIRED");
    if (!item.pdfDocId) throw new Error("VENDOR_BILL_ORIGINAL_DOCUMENT_REQUIRED");

    const doc = await prisma.document.findFirst({
      where: { id: item.pdfDocId, projectId: project.id, deletedAt: null },
    });
    if (!doc) throw new Error("VENDOR_BILL_PDF_DOCUMENT_NOT_IN_PROJECT");

    const meta = jsonObject(item.data);
    if (String(meta.documentType || "").toUpperCase() === "GUTSCHRIFT_14") {
      throw new Error("USE_SELF_BILLING_ISSUE");
    }
    const approval=jsonObject(meta.approvals);
    if(!approval.technical||!approval.accounting)throw Error("VENDOR_TWO_STAGE_APPROVAL_REQUIRED");
    if(String(approval.technical.userId)===String(approval.accounting.userId))throw Error("VENDOR_FOUR_EYES_REQUIRED");
    const actor = String(req?.auth?.email || req?.auth?.userId || req?.auth?.sub || "").trim();
    const booked=await prisma.$transaction(async tx=>{
     await tx.$queryRawUnsafe('SELECT id FROM "VendorBill" WHERE id = $1 FOR UPDATE',item.id);
     const current=await tx.vendorBill.findUnique({where:{id:item.id}});
     if(!current || vendorVersion(current)!==vendorVersion(item))throw new Error("VENDOR_BILL_CONFLICT");
     const lockedApprovals=jsonObject(jsonObject(current.data).approvals);
     if(!lockedApprovals.technical||!lockedApprovals.accounting)throw new Error("VENDOR_TWO_STAGE_APPROVAL_REQUIRED");
     if(String(lockedApprovals.technical.userId)===String(lockedApprovals.accounting.userId))throw new Error("VENDOR_FOUR_EYES_REQUIRED");
     const row = await tx.vendorBill.update({
      where: { id: item.id },
      data: {
        status: "booked",
        data: {
          ...meta,
          bookedAt: new Date().toISOString(),
          bookedBy: actor || null,
          retentionLocked: true,
          retentionReason: "§ 14b UStG / § 147 AO / § 257 HGB – Eingangsrechnung 8 Jahre"
        }
      },
      include: { supplier: true, pdfDoc: true }
    });

    if (item.pdfDocId) {
      const date = new Date(item.date);
      const year = date.getUTCFullYear();
      const retentionUntil = new Date(Date.UTC(year + 8, 11, 31, 23, 59, 59, 999)).toISOString();
      {
        await tx.$queryRawUnsafe('SELECT id FROM "Document" WHERE id = $1 FOR UPDATE',doc.id);
        const currentDocument=await tx.document.findFirst({where:{id:doc.id,projectId:project.id,deletedAt:null}});
        if(!currentDocument)throw new Error("VENDOR_BILL_PDF_DOCUMENT_NOT_IN_PROJECT");
        const docMeta = jsonObject(currentDocument.meta);
        await tx.document.update({
          where: { id: doc.id },
          data: { meta: { ...docMeta, retentionLocked: true, retentionUntil, retentionReason: "§ 14b UStG / § 147 AO / § 257 HGB – Eingangsrechnung 8 Jahre", retentionCategory: "TAX_INVOICE_8Y", vendorBillId: item.id } }
        });
      }
    }

     await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"VENDOR_BILL_BOOK",resource:"vendor-bill:"+row.id,meta:{before:JSON.parse(JSON.stringify(item)),after:JSON.parse(JSON.stringify(row))}}});
     return row;
    });
    return res.json({ ok: true, item: booked });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.post("/vendor-bills/:id/issue-self-billing", async (req: any, res) => {
  try {
    const { project, accounting } = await context(req);
    const item = await prisma.vendorBill.findFirst({
      where: { id: req.params.id, accountingId: accounting.id },
      include: { supplier: true, pdfDoc: true }
    });
    if (!item) throw new Error("VENDOR_BILL_NOT_FOUND");
    if (isVendorBillLocked(item)) throw new Error("VENDOR_BILL_FISCALLY_LOCKED");
    const meta = jsonObject(item.data);
    if (String(meta.documentType || "").toUpperCase() !== "GUTSCHRIFT_14") throw new Error("NOT_SELF_BILLING_GUTSCHRIFT");

    const buyerCompany = await loadRlcPdfCompanyFromRequest(req);
    if (!buyerCompany) throw new Error("COMPANY_EINVOICE_PROFILE_REQUIRED");
    const projectKey = String(project.code || project.id);
    const outDir = path.join(PROJECTS_ROOT, projectKey, "exports", "gutschrift", `${Date.now()}_${item.id}`);
    const result = await createSelfBillingGutschrift({
      outputDir: outDir,
      projectId: projectKey,
      projectName: project.name,
      number: String(item.number || ""),
      issueDate: item.date.toISOString().slice(0, 10),
      dueDate: String(meta.dueDate || item.date.toISOString().slice(0, 10)),
      serviceDate: String(meta.serviceDate || ""),
      serviceDescription: String(meta.serviceDescription || meta.note || ""),
      netAmount: num(item.netAmount),
      vatRate: num(item.netAmount) > 0 ? Number((num(item.taxAmount) / num(item.netAmount) * 100).toFixed(4)) : 0,
      supplier: {
        name: String(item.supplier?.name || ""),
        street: String(meta.supplierStreet || ""),
        postalCode: String(meta.supplierPostalCode || ""),
        city: String(meta.supplierCity || ""),
        country: String(meta.supplierCountry || "DE"),
        email: String(meta.supplierEmail || ""),
        vatId: String(meta.supplierVatId || ""),
        taxNumber: String(meta.supplierTaxNumber || ""),
        iban: String(meta.supplierIban || ""),
        bic: String(meta.supplierBic || ""),
        contactName: String(item.supplier?.name || ""),
        phone: String(meta.supplierPhone || ""),
      },
      buyerCompany,
      buyerReference: String(meta.buyerReference || "-").trim() || "-",
      note: String(meta.note || ""),
    });

    const year = item.date.getUTCFullYear();
    const retentionUntil = new Date(Date.UTC(year + 8, 11, 31, 23, 59, 59, 999)).toISOString();
    const actor = String(req?.auth?.email || req?.auth?.userId || req?.auth?.sub || "").trim();
    const archives: any[] = [];
    for (const filePath of [result.pdfPath, result.xmlPath, result.reportPath].filter(Boolean) as string[]) {
      const archived = await archiveProjectFileVersion({
        projectIdOrCode: projectKey,
        filename: path.basename(filePath),
        kind: /\.pdf$/i.test(filePath) ? "PDF" : "DOC",
        localPath: filePath,
        uploadedBy: actor || null,
        meta: {
          source: "self-billing-gutschrift", vendorBillId: item.id, documentType: "GUTSCHRIFT_14",
          retentionLocked: true, retentionUntil,
          retentionReason: "§ 14b UStG / § 147 AO / § 257 HGB – Gutschrift 8 Jahre", retentionCategory: "TAX_INVOICE_8Y"
        }
      });
      archives.push({ filename: path.basename(filePath), ...archived });
    }

    const updated = await prisma.vendorBill.update({
      where: { id: item.id },
      data: {
        status: "booked",
        grossAmount: result.grossAmount,
        taxAmount: result.taxAmount,
        data: {
          ...meta,
          documentType: "GUTSCHRIFT_14",
          issuedAt: new Date().toISOString(), issuedBy: actor || null,
          xrechnungStandard: "XRechnung 3.0.2 / EN16931", xrechnungTypeCode: 389,
          kositValid: true, archives, retentionLocked: true, retentionUntil
        }
      },
      include: { supplier: true, pdfDoc: true }
    });

    return res.json({ ok: true, item: updated, files: archives, kositValid: true });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.delete("/vendor-bills/:id", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const item = await prisma.vendorBill.findFirst({
      where: {
        id: req.params.id,
        accountingId: accounting.id
      }
    });

    if (!item) {
      throw new Error("VENDOR_BILL_NOT_FOUND");
    }

    if (isVendorBillLocked(item)) {
      throw new Error("VENDOR_BILL_FISCALLY_LOCKED");
    }

    const paymentCount = await prisma.payment.count({
      where: { accountingId: accounting.id, refType: "VENDOR_BILL", refId: item.id }
    });
    if (paymentCount > 0) {
      throw new Error("VENDOR_BILL_HAS_PAYMENTS");
    }

    await prisma.vendorBill.delete({ where: { id: item.id } });

    res.json({
      ok: true
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* =========================================================
   PAYMENTS
========================================================= */

// Bank CSV staging: immutable source records; no automatic Payment/LedgerEntry writes.
router.get("/bank-entries", async (req: any, res) => {
  try {
    const {accounting}=await context(req);
    const items=await prisma.bankStatementEntry.findMany({
      where:{accountingId:accounting.id},orderBy:[{bookingDate:"desc"},{importedAt:"desc"}],take:1000
    });
    res.json({ok:true,items});
  } catch(e){errorResponse(res,e);}
});

router.post("/bank-entries/import", async (req: any, res) => {
  try {
    const {accounting}=await context(req);
    const body=req.body||{};
    const rows=body.rows;
    if(!Array.isArray(rows)||rows.length<1||rows.length>1000)throw Error("BANK_IMPORT_ROWS_INVALID");
    const filename=String(body.filename||"Bankauszug.csv").trim().slice(0,180);
    const actor=String(req.auth?.sub||req.auth?.userId||"").trim();
    const normalized=rows.map((raw:any)=>{
      const date=String(raw.date||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("BANK_IMPORT_DATE_INVALID");
      const dateObj=new Date(date+"T12:00:00.000Z");
      if(Number.isNaN(dateObj.getTime())||dateObj.toISOString().slice(0,10)!==date)throw Error("BANK_IMPORT_DATE_INVALID");
      if(typeof raw.amount!=="number"||!Number.isFinite(raw.amount)||raw.amount===0||Math.abs(raw.amount)>1e10)throw Error("BANK_IMPORT_AMOUNT_INVALID");
      const cents=Math.round(raw.amount*100);
      if(Math.abs(raw.amount*100-cents)>0.001)throw Error("BANK_IMPORT_AMOUNT_PRECISION_INVALID");
      const purpose=String(raw.text||"").trim().slice(0,500);
      const reference=String(raw.reference||"").trim().slice(0,180);
      if(!purpose&&!reference)throw Error("BANK_IMPORT_DESCRIPTION_REQUIRED");
      const bankId=String(raw.bankId||"").trim().slice(0,180);
      const fingerprint=createHash("sha256").update(JSON.stringify(bankId?["bank-id",bankId]:["movement",date,cents,purpose.toLowerCase(),reference.toLowerCase()])).digest("hex");
      return {id:randomUUID(),accountingId:accounting.id,fingerprint,bookingDate:dateObj,amount:cents/100,purpose,reference:reference||null,sourceFile:filename,importedBy:actor||null};
    });
    const seen=new Set<string>();
    let duplicatesInFile=0;
    const unique=normalized.filter((x:any)=>{if(seen.has(x.fingerprint)){duplicatesInFile++;return false;}seen.add(x.fingerprint);return true;});
    const saved=await prisma.bankStatementEntry.createMany({data:unique,skipDuplicates:true});
    res.status(201).json({ok:true,received:rows.length,inserted:saved.count,duplicates:rows.length-saved.count,duplicatesInFile,note:"NO_ACCOUNTING_ENTRIES_CREATED"});
  }catch(e){errorResponse(res,e);}
});

router.post("/bank-entries/:id/match", async (req:any,res) => {
 try {
  const {accounting,project}=await context(req);
  const kind=String(req.body?.refType||"").toUpperCase();
  const refId=String(req.body?.refId||"").trim();
  if(!["INVOICE","VENDOR_BILL"].includes(kind)||!refId)throw Error("BANK_MATCH_REFERENCE_INVALID");
  const actor=String(req.auth?.sub||req.auth?.userId||"").trim();
  const matched=await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT id FROM "BankStatementEntry" WHERE id = $1 FOR UPDATE',req.params.id);
   const entry=await tx.bankStatementEntry.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
   if(!entry)throw Error("BANK_ENTRY_NOT_FOUND");
   if(entry.matchedId)throw Error("BANK_ENTRY_ALREADY_MATCHED");
   const invoice=kind==="INVOICE"?await tx.invoice.findFirst({where:{id:refId,accountingId:accounting.id}}):null;
   const bill=kind==="VENDOR_BILL"?await tx.vendorBill.findFirst({where:{id:refId,accountingId:accounting.id}}):null;
   const target:any=invoice||bill;
   if(!target)throw Error("BANK_MATCH_DOCUMENT_NOT_FOUND");
   if(kind==="VENDOR_BILL"&&vendorBillStatus(target.status)!=="booked")throw Error("BANK_MATCH_BILL_NOT_BOOKED");
   if(kind==="INVOICE"&&!["ausgestellt","issued","open","partial","paid"].includes(String(target.status||"").toLowerCase()))throw Error("BANK_MATCH_INVOICE_NOT_ISSUED");
   const amount=Number(entry.amount);
   if((kind==="INVOICE"&&amount<=0)||(kind==="VENDOR_BILL"&&amount>=0))throw Error("BANK_MATCH_DIRECTION_MISMATCH");
   if(Math.abs(Math.abs(amount)-num(target.grossAmount))>0.011)throw Error("BANK_MATCH_AMOUNT_MISMATCH");
   const already=await tx.bankStatementEntry.findFirst({where:{accountingId:accounting.id,matchedType:kind,matchedId:refId}});
   if(already)throw Error("BANK_MATCH_DOCUMENT_ALREADY_LINKED");
   const row=await tx.bankStatementEntry.update({where:{id:entry.id},data:{matchedType:kind,matchedId:refId,matchedAt:new Date(),matchedBy:actor||null}});
   await tx.auditLog.create({data:{companyId:project.companyId,userId:actor,action:"BANK_ENTRY_MATCH",resource:"bank-entry:"+entry.id,meta:{entryId:entry.id,refType:kind,refId,amount:String(entry.amount),note:"REFERENCE_ONLY_NO_PAYMENT_OR_LEDGER"}}});
   return row;
  });
  res.json({ok:true,item:matched,note:"NO_PAYMENT_OR_LEDGER_CREATED"});
 }catch(e){errorResponse(res,e);}
});

router.get("/payments", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const items = await prisma.payment.findMany({
      where: {
        accountingId: accounting.id
      },
      orderBy: {
        date: "desc"
      }
    });

    res.json({
      ok: true,
      items
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.post("/payments", async (req: any, res) => {
  try {
    const { accounting, project } = await context(req);
    const b = req.body || {};

    const refType = String(b.refType || "").toUpperCase();
    const refId = String(b.refId || "").trim();
    const direction = String(b.direction || "IN").toUpperCase();
    const amount = Number(b.amount);
    const paymentDate = b.date ? new Date(b.date) : new Date();

    const amountInCents = paymentCents(b.amount);
    if (!["IN", "OUT"].includes(direction)) {
      throw new Error("PAYMENT_DIRECTION_INVALID");
    }
    if ((refType && !refId) || (!refType && refId)) throw new Error("PAYMENT_REFERENCE_INCOMPLETE");
    if (refType && !["VENDOR_BILL", "INVOICE"].includes(refType)) {
      throw new Error("PAYMENT_REF_TYPE_INVALID");
    }
    if (Number.isNaN(paymentDate.getTime()) || paymentDate.getTime()>Date.now()+86400000) {
      throw new Error("PAYMENT_DATE_INVALID");
    }
    if (refType === "VENDOR_BILL" && direction !== "OUT") {
      throw new Error("VENDOR_BILL_PAYMENT_MUST_BE_OUT");
    }
    if (refType === "INVOICE" && direction !== "IN") {
      throw new Error("INVOICE_PAYMENT_MUST_BE_IN");
    }

    if (refType === "VENDOR_BILL" && refId) {
      const bill = await prisma.vendorBill.findFirst({ where: { id: refId, accountingId: accounting.id } });
      if (!bill) throw new Error("VENDOR_BILL_NOT_FOUND");
      if (vendorBillStatus(bill.status) !== "booked") throw new Error("VENDOR_BILL_NOT_BOOKED");
    }
    if (refType === "INVOICE" && refId) {
      const invoice = await prisma.invoice.findFirst({ where: { id: refId, accountingId: accounting.id } });
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");
      if (!["ausgestellt", "issued", "open", "partial", "paid"].includes(String(invoice.status || "").toLowerCase())) {
        throw new Error("INVOICE_NOT_ISSUED");
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      if(refType && refId){
        // Serialize payment creation per invoice to prevent concurrent overpayment.
        const table=refType==="INVOICE"?"Invoice":"VendorBill";
        await tx.$queryRawUnsafe('SELECT id FROM "'+table+'" WHERE id = $1 FOR UPDATE',refId);
        const target=refType==="INVOICE"
          ? await tx.invoice.findFirst({where:{id:refId,accountingId:accounting.id}})
          : await tx.vendorBill.findFirst({where:{id:refId,accountingId:accounting.id}});
        if(!target)throw new Error("PAYMENT_DOCUMENT_NOT_FOUND");
        if(refType==="INVOICE"&& !["ausgestellt","issued","open","partial","paid"].includes(String(target.status||"").toLowerCase()))throw Error("INVOICE_NOT_ISSUED");
        if(refType==="VENDOR_BILL"&&vendorBillStatus(target.status)!=="booked")throw Error("VENDOR_BILL_NOT_BOOKED");
        const history=await tx.payment.findMany({where:{accountingId:accounting.id,refType,refId}});
        const openCents=paymentOpenCents(target.grossAmount,history,direction);
        if(amountInCents>openCents)throw Error("PAYMENT_EXCEEDS_OPEN_AMOUNT");
      }
      const created = await tx.payment.create({
        data: {
          accountingId: accounting.id,
          date: paymentDate,
          amount,
          method: String(b.method || "Überweisung"),
          direction,
          refType: refType || null,
          refId: refId || null,
          data: {
            party: b.party || null,
            purpose: b.purpose || null,
            note: b.note || null,
            bookedAt: new Date().toISOString(),
            bookedBy: String(req?.auth?.email || req?.auth?.userId || req?.auth?.sub || "").trim() || null,
            reversedByPaymentId: null,
            reversesPaymentId: null
          }
        }
      });

      const isIncome = created.direction === "IN";
      const cashOrBankAccount =
        String(created.method || "").toLowerCase().includes("bar")
          ? "1000"
          : "1200";

      await tx.ledgerEntry.create({
        data: {
          accountingId: accounting.id,
          date: created.date,
          account: cashOrBankAccount,
          contraAccount: isIncome ? "1400" : "1600",
          amount: isIncome ? num(created.amount) : -num(created.amount),
          text: `${isIncome ? "Zahlungseingang" : "Zahlungsausgang"}: ${b.purpose || b.party || created.method}`,
          refType: "PAYMENT",
          refId: created.id
        }
      });

      await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"PAYMENT_BOOK",resource:"payment:"+created.id,meta:{id:created.id,refType,refId,direction,amount,method:created.method}}});
      return created;
    });

    res.json({
      ok: true,
      item
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.patch("/payments/:id", async (_req: any, res) => {
  return res.status(409).json({
    ok: false,
    error: "PAYMENT_IMMUTABLE",
    message: "Gebuchte Zahlungen dürfen nicht geändert werden. Verwenden Sie eine Stornobuchung."
  });
});

router.delete("/payments/:id", async (_req: any, res) => {
  return res.status(409).json({
    ok: false,
    error: "PAYMENT_IMMUTABLE",
    message: "Gebuchte Zahlungen dürfen nicht gelöscht werden. Verwenden Sie eine Stornobuchung."
  });
});

router.post("/payments/:id/reverse", async (req: any, res) => {
  try {
    const { accounting } = await context(req);
    const original = await prisma.payment.findFirst({ where: { id: req.params.id, accountingId: accounting.id } });
    if (!original) throw new Error("PAYMENT_NOT_FOUND");
    const meta = paymentMeta(original);
    if (meta.reversedByPaymentId) throw new Error("PAYMENT_ALREADY_REVERSED");

    const actor = String(req?.auth?.email || req?.auth?.userId || req?.auth?.sub || "").trim();
    const reason = String(req.body?.reason || "Stornobuchung").trim();
    const reversalDate = req.body?.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(reversalDate.getTime())) throw new Error("PAYMENT_DATE_INVALID");

    const reverse = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          accountingId: accounting.id,
          date: reversalDate,
          amount: original.amount,
          method: original.method,
          direction: original.direction === "IN" ? "OUT" : "IN",
          refType: original.refType,
          refId: original.refId,
          data: {
            party: meta.party || null,
            purpose: `Storno: ${meta.purpose || original.id}`,
            note: reason,
            bookedAt: new Date().toISOString(),
            bookedBy: actor || null,
            reversesPaymentId: original.id,
            reversedByPaymentId: null
          }
        }
      });

      const originalIsIncome = original.direction === "IN";
      const cashOrBankAccount = String(original.method || "").toLowerCase().includes("bar") ? "1000" : "1200";
      await tx.ledgerEntry.create({
        data: {
          accountingId: accounting.id,
          date: created.date,
          account: cashOrBankAccount,
          contraAccount: originalIsIncome ? "1400" : "1600",
          amount: originalIsIncome ? -num(original.amount) : num(original.amount),
          text: `Storno Zahlung ${original.id}: ${reason}`,
          refType: "PAYMENT_REVERSAL",
          refId: created.id
        }
      });

      await tx.payment.update({
        where: { id: original.id },
        data: {
          data: {
            ...meta,
            reversedByPaymentId: created.id,
            reversedAt: new Date().toISOString(),
            reversedBy: actor || null,
            reversalReason: reason
          }
        }
      });

      return created;
    });

    return res.json({ ok: true, item: reverse, originalId: original.id });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* =========================================================
   LEDGER / KASSENBUCH
========================================================= */

router.use("/delivery-review",deliveryReviewRouter(context));
router.use("/recurring-ledger",recurringLedgerRouter(context));

router.get("/ledger", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const items = await prisma.ledgerEntry.findMany({
      where: {
        accountingId: accounting.id
      },
      orderBy: [
        { date: "asc" },
        { id: "asc" }
      ]
    });

    res.json({
      ok: true,
      items
    });
  } catch (e) {
    errorResponse(res, e);
  }
});


router.get("/ledger/:id/history",async(req:any,res)=>{
 try{
  const {project,accounting}=await context(req);
  const row=await prisma.ledgerEntry.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
  if(!row)return res.status(404).json({ok:false,error:"LEDGER_ENTRY_NOT_FOUND"});
  const items=await prisma.auditLog.findMany({where:{companyId:project.companyId,OR:[
   {resource:"ledger:"+row.id},
   ...(row.refType==="LEDGER_REVERSAL"?[{resource:"ledger:"+row.refId}]:[]),
   ...(row.refType==="RECURRING_LEDGER"?[{resource:"recurring-ledger:"+row.refId,meta:{path:["ledger","id"],equals:row.id}}]:[])
  ]},orderBy:{createdAt:"desc"},take:100,select:{id:true,action:true,userId:true,createdAt:true,meta:true}});
  res.json({ok:true,items});
 }catch(e){errorResponse(res,e);}
});

router.post("/ledger", async (req: any, res) => {
 try {
  const {project,accounting}=await context(req),b=req.body||{},data=journalInput(b);
  const date=planningDate(b.date || berlinToday());
  if(date>berlinToday())throw new Error("Zukünftige Journalbuchungen sind nicht möglich.");
  const requestId=b.requestId?ledgerText(b.requestId,"Anfrage-ID",36,true):null;
  if(requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw new Error("Anfrage-ID ungültig.");
  const item=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "AccountingRoot" WHERE id = ${accounting.id} FOR UPDATE`;
   if(requestId){
    const old=await tx.ledgerEntry.findFirst({where:{accountingId:accounting.id,refType:"MANUAL_REQUEST",refId:requestId}});
    if(old){
     if(old.date.toISOString().slice(0,10)!==date || Object.keys(data).some(k=>k==="amount"?Number((old as any)[k])!==Number((data as any)[k]):String((old as any)[k]??"")!==String((data as any)[k]??"")))throw new Error("Anfrage-ID wurde mit anderen Buchungsdaten verwendet.");
     return old;
    }
   }
   if(data.costCenter && !await tx.projectCostCenter.findFirst({where:{companyId:project.companyId,projectId:project.id,code:data.costCenter,active:true}}))throw new Error("Aktive Kostenstelle aus diesem Projekt erforderlich.");
   const row=await tx.ledgerEntry.create({data:{...data,accountingId:accounting.id,date:new Date(date+"T00:00:00Z"),refType:requestId?"MANUAL_REQUEST":"MANUAL",refId:requestId}});
   await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"LEDGER_MANUAL_CREATE",resource:"ledger:"+row.id,meta:{after:JSON.parse(JSON.stringify(row))}}});
   return row;
  });
  res.json({ok:true,item});
 }catch(e){errorResponse(res,e);}
});

router.patch("/ledger/:id", async (_req: any, res) => {
  return res.status(409).json({
    ok: false,
    error: "LEDGER_ENTRY_IMMUTABLE",
    message: "Gebuchte Kassen-/Sachbuchungen dürfen nicht geändert werden. Verwenden Sie eine Stornobuchung."
  });
});

router.delete("/ledger/:id", async (_req: any, res) => {
  return res.status(409).json({
    ok: false,
    error: "LEDGER_ENTRY_IMMUTABLE",
    message: "Gebuchte Kassen-/Sachbuchungen dürfen nicht gelöscht werden. Verwenden Sie eine Stornobuchung."
  });
});


router.post("/ledger/:id/reverse", async (req: any, res) => {
 try{
  const {project,accounting}=await context(req);
  const reason=ledgerText(req.body?.reason,"Stornogrund",1000,true);
  const date=planningDate(req.body?.date || berlinToday());
  if(date>berlinToday())throw new Error("Zukünftige Stornobuchungen sind nicht möglich.");
  const item=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "LedgerEntry" WHERE id = ${String(req.params.id)} FOR UPDATE`;
   const original=await tx.ledgerEntry.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
   if(!original)throw new Error("LEDGER_ENTRY_NOT_FOUND");
   if(["LEDGER_REVERSAL","PAYMENT","PAYMENT_REVERSAL"].includes(original.refType||""))throw new Error("Diese Buchung ist über den zugehörigen Zahlungsvorgang zu korrigieren oder bereits ein Storno.");
   const old=await tx.ledgerEntry.findFirst({where:{accountingId:accounting.id,refType:"LEDGER_REVERSAL",refId:original.id}});
   if(old)throw new Error("LEDGER_ENTRY_ALREADY_REVERSED");
   const row=await tx.ledgerEntry.create({data:{accountingId:accounting.id,date:new Date(date+"T00:00:00Z"),account:original.account,contraAccount:original.contraAccount,amount:original.amount.negated(),costCenter:original.costCenter,text:"Storno zu "+original.id+": "+reason,refType:"LEDGER_REVERSAL",refId:original.id}});
   await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"LEDGER_REVERSE",resource:"ledger:"+original.id,meta:{reason,original:JSON.parse(JSON.stringify(original)),reversal:JSON.parse(JSON.stringify(row))}}});
   return row;
  });res.json({ok:true,item,originalId:req.params.id});
 }catch(e){errorResponse(res,e);}
});

/* =========================================================
   MAHNWESEN
========================================================= */

router.get("/mahnwesen", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const invoices = await prisma.invoice.findMany({
      where: {
        accountingId: accounting.id
      },
      include: {
        customer: true
      },
      orderBy: {
        date: "asc"
      }
    });

    const payments = await prisma.payment.findMany({
      where: {
        accountingId: accounting.id,
        refType: "INVOICE"
      }
    });

    const paidMap = new Map<string, number>();

    for (const payment of payments) {
      if (!payment.refId) continue;

      paidMap.set(
        payment.refId,
        (paidMap.get(payment.refId) || 0) +
          (String(payment.direction).toUpperCase()==="IN"?1:-1)*num(payment.amount)
      );
    }

    const items = invoices
      .map((invoice: any) => {
        const meta = jsonObject(invoice.data);

        const paid =
          paidMap.get(invoice.id) || 0;

        const open = Math.max(
          0,
          num(invoice.grossAmount) - paid
        );

        return {
          ...invoice,

          paidAmount: paid,
          openAmount: open,

          dueDate:
            meta.dueDate || null,

          dunningLevel:
            num(meta.dunningLevel),

          lastDunningDate:
            meta.lastDunningDate || null,

          dunningFee:
            num(meta.dunningFee),

          interestRate:
            num(meta.interestRate ?? 0)
        };
      })
        .filter(
          x => {
            if (x.openAmount <= 0.009) return false;
            if (!["ausgestellt","issued","open","partial"].includes(String(x.status||"").toLowerCase()))return false;

            const rawDueDate = String(x.dueDate || "").trim();
            if (!rawDueDate) return false;

            const de = rawDueDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
            const dueDate = de
              ? new Date(`${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}T23:59:59`)
              : new Date(rawDueDate);

            if (Number.isNaN(dueDate.getTime())) return false;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return dueDate < today;
          }
        );

    res.json({
      ok: true,
      items
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.post("/invoices/:id/dunning", async (req: any, res) => {
  try {
    const { accounting } = await context(req);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: req.params.id,
        accountingId: accounting.id
      }
    });

    if (!invoice) {
      throw new Error("INVOICE_NOT_FOUND");
    }

    const meta = jsonObject(invoice.data);
    const b = req.body || {};

    const item = await prisma.invoice.update({
      where: {
        id: invoice.id
      },
      data: {
        data: {
          ...meta,

          dunningLevel:
            num(b.dunningLevel),

          lastDunningDate:
            b.lastDunningDate || null,

          dunningFee:
            num(b.dunningFee),

          interestRate:
            num(b.interestRate ?? 0)
        }
      }
    });

    res.json({
      ok: true,
      item
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* =========================================================
   UST
========================================================= */

router.get("/ust", async (req: any, res) => {
  try {
    const period = String(req.query?.period || "").trim();
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return res.status(400).json({ok:false,error:"UST_PERIOD_INVALID"});
    }
    const periodStart = period ? new Date(`${period}-01T00:00:00.000Z`) : null;
    const periodEnd = periodStart ? new Date(Date.UTC(periodStart.getUTCFullYear(),periodStart.getUTCMonth()+1,1)) : null;
    const documentDate = periodStart && periodEnd ? {gte:periodStart,lt:periodEnd} : undefined;
    const { accounting } = await context(req);

    const [invoices, bills] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          accountingId: accounting.id,
          ...(documentDate ? {date:documentDate} : {})
        }
      }),

      prisma.vendorBill.findMany({
        where: {
          accountingId: accounting.id,
          ...(documentDate ? {date:documentDate} : {})
        }
      })
    ]);

    // Provisional tax overview: exclude drafts and non-booked vendor documents.
    // This is NOT an official UStVA calculation or a substitute for tax review.
    const eligibleInvoices = invoices.filter((x:any) => !["draft","entwurf","captured","cancelled","storniert","void"].includes(String(x.status||"").toLowerCase()));
    const eligibleBills = bills.filter((x:any) => String(x.status||"").toLowerCase()==="booked");
    const rows = [
      ...eligibleInvoices.map((x: any) => ({
        id: `I-${x.id}`,
        type: "Einnahme",
        date: x.date,
        number: x.number,
        netAmount: num(x.netAmount),
        taxAmount: num(x.taxAmount),
        grossAmount: num(x.grossAmount),

        taxRate:
          num(x.netAmount) > 0
            ? Math.round(
                (
                  num(x.taxAmount) /
                  num(x.netAmount)
                ) *
                  10000
              ) / 100
            : 0
      })),

      ...eligibleBills.map((x: any) => ({
        id: `V-${x.id}`,
        type: "Ausgabe",
        date: x.date,
        number: x.number,
        netAmount: num(x.netAmount),
        taxAmount: num(x.taxAmount),
        grossAmount: num(x.grossAmount),

        taxRate:
          num(x.netAmount) > 0
            ? Math.round(
                (
                  num(x.taxAmount) /
                  num(x.netAmount)
                ) *
                  10000
              ) / 100
            : 0
      }))
    ];

    // Diagnostic flags only: a zero-rated document must not automatically be
    // assumed to be §13b. The tax code must be confirmed from source evidence.
    const taxReview = rows.filter((row:any) =>
      Math.abs(row.netAmount)>0.009 && Math.abs(row.taxAmount)<0.009
    ).map((row:any)=>({
      id:row.id,number:row.number,type:row.type,
      reason:"NULLSTEUER_PRUEFEN",
      note:"0 % / 0 EUR Steuer: §13b, Steuerbefreiung oder abweichende Steuerbehandlung anhand des Originalbelegs prüfen."
    }));
    const umsatzsteuer = eligibleInvoices.reduce(
      (s, x) => s + num(x.taxAmount),
      0
    );

    const vorsteuer = eligibleBills.reduce(
      (s, x) => s + num(x.taxAmount),
      0
    );

    res.json({
      ok: true,
      rows,
      excluded: {
        invoices: invoices.length-eligibleInvoices.length,
        vendorBills: bills.length-eligibleBills.length
      },
      preliminary: true,
      taxReview,
      taxReviewCount: taxReview.length,
      umsatzsteuer,
      vorsteuer,
      zahllast:
        umsatzsteuer - vorsteuer
    });
  } catch (e) {
    errorResponse(res, e);
  }
});

/* =========================================================
   DATEV
========================================================= */

router.get("/tax-account-mappings",async(req:any,res)=>{
 try{
  if(!["ADMIN","ADMINISTRATOR","BUCHHALTUNG"].includes(accountingRole(req)))return res.status(403).json({ok:false,error:"TAX_MAPPING_READ_FORBIDDEN"});
  const {accounting}=await context(req);
  const items=await prisma.taxAccountMapping.findMany({where:{accountingId:accounting.id},orderBy:{account:"asc"}});
  res.json({ok:true,items});
 }catch(e){errorResponse(res,e);}
});
router.get("/tax-account-mappings/:account/history",async(req:any,res)=>{
 try{
  if(!["ADMIN","ADMINISTRATOR","BUCHHALTUNG"].includes(accountingRole(req)))return res.status(403).json({ok:false,error:"TAX_MAPPING_HISTORY_FORBIDDEN"});
  const {accounting,project}=await context(req);
  const account=String(req.params.account||"").trim();
  if(!/^\d{3,8}$/.test(account))return res.status(400).json({ok:false,error:"TAX_MAPPING_ACCOUNT_INVALID"});
  const items=await prisma.auditLog.findMany({where:{companyId:project.companyId,action:"TAX_ACCOUNT_MAPPING_SAVE",resource:"tax-account:"+accounting.id+":"+account},orderBy:{createdAt:"desc"},take:50,select:{id:true,createdAt:true,userId:true,meta:true}});
  res.json({ok:true,items});
 }catch(e){errorResponse(res,e);}
});

router.put("/tax-account-mappings/:account",async(req:any,res)=>{
 try{
  const {accounting,project}=await context(req);
  const account=String(req.params.account||"").trim();
  const chart=String(req.body?.chart||"").trim().toUpperCase();
  const category=String(req.body?.category||"").trim().toUpperCase();
  const taxCode=String(req.body?.taxCode||"").trim().toUpperCase();
  const actor=String(req.auth?.sub||req.auth?.userId||"").trim();
  if(!/^\d{3,8}$/.test(account)||!["SKR03","SKR04","CUSTOM"].includes(chart)||!["REVENUE","EXPENSE","INPUT_TAX","OUTPUT_TAX","OTHER","BANK","RECEIVABLE","PAYABLE"].includes(category)||taxCode||!actor)throw Error("TAX_MAPPING_INVALID");
  const valid=await prisma.ledgerEntry.findFirst({where:{accountingId:accounting.id,OR:[{account},{contraAccount:account}]}});
  if(!valid)throw Error("TAX_MAPPING_ACCOUNT_NOT_USED");
  const item=await prisma.$transaction(async tx=>{
   const before=await tx.taxAccountMapping.findUnique({where:{accountingId_account:{accountingId:accounting.id,account}}});
   const row=await tx.taxAccountMapping.upsert({where:{accountingId_account:{accountingId:accounting.id,account}},create:{accountingId:accounting.id,account,chart,category,taxCode:taxCode||null,verifiedBy:actor},update:{chart,category,taxCode:taxCode||null,verifiedBy:actor,verifiedAt:new Date()}});
   await tx.auditLog.create({data:{companyId:project.companyId,userId:actor,action:"TAX_ACCOUNT_MAPPING_SAVE",resource:"tax-account:"+accounting.id+":"+account,meta:{before,after:row}}});
   return row;
  });
  res.json({ok:true,item});
 }catch(e){errorResponse(res,e);}
});

router.get("/datev", async (req: any, res) => {
  try {
    const role = accountingRole(req);
    if (!["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG"].includes(role)) {
      return res.status(403).json({ ok: false, error: "ACCOUNTING_DATEV_FORBIDDEN" });
    }

    const { project, accounting } = await context(req);

    const items = await prisma.ledgerEntry.findMany({
      where: {
        accountingId: accounting.id
      },
      orderBy: {
        date: "asc"
      }
    });

    res.json({
      ok: true,

      project: {
        id: project.id,
        code: project.code,
        name: project.name
      },

      items: items.map(x => ({
        id: x.id,
        date: x.date,
        account: x.account,
        contraAccount: x.contraAccount,
        amount: Number(x.amount),
        text: x.text || "",
        refType: x.refType,
        refId: x.refId
      }))
    });
  } catch (e) {
    errorResponse(res, e);
  }
});



/* ACCOUNTING DMS BRIDGE */

router.get("/dms/resolve", async (req: any, res) => {
  try {
    const companyId = String(req.auth?.companyId || "").trim();
    const sourceType = String(req.query?.sourceType || "").trim().toUpperCase();
    const sourceId = String(req.query?.sourceId || "").trim();

    if (!companyId || !sourceType || !sourceId) {
      return res.status(400).json({
        ok: false,
        error: "sourceType/sourceId fehlen"
      });
    }

    if (sourceType === "INVOICE") {
      const row = await prisma.invoice.findFirst({
        where: {
          id: sourceId,
          accounting: {
            project: { companyId }
          }
        },
        select: {
          id: true,
          pdfDocId: true,
          accounting: {
            select: {
              projectId: true
            }
          },
          pdfDoc: {
            select: {
              id: true,
              name: true,
              projectId: true
            }
          }
        }
      });

      return res.json({
        ok: true,
        projectId:
          row?.accounting?.projectId ||
          row?.pdfDoc?.projectId ||
          null,
        documentId: row?.pdfDocId || null,
        document: row?.pdfDoc || null
      });
    }

    if (sourceType === "VENDOR_BILL") {
      const row = await prisma.vendorBill.findFirst({
        where: {
          id: sourceId,
          accounting: {
            project: { companyId }
          }
        },
        select: {
          id: true,
          pdfDocId: true,
          accounting: {
            select: {
              projectId: true
            }
          },
          pdfDoc: {
            select: {
              id: true,
              name: true,
              projectId: true
            }
          }
        }
      });

      return res.json({
        ok: true,
        projectId:
          row?.accounting?.projectId ||
          row?.pdfDoc?.projectId ||
          null,
        documentId: row?.pdfDocId || null,
        document: row?.pdfDoc || null
      });
    }

    return res.json({
      ok: true,
      documentId: null,
      document: null
    });
  } catch (error: any) {
    console.error("[accounting:dms:resolve]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "DMS-Verknüpfung konnte nicht geladen werden"
    });
  }
});


router.patch("/dms/link", async (req: any, res) => {
  try {
    const companyId = String(req.auth?.companyId || "").trim();
    const sourceType = String(req.body?.sourceType || "").trim().toUpperCase();
    const sourceId = String(req.body?.sourceId || "").trim();
    const documentId = String(req.body?.documentId || "").trim();

    if (!companyId || !sourceType || !sourceId || !documentId) {
      return res.status(400).json({
        ok: false,
        error: "sourceType/sourceId/documentId fehlen"
      });
    }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        project: { companyId },
        deletedAt: null
      },
      select: {
        id: true,
        projectId: true,
        name: true
      }
    });

    if (!document) {
      return res.status(404).json({
        ok: false,
        error: "DMS-Dokument nicht gefunden"
      });
    }

    if (sourceType === "INVOICE") {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: sourceId,
          accounting: {
            project: {
              companyId,
              id: document.projectId
            }
          }
        },
        select: { id: true }
      });

      if (!invoice) {
        return res.status(404).json({
          ok: false,
          error: "Rechnung nicht gefunden"
        });
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfDocId: document.id }
      });

      return res.json({
        ok: true,
        documentId: document.id
      });
    }

    if (sourceType === "VENDOR_BILL") {
      const bill = await prisma.vendorBill.findFirst({
        where: {
          id: sourceId,
          accounting: {
            project: {
              companyId,
              id: document.projectId
            }
          }
        },
        select: { id: true }
      });

      if (!bill) {
        return res.status(404).json({
          ok: false,
          error: "Eingangsrechnung nicht gefunden"
        });
      }

      await prisma.vendorBill.update({
        where: { id: bill.id },
        data: { pdfDocId: document.id }
      });

      return res.json({
        ok: true,
        documentId: document.id
      });
    }

    return res.status(400).json({
      ok: false,
      error: "sourceType nicht unterstützt"
    });
  } catch (error: any) {
    console.error("[accounting:dms:link]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "DMS-Verknüpfung fehlgeschlagen"
    });
  }
});

export default router;
