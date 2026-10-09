import { Router } from "express";
import { prisma } from "../lib/prisma";

import nonWorkingDays from "./nonWorkingDays";
import {NON_WORKING_DAY,ARCHIVED_NON_WORKING_DAY} from "../domain/nonWorkingDay";
const router = Router();
router.use("/non-working-days",nonWorkingDays);
const protectedType=(type:any)=>[NON_WORKING_DAY,ARCHIVED_NON_WORKING_DAY].includes(type);

function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function userId(req:any){
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function isAdmin(req:any){
  const role=String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  return role==="ADMIN" || role==="ADMINISTRATOR";
}

function requireCompanyWideCalendarAdmin(req:any,res:any): boolean {
  if (isAdmin(req)) return true;
  res.status(403).json({ok:false,error:"CALENDAR_COMPANY_EVENT_ADMIN_REQUIRED"});
  return false;
}

async function canAccessProject(req:any,cid:string,projectId:string){
  if(isAdmin(req)) return true;
  const uid=userId(req);
  if(!uid) return false;
  return Boolean(await prisma.project.findFirst({
    where:{id:projectId,companyId:cid,projectMembers:{some:{userId:uid}}},
    select:{id:true}
  }));
}

function list(value: any): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

async function resolveProject(req:any, cid: string, value: any) {
  const v = String(value || "").trim();

  if (!v) return null;

  return prisma.project.findFirst({
    where: {
      companyId: cid,
      OR: [
        { id: v },
        { code: v }
      ],
      ...(isAdmin(req) ? {} : { projectMembers: { some: { userId: userId(req) } } })
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });
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

    const projectValue = String(req.query.projectId || "").trim();
    const project = projectValue
      ? await resolveProject(req, cid, projectValue)
      : null;

    if (projectValue && !project) {
      return res.status(404).json({
        ok: false,
        error: "PROJECT_NOT_FOUND"
      });
    }

    const rangeStart = req.query.rangeStart
      ? new Date(String(req.query.rangeStart))
      : null;

    const rangeEnd = req.query.rangeEnd
      ? new Date(String(req.query.rangeEnd))
      : null;

    const where: any = {
      companyId: cid,
      AND: [{OR:[{sourceType:null},{sourceType:{not:ARCHIVED_NON_WORKING_DAY}}]}]
    };

    if (project) {
      where.OR = [{projectId:project.id},{projectId:null,sourceType:NON_WORKING_DAY}];
    } else if (!isAdmin(req)) {
      const uid=userId(req);
      if(!uid) return res.status(403).json({ok:false,error:"USER_REQUIRED"});
      const projects=await prisma.project.findMany({
        where:{companyId:cid,projectMembers:{some:{userId:uid}}},
        select:{id:true}
      });
      where.OR=[
        {projectId:null},
        {projectId:{in:projects.map((x)=>x.id)}}
      ];
    }

    if (rangeStart && !Number.isNaN(rangeStart.getTime())) {
      where.end = {
        gt: rangeStart
      };
    }

    if (rangeEnd && !Number.isNaN(rangeEnd.getTime())) {
      where.start = {
        ...(where.start || {}),
        lt: rangeEnd
      };
    }

    const items = await prisma.officeCalendarEvent.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      },
      orderBy: [
        { start: "asc" },
        { title: "asc" }
      ]
    });

    return res.json({
      ok: true,
      items
    });
  } catch (e: any) {
    console.error("GET /api/calendar failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CALENDAR_LIST_FAILED"
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

    if(protectedType(req.body?.sourceType)) return res.status(409).json({ok:false,error:"Ruhetage über die Feiertage-Verwaltung bearbeiten."});
    const title = String(req.body?.title || "").trim();
    const start = new Date(req.body?.start);
    const end = new Date(req.body?.end);

    if (!title) {
      return res.status(400).json({
        ok: false,
        error: "TITLE_REQUIRED"
      });
    }

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end.getTime() < start.getTime()
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DATE_RANGE"
      });
    }

    const project = req.body?.projectId
      ? await resolveProject(req, cid, req.body.projectId)
      : null;

    if (!req.body?.projectId && !requireCompanyWideCalendarAdmin(req, res)) return;

    if (req.body?.projectId && !project) {
      return res.status(404).json({
        ok: false,
        error: "PROJECT_NOT_FOUND"
      });
    }

    const item = await prisma.officeCalendarEvent.create({
      data: {
        companyId: cid,
        projectId: project?.id || null,
        title,
        start,
        end,
        allDay: Boolean(req.body?.allDay),
        location: String(req.body?.location || "") || null,
        attendees: list(req.body?.attendees),
        notes: String(req.body?.notes || "") || null,
        category: String(req.body?.category || "") || null,
        busyStatus: String(req.body?.busyStatus || "busy"),
        reminderMinutes:
          req.body?.reminderMinutes === null
            ? null
            : Number(req.body?.reminderMinutes ?? 15),
        source: String(req.body?.source || "RLC"),
        sourceType: String(req.body?.sourceType || "") || null,
        sourceId: String(req.body?.sourceId || "") || null
      }
    });

    return res.json({
      ok: true,
      item
    });
  } catch (e: any) {
    console.error("POST /api/calendar failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CALENDAR_CREATE_FAILED"
    });
  }
});

router.put("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.officeCalendarEvent.findFirst({
      where: {
        id,
        companyId: cid
      }
    });

    if (!current) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }
    if(protectedType(current.sourceType)||protectedType(req.body?.sourceType)) return res.status(409).json({ok:false,error:"Ruhetage über die Feiertage-Verwaltung bearbeiten."});
    if (!current.projectId && !requireCompanyWideCalendarAdmin(req, res)) return;
    if (current.projectId && !(await canAccessProject(req,cid,current.projectId))) {
      return res.status(404).json({ok:false,error:"NOT_FOUND"});
    }

    let projectId: string | null | undefined = undefined;

    if (req.body?.projectId !== undefined) {
      if (!req.body.projectId) {
        if (!requireCompanyWideCalendarAdmin(req, res)) return;
        projectId = null;
      } else {
        const project = await resolveProject(req, cid, req.body.projectId);

        if (!project) {
          return res.status(404).json({
            ok: false,
            error: "PROJECT_NOT_FOUND"
          });
        }

        projectId = project.id;
      }
    }

    const start =
      req.body?.start !== undefined
        ? new Date(req.body.start)
        : current.start;

    const end =
      req.body?.end !== undefined
        ? new Date(req.body.end)
        : current.end;

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end.getTime() < start.getTime()
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DATE_RANGE"
      });
    }

    const item = await prisma.officeCalendarEvent.update({
      where: { id },
      data: {
        projectId,
        title:
          req.body?.title !== undefined
            ? String(req.body.title || "").trim()
            : undefined,
        start:
          req.body?.start !== undefined
            ? start
            : undefined,
        end:
          req.body?.end !== undefined
            ? end
            : undefined,
        allDay:
          req.body?.allDay !== undefined
            ? Boolean(req.body.allDay)
            : undefined,
        location:
          req.body?.location !== undefined
            ? String(req.body.location || "") || null
            : undefined,
        attendees:
          req.body?.attendees !== undefined
            ? list(req.body.attendees)
            : undefined,
        notes:
          req.body?.notes !== undefined
            ? String(req.body.notes || "") || null
            : undefined,
        category:
          req.body?.category !== undefined
            ? String(req.body.category || "") || null
            : undefined,
        busyStatus:
          req.body?.busyStatus !== undefined
            ? String(req.body.busyStatus || "busy")
            : undefined,
        sourceType:
          req.body?.sourceType !== undefined
            ? String(req.body.sourceType || "") || null
            : undefined,
        sourceId:
          req.body?.sourceId !== undefined
            ? String(req.body.sourceId || "") || null
            : undefined,
        reminderMinutes:
          req.body?.reminderMinutes !== undefined
            ? (
              req.body.reminderMinutes === null
                ? null
                : Number(req.body.reminderMinutes)
            )
            : undefined
      }
    });

    return res.json({
      ok: true,
      item
    });
  } catch (e: any) {
    console.error("PUT /api/calendar/:id failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CALENDAR_UPDATE_FAILED"
    });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.officeCalendarEvent.findFirst({
      where: {
        id,
        companyId: cid
      }
    });

    if (!current) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      });
    }
    if(protectedType(current.sourceType)||protectedType(req.body?.sourceType)) return res.status(409).json({ok:false,error:"Ruhetage über die Feiertage-Verwaltung bearbeiten."});
    if (!current.projectId && !requireCompanyWideCalendarAdmin(req, res)) return;
    if (current.projectId && !(await canAccessProject(req,cid,current.projectId))) {
      return res.status(404).json({ok:false,error:"NOT_FOUND"});
    }

    await prisma.officeCalendarEvent.delete({
      where: { id }
    });

    return res.json({
      ok: true
    });
  } catch (e: any) {
    console.error("DELETE /api/calendar/:id failed", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "CALENDAR_DELETE_FAILED"
    });
  }
});

export default router;
