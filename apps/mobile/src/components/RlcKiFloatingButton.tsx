// apps/mobile/src/components/RlcKiFloatingButton.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import * as Speech from "expo-speech";
import { tryRunRlcKiModuleAction } from "../lib/rlcKiModuleBridge";
import { RLC_COPILOT_KI_AVATAR_SRC as RLC_KI_AVATAR_SRC } from "../screens/RlcCopilotScreen";

type Nav = NativeStackNavigationProp<RootStackParamList>;

type KiModuleContext = {
  module: string;
  welcome: string;
  actions: string[];
  reviewTarget?: "eingang_pruefung" | "direct";
};

type Props = {
  projectId?: string;
  projectCode?: string;
  title?: string;
  screen?: string;
  initialMessage?: string;
  autoOpen?: boolean;
  autoOpenDelayMs?: number;
  kiContext?: KiModuleContext;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function shouldOpenCopilotInstead(input: string) {
  const s = clean(input).toLowerCase();
  if (!s) return false;

  const looksLikeHelpQuestion =
    /^(wie|was|warum|wieso|kannst|kann ich|erkläre|erklaere|hilfe|hilf|come|cosa|perché|perche|aiutami|spiegami)\b/i.test(s) ||
    s.includes("wie kann ich") ||
    s.includes("wie funktioniert") ||
    s.includes("was bedeutet") ||
    s.includes("come funziona");

  const looksLikeStructuredFormData =
    /(datum|baustelle|lieferschein|lieferant|rechnung|angebot|menge|material|fahrer|kennzeichen|mitarbeiter|gerät|geraet|tätigkeit|taetigkeit|wetter|foto|mangel|lv|position)\s*[:=]/i.test(s) ||
    /\b\d+([,.]\d+)?\s*(m|m²|m2|m³|m3|stk|st|h|std|t|kg|psch)\b/i.test(s);

  return looksLikeHelpQuestion && !looksLikeStructuredFormData;
}

function rlcKiContextMessage(screen?: string, title?: string, projectCode?: string) {
  const s = String(screen || title || "Mobile");
  const base = projectCode ? `Projekt ${projectCode}. ` : "";

  if (/Rechnung/i.test(s)) {
    return `${base}Möchten Sie eine neue Rechnung erfassen, ein PDF übernehmen oder eine vorhandene Rechnung prüfen?`;
  }
  if (/Angebot/i.test(s)) {
    return `${base}Möchten Sie ein Angebot manuell erfassen, aus PDF übernehmen oder aus einer Kalkulation vorbereiten?`;
  }
  if (/Mengen|Mengenermittlung/i.test(s)) {
    return `${base}Aus welcher Quelle möchten Sie Mengen ermitteln: PDF, Foto, LV, Aufmaß oder manuell?`;
  }
  if (/Kalkulation|KiCalculation/i.test(s)) {
    return `${base}Möchten Sie eine GAEB-Datei laden, eine KI-Kalkulation starten oder eine bestehende Kalkulation prüfen?`;
  }
  if (/Lieferschein/i.test(s)) {
    return `${base}Möchten Sie einen Lieferschein aus Foto/PDF übernehmen oder manuell erfassen?`;
  }
  if (/Regie/i.test(s)) {
    return `${base}Möchten Sie einen Regiebericht erstellen, aus Foto/PDF übernehmen oder prüfen?`;
  }
  if (/Foto|Photos|Notes/i.test(s)) {
    return `${base}Was möchten Sie zur Foto-Dokumentation erfassen oder aus einem Bild/PDF übernehmen?`;
  }
  if (/Tagesbericht/i.test(s)) {
    return `${base}Möchten Sie einen Tagesbericht erstellen, prüfen oder aus Notizen/Fotos übernehmen?`;
  }
  if (/Bautagebuch/i.test(s)) {
    return `${base}Möchten Sie das Bautagebuch prüfen, als PDF erzeugen oder fehlende Tagesberichte ergänzen?`;
  }
  if (/ProjectHome|Projekt/i.test(s)) {
    return `${base}Möchten Sie Projektinfos ausfüllen, Dokumente prüfen oder zur nächsten Aufgabe springen?`;
  }
  if (/PdfViewer/i.test(s)) {
    return `${base}Möchten Sie diesen PDF prüfen, zuordnen, speichern oder an Eingang / Prüfung senden?`;
  }

  return `${base}Was möchten Sie in diesem Modul machen?`;
}

export default function RlcKiFloatingButton({
  projectId,
  projectCode,
  title,
  screen,
  initialMessage,
  autoOpen = false,
  autoOpenDelayMs = 650,
  kiContext,
}: Props) {
  const navigation = useNavigation<Nav>();
  const autoOpenedRef = useRef(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  const contextMessage = useMemo(() => {
    const code = clean(projectCode || projectId);
    return clean(kiContext?.welcome) || rlcKiContextMessage(screen, title, code || undefined);
  }, [screen, title, projectCode, projectId, kiContext]);

  const quickActions = useMemo(() => {
    const fromContext = Array.isArray(kiContext?.actions) ? kiContext.actions : [];
    return fromContext.filter(Boolean).slice(0, 6);
  }, [kiContext]);

  const openKi = () => {
    setPanelOpen(true);
  };

  const closePanel = () => {
    Keyboard.dismiss();
    setPanelOpen(false);
  };

  const runKiWithMessage = async (message?: string) => {
    const code = clean(projectCode || projectId);
    const msg = clean(message) || clean(input) || clean(initialMessage) || contextMessage;

    const forceCopilot =
      String(screen || "").toLowerCase().includes("mengen");

    if (forceCopilot || shouldOpenCopilotInstead(msg)) {
      try { Speech.stop(); } catch {}
      closePanel();
      navigation.navigate("RlcCopilot" as any, {
        projectId: clean(projectId || code),
        projectCode: code || undefined,
        title: title || "RLC KI",
        screen: screen || "Mobile",
        initialMessage: msg,
      });
      return;
    }

    try {
      setRunning(true);

      const r = await tryRunRlcKiModuleAction({
        screen: screen || "Mobile",
        projectId: clean(projectId || code),
        projectCode: code || undefined,
        title,
        input: msg,
        contextMessage,
      });

      if (r?.handled || r?.ok) {
        closePanel();
        return;
      }
    } catch {
      // fallback auf volle KI
    } finally {
      setRunning(false);
    }

    try { Speech.stop(); } catch {}
    closePanel();

    navigation.navigate("RlcCopilot" as any, {
      projectId: clean(projectId || code),
      projectCode: code || undefined,
      title: title || "RLC KI",
      screen: screen || "Mobile",
      initialMessage: msg,
    });
  };

  const openFullKi = async () => {
    await runKiWithMessage();
  };

  // RLC_KI_GLOBAL_AUTO_OPEN_V1
  useEffect(() => {
    if (!autoOpen) return;
    if (autoOpenedRef.current) return;

    const currentScreen = String(screen || "");
    const blocked =
      currentScreen.includes("SupportChat") ||
      currentScreen.includes("RlcCopilot") ||
      currentScreen.includes("Login") ||
      currentScreen.includes("Start");

    if (blocked) return;

    autoOpenedRef.current = true;

    const t = setTimeout(() => {
      openKi();
    }, autoOpenDelayMs);

    return () => clearTimeout(t);
  }, [autoOpen, autoOpenDelayMs, screen, contextMessage]);

  return (
    <>
      <Pressable style={styles.fab} onPress={openKi} hitSlop={10}>
        <Image source={{ uri: RLC_KI_AVATAR_SRC }} style={styles.avatar} />
        <View style={styles.dot} />
      </Pressable>

      <Modal
        visible={panelOpen}
        transparent
        animationType="slide"
        onRequestClose={closePanel}
      >
        <KeyboardAvoidingView
          style={styles.modalAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={12}
        >
          <Pressable style={styles.overlay} onPress={closePanel}>
            <Pressable style={styles.panel} onPress={() => {}}>
            <View style={styles.panelHead}>
              <Image
                source={{ uri: RLC_KI_AVATAR_SRC }}
                style={styles.panelAvatar}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>RLC KI</Text>
                <Text style={styles.panelSub}>{String(screen || title || "Mobile")}</Text>
              </View>

              <Pressable style={styles.closeBtn} onPress={closePanel}>
                <Text style={styles.closeTxt}>X</Text>
              </Pressable>
            </View>

            <Text style={styles.question}>{contextMessage}</Text>

            {quickActions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.quickScroll}
                contentContainerStyle={styles.quickContent}
              >
                {quickActions.map((a) => (
                  <Pressable
                    key={a}
                    style={[styles.quickChip, running && { opacity: 0.65 }]}
                    onPress={() => runKiWithMessage(a)}
                    disabled={running}
                  >
                    <Text style={styles.quickChipTxt}>{a}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.freeHint}>
              Oder beschreiben Sie frei, was RLC KI für Sie machen soll.
            </Text>

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Schreiben oder sprechen: Was möchten Sie machen?"
              placeholderTextColor={COLORS.sub}
              style={styles.input}
              multiline
            />

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryBtn} onPress={closePanel}>
                <Text style={styles.secondaryTxt}>Später</Text>
              </Pressable>

              <Pressable style={[styles.primaryBtn, running && { opacity: 0.65 }]} onPress={openFullKi} disabled={running}>
                <Text style={styles.primaryTxt}>{running ? "RLC arbeitet..." : "Starten"}</Text>
              </Pressable>
            </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const screenH = Dimensions.get("window").height;

const styles = StyleSheet.create({
  modalAvoid: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.text,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 3,
    borderColor: COLORS.textLight,
    zIndex: 50,
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: COLORS.text,
  },
  dot: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.textLight,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  panel: {
    minHeight: Math.round(screenH * 0.34),
    maxHeight: Math.round(screenH * 0.52),
    backgroundColor: COLORS.textLight,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    shadowColor: COLORS.text,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  panelAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: COLORS.text,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },
  panelSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.sub,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },
  question: {
    marginTop: 14,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  quickScroll: {
    marginTop: 12,
  },
  quickContent: {
    gap: 8,
    paddingRight: 8,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickChipTxt: {
    color: COLORS.accentDark,
    fontWeight: "900",
    fontSize: 12,
  },
  freeHint: {
    marginTop: 10,
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    marginTop: 8,
    minHeight: 74,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "700",
    textAlignVertical: "top",
  },
  actionRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card2,
  },
  secondaryTxt: {
    fontWeight: "900",
    color: COLORS.text,
  },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.accentDark,
  },
  primaryTxt: {
    fontWeight: "900",
    color: COLORS.textLight,
  },
});
















