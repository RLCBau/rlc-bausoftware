// apps/mobile/src/screens/SupportChatScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { api, SupportChatRequest, SupportChatResponse } from "../lib/api";
import { COLORS } from "../ui/theme";
import { queueStats } from "../lib/offlineQueue";

type Props = NativeStackScreenProps<RootStackParamList, "SupportChat">;

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
  type?: "info" | "warning" | "fix" | "critical";
  actions?: SupportChatResponse["actions"];
};

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

export default function SupportChatScreen({ route, navigation }: Props) {
  const params = route.params || ({} as any);

  const projectId = String(params.projectId || "").trim();
  const projectCode = String(params.projectCode || "").trim();
  const title = params.title || "Support-Chat";
  const screen = String(params.screen || "SupportChat").trim();

  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatMsg[]>([
    {
      id: nowId("a"),
      role: "assistant",
      text:
        "Hallo 👋\n\nSag mir kurz, was nicht funktioniert (1–2 Sätze). " +
        "Wenn möglich, kopiere auch die Fehlermeldung hier rein.",
      ts: Date.now(),
      type: "info",
    },
  ]);

  const listRef = useRef<FlatList<ChatMsg>>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  const runAction = useCallback(
    async (a: any) => {
      try {
        const kind = String(a?.kind || "").toUpperCase();
        const payload = a?.payload || {};

        if (kind === "NAVIGATE") {
          const scr = payload?.screen;
          if (!scr) return;
          // @ts-ignore
          navigation.navigate(scr, payload?.params || payload);
          return;
        }

        if (kind === "OPEN_URL") {
          const url = String(payload?.url || "").trim();
          if (!url) return;
          await Linking.openURL(url);
          return;
        }

        if (kind === "RUN") {
          Alert.alert("Aktion", `RUN: ${a?.id}`);
          return;
        }
      } catch (e: any) {
        Alert.alert("Support", String(e?.message || e));
      }
    },
    [navigation]
  );

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg) return;

    const userMsg: ChatMsg = {
      id: nowId("u"),
      role: "user",
      text: msg,
      ts: Date.now(),
    };

    setItems((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    try {
      let pending: number | undefined;
      let queueLocked: boolean | undefined;
      let lastError: string | undefined;

      try {
        const st = await queueStats();
        pending = st?.pending;
        queueLocked = st?.locked;
        lastError = st?.lastError;
      } catch {
        // ignore queue errors
      }

      const payload: SupportChatRequest = {
        message: msg,
        projectId: projectId || undefined,
        projectCode: projectCode || undefined,
        mode: "SERVER_SYNC",
        context: {
          pending,
          queueLocked,
          lastError,
          screen,
        },
      };

      const res: SupportChatResponse = await api.supportChat(payload);

      const botMsg: ChatMsg = {
        id: nowId("a"),
        role: "assistant",
        text:
          String(res?.answer || "").trim() ||
          "Gib mir bitte ein Detail mehr (welche Seite / welche Fehlermeldung).",
        ts: Date.now(),
        type: res?.type || "info",
        actions: Array.isArray(res?.actions) ? res.actions : [],
      };

      setItems((prev) => [...prev, botMsg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      setItems((prev) => [
        ...prev,
        {
          id: nowId("a"),
          role: "assistant",
          text:
            "Ich kann den Support-Server gerade nicht erreichen.\n\n" +
            `Fehler: ${String(e?.message || e)}`,
          ts: Date.now(),
          type: "warning",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [input, projectId, projectCode, screen]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMsg }) => {
      const isUser = item.role === "user";

      const bubbleStyle = [
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleBot,
        item.type === "critical" && styles.bubbleCritical,
        item.type === "fix" && styles.bubbleFix,
        item.type === "warning" && styles.bubbleWarning,
      ];

      return (
        <View style={[styles.row, isUser ? styles.rowUser : styles.rowBot]}>
          <View style={bubbleStyle}>
            <Text style={styles.text}>{item.text}</Text>

            {Array.isArray(item.actions) && item.actions.length > 0 && (
              <View style={styles.actions}>
                {item.actions.map((a: any) => (
                  <Pressable
                    key={String(a?.id)}
                    style={styles.actionBtn}
                    onPress={() => runAction(a)}
                  >
                    <Text style={styles.actionText}>
                      {String(a?.label || "Aktion")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    },
    [runAction]
  );

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 86 : 0}
    >
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Hier schreiben…"
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          multiline
        />

        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!canSend}
        >
          <Text style={styles.sendText}>{busy ? "…" : "Senden"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 12, paddingBottom: 18 },
  row: { marginBottom: 10, flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowBot: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "86%",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleUser: { backgroundColor: COLORS.card },
  bubbleBot: { backgroundColor: COLORS.card2 },
  bubbleWarning: { borderColor: "#b38b00" },
  bubbleFix: { borderColor: "#2f7d32" },
  bubbleCritical: { borderColor: "#b00020" },
  text: { color: COLORS.text, fontSize: 14, lineHeight: 19 },
  actions: { marginTop: 10 },
  actionBtn: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "flex-start",
  },
  actionText: { color: COLORS.text, fontSize: 13 },
  inputBar: {
    borderTopWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: COLORS.bg,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: "#fff", fontWeight: "700" },
});
