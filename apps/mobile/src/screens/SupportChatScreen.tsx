// apps/mobile/src/screens/SupportChatScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
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
import { queueStats } from "../lib/offlineQueue";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "SupportChat">;

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
  type?: "info" | "warning" | "fix" | "critical";
  actions?: SupportChatResponse["actions"];
};

type LocalReply = {
  type: "info" | "warning" | "fix" | "critical";
  answer: string;
  actions?: SupportChatResponse["actions"];
};

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

function normalize(s: any) {
  return String(s || "").trim().toLowerCase();
}

function hasOne(msg: string, terms: string[]) {
  return terms.some((t) => msg.includes(normalize(t)));
}

function screenIs(screen: string, names: string[]) {
  const s = normalize(screen);
  return names.some((n) => s === normalize(n));
}

function buildLocalSupportAnswer(args: {
  message: string;
  pending?: number;
  queueLocked?: boolean;
  lastError?: string;
  projectCode?: string;
  screen?: string;
  mode: "NUR_APP" | "SERVER_SYNC";
}): LocalReply {
  const msg = normalize(args.message);
  const pending = typeof args.pending === "number" ? args.pending : undefined;
  const queueLocked = args.queueLocked === true;
  const lastError = String(args.lastError || "").trim();
  const projectCode = String(args.projectCode || "").trim();
  const screen = String(args.screen || "").trim();
  const currentScreen = normalize(screen);

  const isRegie = screenIs(currentScreen, ["Regie", "Regiebericht"]);
  const isLs = screenIs(currentScreen, ["Lieferschein"]);
  const isPhotos = screenIs(currentScreen, ["PhotosNotes", "Fotos", "Fotos / Notizen"]);
  const isInbox = screenIs(currentScreen, ["EingangPruefung", "Eingang / Prüfung", "EingangPrufung"]);
  const isProjectHome = screenIs(currentScreen, ["ProjectHome"]);

  if (isRegie) {
    if (
      hasOne(msg, [
        "uhrzeit",
        "zeit",
        "arbeitsbeginn",
        "arbeitsende",
        "pause",
        "stunden",
      ])
    ) {
      return {
        type: "fix",
        answer:
          "In der Regie-Ansicht kannst du die Zeiten direkt im oberen Formular eingeben:\n\n" +
          "• Arbeitsbeginn\n" +
          "• Arbeitsende\n" +
          "• Pause 1\n" +
          "• Pause 2\n\n" +
          "Die Stunden pro Leistung trägst du zusätzlich unten in jeder Zeile im Feld 'Std.' ein.",
      };
    }

    if (hasOne(msg, ["kostenstelle", "ks"])) {
      return {
        type: "fix",
        answer:
          "In Regie gibt es zwei Stellen für die Kostenstelle:\n\n" +
          "• oben im Header: 'Kostenstelle (Header)'\n" +
          "• unten pro Zeile: 'Kostenstelle (Zeile)'\n\n" +
          "Die Header-Kostenstelle gilt allgemein für das Dokument. Die Zeilen-Kostenstelle ist für einzelne Leistungen.",
      };
    }

    if (hasOne(msg, ["zeile", "leistung", "maschine", "mitarbeiter", "material"])) {
      return {
        type: "fix",
        answer:
          "Unter 'Zeilen' kannst du die eigentlichen Leistungen eingeben.\n\n" +
          "Dort gibt es pro Zeile:\n" +
          "• Kostenstelle\n" +
          "• Maschine\n" +
          "• Mitarbeiter\n" +
          "• Std.\n" +
          "• Material\n" +
          "• Menge / Einheit\n" +
          "• Kommentar / Leistung",
      };
    }

    if (hasOne(msg, ["anhang", "foto", "datei", "kamera", "galerie"])) {
      return {
        type: "fix",
        answer:
          "In Regie kannst du Anhänge im Bereich 'Anhänge (Projekt-Pool)' hinzufügen.\n\n" +
          "Dort gibt es:\n" +
          "• Kamera\n" +
          "• Galerie\n" +
          "• Datei\n\n" +
          "Diese Anhänge werden dann auch für PDF und Dokumentation verwendet.",
      };
    }

    return {
      type: "info",
      answer:
        "Du bist in der Ansicht Regie.\n\n" +
        "Beschreibe bitte kurz, was du machen willst:\n" +
        "• Uhrzeit eingeben\n" +
        "• Kostenstelle eintragen\n" +
        "• Zeile hinzufügen\n" +
        "• Foto / Anhang hinzufügen\n" +
        "• PDF erstellen",
    };
  }

  if (isLs) {
    if (
      hasOne(msg, [
        "lieferschein",
        "lieferant",
        "ls",
        "nummer",
        "material",
        "menge",
        "einheit",
        "fahrer",
        "baustelle",
        "kostenstelle",
        "lv",
      ])
    ) {
      return {
        type: "fix",
        answer:
          "In der Lieferschein-Ansicht kannst du die Daten direkt im Formular eintragen:\n\n" +
          "• Lieferschein-Nr.\n" +
          "• Lieferant\n" +
          "• Baustelle\n" +
          "• Fahrer / Mitarbeiter\n" +
          "• Material\n" +
          "• Menge\n" +
          "• Einheit\n" +
          "• Kostenstelle\n" +
          "• LV Position\n" +
          "• Bemerkungen",
      };
    }

    if (hasOne(msg, ["foto", "anhang", "pdf", "datei", "kamera", "mail", "e-mail"])) {
      return {
        type: "fix",
        answer:
          "In Lieferschein kannst du Anhänge hinzufügen und danach das PDF lokal erzeugen.\n\n" +
          "Typischer Ablauf:\n" +
          "1. Formular ausfüllen\n" +
          "2. Anhänge hinzufügen\n" +
          "3. Unten speichern oder einreichen\n" +
          "4. PDF Vorschau / PDF öffnen / E-Mail senden",
      };
    }

    if (hasOne(msg, ["speichern", "einreichen", "senden"])) {
      return {
        type: "info",
        answer:
          args.mode === "NUR_APP"
            ? "Im Modus NUR_APP bleibt der Lieferschein lokal gespeichert. Nutze unten 'Offline speichern' oder 'Einreichen'."
            : "Im Server-Modus wird der Lieferschein in die Inbox eingereicht und später über die Queue synchronisiert.",
      };
    }

    return {
      type: "info",
      answer:
        "Du bist in der Ansicht Lieferschein.\n\n" +
        "Sag mir kurz, ob du Hilfe bei Nummer, Lieferant, Material, Menge, Foto-Anhang oder PDF brauchst.",
    };
  }

  if (isPhotos) {
    if (
      hasOne(msg, [
        "hauptfoto",
        "foto speichern",
        "fotos speichern",
        "bild speichern",
        "wie speichern",
        "kamera",
        "galerie",
        "speichern",
      ])
    ) {
      return {
        type: "fix",
        answer:
          "In Fotos / Notizen ist der Ablauf so:\n\n" +
          "1. Hauptfoto mit 'Kamera' oder 'Foto wählen' hinzufügen.\n" +
          "2. Optional weitere Dateien unter 'Anhänge' hinzufügen.\n" +
          "3. Notiz, Kostenstelle und LV-Pos eintragen.\n" +
          "4. Unten 'Offline speichern' oder 'Einreichen' drücken.\n\n" +
          (args.mode === "NUR_APP"
            ? "Im Modus NUR_APP bleibt alles lokal auf dem Gerät."
            : "Im Modus SERVER_SYNC wird der Eintrag zusätzlich für die Eingangsprüfung synchronisiert."),
      };
    }

    if (hasOne(msg, ["anhang", "datei", "pdf"])) {
      return {
        type: "fix",
        answer:
          "In Fotos / Notizen gibt es zwei Bereiche:\n\n" +
          "• Hauptfoto: für das wichtigste Bild\n" +
          "• Anhänge: für weitere Bilder oder PDFs\n\n" +
          "Zusätzliche Dateien fügst du im Bereich 'Anhänge' hinzu.",
      };
    }

    if (hasOne(msg, ["notiz", "bemerkung", "text"])) {
      return {
        type: "fix",
        answer:
          "Die Beschreibung gibst du im Feld 'Notiz' ein.\n\n" +
          "Zusätzlich kannst du Kostenstelle und LV Pos eintragen und danach den Eintrag speichern oder einreichen.",
      };
    }

    if (hasOne(msg, ["pdf", "mail", "e-mail"])) {
      return {
        type: "info",
        answer:
          "In Fotos / Notizen kannst du unten über die Dokument-Aktionen ein PDF erzeugen, öffnen und per E-Mail senden.",
      };
    }

    return {
      type: "info",
      answer:
        "Du bist in der Ansicht Fotos / Notizen.\n\n" +
        "Du kannst dort ein Hauptfoto, zusätzliche Anhänge, Kostenstelle, LV-Pos und eine Notiz erfassen.",
    };
  }

  if (isInbox) {
    if (hasOne(msg, ["freigeben", "freigabe", "ablehnen", "eingang"])) {
      return {
        type: "fix",
        answer:
          "In Eingang / Prüfung kannst du eingereichte Dokumente öffnen, PDF erzeugen, per E-Mail senden sowie freigeben oder ablehnen.\n\n" +
          "Falls 'Freigeben' nicht funktioniert, ist das meist ein Server-/Pfad-Thema und nicht nur ein UI-Problem.",
      };
    }

    return {
      type: "info",
      answer:
        "Du bist in Eingang / Prüfung.\n\n" +
        "Hier kannst du eingereichte Regie-, Lieferschein- und Foto-Dokumente prüfen, öffnen, freigeben oder ablehnen.",
    };
  }

  if (isProjectHome) {
    return {
      type: "info",
      answer:
        "Du bist auf ProjectHome.\n\n" +
        "Von hier aus kommst du in die Module wie Regie, Lieferschein, Fotos, Eingang / Prüfung oder Support.",
    };
  }

  if (
    queueLocked ||
    (msg.includes("queue") && msg.includes("lock")) ||
    msg.includes("gesperrt")
  ) {
    return {
      type: "critical",
      answer:
        "Die Offline-Queue scheint gesperrt zu sein.\n\n" +
        "Bitte prüfe die Inbox und suche nach Einträgen mit Fehlerstatus. Falls vorhanden: Eintrag öffnen und erneut senden oder abbrechen. Danach die App neu starten und die Synchronisierung erneut versuchen.\n\n" +
        (lastError ? `Letzter Fehler: ${lastError}` : ""),
      actions: [
        {
          id: "go_inbox",
          label: "Inbox öffnen",
          kind: "NAVIGATE",
          payload: { screen: "Inbox" },
        },
      ],
    };
  }

  if (typeof pending === "number" && pending >= 10) {
    return {
      type: "warning",
      answer:
        `Es gibt aktuell ${pending} ausstehende Einträge.\n\n` +
        (args.mode === "NUR_APP"
          ? "Im Modus NUR_APP bleiben diese lokal gespeichert. Das ist normal. Eine Server-Synchronisierung findet hier nicht statt."
          : "Bitte jetzt eine Synchronisierung ausführen und anschließend in Eingang / Prüfung kontrollieren, ob Einträge im Fehlerstatus stehen."),
    };
  }

  if (
    msg.includes("iterator method is not callable") ||
    (msg.includes("iterator") && msg.includes("callable"))
  ) {
    return {
      type: "fix",
      answer:
        "Dieser Fehler weist sehr wahrscheinlich auf einen falschen Funktionsaufruf hin.\n\n" +
        "In RLC ist die wahrscheinliche Ursache: Die KI-Funktion wird mit falscher Signatur aufgerufen, z. B. mit 2 Argumenten statt mit einem Payload-Objekt. Außerdem sollte das KI-Modal immer schließbar sein.",
    };
  }

  if (
    msg.includes("ba-code") ||
    msg.includes("projekt code") ||
    msg.includes("project code") ||
    msg.includes("ba-")
  ) {
    const validBa = /^ba-\d{4}-[a-z0-9_-]+$/i.test(projectCode);
    if (!validBa) {
      return {
        type: "fix",
        answer:
          "Für Sync, Eingang / Prüfung und serverbasierte PDFs wird ein gültiger BA-Code benötigt, z. B. BA-2026-001.\n\n" +
          "Bitte prüfen, ob das Projekt einen korrekten Code hat und ob dieser im Mobile korrekt übergeben wird.",
      };
    }
  }

  if (
    hasOne(msg, ["sync", "synchronisierung", "senden", "queue", "upload"]) &&
    args.mode === "NUR_APP"
  ) {
    return {
      type: "info",
      answer:
        "Du bist im Modus NUR_APP.\n\n" +
        "In diesem Modus werden Einträge lokal gespeichert. Es gibt keine Server-Synchronisierung, keine Freigabe auf dem Server und keine Eingangsprüfung über Backend.",
    };
  }

  if (
    hasOne(msg, ["foto schwarz", "bild schwarz", "preview schwarz", "schwarzes bild", "nicht öffnen"])
  ) {
    return {
      type: "fix",
      answer:
        "Wenn Bilder schwarz erscheinen oder nicht öffnen, liegt das meist an einem ungültigen URI oder daran, dass statt eines lokalen file://-Pfads noch ein anderer Pfad verwendet wird.\n\n" +
        "Bitte prüfen:\n" +
        "1. Wird die Datei lokal gespeichert?\n" +
        "2. Wird beim Öffnen derselbe lokale URI verwendet?\n" +
        "3. Wird aus Versehen ein Serverpfad oder ein alter Pfad verwendet?",
    };
  }

  if (hasOne(msg, ["pdf", "laden", "speichern", "vorschau"])) {
    return {
      type: "info",
      answer:
        args.mode === "NUR_APP"
          ? "Im Modus NUR_APP sollte der Ablauf sein: PDF erstellen → lokal speichern → öffnen → E-Mail. Ein reines 'Laden' ist hier nicht die richtige Logik."
          : "Im Server-Modus muss geprüft werden, ob das PDF lokal erstellt oder serverseitig bereitgestellt wird.",
    };
  }

  if (hasOne(msg, ["ki", "ocr", "analyse", "vorschlag"])) {
    return {
      type: "info",
      answer:
        args.mode === "NUR_APP"
          ? "Im Modus NUR_APP sind serverbasierte KI-Funktionen in der Regel nicht verfügbar. Für KI, OCR und automatische Vorschläge brauchst du normalerweise SERVER_SYNC."
          : "Für KI-Probleme bitte genau angeben, welche Funktion betroffen ist: Regie, Lieferschein oder Fotos / Notizen.",
    };
  }

  return {
    type: "info",
    answer:
      "Beschreibe bitte kurz das konkrete Problem: welche Ansicht ist offen und was passiert genau?\n\n" +
      (screen ? `Aktuelle Ansicht: ${screen}` : ""),
  };
}

export default function SupportChatScreen({ route, navigation }: Props) {
  const params = route.params || ({} as any);

  const projectId = String(params.projectId || "").trim();
  const projectCode = String(params.projectCode || "").trim();
  const title = params.title || "Support-Chat";
  const screen = String(params.screen || "SupportChat").trim();
  const mode =
    String(params.mode || "NUR_APP").trim().toUpperCase() === "SERVER_SYNC"
      ? "SERVER_SYNC"
      : "NUR_APP";

  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatMsg[]>([
    {
      id: nowId("a"),
      role: "assistant",
      text:
        mode === "NUR_APP"
          ? "Hallo 👋\n\nIch bin dein lokaler Support-Assistent. Beschreibe kurz das Problem in 1–2 Sätzen."
          : "Hallo 👋\n\nSag mir kurz, was nicht funktioniert (1–2 Sätze). Wenn möglich, kopiere auch die Fehlermeldung hier rein.",
      ts: Date.now(),
      type: "info",
    },
  ]);

  const listRef = useRef<FlatList<ChatMsg>>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerStyle: {
        backgroundColor: "#12324A",
      },
      headerTitleStyle: {
        color: "#FFFFFF",
        fontWeight: "800",
      },
      headerTintColor: "#FFFFFF",
    });
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
        queueLocked = false;
        lastError = undefined;
      } catch {}

      if (mode === "NUR_APP") {
        const local = buildLocalSupportAnswer({
          message: msg,
          pending,
          queueLocked,
          lastError,
          projectCode,
          screen,
          mode,
        });

        const botMsg: ChatMsg = {
          id: nowId("a"),
          role: "assistant",
          text: local.answer,
          ts: Date.now(),
          type: local.type,
          actions: Array.isArray(local.actions) ? local.actions : [],
        };

        setItems((prev) => [...prev, botMsg]);
        return;
      }

      const payload: SupportChatRequest = {
        message: msg,
        projectId: projectId || undefined,
        projectCode: projectCode || undefined,
        mode: "SERVER_SYNC",
        language: "de",
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
    } catch (e: any) {
      setItems((prev) => [
        ...prev,
        {
          id: nowId("a"),
          role: "assistant",
          text:
            mode === "NUR_APP"
              ? "Der lokale Support ist gerade nicht verfügbar."
              : "Ich kann den Support-Server gerade nicht erreichen.\n\n" +
                `Fehler: ${String(e?.message || e)}`,
          ts: Date.now(),
          type: "warning",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [input, projectId, projectCode, screen, mode]);

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

      const textStyle = [
        styles.text,
        isUser ? styles.textUser : styles.textBot,
      ];

      return (
        <View style={[styles.row, isUser ? styles.rowUser : styles.rowBot]}>
          <View style={bubbleStyle}>
            <Text style={textStyle}>{item.text}</Text>

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
          placeholderTextColor="#B8C1CC"
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
  wrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  list: {
    padding: 12,
    paddingBottom: 18,
  },

  row: {
    marginBottom: 10,
    flexDirection: "row",
  },
  rowUser: {
    justifyContent: "flex-end",
  },
  rowBot: {
    justifyContent: "flex-start",
  },

  bubble: {
    maxWidth: "86%",
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderWidth: 1,
  },

  bubbleUser: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accentDark,
  },
  bubbleBot: {
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
  },

  bubbleWarning: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningBg,
  },
  bubbleFix: {
    borderColor: COLORS.fix,
    backgroundColor: COLORS.fixBg,
  },
  bubbleCritical: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
  },

  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: COLORS.textLight,
    fontWeight: "600",
  },
  textBot: {
    color: COLORS.text,
    fontWeight: "500",
  },

  actions: {
    marginTop: 10,
  },
  actionBtn: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "flex-start",
    backgroundColor: COLORS.card,
  },
  actionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },

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
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: COLORS.inputBg,
  },

  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: COLORS.textLight,
    fontWeight: "800",
  },
});



