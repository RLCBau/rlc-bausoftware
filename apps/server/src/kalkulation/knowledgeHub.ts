import { findExternalKnowledgeMatches } from "../externalKnowledge/externalKnowledgeEngine";

export type RlcKnowledgeHubInput = {
  kurztext?: string;
  langtext?: string;
  text?: string;
  unit?: string;
  family?: string;
};

export type RlcKnowledgeHubResult = {
  externalMatches: ReturnType<typeof findExternalKnowledgeMatches>;
  hasExternalKnowledge: boolean;
  externalKnowledgeConfidence: number;
  technicalNotes: string[];
};

export function resolveRlcKnowledgeHub(input: RlcKnowledgeHubInput): RlcKnowledgeHubResult {
  const externalMatches = findExternalKnowledgeMatches({
    text: input.text,
    kurztext: input.kurztext,
    langtext: input.langtext,
    unit: input.unit,
    family: input.family,
    limit: 5
  });

  const externalKnowledgeConfidence =
    externalMatches.length > 0
      ? Math.max(...externalMatches.map((x) => x.confidence || 0))
      : 0;

  const technicalNotes = externalMatches.map(
    (x) => `Externes Wissen: ${x.title} (${x.sourceName}, confidence ${x.confidence})`
  );

  return {
    externalMatches,
    hasExternalKnowledge: externalMatches.length > 0,
    externalKnowledgeConfidence,
    technicalNotes
  };
}
