import { completeRlcAiText } from "../../services/ai/rlcAiGateway";

export type RlcQuestionStatus =
  | "REQUIRED"
  | "OPTIONAL"
  | "ALREADY_ANSWERED"
  | "IRRELEVANT";

export type RlcQuestionValidationItem = {
  questionIndex: number;
  status: RlcQuestionStatus;
  reason: string;
};

export type RlcQuestionValidationResult = {
  items: RlcQuestionValidationItem[];
  requiredQuestions: string[];
};

function extractJson(value: string): any {
  const text = String(value || "").trim();

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

export async function validateGeneratedQuestions(input: {
  sourceText: string;
  questions: string[];
  rows: Array<{
    kurztext?: string;
    langtext?: string;
    einheit?: string;
    menge?: number;
  }>;
}): Promise<RlcQuestionValidationResult> {
  const questions = input.questions
    .map((q) => String(q || "").trim())
    .filter(Boolean);

  if (questions.length === 0) {
    return {
      items: [],
      requiredQuestions: [],
    };
  }

  const completion = await completeRlcAiText({
    purpose: "classification",
    responseFormat: "json",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Du prüfst Rückfragen einer Baukalkulation. " +
          "REQUIRED bedeutet: Ohne diese Information kann eine ausdrücklich verlangte Leistung " +
          "nicht belastbar mengenmäßig oder kalkulatorisch bestimmt werden. " +
          "OPTIONAL bedeutet: Die Information verbessert die technische Beschreibung oder Genauigkeit, " +
          "ist aber für die aktuelle LV-Erzeugung oder Kalkulation nicht zwingend erforderlich. " +
          "ALREADY_ANSWERED bedeutet: Die Projektbeschreibung enthält die Information bereits. " +
          "IRRELEVANT bedeutet: Die Frage betrifft keine notwendige Information der beschriebenen Leistung. " +
          "Frage niemals nach technischen Details nur weil sie fachlich interessant wären. " +
          "Antworte ausschließlich mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${input.sourceText}

Erzeugtes LV:
${JSON.stringify(input.rows)}

Zu prüfende Rückfragen:
${JSON.stringify(questions)}

Regeln:
- Bereits im Projekttext vorhandene Angaben => ALREADY_ANSWERED.
- Fehlende Mengen- oder Geometrieangaben, ohne die eine Position nicht berechnet werden kann => REQUIRED.
- Technische Detailangaben, die für die aktuelle Mengen- oder Kostenbestimmung nicht zwingend benötigt werden => OPTIONAL.
- Nicht zur beschriebenen Leistung gehörende Fragen => IRRELEVANT.
- Keine neuen Fragen erzeugen.

JSON exakt:
{
  "items": [
    {
      "questionIndex": 0,
      "status": "REQUIRED|OPTIONAL|ALREADY_ANSWERED|IRRELEVANT",
      "reason": "kurze Begründung"
    }
  ]
}
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: RlcQuestionValidationItem[] = rawItems
    .map((item: any) => {
      const questionIndex = Number(item?.questionIndex);

      const status: RlcQuestionStatus =
        item?.status === "REQUIRED"
          ? "REQUIRED"
          : item?.status === "OPTIONAL"
            ? "OPTIONAL"
            : item?.status === "ALREADY_ANSWERED"
              ? "ALREADY_ANSWERED"
              : "IRRELEVANT";

      return {
        questionIndex,
        status,
        reason: String(item?.reason || "").trim(),
      };
    })
    .filter(
      (item: RlcQuestionValidationItem) =>
        Number.isInteger(item.questionIndex) &&
        item.questionIndex >= 0 &&
        item.questionIndex < questions.length
    );

  const requiredIndexes = new Set(
    items
      .filter((item) => item.status === "REQUIRED")
      .map((item) => item.questionIndex)
  );

  return {
    items,
    requiredQuestions: questions.filter(
      (_question, index) => requiredIndexes.has(index)
    ),
  };
}
