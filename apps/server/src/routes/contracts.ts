import { Router } from "express";
import { prisma } from "../lib/prisma";
import crypto from "crypto";

const router = Router();

router.use((req: any, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER"].includes(role)) {
    return res.status(403).json({ ok: false, error: "CONTRACT_WRITE_FORBIDDEN" });
  }
  return next();
});

function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function userId(req: any) {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function contractAdmin(req: any) {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  return role === "ADMIN" || role === "ADMINISTRATOR";
}

async function resolveProject(cid: string, input: string, req?: any) {
  const value = String(input || "").trim();

  if (!value) return null;

  return prisma.project.findFirst({
    where: {
      companyId: cid,
      OR: [
        { id: value },
        { code: value }
      ],
      ...(req && !contractAdmin(req) ? { projectMembers: { some: { userId: userId(req) } } } : {})
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });
}

function dateValue(value: any) {
  if (!value) return null;

  const d = new Date(String(value));

  return Number.isNaN(d.getTime())
    ? null
    : d;
}

function tagsValue(value: any): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function dto(row: any) {
  return {
    ...row,
    valueNet: Number(row.valueNet || 0)
  };
}

function normalizedStatus(value:any){return String(value||"Entwurf").trim();}
function isDraftContract(value:any){return normalizedStatus(value).toLowerCase()==="entwurf";}
function isArchivedContract(value:any){return normalizedStatus(value).toLowerCase()==="archiviert";}
function contractCanonical(row:any){const c={...row};for(const k of ["updatedAt","createdAt","document","subcontracts"])delete c[k];return JSON.stringify(Object.keys(c).sort().reduce((a:any,k)=>{a[k]=c[k];return a;},{}));}
function contractRetentionUntil(value:any){const d=new Date(value||Date.now());const y=(Number.isNaN(d.getTime())?new Date():d).getUTCFullYear()+10;return new Date(Date.UTC(y,11,31,23,59,59,999)).toISOString();}
async function protectContractDocument(documentId:string|undefined|null, contract:any){
  if(!documentId)return;
  const doc=await prisma.document.findUnique({where:{id:documentId},select:{id:true,meta:true}});
  if(!doc)return;
  const meta:any=(doc.meta&&typeof doc.meta==="object"&&!Array.isArray(doc.meta))?doc.meta:{};
  const retentionUntil=contractRetentionUntil(contract?.endDate||contract?.updatedAt||new Date());
  const evidenceHash=crypto.createHash("sha256").update(contractCanonical(contract),"utf8").digest("hex");
  await prisma.document.update({where:{id:doc.id},data:{meta:{...meta,retentionLocked:true,retentionUntil,retentionReason:"Vertragsunterlage – revisionssichere Aufbewahrung",retentionCategory:"CONTRACT_10Y",contractId:contract.id,contractNumber:contract.contractNumber||null,evidenceLocked:true,evidenceHash}}});
}

router.get("/", async (req: any, res) => {
  try {
    const cid = companyId(req);

    if (!cid) {
      return res.status(403).json({
        ok: false,
        error: "COMPANY_REQUIRED"
      });
    }

    const projectInput = String(
      req.query.projectId ||
      req.query.projectCode ||
      ""
    ).trim();

    const project = projectInput
      ? await resolveProject(cid, projectInput, req)
      : null;

    if (projectInput && !project) {
      return res.status(404).json({
        ok: false,
        error: "PROJECT_NOT_FOUND"
      });
    }

    const uid = userId(req);
    if (!uid) return res.status(403).json({ ok: false, error: "USER_REQUIRED" });
    const items = await prisma.contract.findMany({
      where: {
        companyId: cid,
        ...(project ? { projectId: project.id } : {}),
        ...(contractAdmin(req) ? {} : { project: { projectMembers: { some: { userId: uid } } } })
      },
      include: {
        document: {
          include: {
            versions: {
              orderBy: {
                version: "desc"
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return res.json({
      ok: true,
      items: items.map(dto)
    });
  } catch (error: any) {
    console.error("GET /api/contracts failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "CONTRACT_LIST_FAILED"
    });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const cid = companyId(req);

    if (!cid) {
      return res.status(403).json({
        ok: false,
        error: "COMPANY_REQUIRED"
      });
    }

    const body = req.body || {};

    const project = await resolveProject(
      cid,
      String(body.projectId || body.projectCode || ""),
      req
    );

    if (!project) {
      return res.status(400).json({
        ok: false,
        error: "PROJECT_REQUIRED"
      });
    }

    const contractType = String(body.contractType || "Bauvertrag");
    const requestedParentId = String(body.parentContractId || "").trim();
    let parentContractId: string | null = null;

    if (contractType === "Unterauftrag") {
      if (!requestedParentId) {
        return res.status(400).json({ ok: false, error: "HAUPTAUFTRAG_REQUIRED" });
      }
      const parent = await prisma.contract.findFirst({
        where: {
          id: requestedParentId,
          companyId: cid,
          projectId: project.id,
          contractType: "Hauptauftrag"
        },
        select: { id: true }
      });
      if (!parent) {
        return res.status(400).json({ ok: false, error: "HAUPTAUFTRAG_NOT_FOUND" });
      }
      parentContractId = parent.id;
    }

    const item = await prisma.contract.create({
      data: {
        companyId: cid,
        projectId: project.id,
        parentContractId,
        
        title:
          String(body.title || "").trim() ||
          "Neuer Vertrag",
        contractNumber:
          String(body.contractNumber || "").trim() || null,
        partner:
          String(body.partner || "").trim() || null,
        contractType,
        status:
          String(body.status || "Entwurf"),
        valueNet:
          Number(body.valueNet || 0),
        startDate:
          dateValue(body.startDate),
        endDate:
          dateValue(body.endDate),
        cancellationDays:
          Number(body.cancellationDays ?? 30),
        notes:
          String(body.notes || "").trim() || null,
        tags:
          tagsValue(body.tags)
      }
    });

    return res.json({
      ok: true,
      item: dto(item)
    });
  } catch (error: any) {
    console.error("POST /api/contracts failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "CONTRACT_CREATE_FAILED"
    });
  }
});

router.put("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "").trim();

    if (!cid) {
      return res.status(403).json({
        ok: false,
        error: "COMPANY_REQUIRED"
      });
    }

    const existing = await prisma.contract.findFirst({
      where: {
        id,
        companyId: cid,
        ...(contractAdmin(req) ? {} : { project: { projectMembers: { some: { userId: userId(req) } } } })
      }
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }

    const body = req.body || {};
    if (body.documentId !== undefined && String(body.documentId || "").trim()) {
      const document = await prisma.document.findFirst({
        where: {
          id: String(body.documentId).trim(),
          projectId: existing.projectId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!document) {
        return res.status(400).json({ ok: false, error: "DOCUMENT_NOT_IN_PROJECT" });
      }
    }
    if (!isDraftContract(existing.status)) {
      const requestedStatus = body.status !== undefined ? normalizedStatus(body.status) : normalizedStatus(existing.status);
      const onlyArchive = isArchivedContract(requestedStatus) && Object.keys(body).every((key) => ["status"].includes(key));
      if (!onlyArchive) {
        return res.status(409).json({ ok:false, error:"CONTRACT_LOCKED", message:"Nicht mehr im Entwurf befindliche Verträge sind unveränderlich. Änderungen als neue Vertragsfassung/Nachtrag dokumentieren." });
      }
    }

    const item = await prisma.contract.update({
      where: { id },
      data: {
        title:
          body.title !== undefined
            ? String(body.title || "").trim() || "Neuer Vertrag"
            : undefined,

        contractNumber:
          body.contractNumber !== undefined
            ? String(body.contractNumber || "").trim() || null
            : undefined,

        partner:
          body.partner !== undefined
            ? String(body.partner || "").trim() || null
            : undefined,

        contractType:
          body.contractType !== undefined
            ? String(body.contractType || "Bauvertrag")
            : undefined,

        status:
          body.status !== undefined
            ? String(body.status || "Entwurf")
            : undefined,

        valueNet:
          body.valueNet !== undefined
            ? Number(body.valueNet || 0)
            : undefined,

        startDate:
          body.startDate !== undefined
            ? dateValue(body.startDate)
            : undefined,

        endDate:
          body.endDate !== undefined
            ? dateValue(body.endDate)
            : undefined,

        cancellationDays:
          body.cancellationDays !== undefined
            ? Number(body.cancellationDays || 0)
            : undefined,

        notes:
          body.notes !== undefined
            ? String(body.notes || "").trim() || null
            : undefined,

        tags:
          body.tags !== undefined
            ? tagsValue(body.tags)
            : undefined,

        documentId:
          body.documentId !== undefined
            ? String(body.documentId || "").trim() || null
            : undefined
      }
    });

    if (!isDraftContract(item.status)) await protectContractDocument(item.documentId, item);
    return res.json({
      ok: true,
      item: dto(item)
    });
  } catch (error: any) {
    console.error("PUT /api/contracts/:id failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "CONTRACT_UPDATE_FAILED"
    });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "").trim();

    if (!cid) {
      return res.status(403).json({
        ok: false,
        error: "COMPANY_REQUIRED"
      });
    }

    const existing = await prisma.contract.findFirst({
      where: {
        id,
        companyId: cid,
        ...(contractAdmin(req) ? {} : { project: { projectMembers: { some: { userId: userId(req) } } } })
      }
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }

    if (!isDraftContract(existing.status)) {
      return res.status(409).json({ ok:false, error:"CONTRACT_LOCKED", message:"Aktive, unterzeichnete oder abgeschlossene Verträge dürfen nicht gelöscht werden. Status auf Archiviert setzen." });
    }
    if (existing.documentId) {
      const doc=await prisma.document.findUnique({where:{id:existing.documentId},select:{meta:true}});
      const meta:any=doc?.meta||{};
      if(meta?.retentionLocked===true) return res.status(409).json({ok:false,error:"LEGAL_RETENTION_LOCK",message:"Der verknüpfte Vertragsnachweis unterliegt einer Aufbewahrungssperre."});
    }
    await prisma.contract.delete({
      where: { id }
    });

    return res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "P2003") return res.status(409).json({ ok: false, error: "CONTRACT_REFERENCED", message: "Der Vertrag ist mit Bürgschaften, Nachweisen oder weiteren Unterlagen verknüpft. Bitte archivieren statt löschen." });
    console.error("DELETE /api/contracts/:id failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "CONTRACT_DELETE_FAILED"
    });
  }
});

router.post("/:id/document", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "").trim();
    const documentId = String(req.body?.documentId || "").trim();

    if (!cid) {
      return res.status(403).json({
        ok: false,
        error: "COMPANY_REQUIRED"
      });
    }

    if (!documentId) {
      return res.status(400).json({
        ok: false,
        error: "DOCUMENT_REQUIRED"
      });
    }

    const contract = await prisma.contract.findFirst({
      where: {
        id,
        companyId: cid,
        ...(contractAdmin(req) ? {} : { project: { projectMembers: { some: { userId: userId(req) } } } })
      }
    });

    if (!contract) {
      return res.status(404).json({
        ok: false,
        error: "CONTRACT_NOT_FOUND"
      });
    }

    if (!isDraftContract(contract.status) && contract.documentId && contract.documentId !== documentId) {
      return res.status(409).json({ok:false,error:"CONTRACT_LOCKED",message:"Der Vertragsnachweis eines freigegebenen Vertrags darf nicht ausgetauscht werden."});
    }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        projectId: contract.projectId,
        deletedAt: null
      }
    });

    if (!document) {
      return res.status(404).json({
        ok: false,
        error: "DOCUMENT_NOT_FOUND"
      });
    }

    const item = await prisma.contract.update({
      where: { id },
      data: {
        documentId
      }
    });

    if (!isDraftContract(item.status)) await protectContractDocument(item.documentId, item);
    return res.json({
      ok: true,
      item: dto(item)
    });
  } catch (error: any) {
    console.error("POST /api/contracts/:id/document failed", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "CONTRACT_DOCUMENT_LINK_FAILED"
    });
  }
});

export default router;
