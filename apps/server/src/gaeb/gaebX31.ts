export type GaebX31Row = {
  pos?: unknown;
  position?: unknown;
  posNr?: unknown;
  qTakeoffRows?: unknown[];
};

export type GaebX31Project = {
  code?: string | null;
  number?: string | null;
  name?: string | null;
  title?: string | null;
};

type OzStructure = {
  levelWidths: number[];
  itemWidth: number;
  hasIndex: boolean;
};

type ParsedOz = {
  levels: string[];
  item: string;
  index: string;
};

type TreeNode = {
  part: string;
  children: Map<string, TreeNode>;
  items: Array<{ oz: ParsedOz; row: GaebX31Row; sourceIndex: number }>;
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoTime(d: Date): string {
  return d.toISOString().slice(11, 19);
}

function analyze(rows: GaebX31Row[]): OzStructure {
  const parsed = rows.map((row, index) => {
    const raw = s(row.pos ?? row.position ?? row.posNr ?? index + 1);
    const parts = raw.split(".").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) throw new Error("X31_OZ_UNGUELTIG: Leere OZ.");
    return { raw, parts };
  });

  const counts = new Set(parsed.map((x) => x.parts.length));
  if (counts.size > 2) {
    throw new Error("X31_OZ_STRUKTUR_UNEINHEITLICH");
  }

  const maxLen = Math.max(...parsed.map((x) => x.parts.length));
  const minLen = Math.min(...parsed.map((x) => x.parts.length));
  const hasIndex =
    maxLen === minLen + 1 &&
    parsed.some((x) => x.parts.length === maxLen && /^[0-9A-Za-z]$/.test(x.parts[maxLen - 1]));

  const coreLen = hasIndex ? maxLen - 1 : maxLen;
  const levelCount = coreLen - 1;
  if (levelCount < 0 || levelCount > 5) {
    throw new Error(`X31_LV_STUFEN_UNGUELTIG: ${levelCount}`);
  }

  for (const x of parsed) {
    if (x.parts.length !== coreLen && !(hasIndex && x.parts.length === coreLen + 1)) {
      throw new Error(`X31_OZ_STRUKTUR_UNEINHEITLICH: ${x.raw}`);
    }
    const core = x.parts.slice(0, coreLen);
    if (!core.every((part) => /^\d+$/.test(part))) {
      throw new Error(`X31_OZ_UNGUELTIG: LV-Stufen und Position müssen numerisch sein (${x.raw}).`);
    }
    if (x.parts.length === coreLen + 1 && !/^[0-9A-Za-z]$/.test(x.parts[x.parts.length - 1])) {
      throw new Error(`X31_INDEX_UNGUELTIG: ${x.raw}`);
    }
  }

  const levelWidths = Array.from({ length: levelCount }, (_, i) =>
    Math.max(...parsed.map((x) => x.parts[i].length))
  );
  const itemWidth = Math.max(...parsed.map((x) => x.parts[levelCount].length));
  const totalWidth = levelWidths.reduce((a, b) => a + b, 0) + itemWidth + (hasIndex ? 1 : 0);
  if (totalWidth > 14) {
    throw new Error(`X31_OZ_ZU_LANG: ${totalWidth} Stellen; maximal 14.`);
  }

  return { levelWidths, itemWidth, hasIndex };
}

function parseOz(value: unknown, structure: OzStructure): ParsedOz {
  const raw = s(value);
  const parts = raw.split(".").map((x) => x.trim()).filter(Boolean);
  const core = structure.levelWidths.length + 1;
  if (parts.length !== core && !(structure.hasIndex && parts.length === core + 1)) {
    throw new Error(`X31_OZ_UNGUELTIG: ${raw}`);
  }
  const levels = structure.levelWidths.map((width, i) => parts[i].padStart(width, "0"));
  const item = parts[structure.levelWidths.length].padStart(structure.itemWidth, "0");
  const index = parts.length > core ? parts[parts.length - 1] : "";
  return { levels, item, index };
}

function normalizeRow80(value: unknown): string {
  const row = String(value ?? "").replace(/[\r\n]/g, " ");
  if (!row.trim()) return "";
  return row.slice(0, 80).padEnd(80, " ");
}

export function buildGaebX31Xml(args: {
  rows: GaebX31Row[];
  project: GaebX31Project;
  versDate?: "2021-05" | "2023-01";
  createdAt?: Date;
  methodDescription?: string;
  awardNo?: string | null;
  dpNo?: string | null;
}): string {
  const rows = Array.isArray(args.rows) ? args.rows : [];
  if (!rows.length) throw new Error("X31_KEINE_POSITIONEN");

  const structure = analyze(rows);
  const root: TreeNode = { part: "", children: new Map(), items: [] };

  rows.forEach((row, sourceIndex) => {
    const oz = parseOz(row.pos ?? row.position ?? row.posNr, structure);
    let node = root;
    for (const level of oz.levels) {
      if (!node.children.has(level)) {
        node.children.set(level, { part: level, children: new Map(), items: [] });
      }
      node = node.children.get(level)!;
    }
    node.items.push({ oz, row, sourceIndex });
  });

  let idCounter = 1;
  const nextId = () => `ID${String(idCounter++).padStart(8, "0")}`;

  function render(node: TreeNode): string {
    let out = "";
    for (const child of node.children.values()) {
      out += `<BoQCtgy ID="${nextId()}" RNoPart="${esc(child.part)}"><BoQBody>${render(child)}</BoQBody></BoQCtgy>`;
    }
    if (node.items.length) {
      let items = "";
      for (const entry of node.items) {
        const indexAttr = entry.oz.index ? ` RNoIndex="${esc(entry.oz.index)}"` : "";
        const qRows = (Array.isArray(entry.row.qTakeoffRows) ? entry.row.qTakeoffRows : [])
          .map(normalizeRow80)
          .filter(Boolean);
        const qXml = qRows
          .map((row80) => `<QDetermItem><QTakeoff Row="${esc(row80)}"/></QDetermItem>`)
          .join("");
        items += `<Item ID="${nextId()}" RNoPart="${esc(entry.oz.item)}"${indexAttr}><QtyDeterm>${qXml}</QtyDeterm></Item>`;
      }
      out += `<Itemlist>${items}</Itemlist>`;
    }
    return out;
  }

  const breakdown = [
    ...structure.levelWidths.map(
      (w) => `<BoQBkdn><Type>BoQLevel</Type><Length>${w}</Length><Num>Yes</Num></BoQBkdn>`
    ),
    `<BoQBkdn><Type>Item</Type><Length>${structure.itemWidth}</Length><Num>Yes</Num></BoQBkdn>`,
    ...(structure.hasIndex
      ? ['<BoQBkdn><Type>Index</Type><Length>1</Length><Num>No</Num><Alignment>left</Alignment></BoQBkdn>']
      : []),
  ].join("");

  const createdAt = args.createdAt || new Date();
  const versDate = args.versDate || "2023-01";
  const code = s(args.project.code || args.project.number || "RLC");
  const name = s(args.project.name || args.project.title || code || "RLC Projekt");
  const ownerParts = [
    args.dpNo ? `<DPNo>${esc(args.dpNo)}</DPNo>` : "",
    args.awardNo ? `<AwardNo>${esc(args.awardNo)}</AwardNo>` : "",
  ].join("");
  const own = ownerParts ? `<OWN>${ownerParts}</OWN>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA31/3.3"><GAEBInfo><Version>3.3</Version><VersDate>${versDate}</VersDate><Date>${isoDate(createdAt)}</Date><Time>${isoTime(createdAt)}</Time><ProgSystem>RLC Bausoftware 1.0.0</ProgSystem><ProgName>RLC Aufmaß-Editor</ProgName></GAEBInfo><QtyDeterm><QtyDetermInfo><MethodDescription>${esc(args.methodDescription || "REB23003-2009")}</MethodDescription><OrdDescr>${esc(code)}</OrdDescr><ProjDescr>${esc(name)}</ProjDescr></QtyDetermInfo><DP>31</DP>${own}<BoQ ID="${nextId()}">${breakdown}<BoQBody>${render(root)}</BoQBody></BoQ></QtyDeterm></GAEB>\n`;
}
