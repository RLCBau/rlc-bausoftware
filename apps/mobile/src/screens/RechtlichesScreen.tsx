import React from "react";
import { SafeAreaView, ScrollView, View, Text, Pressable, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { COLORS, createRlcStyles } from "../ui/theme";
import { request } from "../lib/api";

const PRIVACY_URL = "https://rlcbausoftware.com/datenschutz/";
const IMPRINT_URL = "https://rlcbausoftware.com/impressum/";

async function openUrl(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Alert.alert("Fehler", "Die Seite konnte nicht geöffnet werden.");
  }
}

async function submitPrivacyRequest(requestType: "ACCESS" | "ERASURE") {
  try {
    const result: any = await request("/api/privacy-rights/self-service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType,
        description:
          requestType === "ERASURE"
            ? "Antrag aus RLC Mobile auf Löschung der personenbezogenen Daten, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen."
            : "Antrag aus RLC Mobile auf Auskunft über die verarbeiteten personenbezogenen Daten."
      })
    });
    Alert.alert(
      "Antrag eingegangen",
      `Vorgang ${String(result?.id || "")} wurde registriert. Status: ${String(result?.status || "OPEN")}.`
    );
  } catch (error: any) {
    const message = String(error?.message || error || "");
    Alert.alert(
      "Antrag nicht gesendet",
      message.includes("401") || message.includes("AUTH")
        ? "Bitte zuerst im Server-Modus anmelden. Ohne Server können lokale Daten direkt durch Löschen des lokalen Benutzers bzw. der App-Daten entfernt werden."
        : message || "Die Anfrage konnte nicht registriert werden."
    );
  }
}

export default function RechtlichesScreen() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Rechtliches & Datenschutz</Text>
        <Text style={s.text}>
          Verantwortlicher: RLC Bausoftware · Roberto Lo Curto · Hochkalterstr. 7 ·
          83483 Bischofswiesen · Deutschland · info@rlcbausoftware.com
        </Text>

        <View style={s.card}>
          <Text style={s.heading}>Mobile Datenverarbeitung</Text>
          <Text style={s.text}>
            Die App verarbeitet projekt- und benutzerbezogene Daten für Baustellendokumentation,
            Arbeitszeiten, Mengen, Angebote, Rechnungen, Fotos und Dokumente. Im Modus NUR_APP
            bleiben Arbeitsstände lokal auf dem Gerät. Im Modus SERVER_SYNC werden freigegebene
            Vorgänge verschlüsselt per HTTPS an den ausgewählten RLC Server übertragen.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Gerätezugriffe</Text>
          <Text style={s.text}>
            Kamera und Dateizugriff werden nur für ausdrücklich gestartete Funktionen verwendet.
            Der Standort wird bei Arbeitszeiten nur nach einer Benutzeraktion und nur mit
            erteilter Berechtigung abgefragt; eine permanente Hintergrundortung ist nicht vorgesehen.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Lokale Speicherung</Text>
          <Text style={s.text}>
            Offline-Entwürfe, Dokumente und Einstellungen können auf dem Gerät gespeichert werden.
            Anmeldetoken werden soweit technisch verfügbar im geschützten Secure Store abgelegt.
            Nicht synchronisierte Daten müssen vor App-Löschung oder Gerätewechsel gesichert werden.
          </Text>
        </View>

        <Pressable style={s.button} onPress={() => openUrl(PRIVACY_URL)}>
          <Text style={s.buttonText}>Datenschutzerklärung öffnen</Text>
        </Pressable>
        <Pressable style={s.buttonSecondary} onPress={() => openUrl(IMPRINT_URL)}>
          <Text style={s.buttonTextSecondary}>Impressum öffnen</Text>
        </Pressable>

        <View style={s.card}>
          <Text style={s.heading}>Ihre Datenschutzrechte</Text>
          <Text style={s.text}>
            Angemeldete Server-Benutzer können einen DSGVO-Antrag direkt registrieren. Gesetzliche
            Aufbewahrungspflichten werden bei Löschanträgen berücksichtigt.
          </Text>
          <Pressable style={s.rightsButton} onPress={() => submitPrivacyRequest("ACCESS")}>
            <Text style={s.buttonTextSecondary}>Auskunft beantragen</Text>
          </Pressable>
          <Pressable style={s.rightsButton} onPress={() => submitPrivacyRequest("ERASURE")}>
            <Text style={s.buttonTextSecondary}>Löschung beantragen</Text>
          </Pressable>
        </View>

        <Text style={s.note}>
          Stand der App-Hinweise: 16.10.2026. Die vollständigen Informationen und Betroffenenrechte
          stehen in der Datenschutzerklärung.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = createRlcStyles("RechtlichesScreen", {
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 18, gap: 14 },
  title: { fontSize: 24, fontWeight: "700", color: COLORS.text },
  heading: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: COLORS.sub },
  card: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  button: {
    minHeight: 46,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  buttonSecondary: {
    minHeight: 46,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.card,
  },
  buttonText: { color: COLORS.card, fontWeight: "700", fontSize: 14 },
  buttonTextSecondary: { color: COLORS.accentDark, fontWeight: "700", fontSize: 14 },
  rightsButton: {
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    marginTop: 10,
    backgroundColor: COLORS.card,
  },
  note: { fontSize: 12, lineHeight: 17, color: COLORS.sub, marginTop: 4 },
});
