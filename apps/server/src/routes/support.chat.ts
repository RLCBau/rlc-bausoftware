// apps/server/src/routes/support.chat.ts
import { Router } from "express";
import { z } from "zod";
import OpenAI from "openai";

import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany, requireActiveSubscription } from "../middleware/guards";
import { requireServerLicense } from "../middleware/license";

const r = Router();

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
  message: z.string().min(1).max(5000),
  projectId: z.string().optional(),
  projectCode: z.string().optional(),
  mode: z.enum(["NUR_APP", "SERVER_SYNC"]).optional(),
  // ✅ client sets it; default DE (UI language)
  language: z.enum(["de", "it", "en"]).optional().default("de"),
  context: z
    .object({
      pending: z.number().int().nonnegative().optional(),
      queueLocked: z.boolean().optional(),
      lastError: z.string().optional(),
      screen: z.string().optional(),
      appVersion: z.string().optional(),
      appBuild: z.string().optional(),
      device: z.string().optional(),
    })
    .optional(),
});

type ReplyType = "info" | "warning" | "fix" | "critical";

function normalize(s: any) {
  return String(s || "").trim();
}

function langOf(input: z.infer<typeof ChatSchema>) {
  const l = String((input as any)?.language || "de").toLowerCase().trim();
  if (l === "it" || l === "en" || l === "de") return l as "de" | "it" | "en";
  return "de" as const;
}

function makeSystemPrompt(language: "de" | "it" | "en") {
  if (language === "it") {
    return (
      "Sei l'assistente di supporto di RLC Bausoftware.\n" +
      "Rispondi esclusivamente in italiano.\n" +
      "Sii pratico, operativo, conciso.\n" +
      "Non inventare dati: se manca informazione, chiedi una sola cosa (minima), ma includi comunque una prima diagnosi."
    );
  }
  if (language === "en") {
    return (
      "You are the support assistant for RLC Bausoftware.\n" +
      "Answer only in English.\n" +
      "Be practical, operational, concise.\n" +
      "Do not invent data: if something is missing, ask only one minimal question, but still include a first diagnosis."
    );
  }
  // ✅ default: DE
  return (
    "Du bist der Support-Assistent der RLC Bausoftware.\n" +
    "Antworte ausschließlich auf Deutsch.\n" +
    "Sei praktisch, operativ und präzise.\n" +
    "Auch wenn der Nutzer auf Italienisch schreibt, antworte trotzdem auf Deutsch.\n" +
    "Erfinde keine Daten: wenn Information fehlt, stelle genau eine minimale Rückfrage, aber gib trotzdem eine erste Diagnose."
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
  const apiKey = process.env.OPENAI_API_KEY;
  const language = langOf(input);

  if (!apiKey) {
    if (language === "de") {
      return {
        type: "info" as ReplyType,
        answer:
          "Verstanden. Damit ich dir präzise helfen kann: Welche Ansicht/Seite ist offen und was passiert genau (1–2 Sätze)? " +
          "Wenn es eine Fehlermeldung gibt, kopiere sie bitte hier rein.\n\n" +
          "Hinweis: Erweiterter KI-Support ist nicht aktiv, weil OPENAI_API_KEY auf dem Server fehlt.",
      };
    }
    if (language === "en") {
      return {
        type: "info" as ReplyType,
        answer:
          "Got it. To answer precisely: which screen are you on and what exactly happens (1–2 sentences)? " +
          "If there’s an error message, paste it here.\n\n" +
          "Note: advanced AI support is not active because OPENAI_API_KEY is missing on the server.",
      };
    }
    return {
      type: "info" as ReplyType,
      answer:
        "Ho capito. Per darti una risposta precisa: dimmi quale schermata stai usando e cosa succede (1-2 frasi), e se c’è un messaggio di errore incollamelo qui.\n\n" +
        "Nota: la modalità AI avanzata non è attiva perché manca OPENAI_API_KEY sul server.",
    };
  }

  const client = new OpenAI({ apiKey });
  const ctx = input.context || {};
  const sys = makeSystemPrompt(language);

  const user =
    `User message: ${input.message}\n\n` +
    `Context:\n` +
    `- language: ${language}\n` +
    `- mode: ${input.mode || "SERVER_SYNC"}\n` +
    `- projectId: ${input.projectId || ""}\n` +
    `- projectCode: ${input.projectCode || ""}\n` +
    `- screen: ${ctx.screen || ""}\n` +
    `- pending: ${typeof ctx.pending === "number" ? ctx.pending : ""}\n` +
    `- queueLocked: ${typeof ctx.queueLocked === "boolean" ? String(ctx.queueLocked) : ""}\n` +
    `- lastError: ${ctx.lastError || ""}\n` +
    `- appVersion/build: ${ctx.appVersion || ""} / ${ctx.appBuild || ""}\n` +
    `- device: ${ctx.device || ""}\n`;

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL_SUPPORT || "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });

  const answer = completion.choices?.[0]?.message?.content?.trim() || "Ok.";
  return { type: "info" as ReplyType, answer };
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
      return res.json({ ok: true, type: ai.type, answer: ai.answer, actions: [] });
    } catch (e: any) {
      console.error("POST /api/support/chat failed:", e);
      return res.status(400).json({
        ok: false,
        error: e?.message || "bad request",
      });
    }
  }
);

export default r;
