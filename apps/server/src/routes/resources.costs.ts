import {lockPlanningResource,assertPlanningCapacity} from '../services/planningCapacity';
import {PlanError} from '../domain/constructionPlan';
import { Router } from "express";
import {bookedMachineItems,machineCostReport} from "../services/machineCostSummary";
import {moneyText,usageDecimal} from "../domain/machineUsage";
import { InputError } from "../domain/officeAddons";
import { planningDate, planningRange, planningHours, planningNotes } from "../domain/resourcePlanning";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { storage } from "../storage/storageService";
import { bucket, presignGet } from "../lib/s3";
import { registerExistingStorageVersion, archiveProjectBufferVersion } from "../services/dmsArchive";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { rejectActiveContentUpload, signatureCheckedMemoryStorage } from "../lib/uploadSecurity";

import {maintenanceInput,machineDeadlines} from "../domain/machineMaintenance";
const router = Router();

const machineUpload = multer({
  storage: signatureCheckedMemoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: rejectActiveContentUpload
});

function machineDmsKind(mime: string) {
  const value = String(mime || "").toLowerCase();

  if (value === "application/pdf") return "PDF" as const;
  if (value.startsWith("image/")) return "IMAGE" as const;

  return "DOC" as const;
}


const materialUpload = multer({
  storage: signatureCheckedMemoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: rejectActiveContentUpload
});

function materialDmsKind(mime: string) {
  const value = String(mime || "").toLowerCase();

  if (value === "application/pdf") return "PDF" as const;
  if (value.startsWith("image/")) return "IMAGE" as const;

  return "DOC" as const;
}


function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function resourceUserId(req:any): string {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}
function resourceRole(req:any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}
function resourcePrivileged(req:any): boolean {
  return ["ADMIN","ADMINISTRATOR","BUCHHALTUNG"].includes(resourceRole(req));
}
function requireResourceWrite(req:any,res:any,next:any){
  if(!["ADMIN","ADMINISTRATOR","BAULEITER","CAPOCANTIERE","KALKULATOR","BUCHHALTUNG"].includes(resourceRole(req))){
    return res.status(403).json({ok:false,error:"RESOURCE_WRITE_FORBIDDEN"});
  }
  return next();
}
async function resolveResourceProject(req:any,cid:string,token:any){
  const value=String(token||"").trim();
  if(!value) return null;
  const uid=resourceUserId(req);
  if(!uid) return null;
  return prisma.project.findFirst({
    where:{
      companyId:cid,
      OR:[{id:value},{code:value}],
      ...(resourcePrivileged(req)?{}:{projectMembers:{some:{userId:uid}}})
    },
    select:{id:true,code:true}
  });
}
async function canonicalOptionalProject(req:any,cid:string,token:any){
  const value=String(token||"").trim();
  if(!value) return {ok:true,projectId:null};
  const project=await resolveResourceProject(req,cid,value);
  return project ? {ok:true,projectId:project.id} : {ok:false,projectId:null};
}

router.use((req:any,res:any,next:any)=>{
  if(req.method==="GET" || req.method==="HEAD") return next();
  return requireResourceWrite(req,res,next);
});

function cidOr403(req: any, res: any): string | null {
  const cid = companyId(req);
  if (!cid) {
    res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });
    return null;
  }
  return cid;
}

function machineInspectionFile(cid:string){const dir=path.join(COMPANIES_ROOT,cid,"machine-inspections");fs.mkdirSync(dir,{recursive:true});return path.join(dir,"records.json");}
function readMachineInspectionMeta(cid:string):Record<string,any>{try{const f=machineInspectionFile(cid);if(!fs.existsSync(f))return {};const v=JSON.parse(fs.readFileSync(f,"utf8"));return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return {};}}
function writeMachineInspectionMeta(cid:string,data:Record<string,any>){const f=machineInspectionFile(cid);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(data,null,2),"utf8");fs.renameSync(t,f);}
function machineInspectionCanonical(v:any){const sort=(x:any):any=>Array.isArray(x)?x.map(sort):(x&&typeof x==="object"?Object.keys(x).sort().reduce((a:any,k)=>{a[k]=sort(x[k]);return a;},{}):x);return JSON.stringify(sort(v));}
function inspectionMetaFromBody(b:any){return {
  isInspection:b?.isInspection===true,
  inspectionKind:String(b?.inspectionKind||"").trim(),
  equipmentIdentification:String(b?.equipmentIdentification||"").trim(),
  inspectionBasis:String(b?.inspectionBasis||"").trim(),
  inspectionScope:String(b?.inspectionScope||"").trim(),
  technicalMeasuresSuitable:b?.technicalMeasuresSuitable===true,
  organisationalMeasuresSuitable:b?.organisationalMeasuresSuitable===true,
  inspectionResult:String(b?.inspectionResult||"").trim(),
  inspectorQualifiedPerson:String(b?.inspectorQualifiedPerson||b?.technician||"").trim(),
  inspectorSignatureConfirmed:b?.inspectorSignatureConfirmed===true,
  approvedBody:String(b?.approvedBody||"").trim(),
  nextInspection:String(b?.nextInspection||b?.nextService||"").trim(),
  operatingLocation:String(b?.operatingLocation||"").trim(),
  overwachungsbeduerftigeAnlage:b?.overwachungsbeduerftigeAnlage===true,
};}
function validateMachineInspection(meta:any){const errors:string[]=[];if(!meta.isInspection)return {valid:true,errors};if(!meta.equipmentIdentification)errors.push("Anlagen-/Arbeitsmittelidentifikation fehlt.");if(!meta.inspectionKind)errors.push("Art der Prüfung fehlt.");if(!meta.inspectionBasis)errors.push("Prüfungsgrundlage fehlt.");if(!meta.inspectionScope)errors.push("Prüfumfang fehlt.");if(!meta.inspectionResult)errors.push("Prüfergebnis fehlt.");if(!meta.inspectorQualifiedPerson)errors.push("Name der zur Prüfung befähigten Person fehlt.");if(!meta.inspectorSignatureConfirmed)errors.push("Unterschrift/elektronische Signatur des Prüfers ist nicht bestätigt.");if(!meta.nextInspection)errors.push("Frist/Datum der nächsten Prüfung fehlt.");if(meta.overwachungsbeduerftigeAnlage&&(!meta.technicalMeasuresSuitable||!meta.organisationalMeasuresSuitable))errors.push("Eignung/Funktionsfähigkeit technischer und organisatorischer Maßnahmen ist nicht bestätigt.");return {valid:errors.length===0,errors};}

/* =========================================================
   MATERIAL
   ========================================================= */

router.get("/materials", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const requestedProject = String(req.query.projectId || "").trim();
  const projectAccess = await canonicalOptionalProject(req,cid,requestedProject);
  if(!projectAccess.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  const projectId = projectAccess.projectId;

  const items = await prisma.companyMaterial.findMany({
    where: {
      companyId: cid,
      active: true,
      ...(projectId ? { projectId } : {})
    },
    include: {
      moves: {
        orderBy: { date: "desc" }
      },
      materialAttachments: {
        orderBy: {
          createdAt: "desc"
        }
      }
    },
    orderBy: { name: "asc" }
  });

  res.json({
    ok: true,
    items: items.map((m: any) => ({
      ...m,
      priceNet: Number(m.priceNet || 0),
      moves: (m.moves || []).map((x: any) => ({
        ...x,
        dir: x.direction
      }))
    }))
  });
});

router.post("/materials", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const b = req.body || {};
  const projectAccess = await canonicalOptionalProject(req,cid,b.projectId);
  if(!projectAccess.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});

  const item = await prisma.companyMaterial.create({
    data: {
      companyId: cid,
      name: String(b.name || "Neuer Artikel"),
      code: String(b.code || "") || null,
      projectId: projectAccess.projectId,
      costCenter: String(b.costCenter || "") || null,
      location: String(b.location || "") || null,
      unit: String(b.unit || "Stk"),
      stock: Number(b.stock || 0),
      minStock: Number(b.minStock || 0),
      priceNet: Number(b.priceNet || 0),
      supplier: String(b.supplier || "") || null,
      attachments: Array.isArray(b.attachments) ? b.attachments : []
    }
  });

  res.json({ ok: true, item: { ...item, priceNet: Number(item.priceNet || 0) } });
});

router.put("/materials/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id);
  const b = req.body || {};

  const existing = await prisma.companyMaterial.findFirst({
    where: { id, companyId: cid }
  });

  if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  if(existing.projectId){
    const currentAccess=await canonicalOptionalProject(req,cid,existing.projectId);
    if(!currentAccess.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  }
  const targetProject = b.projectId !== undefined
    ? await canonicalOptionalProject(req,cid,b.projectId)
    : {ok:true,projectId:existing.projectId};
  if(!targetProject.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});

  const item = await prisma.companyMaterial.update({
    where: { id },
    data: {
      name: b.name !== undefined ? String(b.name) : undefined,
      code: b.code !== undefined ? String(b.code || "") || null : undefined,
      projectId: b.projectId !== undefined ? targetProject.projectId : undefined,
      costCenter: b.costCenter !== undefined ? String(b.costCenter || "") || null : undefined,
      location: b.location !== undefined ? String(b.location || "") || null : undefined,
      unit: b.unit !== undefined ? String(b.unit || "") || null : undefined,
      stock: b.stock !== undefined ? Number(b.stock || 0) : undefined,
      minStock: b.minStock !== undefined ? Number(b.minStock || 0) : undefined,
      priceNet: b.priceNet !== undefined ? Number(b.priceNet || 0) : undefined,
      supplier: b.supplier !== undefined ? String(b.supplier || "") || null : undefined,
      attachments: b.attachments !== undefined ? b.attachments : undefined
    }
  });

  res.json({ ok: true, item: { ...item, priceNet: Number(item.priceNet || 0) } });
});

router.delete("/materials/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id);

  await prisma.companyMaterial.updateMany({
    where: { id, companyId: cid },
    data: { active: false }
  });

  res.json({ ok: true });
});


async function requireMaterialBeforeUpload(req:any,res:any,next:any){
  const cid=cidOr403(req,res); if(!cid) return;
  const material=await prisma.companyMaterial.findFirst({where:{id:String(req.params.id||""),companyId:cid,active:true}});
  if(!material) return res.status(404).json({ok:false,error:"MATERIAL_NOT_FOUND"});
  if(material.projectId){
    const access=await canonicalOptionalProject(req,cid,material.projectId);
    if(!access.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  }
  req.resourceMaterial=material;
  return next();
}

router.post(
  "/materials/:id/attachments",
  requireMaterialBeforeUpload,
  materialUpload.single("file"),
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const materialId = String(req.params.id || "");
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "FILE_REQUIRED"
        });
      }

      const material = await prisma.companyMaterial.findFirst({
        where: {
          id: materialId,
          companyId: cid,
          active: true
        }
      });

      if (!material) {
        return res.status(404).json({
          ok: false,
          error: "MATERIAL_NOT_FOUND"
        });
      }

      const storageId = crypto.randomUUID();

      const filename = String(
        file.originalname || "document.bin"
      ).replace(/[^\w.\-]+/g, "_");

      const key =
        `companies/${cid}/materials/${materialId}/` +
        `${storageId}/${filename}`;

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
            sha256: crypto
              .createHash("sha256")
              .update(file.buffer)
              .digest("hex"),
            mime:
              file.mimetype ||
              "application/octet-stream"
          }
        });

        return tx.companyMaterialAttachment.create({
          data: {
            materialId,
            storageId,
            name: file.originalname || filename,
            mime:
              file.mimetype ||
              "application/octet-stream",
            size: file.size
          }
        });
      });

      if (material.projectId) {
        try {
          await registerExistingStorageVersion({
            projectIdOrCode: material.projectId,
            filename: file.originalname || filename,
            kind: materialDmsKind(
              file.mimetype ||
              "application/octet-stream"
            ),
            storageId,
            uploadedBy: req.auth?.sub || null,
            meta: {
              module: "MATERIAL",
              source: "material-attachment",
              materialId,
              materialName: material.name
            }
          });
        } catch (dmsError) {
          console.error(
            "[Material DMS] Anhang konnte nicht registriert werden",
            dmsError
          );
        }
      }

      return res.json({
        ok: true,
        item
      });
    } catch (error: any) {
      console.error(
        "POST material attachment failed",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "MATERIAL_ATTACHMENT_UPLOAD_FAILED"
      });
    }
  }
);

router.get(
  "/materials/:materialId/attachments/:attachmentId/open",
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const item =
        await prisma.companyMaterialAttachment.findFirst({
          where: {
            id: String(req.params.attachmentId || ""),
            materialId: String(req.params.materialId || ""),
            material: {
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
          error: "NOT_FOUND"
        });
      }

      const url = await presignGet(item.storage.key);

      return res.json({
        ok: true,
        url
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "MATERIAL_ATTACHMENT_OPEN_FAILED"
      });
    }
  }
);

router.delete(
  "/materials/:materialId/attachments/:attachmentId",
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const item =
      await prisma.companyMaterialAttachment.findFirst({
        where: {
          id: String(req.params.attachmentId || ""),
          materialId: String(req.params.materialId || ""),
          material: {
            companyId: cid,
            active: true
          }
        }
      });

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }

    await prisma.companyMaterialAttachment.delete({
      where: {
        id: item.id
      }
    });

    return res.json({
      ok: true
    });
  }
);

router.post("/materials/:id/moves", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id);
  const b = req.body || {};

  const material = await prisma.companyMaterial.findFirst({
    where: { id, companyId: cid, active: true }
  });

  if (!material) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

  if(material.projectId){
    const access=await canonicalOptionalProject(req,cid,material.projectId);
    if(!access.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  }
  const moveProject=await canonicalOptionalProject(req,cid,b.projectId || material.projectId);
  if(!moveProject.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});

  const direction = String(b.dir || b.direction || "").toUpperCase() === "OUT" ? "OUT" : "IN";
  const qty = Number(b.qty || 0);

  if (!(qty > 0)) {
    return res.status(400).json({ ok: false, error: "QTY_REQUIRED" });
  }

  const move = await prisma.companyMaterialMove.create({
    data: {
      materialId: id,
      projectId: moveProject.projectId,
      costCenter: String(b.costCenter || material.costCenter || "") || null,
      direction,
      qty,
      note: String(b.note || "") || null,
      date: b.date ? new Date(b.date) : new Date()
    }
  });

  const delta = direction === "IN" ? qty : -qty;

  await prisma.companyMaterial.update({
    where: { id },
    data: {
      stock: Math.max(0, Number(material.stock || 0) + delta)
    }
  });

  res.json({ ok: true, item: { ...move, dir: move.direction } });
});


/* =========================================================
   PURCHASE ORDERS
   ========================================================= */

router.use("/purchase-orders",async(req:any,res:any,next:any)=>{
 try{
  const cid=cidOr403(req,res);if(!cid)return;
  const parts=req.path.split("/").filter(Boolean);
  if(parts.length){
   const order=await prisma.companyPurchaseOrder.findFirst({where:{id:parts[0],companyId:cid}});
   if(!order)return res.status(404).json({ok:false,error:"ORDER_NOT_FOUND"});
   const originalProject=await canonicalOptionalProject(req,cid,order.projectId);
   if(!originalProject.ok)return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
   req.resourceOrder=order;req.resourceOrderProjectId=originalProject.projectId;
   if(req.method==="DELETE" && parts.length===1 && await prisma.deliveryReview.count({where:{orderId:order.id}}))return res.status(409).json({ok:false,error:"Bestellung ist mit Lieferscheinprüfungen verknüpft. Historie erhalten."});
  }
  const b=req.body||{};
  if(!["GET","HEAD","DELETE"].includes(req.method)){
   if((!parts.length&&req.method==="POST") || (parts.length===1&&req.method==="PUT"&&b.projectId!==undefined)){
    const target=await canonicalOptionalProject(req,cid,b.projectId);
    if(!target.ok)return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
    if(req.resourceOrder && target.projectId!==req.resourceOrderProjectId && await prisma.deliveryReview.count({where:{orderId:req.resourceOrder.id}}))return res.status(409).json({ok:false,error:"Verknüpfte Bestellung darf nicht in ein anderes Projekt verschoben werden."});
    b.projectId=target.projectId;
   }
   for(const key of ["orderDate","deliveryDate"])if(b[key])planningDate(b[key]);
   if(b.status!==undefined&&!['ENTWURF','BESTELLT','TEILGELIEFERT','GELIEFERT','STORNIERT'].includes(b.status))throw new InputError("Bestellstatus ungültig.");
   if(parts.includes("lines")){
    if(b.qty!==undefined){const v=String(b.qty).replace(",",".");if(!/^\d{1,9}(\.\d{1,6})?$/.test(v)||!(Number(v)>0))throw new InputError("Positive Bestellmenge erforderlich.");b.qty=Number(v);}
    if(b.priceNet!==undefined){const v=String(b.priceNet).replace(",",".");if(!/^\d{1,10}(\.\d{1,2})?$/.test(v))throw new InputError("Nettopreis mit maximal zwei Nachkommastellen erforderlich.");b.priceNet=Number(v);}
    if(b.materialId){const material=await prisma.companyMaterial.findFirst({where:{id:String(b.materialId),companyId:cid,active:true}});const materialProject=material?await canonicalOptionalProject(req,cid,material.projectId):{ok:false,projectId:null};if(!material || !materialProject.ok || (materialProject.projectId && materialProject.projectId!==req.resourceOrderProjectId))return res.status(403).json({ok:false,error:"MATERIAL_PROJECT_FORBIDDEN"});}
   }
  }
  next();
 }catch(e:any){if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});console.error("[purchase-order-access]",e?.code||e?.name);res.status(500).json({ok:false,error:"Bestellung konnte nicht geprüft werden."});}
});

router.get("/purchase-orders", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const visible=resourcePrivileged(req)?null:(await prisma.project.findMany({where:{companyId:cid,projectMembers:{some:{userId:resourceUserId(req)}}},select:{id:true,code:true}})).flatMap(p=>[p.id,p.code]);
  const items = await prisma.companyPurchaseOrder.findMany({
    where: { companyId: cid,...(visible?{OR:[{projectId:null},{projectId:{in:visible}}]}:{}) },
    include: {
      lines: {
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return res.json({
    ok: true,
    items: items.map((item: any) => ({
      ...item,
      lines: (item.lines || []).map((line: any) => ({
        ...line,
        priceNet: Number(line.priceNet || 0)
      }))
    }))
  });
});

router.post("/purchase-orders", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const b = req.body || {};

  const count = await prisma.companyPurchaseOrder.count({
    where: { companyId: cid }
  });

  const number =
    String(b.number || "").trim() ||
    `BEST-${String(count + 1).padStart(4, "0")}`;

  const item = await prisma.companyPurchaseOrder.create({
    data: {
      companyId: cid,
      number,
      supplier: String(b.supplier || "") || null,
      projectId: String(b.projectId || "") || null,
      costCenter: String(b.costCenter || "") || null,
      status: String(b.status || "ENTWURF"),
      orderDate: b.orderDate ? new Date(b.orderDate) : null,
      deliveryDate: b.deliveryDate ? new Date(b.deliveryDate) : null,
      notes: String(b.notes || "") || null
    },
    include: { lines: true }
  });

  return res.json({ ok: true, item });
});

router.put("/purchase-orders/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id || "");
  const b = req.body || {};

  const existing = await prisma.companyPurchaseOrder.findFirst({
    where: { id, companyId: cid }
  });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }

  try{
  const item = await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT id FROM "CompanyPurchaseOrder" WHERE id = $1 FOR UPDATE',id);
   const current=await tx.companyPurchaseOrder.findUnique({where:{id}});
   if(!current)throw new InputError("Bestellung nicht verfügbar.");
   const currentProject=await canonicalOptionalProject(req,cid,current.projectId);
   if(!currentProject.ok)throw new InputError("Projekt nicht verfügbar.");
   if(b.projectId!==undefined && b.projectId!==currentProject.projectId && await tx.deliveryReview.count({where:{orderId:id}}))throw new InputError("Verknüpfte Bestellung darf nicht verschoben werden.");
   return tx.companyPurchaseOrder.update({
    where: { id },
    data: {
      number:
        b.number !== undefined
          ? String(b.number || "")
          : undefined,

      supplier:
        b.supplier !== undefined
          ? String(b.supplier || "") || null
          : undefined,

      projectId:
        b.projectId !== undefined
          ? String(b.projectId || "") || null
          : undefined,

      costCenter:
        b.costCenter !== undefined
          ? String(b.costCenter || "") || null
          : undefined,

      status:
        b.status !== undefined
          ? String(b.status || "ENTWURF")
          : undefined,

      orderDate:
        b.orderDate !== undefined
          ? b.orderDate
            ? new Date(b.orderDate)
            : null
          : undefined,

      deliveryDate:
        b.deliveryDate !== undefined
          ? b.deliveryDate
            ? new Date(b.deliveryDate)
            : null
          : undefined,

      notes:
        b.notes !== undefined
          ? String(b.notes || "") || null
          : undefined
    }
  });
  });
  return res.json({ ok: true, item });
  }catch(e:any){return res.status(e instanceof InputError?409:500).json({ok:false,error:e instanceof InputError?e.message:"Bestellung konnte nicht gespeichert werden."});}
});

router.delete("/purchase-orders/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id || "");

  const existing = await prisma.companyPurchaseOrder.findFirst({
    where: { id, companyId: cid }
  });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }

  try{
   await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "CompanyPurchaseOrder" WHERE id = $1 FOR UPDATE',id);
    if(await tx.deliveryReview.count({where:{orderId:id}}))throw new Error("ORDER_LINKED");
    await tx.companyPurchaseOrder.delete({where:{id}});
   });
  }catch(e:any){if(e?.code==="P2003"||e?.message==="ORDER_LINKED")return res.status(409).json({ok:false,error:"Bestellung ist mit Lieferscheinprüfungen verknüpft."});return res.status(500).json({ok:false,error:"Bestellung konnte nicht gelöscht werden."});}

  return res.json({ ok: true });
});

router.post("/purchase-orders/:id/lines", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const orderId = String(req.params.id || "");
  const b = req.body || {};

  const order = await prisma.companyPurchaseOrder.findFirst({
    where: {
      id: orderId,
      companyId: cid
    }
  });

  if (!order) {
    return res.status(404).json({
      ok: false,
      error: "ORDER_NOT_FOUND"
    });
  }

  let material: any = null;

  if (b.materialId) {
    material = await prisma.companyMaterial.findFirst({
      where: {
        id: String(b.materialId),
        companyId: cid,
        active: true
      }
    });

    if (!material) {
      return res.status(404).json({
        ok: false,
        error: "MATERIAL_NOT_FOUND"
      });
    }
  }

  const item = await prisma.companyPurchaseOrderLine.create({
    data: {
      orderId,
      materialId: material?.id || null,
      code: String(b.code || material?.code || "") || null,
      name: String(b.name || material?.name || "Neue Position"),
      unit: String(b.unit || material?.unit || "") || null,
      qty: Number(b.qty || 1),
      priceNet: Number(
        b.priceNet !== undefined
          ? b.priceNet
          : material?.priceNet || 0
      )
    }
  });

  return res.json({
    ok: true,
    item: {
      ...item,
      priceNet: Number(item.priceNet || 0)
    }
  });
});

router.put(
  "/purchase-orders/:orderId/lines/:id",
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const orderId = String(req.params.orderId || "");
    const id = String(req.params.id || "");
    const b = req.body || {};

    const existing = await prisma.companyPurchaseOrderLine.findFirst({
      where: {
        id,
        orderId,
        order: {
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

    const item = await prisma.companyPurchaseOrderLine.update({
      where: { id },
      data: {
        code:
          b.code !== undefined
            ? String(b.code || "") || null
            : undefined,

        name:
          b.name !== undefined
            ? String(b.name || "")
            : undefined,

        unit:
          b.unit !== undefined
            ? String(b.unit || "") || null
            : undefined,

        qty:
          b.qty !== undefined
            ? Number(b.qty || 0)
            : undefined,

        priceNet:
          b.priceNet !== undefined
            ? Number(b.priceNet || 0)
            : undefined
      }
    });

    return res.json({
      ok: true,
      item: {
        ...item,
        priceNet: Number(item.priceNet || 0)
      }
    });
  }
);

router.delete(
  "/purchase-orders/:orderId/lines/:id",
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const orderId = String(req.params.orderId || "");
    const id = String(req.params.id || "");

    const existing = await prisma.companyPurchaseOrderLine.findFirst({
      where: {
        id,
        orderId,
        order: {
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

    await prisma.companyPurchaseOrderLine.delete({
      where: { id }
    });

    return res.json({ ok: true });
  }
);

/* =========================================================
   MACHINES
   ========================================================= */

router.get("/machines", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const projectId = String(req.query.projectId || "").trim();

  const items = await prisma.companyMachine.findMany({
    where: {
      companyId: cid,
      active: true,
      ...(projectId ? { projectId } : {})
    },
    include: {
      machineAttachments: {
        orderBy: {
          createdAt: "desc"
        }
      }
    },
    orderBy: { name: "asc" }
  });

  res.json({
    ok: true,
    items: items.map((m: any) => ({
      ...m,
      hourlyRate: Number(m.hourlyRate || 0)
    }))
  });
});

router.post("/machines", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const b = req.body || {};

  const item = await prisma.companyMachine.create({
    data: {
      companyId: cid,
      name: String(b.name || "Neue Maschine"),
      type: String(b.type || "") || null,
      serial: String(b.serial || "") || null,
      projectId: String(b.projectId || "") || null,
      costCenter: String(b.costCenter || "") || null,
      location: String(b.location || "") || null,
      status: String(b.status || "Betrieb"),
      hours: Number(b.hours || 0),
      hourlyRate: Number(b.hourlyRate || 0),
      lastService: b.lastService ? new Date(b.lastService) : null,
      serviceIntervalDays: Number(b.serviceIntervalDays || 180),
      nextService: b.nextService ? new Date(b.nextService) : null,
      maintenance: Array.isArray(b.maintenance) ? b.maintenance : [],
      attachments: Array.isArray(b.attachments) ? b.attachments : []
    }
  });

  res.json({ ok: true, item: { ...item, hourlyRate: Number(item.hourlyRate || 0) } });
});

router.put("/machines/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id);
  const b = req.body || {};

  const existing = await prisma.companyMachine.findFirst({
    where: { id, companyId: cid }
  });

  if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

  const item = await prisma.companyMachine.update({
    where: { id },
    data: {
      name: b.name !== undefined ? String(b.name) : undefined,
      type: b.type !== undefined ? String(b.type || "") || null : undefined,
      serial: b.serial !== undefined ? String(b.serial || "") || null : undefined,
      projectId: b.projectId !== undefined ? String(b.projectId || "") || null : undefined,
      costCenter: b.costCenter !== undefined ? String(b.costCenter || "") || null : undefined,
      location: b.location !== undefined ? String(b.location || "") || null : undefined,
      status: b.status !== undefined ? String(b.status || "Betrieb") : undefined,
      hours: b.hours !== undefined ? Number(b.hours || 0) : undefined,
      hourlyRate: b.hourlyRate !== undefined ? Number(b.hourlyRate || 0) : undefined,
      lastService: b.lastService !== undefined
        ? b.lastService ? new Date(b.lastService) : null
        : undefined,
      serviceIntervalDays: b.serviceIntervalDays !== undefined
        ? Number(b.serviceIntervalDays || 180)
        : undefined,
      nextService: b.nextService !== undefined
        ? b.nextService ? new Date(b.nextService) : null
        : undefined,
      maintenance: b.maintenance !== undefined ? b.maintenance : undefined,
      attachments: b.attachments !== undefined ? b.attachments : undefined
    }
  });

  res.json({ ok: true, item: { ...item, hourlyRate: Number(item.hourlyRate || 0) } });
});

router.delete("/machines/:id", async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  await prisma.companyMachine.updateMany({
    where: { id: String(req.params.id), companyId: cid },
    data: { active: false }
  });

  res.json({ ok: true });
});




async function requireMachineBeforeUpload(req:any,res:any,next:any){
  const cid=cidOr403(req,res); if(!cid) return;
  const machine=await prisma.companyMachine.findFirst({where:{id:String(req.params.id||""),companyId:cid,active:true}});
  if(!machine) return res.status(404).json({ok:false,error:"MACHINE_NOT_FOUND"});
  if(machine.projectId){
    const access=await canonicalOptionalProject(req,cid,machine.projectId);
    if(!access.ok) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  }
  req.resourceMachine=machine;
  return next();
}

router.post(
  "/machines/:id/attachments",
  requireMachineBeforeUpload,
  machineUpload.single("file"),
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const machineId = String(req.params.id || "");
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "FILE_REQUIRED"
        });
      }

      const machine = await prisma.companyMachine.findFirst({
        where: {
          id: machineId,
          companyId: cid,
          active: true
        }
      });

      if (!machine) {
        return res.status(404).json({
          ok: false,
          error: "MACHINE_NOT_FOUND"
        });
      }

      const storageId = crypto.randomUUID();

      const filename = String(
        file.originalname || "document.bin"
      ).replace(/[^\w.\-]+/g, "_");

      const key =
        `companies/${cid}/machines/${machineId}/` +
        `${storageId}/${filename}`;

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
            sha256: crypto
              .createHash("sha256")
              .update(file.buffer)
              .digest("hex"),
            mime:
              file.mimetype ||
              "application/octet-stream"
          }
        });

        return tx.companyMachineAttachment.create({
          data: {
            machineId,
            storageId,
            name: file.originalname || filename,
            mime:
              file.mimetype ||
              "application/octet-stream",
            size: file.size
          }
        });
      });

      if (machine.projectId) {
        try {
          await registerExistingStorageVersion({
            projectIdOrCode: machine.projectId,
            filename: file.originalname || filename,
            kind: machineDmsKind(
              file.mimetype ||
              "application/octet-stream"
            ),
            storageId,
            uploadedBy: req.auth?.sub || null,
            meta: {
              module: "MASCHINEN",
              source: "machine-attachment",
              machineId,
              machineName: machine.name
            }
          });
        } catch (dmsError) {
          console.error(
            "[Machine DMS] Anhang konnte nicht registriert werden",
            dmsError
          );
        }
      }

      return res.json({
        ok: true,
        item
      });
    } catch (error: any) {
      console.error(
        "POST machine attachment failed",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "MACHINE_ATTACHMENT_UPLOAD_FAILED"
      });
    }
  }
);

router.get(
  "/machines/:machineId/attachments/:attachmentId/open",
  async (req: any, res) => {
    try {
      const cid = cidOr403(req, res);
      if (!cid) return;

      const item =
        await prisma.companyMachineAttachment.findFirst({
          where: {
            id: String(req.params.attachmentId || ""),
            machineId: String(req.params.machineId || ""),
            machine: {
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
          error: "NOT_FOUND"
        });
      }

      const url = await presignGet(
        item.storage.key
      );

      return res.json({
        ok: true,
        url
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          "MACHINE_ATTACHMENT_OPEN_FAILED"
      });
    }
  }
);

router.delete(
  "/machines/:machineId/attachments/:attachmentId",
  async (req: any, res) => {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const item =
      await prisma.companyMachineAttachment.findFirst({
        where: {
          id: String(req.params.attachmentId || ""),
          machineId: String(req.params.machineId || ""),
          machine: {
            companyId: cid,
            active: true
          }
        }
      });

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }

    await prisma.companyMachineAttachment.delete({
      where: {
        id: item.id
      }
    });

    return res.json({
      ok: true
    });
  }
);

/* =========================================================
   MACHINE MAINTENANCE
   ========================================================= */


router.get("/machine-deadlines",planningHandler(async(req:any,res)=>{
 const cid=cidOr403(req,res);if(!cid)return;
 const filter=await maintenanceMachineVisibility(req,cid);
 const machines=await prisma.companyMachine.findMany({where:{companyId:cid,active:true,...filter},select:{id:true,name:true,serial:true,projectId:true,location:true,nextService:true},orderBy:{name:"asc"}});
 const records=await prisma.companyMachineMaintenance.findMany({where:{companyId:cid,machineId:{in:machines.map(m=>m.id)}}});
 res.json({ok:true,items:machineDeadlines(machines,records,await maintenanceReadMeta(cid,records.map(r=>r.id)))});
}));
router.get("/machine-maintenance/:id/history",planningHandler(async(req:any,res)=>{
 const cid=cidOr403(req,res);if(!cid)return;
 const row=await prisma.companyMachineMaintenance.findFirst({where:{id:req.params.id,companyId:cid}});
 if(!row||!await maintenanceMachineAllowed(req,cid,row.machineId))return res.status(404).json({ok:false,error:"NOT_FOUND"});
 const items=await prisma.auditLog.findMany({where:{companyId:cid,resource:"machine-maintenance:"+row.id},orderBy:{createdAt:"desc"},take:100,select:{id:true,action:true,createdAt:true,userId:true,meta:true}});
 res.json({ok:true,items});
}));
async function maintenanceReadMeta(cid:string,ids:string[]){
 const result=readMachineInspectionMeta(cid);
 if(!ids.length)return result;
 const events=await prisma.auditLog.findMany({where:{companyId:cid,resource:{in:ids.map(id=>"machine-maintenance:"+id)}},orderBy:{createdAt:"desc"},select:{resource:true,meta:true,createdAt:true,userId:true}});
 const seen=new Set<string>();
 for(const event of events){
  const id=String(event.resource).slice("machine-maintenance:".length);if(seen.has(id))continue;seen.add(id);
  const payload=event.meta as any;if(!payload?.inspection)continue;
  const completed=payload.inspection.isInspection&&payload.after?.status==="ERLEDIGT";
  result[id]={data:payload.inspection,lock:completed?(result[id]?.lock||{source:"AUDIT",lockedAt:event.createdAt.toISOString(),lockedBy:event.userId,reason:"Abgeschlossener Prüfeintrag im Änderungsverlauf"}):null};
 }
 return result;
}
async function maintenanceMachineVisibility(req:any,cid:string){
 if(resourcePrivileged(req))return {};
 const projects=await prisma.project.findMany({where:{companyId:cid,projectMembers:{some:{userId:resourceUserId(req)}}},select:{id:true,code:true}});
 return {OR:[{projectId:null},{projectId:""},{projectId:{in:projects.flatMap(p=>[p.id,p.code])}}]};
}
async function maintenanceMachineAllowed(req:any,cid:string,id:string){
 return prisma.companyMachine.findFirst({where:{id,companyId:cid,...await maintenanceMachineVisibility(req,cid)}});
}

router.get("/machine-maintenance", planningHandler(async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const machineId = String(req.query.machineId || "").trim();

  const items = await prisma.companyMachineMaintenance.findMany({
    where: {
      companyId: cid,
      machine:{companyId:cid,...await maintenanceMachineVisibility(req,cid)},
      ...(machineId ? { machineId } : {})
    },
    include: {
      machine: {
        select: {
          id: true,
          name: true,
          type: true,
          serial: true,
          projectId: true,
          location: true
        }
      }
    },
    orderBy: {
      date: "desc"
    }
  });

  return res.json({
    ok: true,
    items: await (async () => { const meta=await maintenanceReadMeta(cid,items.map(x=>x.id)); return items.map((item: any) => ({
      ...item,
      costNet: Number(item.costNet || 0),
      ...(meta[item.id]?.data || {}),
      evidenceLock: meta[item.id]?.lock || null
    })); })()
  });
}));

router.post("/machine-maintenance", planningHandler(async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const b = req.body || {};
  const machineId = String(b.machineId || "").trim();

  const machine = await prisma.companyMachine.findFirst({
    where: {
      id: machineId,
      companyId: cid,
      active: true
    }
  });

  if (!machine) {
    return res.status(404).json({
      ok: false,
      error: "MACHINE_NOT_FOUND"
    });
  }

  if(!await maintenanceMachineAllowed(req,cid,machineId))return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  const validated=maintenanceInput({...b,hours:b.hours===undefined?machine.hours:b.hours});
  const inspectionMeta=inspectionMetaFromBody(b);
  if(inspectionMeta.isInspection)maintenanceInput({...b,nextService:inspectionMeta.nextInspection});
  if(inspectionMeta.isInspection && String(b.status||"ERLEDIGT").toUpperCase()==="ERLEDIGT"){const check=validateMachineInspection(inspectionMeta);if(!check.valid)return res.status(422).json({ok:false,error:"BETRSICHV_INSPECTION_INCOMPLETE",errors:check.errors});}

  const item=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "CompanyMachine" WHERE id=$1 FOR UPDATE',machineId);
    const current=await tx.companyMachine.findUnique({where:{id:machineId}});
    const row=await tx.companyMachineMaintenance.create({data:{companyId:cid,machineId,...validated}});
    if(row.status==="ERLEDIGT"&&(!current?.lastService||row.date>=current.lastService))await tx.companyMachine.update({where:{id:machineId},data:{lastService:row.date,...(row.nextService?{nextService:row.nextService}:{})}});
    await tx.auditLog.create({data:{companyId:cid,userId:resourceUserId(req),action:"MACHINE_MAINTENANCE_CREATE",resource:"machine-maintenance:"+row.id,meta:{after:JSON.parse(JSON.stringify(row)),inspection:inspectionMeta}}});return row;
  });

  let evidenceLock:any=null;
  const allMeta=readMachineInspectionMeta(cid);
  if(inspectionMeta.isInspection){
    if(String(item.status||"").toUpperCase()==="ERLEDIGT"){const snapshot={maintenance:item,machine:{id:machine.id,name:machine.name,serial:machine.serial,type:machine.type},inspection:inspectionMeta};const hash=crypto.createHash("sha256").update(machineInspectionCanonical(snapshot),"utf8").digest("hex");evidenceLock={hash,lockedAt:new Date().toISOString(),lockedBy:String(req?.auth?.email||req?.auth?.sub||"").trim()||null,reason:"BetrSichV-Prüfnachweis abgeschlossen"};allMeta[item.id]={data:inspectionMeta,lock:evidenceLock};if(machine.projectId){try{await archiveProjectBufferVersion({projectIdOrCode:machine.projectId,filename:`Maschinenpruefung_${item.id}.json`,kind:"DOC",buffer:Buffer.from(JSON.stringify({snapshot,evidenceLock},null,2),"utf8"),uploadedBy:evidenceLock.lockedBy,meta:{module:"MASCHINEN",source:"betrsichv-inspection",maintenanceId:item.id,evidenceHash:hash,evidenceLocked:true}});}catch(e){console.error("[machine inspection DMS]",e);}}}else{allMeta[item.id]={data:inspectionMeta,lock:null};}
    writeMachineInspectionMeta(cid,allMeta);
  }

  return res.json({
    ok: true,
    item: {
      ...item,
      costNet: Number(item.costNet || 0),
      ...inspectionMeta,
      evidenceLock
    }
  });
}));

router.put("/machine-maintenance/:id", planningHandler(async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id || "");
  const b = req.body || {};

  const existing =
    await prisma.companyMachineMaintenance.findFirst({
      where: {
        id,
        companyId: cid
      }
    });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  if(!await maintenanceMachineAllowed(req,cid,existing.machineId))return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  if(b.machineId!==undefined&&b.machineId!==existing.machineId)throw new InputError("Gerät eines Wartungsdatensatzes kann nicht gewechselt werden.");
  const validated=maintenanceInput(b,existing);
  const allInspectionMeta=readMachineInspectionMeta(cid);
  if(allInspectionMeta[id]?.lock)return res.status(409).json({ok:false,error:"BETRSICHV_EVIDENCE_LOCKED",lock:allInspectionMeta[id].lock});
  const inspectionMeta=inspectionMetaFromBody({...allInspectionMeta[id]?.data,...b});
  if(inspectionMeta.isInspection)maintenanceInput({...b,nextService:inspectionMeta.nextInspection},existing);
  if(inspectionMeta.isInspection && String(b.status??existing.status??"").toUpperCase()==="ERLEDIGT"){const check=validateMachineInspection(inspectionMeta);if(!check.valid)return res.status(422).json({ok:false,error:"BETRSICHV_INSPECTION_INCOMPLETE",errors:check.errors});}

  const item=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "CompanyMachineMaintenance" WHERE id=$1 FOR UPDATE',id);
    const current=await tx.companyMachineMaintenance.findUnique({where:{id}});
    if(!current||current.updatedAt.getTime()!==existing.updatedAt.getTime()||(b.expectedUpdatedAt!==undefined&&b.expectedUpdatedAt!==current.updatedAt.toISOString()))throw new Error("MAINTENANCE_CONFLICT");
    const evidence=await tx.auditLog.findFirst({where:{companyId:cid,resource:"machine-maintenance:"+id},orderBy:{createdAt:"desc"},select:{meta:true}});
    if((evidence?.meta as any)?.inspection?.isInspection&&(evidence?.meta as any)?.after?.status==="ERLEDIGT")throw new Error("MAINTENANCE_EVIDENCE_LOCKED");
    if(current.status==="ERLEDIGT"&&validated.status!=="ERLEDIGT")throw new InputError("Abgeschlossene Wartung kann nicht als geplant zurückgesetzt werden.");
    const row=await tx.companyMachineMaintenance.update({where:{id},data:{...validated,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});
    await tx.$queryRawUnsafe('SELECT id FROM "CompanyMachine" WHERE id=$1 FOR UPDATE',row.machineId);
    const m=await tx.companyMachine.findUnique({where:{id:row.machineId}});
    if(row.status==="ERLEDIGT"&&(!m?.lastService||row.date>=m.lastService))await tx.companyMachine.update({where:{id:row.machineId},data:{lastService:row.date,...(row.nextService||b.nextService!==undefined?{nextService:row.nextService}:{})}});
    await tx.auditLog.create({data:{companyId:cid,userId:resourceUserId(req),action:"MACHINE_MAINTENANCE_UPDATE",resource:"machine-maintenance:"+row.id,meta:{before:JSON.parse(JSON.stringify(current)),after:JSON.parse(JSON.stringify(row)),inspection:inspectionMeta}}});return row;
  });

  let evidenceLock:any=null;
  if(inspectionMeta.isInspection){
    const machine=await prisma.companyMachine.findFirst({where:{id:item.machineId,companyId:cid}});
    if(String(item.status||"").toUpperCase()==="ERLEDIGT"){const snapshot={maintenance:item,machine,inspection:inspectionMeta};const hash=crypto.createHash("sha256").update(machineInspectionCanonical(snapshot),"utf8").digest("hex");evidenceLock={hash,lockedAt:new Date().toISOString(),lockedBy:String(req?.auth?.email||req?.auth?.sub||"").trim()||null,reason:"BetrSichV-Prüfnachweis abgeschlossen"};allInspectionMeta[id]={data:inspectionMeta,lock:evidenceLock};if(machine?.projectId){try{await archiveProjectBufferVersion({projectIdOrCode:machine.projectId,filename:`Maschinenpruefung_${id}.json`,kind:"DOC",buffer:Buffer.from(JSON.stringify({snapshot,evidenceLock},null,2),"utf8"),uploadedBy:evidenceLock.lockedBy,meta:{module:"MASCHINEN",source:"betrsichv-inspection",maintenanceId:id,evidenceHash:hash,evidenceLocked:true}});}catch(e){console.error("[machine inspection DMS]",e);}}}else allInspectionMeta[id]={data:inspectionMeta,lock:null};
    writeMachineInspectionMeta(cid,allInspectionMeta);
  }
  return res.json({
    ok: true,
    item: {
      ...item,
      costNet: Number(item.costNet || 0),
      ...inspectionMeta,
      evidenceLock
    }
  });
}));

router.delete("/machine-maintenance/:id", planningHandler(async (req: any, res) => {
  const cid = cidOr403(req, res);
  if (!cid) return;

  const id = String(req.params.id || "");

  const existing =
    await prisma.companyMachineMaintenance.findFirst({
      where: {
        id,
        companyId: cid
      }
    });

  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  }
  if(!await maintenanceMachineAllowed(req,cid,existing.machineId))return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  if(existing.status==="ERLEDIGT")return res.status(409).json({ok:false,error:"COMPLETED_MAINTENANCE_RETAINED"});
  const inspectionMeta=readMachineInspectionMeta(cid);
  if(inspectionMeta[id]?.lock)return res.status(409).json({ok:false,error:"BETRSICHV_EVIDENCE_LOCKED",lock:inspectionMeta[id].lock});

  await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "CompanyMachineMaintenance" WHERE id=$1 FOR UPDATE',id);
    const current=await tx.companyMachineMaintenance.findUnique({where:{id}});
    if(!current||current.updatedAt.getTime()!==existing.updatedAt.getTime())throw new Error("MAINTENANCE_CONFLICT");
    if(current.status==="ERLEDIGT")throw new Error("MAINTENANCE_EVIDENCE_LOCKED");
    await tx.companyMachineMaintenance.delete({where:{id}});
    await tx.auditLog.create({data:{companyId:cid,userId:resourceUserId(req),action:"MACHINE_MAINTENANCE_DELETE",resource:"machine-maintenance:"+id,meta:{before:JSON.parse(JSON.stringify(current))}}});
  });

  return res.json({ ok: true });
}));


/* =========================================================
   MACHINE COSTS
   ========================================================= */

router.get("/machine-costs", planningHandler(async(req:any,res)=>{
  const cid=cidOr403(req,res);if(!cid)return;
  const token=String(req.query.projectId || "").trim();
  const p=await canonicalOptionalProject(req,cid,token);
  if(!p.ok)return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  let projectIds:string[]|undefined=p.projectId?[p.projectId]:undefined;
  if(!projectIds && !resourcePrivileged(req)){
    const projects=await prisma.project.findMany({where:{companyId:cid,projectMembers:{some:{userId:resourceUserId(req)}}},select:{id:true}});
    projectIds=projects.map(x=>x.id);
  }
  const date=req.query.from!==undefined || req.query.to!==undefined?planningRange(req.query.from,req.query.to):undefined;
  return res.json({ok:true,...await machineCostReport(cid,projectIds,date)});
}));

/* =========================================================
   EINSATZPLANUNG
   ========================================================= */

async function assignmentVisibility(req:any,cid:string) {
  if(resourcePrivileged(req)) return {};
  const uid=resourceUserId(req);
  if(!uid) return {id:{in:[] as string[]}};
  const projects=await prisma.project.findMany({
    where:{companyId:cid,projectMembers:{some:{userId:uid}}},select:{id:true}
  });
  return {OR:[{projectId:null},{projectId:{in:projects.map(p=>p.id)}}]};
}
function planningHandler(fn:(req:any,res:any)=>Promise<any>) {
  return (req:any,res:any,next:any)=>Promise.resolve(fn(req,res)).catch(error=>{
    if(error?.message==="MAINTENANCE_EVIDENCE_LOCKED")return res.status(409).json({ok:false,error:"BETRSICHV_EVIDENCE_LOCKED"});
    if(error?.message==="MAINTENANCE_CONFLICT")return res.status(409).json({ok:false,error:"MAINTENANCE_CONFLICT",message:"Wartung wurde geändert. Bitte neu laden."});
    if(error?.message==="PLANNING_CONFLICT")return res.status(409).json({ok:false,error:"PLANNING_CONFLICT",message:"Einsatz wurde geändert. Bitte neu laden."});
    if(error?.code==='P2002')return res.status(409).json({ok:false,error:'PLANNING_CONFLICT'});
    if(error instanceof PlanError)return res.status(error.status).json({ok:false,error:error.message});
    if(error instanceof InputError) return res.status(400).json({ok:false,error:"INVALID_PLANNING_INPUT",message:error.message});
    return next(error);
  });
}

router.get("/assignments", planningHandler(async (req:any,res) => {
  const cid=cidOr403(req,res);if(!cid)return;
  const date=planningRange(req.query.from,req.query.to);
  const visibility=await assignmentVisibility(req,cid);
  const items=await prisma.resourceAssignment.findMany({
    where:{companyId:cid,...visibility,date},orderBy:[{date:"asc"},{resourceType:"asc"}]
  });
  return res.json({ok:true,items:items.map(item=>({...item,date:item.date.toISOString().slice(0,10)}))});
}));

router.post("/assignments", planningHandler(async (req:any,res) => {
  const cid=cidOr403(req,res);if(!cid)return;
  const b=req.body||{};
  const resourceType=String(b.resourceType||"").toUpperCase(),resourceId=String(b.resourceId||"").trim();
  if(!["EMPLOYEE","MACHINE"].includes(resourceType))return res.status(400).json({ok:false,error:"INVALID_RESOURCE_TYPE"});
  if(!resourceId)return res.status(400).json({ok:false,error:"RESOURCE_AND_DATE_REQUIRED"});
  const date=planningDate(b.date),hours=planningHours(b.hours),notes=planningNotes(b.notes);
  const project=await canonicalOptionalProject(req,cid,b.projectId);
  if(!project.ok)return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  const exists=resourceType==="EMPLOYEE"
    ? await prisma.companyEmployee.findFirst({where:{id:resourceId,companyId:cid,active:true}})
    : await prisma.companyMachine.findFirst({where:{id:resourceId,companyId:cid,active:true}});
  if(!exists)return res.status(404).json({ok:false,error:"RESOURCE_NOT_FOUND"});
  const requestId=typeof b.id==="string" && /^new-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id)?b.id.slice(4):undefined;
  const data={companyId:cid,resourceType,resourceId,date:new Date(date+"T12:00:00.000Z"),projectId:project.projectId,hours,notes};
  const item=await prisma.$transaction(async tx=>{
    await lockPlanningResource(tx,cid,resourceType,resourceId);
    if(requestId){const existing=await tx.resourceAssignment.findFirst({where:{id:requestId,companyId:cid}});if(existing){if(existing.resourceType!==resourceType||existing.resourceId!==resourceId||existing.projectId!==project.projectId||existing.date.getTime()!==data.date.getTime()||existing.hours!==hours||existing.notes!==notes)throw new Error('PLANNING_CONFLICT');return existing;}}
    await assertPlanningCapacity(tx,cid,resourceType,resourceId,data.date,hours);
    const item=await tx.resourceAssignment.create({data:{...data,...(requestId?{id:requestId}:{})}});
    await tx.auditLog.create({data:{companyId:cid,userId:resourceUserId(req),action:'RESOURCE_ASSIGNMENT_CREATE',resource:'resource-assignment:'+item.id,meta:JSON.parse(JSON.stringify({after:item}))}});return item;
  });
  return res.json({ok:true,item:{...item,date:item.date.toISOString().slice(0,10)}});
}));

router.put("/assignments/:id", planningHandler(async (req:any,res) => {
  const cid=cidOr403(req,res);if(!cid)return;
  const id=String(req.params.id||""),b=req.body||{};
  const visibility=await assignmentVisibility(req,cid);
  const existing=await prisma.resourceAssignment.findFirst({where:{id,companyId:cid,...visibility}});
  if(!existing)return res.status(404).json({ok:false,error:"NOT_FOUND"});
  const target=b.projectId!==undefined?await canonicalOptionalProject(req,cid,b.projectId):{ok:true,projectId:existing.projectId};
  if(!target.ok)return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
  const hours=b.hours!==undefined?planningHours(b.hours):undefined;
  const notes=b.notes!==undefined?planningNotes(b.notes):undefined;
  if(b.updatedAt!==undefined && b.updatedAt!==existing.updatedAt.toISOString())throw new Error("PLANNING_CONFLICT");
  const item=await prisma.$transaction(async tx=>{
    await lockPlanningResource(tx,cid,existing.resourceType,existing.resourceId);
    const current=await tx.resourceAssignment.findFirst({where:{id,companyId:cid,...visibility}});if(!current||current.updatedAt.getTime()!==existing.updatedAt.getTime())throw new Error('PLANNING_CONFLICT');
    await assertPlanningCapacity(tx,cid,current.resourceType,current.resourceId,current.date,hours===undefined?current.hours:hours,id);
    const item=await tx.resourceAssignment.update({where:{id},data:{projectId:b.projectId!==undefined?target.projectId:undefined,hours,notes,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});
    await tx.auditLog.create({data:{companyId:cid,userId:resourceUserId(req),action:'RESOURCE_ASSIGNMENT_UPDATE',resource:'resource-assignment:'+id,meta:JSON.parse(JSON.stringify({before:current,after:item}))}});return item;
  });
  return res.json({ok:true,item:{...item,date:item.date.toISOString().slice(0,10)}});
}));

router.delete("/assignments/week", planningHandler(async (req:any,res) => {
  const cid=cidOr403(req,res);if(!cid)return;
  const date=planningRange(req.query.from,req.query.to);
  const visibility=await assignmentVisibility(req,cid);
  const result=await prisma.resourceAssignment.deleteMany({where:{companyId:cid,...visibility,date}});
  return res.json({ok:true,deleted:result.count});
}));

router.delete("/assignments/:id", planningHandler(async (req:any,res) => {
  const cid=cidOr403(req,res);if(!cid)return;
  const visibility=await assignmentVisibility(req,cid);
  const result=await prisma.resourceAssignment.deleteMany({where:{id:String(req.params.id||""),companyId:cid,...visibility}});
  if(!result.count)return res.status(404).json({ok:false,error:"NOT_FOUND"});
  return res.json({ok:true});
}));

/* =========================================================
   COST SUMMARY
   ========================================================= */

router.get("/summary", async (req: any, res) => {
  try {
    const cid = cidOr403(req, res);
    if (!cid) return;

    const projectToken = String(req.query.projectId || "").trim();
    if (!projectToken) {
      return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
    }
    const projectAccess=await canonicalOptionalProject(req,cid,projectToken);
    if(!projectAccess.ok || !projectAccess.projectId) return res.status(403).json({ok:false,error:"PROJECT_FORBIDDEN"});
    const projectId=projectAccess.projectId;

    const materials = await prisma.companyMaterial.findMany({
      where: { companyId: cid, projectId, active: true },
      include: { moves: true }
    });

    const machineItems = await bookedMachineItems(cid,[projectId]);

    const materialItems = materials.flatMap((m: any) =>
      (m.moves || [])
        .filter((move: any) => String(move.direction).toUpperCase() === "OUT")
        .map((move: any) => ({
          id: move.id,
          name: m.name,
          date: move.date,
          qty: Number(move.qty || 0),
          priceNet: Number(m.priceNet || 0),
          costCenter: String(move.costCenter || m.costCenter || "").trim(),
          amount: Number(move.qty || 0) * Number(m.priceNet || 0)
        }))
    );

    const materialCost = materialItems.reduce(
      (sum: number, x: any) => sum + x.amount,
      0
    );

    const machineCost = Number(moneyText(machineItems.reduce((sum,x)=>sum+usageDecimal(x.amount,"Betrag",12),0n)));

    const byCostCenter: Record<string, number> = {};

    for (const item of [...materialItems, ...machineItems]) {
      const key = item.costCenter || "OHNE_KOSTENSTELLE";
      byCostCenter[key] = (byCostCenter[key] || 0) + Number(item.amount || 0);
    }

    res.json({
      ok: true,
      projectId,
      materialCost,
      machineCost,
      totalResourceCost: materialCost + machineCost,
      byCostCenter,
      materialItems,
      machineItems,
      machineCostSource:"BOOKED_MACHINE_USAGE"
    });
  } catch (e: any) {
    console.error("resource summary failed", e);
    res.status(500).json({
      ok: false,
      error: e?.message || "RESOURCE_COSTS_FAILED"
    });
  }
});

export default router;
