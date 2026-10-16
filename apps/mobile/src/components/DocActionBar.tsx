// apps/mobile/src/components/DocActionBar.tsx
import React from "react";
import { View, Pressable, Text } from "react-native";
import { COLORS, RLC_CONTROL, RLC_RADIUS, RLC_TEXT_SCALING, RLC_TYPOGRAPHY, createRlcStyles } from "../ui/theme";
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
  submitting
}: Props) {
  return <View style={styles.wrap}>
      <Pressable style={[styles.btn, styles.primary, submitting ? styles.disabled : null]} onPress={onSaveOffline} disabled={!!submitting}>
        <Text {...RLC_TEXT_SCALING} style={styles.primaryTxt}>Speichern (offline)</Text>
      </Pressable>

      <Pressable style={[styles.btn, styles.dark, submitting ? styles.disabled : null]} onPress={onSubmit} disabled={!!submitting}>
        <Text {...RLC_TEXT_SCALING} style={styles.darkTxt}>
          {submitting ? "Einreichen..." : "Einreichen (Inbox + Sync/Queue)"}
        </Text>
      </Pressable>

      {showPdfActions && <View style={styles.row}>
          <Pressable style={[styles.btn, styles.secondary, !onOpenPdf ? styles.disabled : null]} onPress={onOpenPdf} disabled={!onOpenPdf}>
            <Text {...RLC_TEXT_SCALING} style={styles.secondaryTxt}>PDF öffnen</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.secondary, !onEmailPdf ? styles.disabled : null]} onPress={onEmailPdf} disabled={!onEmailPdf}>
            <Text {...RLC_TEXT_SCALING} style={styles.secondaryTxt}>E-Mail senden</Text>
          </Pressable>
        </View>}

      <Pressable style={[styles.btn, styles.secondary, !onReset ? styles.disabled : null]} onPress={onReset} disabled={!onReset}>
        <Text {...RLC_TEXT_SCALING} style={styles.secondaryTxt}>Formular leeren</Text>
      </Pressable>
    </View>;
}
const styles = createRlcStyles("DocActionBar", {
  wrap: {
    gap: 10,
    marginTop: 10
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  btn: {
    minHeight: RLC_CONTROL.minHeight,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: RLC_RADIUS.button,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  primary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accentDark
  },
  primaryTxt: {
    color: COLORS.textLight,
    ...RLC_TYPOGRAPHY.button
  },
  dark: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accent
  },
  darkTxt: {
    color: COLORS.textLight,
    ...RLC_TYPOGRAPHY.button
  },
  secondary: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flex: 1
  },
  secondaryTxt: {
    color: COLORS.text,
    ...RLC_TYPOGRAPHY.button
  },
  disabled: {
    opacity: 0.5
  }
});
