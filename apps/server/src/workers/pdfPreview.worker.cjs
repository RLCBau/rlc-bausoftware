const fs = require("fs");

function bufferToDataUrl(buf, mime) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  try {
    const inPath = process.argv[2];
    const scale = Number(process.argv[3] || 2);

    if (!inPath || !fs.existsSync(inPath)) process.exit(2);

    const pdfBuffer = fs.readFileSync(inPath);

    const { createCanvas } = require("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBuffer = canvas.toBuffer("image/png");
    process.stdout.write(bufferToDataUrl(pngBuffer, "image/png"));
    process.exit(0);
  } catch (e) {
    process.stderr.write(String(e?.stack || e));
    process.exit(1);
  }
}

main();
