import React from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";
import { COLORS } from "./theme";

export function RlcPage({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  if (!scroll) {
    return <SafeAreaView style={s.safe}><View style={s.page}>{children}</View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function RlcCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function RlcTitle({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[s.title, style]}>{children}</Text>;
}

export function RlcSubtitle({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[s.subtitle, style]}>{children}</Text>;
}

export function RlcButton({
  title,
  onPress,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable style={[s.button, secondary && s.buttonSecondary]} onPress={onPress}>
      <Text style={[s.buttonText, secondary && s.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  page: {
    padding: 16,
    paddingBottom: 96,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: "#EEF2F7",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  buttonTextSecondary: {
    color: "#0F172A",
  },
});
