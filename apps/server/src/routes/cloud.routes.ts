import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
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

function localCloudObjectId(relativePath: string) {
  return `local:${Buffer.from(relativePath, "utf8").toString("base64url")}`;
}

function localPathFromCloudId(value: string) {
  try {
    const raw = String(value || "");
    if (!raw.startsWith("local:")) return null;
    return Buffer.from(raw.slice("local:".length), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

const CLOUD_EXPORT_EXTENSIONS = new Set([
  ".pdf",
  ".xlsx",
  ".xls",
  ".csv",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".dxf",
  ".dwg",
  ".json",
]);

function cloudMime(name: string) {
  const ext = path.extname(name).toLowerCase();

  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".csv") return "text/csv";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".json") return "application/json";

  return "application/octet-stream";
}

type LocalCloudExport = {
  id: string;
  name: string;
  kind: string;
  updatedAt: string;
  versionId: string;
  size: string;
  mime: string;
  moduleKey: string;
};

function listProjectExports(projectCode: string): LocalCloudExport[] {
  const projectRoot = path.resolve(
    PROJECTS_ROOT,
    String(projectCode || "").trim()
  );

  const exportsRoot = path.resolve(projectRoot, "exports");

  if (!fs.existsSync(exportsRoot)) return [];

  const result: LocalCloudExport[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();

      if (!CLOUD_EXPORT_EXTENSIONS.has(ext)) continue;
      if (entry.name.toLowerCase() === "manifest.json") continue;

      const relative = path
        .relative(projectRoot, absolute)
        .replace(/\\/g, "/");

      const afterExports = relative.replace(/^exports\//, "");
      const moduleKey = afterExports.split("/")[0] || "";
      const stat = fs.statSync(absolute);

      result.push({
        id: localCloudObjectId(relative),
        name: entry.name,
        kind: ext.replace(".", "").toUpperCase() || "DATEI",
        updatedAt: stat.mtime.toISOString(),
        versionId: "",
        size: String(stat.size),
        mime: cloudMime(entry.name),
        moduleKey,
      });
    }
  };

  walk(exportsRoot);

  const priority = (name: string) => {
    const ext = path.extname(name).toLowerCase();
    if (ext === ".pdf") return 0;
    if (ext === ".xlsx" || ext === ".xls") return 1;
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return 2;
    if (ext === ".dxf" || ext === ".dwg") return 3;
    if (ext === ".json") return 9;
    return 5;
  };

  return result.sort((a, b) => {
    const p = priority(a.name) - priority(b.name);
    if (p !== 0) return p;

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

const CLOUD_EXPORT_AREAS: Record<string, string[]> = {
  regieberichte: ["regie", "regieberichte"],
  lieferscheine: ["lieferschein", "lieferscheine"],
  fotos: ["fotos"],
  tagesberichte: ["tagesbericht"],
  bautagebuch: ["bautagebuch"],
  mengenermittlung: ["mengenermittlung", "aufmass"],
  kalkulation: ["kalkulation"],
  angebote: ["angebot"],
  abschlagsrechnungen: ["abschlagsrechnung"],
  rechnungen: ["rechnung", "rechnungen"],
};

function exportsForArea(
  areaKey: string,
  exports: LocalCloudExport[]
) {
  const modules = CLOUD_EXPORT_AREAS[areaKey] || [];
  return exports.filter((file) => modules.includes(file.moduleKey));
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
  return ["ADMIN", "ADMINISTRATOR"].includes(
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
        member.isAdmin
          ? prisma.companyMember.findMany({
              where: { companyId: member.companyId },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                userId: true,
                role: true,
                active: true,
                user: { select: { id: true, name: true, email: true } },
              },
            })
          : Promise.resolve([]),
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
    const localExports = listProjectExports(access.project.code);
    const availableKeys = new Set(bucketFiles.map((file) => file.key));

    const registeredDocuments = documents
      .filter((document) => document.current)
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
      documents: [
        ...registeredDocuments,
        ...directBucketFiles,
        ...localExports.map(({ moduleKey, ...file }) => file),
      ],
    });  } catch (error: any) {
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(error?.message || "Projekt konnte nicht geladen werden"),
    });
  }
});

// The Cloud dashboard deliberately reads the very same workflow routes as Mobile.
// Do not derive these numbers from MinIO: MinIO is only a file store, not workflow truth.
const CLOUD_DASHBOARD_AREAS = [
  ["regieberichte", "Regieberichte", "REGIE", ["/api/regie/inbox/list?projectId={project}"], ["/api/regie/freigegeben/list?projectId={project}"], ["/api/regie/list?projectId={project}"]],
  ["lieferscheine", "Lieferscheine", "", ["/api/ls/inbox/list?projectId={project}"], ["/api/ls/freigegeben/list?projectId={project}"], ["/api/ls/list?projectId={project}"]],
  ["fotos", "Fotos / Notizen", "", ["/api/fotos/inbox/list?projectId={project}", "/api/photos/inbox/list?projectId={project}"], [], ["/api/fotos/projects/{project}/fotos/notes", "/api/photos/projects/{project}/fotos/notes"]],
  ["tagesberichte", "Tagesberichte", "TAGESBERICHT", ["/api/tagesbericht/inbox/list?projectId={project}", "/api/regie/inbox/list?projectId={project}"], ["/api/regie/freigegeben/list?projectId={project}"], ["/api/regie/list?projectId={project}"]],
  ["bautagebuch", "Bautagebuch", "", ["/api/inbox/{project}/BAUTAGEBUCH"], ["/api/inbox/{project}/BAUTAGEBUCH/approved"], ["/api/inbox/{project}/BAUTAGEBUCH/final"]],
  ["arbeitszeiten", "Arbeitszeiten", "", ["/api/inbox/{project}/ARBEITSZEIT"], ["/api/inbox/{project}/ARBEITSZEIT/approved"], ["/api/inbox/{project}/ARBEITSZEIT/final"]],
  ["mengenermittlung", "Mengenermittlung", "", ["/api/inbox/{project}/MENGENERMITTLUNG"], ["/api/inbox/{project}/MENGENERMITTLUNG/approved"], ["/api/inbox/{project}/MENGENERMITTLUNG/final"]],
  ["kalkulation", "Kalkulation", "", ["/api/inbox/{project}/KALKULATION"], ["/api/inbox/{project}/KALKULATION/approved"], ["/api/inbox/{project}/KALKULATION/final", "/api/kalkulation/{project}/ki", "/api/kalkulation/ki-handoff/{project}"]],
  ["angebote", "Angebote", "", ["/api/inbox/{project}/ANGEBOT"], ["/api/inbox/{project}/ANGEBOT/approved"], ["/api/inbox/{project}/ANGEBOT/final"]],
  ["abschlagsrechnungen", "Abschlagsrechnungen", "", ["/api/inbox/{project}/ABSCHLAGSRECHNUNG"], ["/api/inbox/{project}/ABSCHLAGSRECHNUNG/approved"], ["/api/inbox/{project}/ABSCHLAGSRECHNUNG/final"]],
  ["rechnungen", "Rechnungen", "", ["/api/inbox/{project}/RECHNUNG"], ["/api/inbox/{project}/RECHNUNG/approved"], ["/api/inbox/{project}/RECHNUNG/final"]],
  ["projektverwaltung", "Projektverwaltung", "", [], [], []],
] as const;

function cloudRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const value of [payload?.items, payload?.rows, payload?.reports, payload?.documents, payload?.results, payload?.entries, payload?.files, payload?.list, payload?.data, payload?.data?.items, payload?.data?.rows]) if (Array.isArray(value)) return value;
  return [];
}

type CloudDownloadDocument = {
  id: string;
  name: string;
};

function cloudBaseName(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const clean = raw.split("?")[0].split("#")[0];
  try {
    return decodeURIComponent(clean.split("/").pop() || "");
  } catch {
    return clean.split("/").pop() || "";
  }
}

function cloudNormalizeName(value: unknown) {
  return cloudBaseName(value)
    .toLowerCase()
    .replace(/[^a-z0-9äöüß._-]/g, "");
}

const CLOUD_DMS_MODULE_AREAS: Record<string, string> = {
  REGIE: "regieberichte", REGIEBERICHT: "regieberichte",
  LIEFERSCHEIN: "lieferscheine", LIEFERSCHEINE: "lieferscheine",
  FOTOS: "fotos", FOTO: "fotos", PHOTO: "fotos", NOTIZEN: "fotos",
  TAGESBERICHT: "tagesberichte", BAUTAGEBUCH: "bautagebuch",
  ARBEITSZEIT: "arbeitszeiten", ARBEITSZEITEN: "arbeitszeiten",
  MENGENERMITTLUNG: "mengenermittlung", AUFMASS: "mengenermittlung", AUFMAß: "mengenermittlung",
  KALKULATION: "kalkulation", KALKULATION_KI: "kalkulation", URKALKULATION: "kalkulation",
  NACHTRAG: "kalkulation", NACHTRAEGE: "kalkulation", NACHTRÄGE: "kalkulation",
  VERSIONSVERGLEICH: "kalkulation",
  ANGEBOT: "angebote", ANGEBOTE: "angebote",
  ABSCHLAGSRECHNUNG: "abschlagsrechnungen", ABSCHLAGSRECHNUNGEN: "abschlagsrechnungen",
  RECHNUNG: "rechnungen", RECHNUNGEN: "rechnungen", SCHLUSSRECHNUNG: "rechnungen",
  PROJEKTE: "projektverwaltung", VERWALTUNG: "projektverwaltung",
};

function cloudDocumentModule(document: any): string {
  const meta = document?.meta && typeof document.meta === "object" ? document.meta : {};
  return String(meta?.module || meta?.moduleKey || meta?.documentType || document?.module || "")
    .trim().toUpperCase();
}

function cloudAreaForDocument(document: any): string | null {
  const module = cloudDocumentModule(document);
  if (CLOUD_DMS_MODULE_AREAS[module]) return CLOUD_DMS_MODULE_AREAS[module];

  const name = String(document?.name || "").toLowerCase();
  if (/regiebericht|regie/.test(name)) return "regieberichte";
  if (/lieferschein/.test(name)) return "lieferscheine";
  if (/foto|photo|bild|notiz/.test(name)) return "fotos";
  if (/tagesbericht/.test(name)) return "tagesberichte";
  if (/bautagebuch/.test(name)) return "bautagebuch";
  if (/arbeitszeit|stundennachweis/.test(name)) return "arbeitszeiten";
  if (/aufma[ßs]|mengenermittlung|reb|\.x31$|\.d11$/.test(name)) return "mengenermittlung";
  if (/abschlag/.test(name)) return "abschlagsrechnungen";
  if (/schlussrechnung|rechnung|^re[-_]/.test(name)) return "rechnungen";
  if (/angebot|offerte/.test(name)) return "angebote";
  if (/nachtrag|versionsvergleich|kalkulation|urkalkulation|gaeb|\.x83$|\.x84$|\.d83$|\.p83$/.test(name)) return "kalkulation";
  if (/verwaltung|projektverwaltung/.test(name)) return "projektverwaltung";
  if (/verwaltung|projektverwaltung/.test(name)) return "projektverwaltung";
  return null;
}

function cloudCandidateNames(row: any): string[] {
  const values: unknown[] = [
    row?.fileName,
    row?.filename,
    row?.pdfFileName,
    row?.pdfFilename,
    row?.pdfUrl,
    row?.publicUrl,
    row?.url,
    row?.name,
  ];

  const appendFiles = (list: any) => {
    if (!Array.isArray(list)) return;
    for (const file of list) {
      values.push(
        file?.name,
        file?.file,
        file?.filename,
        file?.publicUrl,
        file?.url,
        file?.uri
      );
    }
  };

  appendFiles(row?.files);
  appendFiles(row?.attachments);
  appendFiles(row?.photos);

  if (row?.main) {
    values.push(
      row.main?.name,
      row.main?.file,
      row.main?.filename,
      row.main?.publicUrl,
      row.main?.url
    );
  }

  const date = String(row?.date || "").slice(0, 10);
  const reportId = String(row?.reportId || row?.number || "").trim();

  if (date && reportId) {
    values.push(`Regiebericht_${date}_${reportId}.pdf`);
    values.push(`Lieferschein_${date}_${reportId}.pdf`);
  }

  return Array.from(
    new Set(values.map(cloudNormalizeName).filter(Boolean))
  );
}

function cloudAttachDocument(
  row: any,
  documents: CloudDownloadDocument[]
) {
  const existingId = String(
    row?.documentId || row?.fileId || ""
  ).trim();

  if (existingId && documents.some((doc) => doc.id === existingId)) {
    return row;
  }

  const candidates = cloudCandidateNames(row);

  let document = documents.find((doc) => {
    const name = cloudNormalizeName(doc.name);
    return candidates.includes(name);
  });

  if (!document) {
    document = documents.find((doc) => {
      const name = cloudNormalizeName(doc.name);
      return candidates.some(
        (candidate) =>
          candidate.length >= 6 &&
          (name.includes(candidate) || candidate.includes(name))
      );
    });
  }

  return document
    ? {
        ...row,
        documentId: document.id,
        cloudDocumentName: document.name,
      }
    : row;
}

async function cloudMobileRows(req: any, paths: readonly string[], projectCode: string) {
  const origin = `http://127.0.0.1:${process.env.PORT || 4000}`;
  for (const raw of paths) {
    const path = raw.split("{project}").join(encodeURIComponent(projectCode));
    const response = await fetch(`${origin}${path}`, { headers: { accept: "application/json", authorization: String(req.headers.authorization || ""), cookie: String(req.headers.cookie || "") } }).catch(() => null);
    if (!response?.ok) continue;
    const payload = await response.json().catch(() => ({}));
    return cloudRows(payload);
  }
  return [];
}

router.get("/projects/:projectId/dashboard", async (req: any, res) => {
  try {
    const access = await projectAccess(req, req.params.projectId);

    const localExports = listProjectExports(access.project.code);

    const dbDocuments = await prisma.document.findMany({
      where: {
        projectId: access.project.id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
          kind: true,
          meta: true,
          updatedAt: true,
          current: {
            select: {
              id: true,
              storage: {
                select: {
                  size: true,
                  mime: true,
                },
              },
            },
          },
      },
    });

    const bucketFiles = await listProjectBucketFiles(access.project.code);
    const registeredNames = new Set(
      dbDocuments.map((doc) => cloudNormalizeName(doc.name))
    );

    const registeredCloudFiles = dbDocuments
        .filter((document) => document.current)
        .map((document) => ({
          id: document.id,
          name: document.name,
          kind: document.kind,
          updatedAt: document.updatedAt.toISOString(),
          versionId: document.current!.id,
          size: String(document.current!.storage.size),
          mime: document.current!.storage.mime,
          module: cloudDocumentModule(document),
        }));

      const cloudDocuments: CloudDownloadDocument[] = [
      ...dbDocuments,
      ...localExports.map((file) => ({
        id: file.id,
        name: file.name,
      })),
      ...bucketFiles
        .filter(
          (file) =>
            !registeredNames.has(
              cloudNormalizeName(file.key.split("/").pop() || file.key)
            )
        )
        .map((file) => ({
          id: cloudObjectId(file.key),
          name: file.key.split("/").pop() || file.key,
        })),
    ];

    const cards = await Promise.all(
      CLOUD_DASHBOARD_AREAS.map(
        async ([key, title, reportType, inboxPaths, approvedPaths, finalPaths]) => {
          const [inboxRows, approvedRows, finalRows] = await Promise.all([
            cloudMobileRows(req, inboxPaths, access.project.code),
            cloudMobileRows(req, approvedPaths, access.project.code),
            cloudMobileRows(req, finalPaths, access.project.code),
          ]);

          const keep = (rows: any[]) =>
            (reportType
              ? rows.filter(
                  (row) =>
                    String(row?.reportType || "REGIE").toUpperCase() ===
                    reportType
                )
              : rows
            ).map((row) => cloudAttachDocument(row, cloudDocuments));

          return {
            key,
            title,
            inbox: keep(inboxRows),
            approved: keep(approvedRows),
            final: keep(finalRows),
            files: [
                ...exportsForArea(key, localExports).map(
                  ({ moduleKey, ...file }) => file
                ),
                ...registeredCloudFiles.filter(
                  (document) => cloudAreaForDocument(document) === key
                ),
              ],
            };
        }
      )
    );

    return res.json({
      ok: true,
      project: access.project,
      cards,
    });
  } catch (error: any) {
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(
        error?.message || "Cloud-Dashboard konnte nicht geladen werden"
      ),
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

      const localRelativePath = localPathFromCloudId(
        String(req.params.documentId || "")
      );

      if (localRelativePath) {
        const normalizedRelative = localRelativePath.replace(/\\/g, "/");

        if (!normalizedRelative.startsWith("exports/")) {
          return res.status(404).json({
            ok: false,
            error: "Datei nicht gefunden",
          });
        }

        const projectRoot = path.resolve(
          PROJECTS_ROOT,
          access.project.code
        );

        const absolute = path.resolve(
          projectRoot,
          normalizedRelative
        );

        const rootPrefix = projectRoot.endsWith(path.sep)
          ? projectRoot
          : projectRoot + path.sep;

        if (
          !absolute.startsWith(rootPrefix) ||
          !fs.existsSync(absolute) ||
          !fs.statSync(absolute).isFile() ||
          !CLOUD_EXPORT_EXTENSIONS.has(
            path.extname(absolute).toLowerCase()
          )
        ) {
          return res.status(404).json({
            ok: false,
            error: "Datei nicht gefunden",
          });
        }

        return res.download(
          absolute,
          path.basename(absolute)
        );
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
