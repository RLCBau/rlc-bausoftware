import { StyleSheet } from "react-native";

export const COLORS = {
  bg: "#F7F9FC",
  card: "#FFFFFF",
  card2: "#F9FBFE",
  primary: "#146EF5",
  primaryDark: "#0B5BD3",
  accent: "#146EF5",
  accentDark: "#0B5BD3",
  accentSoft: "#EAF2FF",
  accentFaint: "#F5F8FF",
  sky: "#24B4FF",
  navy: "#123B67",
  navyDark: "#061A33",
  text: "#172033",
  textLight: "#FFFFFF",
  muted: "#6D7890",
  sub: "#6D7890",
  border: "#DDE5F0",
  primaryBorder: "#BED6FF",
  soft: "#EEF3F8",
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

  if (
    /^(card|rowcard|navcard|linecard|histcard|attcard|projectcard|itemcard)$/.test(name)
  ) {
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
      rule.borderWidth = 0;
      rule.borderTopWidth = 1;
      rule.borderTopColor = COLORS.border;
      rule.borderRadius = 0;
      rule.backgroundColor = "transparent";
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
  }

  if (
    ["ProjectsScreen", "InboxScreen", "MengenListScreen"].includes(screenName) &&
    ["headercard", "topcard"].includes(name)
  ) {
    rule.marginHorizontal = 0;
    rule.marginTop = 0;
    rule.paddingHorizontal = RLC_SPACING.page;
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
