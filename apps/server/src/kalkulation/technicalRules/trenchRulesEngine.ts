import type {
  RlcTrenchRuleInput,
  RlcTrenchRuleResult,
} from "./types";

function round3(v: number): number {
  return Math.round((v + Number.EPSILON) * 1000) / 1000;
}

export function resolveRlcTrenchRules(
  input: RlcTrenchRuleInput
): RlcTrenchRuleResult {
  const length = Number(input.lengthM || 0);
  const depth = Number(input.depthM || 0);
  const explicitWidth = Number(input.explicitWidthM || 0);

  if (explicitWidth > 0) {
    return {
      widthM: explicitWidth,
      excavationM3:
        length > 0 && depth > 0
          ? round3(length * depth * explicitWidth)
          : null,
      source: {
        ruleId: "PROJECT_EXPLICIT_TRENCH_WIDTH",
        standard: "PROJECT_INPUT",
        edition: "current",
        description: "Explizit vorgegebene Grabenbreite",
      },
      status: "resolved",
      assumptions: [],
      questions: [],
    };
  }

  // DIN 4124:2012-01:
  // Kabel-/Endlosleitungsgraben bis 1,25 m Tiefe,
  // der betreten wird, jedoch keinen Arbeitsraum neben der Leitung benötigt.
  if (input.application === "KABEL" && depth > 0 && depth <= 1.25) {
    let width: number;

    if (depth <= 0.70) width = 0.30;
    else if (depth <= 0.90) width = 0.40;
    else if (depth <= 1.00) width = 0.50;
    else width = 0.60;

    return {
      widthM: width,
      excavationM3:
        length > 0
          ? round3(length * depth * width)
          : null,
      source: {
        ruleId: "DIN4124_KABELGRABEN_MIN_WIDTH",
        standard: "DIN 4124",
        edition: "2012-01",
        section: "9.2 / Mindestbreiten für Gräben ohne Arbeitsraum",
        description:
          "Kabel-/Endlosleitungsgraben bis 1,25 m ohne erforderlichen Arbeitsraum neben der Leitung",
      },
      status: "resolved",
      assumptions: [
        "Graben wird betreten.",
        "Neben der Leitung ist kein Arbeitsraum erforderlich.",
      ],
      questions: [],
    };
  }

  // Abwasserkanäle:
  // Die normative Grabenbreite darf nicht allein aus einer DN-Angabe
  // abgeleitet werden. Dafür wird der tatsächliche Außendurchmesser
  // des verwendeten Rohrsystems benötigt.
  if (input.application === "ABWASSER") {
    const dn = Number(input.nominalDiameterMm || 0);
    const outsideDiameter = Number(input.outsideDiameterM || 0);
    const support = input.trenchSupport || "UNKNOWN";
    const slopeAngle = Number(input.slopeAngleDeg || 0);

    if (!(dn > 0) || !(outsideDiameter > 0)) {
      return {
        widthM: null,
        excavationM3: null,
        source: null,
        status: "missing_input",
        assumptions: [],
        questions: [
          "Für die normative Grabenbreite werden DN und tatsächlicher Außendurchmesser des Abwasserrohres benötigt.",
        ],
      };
    }

    if (
      support === "UNKNOWN" ||
      (support === "UNVERBAUT" && !(slopeAngle > 0))
    ) {
      return {
        widthM: null,
        excavationM3: null,
        source: null,
        status: "missing_input",
        assumptions: [],
        questions: [
          "Wird der Abwassergraben verbaut oder unverbaut hergestellt? Bei unverbautem Graben bitte den Böschungswinkel angeben.",
        ],
      };
    }

    let clearanceM: number;

    if (support === "VERBAUT") {
      if (dn <= 225) clearanceM = 0.40;
      else if (dn <= 350) clearanceM = 0.50;
      else if (dn <= 700) clearanceM = 0.70;
      else if (dn <= 1200) clearanceM = 0.85;
      else clearanceM = 1.00;
    } else {
      // DIN EN 1610: bei unverbautem Graben hängt der Zuschlag
      // vom Böschungswinkel ab.
      if (slopeAngle > 60) {
        if (dn <= 225) clearanceM = 0.40;
        else if (dn <= 350) clearanceM = 0.50;
        else if (dn <= 700) clearanceM = 0.70;
        else if (dn <= 1200) clearanceM = 0.85;
        else clearanceM = 1.00;
      } else {
        clearanceM = 0.40;
      }
    }

    const widthByDiameter = outsideDiameter + clearanceM;

    let widthByDepth = 0;

    if (depth >= 1.00 && depth <= 1.75) widthByDepth = 0.80;
    else if (depth > 1.75 && depth <= 4.00) widthByDepth = 0.90;
    else if (depth > 4.00) widthByDepth = 1.00;

    const width = Math.max(widthByDiameter, widthByDepth);

    const excavationM3 =
      length > 0 && depth > 0
        ? round3(length * depth * width)
        : null;

    const pipeVolumeM3 =
      length > 0 && outsideDiameter > 0
        ? round3(
            Math.PI *
            Math.pow(outsideDiameter, 2) /
            4 *
            length
          )
        : null;

    const beddingThickness =
      Number(input.beddingThicknessM || 0);

    const embedmentHeight =
      Number(input.embedmentHeightM || 0);

    const beddingVolumeM3 =
      length > 0 && beddingThickness > 0
        ? round3(length * width * beddingThickness)
        : null;

    const embedmentVolumeM3 =
      length > 0 &&
      embedmentHeight > 0 &&
      pipeVolumeM3 !== null
        ? round3(
            Math.max(
              0,
              length * width * embedmentHeight - pipeVolumeM3
            )
          )
        : null;

    const netBackfillM3 =
      excavationM3 !== null &&
      beddingVolumeM3 !== null &&
      embedmentVolumeM3 !== null
        ? round3(
            Math.max(
              0,
              excavationM3 -
              beddingVolumeM3 -
              embedmentVolumeM3 -
              (pipeVolumeM3 || 0)
            )
          )
        : null;

    return {
      widthM: round3(width),
      excavationM3,
      pipeVolumeM3,
      beddingVolumeM3,
      embedmentVolumeM3,
      netBackfillM3,
      source: {
        ruleId: "DIN_EN_1610_ABWASSER_MIN_TRENCH_WIDTH",
        standard: "DIN EN 1610",
        edition: "2015-12",
        section: "Mindestgrabenbreite",
        description:
          "Mindestgrabenbreite aus Rohrdurchmesser und Grabentiefe; maßgebend ist der größere Wert",
      },
      status: "resolved",
      assumptions: [],
      questions: [],
    };
  }

  /*
   * Normative Tabellen werden hier ausschließlich mit
   * verifizierten Werten hinterlegt.
   *
   * DIN 4124: Baugruben und Gräben / Arbeitsraumbreiten
   * DIN EN 1610: Abwasserleitungen und -kanäle
   *
   * Keine erfundenen DIN-Werte verwenden.
   */

  return {
    widthM: null,
    excavationM3: null,
    source: null,
    status: "rule_not_available",
    assumptions: [],
    questions: [
      "Für diese Grabenart ist noch keine verifizierte normative Breitenregel im RLC-Regelwerk hinterlegt.",
    ],
  };
}
