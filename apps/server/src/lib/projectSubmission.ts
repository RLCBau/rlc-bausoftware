import { prisma } from "./prisma";

type SubmissionSource = "MOBILE" | "WEB" | "CLOUD" | "SYSTEM";

type RecordSubmissionInput = {
  projectToken: string;
  source: SubmissionSource;
  kind: string;
  entityId?: string | null;
  title?: string | null;
  meta?: any;
};

export async function recordProjectSubmission(
  req: any,
  input: RecordSubmissionInput
) {
  try {
    const companyId = String(
      req?.auth?.companyId ||
      req?.auth?.company ||
      ""
    ).trim();

    const userId = String(req?.auth?.sub || "").trim();
    const projectToken = String(input.projectToken || "").trim();

    if (!companyId || !projectToken) {
      console.warn("[ProjectSubmission] skipped: missing company/project", {
        companyId,
        projectToken,
        kind: input.kind,
      });
      return null;
    }

    const project = await prisma.project.findFirst({
      where: {
        companyId,
        OR: [
          { id: projectToken },
          { code: projectToken },
        ],
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!project) {
      console.warn("[ProjectSubmission] project not found", {
        companyId,
        projectToken,
        kind: input.kind,
      });
      return null;
    }

    return await prisma.projectSubmission.create({
      data: {
        companyId,
        projectId: project.id,
        userId: userId || null,
        source: input.source,
        kind: String(input.kind || "UNKNOWN").toUpperCase(),
        entityId: input.entityId ? String(input.entityId) : null,
        title: input.title ? String(input.title) : null,
        meta: input.meta ?? undefined,
      },
    });
  } catch (error: any) {
    // Tracking non deve mai bloccare il workflow operativo.
    console.error(
      "[ProjectSubmission] record failed:",
      error?.message || error
    );
    return null;
  }
}
