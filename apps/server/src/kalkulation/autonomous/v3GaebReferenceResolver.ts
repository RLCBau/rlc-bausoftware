import type { RlcAutonomousCalcInput } from "./types";

export type GaebReferenceDiagnosis = {
  status: "resolved_explicit" | "candidate_previous" | "missing_reference" | "ambiguous_reference" | "incompatible_previous";
  basePosition: string | null;
  evidence: string;
  technicalEvidence: { nominalDiameter: string | null; layerThickness: string | null; material: string | null };
  approvedForEP: false;
};

function features(value: string) {
  const dn = value.match(/\b(?:DN|DA)\s*([0-9]{2,4})\b/i);
  const thick = value.match(/\b([0-9]+(?:[,.][0-9]+)?)\s*(mm|cm)\s*(?:stark|dick|schichtdicke)?\b/i);
  const material = value.match(/\b(PP|PE-HD|PVC|Beton|Granit|Asphalt|Kalksandstein)\b/i);
  return {
    nominalDiameter: dn ? dn[0] : null,
    layerThickness: thick ? thick[0] : null,
    material: material ? material[0] : null,
  };
}

/** Read-only diagnostic: never inherit an EP or assume a prior row is the contractual base. */
export function resolveV3GaebReference(
  row: RlcAutonomousCalcInput, allRows: RlcAutonomousCalcInput[]
): GaebReferenceDiagnosis {
  const text = String(row.kurztext || "") + " " + String(row.langtext || "");
  const base = { basePosition: null, technicalEvidence: features(text), approvedForEP: false as const };
  const own = String(row.posNr || "").trim();
  const same = allRows.findIndex(r => r === row || (!!own && String(r.posNr || "") === own));
  const prior = same > 0 ? allRows.slice(0, same).filter(r => String(r.kurztext || "").trim()) : [];
  const explicit = text.match(/(?:bezugsposition|vorposition|pos(?:ition)?\.?\s*(?:nr\.?)?)\s*[:#-]?\s*(\d+(?:[.\-/]\d+){0,5})/i);
  if (explicit) {
    const candidates = prior.filter(r => String(r.posNr || "").trim() === explicit[1]);
    if (candidates.length === 1) {
      const reference = candidates[0];
      return { ...base, status: "resolved_explicit", basePosition: String(reference.posNr), evidence: "explicit_position_number",
        technicalEvidence: features(text + " " + String(reference.kurztext || "") + " " + String(reference.langtext || "")) };
    }
    return { ...base, status: candidates.length ? "ambiguous_reference" : "missing_reference",
      evidence: "explicit_position_not_unique_or_not_found" };
  }
  if (/\b(?:vorposition|vorherige\s+position|wie\s+vor|wie\s+pos\.?\s+vor)\b/i.test(text) && prior.length) {
    const candidate = prior[prior.length - 1];
    const candidateFeatures = features(String(candidate.kurztext || "") + " " + String(candidate.langtext || ""));
    const currentFeatures = features(text);
    const conflicts = (currentFeatures.nominalDiameter && candidateFeatures.nominalDiameter &&
      currentFeatures.nominalDiameter.replace(/\s+/g, "").toUpperCase() !== candidateFeatures.nominalDiameter.replace(/\s+/g, "").toUpperCase()) ||
      (currentFeatures.material && candidateFeatures.material &&
        currentFeatures.material.toUpperCase() !== candidateFeatures.material.toUpperCase());
    if (conflicts) return { ...base, status: "incompatible_previous", evidence: "technical_parameters_conflict" };
    return { ...base, status: "candidate_previous", basePosition: String(candidate.posNr || "") || null,
      evidence: "implicit_reference_requires_verification" };
  }
  return { ...base, status: "missing_reference", evidence: "no_unambiguous_explicit_reference" };
}
