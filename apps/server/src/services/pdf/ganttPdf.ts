import PDFDocument from "pdfkit";
import fs from "fs";

interface GanttItem {
  task?: string;
  name?: string;
  start?: string;
  end?: string;
  [key: string]: any;
}

interface GanttPlan {
  projectId?: string | number;
  start?: string;
  ende?: string;
  tasks?: GanttItem[];
  // falls der Plan direkt als Array kommt, fangen wir das unten ab
  [key: string]: any;
}

export async function createGanttPdf(
  plan: GanttPlan | GanttItem[],
  outPath: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const p = plan as GanttPlan;

    const projectId = p.projectId ?? "";
    const title = projectId
      ? `Bauzeitenplan – Projekt ${projectId}`
      : "Bauzeitenplan";

    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown();

    // Aufgaben holen: entweder plan.tasks oder plan selbst als Array
    const rows: GanttItem[] = Array.isArray((plan as any).tasks)
      ? ((plan as any).tasks as GanttItem[])
      : (Array.isArray(plan) ? (plan as GanttItem[]) : []);

    rows.forEach((item, index) => {
      const label = item.task ?? item.name ?? `Vorgang ${index + 1}`;
      const start = item.start ?? "";
      const end = item.end ?? "";
      doc.fontSize(12).text(`${index + 1}. ${label} (${start} → ${end})`);
    });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}
