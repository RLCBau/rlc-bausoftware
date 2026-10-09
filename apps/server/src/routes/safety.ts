import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { storage } from "../storage/storageService";
import { bucket, presignGet } from "../lib/s3";
import { registerExistingStorageVersion, archiveProjectBufferVersion } from "../services/dmsArchive";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { requirePermission } from "../middleware/rbac";
import { requireProjectMember } from "../middleware/guards";
import { rejectActiveContentUpload, signatureCheckedMemoryStorage } from "../lib/uploadSecurity";

const router = Router();

const requireSafetyProjectAccess = async (req:any,res:any,next:any) => {
  const token=String(req.params?.projectId||"").trim();
  if(!token) return res.status(400).json({ok:false,error:"PROJECT_REQUIRED"});
  req.params=req.params||{};
  req.params.__safetyProject=token;
  return requireProjectMember("__safetyProject")(req,res,next);
};

function dmsKindFromMime(mime: string) {
  const value = String(mime || "").toLowerCase();

  if (value === "application/pdf") return "PDF" as const;
  if (value.startsWith("image/")) return "IMAGE" as const;

  return "DOC" as const;
}

async function safetyEntityProjectId(
  entityType: string,
  entityId: string,
  cid: string
): Promise<string | null> {
  const type = String(entityType || "").toUpperCase();

  if (type === "RISK" || type === "RISK_ASSESSMENT") {
    const row = await prisma.safetyRiskAssessment.findFirst({
      where: { id: entityId, companyId: cid },
      select: { projectId: true }
    });

    return row?.projectId || null;
  }

  if (type === "INSPECTION") {
    const row = await prisma.safetyInspection.findFirst({
      where: { id: entityId, companyId: cid },
      select: { projectId: true }
    });

    return row?.projectId || null;
  }

  if (type === "PERMIT") {
    const row = await prisma.safetyPermit.findFirst({
      where: { id: entityId, companyId: cid },
      select: { projectId: true }
    });

    return row?.projectId || null;
  }

  return null;
}


const upload = multer({
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

function safetyUserId(req: any): string {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function safetyAdmin(req: any): boolean {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  return role === "ADMIN" || role === "ADMINISTRATOR";
}

async function canAccessSafetyProject(req: any, cid: string, projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return true;
  if (safetyAdmin(req)) return true;
  const uid = safetyUserId(req);
  if (!uid) return false;
  const project = await prisma.project.findFirst({
    where: { id: String(projectId), companyId: cid, projectMembers: { some: { userId: uid } } },
    select: { id: true },
  });
  return Boolean(project);
}

async function safetyAccessibleProjectIds(req: any, cid: string): Promise<string[] | null> {
  if (safetyAdmin(req)) return null;
  const uid = safetyUserId(req);
  if (!uid) return [];
  const rows = await prisma.project.findMany({
    where: { companyId: cid, projectMembers: { some: { userId: uid } } },
    select: { id: true },
  });
  return rows.map((x) => x.id);
}

function safetyProjectScope(projectIds: string[] | null) {
  return projectIds === null
    ? {}
    : { OR: [{ projectId: null }, { projectId: { in: projectIds } }] };
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

router.use((req: any, res: any, next: any) => {
  // Medical accident data has a stricter dedicated permission on its routes.
  if (String(req.path || "").startsWith("/accidents")) return next();
  const action = String(req.method || "GET").toUpperCase() === "GET"
    ? "safety:read"
    : "safety:write";
  return requirePermission(action)(req, res, next);
});

function dateOrNull(value: any) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

type SafetyEvidenceLock = { entityType: string; entityId: string; hash: string; lockedAt: string; lockedBy: string | null; reason: string };
function safetyLockFile(cid: string) { return path.join(COMPANIES_ROOT, cid, "safety-evidence-locks.json"); }
function readSafetyLocks(cid: string): SafetyEvidenceLock[] { try { const f=safetyLockFile(cid); if(!fs.existsSync(f)) return []; const v=JSON.parse(fs.readFileSync(f,"utf8")); return Array.isArray(v)?v:[]; } catch { return []; } }
function writeSafetyLocks(cid: string, rows: SafetyEvidenceLock[]) { const f=safetyLockFile(cid); fs.mkdirSync(path.dirname(f),{recursive:true}); const t=`${f}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(t,JSON.stringify(rows,null,2),"utf8"); fs.renameSync(t,f); }
function safetyLock(cid: string, entityType: string, entityId: string) { const t=entityType.toUpperCase(); return readSafetyLocks(cid).find(r=>r.entityType===t&&r.entityId===entityId)||null; }
function safetyCanonical(value:any):string { const sort=(v:any):any=>Array.isArray(v)?v.map(sort):(v&&typeof v==="object"&&!(v instanceof Date)?Object.keys(v).sort().reduce((a:any,k)=>{a[k]=sort(v[k]);return a;},{}):(v instanceof Date?v.toISOString():v)); return JSON.stringify(sort(value)); }
function lockSafetyEvidence(cid:string, entityType:string, entityId:string, snapshot:any, req:any, reason:string) { const type=entityType.toUpperCase(); const rows=readSafetyLocks(cid); const ex=rows.find(r=>r.entityType===type&&r.entityId===entityId); if(ex) return ex; const actor=String(req?.auth?.email||req?.auth?.userId||req?.auth?.sub||"").trim()||null; const lock:SafetyEvidenceLock={entityType:type,entityId,hash:crypto.createHash("sha256").update(safetyCanonical(snapshot),"utf8").digest("hex"),lockedAt:new Date().toISOString(),lockedBy:actor,reason}; rows.push(lock); writeSafetyLocks(cid,rows); return lock; }
function finalSafetyStatus(value:any){return ["DONE","CLOSED","APPROVED","FINAL","FREIGEGEBEN","ERLEDIGT"].includes(String(value||"").trim().toUpperCase());}
function locked409(res:any, lock:SafetyEvidenceLock){return res.status(409).json({ok:false,error:"SAFETY_EVIDENCE_LOCKED",lock});}

function baustellvDir(cid:string){const d=path.join(COMPANIES_ROOT,cid,"baustellv");fs.mkdirSync(d,{recursive:true});return d;}
function baustellvFile(cid:string,projectId:string){return path.join(baustellvDir(cid),`${String(projectId||"").replace(/[^a-zA-Z0-9._-]/g,"_")}.json`);}
function readBaustellv(cid:string,projectId:string){try{const f=baustellvFile(cid,projectId);if(!fs.existsSync(f))return null;return JSON.parse(fs.readFileSync(f,"utf8"));}catch{return null;}}
function baustellvComputed(v:any){
  const duration=Math.max(0,Number(v?.plannedDurationDays||0));
  const maxWorkers=Math.max(0,Number(v?.maxWorkers||0));
  const personDays=Math.max(0,Number(v?.personDays||0));
  const employerCount=Math.max(0,Number(v?.employerCount||0));
  const multipleEmployers=v?.multipleEmployers===true||employerCount>1;
  const dangerousWork=v?.dangerousWork===true;
  const priorNoticeRequired=(duration>30&&maxWorkers>20)||personDays>500;
  const coordinatorRequired=multipleEmployers;
  const sigePlanRequired=multipleEmployers&&(priorNoticeRequired||dangerousWork);
  const laterWorksDocumentRequired=multipleEmployers;
  return {duration,maxWorkers,personDays,employerCount,multipleEmployers,dangerousWork,priorNoticeRequired,coordinatorRequired,sigePlanRequired,laterWorksDocumentRequired};
}
function validateBaustellv(v:any){
  const c=baustellvComputed(v); const errors:string[]=[]; const warnings:string[]=[];
  for(const [key,label] of [["siteLocation","Ort der Baustelle"],["clientName","Name des Bauherrn"],["clientAddress","Anschrift des Bauherrn"],["projectType","Art des Bauvorhabens"],["plannedStart","Voraussichtlicher Beginn"]] as any[]){if(!String(v?.[key]||"").trim()) errors.push(`${label} fehlt.`);}
  if(c.duration<1) errors.push("Voraussichtliche Dauer fehlt.");
  if(c.maxWorkers<1) errors.push("Voraussichtliche Höchstzahl der Beschäftigten fehlt.");
  if(c.employerCount<1) errors.push("Zahl der Arbeitgeber/Unternehmer fehlt.");
  if(c.coordinatorRequired&&!String(v?.coordinatorName||"").trim()) errors.push("BaustellV §3: Koordinator fehlt.");
  if(c.priorNoticeRequired){if(!v?.priorNoticeSubmittedAt) errors.push("BaustellV §2: Vorankündigung ist erforderlich und noch nicht als übermittelt dokumentiert."); if(v?.priorNoticePosted!==true) errors.push("BaustellV §2: Aushang der Vorankündigung auf der Baustelle ist nicht bestätigt.");}
  if(c.sigePlanRequired&&v?.sigePlanExists!==true) errors.push("BaustellV §2: SiGePlan ist erforderlich.");
  if(c.laterWorksDocumentRequired&&v?.laterWorksDocumentExists!==true) warnings.push("BaustellV §3: Unterlage für spätere Arbeiten ist noch nicht bestätigt.");
  if(c.priorNoticeRequired&&Array.isArray(v?.selectedEmployers)&&!v.selectedEmployers.length) warnings.push("Anhang I: bereits ausgewählte Arbeitgeber/Unternehmer sind nicht angegeben.");
  return {valid:errors.length===0,errors,warnings,...c};
}
async function ensureSafetyProjectCompany(cid:string,projectId:string){
  const p=await prisma.project.findFirst({where:{companyId:cid,OR:[{id:projectId},{code:projectId}]},select:{id:true,code:true,name:true}});
  return p||null;
}

async function finalizeSafetyEntityEvidence(args:{cid:string;entityType:string;entityId:string;snapshot:any;projectId?:string|null;req:any;reason:string;filePrefix:string}) {
  const type=args.entityType.toUpperCase();
  const existing=safetyLock(args.cid,type,args.entityId);
  if(existing) return existing;

  const actor=String(args.req?.auth?.email||args.req?.auth?.userId||args.req?.auth?.sub||"").trim()||null;
  const lock:SafetyEvidenceLock={
    entityType:type,
    entityId:args.entityId,
    hash:crypto.createHash("sha256").update(safetyCanonical(args.snapshot),"utf8").digest("hex"),
    lockedAt:new Date().toISOString(),
    lockedBy:actor,
    reason:args.reason
  };

  if(args.projectId){
    await archiveProjectBufferVersion({
      projectIdOrCode:args.projectId,
      filename:`${args.filePrefix}_${args.entityId}_Nachweis.json`,
      kind:"DOC",
      buffer:Buffer.from(JSON.stringify({snapshot:args.snapshot,lock},null,2),"utf8"),
      uploadedBy:lock.lockedBy,
      meta:{module:"SICHERHEIT",source:"safety-evidence-finalize",entityType:type,entityId:args.entityId,evidenceHash:lock.hash,evidenceLocked:true}
    });
  }

  const rows=readSafetyLocks(args.cid);
  const raceExisting=rows.find(r=>r.entityType===type&&r.entityId===args.entityId);
  if(raceExisting) return raceExisting;
  rows.push(lock);
  writeSafetyLocks(args.cid,rows);
  return lock;
}

router.get("/", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const uid = safetyUserId(req);
    const accessibleProjectIds = safetyAdmin(req) ? null : (uid
      ? (await prisma.project.findMany({
          where: { companyId: cid, projectMembers: { some: { userId: uid } } },
          select: { id: true },
        })).map((p) => p.id)
      : []);
    const items = await prisma.safetyInstruction.findMany({
      where: {
        companyId: cid,
        ...(accessibleProjectIds ? { OR: [{ projectId: null }, { projectId: { in: accessibleProjectIds } }] } : {}),
      },
      include: {
        participants: {
          include: {
            employee: true
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        documents: {
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: [
        { nextDate: "asc" },
        { date: "desc" }
      ]
    });

    return res.json({
      ok: true,
      items: items.map((item: any) => ({ ...item, evidenceLock: safetyLock(cid, "INSTRUCTION", item.id) }))
    });
  } catch (error: any) {
    console.error("GET /api/safety failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "SAFETY_LOAD_FAILED"
    });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const body = req.body || {};
    const requestedProjectId = String(body.projectId || "").trim() || null;
    if (requestedProjectId && !(await canAccessSafetyProject(req, cid, requestedProjectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }

    const item = await prisma.safetyInstruction.create({
      data: {
        companyId: cid,
        title: String(body.title || "Neue Unterweisung"),
        projectId: requestedProjectId,
        instructor: String(body.instructor || "") || null,
        date: dateOrNull(body.date),
        nextDate: dateOrNull(body.nextDate),
        notes: String(body.notes || "") || null
      }
    });

    return res.json({
      ok: true,
      item
    });
  } catch (error: any) {
    console.error("POST /api/safety failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "SAFETY_CREATE_FAILED"
    });
  }
});

router.put("/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const body = req.body || {};

    const existing = await prisma.safetyInstruction.findFirst({
      where: {
        id,
        companyId: cid
      }
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    if (!(await canAccessSafetyProject(req, cid, existing.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    if (body.projectId !== undefined) {
      const targetProjectId = String(body.projectId || "").trim() || null;
      if (targetProjectId && !(await canAccessSafetyProject(req, cid, targetProjectId))) {
        return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      }
    }
    const evidenceLock = safetyLock(cid, "INSTRUCTION", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    const item = await prisma.safetyInstruction.update({
      where: { id },
      data: {
        title:
          body.title !== undefined
            ? String(body.title || "")
            : undefined,

        projectId:
          body.projectId !== undefined
            ? String(body.projectId || "") || null
            : undefined,

        instructor:
          body.instructor !== undefined
            ? String(body.instructor || "") || null
            : undefined,

        date:
          body.date !== undefined
            ? dateOrNull(body.date)
            : undefined,

        nextDate:
          body.nextDate !== undefined
            ? dateOrNull(body.nextDate)
            : undefined,

        notes:
          body.notes !== undefined
            ? String(body.notes || "") || null
            : undefined
      }
    });

    return res.json({
      ok: true,
      item
    });
  } catch (error: any) {
    console.error("PUT /api/safety/:id failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "SAFETY_UPDATE_FAILED"
    });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const existing = await prisma.safetyInstruction.findFirst({ where: { id, companyId: cid } });
    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!(await canAccessSafetyProject(req, cid, existing.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "INSTRUCTION", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    await prisma.safetyInstruction.delete({ where: { id: existing.id } });

    return res.json({
      ok: true
    });
  } catch (error: any) {
    console.error("DELETE /api/safety/:id failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "SAFETY_DELETE_FAILED"
    });
  }
});

router.post("/:id/finalize", async (req: any, res) => {
  try {
    const cid=cidOr403(req,res); if(!cid) return; const id=String(req.params.id||"");
    const existingLock=safetyLock(cid,"INSTRUCTION",id); if(existingLock) return res.json({ok:true,lock:existingLock});
    if(req.body?.confirmedByInstructor!==true) return res.status(422).json({ok:false,error:"INSTRUCTOR_CONFIRMATION_REQUIRED"});
    const instruction=await prisma.safetyInstruction.findFirst({where:{id,companyId:cid},include:{participants:{include:{employee:{select:{id:true,name:true}}},orderBy:{createdAt:"asc"}},documents:{include:{storage:true},orderBy:{createdAt:"asc"}}}});
    if(!instruction) return res.status(404).json({ok:false,error:"NOT_FOUND"});
    if(!(await canAccessSafetyProject(req,cid,instruction.projectId))) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
    const errors:string[]=[]; if(!instruction.title.trim()) errors.push("Titel fehlt"); if(!String(instruction.instructor||"").trim()) errors.push("Unterweisender fehlt"); if(!instruction.date) errors.push("Unterweisungsdatum fehlt"); if(!instruction.participants.length) errors.push("Teilnehmerliste ist leer");
    if(errors.length) return res.status(422).json({ok:false,error:"SAFETY_FINALIZE_VALIDATION_FAILED",errors});
    const snapshot={id:instruction.id,title:instruction.title,projectId:instruction.projectId,instructor:instruction.instructor,date:instruction.date,nextDate:instruction.nextDate,notes:instruction.notes,participants:instruction.participants.map((x:any)=>({employeeId:x.employeeId,name:x.employee?.name,addedAt:x.createdAt})),documents:instruction.documents.map((x:any)=>({id:x.id,name:x.name,sha256:x.storage?.sha256,createdAt:x.createdAt}))};
    const lock=await finalizeSafetyEntityEvidence({
      cid,
      entityType:"INSTRUCTION",
      entityId:id,
      snapshot,
      projectId:instruction.projectId,
      req,
      reason:"ArbSchG-Unterweisung abgeschlossen; Inhalt und Teilnehmernachweis gesperrt",
      filePrefix:"Unterweisung"
    });
    return res.json({ok:true,lock});
  } catch(error:any){return res.status(500).json({ok:false,error:error?.message||"SAFETY_FINALIZE_FAILED"});}
});

router.post("/:id/participants", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const instructionId = String(req.params.id || "");
    const employeeId = String(req.body?.employeeId || "");

    const instruction = await prisma.safetyInstruction.findFirst({
      where: {
        id: instructionId,
        companyId: cid
      }
    });

    if (!instruction) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }
    const instructionLock = safetyLock(cid, "INSTRUCTION", instructionId);
    if (instructionLock) return locked409(res, instructionLock);

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

    const item =
      await prisma.safetyInstructionParticipant.upsert({
        where: {
          instructionId_employeeId: {
            instructionId,
            employeeId
          }
        },
        update: {},
        create: {
          instructionId,
          employeeId
        }
      });

    return res.json({
      ok: true,
      item
    });
  } catch (error: any) {
    console.error(
      "POST /api/safety/:id/participants failed",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "SAFETY_PARTICIPANT_CREATE_FAILED"
    });
  }
});

router.delete(
  "/:id/participants/:employeeId",
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const instructionId = String(req.params.id || "");
      const employeeId = String(req.params.employeeId || "");

      const instruction =
        await prisma.safetyInstruction.findFirst({
          where: {
            id: instructionId,
            companyId: cid
          }
        });

      if (!instruction) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND"
        });
      }

      await prisma.safetyInstructionParticipant.deleteMany({
        where: {
          instructionId,
          employeeId
        }
      });

      return res.json({
        ok: true
      });
    } catch (error: any) {
      console.error(
        "DELETE /api/safety/:id/participants failed",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "SAFETY_PARTICIPANT_DELETE_FAILED"
      });
    }
  }
);

router.post(
  "/:id/documents",
  upload.single("file"),
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const instructionId = String(req.params.id || "");
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "FILE_REQUIRED"
        });
      }

      const instruction =
        await prisma.safetyInstruction.findFirst({
          where: {
            id: instructionId,
            companyId: cid
          }
        });

      if (!instruction) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND"
        });
      }

      const safeName = file.originalname.replace(
        /[^a-zA-Z0-9._-]+/g,
        "_"
      );

      const key =
        `companies/${cid}/safety/${instructionId}/` +
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
            mime: file.mimetype || "application/octet-stream"
          }
      });

      const document =
        await prisma.safetyInstructionDocument.create({
          data: {
            instructionId,
            storageId: stored.id,
            name: file.originalname,
            mime:
              file.mimetype ||
              "application/octet-stream",
            size: file.size
          }
        });

      if (instruction.projectId) {
        try {
          await registerExistingStorageVersion({
            projectIdOrCode: instruction.projectId,
            filename: file.originalname,
            kind: dmsKindFromMime(
              file.mimetype || "application/octet-stream"
            ),
            storageId: stored.id,
            uploadedBy: req.auth?.sub || null,
            meta: {
              module: "SICHERHEIT",
              source: "safety-instruction",
              instructionId
            }
          });
        } catch (dmsError) {
          console.error(
            "[Safety DMS] Unterweisungsdokument konnte nicht registriert werden",
            dmsError
          );
        }
      }

      return res.json({
        ok: true,
        item: document
      });
    } catch (error: any) {
      console.error(
        "POST /api/safety/:id/documents failed",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "SAFETY_DOCUMENT_UPLOAD_FAILED"
      });
    }
  }
);

router.get(
  "/:id/documents/:documentId",
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const instructionId = String(req.params.id || "");
      const documentId = String(req.params.documentId || "");

      const document =
        await prisma.safetyInstructionDocument.findFirst({
          where: {
            id: documentId,
            instructionId,
            instruction: {
              companyId: cid
            }
          },
          include: {
            storage: true
          }
        });

      if (!document) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND"
        });
      }

      const url = await presignGet(document.storage.key);

      return res.json({
        ok: true,
        url
      });
    } catch (error: any) {
      console.error(
        "GET /api/safety/:id/documents/:documentId failed",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "SAFETY_DOCUMENT_URL_FAILED"
      });
    }
  }
);

router.delete(
  "/:id/documents/:documentId",
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const instructionId = String(req.params.id || "");
      const documentId = String(req.params.documentId || "");

      const document =
        await prisma.safetyInstructionDocument.findFirst({
          where: {
            id: documentId,
            instructionId,
            instruction: {
              companyId: cid
            }
          }
        });

      if (!document) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND"
        });
      }

      await prisma.safetyInstructionDocument.delete({
        where: {
          id: documentId
        }
      });

      return res.json({
        ok: true
      });
    } catch (error: any) {
      console.error(
        "DELETE /api/safety/:id/documents/:documentId failed",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "SAFETY_DOCUMENT_DELETE_FAILED"
      });
    }
  }
);


function safetyDate(value: any) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get("/dashboard", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const projectIds = await safetyAccessibleProjectIds(req, cid);
    const projectScope = safetyProjectScope(projectIds);
    const [
      instructions,
      assessments,
      inspections,
      findings,
      ppe,
      permits
    ] = await Promise.all([
      prisma.safetyInstruction.count({ where: { companyId: cid, ...projectScope } }),
      prisma.safetyRiskAssessment.count({ where: { companyId: cid, ...projectScope } }),
      prisma.safetyInspection.count({ where: { companyId: cid, ...projectScope } }),
      prisma.safetyInspectionFinding.count({
        where: {
          inspection: { companyId: cid, ...projectScope },
          status: { not: "DONE" }
        }
      }),
      prisma.safetyPpeRecord.count({ where: { companyId: cid } }),
      prisma.safetyPermit.count({ where: { companyId: cid, ...projectScope } })
    ]);

    return res.json({
      ok: true,
      counts: {
        instructions,
        assessments,
        inspections,
        openFindings: findings,
        ppe,
        permits
      }
    });
  } catch (error: any) {
    console.error("GET /api/safety/dashboard failed", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "SAFETY_DASHBOARD_FAILED"
    });
  }
});

router.get("/risk-assessments", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const projectIds = await safetyAccessibleProjectIds(req, cid);
    const items = await prisma.safetyRiskAssessment.findMany({
      where: { companyId: cid, ...safetyProjectScope(projectIds) },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }]
    });

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "RISK_ASSESSMENTS_LOAD_FAILED"
    });
  }
});

router.post("/risk-assessments", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const b = req.body || {};
    const requestedProjectId = String(b.projectId || "").trim() || null;
    if (requestedProjectId && !(await canAccessSafetyProject(req, cid, requestedProjectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }

    const item = await prisma.safetyRiskAssessment.create({
      data: {
        companyId: cid,
        title: String(b.title || "Neue Gefährdungsbeurteilung"),
        projectId: String(b.projectId || "") || null,
        activity: String(b.activity || "") || null,
        hazard: String(b.hazard || "") || null,
        riskLevel: String(b.riskLevel || "MEDIUM"),
        measures: String(b.measures || "") || null,
        responsible: String(b.responsible || "") || null,
        dueDate: safetyDate(b.dueDate),
        status: String(b.status || "OPEN"),
        notes: String(b.notes || "") || null
      }
    });

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "RISK_ASSESSMENT_CREATE_FAILED"
    });
  }
});

router.put("/risk-assessments/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const b = req.body || {};

    const exists = await prisma.safetyRiskAssessment.findFirst({
      where: { id, companyId: cid }
    });

    if (!exists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    if (!(await canAccessSafetyProject(req, cid, exists.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    if (b.projectId !== undefined) {
      const targetProjectId = String(b.projectId || "").trim() || null;
      if (targetProjectId && !(await canAccessSafetyProject(req, cid, targetProjectId))) {
        return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      }
    }
    const evidenceLock = safetyLock(cid, "RISK", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    const item = await prisma.safetyRiskAssessment.update({
      where: { id },
      data: {
        title: b.title !== undefined ? String(b.title || "") : undefined,
        projectId: b.projectId !== undefined ? String(b.projectId || "") || null : undefined,
        activity: b.activity !== undefined ? String(b.activity || "") || null : undefined,
        hazard: b.hazard !== undefined ? String(b.hazard || "") || null : undefined,
        riskLevel: b.riskLevel !== undefined ? String(b.riskLevel || "MEDIUM") : undefined,
        measures: b.measures !== undefined ? String(b.measures || "") || null : undefined,
        responsible: b.responsible !== undefined ? String(b.responsible || "") || null : undefined,
        dueDate: b.dueDate !== undefined ? safetyDate(b.dueDate) : undefined,
        status: b.status !== undefined ? String(b.status || "OPEN") : undefined,
        notes: b.notes !== undefined ? String(b.notes || "") || null : undefined
      }
    });

    let evidenceLockResult = null;
    if (finalSafetyStatus(item.status)) {
      const errors:string[]=[];
      if(!String(item.title||"").trim()) errors.push("Titel fehlt");
      if(!String(item.activity||"").trim()) errors.push("Tätigkeit fehlt");
      if(!String(item.hazard||"").trim()) errors.push("Gefährdung fehlt");
      if(!String(item.measures||"").trim()) errors.push("Schutzmaßnahmen fehlen");
      if(!String(item.responsible||"").trim()) errors.push("Verantwortlicher fehlt");
      if(errors.length) return res.status(422).json({ok:false,error:"RISK_FINALIZE_VALIDATION_FAILED",errors});
      evidenceLockResult=await finalizeSafetyEntityEvidence({cid,entityType:"RISK",entityId:id,snapshot:item,projectId:item.projectId,req,reason:"ArbSchG Gefährdungsbeurteilung abgeschlossen; Nachweis gesperrt",filePrefix:"Gefaehrdungsbeurteilung"});
    }
    return res.json({ ok: true, item, evidenceLock: evidenceLockResult });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "RISK_ASSESSMENT_UPDATE_FAILED"
    });
  }
});

router.delete("/risk-assessments/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const existing = await prisma.safetyRiskAssessment.findFirst({ where: { id, companyId: cid } });
    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!(await canAccessSafetyProject(req, cid, existing.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "RISK", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    await prisma.safetyRiskAssessment.deleteMany({
      where: {
        id: String(req.params.id || ""),
        companyId: cid
      }
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "RISK_ASSESSMENT_DELETE_FAILED"
    });
  }
});

router.get("/inspections", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const projectIds = await safetyAccessibleProjectIds(req, cid);
    const items = await prisma.safetyInspection.findMany({
      where: { companyId: cid, ...safetyProjectScope(projectIds) },
      include: {
        findings: {
          orderBy: [{ status: "asc" }, { dueDate: "asc" }]
        }
      },
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }]
    });

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "INSPECTIONS_LOAD_FAILED"
    });
  }
});

router.post("/inspections", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const b = req.body || {};
    const requestedProjectId = String(b.projectId || "").trim() || null;
    if (requestedProjectId && !(await canAccessSafetyProject(req, cid, requestedProjectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }

    const item = await prisma.safetyInspection.create({
      data: {
        companyId: cid,
        title: String(b.title || "Neue Sicherheitsbegehung"),
        projectId: String(b.projectId || "") || null,
        date: safetyDate(b.date),
        inspector: String(b.inspector || "") || null,
        status: String(b.status || "OPEN"),
        notes: String(b.notes || "") || null
      }
    });

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "INSPECTION_CREATE_FAILED"
    });
  }
});

router.put("/inspections/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const b = req.body || {};

    const exists = await prisma.safetyInspection.findFirst({
      where: { id, companyId: cid }
    });

    if (!exists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    if (!(await canAccessSafetyProject(req, cid, exists.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    if (b.projectId !== undefined) {
      const targetProjectId = String(b.projectId || "").trim() || null;
      if (targetProjectId && !(await canAccessSafetyProject(req, cid, targetProjectId))) {
        return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      }
    }
    const evidenceLock = safetyLock(cid, "INSPECTION", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    const item = await prisma.safetyInspection.update({
      where: { id },
      data: {
        title: b.title !== undefined ? String(b.title || "") : undefined,
        projectId: b.projectId !== undefined ? String(b.projectId || "") || null : undefined,
        date: b.date !== undefined ? safetyDate(b.date) : undefined,
        inspector: b.inspector !== undefined ? String(b.inspector || "") || null : undefined,
        status: b.status !== undefined ? String(b.status || "OPEN") : undefined,
        notes: b.notes !== undefined ? String(b.notes || "") || null : undefined
      }
    });

    let evidenceLockResult = null;
    if (finalSafetyStatus(item.status)) {
      const full = await prisma.safetyInspection.findUnique({where:{id},include:{findings:true}});
      const errors:string[]=[];
      if(!String(item.title||"").trim()) errors.push("Titel fehlt");
      if(!item.date) errors.push("Prüf-/Begehungsdatum fehlt");
      if(!String(item.inspector||"").trim()) errors.push("Prüfer fehlt");
      if(errors.length) return res.status(422).json({ok:false,error:"INSPECTION_FINALIZE_VALIDATION_FAILED",errors});
      evidenceLockResult=await finalizeSafetyEntityEvidence({cid,entityType:"INSPECTION",entityId:id,snapshot:full||item,projectId:item.projectId,req,reason:"Sicherheitsbegehung/Prüfnachweis abgeschlossen; Inhalt gesperrt",filePrefix:"Sicherheitsbegehung"});
    }
    return res.json({ ok: true, item, evidenceLock: evidenceLockResult });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "INSPECTION_UPDATE_FAILED"
    });
  }
});

router.delete("/inspections/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const existing = await prisma.safetyInspection.findFirst({ where: { id, companyId: cid } });
    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!(await canAccessSafetyProject(req, cid, existing.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "INSPECTION", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    await prisma.safetyInspection.deleteMany({
      where: {
        id: String(req.params.id || ""),
        companyId: cid
      }
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "INSPECTION_DELETE_FAILED"
    });
  }
});

router.post("/inspections/:id/findings", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const inspectionId = String(req.params.id || "");

    const inspection = await prisma.safetyInspection.findFirst({
      where: { id: inspectionId, companyId: cid }
    });

    if (!inspection) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    if (!(await canAccessSafetyProject(req, cid, inspection.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "INSPECTION", inspectionId);
    if (evidenceLock) return locked409(res, evidenceLock);

    const b = req.body || {};

    const item = await prisma.safetyInspectionFinding.create({
      data: {
        inspectionId,
        title: String(b.title || "Neuer Mangel"),
        severity: String(b.severity || "MEDIUM"),
        measure: String(b.measure || "") || null,
        responsible: String(b.responsible || "") || null,
        dueDate: safetyDate(b.dueDate),
        status: String(b.status || "OPEN")
      }
    });

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "FINDING_CREATE_FAILED"
    });
  }
});

router.put("/inspections/:inspectionId/findings/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const inspectionId = String(req.params.inspectionId || "");
    const id = String(req.params.id || "");
    const b = req.body || {};

    const exists = await prisma.safetyInspectionFinding.findFirst({
      where: {
        id,
        inspectionId,
        inspection: { companyId: cid }
      }
    });

    if (!exists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    const inspection = await prisma.safetyInspection.findFirst({
      where: { id: inspectionId, companyId: cid },
      select: { projectId: true },
    });
    if (!inspection || !(await canAccessSafetyProject(req, cid, inspection.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "INSPECTION", inspectionId);
    if (evidenceLock) return locked409(res, evidenceLock);

    const item = await prisma.safetyInspectionFinding.update({
      where: { id },
      data: {
        title: b.title !== undefined ? String(b.title || "") : undefined,
        severity: b.severity !== undefined ? String(b.severity || "MEDIUM") : undefined,
        measure: b.measure !== undefined ? String(b.measure || "") || null : undefined,
        responsible: b.responsible !== undefined ? String(b.responsible || "") || null : undefined,
        dueDate: b.dueDate !== undefined ? safetyDate(b.dueDate) : undefined,
        status: b.status !== undefined ? String(b.status || "OPEN") : undefined
      }
    });

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "FINDING_UPDATE_FAILED"
    });
  }
});

router.delete("/inspections/:inspectionId/findings/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const inspectionId = String(req.params.inspectionId || "");
    const id = String(req.params.id || "");

    const exists = await prisma.safetyInspectionFinding.findFirst({
      where: {
        id,
        inspectionId,
        inspection: { companyId: cid }
      }
    });

    if (!exists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    const inspection = await prisma.safetyInspection.findFirst({
      where: { id: inspectionId, companyId: cid },
      select: { projectId: true },
    });
    if (!inspection || !(await canAccessSafetyProject(req, cid, inspection.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "INSPECTION", inspectionId);
    if (evidenceLock) return locked409(res, evidenceLock);

    await prisma.safetyInspectionFinding.delete({ where: { id } });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "FINDING_DELETE_FAILED"
    });
  }
});

router.get("/ppe", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const employeeId = String(req.query.employeeId || "");

    const items = await prisma.safetyPpeRecord.findMany({
      where: {
        companyId: cid,
        ...(employeeId ? { employeeId } : {})
      },
      include: { employee: true },
      orderBy: [{ nextCheck: "asc" }, { updatedAt: "desc" }]
    });

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PPE_LOAD_FAILED"
    });
  }
});

router.post("/ppe", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const b = req.body || {};
    const employeeId = String(b.employeeId || "");

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

    const item = await prisma.safetyPpeRecord.create({
      data: {
        companyId: cid,
        employeeId,
        type: String(b.type || "PSA"),
        itemName: String(b.itemName || "") || null,
        issuedAt: safetyDate(b.issuedAt),
        nextCheck: safetyDate(b.nextCheck),
        condition: String(b.condition || "") || null,
        status: String(b.status || "ACTIVE"),
        notes: String(b.notes || "") || null
      },
      include: { employee: true }
    });

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PPE_CREATE_FAILED"
    });
  }
});

router.put("/ppe/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const b = req.body || {};

    const exists = await prisma.safetyPpeRecord.findFirst({
      where: { id, companyId: cid }
    });

    if (!exists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    const evidenceLock = safetyLock(cid, "PPE", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    const item = await prisma.safetyPpeRecord.update({
      where: { id },
      data: {
        type: b.type !== undefined ? String(b.type || "PSA") : undefined,
        itemName: b.itemName !== undefined ? String(b.itemName || "") || null : undefined,
        issuedAt: b.issuedAt !== undefined ? safetyDate(b.issuedAt) : undefined,
        nextCheck: b.nextCheck !== undefined ? safetyDate(b.nextCheck) : undefined,
        condition: b.condition !== undefined ? String(b.condition || "") || null : undefined,
        status: b.status !== undefined ? String(b.status || "ACTIVE") : undefined,
        notes: b.notes !== undefined ? String(b.notes || "") || null : undefined
      },
      include: { employee: true }
    });

    let evidenceLockResult=null;
    if(finalSafetyStatus(item.status)){
      if(!item.issuedAt) return res.status(422).json({ok:false,error:"PPE_FINALIZE_VALIDATION_FAILED",errors:["Ausgabedatum fehlt"]});
      evidenceLockResult=await finalizeSafetyEntityEvidence({cid,entityType:"PPE",entityId:id,snapshot:item,projectId:null,req,reason:"PSA-Nachweis abgeschlossen; Inhalt gesperrt",filePrefix:"PSA"});
    }
    return res.json({ ok: true, item, evidenceLock:evidenceLockResult });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PPE_UPDATE_FAILED"
    });
  }
});

router.delete("/ppe/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const evidenceLock = safetyLock(cid, "PPE", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    await prisma.safetyPpeRecord.deleteMany({
      where: {
        id: String(req.params.id || ""),
        companyId: cid
      }
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PPE_DELETE_FAILED"
    });
  }
});

router.get("/permits", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const projectIds = await safetyAccessibleProjectIds(req, cid);
    const items = await prisma.safetyPermit.findMany({
      where: { companyId: cid, ...safetyProjectScope(projectIds) },
      orderBy: [{ validUntil: "asc" }, { updatedAt: "desc" }]
    });

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PERMITS_LOAD_FAILED"
    });
  }
});

router.post("/permits", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const b = req.body || {};
    const requestedProjectId = String(b.projectId || "").trim() || null;
    if (requestedProjectId && !(await canAccessSafetyProject(req, cid, requestedProjectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }

    const item = await prisma.safetyPermit.create({
      data: {
        companyId: cid,
        title: String(b.title || "Neue Freigabe"),
        projectId: String(b.projectId || "") || null,
        permitType: String(b.permitType || "ARBEITSFREIGABE"),
        validFrom: safetyDate(b.validFrom),
        validUntil: safetyDate(b.validUntil),
        responsible: String(b.responsible || "") || null,
        status: String(b.status || "OPEN"),
        notes: String(b.notes || "") || null
      }
    });

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PERMIT_CREATE_FAILED"
    });
  }
});

router.put("/permits/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const b = req.body || {};

    const exists = await prisma.safetyPermit.findFirst({
      where: { id, companyId: cid }
    });

    if (!exists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    if (!(await canAccessSafetyProject(req, cid, exists.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    if (b.projectId !== undefined) {
      const targetProjectId = String(b.projectId || "").trim() || null;
      if (targetProjectId && !(await canAccessSafetyProject(req, cid, targetProjectId))) {
        return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      }
    }
    const evidenceLock = safetyLock(cid, "PERMIT", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    const item = await prisma.safetyPermit.update({
      where: { id },
      data: {
        title: b.title !== undefined ? String(b.title || "") : undefined,
        projectId: b.projectId !== undefined ? String(b.projectId || "") || null : undefined,
        permitType: b.permitType !== undefined ? String(b.permitType || "ARBEITSFREIGABE") : undefined,
        validFrom: b.validFrom !== undefined ? safetyDate(b.validFrom) : undefined,
        validUntil: b.validUntil !== undefined ? safetyDate(b.validUntil) : undefined,
        responsible: b.responsible !== undefined ? String(b.responsible || "") || null : undefined,
        status: b.status !== undefined ? String(b.status || "OPEN") : undefined,
        notes: b.notes !== undefined ? String(b.notes || "") || null : undefined
      }
    });

    let evidenceLockResult=null;
    if(finalSafetyStatus(item.status)){
      const errors:string[]=[]; if(!String(item.title||"").trim()) errors.push("Titel fehlt"); if(!String(item.responsible||"").trim()) errors.push("Verantwortlicher fehlt"); if(!item.validFrom) errors.push("Gültig-ab fehlt");
      if(errors.length) return res.status(422).json({ok:false,error:"PERMIT_FINALIZE_VALIDATION_FAILED",errors});
      evidenceLockResult=await finalizeSafetyEntityEvidence({cid,entityType:"PERMIT",entityId:id,snapshot:item,projectId:item.projectId,req,reason:"Arbeits-/Sicherheitsfreigabe abgeschlossen; Inhalt gesperrt",filePrefix:"Freigabe"});
    }
    return res.json({ ok: true, item, evidenceLock:evidenceLockResult });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PERMIT_UPDATE_FAILED"
    });
  }
});

router.delete("/permits/:id", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const id = String(req.params.id || "");
    const existing = await prisma.safetyPermit.findFirst({ where: { id, companyId: cid } });
    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!(await canAccessSafetyProject(req, cid, existing.projectId))) {
      return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    }
    const evidenceLock = safetyLock(cid, "PERMIT", id);
    if (evidenceLock) return locked409(res, evidenceLock);

    await prisma.safetyPermit.deleteMany({
      where: {
        id: String(req.params.id || ""),
        companyId: cid
      }
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "PERMIT_DELETE_FAILED"
    });
  }
});


function accidentFile(cid:string){const d=path.join(COMPANIES_ROOT,cid,"safety-medical");fs.mkdirSync(d,{recursive:true});return path.join(d,"accidents.json");}
function readAccidents(cid:string):any[]{try{const f=accidentFile(cid);if(!fs.existsSync(f))return [];const v=JSON.parse(fs.readFileSync(f,"utf8"));return Array.isArray(v)?v:[];}catch{return [];}}
function writeAccidents(cid:string,rows:any[]){const f=accidentFile(cid);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(rows,null,2),"utf8");fs.renameSync(t,f);}
function addDaysIso(value:any,days:number){const d=new Date(value||Date.now());if(Number.isNaN(d.getTime()))return null;d.setDate(d.getDate()+days);return d.toISOString();}
function addYearsIso(value:any,years:number){const d=new Date(value||Date.now());if(Number.isNaN(d.getTime()))return null;d.setFullYear(d.getFullYear()+years);return d.toISOString();}
function accidentCompliance(v:any){
  const errors:string[]=[]; const warnings:string[]=[];
  const incapacityDays=Math.max(0,Number(v?.incapacityDays||0));
  const fatal=v?.fatal===true;
  const reportable=fatal||incapacityDays>3;
  if(!String(v?.employeeName||"").trim()) errors.push("Name der verletzten/erkrankten Person fehlt.");
  if(!v?.eventAt) errors.push("Datum/Uhrzeit des Ereignisses fehlt.");
  if(!String(v?.location||"").trim()) errors.push("Ort des Ereignisses fehlt.");
  if(!String(v?.eventDescription||"").trim()) errors.push("Unfall-/Ereignishergang fehlt.");
  if(!String(v?.injuryDescription||"").trim()) errors.push("Art und Umfang der Verletzung/Erkrankung fehlt.");
  if(!String(v?.firstAidMeasures||"").trim()) errors.push("Erste-Hilfe-Maßnahmen fehlen.");
  if(!String(v?.firstAiderName||"").trim()) errors.push("Name Ersthelfer/in fehlt.");
  if(reportable){
    if(!String(v?.insurerName||"").trim()) errors.push("Zuständiger Unfallversicherungsträger fehlt.");
    if(!v?.accidentReportSubmittedAt) errors.push("SGB VII §193: Unfallanzeige ist als übermittelt zu dokumentieren.");
    if(v?.worksCouncilExists===true&&!String(v?.worksCouncilAcknowledgedBy||"").trim()) errors.push("Kenntnisnahme eines Betriebs-/Personalratsmitglieds fehlt.");
    if(v?.sifaNotified!==true) errors.push("Fachkraft für Arbeitssicherheit ist noch nicht als informiert dokumentiert.");
    if(v?.occupationalDoctorNotified!==true) errors.push("Betriebsarzt ist noch nicht als informiert dokumentiert.");
    if(v?.authorityCopySent!==true) warnings.push("Durchschrift an zuständige Arbeitsschutzbehörde noch nicht bestätigt.");
  }
  return {valid:errors.length===0,errors,warnings,reportable,reportDeadline:reportable?addDaysIso(v?.knownAt||v?.eventAt,3):null,retentionUntil:addYearsIso(v?.eventAt,5)};
}

router.get("/accidents", requirePermission("safety:medical"), async (req:any,res)=>{
  const cid=cidOr403(req,res);if(!cid)return;const items=readAccidents(cid).map(x=>({...x,compliance:accidentCompliance(x)}));return res.json({ok:true,items});
});
router.post("/accidents", requirePermission("safety:medical"), async (req:any,res)=>{
  const cid=cidOr403(req,res);if(!cid)return;const b=req.body||{};const item={id:crypto.randomUUID(),projectId:String(b.projectId||"")||null,employeeName:String(b.employeeName||""),eventAt:b.eventAt||new Date().toISOString(),knownAt:b.knownAt||new Date().toISOString(),location:String(b.location||""),eventDescription:String(b.eventDescription||""),injuryDescription:String(b.injuryDescription||""),witnesses:String(b.witnesses||""),firstAidAt:b.firstAidAt||b.eventAt||new Date().toISOString(),firstAidMeasures:String(b.firstAidMeasures||""),firstAiderName:String(b.firstAiderName||""),doctorTreatment:Boolean(b.doctorTreatment),doctorName:String(b.doctorName||""),incapacityDays:Math.max(0,Number(b.incapacityDays||0)),fatal:Boolean(b.fatal),insurerName:String(b.insurerName||""),accidentReportSubmittedAt:b.accidentReportSubmittedAt||null,worksCouncilExists:Boolean(b.worksCouncilExists),worksCouncilAcknowledgedBy:String(b.worksCouncilAcknowledgedBy||""),sifaNotified:Boolean(b.sifaNotified),occupationalDoctorNotified:Boolean(b.occupationalDoctorNotified),authorityCopySent:Boolean(b.authorityCopySent),notes:String(b.notes||""),status:"OPEN",createdAt:new Date().toISOString(),evidenceLock:null};const rows=readAccidents(cid);rows.unshift(item);writeAccidents(cid,rows);return res.json({ok:true,item,compliance:accidentCompliance(item)});
});
router.put("/accidents/:id", requirePermission("safety:medical"), async (req:any,res)=>{
  const cid=cidOr403(req,res);if(!cid)return;const rows=readAccidents(cid);const idx=rows.findIndex(x=>String(x.id)===String(req.params.id));if(idx<0)return res.status(404).json({ok:false,error:"NOT_FOUND"});if(rows[idx].evidenceLock)return res.status(409).json({ok:false,error:"ACCIDENT_EVIDENCE_LOCKED",lock:rows[idx].evidenceLock});const item={...rows[idx],...req.body,id:rows[idx].id,updatedAt:new Date().toISOString()};const compliance=accidentCompliance(item);if(String(item.status||"").toUpperCase()==="FINAL"){if(!compliance.valid)return res.status(422).json({ok:false,error:"ACCIDENT_COMPLIANCE_INCOMPLETE",compliance});const lock={hash:crypto.createHash("sha256").update(safetyCanonical(item),"utf8").digest("hex"),lockedAt:new Date().toISOString(),lockedBy:String(req?.auth?.email||req?.auth?.sub||"").trim()||null,reason:"Erste-Hilfe-/Unfallnachweis abgeschlossen; 5 Jahre Aufbewahrung"};item.evidenceLock=lock;item.retentionUntil=compliance.retentionUntil;if(item.projectId){try{await archiveProjectBufferVersion({projectIdOrCode:item.projectId,filename:`Unfall_ErsteHilfe_${item.id}.json`,kind:"DOC",buffer:Buffer.from(JSON.stringify({item,compliance,lock},null,2),"utf8"),uploadedBy:lock.lockedBy,meta:{module:"SICHERHEIT",source:"accident-first-aid",recordId:item.id,evidenceHash:lock.hash,evidenceLocked:true,retentionUntil:compliance.retentionUntil,sensitiveHealthData:true}});}catch(e){console.error("[accident DMS]",e);}}}rows[idx]=item;writeAccidents(cid,rows);return res.json({ok:true,item,compliance});
});
router.delete("/accidents/:id", requirePermission("safety:medical"), async (req:any,res)=>{
  const cid=cidOr403(req,res);if(!cid)return;const rows=readAccidents(cid);const row=rows.find(x=>String(x.id)===String(req.params.id));if(!row)return res.status(404).json({ok:false,error:"NOT_FOUND"});if(row.evidenceLock)return res.status(409).json({ok:false,error:"ACCIDENT_EVIDENCE_LOCKED"});writeAccidents(cid,rows.filter(x=>String(x.id)!==String(req.params.id)));return res.json({ok:true});
});

router.get("/baustellv/:projectId", requireSafetyProjectAccess, async (req:any,res)=>{
  try{const cid=cidOr403(req,res);if(!cid)return;const token=String(req.params.projectId||"").trim();const project=await ensureSafetyProjectCompany(cid,token);if(!project)return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});const item=readBaustellv(cid,project.id)||{projectId:project.id,projectCode:project.code||"",projectName:project.name||"",siteLocation:"",clientName:"",clientAddress:"",projectType:"",responsibleThirdParty:"",coordinatorName:"",coordinatorAddress:"",plannedStart:"",plannedDurationDays:0,maxWorkers:0,employerCount:0,personDays:0,multipleEmployers:false,dangerousWork:false,selectedEmployers:[],priorNoticeSubmittedAt:null,priorNoticePosted:false,sigePlanExists:false,sigePlanUpdatedAt:null,laterWorksDocumentExists:false,status:"OPEN"};return res.json({ok:true,item,compliance:validateBaustellv(item),evidenceLock:safetyLock(cid,"BAUSTELLV",project.id)});}catch(e:any){return res.status(500).json({ok:false,error:e?.message||"BAUSTELLV_LOAD_FAILED"});}
});

router.put("/baustellv/:projectId", requireSafetyProjectAccess, async (req:any,res)=>{
  try{const cid=cidOr403(req,res);if(!cid)return;const token=String(req.params.projectId||"").trim();const project=await ensureSafetyProjectCompany(cid,token);if(!project)return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});const existingLock=safetyLock(cid,"BAUSTELLV",project.id);if(existingLock)return locked409(res,existingLock);const prev=readBaustellv(cid,project.id)||{};const incoming=req.body||{};const item={...prev,...incoming,projectId:project.id,projectCode:project.code||prev.projectCode||"",projectName:project.name||prev.projectName||"",updatedAt:new Date().toISOString()};const compliance=validateBaustellv(item);if(finalSafetyStatus(item.status)&&!compliance.valid)return res.status(422).json({ok:false,error:"BAUSTELLV_FINALIZE_VALIDATION_FAILED",compliance});const f=baustellvFile(cid,project.id);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(item,null,2),"utf8");fs.renameSync(t,f);let evidenceLock=null;if(finalSafetyStatus(item.status)){evidenceLock=await finalizeSafetyEntityEvidence({cid,entityType:"BAUSTELLV",entityId:project.id,snapshot:{item,compliance},projectId:project.id,req,reason:"BaustellV-Nachweis abgeschlossen; Inhalt gesperrt",filePrefix:"BaustellV"});}return res.json({ok:true,item,compliance,evidenceLock});}catch(e:any){return res.status(500).json({ok:false,error:e?.message||"BAUSTELLV_SAVE_FAILED"});}
});

async function safetyEntityExists(
  entityType: string,
  entityId: string,
  cid: string
) {
  if (entityType === "RISK") {
    return !!(await prisma.safetyRiskAssessment.findFirst({
      where: { id: entityId, companyId: cid },
      select: { id: true }
    }));
  }

  if (entityType === "INSPECTION") {
    return !!(await prisma.safetyInspection.findFirst({
      where: { id: entityId, companyId: cid },
      select: { id: true }
    }));
  }

  if (entityType === "PPE") {
    return !!(await prisma.safetyPpeRecord.findFirst({
      where: { id: entityId, companyId: cid },
      select: { id: true }
    }));
  }

  if (entityType === "PERMIT") {
    return !!(await prisma.safetyPermit.findFirst({
      where: { id: entityId, companyId: cid },
      select: { id: true }
    }));
  }

  return false;
}

router.get("/attachments/:entityType/:entityId", requireSafetyAttachmentAccess, async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const entityType = String(req.params.entityType || "").toUpperCase();
    const entityId = String(req.params.entityId || "");

    if (!(await safetyEntityExists(entityType, entityId, cid))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const items = await prisma.safetyAttachment.findMany({
      where: {
        companyId: cid,
        entityType,
        entityId
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "ATTACHMENTS_LOAD_FAILED"
    });
  }
});

async function requireSafetyAttachmentAccess(req:any,res:any,next:any){
  const cid=cidOr403(req,res); if(!cid) return;
  const entityType=String(req.params.entityType||"").toUpperCase();
  const entityId=String(req.params.entityId||"");
  if(!(await safetyEntityExists(entityType,entityId,cid))) return res.status(404).json({ok:false,error:"NOT_FOUND"});
  const projectId=await safetyEntityProjectId(entityType,entityId,cid);
  if(projectId && !(await canAccessSafetyProject(req,cid,projectId))) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  return next();
}

router.post(
  "/attachments/:entityType/:entityId",
  requireSafetyAttachmentAccess,
  upload.single("file"),
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const entityType = String(req.params.entityType || "").toUpperCase();
      const entityId = String(req.params.entityId || "");
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "FILE_REQUIRED"
        });
      }

      if (!(await safetyEntityExists(entityType, entityId, cid))) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND"
        });
      }

      const safeName = file.originalname.replace(
        /[^a-zA-Z0-9._-]+/g,
        "_"
      );

      const key =
        `companies/${cid}/safety/${entityType.toLowerCase()}/${entityId}/` +
        `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

      await storage.put({
        key,
        body: file.buffer,
        contentType: file.mimetype || "application/octet-stream"
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
            mime: file.mimetype || "application/octet-stream"
          }
      });

      const item = await prisma.safetyAttachment.create({
        data: {
          companyId: cid,
          entityType,
          entityId,
          storageId: stored.id,
          name: file.originalname,
          mime: file.mimetype || "application/octet-stream",
          size: file.size
        }
      });

      try {
        const projectId = await safetyEntityProjectId(
          entityType,
          entityId,
          cid
        );

        if (projectId) {
          await registerExistingStorageVersion({
            projectIdOrCode: projectId,
            filename: file.originalname,
            kind: dmsKindFromMime(
              file.mimetype || "application/octet-stream"
            ),
            storageId: stored.id,
            uploadedBy: req.auth?.sub || null,
            meta: {
              module: "SICHERHEIT",
              source: `safety-${entityType.toLowerCase()}`,
              entityType,
              entityId
            }
          });
        }
      } catch (dmsError) {
        console.error(
          "[Safety DMS] Anhang konnte nicht registriert werden",
          dmsError
        );
      }

      return res.json({ ok: true, item });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error: error?.message || "ATTACHMENT_UPLOAD_FAILED"
      });
    }
  }
);

router.get(
  "/attachments/:entityType/:entityId/:attachmentId/open",
  requireSafetyAttachmentAccess,
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const item = await prisma.safetyAttachment.findFirst({
        where: {
          id: String(req.params.attachmentId || ""),
          companyId: cid,
          entityType: String(req.params.entityType || "").toUpperCase(),
          entityId: String(req.params.entityId || "")
        },
        include: { storage: true }
      });

      if (!item) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const url = await presignGet(item.storage.key);

      return res.json({ ok: true, url });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error: error?.message || "ATTACHMENT_OPEN_FAILED"
      });
    }
  }
);

router.delete(
  "/attachments/:entityType/:entityId/:attachmentId",
  requireSafetyAttachmentAccess,
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const item = await prisma.safetyAttachment.findFirst({
        where: {
          id: String(req.params.attachmentId || ""),
          companyId: cid,
          entityType: String(req.params.entityType || "").toUpperCase(),
          entityId: String(req.params.entityId || "")
        }
      });

      if (!item) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      await prisma.safetyAttachment.delete({
        where: { id: item.id }
      });

      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error: error?.message || "ATTACHMENT_DELETE_FAILED"
      });
    }
  }
);

export default router;
