import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

export type PreparedCadImport = {
  originalName: string;
  effectiveName: string;
  buffer: Buffer;
  converted: boolean;
  converter?: string;
  temporaryDirectory?: string;
};

function isBinaryDxf(buffer: Buffer) {
  return buffer.subarray(0, 22).toString("latin1").startsWith("AutoCAD Binary DXF");
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function runTemplate(commandTemplate: string, input: string, output: string) {
  const command = commandTemplate
    .replace(/\{input\}/g, quoteShell(input))
    .replace(/\{output\}/g, quoteShell(output));
  const result = spawnSync("/bin/sh", ["-lc", command], {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && fs.existsSync(output) && fs.statSync(output).size > 0,
    detail: String(result.stderr || result.stdout || "").trim(),
  };
}

function tryDwg2Dxf(input: string, output: string) {
  const executable = String(process.env.DWG2DXF_BIN || "dwg2dxf").trim();
  const result = spawnSync(executable, ["-o", output, input], {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && fs.existsSync(output) && fs.statSync(output).size > 0,
    detail: String(result.stderr || result.stdout || "").trim(),
    executable,
  };
}

function findGeneratedDxf(directory: string) {
  try {
    return fs
      .readdirSync(directory)
      .filter((name) => path.extname(name).toLowerCase() === ".dxf")
      .map((name) => path.join(directory, name))
      .find((file) => fs.statSync(file).size > 0) || null;
  } catch {
    return null;
  }
}

function tryOda(input: string, output: string, tempDirectory: string) {
  const executable = String(
    process.env.ODA_FILE_CONVERTER || process.env.ODA_CONVERTER_BIN || "ODAFileConverter"
  ).trim();
  const inputDirectory = path.join(tempDirectory, "oda-input");
  const outputDirectory = path.join(tempDirectory, "oda-output");
  fs.mkdirSync(inputDirectory, { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  const copiedInput = path.join(inputDirectory, path.basename(input));
  fs.copyFileSync(input, copiedInput);

  const result = spawnSync(
    executable,
    [inputDirectory, outputDirectory, "ACAD2018", "DXF", "0", "1"],
    {
      encoding: "utf8",
      timeout: 240000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  const generated = findGeneratedDxf(outputDirectory);
  if (result.status === 0 && generated) {
    fs.copyFileSync(generated, output);
  }
  return {
    ok: result.status === 0 && fs.existsSync(output) && fs.statSync(output).size > 0,
    detail: String(result.stderr || result.stdout || "").trim(),
    executable,
  };
}

export function prepareCadImportBuffer(
  originalName: string,
  sourceBuffer: Buffer
): PreparedCadImport {
  const extension = path.extname(originalName).toLowerCase();
  const mustConvert = extension === ".dwg" || (extension === ".dxf" && isBinaryDxf(sourceBuffer));
  if (!mustConvert) {
    return {
      originalName,
      effectiveName: originalName,
      buffer: sourceBuffer,
      converted: false,
    };
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rlc-cad-convert-"));
  const inputPath = path.join(tempDirectory, path.basename(originalName));
  const outputPath = path.join(
    tempDirectory,
    `${path.basename(originalName, extension) || "drawing"}.dxf`
  );
  fs.writeFileSync(inputPath, sourceBuffer);

  const errors: string[] = [];
  const template = String(process.env.RLC_CAD_CONVERTER_COMMAND || "").trim();
  if (template) {
    const result = runTemplate(template, inputPath, outputPath);
    if (result.ok) {
      return {
        originalName,
        effectiveName: path.basename(outputPath),
        buffer: fs.readFileSync(outputPath),
        converted: true,
        converter: "RLC_CAD_CONVERTER_COMMAND",
        temporaryDirectory: tempDirectory,
      };
    }
    errors.push(`RLC_CAD_CONVERTER_COMMAND: ${result.detail || "fehlgeschlagen"}`);
  }

  const dwg2dxf = tryDwg2Dxf(inputPath, outputPath);
  if (dwg2dxf.ok) {
    return {
      originalName,
      effectiveName: path.basename(outputPath),
      buffer: fs.readFileSync(outputPath),
      converted: true,
      converter: dwg2dxf.executable,
      temporaryDirectory: tempDirectory,
    };
  }
  errors.push(`${dwg2dxf.executable}: ${dwg2dxf.detail || "nicht verfügbar/fehlgeschlagen"}`);

  const oda = tryOda(inputPath, outputPath, tempDirectory);
  if (oda.ok) {
    return {
      originalName,
      effectiveName: path.basename(outputPath),
      buffer: fs.readFileSync(outputPath),
      converted: true,
      converter: oda.executable,
      temporaryDirectory: tempDirectory,
    };
  }
  errors.push(`${oda.executable}: ${oda.detail || "nicht verfügbar/fehlgeschlagen"}`);

  throw new Error(
    `${extension === ".dwg" ? "DWG" : "Binäres DXF"} konnte nicht in ASCII-DXF konvertiert werden. ` +
      `Installiere dwg2dxf/ODA File Converter oder setze RLC_CAD_CONVERTER_COMMAND. ` +
      errors.join(" | ")
  );
}

export function cleanupPreparedCadImport(prepared: PreparedCadImport) {
  if (!prepared.temporaryDirectory) return;
  try {
    fs.rmSync(prepared.temporaryDirectory, { recursive: true, force: true });
  } catch {
    // Temporäre Dateien werden vom Betriebssystem später entfernt.
  }
}
