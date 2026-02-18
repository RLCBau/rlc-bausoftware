// apps/mobile/src/components/DocActionBar.tsx
import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { COLORS } from "../ui/theme";

type Props = {
  onSaveOffline: () => Promise<void> | void;
  onSubmit: () => Promise<void> | void;

  onOpenPdf?: () => Promise<void> | void;
  onEmailPdf?: () => Promise<void> | void;

  onReset?: () => void;

  showPdfActions?: boolean; // true per TUTTI alla fine
  submitting?: boolean;
};

export function DocActionBar({
  onSaveOffline,
  onSubmit,
  onOpenPdf,
  onEmailPdf,
  onReset,
  showPdfActions = true,
  submitting,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.btn, styles.primary]} onPress={onSaveOffline} disabled={!!submitting}>
        <Text style={styles.primaryTxt}>Speichern (offline)</Text>
      </Pressable>

      <Pressable style={[styles.btn, styles.dark]} onPress={onSubmit} disabled={!!submitting}>
        <Text style={styles.darkTxt}>
          {submitting ? "Einreichen..." : "Einreichen (Inbox + Sync/Queue)"}
        </Text>
      </Pressable>

      {showPdfActions && (
        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.secondary]} onPress={onOpenPdf} disabled={!onOpenPdf}>
            <Text style={styles.secondaryTxt}>PDF öffnen</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.secondary]} onPress={onEmailPdf} disabled={!onEmailPdf}>
            <Text style={styles.secondaryTxt}>E-Mail senden</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={[styles.btn, styles.secondary]} onPress={onReset} disabled={!onReset}>
        <Text style={styles.secondaryTxt}>Formular leeren</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 10 },
  row: { flexDirection: "row", gap: 10 },
  btn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: COLORS.primary },
  primaryTxt: { color: "white", fontWeight: "800" },
  dark: { backgroundColor: "#111" },
  darkTxt: { color: "white", fontWeight: "800" },
  secondary: { borderWidth: 1, borderColor: COLORS.primary, backgroundColor: "white", flex: 1 },
  secondaryTxt: { color: COLORS.primary, fontWeight: "800" },
});
