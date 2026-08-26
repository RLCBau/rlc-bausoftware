import { Router } from "express";
import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "../lib/prisma";
import { bucket, presignGet, s3 } from "../lib/s3";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import {
  requireActiveSubscription,
  requireCloudEnabled,
  requireCompany,
} from "../middleware/guards";

const router = Router();

const PROJECT_ROLES = new Set([
  "ADMIN",
  "BAULEITER",
  "CAPOCANTIERE",
  "MITARBEITER",
  "KALKULATOR",
  "BUCHHALTUNG",
  "GAST",
]);

function cloudObjectId(key: string) {
  return `object:${Buffer.from(key, "utf8").toString("base64url")}`;
}

function objectKeyFromCloudId(value: string) {
  try {
    const raw = String(value || "");
    if (!raw.startsWith("object:")) return null;
    return Buffer.from(raw.slice("object:".length), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function isCloudDownloadFile(key: string) {
  return /\.(pdf|jpg|jpeg|png|heic|webp|doc|docx|xls|xlsx|csv|dxf|dwg|ifc|zip)$/i.test(key);
}

async function listProjectBucketFiles(projectCode: string) {
  if (!s3) return [];

  const prefix = `projects/${String(projectCode || "").trim()}/`;
  const files: Array<{ key: string; size: string; updatedAt: string }> = [];
  let token: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    for (const item of page.Contents || []) {
      const key = String(item.Key || "");
      if (!key || !isCloudDownloadFile(key)) continue;

      files.push({
        key,
        size: String(item.Size || 0),
        updatedAt: item.LastModified
          ? item.LastModified.toISOString()
          : new Date(0).toISOString(),
      });
    }

    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return files;
}
router.use(
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireActiveSubscription,
  requireCloudEnabled
);

function companyIdFrom(req: any) {
  return String(req?.auth?.companyId || req?.auth?.company || "").trim();
}

function isAdminRole(role: unknown) {
  return ["ADMIN", "BAULEITER"].includes(
    String(role || "").trim().toUpperCase()
  );
}

async function currentCompanyMember(req: any) {
  const companyId = companyIdFrom(req);
  const userId = String(req?.auth?.sub || "").trim();

  if (!companyId || !userId) {
    const error: any = new Error("CLOUD_AUTH_REQUIRED");
    error.status = 401;
    throw error;
  }

  const member = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { id: true, role: true, active: true },
  });

  if (!member?.active) {
    const error: any = new Error("CLOUD_MEMBER_NOT_ACTIVE");
    error.status = 403;
    throw error;
  }

  return {
    companyId,
    userId,
    isAdmin: isAdminRole(req?.auth?.role) || isAdminRole(member.role),
    role: String(member.role),
  };
}

async function requireCloudAdmin(req: any, res: any, next: any) {
  try {
    const member = await currentCompanyMember(req);
    if (!member.isAdmin) {
      return res.status(403).json({
        ok: false,
        error: "Nur Firmen-Administratoren dürfen Cloud-Rechte ändern",
        code: "CLOUD_ADMIN_REQUIRED",
      });
    }

    req.cloudMember = member;
    return next();
  } catch (error: any) {
    return res.status(Number(error?.status) || 403).json({
      ok: false,
      error: String(error?.message || "CLOUD_ACCESS_DENIED"),
    });
  }
}

async function projectAccess(req: any, projectIdRaw: string) {
  const member = await currentCompanyMember(req);
  const projectId = String(projectIdRaw || "").trim();

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: member.companyId },
    select: {
      id: true,
      code: true,
      name: true,
      client: true,
      place: true,
      status: true,
      createdAt: true,
    },
  });

  if (!project) {
    const error: any = new Error("CLOUD_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  if (!member.isAdmin) {
    const access = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: member.userId } },
      select: { id: true, canDownload: true },
    });

    if (!access) {
      const error: any = new Error("CLOUD_PROJECT_ACCESS_DENIED");
      error.status = 403;
      throw error;
    }

    return { member, project, canDownload: Boolean(access.canDownload) };
  }

  return { member, project, canDownload: true };
}

router.get("/me", async (req: any, res) => {
  try {
    const member = await currentCompanyMember(req);

    const allowedProjectIds = member.isAdmin
      ? null
      : (
          await prisma.projectMember.findMany({
            where: {
              userId: member.userId,
              project: { companyId: member.companyId },
            },
            select: { projectId: true },
          })
        ).map((entry) => entry.projectId);

    const [company, subscription, members, projects, submissions] =
      await Promise.all([
        prisma.company.findUnique({
          where: { id: member.companyId },
          select: { id: true, name: true, code: true },
        }),
        prisma.companySubscription.findUnique({
          where: { companyId: member.companyId },
          select: {
            cloudEnabled: true,
            status: true,
            webSeatsPurchased: true,
            mobileSeatsPurchased: true,
          },
        }),
        prisma.companyMember.findMany({
          where: { companyId: member.companyId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            role: true,
            active: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.project.findMany({
          where: {
            companyId: member.companyId,
            ...(allowedProjectIds ? { id: { in: allowedProjectIds } } : {}),
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            code: true,
            name: true,
            client: true,
            place: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.projectSubmission.findMany({
          where: {
            companyId: member.companyId,
            ...(allowedProjectIds ? { projectId: { in: allowedProjectIds } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            source: true,
            kind: true,
            title: true,
            createdAt: true,
            project: { select: { id: true, code: true, name: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ]);

    return res.json({
      ok: true,
      company,
      subscription,
      currentUserId: member.userId,
      isCompanyAdmin: member.isAdmin,
      members,
      projects,
      submissions,
    });
  } catch (error: any) {
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(error?.message || "Cloud-Daten konnten nicht geladen werden"),
    });
  }
});

router.get("/projects/:projectId", async (req: any, res) => {
  try {
    const access = await projectAccess(req, req.params.projectId);

    const documents = await prisma.document.findMany({
      where: { projectId: access.project.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        current: {
          include: { storage: true },
        },
      },
    });

    const bucketFiles = await listProjectBucketFiles(access.project.code);
    const availableKeys = new Set(bucketFiles.map((file) => file.key));

    const registeredDocuments = documents
      .filter(
        (document) =>
          document.current &&
          (!s3 || availableKeys.has(document.current.storage.key))
      )
      .map((document) => ({
        id: document.id,
        name: document.name,
        kind: document.kind,
        updatedAt: document.updatedAt.toISOString(),
        versionId: document.current!.id,
        size: String(document.current!.storage.size),
        mime: document.current!.storage.mime,
      }));

    const registeredKeys = new Set(
      documents
        .filter((document) => document.current)
        .map((document) => document.current!.storage.key)
    );

    const directBucketFiles = bucketFiles
      .filter((file) => !registeredKeys.has(file.key))
      .map((file) => ({
        id: cloudObjectId(file.key),
        name: file.key.split("/").pop() || file.key,
        kind: "DATEI",
        updatedAt: file.updatedAt,
        versionId: "",
        size: file.size,
        mime: "application/octet-stream",
      }));

    return res.json({
      ok: true,
      project: access.project,
      canDownload: access.canDownload,
      documents: [...registeredDocuments, ...directBucketFiles],
    });  } catch (error: any) {
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(error?.message || "Projekt konnte nicht geladen werden"),
    });
  }
});

router.get(
  "/projects/:projectId/documents/:documentId/download",
  async (req: any, res) => {
    try {
      const access = await projectAccess(req, req.params.projectId);

      if (!access.canDownload) {
        return res.status(403).json({
          ok: false,
          error: "Download ist für dieses Projekt nicht freigegeben",
          code: "CLOUD_DOWNLOAD_DENIED",
        });
      }

      const directObjectKey = objectKeyFromCloudId(
        String(req.params.documentId || "")
      );

      if (directObjectKey) {
        const allowedPrefix = `projects/${access.project.code}/`;

        if (!directObjectKey.startsWith(allowedPrefix) || !s3) {
          return res.status(404).json({
            ok: false,
            error: "Datei nicht gefunden",
          });
        }

        try {
          await s3.send(
            new HeadObjectCommand({ Bucket: bucket, Key: directObjectKey })
          );
        } catch {
          return res.status(410).json({
            ok: false,
            error: "Datei ist nicht mehr im Cloud-Speicher vorhanden",
          });
        }

        return res.json({
          ok: true,
          filename: directObjectKey.split("/").pop() || "download",
          downloadUrl: await presignGet(directObjectKey),
        });
      }
      const document = await prisma.document.findFirst({
        where: {
          id: String(req.params.documentId || ""),
          projectId: access.project.id,
          deletedAt: null,
        },
        include: {
          current: {
            include: { storage: true },
          },
        },
      });

      if (!document?.current?.storage) {
        return res.status(404).json({
          ok: false,
          error: "Dokument nicht gefunden",
        });
      }

      const downloadUrl = await presignGet(document.current.storage.key);
      return res.json({
        ok: true,
        filename: document.name,
        downloadUrl,
      });
    } catch (error: any) {
      return res.status(Number(error?.status) || 500).json({
        ok: false,
        error: String(error?.message || "Download konnte nicht vorbereitet werden"),
      });
    }
  }
);

router.get(
  "/projects/:projectId/members",
  requireCloudAdmin,
  async (req: any, res) => {
    try {
      const projectId = String(req.params.projectId || "").trim();
      const companyId = String(req.cloudMember.companyId);

      const project = await prisma.project.findFirst({
        where: { id: projectId, companyId },
        select: { id: true },
      });

      if (!project) {
        return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });
      }

      const [members, assignments] = await Promise.all([
        prisma.companyMember.findMany({
          where: { companyId },
          orderBy: { createdAt: "asc" },
          select: {
            userId: true,
            role: true,
            active: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.projectMember.findMany({
          where: { projectId },
          select: { userId: true, role: true, canDownload: true },
        }),
      ]);

      const byUserId = new Map(assignments.map((row) => [row.userId, row]));

      return res.json({
        ok: true,
        members: members.map((member) => {
          const assignment = byUserId.get(member.userId);
          return {
            ...member,
            assigned: Boolean(assignment),
            projectRole: assignment?.role || member.role,
            canDownload: Boolean(assignment?.canDownload),
          };
        }),
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error: String(error?.message || "Projekt-Rechte konnten nicht geladen werden"),
      });
    }
  }
);

router.put(
  "/projects/:projectId/members/:userId",
  requireCloudAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.cloudMember.companyId);
      const projectId = String(req.params.projectId || "").trim();
      const userId = String(req.params.userId || "").trim();
      const assigned = Boolean(req.body?.assigned);
      const role = String(req.body?.role || "MITARBEITER").toUpperCase();
      const canDownload = Boolean(req.body?.canDownload);

      if (!PROJECT_ROLES.has(role)) {
        return res.status(400).json({ ok: false, error: "Ungültige Rolle" });
      }

      const [project, companyMember] = await Promise.all([
        prisma.project.findFirst({
          where: { id: projectId, companyId },
          select: { id: true },
        }),
        prisma.companyMember.findUnique({
          where: { companyId_userId: { companyId, userId } },
          select: { id: true, active: true },
        }),
      ]);

      if (!project || !companyMember?.active) {
        return res.status(404).json({
          ok: false,
          error: "Projekt oder aktiver Mitarbeiter nicht gefunden",
        });
      }

      if (!assigned) {
        await prisma.projectMember.deleteMany({
          where: { projectId, userId },
        });
        return res.json({ ok: true, assigned: false });
      }

      const assignment = await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: {
          projectId,
          userId,
          role: role as any,
          canDownload,
        },
        update: {
          role: role as any,
          canDownload,
        },
        select: {
          userId: true,
          role: true,
          canDownload: true,
        },
      });

      return res.json({ ok: true, assigned: true, assignment });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error: String(error?.message || "Projekt-Rechte konnten nicht gespeichert werden"),
      });
    }
  }
);

router.put("/members/:userId", requireCloudAdmin, async (req: any, res) => {
  try {
    const companyId = String(req.cloudMember.companyId);
    const userId = String(req.params.userId || "").trim();

    if (userId === String(req.cloudMember.userId)) {
      return res.status(400).json({
        ok: false,
        error: "Der eigene Zugang kann hier nicht deaktiviert werden",
      });
    }

    const role = String(req.body?.role || "MITARBEITER").toUpperCase();
    const active = Boolean(req.body?.active);

    if (!PROJECT_ROLES.has(role)) {
      return res.status(400).json({ ok: false, error: "Ungültige Rolle" });
    }

    const updated = await prisma.companyMember.updateMany({
      where: { companyId, userId },
      data: { role: role as any, active },
    });

    if (!updated.count) {
      return res.status(404).json({ ok: false, error: "Mitarbeiter nicht gefunden" });
    }

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: String(error?.message || "Mitarbeiter konnte nicht gespeichert werden"),
    });
  }
});

export default router;