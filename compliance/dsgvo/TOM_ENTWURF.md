# RLC Bausoftware – Technische und organisatorische Maßnahmen (TOM), ENTWURF
Stand 09.10.2026. Art. 32 DSGVO; tatsächliche Prüfbeweise und Restrisiken laufend dokumentieren.

| Schutzbereich | Beobachtete Umsetzung | Bewertung | Fehlender Abschlussnachweis |
|---|---|---|---|
| Zutritts-/Zugangskontrolle | Authentifizierung, Rollen, restriktive Dateien | TEILWEISE | periodische Rechteprüfung aller Clients und Module |
| Vertraulichkeit/Mandantentrennung | RBAC, Firmenkontext, Backend-KI | TEILWEISE | vollständige Tenant-Isolation- und Pen-Tests |
| Übertragungsschutz | TLS/Nginx-Härtung in bisherigem Audit | TEILWEISE | unabhängiger TLS-Test und mobile Kommunikationsprüfung |
| Integrität | Privacy-Evidenzsperren, SHA-256 und Auditspuren | TEILWEISE | manipulationsresistente zentrale Auditspur |
| Verfügbarkeit | PostgreSQL- und MinIO-Test-Restore, Healthchecks | IM GETESTETEN UMFANG PASS | RTO/RPO, vollumfängliche DR-Übung |
| Backup | AES-256/PBKDF2, Hetzner Storage Box, 90-Tage-Rotation | IM GETESTETEN UMFANG PASS | Nachweis unabhängiger Unveränderbarkeit, Löschfreigabe |
| Erasure-Restore | Ledger, Gate vor Start, externe verschlüsselte Kopie | TEILWEISE | vollständige echte Löschung inkl. S3-Versionen/Mobile/Subprozessoren |
| Vorfallmanagement | Data-Breach-Register, interne Überwachung | TEILWEISE | 24/7-Notfallprozess, bestätigte Alarmzustellung |
| Datenschutz durch Technikgestaltung | synthetische Löschtests, reale Löschung gesperrt | TEILWEISE | KI-/GPS-/Beschäftigten-DSFA und Datenminimierung |
| Lieferkette | dokumentierte Container-Härtung | TEILWEISE | AVV/Unterauftragsverarbeiter, Patch-/Vuln-Nachweise |

**Betriebsprozesse:** Zugriffsprüfung vierteljährlich, Pflicht zur Vertraulichkeit, Incident-Triage ohne Verzug, Verschlüsselungs-/Schlüsselmanagement, dokumentierte Backup-/Restore-Übungen, Freigabe von Software-Releases, jährliche TOM- und Lieferantenprüfung.

**Freigabestatus:** Technische Teilprüfungen vorhanden, keine Gesamtzertifizierung; unterschriebene Verantwortungszuweisung und unabhängige Beweiskontrolle fehlen.
