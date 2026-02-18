// apps/mobile/App.tsx
import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { RootStackParamList } from "./src/navigation/types";

// Screens – base
import StartScreen from "./src/screens/StartScreen";
import ProjectsScreen from "./src/screens/ProjectsScreen";
import ProjectHomeScreen from "./src/screens/ProjectHomeScreen";

// Screens – mode + login
import ArbeitsmodusScreen from "./src/screens/ArbeitsmodusScreen";
import LoginScreen from "./src/screens/LoginScreen";

// Screens – auth / workflow
import AnmeldenScreen from "./src/screens/AnmeldenScreen";
import EingangPruefungScreen from "./src/screens/EingangPruefungScreen";

// Screens – documents
import RegieScreen from "./src/screens/RegieScreen";
import LieferscheinScreen from "./src/screens/LieferscheinScreen";
import PhotosNotesScreen from "./src/screens/PhotosNotesScreen";

// Screens – project meta
import TeamRolesScreen from "./src/screens/TeamRolesScreen";
import LvReadOnlyScreen from "./src/screens/LvReadOnlyScreen";
import InboxScreen from "./src/screens/InboxScreen";

// Screens – PDF
import ProjectPdfsScreen from "./src/screens/ProjectPdfsScreen";
import PdfViewerScreen from "./src/screens/PdfViewerScreen";

// ✅ Company / Branding
import CompanyAdminScreen from "./src/screens/CompanyAdminScreen";
import CompanyOfflineSetupScreen from "./src/screens/CompanyOfflineSetupScreen";
import CompanyImportScreen from "./src/screens/CompanyImportScreen";

// ✅ Support Chat
import SupportChatScreen from "./src/screens/SupportChatScreen";

// API (DEV sanity check)
import { api, IS_DEV } from "./src/lib/api";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    if (!IS_DEV) return;

    (async () => {
      try {
        const base = await api.getApiUrl();
        console.log("[API] base url =", base);

        // ✅ use api.health() (same base URL logic + safe errors)
        const r = await api.health().catch((e: any) => ({
          ok: false,
          error: String(e?.message || e),
        }));

        console.log("[API] /api/health =", r);
      } catch (e: any) {
        console.log("[API] health check failed:", String(e?.message || e));
      }
    })();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator
        /** 🔒 START È SEMPRE ROOT */
        initialRouteName="Start"
        screenOptions={{
          headerTitleStyle: { fontWeight: "800" },
          animation: "slide_from_right",
        }}
      >
        {/* =====================
            START (ROOT ASSOLUTO)
        ====================== */}
        <Stack.Screen
          name="Start"
          component={StartScreen}
          options={{
            headerShown: false,
            gestureEnabled: false, // 🔒 non si torna indietro
          }}
        />

        {/* =====================
            MODE + LOGIN
        ====================== */}
        <Stack.Screen
          name="Arbeitsmodus"
          component={ArbeitsmodusScreen}
          options={{
            headerShown: false,
            gestureEnabled: true,
          }}
        />

        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title: "Anmelden",
            headerBackVisible: false, // 🔒 niente back che salta Start
            gestureEnabled: false,
          }}
        />

        {/* =====================
            COMPANY / BRANDING
        ====================== */}
        <Stack.Screen
          name="CompanyAdmin"
          component={CompanyAdminScreen}
          options={{ title: "Firma (Admin)" }}
        />
        <Stack.Screen
          name="CompanyOfflineSetup"
          component={CompanyOfflineSetupScreen}
          options={{ title: "Firma (Offline Setup)" }}
        />
        <Stack.Screen
          name="CompanyImport"
          component={CompanyImportScreen}
          options={{ title: "Setup importieren" }}
        />

        {/* =====================
            PROJECT LIST
        ====================== */}
        <Stack.Screen
          name="Projects"
          component={ProjectsScreen}
          options={{
            title: "Projekte",
            headerBackVisible: false, // 🔒 non tornare a Login via back
          }}
        />

        {/* =====================
            PROJECT HOME
        ====================== */}
        <Stack.Screen
          name="ProjectHome"
          component={ProjectHomeScreen}
          options={{ title: "Projekt" }}
        />

        {/* =====================
            AUTH / WORKFLOW
        ====================== */}
        <Stack.Screen
          name="Anmelden"
          component={AnmeldenScreen}
          options={{ title: "Anmelden" }}
        />

        <Stack.Screen
          name="EingangPruefung"
          component={EingangPruefungScreen}
          options={{ title: "Eingang / Prüfung" }}
        />

        {/* =====================
            PROJECT META
        ====================== */}
        <Stack.Screen
          name="TeamRoles"
          component={TeamRolesScreen}
          options={{ title: "Team / Rollen" }}
        />

        <Stack.Screen
          name="LvReadOnly"
          component={LvReadOnlyScreen}
          options={{ title: "LV (nur Lesen)" }}
        />

        {/* =====================
            DOCUMENTS
        ====================== */}
        <Stack.Screen
          name="Regie"
          component={RegieScreen}
          options={{ title: "Regiebericht" }}
        />

        <Stack.Screen
          name="Lieferschein"
          component={LieferscheinScreen}
          options={{ title: "Lieferschein" }}
        />

        <Stack.Screen
          name="PhotosNotes"
          component={PhotosNotesScreen}
          options={{ title: "Fotos / Notizen" }}
        />

        <Stack.Screen
          name="Inbox"
          component={InboxScreen}
          options={{ title: "Inbox" }}
        />

        {/* =====================
            SUPPORT CHAT
        ====================== */}
        <Stack.Screen
          name="SupportChat"
          component={SupportChatScreen}
          options={{ title: "Support Chat" }}
        />

        {/* =====================
            PDF
        ====================== */}
        <Stack.Screen
          name="ProjectPdfs"
          component={ProjectPdfsScreen}
          options={{ title: "Projekt PDFs" }}
        />

        <Stack.Screen
          name="PdfViewer"
          component={PdfViewerScreen}
          options={{ title: "PDF" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
