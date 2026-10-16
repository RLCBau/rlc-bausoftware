import { StyleSheet } from "react-native";

export const COLORS = {
  bg: "#EAF1F8",
  card: "#FFFFFF",
  card2: "#EEF5FC",
  sectionBg: "#F5F9FE",
  projectBg: "#F4F9FF",
  primary: "#0A68EC",
  primaryDark: "#0754BE",
  accent: "#0A68EC",
  accentDark: "#0754BE",
  accentSoft: "#D7E9FF",
  accentFaint: "#EAF3FF",
  sky: "#18A8F5",
  navy: "#123B67",
  navyDark: "#071D36",
  text: "#132238",
  textLight: "#FFFFFF",
  muted: "#5E6D84",
  sub: "#5E6D84",
  border: "#B9CADD",
  borderStrong: "#9FB6D0",
  primaryBorder: "#8EB5F2",
  soft: "#E4ECF5",
  inputBg: "#FFFFFF",
  overlay: "rgba(15,23,42,0.42)",
  success: "#168A52",
  successBg: "#ECF8F1",
  successSoft: "#CDEEDC",
  warning: "#D98400",
  warningBg: "#FFF7E8",
  danger: "#D63A46",
  dangerBg: "#FFF0F1",
  fix: "#146EF5",
  fixBg: "#EAF2FF",
};
export const RLC_SPACING = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
  page: 12,
  card: 12,
  gap: 9,
  bottomKi: 84,
} as const;
export const RLC_RADIUS = {
  small: 7,
  input: 9,
  card: 10,
  hero: 14,
  button: 9,
  pill: 999,
} as const;
export const RLC_TYPOGRAPHY = {
  pageTitle: { fontSize: 23, lineHeight: 28, fontWeight: "600", letterSpacing: -0.2 },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 12, lineHeight: 17, fontWeight: "500" },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "400" },
  button: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
  navigationTitle: { fontSize: 17, fontWeight: "600" },
  navigationBack: { fontSize: 14, fontWeight: "400" },
} as const;
export const RLC_CONTROL = {
  minHeight: 42,
  compactMinHeight: 36,
  iconSize: 36,
  inputPaddingHorizontal: 12,
  buttonPaddingHorizontal: 14,
} as const;
export const RLC_TEXT_SCALING = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.2,
} as const;

const COLOR_ALIASES: Record<string, string> = {
  "#ffffff": COLORS.card,
  "#fff": COLORS.card,
  white: COLORS.card,
  "#f7f9fc": COLORS.bg,
  "#f5f8ff": COLORS.accentFaint,
  "#eaf2ff": COLORS.accentSoft,
  "#dde5f0": COLORS.border,
  "#bed6ff": COLORS.primaryBorder,
  "#146ef5": COLORS.accent,
  "#0b5bd3": COLORS.accentDark,
  "#172033": COLORS.text,
  "#6d7890": COLORS.sub,
  "#f4f7fb": COLORS.bg,
  "#f8fafc": COLORS.card2,
  "#eef2f7": COLORS.soft,
  "#e2e8f0": COLORS.border,
  "#dbe4f0": COLORS.border,
  "#cbd5e1": COLORS.borderStrong,
  "#0f172a": COLORS.text,
  "#334155": COLORS.text,
  "#64748b": COLORS.sub,
  "#94a3b8": COLORS.sub,
  "#2563eb": COLORS.accent,
  "#0b57d0": COLORS.accentDark,
  "#1d4ed8": COLORS.accentDark,
  "#b91c1c": COLORS.danger,
  "#15803d": COLORS.success,
  "#166534": COLORS.success,
};

const COLOR_KEYS = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "shadowColor",
  "textDecorationColor",
  "tintColor",
]);

function normalizeColor(value: unknown) {
  if (typeof value !== "string") return value;
  return COLOR_ALIASES[value.trim().toLowerCase()] || value;
}

function normalizeScreenRule(
  screenName: string,
  styleName: string,
  input: Record<string, any>
) {
  const rule: Record<string, any> = { ...input };
  const name = styleName.toLowerCase();

  for (const key of Object.keys(rule)) {
    if (COLOR_KEYS.has(key)) rule[key] = normalizeColor(rule[key]);
  }

  if (
    typeof rule.fontWeight === "number" &&
    rule.fontWeight >= 700
  ) {
    rule.fontWeight = "600";
  } else if (
    typeof rule.fontWeight === "string" &&
    Number(rule.fontWeight) >= 700
  ) {
    rule.fontWeight = "600";
  }

  if (/title|heading|headline|headertext|strong/.test(name) && rule.fontWeight) {
    rule.fontWeight = "600";
  }

  if (/card|panel|box|modal|section/.test(name)) {
    if (typeof rule.borderRadius === "number" && rule.borderRadius > RLC_RADIUS.card) {
      rule.borderRadius = RLC_RADIUS.card;
    }
    if ("shadowOpacity" in rule) rule.shadowOpacity = 0;
    if ("shadowRadius" in rule) rule.shadowRadius = 0;
    if ("elevation" in rule) rule.elevation = 0;
  }

  if (/input|search|select/.test(name)) {
    if (rule.borderWidth == null) rule.borderWidth = 1;
    if (rule.borderColor == null) rule.borderColor = COLORS.border;
    if (rule.backgroundColor == null) rule.backgroundColor = COLORS.inputBg;
    rule.borderRadius = RLC_RADIUS.input;
  }

  if (
    /(btn|button)$/.test(name) &&
    !/(text|txt|label|icon)/.test(name)
  ) {
    if (typeof rule.borderRadius !== "number" || rule.borderRadius > RLC_RADIUS.button) {
      rule.borderRadius = RLC_RADIUS.button;
    }
  }

  if (/^(rowcard|navcard|linecard|histcard|attcard|projectcard|itemcard)$/.test(name)) {
    rule.backgroundColor = COLORS.card;
    rule.borderWidth = 0;
    rule.borderRadius = 0;
    rule.borderBottomWidth = 1;
    rule.borderBottomColor = COLORS.border;
    rule.shadowOpacity = 0;
    rule.shadowRadius = 0;
    rule.elevation = 0;
  }

  if (/^(headercard|topcard|maincard)$/.test(name)) {
    rule.backgroundColor = "transparent";
    rule.borderWidth = 0;
    rule.borderRadius = 0;
    rule.borderBottomWidth = 1;
    rule.borderBottomColor = COLORS.border;
    rule.shadowOpacity = 0;
    rule.shadowRadius = 0;
    rule.elevation = 0;
  }

  if (screenName === "StartScreen") {
    if (name === "herotop") {
      Object.assign(rule, {
        minHeight: 78,
        backgroundColor: COLORS.card,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
      });
    }
    if (name === "planlinea" || name === "planlineb") rule.display = "none";
    if (name === "bodycard") {
      rule.backgroundColor = "transparent";
      rule.paddingHorizontal = 2;
    }
    if (name === "brandrlc") rule.color = COLORS.accent;
    if (name === "brandname" || name === "brandmobile") rule.color = COLORS.text;
    if (name === "serverpill") {
      rule.backgroundColor = COLORS.accentSoft;
      rule.borderColor = COLORS.primaryBorder;
    }
    if (name === "servertxt") rule.color = COLORS.accentDark;
    if (name === "infocard") {
      rule.borderWidth = 1;
      rule.borderColor = COLORS.primaryBorder;
      rule.borderRadius = RLC_RADIUS.card;
      rule.backgroundColor = COLORS.accentFaint;
      rule.shadowOpacity = 0;
      rule.elevation = 0;
    }
  }

  if (screenName === "ProjectHomeScreen") {
    if (name === "header" || name === "synccard") {
      rule.backgroundColor = COLORS.card;
      rule.borderColor = COLORS.border;
      rule.borderBottomColor = COLORS.border;
      rule.shadowOpacity = 0;
      rule.shadowRadius = 0;
      rule.elevation = 0;
    }
    if (
      [
        "backtxt",
        "modetxt",
        "brandtop",
        "synctitle",
        "syncpilltxt",
        "badgetxt",
      ].includes(name)
    ) {
      rule.color = COLORS.text;
    }
    if (["brandsub", "syncsub"].includes(name)) rule.color = COLORS.sub;
    if (["backbtn", "modepill", "syncpill", "badge"].includes(name)) {
      rule.backgroundColor = COLORS.card2;
      rule.borderColor = COLORS.border;
    }
    if (name === "projectherocard") {
      rule.backgroundColor = COLORS.accentFaint;
      rule.borderColor = COLORS.primaryBorder;
    }
    if (name === "card") {
      rule.backgroundColor = COLORS.card;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderRadius = RLC_RADIUS.card;
      rule.shadowOpacity = 0;
      rule.shadowRadius = 0;
      rule.elevation = 0;
    }
    if (name === "navcard") {
      rule.backgroundColor = COLORS.card;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderRadius = RLC_RADIUS.small;
      rule.marginBottom = 6;
    }
    if (name === "synccard") {
      rule.backgroundColor = COLORS.accentSoft;
      rule.borderColor = COLORS.primaryBorder;
    }
  }

  if (["ProjectsScreen", "InboxScreen", "MengenListScreen"].includes(screenName) && ["headercard", "topcard"].includes(name)) {
    rule.marginHorizontal = 0;
    rule.marginTop = 0;
    rule.paddingHorizontal = RLC_SPACING.page;
    rule.backgroundColor = COLORS.card;
    rule.borderBottomColor = COLORS.borderStrong;
  }

  if (screenName === "ProjectsScreen") {
    if (name === "listwrap") rule.backgroundColor = COLORS.bg;
    if (name === "card" || name === "projectcard") {
      rule.backgroundColor = COLORS.projectBg;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderLeftWidth = 4;
      rule.borderLeftColor = COLORS.accent;
      rule.borderRadius = RLC_RADIUS.card;
      rule.marginBottom = 8;
      rule.paddingHorizontal = 12;
      rule.shadowOpacity = 0;
      rule.shadowRadius = 0;
      rule.elevation = 0;
    }
  }

  if (["RegieScreen", "LieferscheinScreen", "PhotosNotesScreen"].includes(screenName)) {
    if (name === "card" || name === "section") {
      rule.backgroundColor = name === "section" ? COLORS.sectionBg : COLORS.card;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderRadius = RLC_RADIUS.card;
    }
    if (name === "headerrow" || name === "pageheading") {
      rule.paddingBottom = 9;
      rule.borderBottomWidth = 1;
      rule.borderBottomColor = COLORS.primaryBorder;
    }
    if (name === "modepill" || name === "pill") {
      rule.backgroundColor = COLORS.accentFaint;
      rule.borderColor = COLORS.primaryBorder;
    }
    if (name === "modetxt" || name === "pilltxt") {
      rule.color = COLORS.accentDark;
    }
    if (name === "h2") {
      rule.marginTop = 2;
      rule.color = COLORS.sub;
    }
    if (name === "sectionh" || name === "sectiontitle") {
      rule.color = COLORS.navy;
    }
    if (name === "linecard") {
      rule.backgroundColor = COLORS.card2;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.borderStrong;
      rule.borderRadius = RLC_RADIUS.small;
    }
  }

  if (screenName === "RechnungListScreen") {
    if (name === "headercard") {
      rule.backgroundColor = COLORS.accentFaint;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.primaryBorder;
      rule.borderRadius = RLC_RADIUS.card;
      rule.paddingHorizontal = RLC_SPACING.card;
      rule.paddingVertical = RLC_SPACING.card;
      rule.marginBottom = 2;
    }
    if (name === "card") {
      rule.backgroundColor = COLORS.card;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderLeftWidth = 3;
      rule.borderLeftColor = COLORS.accent;
      rule.borderRadius = RLC_RADIUS.card;
      rule.paddingHorizontal = RLC_SPACING.card;
      rule.paddingVertical = RLC_SPACING.card;
      rule.marginBottom = 9;
    }
    if (name === "summary") {
      rule.backgroundColor = COLORS.card;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.primaryBorder;
      rule.borderBottomWidth = 2;
      rule.borderRadius = RLC_RADIUS.small;
      rule.paddingHorizontal = 7;
    }
    if (name === "amount") {
      rule.backgroundColor = COLORS.card2;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderRadius = RLC_RADIUS.small;
      rule.padding = 7;
    }
  }

  if (screenName === "RechnungEditorScreen") {
    if (["formcard", "modulecard", "actioncard", "rowcard"].includes(name)) {
      rule.backgroundColor = COLORS.card;
      rule.borderWidth = 1;
      rule.borderColor = COLORS.border;
      rule.borderRadius = RLC_RADIUS.card;
    }
    if (name === "sourcebox") {
      rule.backgroundColor = COLORS.accentFaint;
      rule.borderColor = COLORS.primaryBorder;
    }
    if (name === "sumbox") {
      rule.backgroundColor = COLORS.accentSoft;
      rule.borderColor = COLORS.primaryBorder;
    }
  }

  if (screenName === "LoginScreen") {
    if (name === "sectioncard") {
      rule.backgroundColor = COLORS.card;
      rule.borderColor = COLORS.borderStrong;
    }
    if (name === "passwordrow") {
      rule.backgroundColor = COLORS.card;
      rule.borderColor = COLORS.primaryBorder;
    }
  }

  /*
   * RLC_MOBILE_COMPACT_TYPOGRAPHY_V4
   *
   * Eingang / Prüfung remains the typography reference. Only text size and
   * line height are normalized here. Card geometry, spacing, borders and
   * screen-specific surfaces remain those of the approved Design System.
   */
  const compactTypography =
    screenName.endsWith("Screen") && screenName !== "EingangPruefungScreen";

  if (compactTypography) {
    const cap = (key: string, maximum: number) => {
      if (typeof rule[key] === "number" && rule[key] > maximum) {
        rule[key] = maximum;
      }
    };

    const iconText = /icon|chev|arrow|close|delete|remove|glyph/.test(name);
    const pageHeading = /^(h1|pagetitle|headertitle|herotitle|maintitle|screentitle|identityname)$/.test(name);
    const sectionHeading = /^(h2|sectionh|sectiontitle|cardtitle|modaltitle|modalh|emptytitle|listtitle)$/.test(name);
    const metricText = /statvalue|metricvalue|amountvalue|totalvalue|sumvalue|clockvalue|pricevalue|(^|_)gp$|^pos$/.test(name);
    const compactText = /label|caption|eyebrow|hint|meta|muted|sub|badge.*txt|pill.*txt|chip.*txt|tab.*txt/.test(name);
    const buttonText = /(btn|button|action|submit|save).*?(txt|text)$|^(primarytext|secondarytext|btntxt|actiontxt)$/.test(name);

    if (typeof rule.fontSize === "number" && !iconText) {
      if (pageHeading) rule.fontSize = Math.min(rule.fontSize, 18);
      else if (sectionHeading) rule.fontSize = Math.min(rule.fontSize, 15);
      else if (metricText) rule.fontSize = Math.min(rule.fontSize, 17);
      else if (compactText) rule.fontSize = Math.min(rule.fontSize, 12);
      else if (buttonText) rule.fontSize = Math.min(rule.fontSize, 13);
      else rule.fontSize = Math.min(rule.fontSize, 15);
    }

    if (typeof rule.lineHeight === "number") {
      if (pageHeading) cap("lineHeight", 27);
      else if (sectionHeading) cap("lineHeight", 22);
      else cap("lineHeight", 20);
    }

  }

  return rule;
}

/**
 * Unico ingresso per gli stili delle schermate Mobile.
 * Ogni foglio locale passa da qui: colori, pesi, raggi, campi e superfici
 * vengono normalizzati dai token RLC prima di arrivare a React Native.
 */
export function createRlcStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>
>(
  screenName: string,
  definitions: T & StyleSheet.NamedStyles<any>
): T {
  const normalized = Object.fromEntries(
    Object.entries(definitions).map(([styleName, rule]) => [
      styleName,
      normalizeScreenRule(screenName, styleName, rule || {}),
    ])
  );

  return StyleSheet.create(normalized as any) as unknown as T;
}
