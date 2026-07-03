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

  showPdfActions?: boolean;
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
      <Pressable
        style={[styles.btn, styles.primary, submitting ? styles.disabled : null]}
        onPress={onSaveOffline}
        disabled={!!submitting}
      >
        <Text style={styles.primaryTxt}>Speichern (offline)</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.dark, submitting ? styles.disabled : null]}
        onPress={onSubmit}
        disabled={!!submitting}
      >
        <Text style={styles.darkTxt}>
          {submitting ? "Einreichen..." : "Einreichen (Inbox + Sync/Queue)"}
        </Text>
      </Pressable>

      {showPdfActions && (
        <View style={styles.row}>
          <Pressable
            style={[
              styles.btn,
              styles.secondary,
              !onOpenPdf ? styles.disabled : null,
            ]}
            onPress={onOpenPdf}
            disabled={!onOpenPdf}
          >
            <Text style={styles.secondaryTxt}>PDF öffnen</Text>
          </Pressable>

          <Pressable
            style={[
              styles.btn,
              styles.secondary,
              !onEmailPdf ? styles.disabled : null,
            ]}
            onPress={onEmailPdf}
            disabled={!onEmailPdf}
          >
            <Text style={styles.secondaryTxt}>E-Mail senden</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={[
          styles.btn,
          styles.secondary,
          !onReset ? styles.disabled : null,
        ]}
        onPress={onReset}
        disabled={!onReset}
      >
        <Text style={styles.secondaryTxt}>Formular leeren</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    marginTop: 10,
  },

  row: {
    flexDirection: "row",
    gap: 10,
  },

  btn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  primary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accentDark,
  },
  primaryTxt: {
    color: COLORS.textLight,
    fontWeight: "800",
  },

  dark: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accent,
  },
  darkTxt: {
    color: COLORS.textLight,
    fontWeight: "800",
  },

  secondary: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flex: 1,
  },
  secondaryTxt: {
    color: COLORS.text,
    fontWeight: "800",
  },

  disabled: {
    opacity: 0.5,
  },
});



