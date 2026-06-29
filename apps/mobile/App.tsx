// apps/mobile/App.tsx
import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { RootStackParamList } from "./src/navigation/types";
import RlcKiFloatingButton from "./src/components/RlcKiFloatingButton";

/* ================= BASE ================= */

import StartScreen from "./src/screens/StartScreen";
import ProjectsScreen from "./src/screens/ProjectsScreen";
import ProjectHomeScreen from "./src/screens/ProjectHomeScreen";

/* ================= MODE ================= */

import ArbeitsmodusScreen from "./src/screens/ArbeitsmodusScreen";
import LoginScreen from "./src/screens/LoginScreen";

/* ================= WORKFLOW ================= */

import AnmeldenScreen from "./src/screens/AnmeldenScreen";
import EingangPruefungScreen from "./src/screens/EingangPruefungScreen";

/* ================= DOCS ================= */

import RegieScreen from "./src/screens/RegieScreen";
import LieferscheinScreen from "./src/screens/LieferscheinScreen";
import PhotosNotesScreen from "./src/screens/PhotosNotesScreen";
import BautagebuchScreen from "./src/screens/BautagebuchScreen";
import TagesberichtListScreen from "./src/screens/TagesberichtListScreen";
import TagesberichtEditorScreen from "./src/screens/TagesberichtEditorScreen";

/* ================= META ================= */

import TeamRolesScreen from "./src/screens/TeamRolesScreen";
import LvReadOnlyScreen from "./src/screens/LvReadOnlyScreen";
import LvImportScreen from "./src/screens/LvImportScreen";
import KalkulationScreen from "./src/screens/KalkulationScreen";
import KiCalculationScreen from "./src/screens/KiCalculationScreen";
import KalkulationOutlierScreen from "./src/screens/KalkulationOutlierScreen";
import RlcCopilotScreen from "./src/screens/RlcCopilotScreen";
import InboxScreen from "./src/screens/InboxScreen";

/* ================= ANGEBOT ================= */

import AngebotListScreen from "./src/screens/AngebotListScreen";
import AngebotEditorScreen from "./src/screens/AngebotEditorScreen";

/* ================= RECHNUNG ================= */

import RechnungListScreen from "./src/screens/RechnungListScreen";
import RechnungEditorScreen from "./src/screens/RechnungEditorScreen";

/* ================= MENGEN ================= */

import MengenListScreen from "./src/screens/MengenListScreen";
import MengenEditorScreen from "./src/screens/MengenEditorScreen";

/* ================= ABSCHLAG / SCHLUSS ================= */

import AbschlagListScreen from "./src/screens/AbschlagListScreen";
import AbschlagEditorScreen from "./src/screens/AbschlagEditorScreen";
import SchlussrechnungScreen from "./src/screens/SchlussrechnungScreen";

/* ================= PDF ================= */

import ProjectPdfsScreen from "./src/screens/ProjectPdfsScreen";
import PdfViewerScreen from "./src/screens/PdfViewerScreen";

/* ================= COMPANY ================= */

import CompanyAdminScreen from "./src/screens/CompanyAdminScreen";
import CompanyOfflineSetupScreen from "./src/screens/CompanyOfflineSetupScreen";
import CompanyImportScreen from "./src/screens/CompanyImportScreen";

/* ================= SUPPORT ================= */

import SupportChatScreen from "./src/screens/SupportChatScreen";

/* ================= API ================= */

import { api, IS_DEV } from "./src/lib/api";

const Stack = createNativeStackNavigator<RootStackParamList>();

type KiModuleContext = {
  module: string;
  welcome: string;
  actions: string[];
  reviewTarget?: "eingang_pruefung" | "direct";
};

const KI_MODULE_CONTEXTS: Record<string, KiModuleContext> = {
  EingangPruefung: {
    module: "Eingang / Prüfung",
    welcome: "Was möchten Sie prüfen oder freigeben?",
    actions: ["Lieferschein prüfen", "Rechnung prüfen", "Angebot prüfen", "Regiebericht prüfen", "Fotos zuordnen"],
    reviewTarget: "direct",
  },
  RechnungEditor: {
    module: "Rechnung",
    welcome: "Möchten Sie eine neue Rechnung erfassen oder aus PDF übernehmen?",
    actions: ["Neue Rechnung erfassen", "Rechnung aus PDF übernehmen", "Rechnung prüfen"],
    reviewTarget: "eingang_pruefung",
  },
  AngebotEditor: {
    module: "Angebot",
    welcome: "Möchten Sie ein Angebot erfassen oder aus PDF übernehmen?",
    actions: ["Angebot erfassen", "Angebot aus PDF übernehmen", "Angebot prüfen"],
    reviewTarget: "eingang_pruefung",
  },
  Lieferschein: {
    module: "Lieferschein",
    welcome: "Möchten Sie einen Lieferschein erfassen, prüfen oder hochladen?",
    actions: ["Lieferschein prüfen", "Foto hochladen", "PDF übernehmen"],
    reviewTarget: "eingang_pruefung",
  },
  Regie: {
    module: "Regie",
    welcome: "Möchten Sie einen Regiebericht erfassen oder aus Foto/PDF übernehmen?",
    actions: ["Regiebericht erfassen", "Aus Foto übernehmen", "Aus PDF übernehmen"],
    reviewTarget: "eingang_pruefung",
  },
  PhotosNotes: {
    module: "Fotos / Notizen",
    welcome: "Möchten Sie Fotos prüfen, zuordnen oder Notizen erfassen?",
    actions: ["Fotos prüfen", "Fotos zuordnen", "Notiz erfassen"],
    reviewTarget: "eingang_pruefung",
  },
  MengenEditor: {
    module: "Mengenermittlung",
    welcome: "Möchten Sie Mengen manuell erfassen oder aus Foto/PDF übernehmen?",
    actions: ["Mengen erfassen", "Mengen aus Foto übernehmen", "Mengen aus PDF übernehmen"],
    reviewTarget: "eingang_pruefung",
  },
  Kalkulation: {
    module: "Kalkulation",
    welcome: "Möchten Sie eine Kalkulation vorbereiten, prüfen oder aus LV starten?",
    actions: ["Kalkulation aus LV vorbereiten", "GAEB prüfen", "Positionen analysieren"],
    reviewTarget: "eingang_pruefung",
  },
  KiCalculation: {
    module: "KI-Kalkulation",
    welcome: "Möchten Sie die KI-Kalkulation starten oder vorhandene Positionen prüfen?",
    actions: ["KI-Kalkulation starten", "Positionen prüfen", "Risiken anzeigen"],
    reviewTarget: "eingang_pruefung",
  },
  ProjectHome: {
    module: "Projekt",
    welcome: "Was möchten Sie im Projekt machen?",
    actions: ["Projektinfos ausfüllen", "Dokument prüfen", "Zum Eingang senden"],
    reviewTarget: "eingang_pruefung",
  },
};

function withGlobalKi(ScreenComponent: any, screenName: string) {
  return function ScreenWithGlobalKi(props: any) {
    const params = props?.route?.params || {};
    const projectCode = String(
      params.projectCode || params.projectId || params.code || params.id || ""
    ).trim();

    const title = String(
      params.title || params.projectTitle || params.name || screenName || "RLC Mobile"
    ).trim();

    const kiContext =
      KI_MODULE_CONTEXTS[screenName] || {
        module: screenName,
        welcome: "Was möchten Sie machen?",
        actions: ["Informationen erfassen", "Dokument prüfen", "Mit RLC KI arbeiten"],
        reviewTarget: "eingang_pruefung",
      };

    return (
      <View style={{ flex: 1 }}>
        <ScreenComponent {...props} />
        <RlcKiFloatingButton
          projectId={String(params.projectId || projectCode || "").trim()}
          projectCode={projectCode || undefined}
          title={title}
          screen={screenName}
          autoOpen={true}
          autoOpenDelayMs={700}
          {...({ kiContext } as any)}
        />
      </View>
    );
  };
}

const ProjectsWithKi = withGlobalKi(ProjectsScreen, "Projects");
// ProjectHome ha gia il suo pulsante KI locale: non wrappare, evita doppia KI.
// const ProjectHomeWithKi = withGlobalKi(ProjectHomeScreen, "ProjectHome");
const EingangPruefungWithKi = withGlobalKi(EingangPruefungScreen, "EingangPruefung");
const TeamRolesWithKi = withGlobalKi(TeamRolesScreen, "TeamRoles");
const LvReadOnlyWithKi = withGlobalKi(LvReadOnlyScreen, "LvReadOnly");
const LvImportWithKi = withGlobalKi(LvImportScreen, "LvImport");
const KalkulationWithKi = withGlobalKi(KalkulationScreen, "Kalkulation");
const KiCalculationWithKi = withGlobalKi(KiCalculationScreen, "KiCalculation");
const KalkulationOutlierWithKi = withGlobalKi(KalkulationOutlierScreen, "KalkulationOutlier");
const AngebotListWithKi = withGlobalKi(AngebotListScreen, "AngebotList");
const AngebotEditorWithKi = withGlobalKi(AngebotEditorScreen, "AngebotEditor");
const MengenListWithKi = withGlobalKi(MengenListScreen, "MengenList");
const MengenEditorWithKi = withGlobalKi(MengenEditorScreen, "MengenEditor");
const RechnungListWithKi = withGlobalKi(RechnungListScreen, "RechnungList");
const RechnungEditorWithKi = withGlobalKi(RechnungEditorScreen, "RechnungEditor");
const AbschlagListWithKi = withGlobalKi(AbschlagListScreen, "AbschlagList");
const AbschlagEditorWithKi = withGlobalKi(AbschlagEditorScreen, "AbschlagEditor");
const SchlussrechnungWithKi = withGlobalKi(SchlussrechnungScreen, "Schlussrechnung");
const RegieWithKi = withGlobalKi(RegieScreen, "Regie");
const BautagebuchWithKi = withGlobalKi(BautagebuchScreen, "Bautagebuch");
const TagesberichtListWithKi = withGlobalKi(TagesberichtListScreen, "TagesberichtList");
const TagesberichtEditorWithKi = withGlobalKi(TagesberichtEditorScreen, "TagesberichtEditor");
const LieferscheinWithKi = withGlobalKi(LieferscheinScreen, "Lieferschein");
const PhotosNotesWithKi = withGlobalKi(PhotosNotesScreen, "PhotosNotes");
const InboxWithKi = withGlobalKi(InboxScreen, "Inbox");
const SupportChatWithKi = withGlobalKi(SupportChatScreen, "SupportChat");
const ProjectPdfsWithKi = withGlobalKi(ProjectPdfsScreen, "ProjectPdfs");
const PdfViewerWithKi = withGlobalKi(PdfViewerScreen, "PdfViewer");
const CompanyAdminWithKi = withGlobalKi(CompanyAdminScreen, "CompanyAdmin");
const CompanyOfflineSetupWithKi = withGlobalKi(CompanyOfflineSetupScreen, "CompanyOfflineSetup");
const CompanyImportWithKi = withGlobalKi(CompanyImportScreen, "CompanyImport");

export default function App() {
  useEffect(() => {
    if (!IS_DEV) return;

    (async () => {
      try {
        const base = await api.getApiUrl();
        console.log("[API] base url =", base);

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
        initialRouteName="Start"
        screenOptions={{
          headerStyle: { backgroundColor: "#F4F7FB" },
          headerTintColor: "#0F172A",
          headerTitleStyle: { fontWeight: "900" },
          contentStyle: { backgroundColor: "#F4F7FB" },
          animation: "slide_from_right",
        }}
      >
        {/* START */}
        <Stack.Screen
          name="Start"
          component={StartScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />

        {/* MODE */}
        <Stack.Screen
          name="Arbeitsmodus"
          component={ArbeitsmodusScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: "Anmelden", gestureEnabled: false }}
        />

        {/* COMPANY */}
        <Stack.Screen name="CompanyAdmin" component={CompanyAdminWithKi} />
        <Stack.Screen
          name="CompanyOfflineSetup"
          component={CompanyOfflineSetupWithKi}
        />
        <Stack.Screen name="CompanyImport" component={CompanyImportWithKi} />

        {/* PROJECTS */}
        <Stack.Screen name="Projects" component={ProjectsWithKi} />
        <Stack.Screen name="ProjectHome" component={ProjectHomeScreen} />

        {/* AUTH */}
        <Stack.Screen name="Anmelden" component={AnmeldenScreen} />
        <Stack.Screen
          name="EingangPruefung"
          component={EingangPruefungWithKi}
        />

        {/* META */}
        <Stack.Screen name="TeamRoles" component={TeamRolesWithKi} />
        <Stack.Screen name="LvReadOnly" component={LvReadOnlyWithKi} />
        <Stack.Screen name="LvImport" component={LvImportWithKi} />

        {/* KALKULATION / KI */}
        <Stack.Screen
          name="Kalkulation"
          component={KalkulationWithKi}
          options={{ title: "Kalkulation" }}
        />
        <Stack.Screen
          name="KiCalculation"
          component={KiCalculationWithKi}
          options={{ title: "KI-Kalkulation" }}
        />
        <Stack.Screen
          name="KalkulationOutlier"
          component={KalkulationOutlierWithKi}
          options={{ title: "Outlier Report" }}
        />
        <Stack.Screen
          name="RlcCopilot"
          component={RlcCopilotScreen}
          options={{ title: "RLC KI" }}
        />

        {/* ANGEBOT */}
        <Stack.Screen
          name="AngebotList"
          component={AngebotListWithKi}
          options={{ title: "Angebote" }}
        />
        <Stack.Screen
          name="AngebotEditor"
          component={AngebotEditorWithKi}
          options={{ title: "Angebot" }}
        />

        {/* MENGEN */}
        <Stack.Screen
          name="MengenList"
          component={MengenListWithKi}
          options={{ title: "Mengenermittlung" }}
        />
        <Stack.Screen
          name="MengenEditor"
          component={MengenEditorWithKi}
          options={{ title: "Mengenermittlung" }}
        />

        {/* RECHNUNG */}
        <Stack.Screen
          name="RechnungList"
          component={RechnungListWithKi as any}
          options={{ title: "Rechnungen" }}
        />
        <Stack.Screen
          name="RechnungEditor"
          component={RechnungEditorWithKi as any}
          options={{ title: "Rechnung" }}
        />

        {/* ABSCHLAG / SCHLUSS */}
        <Stack.Screen
          name="AbschlagList"
          component={AbschlagListWithKi}
          options={{ title: "Abschlagsrechnungen" }}
        />
        <Stack.Screen
          name="AbschlagEditor"
          component={AbschlagEditorWithKi}
          options={{ title: "Abschlagsrechnung" }}
        />
        <Stack.Screen
          name="Schlussrechnung"
          component={SchlussrechnungWithKi}
          options={{ title: "Schlussrechnung" }}
        />

        {/* DOCS */}
        <Stack.Screen
          name="Regie"
          component={RegieWithKi}
          options={{ title: "Regiebericht" }}
        />
        <Stack.Screen
          name="Bautagebuch"
          component={BautagebuchWithKi}
          options={{ title: "Bautagebuch" }}
        />
        <Stack.Screen
          name="TagesberichtList"
          component={TagesberichtListWithKi}
          options={{ title: "Tagesberichte" }}
        />
        <Stack.Screen
          name="TagesberichtEditor"
          component={TagesberichtEditorWithKi}
          options={{ title: "Tagesbericht" }}
        />
        <Stack.Screen
          name="Lieferschein"
          component={LieferscheinWithKi}
          options={{ title: "Lieferschein" }}
        />
        <Stack.Screen
          name="PhotosNotes"
          component={PhotosNotesWithKi}
          options={{ title: "Fotos / Notizen" }}
        />
        <Stack.Screen
          name="Inbox"
          component={InboxWithKi}
          options={{ title: "Inbox" }}
        />

        {/* SUPPORT */}
        <Stack.Screen
          name="SupportChat"
          component={SupportChatWithKi}
          options={{ title: "Support" }}
        />

        {/* PDF */}
        <Stack.Screen
          name="ProjectPdfs"
          component={ProjectPdfsWithKi}
          options={{ title: "PDFs" }}
        />
        <Stack.Screen
          name="PdfViewer"
          component={PdfViewerWithKi}
          options={{ title: "PDF Vorschau" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}



