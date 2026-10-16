import React from "react";
import { SafeAreaView, ScrollView, View, Text, Pressable, TextInput, ViewStyle, TextStyle, TextInputProps } from "react-native";
import { COLORS, RLC_CONTROL, RLC_RADIUS, RLC_SPACING, RLC_TEXT_SCALING, RLC_TYPOGRAPHY, createRlcStyles } from "./theme";
export function RlcPage({
  children,
  scroll = true,
  style
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  if (!scroll) {
    return <SafeAreaView style={s.safe}>
        <View style={[s.page, style]}>{children}</View>
      </SafeAreaView>;
  }
  return <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={[s.page, style]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>;
}
export function RlcHeader({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return <View style={s.header}>
      <View style={s._inline1}>
        <Text {...RLC_TEXT_SCALING} style={s.title}>{title}</Text>
        {subtitle ? <Text {...RLC_TEXT_SCALING} style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>;
}
export function RlcCard({
  children,
  style
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function RlcSection({
  title,
  subtitle,
  children
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return <View style={s.section}>
      {title ? <Text {...RLC_TEXT_SCALING} style={s.sectionTitle}>{title}</Text> : null}
      {subtitle ? <Text {...RLC_TEXT_SCALING} style={s.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>;
}
export function RlcButton({
  title,
  onPress,
  secondary = false,
  disabled = false
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled} style={[s.button, secondary && s.buttonSecondary, disabled && s.disabled]}>
      <Text {...RLC_TEXT_SCALING} style={[s.buttonText, secondary && s.buttonTextSecondary]}>{title}</Text>
    </Pressable>;
}
export function RlcInput(props: TextInputProps) {
  return <TextInput {...RLC_TEXT_SCALING} {...props} style={[s.input, props.style]} placeholderTextColor={COLORS.sub} />;
}
export function RlcMuted({
  children,
  style
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  return <Text {...RLC_TEXT_SCALING} style={[s.muted, style]}>{children}</Text>;
}
const s = createRlcStyles("RlcUi", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  page: {
    padding: RLC_SPACING.page,
    paddingBottom: RLC_SPACING.bottomKi,
    gap: RLC_SPACING.gap,
    backgroundColor: COLORS.bg
  },
  header: {
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  title: {
    ...RLC_TYPOGRAPHY.pageTitle,
    color: COLORS.text
  },
  subtitle: {
    marginTop: 4,
    ...RLC_TYPOGRAPHY.label,
    color: COLORS.sub
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RLC_RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: RLC_SPACING.card
  },
  section: {
    gap: RLC_SPACING.gap,
    paddingVertical: 4
  },
  sectionTitle: {
    ...RLC_TYPOGRAPHY.sectionTitle,
    color: COLORS.text
  },
  sectionSubtitle: {
    ...RLC_TYPOGRAPHY.label,
    color: COLORS.sub
  },
  button: {
    minHeight: RLC_CONTROL.minHeight,
    backgroundColor: COLORS.accent,
    borderRadius: RLC_RADIUS.button,
    paddingVertical: 9,
    paddingHorizontal: RLC_CONTROL.buttonPaddingHorizontal,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.accent
  },
  buttonSecondary: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.primaryBorder
  },
  buttonText: {
    color: COLORS.textLight,
    ...RLC_TYPOGRAPHY.button
  },
  buttonTextSecondary: {
    color: COLORS.accentDark
  },
  disabled: {
    opacity: 0.55
  },
  input: {
    minHeight: RLC_CONTROL.minHeight,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RLC_RADIUS.input,
    paddingHorizontal: RLC_CONTROL.inputPaddingHorizontal,
    paddingVertical: 9,
    color: COLORS.text,
    ...RLC_TYPOGRAPHY.body
  },
  muted: {
    color: COLORS.sub,
    ...RLC_TYPOGRAPHY.body
  },
  _inline1: {
    flex: 1
  }
});
