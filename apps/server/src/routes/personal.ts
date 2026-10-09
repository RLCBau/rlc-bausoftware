import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { storage } from "../storage/storageService";
import { bucket, presignGet } from "../lib/s3";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { rejectActiveContentUpload, signatureCheckedMemoryStorage } from "../lib/uploadSecurity";

import {certificateName,certificateDate,certificateExpiry} from "../domain/personnelCertificate";
import {InputError} from "../domain/officeAddons";
const router = Router();

const employeeUpload = multer({
  storage: signatureCheckedMemoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: rejectActiveContentUpload
});



function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

type PersonalRetention = {
  category: string; legalBasis: string; retentionUntil: string | null; legalHold: boolean; classifiedAt?: string | null; classifiedBy?: string | null;
};
function personalRetentionFile(cid:string){ const d=path.join(COMPANIES_ROOT,cid,"personal-retention"); fs.mkdirSync(d,{recursive:true}); return path.join(d,"retention.json"); }
function readPersonalRetention(cid:string):Record<string,PersonalRetention>{ try{const f=personalRetentionFile(cid);if(!fs.existsSync(f))return {};const v=JSON.parse(fs.readFileSync(f,"utf8"));return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return {};} }
function writePersonalRetention(cid:string,data:Record<string,PersonalRetention>){ const f=personalRetentionFile(cid);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(data,null,2),"utf8");fs.renameSync(t,f); }
function retentionKey(kind:"DOC"|"CERT",id:string){return `${kind}:${id}`;}
function normalizedRetention(input:any, req:any):PersonalRetention{ const category=String(input?.category||"UNCLASSIFIED").trim().toUpperCase(); const legalBasis=String(input?.legalBasis||"").trim(); const raw=String(input?.retentionUntil||"").trim(); const d=raw?new Date(raw):null; return {category,legalBasis,retentionUntil:d&&!Number.isNaN(d.getTime())?d.toISOString():null,legalHold:input?.legalHold===true,classifiedAt:category!=="UNCLASSIFIED"?new Date().toISOString():null,classifiedBy:category!=="UNCLASSIFIED"?(String(req?.auth?.email||req?.auth?.sub||"").trim()||null):null}; }
function deletionReview(meta:PersonalRetention|undefined){ if(!meta||!meta.category||meta.category==="UNCLASSIFIED") return {allowed:false,error:"PERSONAL_RETENTION_CLASSIFICATION_REQUIRED",message:"Vor dem Löschen muss die Unterlage im Löschkonzept klassifiziert werden."}; if(meta.legalHold) return {allowed:false,error:"PERSONAL_LEGAL_HOLD",message:"Die Unterlage steht unter Legal Hold und darf nicht gelöscht werden."}; if(!meta.legalBasis) return {allowed:false,error:"PERSONAL_RETENTION_LEGAL_BASIS_REQUIRED",message:"Rechtsgrundlage/Löschbegründung fehlt."}; if(meta.category==="NO_RETENTION_REQUIRED") return {allowed:true}; if(!meta.retentionUntil) return {allowed:false,error:"PERSONAL_RETENTION_UNTIL_REQUIRED",message:"Aufbewahrungs-/Löschdatum fehlt."}; if(new Date(meta.retentionUntil).getTime()>Date.now()) return {allowed:false,error:"PERSONAL_RETENTION_ACTIVE",message:"Die Aufbewahrungsfrist ist noch aktiv.",retentionUntil:meta.retentionUntil}; return {allowed:true}; }

function roleOf(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || req?.user?.role || "")
    .trim()
    .toUpperCase();
}

function allowRoles(...roles: string[]) {
  const allowed = new Set(roles.map((role) => role.toUpperCase()));
  return (req: any, res: any, next: any) => {
    if (process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on") return next();
    const role = roleOf(req);
    if (!allowed.has(role)) {
      return res.status(403).json({ ok: false, error: "PERSONAL_DATA_FORBIDDEN" });
    }
    return next();
  };
}

const requirePersonnelAccess = allowRoles("ADMIN", "ADMINISTRATOR", "BAULEITER");
const requirePersonnelCostAccess = allowRoles("ADMIN", "ADMINISTRATOR", "BAULEITER", "BUCHHALTUNG");


router.get("/qualifications", requirePersonnelAccess, async(req:any,res)=>{
 try{
  const cid=companyId(req);if(!cid)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const employees=await prisma.companyEmployee.findMany({where:{companyId:cid,active:true},select:{id:true,name:true,projects:true},orderBy:{name:"asc"}});
  const records=await prisma.companyEmployeeCertificate.findMany({where:{employee:{companyId:cid,active:true}},include:{employee:{select:{name:true,projects:true}}},orderBy:[{validUntil:"asc"},{name:"asc"}]});
  res.json({ok:true,employees,items:records.map(row=>({...row,expiry:certificateExpiry(row.validUntil)}))});
 }catch(e){console.error("[qualifications]",(e as any)?.code||(e as any)?.name);res.status(500).json({ok:false,error:"Nachweise konnten nicht geladen werden."});}
});
router.get("/qualifications/:certificateId/history",requirePersonnelAccess,async(req:any,res)=>{
 try{
  const row=await prisma.companyEmployeeCertificate.findFirst({where:{id:req.params.certificateId,employee:{companyId:companyId(req),active:true}}});
  if(!row)return res.status(404).json({ok:false,error:"CERTIFICATE_NOT_FOUND"});
  const items=await prisma.auditLog.findMany({where:{companyId:companyId(req),resource:"personnel-certificate:"+row.id},select:{id:true,action:true,createdAt:true,userId:true,meta:true},orderBy:{createdAt:"desc"},take:100});
  res.json({ok:true,items});
 }catch{res.status(500).json({ok:false,error:"Verlauf konnte nicht geladen werden."});}
});

router.get("/directory", async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });
    const items = await prisma.companyEmployee.findMany({
      where: { companyId: cid, active: true },
      select: {
        id: true,
        name: true,
        role: true,
        projects: true,
        costCenter: true,
        employmentType: true,
        active: true,
      },
      orderBy: { name: "asc" },
    });
    return res.json({ ok: true, items });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "PERSONAL_DIRECTORY_FAILED" });
  }
});

function cleanProjects(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((v) => String(v || "").trim()).filter(Boolean))
  );
}


router.get("/labor-costs", requirePersonnelCostAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) {
      return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });
    }

    const projectToken = String(req.query.projectId || "").trim();
    if (!projectToken) {
      return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
    }

    const role = roleOf(req);
    const userId = String(req?.auth?.sub || req?.auth?.userId || "").trim();
    const privileged = ["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG"].includes(role);
    const project = await prisma.project.findFirst({
      where: {
        companyId: cid,
        OR: [{ id: projectToken }, { code: projectToken }],
        ...(privileged ? {} : { projectMembers: { some: { userId } } }),
      },
      select: { id: true },
    });
    if (!project) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const projectId = project.id;

    const employees = await prisma.companyEmployee.findMany({
      where: {
        companyId: cid,
        active: true
      }
    });

    const employeeByName = new Map(
      employees.map((employee: any) => [
        String(employee.name || "").trim().toLocaleLowerCase("de-DE"),
        employee
      ])
    );

    const dataRoot =
      process.env.RLC_DATA_DIR ||
      process.env.DATA_DIR ||
      "/app/data";

    const file = path.join(
      dataRoot,
      "projects",
      projectId,
      "arbeitszeiten",
      "arbeitszeiten.json"
    );

    let rows: any[] = [];

    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));

      rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.items)
          ? parsed.items
          : Array.isArray(parsed?.rows)
            ? parsed.rows
            : [];
    }

    const items = rows.map((row: any) => {
      const employeeName = String(
        row.employeeName ||
        row.mitarbeiterName ||
        row.mitarbeiter ||
        row.employee ||
        row.submittedBy?.employeeName ||
        row.submittedBy?.displayName ||
        row.submittedBy?.userName ||
        ""
      ).trim();

      const employee: any =
        employeeByName.get(employeeName.toLocaleLowerCase("de-DE")) || null;

      const hours = Number(row.hours ?? row.netHours ?? 0);
      const hourlyRate = Number(employee?.hourlyRate || 0);

      const costCenter = String(
        row.kostenstelle ||
        row.costCenter ||
        employee?.costCenter ||
        ""
      ).trim();

      const personnelCost = hours * hourlyRate;

      return {
        id: String(row.id || row.docId || ""),
        date: row.date || row.datum || null,
        employeeId: employee?.id || null,
        employeeName,
        hours,
        hourlyRate,
        costCenter,
        personnelCost
      };
    });

    const byCostCenter: Record<string, number> = {};

    for (const item of items) {
      const key = item.costCenter || "OHNE_KOSTENSTELLE";
      byCostCenter[key] =
        (byCostCenter[key] || 0) + Number(item.personnelCost || 0);
    }

    const totalHours = items.reduce(
      (sum, item) => sum + Number(item.hours || 0),
      0
    );

    const totalPersonnelCost = items.reduce(
      (sum, item) => sum + Number(item.personnelCost || 0),
      0
    );

    return res.json({
      ok: true,
      projectId,
      totalHours,
      totalPersonnelCost,
      byCostCenter,
      items
    });
  } catch (e: any) {
    console.error("GET /api/personal/labor-costs failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "LABOR_COSTS_FAILED"
    });
  }
});

router.get("/", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });

    const items = await prisma.companyEmployee.findMany({
      where: { companyId: cid, active: true },
      include: {
        certificates: {
          orderBy: { validUntil: "asc" }
        },
        documents: {
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { name: "asc" }
    });

    const retention = readPersonalRetention(cid);
    return res.json({
      ok: true,
      items: items.map((e: any) => ({
        ...e,
        hourlyRate: e.hourlyRate != null ? Number(e.hourlyRate) : 0,
        certificates: (e.certificates || []).map((x:any) => ({...x, retention: retention[retentionKey("CERT", x.id)] || {category:"UNCLASSIFIED",legalBasis:"",retentionUntil:null,legalHold:false}})),
        documents: (e.documents || []).map((x:any) => ({...x, retention: retention[retentionKey("DOC", x.id)] || {category:"UNCLASSIFIED",legalBasis:"",retentionUntil:null,legalHold:false}}))
      }))
    });
  } catch (e: any) {
    console.error("GET /api/personal failed", e);
    return res.status(500).json({ ok: false, error: e?.message || "PERSONAL_LIST_FAILED" });
  }
});

router.post("/", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });

    const body = req.body || {};
    const name = String(body.name || "").trim();

    if (!name) {
      return res.status(400).json({ ok: false, error: "NAME_REQUIRED" });
    }

    const item = await prisma.companyEmployee.create({
      data: {
        companyId: cid,
        name,
        role: body.role ? String(body.role) : null,
        email: body.email ? String(body.email) : null,
        phone: body.phone ? String(body.phone) : null,
        hourlyRate: Number(body.hourlyRate || 0),
        costCenter: body.costCenter ? String(body.costCenter) : null,
        projects: cleanProjects(body.projects),
        employmentType: body.employmentType ? String(body.employmentType) : null,
        contractStart: body.contractStart ? new Date(body.contractStart) : null,
        contractEnd: body.contractEnd ? new Date(body.contractEnd) : null,
        vacationTotal: Number(body.vacationTotal ?? 25),
        vacationTaken: Number(body.vacationTaken ?? 0)
      }
    });

    return res.json({
      ok: true,
      item: { ...item, hourlyRate: Number(item.hourlyRate || 0) }
    });
  } catch (e: any) {
    console.error("POST /api/personal failed", e);
    return res.status(500).json({ ok: false, error: e?.message || "PERSONAL_CREATE_FAILED" });
  }
});

router.put("/:id", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });

    const id = String(req.params.id || "");
    const body = req.body || {};

    const existing = await prisma.companyEmployee.findFirst({
      where: { id, companyId: cid }
    });

    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const item = await prisma.companyEmployee.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        role: body.role !== undefined ? String(body.role || "") || null : undefined,
        email: body.email !== undefined ? String(body.email || "") || null : undefined,
        phone: body.phone !== undefined ? String(body.phone || "") || null : undefined,
        hourlyRate: body.hourlyRate !== undefined ? Number(body.hourlyRate || 0) : undefined,
        costCenter: body.costCenter !== undefined ? String(body.costCenter || "") || null : undefined,
        projects: body.projects !== undefined ? cleanProjects(body.projects) : undefined,
        employmentType:
          body.employmentType !== undefined ? String(body.employmentType || "") || null : undefined,
        contractStart:
          body.contractStart !== undefined
            ? body.contractStart ? new Date(body.contractStart) : null
            : undefined,
        contractEnd:
          body.contractEnd !== undefined
            ? body.contractEnd ? new Date(body.contractEnd) : null
            : undefined,
        vacationTotal:
          body.vacationTotal !== undefined ? Number(body.vacationTotal || 0) : undefined,
        vacationTaken:
          body.vacationTaken !== undefined ? Number(body.vacationTaken || 0) : undefined
      }
    });

    return res.json({
      ok: true,
      item: { ...item, hourlyRate: Number(item.hourlyRate || 0) }
    });
  } catch (e: any) {
    console.error("PUT /api/personal/:id failed", e);
    return res.status(500).json({ ok: false, error: e?.message || "PERSONAL_UPDATE_FAILED" });
  }
});


router.post("/:id/certificates", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    const employeeId = String(req.params.id || "");

    const employee = await prisma.companyEmployee.findFirst({
      where: {
        id: employeeId,
        companyId: cid,
        active: true
      }
    });

    if (!employee) {
      return res.status(404).json({
        ok: false,
        error: "EMPLOYEE_NOT_FOUND"
      });
    }

    const name=certificateName(req.body?.name),validUntil=certificateDate(req.body?.validUntil);
    const item=await prisma.$transaction(async tx=>{
      const row=await tx.companyEmployeeCertificate.create({data:{employeeId,name,validUntil}});
      await tx.auditLog.create({data:{companyId:cid,userId:String(req.auth?.sub||req.auth?.userId||""),action:"PERSONNEL_CERTIFICATE_CREATE",resource:"personnel-certificate:"+row.id,meta:{after:JSON.parse(JSON.stringify(row))}}});return row;
    });

    const retention = readPersonalRetention(cid);
    retention[retentionKey("CERT", item.id)] = {category:"UNCLASSIFIED",legalBasis:"",retentionUntil:null,legalHold:false};
    writePersonalRetention(cid, retention);
    return res.json({ ok: true, item: {...item, retention: retention[retentionKey("CERT", item.id)]} });
  } catch (e: any) {
    if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});
    if(e?.message==="CERTIFICATE_CONFLICT")return res.status(409).json({ok:false,error:"Nachweis wurde geändert. Bitte neu laden."});
    console.error("POST personal certificate failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CERTIFICATE_CREATE_FAILED"
    });
  }
});

router.put("/:id/certificates/:certificateId", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    const employeeId = String(req.params.id || "");
    const certificateId = String(req.params.certificateId || "");

    const certificate =
      await prisma.companyEmployeeCertificate.findFirst({
        where: {
          id: certificateId,
          employeeId,
          employee: {
            companyId: cid,
            active: true
          }
        }
      });

    if (!certificate) {
      return res.status(404).json({
        ok: false,
        error: "CERTIFICATE_NOT_FOUND"
      });
    }

    const body=req.body||{};
    const data={name:body.name===undefined?certificate.name:certificateName(body.name),validUntil:body.validUntil===undefined?certificate.validUntil:certificateDate(body.validUntil)};
    const item=await prisma.$transaction(async tx=>{
      await tx.$queryRawUnsafe('SELECT id FROM "CompanyEmployeeCertificate" WHERE id=$1 FOR UPDATE',certificateId);
      const current=await tx.companyEmployeeCertificate.findUnique({where:{id:certificateId}});
      const expected=body.expectedUpdatedAt;
      if(!current||current.updatedAt.getTime()!==certificate.updatedAt.getTime()||(expected!==undefined&&(typeof expected!=="string"||expected!==current.updatedAt.toISOString())))throw new Error("CERTIFICATE_CONFLICT");
      const row=await tx.companyEmployeeCertificate.update({where:{id:certificateId},data:{...data,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});
      await tx.auditLog.create({data:{companyId:cid,userId:String(req.auth?.sub||req.auth?.userId||""),action:"PERSONNEL_CERTIFICATE_UPDATE",resource:"personnel-certificate:"+row.id,meta:{before:JSON.parse(JSON.stringify(current)),after:JSON.parse(JSON.stringify(row))}}});return row;
    });

    return res.json({
      ok: true,
      item
    });
  } catch (e: any) {
    if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});
    if(e?.message==="CERTIFICATE_CONFLICT")return res.status(409).json({ok:false,error:"Nachweis wurde geändert. Bitte neu laden."});
    console.error("PUT personal certificate failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CERTIFICATE_UPDATE_FAILED"
    });
  }
});

router.delete("/:id/certificates/:certificateId", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    const employeeId = String(req.params.id || "");
    const certificateId = String(req.params.certificateId || "");

    const certificate =
      await prisma.companyEmployeeCertificate.findFirst({
        where: {
          id: certificateId,
          employeeId,
          employee: {
            companyId: cid
          }
        }
      });

    if (!certificate) {
      return res.status(404).json({
        ok: false,
        error: "CERTIFICATE_NOT_FOUND"
      });
    }

    const retention = readPersonalRetention(cid);
    const retentionId = retentionKey("CERT", certificateId);
    const review = deletionReview(retention[retentionId]);
    if (!review.allowed) return res.status(409).json({ok:false,...review,retention:retention[retentionId] || null});
    await prisma.companyEmployeeCertificate.delete({ where: { id: certificateId } });
    delete retention[retentionId];
    writePersonalRetention(cid, retention);

    return res.json({
      ok: true
    });
  } catch (e: any) {
    console.error("DELETE personal certificate failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CERTIFICATE_DELETE_FAILED"
    });
  }
});

router.post(
  "/:id/documents",
  requirePersonnelAccess,
  employeeUpload.single("file"),
  async (req: any, res) => {
    try {
      const cid = companyId(req);
      const employeeId = String(req.params.id || "");
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "FILE_REQUIRED"
        });
      }

      const employee = await prisma.companyEmployee.findFirst({
        where: {
          id: employeeId,
          companyId: cid,
          active: true
        }
      });

      if (!employee) {
        return res.status(404).json({
          ok: false,
          error: "EMPLOYEE_NOT_FOUND"
        });
      }

      const filename =
        String(file.originalname || "document.bin")
          .replace(/[^\w.\-]+/g, "_");

      const storageId = crypto.randomUUID();

      const key =
        `companies/${cid}/employees/${employeeId}/${storageId}/${filename}`;

      await storage.put({
        key,
        body: file.buffer,
        contentType:
          file.mimetype ||
          "application/octet-stream"
      });

      const item = await prisma.$transaction(async (tx) => {
        await tx.storageObject.create({
          data: {
            id: storageId,
            bucket,
            key,
            size: BigInt(file.size),
            sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
            mime:
              file.mimetype ||
              "application/octet-stream"
          }
        });

        return tx.companyEmployeeDocument.create({
          data: {
            employeeId,
            storageId,
            name: file.originalname || filename,
            mime:
              file.mimetype ||
              "application/octet-stream",
            size: file.size
          }
        });
      });

      const retention = readPersonalRetention(cid);
      retention[retentionKey("DOC", item.id)] = {category:"UNCLASSIFIED",legalBasis:"",retentionUntil:null,legalHold:false};
      writePersonalRetention(cid, retention);
      return res.json({ ok: true, item: {...item, retention: retention[retentionKey("DOC", item.id)]} });
    } catch (e: any) {
      console.error("POST personal document failed", e);

      return res.status(500).json({
        ok: false,
        error: e?.message || "DOCUMENT_UPLOAD_FAILED"
      });
    }
  }
);

router.get("/:id/documents/:documentId/download", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    const employeeId = String(req.params.id || "");
    const documentId = String(req.params.documentId || "");

    const item = await prisma.companyEmployeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId,
        employee: {
          companyId: cid,
          active: true
        }
      },
      include: {
        storage: true
      }
    });

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "DOCUMENT_NOT_FOUND"
      });
    }

    const downloadUrl =
      await presignGet(item.storage.key);

    return res.json({
      ok: true,
      downloadUrl,
      name: item.name
    });
  } catch (e: any) {
    console.error("GET personal document failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "DOCUMENT_DOWNLOAD_FAILED"
    });
  }
});

router.delete("/:id/documents/:documentId", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    const employeeId = String(req.params.id || "");
    const documentId = String(req.params.documentId || "");

    const item = await prisma.companyEmployeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId,
        employee: {
          companyId: cid
        }
      }
    });

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "DOCUMENT_NOT_FOUND"
      });
    }

    const retention = readPersonalRetention(cid);
    const retentionId = retentionKey("DOC", documentId);
    const review = deletionReview(retention[retentionId]);
    if (!review.allowed) return res.status(409).json({ok:false,...review,retention:retention[retentionId] || null});
    await prisma.companyEmployeeDocument.delete({ where: { id: documentId } });
    delete retention[retentionId];
    writePersonalRetention(cid, retention);

    return res.json({
      ok: true
    });
  } catch (e: any) {
    console.error("DELETE personal document failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "DOCUMENT_DELETE_FAILED"
    });
  }
});

router.put("/:id/certificates/:certificateId/retention", requirePersonnelAccess, async (req:any,res)=>{
  try {
    const cid=companyId(req); const employeeId=String(req.params.id||""); const certificateId=String(req.params.certificateId||"");
    const exists=await prisma.companyEmployeeCertificate.findFirst({where:{id:certificateId,employeeId,employee:{companyId:cid}}});
    if(!exists) return res.status(404).json({ok:false,error:"CERTIFICATE_NOT_FOUND"});
    const all=readPersonalRetention(cid); const meta=normalizedRetention(req.body,req);
    all[retentionKey("CERT",certificateId)]=meta; writePersonalRetention(cid,all);
    return res.json({ok:true,retention:meta,deletionReview:deletionReview(meta)});
  } catch(e:any) { return res.status(500).json({ok:false,error:e?.message||"RETENTION_SAVE_FAILED"}); }
});

router.put("/:id/documents/:documentId/retention", requirePersonnelAccess, async (req:any,res)=>{
  try {
    const cid=companyId(req); const employeeId=String(req.params.id||""); const documentId=String(req.params.documentId||"");
    const exists=await prisma.companyEmployeeDocument.findFirst({where:{id:documentId,employeeId,employee:{companyId:cid}}});
    if(!exists) return res.status(404).json({ok:false,error:"DOCUMENT_NOT_FOUND"});
    const all=readPersonalRetention(cid); const meta=normalizedRetention(req.body,req);
    all[retentionKey("DOC",documentId)]=meta; writePersonalRetention(cid,all);
    return res.json({ok:true,retention:meta,deletionReview:deletionReview(meta)});
  } catch(e:any) { return res.status(500).json({ok:false,error:e?.message||"RETENTION_SAVE_FAILED"}); }
});

router.delete("/:id", requirePersonnelAccess, async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });

    const id = String(req.params.id || "");

    const existing = await prisma.companyEmployee.findFirst({
      where: { id, companyId: cid }
    });

    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    await prisma.companyEmployee.update({
      where: { id },
      data: { active: false }
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/personal/:id failed", e);
    return res.status(500).json({ ok: false, error: e?.message || "PERSONAL_DELETE_FAILED" });
  }
});

export default router;
