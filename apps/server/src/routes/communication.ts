import { Router } from "express";
import { prisma } from "../lib/prisma";

function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function userId(req: any) {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function isAdmin(req: any) {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  return role === "ADMIN" || role === "ADMINISTRATOR";
}

async function projectForCompany(req: any, cid: string, input: any) {
  const value = String(input || "").trim();
  if (!value) return null;
  const uid = userId(req);
  if (!uid) return null;

  return prisma.project.findFirst({
    where: {
      companyId: cid,
      OR: [{ id: value }, { code: value }],
      ...(isAdmin(req) ? {} : { members: { some: { userId: uid } } })
    },
    select: { id: true }
  });
}

async function canAccessProject(req: any, cid: string, projectId: string) {
  const uid = userId(req);
  if (!uid) return false;
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      companyId: cid,
      ...(isAdmin(req) ? {} : { members: { some: { userId: uid } } })
    },
    select: { id: true }
  });
  return Boolean(project);
}

function tags(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((x) => String(x || "").trim()).filter(Boolean)
  ));
}


const router = Router();

router.get("/", async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });

    const project = await projectForCompany(req, cid, req.query.projectId);
    if (!project) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });

    const items = await prisma.communicationThread.findMany({
      where: { companyId: cid, projectId: project.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        attachments: {
          include: {
            document: {
              include: {
                versions: { orderBy: { version: "desc" } }
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return res.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /api/communication failed", e);
    return res.status(500).json({ ok: false, error: e?.message || "COMMUNICATION_LIST_FAILED" });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const cid = companyId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "COMPANY_REQUIRED" });

    const project = await projectForCompany(req, cid, req.body?.projectId);
    if (!project) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });

    const item = await prisma.communicationThread.create({
      data: {
        companyId: cid,
        projectId: project.id,
        subject: String(req.body?.subject || ""),
        participants: tags(req.body?.participants)
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "COMMUNICATION_CREATE_FAILED" });
  }
});

router.put("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.communicationThread.findFirst({
      where: { id, companyId: cid }
    });

    if (!current || !(await canAccessProject(req, cid, current.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const item = await prisma.communicationThread.update({
      where: { id },
      data: {
        subject: req.body?.subject !== undefined ? String(req.body.subject || "") : undefined,
        participants: req.body?.participants !== undefined ? tags(req.body.participants) : undefined,
        unreadCount: req.body?.unreadCount !== undefined ? Number(req.body.unreadCount || 0) : undefined
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "COMMUNICATION_UPDATE_FAILED" });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.communicationThread.findFirst({
      where: { id, companyId: cid }
    });

    if (!current || !(await canAccessProject(req, cid, current.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const [messageCount, attachments] = await Promise.all([
      prisma.communicationMessage.count({ where: { threadId: id } }),
      prisma.communicationAttachment.findMany({
        where: { threadId: id },
        include: { document: { select: { id: true, name: true, meta: true } } }
      })
    ]);

    if (messageCount > 0 || attachments.length > 0) {
      return res.status(409).json({
        ok: false,
        error: "COMMUNICATION_NOT_EMPTY",
        message: "Kommunikationsvorgänge mit Nachrichten oder Dokumenten dürfen nicht destruktiv gelöscht werden. Aufbewahrung und Löschung müssen über die Dokument-/Datenschutzregeln erfolgen.",
        messageCount,
        attachmentCount: attachments.length
      });
    }

    await prisma.communicationThread.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "COMMUNICATION_DELETE_FAILED" });
  }
});

router.post("/:id/messages", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const thread = await prisma.communicationThread.findFirst({
      where: { id, companyId: cid }
    });

    if (!thread || !(await canAccessProject(req, cid, thread.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ ok: false, error: "BODY_REQUIRED" });
    if (body.length > 20000) return res.status(413).json({ ok: false, error: "MESSAGE_TOO_LARGE" });
    const sender = String(req?.auth?.email || req?.auth?.sub || req?.auth?.userId || "").trim();
    if (!sender) return res.status(403).json({ ok: false, error: "USER_REQUIRED" });

    const item = await prisma.communicationMessage.create({
      data: {
        threadId: id,
        fromName: sender,
        toList: tags(req.body?.toList),
        ccList: tags(req.body?.ccList),
        subject: String(req.body?.subject || thread.subject || "").slice(0, 500) || null,
        body
      }
    });

    await prisma.communicationThread.update({
      where: { id },
      data: {
        subject: String(req.body?.subject || thread.subject || "").slice(0, 500),
        participants: tags([
          ...(thread.participants || []),
          ...(Array.isArray(req.body?.toList) ? req.body.toList : []),
          ...(Array.isArray(req.body?.ccList) ? req.body.ccList : [])
        ])
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "MESSAGE_CREATE_FAILED" });
  }
});

router.post("/:id/attachments", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");
    const documentId = String(req.body?.documentId || "").trim();

    const thread = await prisma.communicationThread.findFirst({
      where: { id, companyId: cid }
    });

    if (!thread || !(await canAccessProject(req, cid, thread.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        projectId: thread.projectId,
        deletedAt: null
      }
    });

    if (!document) return res.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND" });

    const item = await prisma.communicationAttachment.create({
      data: {
        threadId: id,
        documentId,
        name: String(req.body?.name || document.name)
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "ATTACHMENT_CREATE_FAILED" });
  }
});

export default router;
