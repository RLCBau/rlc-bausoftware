import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { storage } from "../storage/storageService";
import { bucket, presignGet } from "../lib/s3";
import { createHandoverPdf } from "../services/pdf/handoverPdf";
import { rejectActiveContentUpload, signatureCheckedMemoryStorage } from "../lib/uploadSecurity";
import {
  archiveProjectFileVersion,
  registerExistingStorageVersion,
  archiveProjectBufferVersion
} from "../services/dmsArchive";

const router = Router();

router.use((req: any, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  return requireHandoverWriteRole(req, res, next);
});

const upload = multer({
  storage: signatureCheckedMemoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: rejectActiveContentUpload
});

async function requireHandoverAccessBeforeUpload(req: any, res: any, next: any) {
  const cid = cidOr403(req, res);
  if (!cid) return;
  const handoverId = String(req.params?.id || "").trim();
  if (!handoverId) return res.status(400).json({ ok: false, error: "HANDOVER_REQUIRED" });

  const handover = await prisma.companyHandover.findFirst({
    where: { id: handoverId, companyId: cid },
    select: { id: true, projectId: true, status: true },
  });
  if (!handover) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if (!(await canAccessHandoverProject(req, cid, handover.projectId))) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }

  const metaAll = readHandoverMeta(cid);
  if (handoverLocked(handover.status, metaAll[handover.id])) {
    return res.status(409).json({ ok: false, error: "HANDOVER_LOCKED" });
  }

  (req as any).resolvedHandover = handover;
  return next();
}

function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function handoverUserId(req: any) {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function handoverRole(req: any) {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

function handoverAdmin(req: any) {
  const role = handoverRole(req);
  return role === "ADMIN" || role === "ADMINISTRATOR";
}

function requireHandoverWriteRole(req: any, res: any, next: any) {
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER"].includes(handoverRole(req))) {
    return res.status(403).json({ ok: false, error: "HANDOVER_WRITE_FORBIDDEN" });
  }
  return next();
}

async function canAccessHandoverProject(req: any, cid: string, projectId: string | null | undefined) {
  if (handoverAdmin(req)) return true;
  const uid = handoverUserId(req);
  if (!uid || !projectId) return false;
  const project = await prisma.project.findFirst({
    where: {
      id: String(projectId),
      companyId: cid,
      projectMembers: { some: { userId: uid } },
    },
    select: { id: true },
  });
  return Boolean(project);
}


function cidOr403(req: any, res: any): string | null {
  const cid = companyId(req);

  if (!cid) {
    res.status(403).json({
      ok: false,
      error: "COMPANY_REQUIRED"
    });
    return null;
  }

  return cid;
}

type HandoverLegalMeta = {
  contractBasis?: "BGB" | "VOBB" | "OTHER";
  acceptanceType?: "EXPRESS" | "FORMAL" | "FICTITIOUS_BGB" | "FICTITIOUS_VOB_COMPLETION" | "FICTITIOUS_VOB_USE" | "REFUSED" | "CONDITION_ASSESSMENT" | "PARTIAL";
  completionNoticeDate?: string; acceptanceRequestDate?: string; acceptanceDeadline?: string; useStartDate?: string;
  consumer?: boolean; bgbConsequenceNoticeTextForm?: boolean; refusalReason?: string;
  knownDefectsReserved?: boolean; defectRightsReservedText?: string; contractualPenaltyReserved?: boolean;
  contractorObjections?: string; expertName?: string; copyDeliveredToBoth?: boolean;
  conditionAssessmentJoint?: boolean; conditionAssessmentDate?: string; unilateralConditionAssessmentReason?: string;
  partialAcceptanceScope?: string; legalNote?: string; evidenceLock?: any;
};
function handoverMetaFile(cid:string){const d=path.join(COMPANIES_ROOT,cid,"handover-legal");fs.mkdirSync(d,{recursive:true});return path.join(d,"records.json");}
function readHandoverMeta(cid:string):Record<string,HandoverLegalMeta>{try{const f=handoverMetaFile(cid);if(!fs.existsSync(f))return {};const v=JSON.parse(fs.readFileSync(f,"utf8"));return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return {};}}
function writeHandoverMeta(cid:string,data:Record<string,HandoverLegalMeta>){const f=handoverMetaFile(cid);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(data,null,2),"utf8");fs.renameSync(t,f);}
function handoverLocked(status:any,meta?:HandoverLegalMeta){return String(status||"").toUpperCase()==="ABGESCHLOSSEN"||Boolean(meta?.evidenceLock);}
function validateHandoverLegal(meta:HandoverLegalMeta){const errors:string[]=[];const warnings:string[]=[];const basis=String(meta.contractBasis||"").toUpperCase();const type=String(meta.acceptanceType||"").toUpperCase();if(!basis)errors.push("Vertragsgrundlage fehlt (BGB/VOB/B/sonstige).");if(!type)errors.push("Art der Abnahme fehlt.");if(type==="FICTITIOUS_BGB"){if(!meta.acceptanceRequestDate)errors.push("BGB §640: Aufforderung zur Abnahme fehlt.");if(!meta.acceptanceDeadline)errors.push("BGB §640: gesetzte angemessene Frist fehlt.");if(meta.consumer===true&&meta.bgbConsequenceNoticeTextForm!==true)errors.push("BGB §640: Verbraucherhinweis auf die Folgen in Textform fehlt.");}if(type==="REFUSED"&&!String(meta.refusalReason||"").trim())errors.push("Grund der Abnahmeverweigerung/Mangelangabe fehlt.");if(basis==="VOBB"){warnings.push("VOB/B nur anwenden, wenn wirksam Vertragsbestandteil.");if(type==="FORMAL"&&meta.copyDeliveredToBoth!==true)errors.push("VOB/B §12: Ausfertigung der Niederschrift für beide Parteien ist nicht bestätigt.");if(type==="FICTITIOUS_VOB_COMPLETION"&&!meta.completionNoticeDate)errors.push("VOB/B §12: schriftliche Fertigstellungsmitteilung fehlt.");if(type==="FICTITIOUS_VOB_USE"&&!meta.useStartDate)errors.push("VOB/B §12: Beginn der Benutzung fehlt.");}if(type==="CONDITION_ASSESSMENT"){if(!meta.conditionAssessmentDate)errors.push("BGB §650g: Datum der Zustandsfeststellung fehlt.");if(meta.conditionAssessmentJoint!==true&&!String(meta.unilateralConditionAssessmentReason||"").trim())errors.push("BGB §650g: Grund für einseitige Zustandsfeststellung fehlt.");}if(type==="PARTIAL"&&!String(meta.partialAcceptanceScope||"").trim())errors.push("Umfang der Teilabnahme fehlt.");return {valid:errors.length===0,errors,warnings};}
function cleanMeta(b:any,prev:HandoverLegalMeta={}):HandoverLegalMeta{return {...prev,contractBasis:b.contractBasis??prev.contractBasis,acceptanceType:b.acceptanceType??prev.acceptanceType,completionNoticeDate:b.completionNoticeDate??prev.completionNoticeDate,acceptanceRequestDate:b.acceptanceRequestDate??prev.acceptanceRequestDate,acceptanceDeadline:b.acceptanceDeadline??prev.acceptanceDeadline,useStartDate:b.useStartDate??prev.useStartDate,consumer:b.consumer??prev.consumer,bgbConsequenceNoticeTextForm:b.bgbConsequenceNoticeTextForm??prev.bgbConsequenceNoticeTextForm,refusalReason:b.refusalReason??prev.refusalReason,knownDefectsReserved:b.knownDefectsReserved??prev.knownDefectsReserved,defectRightsReservedText:b.defectRightsReservedText??prev.defectRightsReservedText,contractualPenaltyReserved:b.contractualPenaltyReserved??prev.contractualPenaltyReserved,contractorObjections:b.contractorObjections??prev.contractorObjections,expertName:b.expertName??prev.expertName,copyDeliveredToBoth:b.copyDeliveredToBoth??prev.copyDeliveredToBoth,conditionAssessmentJoint:b.conditionAssessmentJoint??prev.conditionAssessmentJoint,conditionAssessmentDate:b.conditionAssessmentDate??prev.conditionAssessmentDate,unilateralConditionAssessmentReason:b.unilateralConditionAssessmentReason??prev.unilateralConditionAssessmentReason,partialAcceptanceScope:b.partialAcceptanceScope??prev.partialAcceptanceScope,legalNote:b.legalNote??prev.legalNote,evidenceLock:prev.evidenceLock};}

router.get("/", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const uid = handoverUserId(req);
  if (!uid) return res.status(403).json({ ok: false, error: "USER_REQUIRED" });
  const accessibleProjectIds = handoverAdmin(req)
    ? null
    : (await prisma.project.findMany({
        where: { companyId: cid, projectMembers: { some: { userId: uid } } },
        select: { id: true },
      })).map((x) => x.id);

  const items = await prisma.companyHandover.findMany({
    where: {
      companyId: cid,
      ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" }
      },
      signatures: true,
      attachments: {
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  const meta=readHandoverMeta(cid);
  return res.json({ ok: true, items: items.map((x:any)=>({...x,legalMeta:meta[x.id]||{}})) });
});

router.post("/", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const b = req.body || {};
  const requestedProjectId = String(b.projectId || "").trim() || null;
  if (!handoverAdmin(req) && !requestedProjectId) {
    return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
  }
  if (requestedProjectId && !(await canAccessHandoverProject(req, cid, requestedProjectId))) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }

  const item = await prisma.companyHandover.create({
    data: {
      companyId: cid,
      title: String(b.title || "Abnahme"),
      projectId: requestedProjectId,
      client: String(b.client || "") || null,
      address: String(b.address || "") || null,
      date: b.date ? new Date(b.date) : new Date(),
      status: String(b.status || "ENTWURF"),
      notes: String(b.notes || "") || null
    }
  });

  if (b.legalMeta) { const meta=readHandoverMeta(cid); meta[item.id]=cleanMeta(b.legalMeta,{}); writeHandoverMeta(cid,meta); }
  return res.json({ ok: true, item });
});

router.put("/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id || "");
  const b = req.body || {};

  const existing = await prisma.companyHandover.findFirst({
    where: { id, companyId: cid }
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }
  if (!(await canAccessHandoverProject(req, cid, existing.projectId))) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }
  if (b.projectId !== undefined) {
    const targetProjectId = String(b.projectId || "").trim() || null;
    if (!handoverAdmin(req) && !targetProjectId) {
      return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
    }
    if (targetProjectId && !(await canAccessHandoverProject(req, cid, targetProjectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
  }
  const metaAll=readHandoverMeta(cid);
  if(handoverLocked(existing.status,metaAll[id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED",message:"Abgeschlossene Abnahmen dürfen nicht verändert werden."});

  const item = await prisma.companyHandover.update({
    where: { id },
    data: {
      title:
        b.title !== undefined
          ? String(b.title || "")
          : undefined,
      projectId:
        b.projectId !== undefined
          ? String(b.projectId || "") || null
          : undefined,
      client:
        b.client !== undefined
          ? String(b.client || "") || null
          : undefined,
      address:
        b.address !== undefined
          ? String(b.address || "") || null
          : undefined,
      date:
        b.date !== undefined
          ? b.date
            ? new Date(b.date)
            : null
          : undefined,
      status:
        b.status !== undefined
          ? String(b.status || "ENTWURF")
          : undefined,
      notes:
        b.notes !== undefined
          ? String(b.notes || "") || null
          : undefined
    }
  });

  if (b.legalMeta) { metaAll[id]=cleanMeta(b.legalMeta,metaAll[id]||{}); writeHandoverMeta(cid,metaAll); }
  return res.json({ ok: true, item, legalMeta: metaAll[id]||{} });
});

router.delete("/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const existing = await prisma.companyHandover.findFirst({
    where: {
      id: String(req.params.id || ""),
      companyId: cid
    }
  });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  if (!(await canAccessHandoverProject(req, cid, existing.projectId))) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }

  const metaAll=readHandoverMeta(cid);
  if(handoverLocked(existing.status,metaAll[existing.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED",message:"Abgeschlossene Abnahmen dürfen nicht gelöscht werden."});
  await prisma.companyHandover.delete({
    where: { id: existing.id }
  });

  return res.json({ ok: true });
});

router.post("/:id/items", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const handoverId = String(req.params.id || "");
  const b = req.body || {};

  const handover = await prisma.companyHandover.findFirst({
    where: {
      id: handoverId,
      companyId: cid
    }
  });

  if (!handover) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  if (!(await canAccessHandoverProject(req, cid, handover.projectId))) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }
  const metaAll=readHandoverMeta(cid); if(handoverLocked(handover.status,metaAll[handover.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED"});

  const item = await prisma.companyHandoverItem.create({
    data: {
      handoverId,
      text: String(b.text || "Neuer Punkt"),
      status: String(b.status || "OPEN"),
      note: String(b.note || "") || null
    }
  });

  return res.json({ ok: true, item });
});

router.put("/:handoverId/items/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const handoverId = String(req.params.handoverId || "");
  const id = String(req.params.id || "");
  const b = req.body || {};

  const existing = await prisma.companyHandoverItem.findFirst({
    where: {
      id,
      handoverId,
      handover: {
        companyId: cid
      }
    }
  });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  const parent=await prisma.companyHandover.findFirst({where:{id:String(req.params.handoverId || ""),companyId:cid}});
  if(!parent) return res.status(404).json({ok:false,error:"NOT_FOUND"});
  if(!(await canAccessHandoverProject(req,cid,parent.projectId))) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  const metaAll=readHandoverMeta(cid);
  if(handoverLocked(parent.status,metaAll[parent.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED"});

  const item = await prisma.companyHandoverItem.update({
    where: { id },
    data: {
      text:
        b.text !== undefined
          ? String(b.text || "")
          : undefined,
      status:
        b.status !== undefined
          ? String(b.status || "OPEN")
          : undefined,
      note:
        b.note !== undefined
          ? String(b.note || "") || null
          : undefined
    }
  });

  return res.json({ ok: true, item });
});

router.delete("/:handoverId/items/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const existing = await prisma.companyHandoverItem.findFirst({
    where: {
      id: String(req.params.id || ""),
      handoverId: String(req.params.handoverId || ""),
      handover: {
        companyId: cid
      }
    }
  });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  const parent=await prisma.companyHandover.findFirst({where:{id:String(req.params.handoverId || ""),companyId:cid}});
  if(!parent) return res.status(404).json({ok:false,error:"NOT_FOUND"});
  if(!(await canAccessHandoverProject(req,cid,parent.projectId))) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  const metaAll=readHandoverMeta(cid);
  if(handoverLocked(parent.status,metaAll[parent.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED"});

  await prisma.companyHandoverItem.delete({
    where: { id: existing.id }
  });

  return res.json({ ok: true });
});

router.post("/:id/signatures", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const handoverId = String(req.params.id || "");
  const b = req.body || {};
  const role = String(b.role || "").toUpperCase();

  const handover = await prisma.companyHandover.findFirst({
    where: {
      id: handoverId,
      companyId: cid
    }
  });

  if (!handover) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  if (!(await canAccessHandoverProject(req, cid, handover.projectId))) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }
  const metaAll=readHandoverMeta(cid); if(handoverLocked(handover.status,metaAll[handover.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED"});

  const item = await prisma.companyHandoverSignature.upsert({
    where: {
      handoverId_role: {
        handoverId,
        role
      }
    },
    update: {
      name: String(b.name || "") || null,
      signedAt: b.signedAt
        ? new Date(b.signedAt)
        : new Date(),
      imageData: String(b.imageData || "") || null
    },
    create: {
      handoverId,
      role,
      name: String(b.name || "") || null,
      signedAt: b.signedAt
        ? new Date(b.signedAt)
        : new Date(),
      imageData: String(b.imageData || "") || null
    }
  });

  return res.json({ ok: true, item });
});

router.post(
  "/:id/attachments",
  requireHandoverAccessBeforeUpload,
  upload.single("file"),
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const handoverId = String(req.params.id || "");
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        ok: false,
        error: "FILE_REQUIRED"
      });
    }

    const handover = await prisma.companyHandover.findFirst({
      where: {
        id: handoverId,
        companyId: cid
      }
    });

    if (!handover) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }
    const metaAll=readHandoverMeta(cid); if(handoverLocked(handover.status,metaAll[handover.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED"});

    const safeName = file.originalname.replace(
      /[^a-zA-Z0-9._-]+/g,
      "_"
    );

    const key =
      `companies/${cid}/handover/${handoverId}/` +
      `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    await storage.put({
      key,
      body: file.buffer,
      contentType:
        file.mimetype || "application/octet-stream"
    });

    const stored = await prisma.storageObject.create({
      data: {
        id: crypto.randomUUID(),
        bucket,
        key,
        size: BigInt(file.size),
        sha256: crypto
          .createHash("sha256")
          .update(file.buffer)
          .digest("hex"),
        mime:
          file.mimetype || "application/octet-stream"
      }
    });

    const item = await prisma.companyHandoverAttachment.create({
      data: {
        handoverId,
        storageId: stored.id,
        name: file.originalname,
        mime:
          file.mimetype || "application/octet-stream",
        size: file.size
      }
    });

    if (handover.projectId) {
      const kind =
        file.mimetype === "application/pdf"
          ? "PDF"
          : file.mimetype.startsWith("image/")
          ? "IMAGE"
          : "DOC";

      await registerExistingStorageVersion({
        projectIdOrCode: handover.projectId,
        filename: file.originalname,
        kind,
        storageId: stored.id,
        uploadedBy: req.auth?.sub || null,
        meta: {
          module: "UEBERGABE",
          handoverId,
          source: "handover-attachment"
        }
      });
    }

    return res.json({ ok: true, item });
  }
);

router.get(
  "/:handoverId/attachments/:id/open",
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const item =
      await prisma.companyHandoverAttachment.findFirst({
        where: {
          id: String(req.params.id || ""),
          handoverId: String(
            req.params.handoverId || ""
          ),
          handover: {
            companyId: cid
          }
        },
        include: {
          storage: true
        }
      });

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }
    const parent = await prisma.companyHandover.findFirst({
      where: { id: String(req.params.handoverId || ""), companyId: cid },
      select: { projectId: true },
    });
    if (!parent || !(await canAccessHandoverProject(req, cid, parent.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }

    const url = await presignGet(item.storage.key);

    return res.json({
      ok: true,
      url
    });
  }
);

router.delete(
  "/:handoverId/attachments/:id",
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const item =
      await prisma.companyHandoverAttachment.findFirst({
        where: {
          id: String(req.params.id || ""),
          handoverId: String(
            req.params.handoverId || ""
          ),
          handover: {
            companyId: cid
          }
        }
      });

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }

    const parent=await prisma.companyHandover.findFirst({where:{id:String(req.params.handoverId||""),companyId:cid}});
    if(!parent) return res.status(404).json({ok:false,error:"NOT_FOUND"});
    if(!(await canAccessHandoverProject(req,cid,parent.projectId))) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
    const metaAll=readHandoverMeta(cid);
    if(handoverLocked(parent.status,metaAll[parent.id])) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED"});
    await prisma.companyHandoverAttachment.delete({
      where: { id: item.id }
    });

    return res.json({ ok: true });
  }
);


function handoverPdfPath(projectId: string, handoverId: string) {
  return path.join(
    process.cwd(),
    "data",
    "projects",
    projectId,
    "uebergabe",
    `Uebergabe_Abnahme_${handoverId}.pdf`
  );
}

router.post("/:id/finalize", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");

    const handover = await prisma.companyHandover.findFirst({
      where: {
        id,
        companyId: cid
      },
      include: {
        items: {
          orderBy: {
            createdAt: "asc"
          }
        },
        signatures: true
      }
    });

    if (!handover) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }
    if (!(await canAccessHandoverProject(req, cid, handover.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }

    const metaAll=readHandoverMeta(cid);
    const legalMeta=metaAll[id]||{};
    if(handoverLocked(handover.status,legalMeta)) return res.status(409).json({ok:false,error:"HANDOVER_LOCKED",message:"Abnahme ist bereits abgeschlossen."});
    const legalCheck=validateHandoverLegal(legalMeta);
    if(!legalCheck.valid) return res.status(422).json({ok:false,error:"HANDOVER_LEGAL_INCOMPLETE",...legalCheck});

    if (!handover.projectId) {
      return res.status(400).json({
        ok: false,
        error: "PROJECT_REQUIRED"
      });
    }

    const pdfPath = handoverPdfPath(
      handover.projectId,
      handover.id
    );

    const result = await createHandoverPdf({
      pdfPath,
      projectId: handover.projectId,
      title: handover.title,
      client: handover.client,
      address: handover.address,
      date: handover.date,
      status: "ABGESCHLOSSEN",
      notes: handover.notes,
      items: handover.items,
      signatures: handover.signatures,
      legalMeta
    });

    await archiveProjectFileVersion({
      projectIdOrCode: handover.projectId,
      filename: result.fileName,
      kind: "PDF",
      localPath: result.filePath,
      uploadedBy: req.auth?.sub || null,
      meta: {
        module: "UEBERGABE",
        handoverId: handover.id,
        source: "handover-final"
      }
    });

    const snapshot={handover:{...handover,status:"ABGESCHLOSSEN"},legalMeta,legalCheck};
    const evidenceLock={hash:crypto.createHash("sha256").update(JSON.stringify(snapshot),"utf8").digest("hex"),lockedAt:new Date().toISOString(),lockedBy:String(req.auth?.email||req.auth?.sub||"").trim()||null,reason:"Abnahme/Übergabe abgeschlossen"};
    metaAll[id]={...legalMeta,evidenceLock}; writeHandoverMeta(cid,metaAll);
    try{await archiveProjectBufferVersion({projectIdOrCode:handover.projectId,filename:`Abnahme_${id}_Nachweis.json`,kind:"DOC",buffer:Buffer.from(JSON.stringify({snapshot,evidenceLock},null,2),"utf8"),uploadedBy:evidenceLock.lockedBy,meta:{module:"UEBERGABE",source:"handover-final-evidence",handoverId:id,evidenceHash:evidenceLock.hash,evidenceLocked:true}});}catch(e){console.error("[handover evidence DMS]",e);}

    const item = await prisma.companyHandover.update({
      where: {
        id: handover.id
      },
      data: {
        status: "ABGESCHLOSSEN"
      }
    });

    return res.json({
      ok: true,
      item,
      pdfUrl: result.pdfUrl,
      fileName: result.fileName,
      legalMeta: metaAll[id],
      compliance: legalCheck
    });
  } catch (error: any) {
    console.error(
      "POST /api/handover/:id/finalize failed",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "HANDOVER_FINALIZE_FAILED"
    });
  }
});

router.get("/:id/pdf", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const handover =
      await prisma.companyHandover.findFirst({
        where: {
          id: String(req.params.id || ""),
          companyId: cid
        }
      });

    if (!handover) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }

    if (!handover.projectId) {
      return res.status(400).json({
        ok: false,
        error: "PROJECT_REQUIRED"
      });
    }

    const pdfPath = handoverPdfPath(
      handover.projectId,
      handover.id
    );

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        ok: false,
        error: "PDF_NOT_FOUND"
      });
    }

    const contextProjectRoot = path.join(
      process.cwd(),
      "data",
      "projects",
      handover.projectId
    );

    const relative = path
      .relative(
        contextProjectRoot,
        pdfPath
      )
      .split(path.sep)
      .map(encodeURIComponent)
      .join("/");

    return res.json({
      ok: true,
      pdfUrl:
        `/projects/${encodeURIComponent(
          handover.projectId
        )}/${relative}`
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "PDF_OPEN_FAILED"
    });
  }
});

export default router;