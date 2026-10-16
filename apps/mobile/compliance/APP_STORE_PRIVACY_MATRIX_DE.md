# RLC Mobile – App Store / Google Play Datenschutzmatrix

Stand: 16.10.2026

Diese Matrix ist vor jeder Store-Einreichung gegen den tatsächlich aktivierten Serverbetrieb zu prüfen.

| Datenkategorie | NUR_APP | SERVER_SYNC | Zweck |
|---|---|---|---|
| Name / E-Mail / Benutzer-ID | lokal | Server | Anmeldung, Rollen, Nachweis |
| Projekt-/Baustellendaten | lokal | Server | Kernfunktion |
| Fotos / Dokumente / Notizen | lokal | Server | Baustellendokumentation |
| Rechnungs-/Angebots-/Mengendaten | lokal | Server | kaufmännischer Workflow |
| Arbeitszeit | lokal | Server | Zeiterfassung / Nachweis |
| Präziser Standort bei Zeitereignissen | lokal | Server nach Einreichung | Nachweis einer ausdrücklich gestarteten Zeitbuchung |
| Geräteplattform / OS-Version bei Zeitereignissen | lokal | Server nach Einreichung | technischer Nachweis |
| Authentifizierungstoken | SecureStore | wird für API-Authentifizierung verwendet | Sicherheit |
| Diagnose-/Entwicklungslogs | geräteabhängig | nicht als Analytics vorgesehen | Entwicklung/Fehleranalyse |

## Apple App Privacy
Voraussichtlich anzugeben, sofern SERVER_SYNC produktiv genutzt wird:
- Contact Info: Name, Email Address.
- User Content: Photos or Videos, Customer Support, Other User Content/Documents.
- Identifiers: User ID.
- Location: Precise Location, nur im Arbeitszeiten-Modul und nur bei aktiver Zeitbuchung.
- Other Data: projektbezogene fachliche Daten, soweit die Store-Kategorie dies verlangt.

Kein Advertising Tracking und keine Werbe-ID-Nutzung im auditierten Quellcode gefunden.

## Google Play Data Safety
Für jede Kategorie deklarieren:
- collected vs. shared,
- required vs. optional,
- purpose,
- encryption in transit,
- deletion mechanism.

Standort darf nicht als Hintergrundortung deklariert werden, solange keine Background-Location-Funktion hinzugefügt wird.

## Release gate
Store-Formulare müssen mit der Datenschutzerklärung und dem tatsächlichen Serverbetrieb übereinstimmen. Änderungen an SDKs/Analytics/Crash-Reporting erfordern eine erneute Prüfung.
