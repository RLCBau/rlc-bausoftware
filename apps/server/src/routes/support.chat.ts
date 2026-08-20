// apps/server/src/routes/support.chat.ts
import { Router } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany, requireActiveSubscription } from "../middleware/guards";
import { requireServerLicense } from "../middleware/license";
import { completeRlcAiText } from "../services/ai/rlcAiGateway";
import { formatSoftwareIntelligenceContext } from "../software-intelligence/repositoryKnowledge";

const r = Router();
const prisma = new PrismaClient();

/**
 * =========================================================
 * Support Chat (Hybrid: rules + optional AI fallback)
 * POST /api/support/chat
 * =========================================================
 *
 * Body:
 * {
 *   message: string,
 *   projectId?: string,
 *   projectCode?: string,
 *   mode?: "NUR_APP" | "SERVER_SYNC",
 *   language?: "de" | "it" | "en",
 *   context?: {
 *     pending?: number,
 *     queueLocked?: boolean,
 *     lastError?: string,
 *     screen?: string,
 *     appVersion?: string,
 *     appBuild?: string,
 *     device?: string
 *   }
 * }
 *
 * Response:
 * {
 *   ok: true,
 *   answer: string,
 *   type: "info" | "warning" | "fix" | "critical",
 *   actions?: Array<{ id: string, label: string, kind: "NAVIGATE"|"RUN"|"OPEN_URL", payload?: any }>
 * }
 */

const ChatSchema = z.object({
  message: z.string().min(1).max(12000),
  originalMessage: z.string().max(12000).optional(),
  systemPrompt: z.string().max(50000).optional(),
  projectId: z.string().optional(),
  projectCode: z.string().optional(),
  mode: z.enum(["NUR_APP", "SERVER_SYNC"]).optional(),
  language: z.enum(["de", "it", "en"]).optional().default("de"),
  context: z.record(z.string(), z.any()).optional(),
});

type ReplyType = "info" | "warning" | "fix" | "critical";

function normalize(s: any) {
  return String(s || "").trim();
}

function n(v: any): number {
  if (v === null || v === undefined) return 0;
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function safeJson(value: unknown, maxLength = 30000): string {
  try {
    const text = JSON.stringify(value ?? null, null, 2);
    return text.length > maxLength
      ? `${text.slice(0, maxLength)}\n...[gekürzt]`
      : text;
  } catch {
    return "";
  }
}


async function loadProjectLvContext(input: z.infer<typeof ChatSchema>) {
  const key = normalize(input.projectCode || input.projectId);
  if (!key) return null;

  const project = await prisma.project.findFirst({
    where: {
      OR: [
        { id: key },
        { code: key },
        { number: key },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      number: true,
    },
  });

  if (!project) return null;

  const headers = await prisma.lVHeader.findMany({
    where: { projectId: project.id },
    orderBy: [{ version: "asc" }],
    select: {
      id: true,
      title: true,
      version: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const summaries = [];

  for (const h of headers) {
    const rows = await prisma.lVPosition.findMany({
      where: { lvId: h.id },
      orderBy: [{ position: "asc" }],
      select: {
        position: true,
        kurztext: true,
        langtext: true,
        einheit: true,
        menge: true,
        einzelpreis: true,
        gesamt: true,
      },
    });

    const total = rows.reduce((s, r) => {
      const qty = n(r.menge);
      const ep = n(r.einzelpreis);
      const gp = n(r.gesamt);
      return s + (gp > 0 ? gp : qty * ep);
    }, 0);

    summaries.push({
      headerId: h.id,
      version: h.version,
      title: h.title,
      currency: h.currency,
      count: rows.length,
      total: round2(total),
      first: rows[0]?.position || "",
      last: rows[rows.length - 1]?.position || "",
      sample: rows[0]?.kurztext || "",
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    });
  }

  const positive = summaries.filter((s) => s.count > 0 && s.total > 0 && normalize(s.sample));
  const x84Original = positive[0] || null;
  const kiLatest = positive.length > 0 ? positive[positive.length - 1] : null;

  const expectedCount = x84Original?.count || kiLatest?.count || 0;
  const dirtyHeaders = summaries.filter((s) => {
    if (!normalize(s.sample)) return true;
    if (expectedCount > 0 && s.count !== expectedCount) return true;
    return false;
  });

  return {
    project,
    headers: summaries,
    x84Original,
    kiLatest,
    dirtyHeaders,
  };
}

function formatProjectLvContext(ctx: any): string {
  if (!ctx) return "- projectLvContext: not loaded\n";

  return [
    "- projectLvContext: loaded",
    `- project: ${ctx.project?.code || ctx.project?.number || ctx.project?.id || ""} / ${ctx.project?.name || ""}`,
    `- lvHeadersCount: ${ctx.headers?.length || 0}`,
    `- x84OriginalTotal: ${ctx.x84Original?.total ?? "unknown"}`,
    `- x84OriginalVersion: ${ctx.x84Original?.version ?? "unknown"}`,
    `- x84OriginalCount: ${ctx.x84Original?.count ?? "unknown"}`,
    `- kiLatestTotal: ${ctx.kiLatest?.total ?? "unknown"}`,
    `- kiLatestVersion: ${ctx.kiLatest?.version ?? "unknown"}`,
    `- kiLatestCount: ${ctx.kiLatest?.count ?? "unknown"}`,
    `- dirtyHeaders: ${(ctx.dirtyHeaders || []).map((h: any) => `v${h.version}:count=${h.count}:total=${h.total}`).join(", ") || "none"}`,
    "- rule: Never invent totals. Use only x84OriginalTotal and kiLatestTotal from this context. In dirtyHeaders, count means number of rows/positions, not number of headers. If unknown, say unknown.",
  ].join("\n") + "\n";
}


function langOf(input: z.infer<typeof ChatSchema>) {
  const l = String((input as any)?.language || "de").toLowerCase().trim();
  if (l === "it" || l === "en" || l === "de") return l as "de" | "it" | "en";
  return "de" as const;
}

function makeSystemPrompt(language: "de" | "it" | "en") {
  const productRules = [
    "",
    "VERBINDLICHE RLC-SOFTWARE-REGELN:",
    "- Der aktuelle RLC-Repository-Kontext ist die primäre Wahrheit über Funktionen und Bedienung.",
    "- Bei Bedienfragen zuerst PAGE/SCREEN, sichtbare UI-Texte und echte UI-Navigation verwenden.",
    "- Eine Route mit /api/ ist IMMER ein technischer API-Endpunkt und NIEMALS ein Navigationsweg für den Benutzer.",
    "- API-Endpunkte nur nennen, wenn ausdrücklich nach API, Backend, Server oder technischer Implementierung gefragt wird.",
    "- Bei 'Wo finde ich ...?' zuerst den sichtbaren Menüpfad bzw. die Seite im Programm nennen.",
    "- Bei 'Wie funktioniert ...?' den tatsächlichen Bedienablauf aus PAGE/SCREEN und vorhandenem Workflow erklären.",
    "- MOBILE, WEB, PLATFORM ADMIN und SERVER strikt voneinander unterscheiden.",
    "- Für Mobile-Fragen primär Mobile-Screens und den dort belegten Ablauf verwenden.",
    "- Für Web-Fragen primär Web-Pages, Menüs und UI-Routen verwenden.",
    "- PLATFORM ADMIN niemals mit der normalen Firmen-Nutzerverwaltung verwechseln.",
    "- Technische API-Routen, Services und Libraries dienen nur als Sekundärbeleg, nicht als Benutzeranleitung.",
    "- Keine allgemein plausiblen Softwarefunktionen ergänzen, wenn sie im gelieferten RLC-Kontext nicht belegt sind.",
    "- Keine Felder, Buttons, Schritte oder Funktionen erfinden.",
    "- Keine veralteten manuellen Beschreibungen verwenden, wenn der aktuelle Repository-Kontext etwas anderes zeigt.",
    "- Priorität bei Bedienfragen: SCREEN/PAGE > UI-Route/UI-Text > Workflow-Code > API > allgemeines Alt-Wissen.",
    "- Wenn etwas im Repository-Kontext nicht sicher belegt ist, dies kurz sagen statt zu raten.",
  ].join("\n");

  if (language === "it") {
    return (
      "Sei l'assistente di supporto di RLC Bausoftware.\n" +
      "Rispondi esclusivamente in italiano.\n" +
      "Sii pratico, operativo e preciso.\n" +
      "Non inventare dati. Se manca un'informazione, dichiaralo chiaramente.\n" +
      productRules
    );
  }

  if (language === "en") {
    return (
      "You are the support assistant for RLC Bausoftware.\n" +
      "Answer only in English.\n" +
      "Be practical, operational and precise.\n" +
      "Do not invent data. If information is missing, state that clearly.\n" +
      productRules
    );
  }

  return (
    "Du bist der Support-Assistent der RLC Bausoftware.\n" +
    "Antworte ausschließlich auf Deutsch.\n" +
    "Sei praktisch, operativ und präzise.\n" +
    "Auch wenn der Nutzer auf Italienisch schreibt, antworte trotzdem auf Deutsch.\n" +
    "Erfinde keine Daten. Wenn eine Information nicht belegt ist, sage das klar.\n" +
    "Wenn Projekt-LV-Kontext vorhanden ist, nutze ausschließlich die dort angegebenen Summen.\n" +
    productRules
  );
}

/**
 * =========================================================
 * Rule-based answers with i18n (de/it/en)
 * =========================================================
 */
function buildRuleBasedAnswer(
  input: z.infer<typeof ChatSchema>
): {
  handled: boolean;
  type: ReplyType;
  answer: string;
  actions?: Array<{
    id: string;
    label: string;
    kind: "NAVIGATE" | "RUN" | "OPEN_URL";
    payload?: any;
  }>;
} {
  const msg = normalize(input.message).toLowerCase();
  const mode = input.mode || "SERVER_SYNC";
  const ctx = input.context || {};
  const pending = typeof ctx.pending === "number" ? ctx.pending : null;
  const language = langOf(input);

  // i18n helper
  const t = (k: string, vars?: Record<string, any>) => {
    const v = vars || {};
    const dict: Record<string, Record<"de" | "it" | "en", string>> = {
      queue_locked_answer: {
        de:
          "Es sieht so aus, als wäre die Offline-Queue GESPERRT (queueLocked=true).\n\n" +
          "✅ Sofortmaßnahmen:\n" +
          "1) Öffne Inbox (Offline) und prüfe, ob ein Eintrag im Status ERROR steht.\n" +
          "2) Falls ja: öffnen und „Wiederholen“ oder „Abbrechen“ (falls vorhanden) drücken.\n" +
          "3) Wenn es nicht frei wird: App neu starten und Sync erneut ausführen.\n\n" +
          "Wenn du mir lastError einfügst, sage ich dir genau, wo wir fixen müssen.",
        it:
          "Sembra che la coda offline sia BLOCCATA (queueLocked=true).\n\n" +
          "✅ Cosa fare subito:\n" +
          "1) Apri Inbox (Offline) e controlla se c’è un item in stato ERROR.\n" +
          "2) Se c’è, aprilo e premi 'Riprova' oppure 'Annulla' (se previsto).\n" +
          "3) Se non si sblocca: riavvia l’app e riprova Sync.\n\n" +
          "Se mi incolli l’ultimo errore (lastError) ti dico esattamente dove intervenire.",
        en:
          "It looks like the offline queue is LOCKED (queueLocked=true).\n\n" +
          "✅ Do this now:\n" +
          "1) Open Inbox (Offline) and check if any item is in ERROR state.\n" +
          "2) If yes: open it and press 'Retry' or 'Cancel' (if available).\n" +
          "3) If it stays locked: restart the app and run Sync again.\n\n" +
          "If you paste lastError, I’ll tell you exactly where to patch.",
      },

      go_inbox_label: {
        de: "Inbox öffnen",
        it: "Apri Inbox",
        en: "Open Inbox",
      },

      pending_high_answer: {
        de:
          `Du hast ${v.pending} Elemente „pending“.\n\n` +
          "✅ Operativer Vorschlag:\n" +
          "- Sync jetzt ausführen (SERVER_SYNC)\n" +
          "- Falls es fehlschlägt: „Eingang / Prüfung“ öffnen und prüfen, was auf ERROR steht\n" +
          "- In NUR_APP ist das normal: pending bleibt lokal, bis du auf SERVER_SYNC wechselst.",
        it:
          `Hai ${v.pending} elementi in pending.\n\n` +
          "✅ Consiglio operativo:\n" +
          "- Fai Sync ora (SERVER_SYNC)\n" +
          "- Se fallisce, apri 'Eingang / Prüfung' e verifica cosa resta in errore\n" +
          "- Se sei in NUR_APP, è normale: i pending restano locali finché non passi a SERVER_SYNC.",
        en:
          `You have ${v.pending} pending items.\n\n` +
          "✅ What to do:\n" +
          "- Run Sync now (SERVER_SYNC)\n" +
          "- If it fails: open 'Eingang / Prüfung' and check what is in ERROR\n" +
          "- In NUR_APP this is normal: pending stays local until you switch to SERVER_SYNC.",
      },

      ba_missing_answer: {
        de:
          "Für Sync / Eingang-Prüfung / Server-PDFs brauchst du einen gültigen BA-Code (z.B. BA-2026-001).\n\n" +
          "✅ Check:\n" +
          "- Das Projekt muss serverseitig ein „code“ Feld haben\n" +
          "- Mobile muss projectCode korrekt mappen (z.B. via /api/projects)\n\n" +
          "Wenn du mir projectId + den Code aus ProjectsScreen gibst, prüfe ich, ob das Mapping stimmt.",
        it:
          "Per usare Sync / Eingang-Prüfung / PDFs dal server serve un BA-Code valido (es. BA-2026-001).\n\n" +
          "✅ Check:\n" +
          "- Il progetto deve avere code valorizzato lato server\n" +
          "- Il mobile risolve projectCode via map o via /api/projects\n\n" +
          "Se mi dici l’ID progetto e il code che vedi in ProjectsScreen, ti dico se il mapping è corretto.",
        en:
          "To use Sync / Eingang-Prüfung / server PDFs you need a valid BA code (e.g. BA-2026-001).\n\n" +
          "✅ Check:\n" +
          "- Project must have a server-side 'code'\n" +
          "- Mobile must resolve projectCode correctly (e.g. via /api/projects)\n\n" +
          "If you send projectId + the code shown in ProjectsScreen, I’ll confirm whether the mapping is correct.",
      },

      iterator_error_answer: {
        de:
          "Dieser Fehler bedeutet fast immer: eine Funktion wird mit der falschen Signatur aufgerufen.\n\n" +
          "Bei uns (RLC mobile) ist die wahrscheinliche Ursache: In PhotosNotesScreen wird die KI mit 2 Argumenten statt einem Payload-Objekt aufgerufen, oder es wird kiSuggest statt kiPhotosSuggest verwendet.\n\n" +
          "✅ Quick-Fix:\n" +
          "- api.kiPhotosSuggest(payloadObjekt) nutzen ODER api.kiSuggest({ ...payload })\n" +
          "- KI-Modal immer schließbar machen (nicht blockierend), damit die UI nie hängen bleibt.",
        it:
          "Questo errore è tipicamente una chiamata funzione fatta con firma sbagliata.\n\n" +
          "Nel nostro caso (RLC mobile) la causa probabile è in PhotosNotesScreen: viene invocata la KI con 2 argomenti invece di un payload unico, oppure si sta usando kiSuggest invece di kiPhotosSuggest.\n\n" +
          "✅ Fix rapido:\n" +
          "- usare api.kiPhotosSuggest(payloadUnico) oppure api.kiSuggest({ ...payload })\n" +
          "- rendere il modal KI sempre chiudibile (non-bloccante) per evitare lock UI.",
        en:
          "This error typically means a function is called with the wrong signature.\n\n" +
          "In our case (RLC mobile) the likely cause is: PhotosNotesScreen calls the AI with 2 arguments instead of one payload object, or uses kiSuggest instead of kiPhotosSuggest.\n\n" +
          "✅ Quick fix:\n" +
          "- Use api.kiPhotosSuggest(payloadObject) OR api.kiSuggest({ ...payload })\n" +
          "- Make the AI modal always closable (non-blocking) so the UI never gets stuck.",
      },
    };

    const entry = dict[k];
    if (!entry) return "";
    return entry[language] || entry.de;
  };

  // 1) Queue locked / stuck
  if (ctx.queueLocked === true || (msg.includes("queue") && msg.includes("lock"))) {
    return {
      handled: true,
      type: "critical",
      answer: t("queue_locked_answer"),
      actions: [
        {
          id: "go_inbox",
          label: t("go_inbox_label"),
          kind: "NAVIGATE",
          payload: { screen: "Inbox" },
        },
      ],
    };
  }

  // 2) Pending high
  if (pending !== null && pending >= 10) {
    return {
      handled: true,
      type: "warning",
      answer: t("pending_high_answer", { pending }),
    };
  }

  // 3) BA code missing / server functions
  const talksAboutBa =
    (msg.includes("ba") && msg.includes("code")) ||
    msg.includes("ba-") ||
    msg.includes("projekt code");

  const projectCodeInvalid =
    input.projectCode ? !/^ba-\d{4}-\d{3,}/i.test(input.projectCode) : true;

  if (mode === "SERVER_SYNC" && talksAboutBa && projectCodeInvalid) {
    return {
      handled: true,
      type: "fix",
      answer: t("ba_missing_answer"),
    };
  }

  // 4) Photos / Notes KI “iterator method is not callable”
  if (
    msg.includes("iterator method is not callable") ||
    (msg.includes("iterator") && msg.includes("callable"))
  ) {
    return {
      handled: true,
      type: "fix",
      answer: t("iterator_error_answer"),
    };
  }

  // default: not handled → AI fallback
  return {
    handled: false,
    type: "info",
    answer: "",
  };
}

async function aiFallbackAnswer(input: z.infer<typeof ChatSchema>) {
  const language = langOf(input);
  const ctx: Record<string, any> = input.context || {};
  const projectLvContext = await loadProjectLvContext(input);
  const projectLvContextText = formatProjectLvContext(projectLvContext);

  const systemSections: string[] = [
    makeSystemPrompt(language),
    "Du bist der zentrale RLC Copilot und nicht nur ein Support-Bot.",
    "Du beantwortest auch allgemeine Fragen, die nichts mit RLC oder Bau zu tun haben.",
    "Nutze Software-, Projekt- und Seitenkontext nur, wenn er zur konkreten Frage passt.",
    "Antworte direkt auf die tatsächliche Nutzerfrage. Wiederhole keine Standardtexte.",
    "Erfinde keine Funktionen, Aktionen, Werte oder Projektdaten.",
  ];

  const clientSystemPrompt = normalize(input.systemPrompt);
  if (clientSystemPrompt) {
    systemSections.push(`CLIENT-SYSTEMPROMPT:\n${clientSystemPrompt}`);
  }

  systemSections.push(`SERVER-PROJEKT-LV-KONTEXT:\n${projectLvContextText}`);

  const repositoryPlatform =
    String(ctx.source || "").toLowerCase().includes("mobile")
      ? ("MOBILE" as const)
      : null;

  const repositoryContext = formatSoftwareIntelligenceContext(
    normalize(input.originalMessage || input.message),
    {
      platform: repositoryPlatform,
      currentPath: normalize(
        ctx.pathname ||
        ctx.path ||
        ctx.page ||
        ""
      ),
      screen: normalize(ctx.screen || ""),
      limit: 8,
    }
  );

  systemSections.push(
    `RLC-REPOSITORY-SOFTWARE-INTELLIGENCE:
${repositoryContext}`
  );

  /*
   * The repository context is the source of truth for RLC operation.
   * The AI must not fill gaps with generic software assumptions.
   */
  systemSections.push(
    [
      "VERBINDLICHE RLC-SOFTWARE-ANTWORTREGELN:",
      "- Bei Fragen zu RLC-Funktionen, Navigation, Rollen, Datenfeldern oder Workflows darfst du nur Informationen verwenden, die im RLC-Repository-Kontext oder im aktuellen Seiten-/Projektkontext belegt sind.",
      "- Erfinde keine Eingabefelder, Geräteinformationen, Rollen, Berechtigungen, Freigabeschritte, Exporte oder Bearbeitungsfunktionen.",
      "- Verwende keine ungesicherten Formulierungen wie 'in der Regel', 'möglicherweise', 'sollte', 'kannst du vermutlich' oder allgemeine Standardabläufe.",
      "- Wenn ein Detail nicht belegt ist, sage klar: 'Dieses Detail ist im aktuellen RLC-Kontext nicht belegt.'",
      "- Erkläre zuerst den belegten Ablauf und nenne nur dann einen Bildschirm oder eine Navigation, wenn er/sie im Kontext vorhanden ist.",
      "- X84 ist im RLC-Kontext keine 'Kalibrierung'. Bei Fragen zur KI ohne X84 erkläre ausschließlich die autonome Urkalkulation und dass X84 nicht als Preisquelle vorausgesetzt wird, sofern dies im Kontext belegt ist.",
      "- Bei CAD nenne keine Bearbeitungsfunktion für Geometrie oder Layer, wenn sie im Kontext nicht ausdrücklich belegt ist.",
      "- Antworte knapp, konkret und in der Sprache der Nutzerfrage.",
    ].join("\n")
  );

  const optionalContext: Array<[string, unknown]> = [
    ["RLC-SOFTWARE-KNOWLEDGE", ctx.softwareKnowledge],
    ["AKTUELLER SEITENZUSTAND", ctx.pageRuntime],
    ["AUFMASS-EDITOR-KONTEXT", ctx.aufmasseditor],
    ["PROJEKTKONTEXT", ctx.project],
    ["KALKULATIONSKONTEXT", ctx.kalkulation],
    ["KALKULATIONSDATENBANK-KONTEXT", ctx.kalkulationsdatenbank],
    ["GAEB-KONTEXT", ctx.gaeb],
    ["UI-KONTEXT", ctx.ui],
  ];

  for (const [title, value] of optionalContext) {
    if (value !== undefined && value !== null) {
      systemSections.push(`${title}:\n${safeJson(value)}`);
    }
  }

  const completion = await completeRlcAiText({
    purpose: "copilot",
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content: systemSections.filter(Boolean).join("\n\n"),
      },
      {
        role: "user",
        content: input.message,
      },
    ],
  });

  const answer = completion.text.trim() || "Ok.";
  return {
    type: "info" as ReplyType,
    answer,
    ai: {
      provider: completion.provider,
      model: completion.model,
      mode: completion.mode,
      fallbackUsed: completion.fallbackUsed,
      latencyMs: completion.latencyMs,
    },
  };
}

r.post(
  "/chat",
  requireAuth,
  requireServerLicense(),
  requireVerifiedEmail,
  requireCompany,
  requireActiveSubscription,
  async (req: any, res) => {
    try {
      const parsed = ChatSchema.parse(req.body || {});
      const rule = buildRuleBasedAnswer(parsed);

      if (rule.handled) {
        return res.json({
          ok: true,
          type: rule.type,
          answer: rule.answer,
          actions: rule.actions || [],
        });
      }

      const ai = await aiFallbackAnswer(parsed);
      return res.json({
        ok: true,
        type: ai.type,
        answer: ai.answer,
        actions: [],
        ai: ai.ai,
      });
    } catch (e: any) {
      console.error("POST /api/support/chat failed:", e);
      const status = e?.name === "ZodError" ? 400 : 503;
      return res.status(status).json({
        ok: false,
        error: e?.message || "bad request",
      });
    }
  }
);

export default r;
