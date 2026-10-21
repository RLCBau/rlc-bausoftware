# Technische und organisatorische Maßnahmen – RLC Mobile

Stand: 16.10.2026

## Zugriffskontrolle
- Benutzeranmeldung und rollenbezogener Serverzugriff.
- JWT/Auth-Token im geschützten OS SecureStore, soweit verfügbar.
- Serverwechsel löscht die SERVER_SYNC-Sitzung, damit Token nicht an einen fremden Server gesendet werden.
- Lokale Passwortverifikatoren gesalzen und im SecureStore gespeichert; Legacy-Verifikatoren werden migriert.

## Übertragungskontrolle
- Produktions-API über HTTPS.
- Private Server außerhalb Entwicklung müssen HTTPS verwenden.
- Verifizierte Serverprofile / QR-Pairing.
- Authentifizierte Downloads und Synchronisation verwenden zentralen Server-Token.

## Datensparsamkeit
- Keine Advertising-/Tracking-SDKs im auditierten Mobile-Quellcode festgestellt.
- Keine Hintergrundortung festgestellt.
- GPS nur bei ausdrücklich gestarteten Arbeitszeitereignissen.
- Android-Mikrofonpermission für Kamera deaktiviert.

## Vertraulichkeit auf dem Endgerät
- Offline-Daten liegen im App-Speicher; Endgeräteverschlüsselung, Gerätesperre und MDM liegen beim Betreiber.
- Sensible Secrets bevorzugt SecureStore; Altbestände aus AsyncStorage werden bei Zugriff migriert.
- Nicht synchronisierte Daten müssen vor App-Löschung/Gerätewechsel gesichert werden.

## Integrität / Nachvollziehbarkeit
- Zeitereignisse speichern Zeitpunkt, GPS-Genauigkeit und Geräteplattform.
- Workflowstatus DRAFT/EINGEREICHT/FREIGEGEBEN/ABGELEHNT.
- Finale steuerrelevante Archivierung und Unveränderbarkeit sind serverseitig sicherzustellen; Mobile-Cache ist kein WORM-Archiv.

## Verfügbarkeit / Wiederherstellung
- Offline-Modus ermöglicht lokale Weiterarbeit.
- SERVER_SYNC überträgt freigegebene/eingereichte Vorgänge an Server.
- Zentrale Backup-/Restore- und WORM-Nachweise sind Bestandteil der Server-Infrastruktur und separat zu testen.

## Prüfverfahren
Vor Release:
1. TypeScript Build.
2. statischer File-by-File Audit.
3. Dependency Audit ohne unkontrollierte Breaking-Upgrades.
4. physischer iOS-/Android-Smoke-Test.
5. API-/Pairing-/Login-/Sync-Test.
6. Datenschutz-/Store-Declaration-Abgleich.
7. jährliche und anlassbezogene TOM-Prüfung sowie nach erheblichen Architektur-/SDK-Änderungen.
