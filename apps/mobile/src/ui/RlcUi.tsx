import React from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from "react-native";
import { COLORS, RLC_SPACING, RLC_RADIUS } from "./theme";

export function RlcPage({
  children,
  scroll = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  if (!scroll) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.page, style]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.page, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function RlcHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function RlcCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function RlcSection({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function RlcButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.button, secondary && s.buttonSecondary, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, secondary && s.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export function RlcInput(props: TextInputProps) {
  return <TextInput {...props} style={[s.input, props.style]} placeholderTextColor={COLORS.sub} />;
}

export function RlcMuted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  page: {
    padding: RLC_SPACING.page,
    paddingBottom: RLC_SPACING.bottomKi,
    gap: RLC_SPACING.gap,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.card,
    borderRadius: RLC_RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.sub,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RLC_RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: RLC_SPACING.card,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.sub,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RLC_RADIUS.button,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.accentDark,
  },
  buttonSecondary: {
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
  },
  buttonText: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 14,
  },
  buttonTextSecondary: {
    color: COLORS.text,
  },
  disabled: {
    opacity: 0.55,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RLC_RADIUS.button,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.text,
    fontWeight: "800",
  },
  muted: {
    color: COLORS.sub,
    fontWeight: "800",
  },
});
