import PDFDocument from "pdfkit";
import fs from "fs";

export default {
  create(items: any[], outPath: string) {
    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 32 });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);

      doc.fontSize(18).text("Mängelprotokoll", { align: "center" });
      doc.moveDown();

      items.forEach((m, idx) => {
        doc.fontSize(12).text(`${idx+1}. ${m.titel}  [${m.prioritaet}]  —  Status: ${m.status}`);
        doc.fontSize(10).text(`Kategorie: ${m.kategorie}    Ort: ${m.ort||"-"}    Fällig: ${m.faelligAm||"-"}`);
        doc.text(`LV-Pos.: ${m.lvPos||"-"}    Regiebericht: ${m.regieberichtId||"-"}`);
        if (m.beschreibung) doc.text(m.beschreibung);
        if (m.notiz) doc.text("Notiz: " + m.notiz);

        if (m.foto) {
          try {
            const local = m.foto.startsWith("/files/") ? "uploads" + m.foto.replace("/files","") : m.foto;
            if (fs.existsSync(local)) { doc.moveDown(0.3); doc.image(local, { width: 220 }); }
          } catch {}
        }
        doc.moveDown();
        doc.moveTo(32, doc.y).lineTo(580, doc.y).strokeColor("#dddddd").stroke();
        doc.moveDown();
      });

      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
  }
};
