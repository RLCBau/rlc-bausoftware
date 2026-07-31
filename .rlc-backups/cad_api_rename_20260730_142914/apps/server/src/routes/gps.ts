// apps/server/src/routes/gps.ts
import { Router } from "express";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const router = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeProjectId(v: any) {
  const s = String(v || "").trim();
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}

function safeFilename(v: any) {
  const s = String(v || "")
    .trim()
    // sostituisce tutto ciò che non è "safe" con underscore
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);

  // evita filename vuoto
  return s || "gpszuweisung.pdf";
}

function gpsDir(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "gps");
}

function assignmentsFile(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "gps-assignments.json");
}

function workspaceFile(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "gps-workspace.json");
}

function transferFile(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "gps-aufmass-transfer.json");
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, data: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

type GpsPoint = { lat: number; lng: number; ts?: number; name?: string; code?: string };

type Assignment = {
  id: string;
  projectId: string; // FS key, es. BA-2025-DEMO
  lvPosId: string; // DB LVPosition.id
  points: GpsPoint[];
  createdAt: number;
  lvPos?: any;
  measurements?: any[];
  areas?: any[];
  annotations?: any[];
  updatedAt?: number;
};


/* =========================
   WORKSPACE / EDITOR STATE
========================= */

router.get("/state", (req, res) => {
  const projectId = safeProjectId((req.query as any).projectId);
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
  const data = readJson<any>(workspaceFile(projectId), null);
  return res.json({ ok: true, data });
});

router.post("/state", (req, res) => {
  try {
    const projectId = safeProjectId(req.body?.projectId);
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

    const data = {
      projectId,
      selectedLvId: String(req.body?.selectedLvId || ""),
      selectedLv: req.body?.selectedLv || null,
      csvCrs: String(req.body?.csvCrs || ""),
      points: Array.isArray(req.body?.points) ? req.body.points : [],
      measurements: Array.isArray(req.body?.measurements) ? req.body.measurements : [],
      areas: Array.isArray(req.body?.areas) ? req.body.areas : [],
      annotations: Array.isArray(req.body?.annotations) ? req.body.annotations : [],
      activeDistanceIndexes: Array.isArray(req.body?.activeDistanceIndexes)
        ? req.body.activeDistanceIndexes
        : [],
      activeAreaIndexes: Array.isArray(req.body?.activeAreaIndexes)
        ? req.body.activeAreaIndexes
        : [],
      updatedAt: Date.now(),
    };

    writeJson(workspaceFile(projectId), data);
    return res.json({ ok: true, data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/aufmass-transfer", (req, res) => {
  const projectId = safeProjectId((req.query as any).projectId);
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
  const data = readJson<any>(transferFile(projectId), null);
  return res.json({ ok: true, data });
});

router.post("/aufmass-transfer", (req, res) => {
  try {
    const projectId = safeProjectId(req.body?.projectId);
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

    const data = {
      projectId,
      source: "gps-zuweisung",
      transferId: String(req.body?.transferId || `${Date.now()}`),
      lvPosId: String(req.body?.lvPosId || ""),
      lvPosition: String(req.body?.lvPosition || ""),
      lvKurztext: String(req.body?.lvKurztext || ""),
      items: Array.isArray(req.body?.items) ? req.body.items : [],
      createdAt: Number(req.body?.createdAt || Date.now()),
      consumedAt: null,
    };

    writeJson(transferFile(projectId), data);
    return res.json({ ok: true, data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/aufmass-transfer/consume", (req, res) => {
  try {
    const projectId = safeProjectId(req.body?.projectId);
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

    const file = transferFile(projectId);
    const data = readJson<any>(file, null);
    if (!data) return res.json({ ok: true, data: null });

    const next = { ...data, consumedAt: Date.now() };
    writeJson(file, next);
    return res.json({ ok: true, data: next });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* =========================
   ASSIGNMENTS (EXISTING)
========================= */

router.get("/list", (req, res) => {
  const projectId = safeProjectId((req.query as any).projectId);
  if (!projectId)
    return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const p = assignmentsFile(projectId);
  const raw = readJson<any>(p, []);
  const items: Assignment[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];
  return res.json({ ok: true, items });
});

router.post("/assign", (req, res) => {
  const body = req.body as Assignment;

  const projectId = safeProjectId(body?.projectId);
  if (!projectId)
    return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!body?.id)
    return res.status(400).json({ ok: false, error: "id fehlt" });
  if (!body?.lvPosId)
    return res.status(400).json({ ok: false, error: "lvPosId fehlt" });
  if (!Array.isArray(body?.points) || body.points.length === 0)
    return res.status(400).json({ ok: false, error: "points fehlen" });

  const p = assignmentsFile(projectId);
  const raw = readJson<any>(p, []);
  const items: Assignment[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];

  const item: Assignment = {
    ...body,
    projectId,
    createdAt: Number(body.createdAt || Date.now()),
    updatedAt: Date.now(),
  };

  const idx = items.findIndex((x) => x.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.unshift(item);

  writeJson(p, items);
  return res.json({ ok: true, item });
});

router.delete("/delete", (req, res) => {
  const projectId = safeProjectId((req.query as any).projectId);
  const id = String((req.query as any).id || "").trim();

  if (!projectId)
    return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!id) return res.status(400).json({ ok: false, error: "id fehlt" });

  const p = assignmentsFile(projectId);
  const raw = readJson<any>(p, []);
  const items: Assignment[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];
  const next = items.filter((x) => x.id !== id);

  writeJson(p, next);
  return res.json({ ok: true });
});

/* =========================
   PDF EXPORT (NEW)
========================= */

/**
 * POST /api/gps/export-pdf
 * Body: { projectId: string, filenameHint?: string, pdfDataUrl: string }
 * -> salva /data/projects/<projectId>/gps/<filename>.pdf
 */
router.post("/export-pdf", (req, res) => {
  try {
    const projectId = safeProjectId(req.body?.projectId);
    const filenameHint = String(req.body?.filenameHint || "gpszuweisung.pdf");
    const pdfDataUrl = String(req.body?.pdfDataUrl || "");

    if (!projectId)
      return res.status(400).json({ ok: false, error: "projectId fehlt" });

    if (!pdfDataUrl.startsWith("data:application/pdf;base64,")) {
      return res
        .status(400)
        .json({ ok: false, error: "pdfDataUrl invalid" });
    }

    const base64 = pdfDataUrl.split(",")[1] || "";
    const buf = Buffer.from(base64, "base64");
    if (!buf || buf.length < 10) {
      return res.status(400).json({ ok: false, error: "pdf leer" });
    }

    const dir = gpsDir(projectId);
    ensureDir(dir);

    // filename safe + garantisce estensione .pdf
    let filename = safeFilename(filenameHint);
    if (!filename.toLowerCase().endsWith(".pdf")) filename += ".pdf";

    // path traversal protection
    const abs = path.join(dir, filename);
    const resolvedDir = path.resolve(dir);
    const resolvedAbs = path.resolve(abs);
    if (!resolvedAbs.startsWith(resolvedDir + path.sep)) {
      return res.status(400).json({ ok: false, error: "bad filename" });
    }

    fs.writeFileSync(resolvedAbs, buf);

    const url = `/api/gps/pdf?projectId=${encodeURIComponent(
      projectId
    )}&filename=${encodeURIComponent(filename)}`;

    return res.json({ ok: true, filename, url });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * GET /api/gps/pdf?projectId=...&filename=...
 * -> restituisce PDF inline
 */
router.get("/pdf", (req, res) => {
  try {
    const projectId = safeProjectId((req.query as any).projectId);
    const filename = safeFilename((req.query as any).filename);

    if (!projectId) return res.status(400).send("projectId fehlt");
    if (!filename) return res.status(400).send("filename fehlt");

    const dir = gpsDir(projectId);
    const abs = path.join(dir, filename);

    const resolvedDir = path.resolve(dir);
    const resolvedAbs = path.resolve(abs);
    if (!resolvedAbs.startsWith(resolvedDir + path.sep)) {
      return res.status(400).send("bad filename");
    }

    if (!fs.existsSync(resolvedAbs)) return res.status(404).send("not found");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    fs.createReadStream(resolvedAbs).pipe(res);
  } catch (e: any) {
    return res.status(500).send(String(e?.message || e));
  }
});

/**
 * GET /api/gps/pdfs?projectId=...
 * -> lista PDF salvati in /gps
 */
router.get("/pdfs", (req, res) => {
  try {
    const projectId = safeProjectId((req.query as any).projectId);
    if (!projectId)
      return res.status(400).json({ ok: false, error: "projectId fehlt" });

    const dir = gpsDir(projectId);
    ensureDir(dir);

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((f) => {
        const abs = path.join(dir, f);
        const st = fs.statSync(abs);
        return {
          name: f,
          size: st.size,
          mtime: st.mtimeMs,
          url: `/api/gps/pdf?projectId=${encodeURIComponent(
            projectId
          )}&filename=${encodeURIComponent(f)}`,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    return res.json({ ok: true, items: files });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: String(e?.message || e) });
  }
});


/* =========================
   ALKIS RASTER -> DXF
========================= */

type WorldFile = {
  a: number;
  d: number;
  b: number;
  e: number;
  c: number;
  f: number;
};

function parseWorldFile(value: unknown): WorldFile {
  const numbers = String(value || "")
    .trim()
    .split(/\s+/)
    .map(Number);

  if (numbers.length < 6 || numbers.some((number) => !Number.isFinite(number))) {
    throw new Error("PGW ist ungültig.");
  }

  return {
    a: numbers[0],
    d: numbers[1],
    b: numbers[2],
    e: numbers[3],
    c: numbers[4],
    f: numbers[5],
  };
}

function pixelToWorld(
  column: number,
  row: number,
  world: WorldFile
): [number, number] {
  return [
    world.a * column + world.b * row + world.c,
    world.d * column + world.e * row + world.f,
  ];
}

function dxfNumber(value: number) {
  return Number.isFinite(value)
    ? value.toFixed(4).replace(/\.?0+$/, "")
    : "0";
}

router.post("/vectorize-alkis", async (req, res) => {
  try {
    const projectId = safeProjectId(req.body?.projectId);
    const pngDataUrl = String(req.body?.pngDataUrl || "");
    const pgwText = String(req.body?.pgw || "");
    const filenameHint = safeFilename(
      req.body?.filenameHint || `ALKIS_vector_${Date.now()}.dxf`
    );

    if (!projectId) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    if (!pngDataUrl.startsWith("data:image/png;base64,")) {
      return res.status(400).json({
        ok: false,
        error: "PNG fehlt oder ist ungültig.",
      });
    }

    const world = parseWorldFile(pgwText);

    const pngBuffer = Buffer.from(
      pngDataUrl.substring(pngDataUrl.indexOf(",") + 1),
      "base64"
    );

    const threshold = Math.max(
      40,
      Math.min(230, Number(req.body?.threshold || 145))
    );

    const step = Math.max(
      1,
      Math.min(5, Number(req.body?.step || 2))
    );

    const simplifyPixels = Math.max(
      0.5,
      Math.min(8, Number(req.body?.simplifyPixels || 2.2))
    );

    const minLengthMeters = Math.max(
      0.2,
      Math.min(50, Number(req.body?.minLengthMeters || 2.0))
    );

    const image = await sharp(pngBuffer)
      .flatten({ background: "#ffffff" })
      .greyscale()
      .median(3)
      .threshold(threshold)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = image.data;
    const width = image.info.width;
    const height = image.info.height;

    if (width < 2 || height < 2) {
      throw new Error("PNG ist zu klein.");
    }

    const isBlack = (x: number, y: number) => {
      const px = Math.max(0, Math.min(width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(height - 1, Math.round(y)));

      return pixels[py * width + px] < 128;
    };

    type PixelPoint = [number, number];
    type Segment = [PixelPoint, PixelPoint];

    const segments: Segment[] = [];
    const maxSegments = 350_000;

    const addSegment = (
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ) => {
      if (segments.length >= maxSegments) return;
      segments.push([[x1, y1], [x2, y2]]);
    };

    for (let y = 0; y < height - step; y += step) {
      for (let x = 0; x < width - step; x += step) {
        const tl = isBlack(x, y) ? 1 : 0;
        const tr = isBlack(x + step, y) ? 1 : 0;
        const br = isBlack(x + step, y + step) ? 1 : 0;
        const bl = isBlack(x, y + step) ? 1 : 0;

        const cell = tl * 8 + tr * 4 + br * 2 + bl;

        if (cell === 0 || cell === 15) continue;

        const top: PixelPoint = [x + step / 2, y];
        const right: PixelPoint = [x + step, y + step / 2];
        const bottom: PixelPoint = [x + step / 2, y + step];
        const left: PixelPoint = [x, y + step / 2];

        switch (cell) {
          case 1:
          case 14:
            addSegment(left[0], left[1], bottom[0], bottom[1]);
            break;

          case 2:
          case 13:
            addSegment(bottom[0], bottom[1], right[0], right[1]);
            break;

          case 3:
          case 12:
            addSegment(left[0], left[1], right[0], right[1]);
            break;

          case 4:
          case 11:
            addSegment(top[0], top[1], right[0], right[1]);
            break;

          case 5:
            addSegment(top[0], top[1], left[0], left[1]);
            addSegment(bottom[0], bottom[1], right[0], right[1]);
            break;

          case 6:
          case 9:
            addSegment(top[0], top[1], bottom[0], bottom[1]);
            break;

          case 7:
          case 8:
            addSegment(top[0], top[1], left[0], left[1]);
            break;

          case 10:
            addSegment(top[0], top[1], right[0], right[1]);
            addSegment(left[0], left[1], bottom[0], bottom[1]);
            break;
        }
      }
    }

    if (!segments.length) {
      throw new Error("Keine Linien erkannt.");
    }

    const pointKey = (point: PixelPoint) =>
      `${Math.round(point[0] * 2)}:${Math.round(point[1] * 2)}`;

    const endpointMap = new Map<string, number[]>();

    segments.forEach((segment, index) => {
      for (const point of segment) {
        const key = pointKey(point);
        const list = endpointMap.get(key) || [];
        list.push(index);
        endpointMap.set(key, list);
      }
    });

    const used = new Uint8Array(segments.length);
    const polylines: PixelPoint[][] = [];

    const otherEnd = (
      segment: Segment,
      key: string
    ): PixelPoint => {
      return pointKey(segment[0]) === key
        ? segment[1]
        : segment[0];
    };

    const extendLine = (
      line: PixelPoint[],
      atStart: boolean
    ) => {
      while (true) {
        const current = atStart ? line[0] : line[line.length - 1];
        const key = pointKey(current);
        const candidates = endpointMap.get(key) || [];

        const nextIndex = candidates.find((index) => !used[index]);

        if (nextIndex === undefined) break;

        used[nextIndex] = 1;

        const nextPoint = otherEnd(segments[nextIndex], key);

        if (atStart) line.unshift(nextPoint);
        else line.push(nextPoint);

        if (line.length > 50_000) break;
      }
    };

    for (let index = 0; index < segments.length; index += 1) {
      if (used[index]) continue;

      used[index] = 1;

      const line: PixelPoint[] = [
        segments[index][0],
        segments[index][1],
      ];

      extendLine(line, false);
      extendLine(line, true);

      if (line.length >= 2) {
        polylines.push(line);
      }
    }

    const distanceToSegmentSquared = (
      point: PixelPoint,
      start: PixelPoint,
      end: PixelPoint
    ) => {
      let x = start[0];
      let y = start[1];

      let dx = end[0] - x;
      let dy = end[1] - y;

      if (dx !== 0 || dy !== 0) {
        const t =
          ((point[0] - x) * dx + (point[1] - y) * dy) /
          (dx * dx + dy * dy);

        if (t > 1) {
          x = end[0];
          y = end[1];
        } else if (t > 0) {
          x += dx * t;
          y += dy * t;
        }
      }

      dx = point[0] - x;
      dy = point[1] - y;

      return dx * dx + dy * dy;
    };

    const simplifyLine = (
      points: PixelPoint[],
      tolerance: number
    ): PixelPoint[] => {
      if (points.length <= 2) return points;

      const toleranceSquared = tolerance * tolerance;

      const simplifySection = (
        first: number,
        last: number,
        result: PixelPoint[]
      ) => {
        let maxDistance = toleranceSquared;
        let index = -1;

        for (let i = first + 1; i < last; i += 1) {
          const distance = distanceToSegmentSquared(
            points[i],
            points[first],
            points[last]
          );

          if (distance > maxDistance) {
            index = i;
            maxDistance = distance;
          }
        }

        if (index !== -1) {
          if (index - first > 1) {
            simplifySection(first, index, result);
          }

          result.push(points[index]);

          if (last - index > 1) {
            simplifySection(index, last, result);
          }
        }
      };

      const result: PixelPoint[] = [points[0]];

      simplifySection(0, points.length - 1, result);

      result.push(points[points.length - 1]);

      return result;
    };

    const worldDistance = (
      first: PixelPoint,
      second: PixelPoint
    ) => {
      const a = pixelToWorld(first[0], first[1], world);
      const b = pixelToWorld(second[0], second[1], world);

      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    };

    const polylineLength = (points: PixelPoint[]) => {
      let length = 0;

      for (let index = 1; index < points.length; index += 1) {
        length += worldDistance(points[index - 1], points[index]);
      }

      return length;
    };

    const cleaned = polylines
      .map((line) => simplifyLine(line, simplifyPixels))
      .filter((line) => line.length >= 2)
      .filter((line) => polylineLength(line) >= minLengthMeters)
      .slice(0, 50_000);

    if (!cleaned.length) {
      throw new Error(
        "Nach der Bereinigung wurden keine nutzbaren Linien gefunden."
      );
    }

    const rows: string[] = [];

    const push = (...values: Array<string | number>) => {
      values.forEach((value) => rows.push(String(value)));
    };

    push(
      0, "SECTION",
      2, "HEADER",
      9, "$ACADVER",
      1, "AC1009",
      0, "ENDSEC",

      0, "SECTION",
      2, "TABLES",
      0, "TABLE",
      2, "LAYER",
      70, 1,

      0, "LAYER",
      2, "RLC_ALKIS_RASTER_VEKTOR",
      70, 0,
      62, 7,
      6, "CONTINUOUS",

      0, "ENDTAB",
      0, "ENDSEC",

      0, "SECTION",
      2, "ENTITIES"
    );

    let vertexCount = 0;

    for (const line of cleaned) {
      const first = line[0];
      const last = line[line.length - 1];

      const closed =
        worldDistance(first, last) <=
        Math.max(Math.abs(world.a), Math.abs(world.e)) * 3;

      push(
        0, "POLYLINE",
        8, "RLC_ALKIS_RASTER_VEKTOR",
        66, 1,
        70, closed ? 1 : 0
      );

      for (const point of line) {
        const worldPoint = pixelToWorld(point[0], point[1], world);

        push(
          0, "VERTEX",
          8, "RLC_ALKIS_RASTER_VEKTOR",
          10, dxfNumber(worldPoint[0]),
          20, dxfNumber(worldPoint[1]),
          30, 0,
          70, 0
        );

        vertexCount += 1;
      }

      push(
        0, "SEQEND",
        8, "RLC_ALKIS_RASTER_VEKTOR"
      );
    }

    push(
      0, "ENDSEC",
      0, "EOF"
    );

    const dxf = `${rows.join("\r\n")}\r\n`;

    const filename = filenameHint.toLowerCase().endsWith(".dxf")
      ? filenameHint
      : `${filenameHint}.dxf`;

    const directory = gpsDir(projectId);
    ensureDir(directory);

    fs.writeFileSync(
      path.join(directory, filename),
      dxf,
      "utf8"
    );

    return res.json({
      ok: true,
      filename,
      rawSegmentCount: segments.length,
      polylineCount: cleaned.length,
      vertexCount,
      threshold,
      step,
      simplifyPixels,
      minLengthMeters,
      dxfBase64: Buffer.from(dxf, "utf8").toString("base64"),
    });
  } catch (error: any) {
    console.error("[gps/vectorize-alkis]", error);

    return res.status(500).json({
      ok: false,
      error: String(error?.message || error),
    });
  }
});


export default router;
