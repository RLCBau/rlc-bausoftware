# RLC Mobile – Static File-by-File Audit

Generated: 2026-10-17T13:13:49.627950
Files scanned: **85**; lines: **53503**

## Structural checks
- Navigation routes declared: 40; used: 35; undeclared: none
- API members used: 59; unresolved static references: ['rlcbausoftware']
- Files with direct fetch outside api.ts: 14
- Hardcoded http:// literals: 10
- Sensitive AsyncStorage references requiring review: 5
- Console logging files: 18
- TODO/FIXME files: 9

## File-by-file
| File | Lines | SHA16 | Flags |
|---|---:|---|---|
| src/components/DocActionBar.tsx | 96 | d044b1f4f6fbe7ca | OK-static |
| src/components/RlcCategoryGrid.tsx | 167 | 977c7ed0d1b98000 | OK-static |
| src/components/RlcKiFloatingButton.tsx | 385 | ab11a6a3faf291ed | OK-static |
| src/lib/api.ts | 3422 | 4930e443e9ab35f8 | API_UNRESOLVED:rlcbausoftware, CONSOLE:1, TODO:1, DEVICE_API:FileSystem |
| src/lib/appMode.ts | 27 | 43b1733c1c48b9df | OK-static |
| src/lib/auth.ts | 405 | a0e92a5c7f3537ad | DIRECT_FETCH:2, HTTP_LITERAL, CONSOLE:1, DEVICE_API:SecureStore |
| src/lib/autoSync.ts | 21 | 48dfc3963d090e95 | OK-static |
| src/lib/companyBundle.ts | 289 | f63abd5f96b1a308 | DEVICE_API:FileSystem,SecureStore |
| src/lib/companyCache.ts | 289 | 86423930401671a6 | DIRECT_FETCH:1, DEVICE_API:ImagePicker,FileSystem |
| src/lib/docSubmit.ts | 150 | e5c9060de0a4a125 | OK-static |
| src/lib/exportStorage.ts | 160 | 9c32baa7a078f3ff | DEVICE_API:FileSystem |
| src/lib/exporters/bautagebuchPdfBuilder.ts | 587 | 3caf1495f5f93c0d | DEVICE_API:FileSystem,Sharing,Print |
| src/lib/exporters/blueDocumentPdfBuilder.ts | 103 | 92084c778df78555 | CONSOLE:1, DEVICE_API:FileSystem,Print |
| src/lib/exporters/documentPdfBuilder.ts | 836 | f98f983dff6a281c | CONSOLE:1, TODO:1, DEVICE_API:FileSystem,Sharing,Print |
| src/lib/exporters/offlineExport.ts | 144 | 3790a1011a10b417 | DEVICE_API:Print |
| src/lib/exporters/pdfBranding.ts | 177 | 443b354c330fe3ec | DEVICE_API:FileSystem |
| src/lib/exporters/projectExport.ts | 3893 | b2a714484e6d29f0 | DIRECT_FETCH:1, TODO:5, DEVICE_API:FileSystem,MailComposer,Print |
| src/lib/exporters/regiePdf.ts | 151 | a6c0548fa91b22eb | OK-static |
| src/lib/exporters/schlussrechnungPdfBuilder.ts | 468 | 0be70dc35358eb1d | CONSOLE:1, DEVICE_API:FileSystem,Sharing,Print |
| src/lib/fiscalInvoice.ts | 58 | 8af487d79e87ed2a | OK-static |
| src/lib/fsDirs.ts | 34 | dfcde70c756e496e | DEVICE_API:FileSystem |
| src/lib/hydratePreview.ts | 295 | c95fb0fb782b0053 | DEVICE_API:FileSystem |
| src/lib/localAuth.ts | 104 | e9be73ba29eb5181 | DEVICE_API:SecureStore |
| src/lib/mailComposer.ts | 23 | 8a6a9e4e42b7793a | DEVICE_API:MailComposer |
| src/lib/mediaStore.ts | 88 | b1e5d80535241d34 | DEVICE_API:FileSystem |
| src/lib/mobilePdfCore.ts | 274 | f99eac96d55085bf | DIRECT_FETCH:1, DEVICE_API:FileSystem |
| src/lib/offerWorkbook.ts | 62 | 99b90b1535b21a4c | HTTP_LITERAL |
| src/lib/offlineQueue.ts | 702 | 3e70a349446e5f32 | OK-static |
| src/lib/openPdf.ts | 81 | 76d2e2e8b6c963a6 | DEVICE_API:FileSystem |
| src/lib/pdfStorage.ts | 367 | 4cb7b39ddc64db5f | DEVICE_API:FileSystem |
| src/lib/queueExecutor.ts | 30 | c81be488a8f82e3f | OK-static |
| src/lib/rlcKiFieldParser.ts | 311 | 2f9934111ff69f5c | OK-static |
| src/lib/rlcKiModuleBridge.ts | 139 | ed153b5d8ee200bd | CONSOLE:1 |
| src/lib/rlcKiSmartParser.ts | 458 | cf6923a77adb5f07 | OK-static |
| src/lib/serverProfile.ts | 190 | 95fff248a4e2498b | DIRECT_FETCH:1 |
| src/lib/storage.ts | 302 | 0965f12e1b3a1fcd | DEVICE_API:FileSystem |
| src/lib/submitToEingangPruefung.ts | 148 | 3eb6e25dabde78da | OK-static |
| src/lib/submitUnified.ts | 49 | eee42b6d63022d34 | OK-static |
| src/lib/sync.ts | 460 | 767e57e2630cf5a9 | DIRECT_FETCH:1 |
| src/navigation/types.ts | 279 | 01395ea0a3fd6ccb | OK-static |
| src/screens/AbschlagEditorScreen.tsx | 653 | 381b4fbbaba129c3 | CONSOLE:4 |
| src/screens/AbschlagListScreen.tsx | 274 | 89b2272aad13a110 | OK-static |
| src/screens/AngebotEditorScreen.tsx | 1428 | 54ce0f20c79f07ae | CONSOLE:2, DEVICE_API:FileSystem,Sharing |
| src/screens/AngebotListScreen.tsx | 986 | b8cf64a84e2402c7 | CONSOLE:1, DEVICE_API:FileSystem,Sharing |
| src/screens/AnmeldenScreen.tsx | 182 | 71a7ff03cfb33664 | OK-static |
| src/screens/ArbeitsmodusScreen.tsx | 299 | 11b91488b8faab57 | OK-static |
| src/screens/ArbeitszeitenScreen.tsx | 712 | 00f9e2c0998cb7c3 | DEVICE_API:Location |
| src/screens/BautagebuchScreen.tsx | 637 | d7d20ef604564c2f | CONSOLE:1, DEVICE_API:FileSystem,Sharing |
| src/screens/CompanyAdminScreen.tsx | 287 | dde78ff7e03d71ec | DEVICE_API:ImagePicker |
| src/screens/CompanyImportScreen.tsx | 395 | 11671478b4bce31b | DEVICE_API:Camera,DocumentPicker |
| src/screens/CompanyOfflineSetupScreen.tsx | 372 | 711483a2849a0983 | DEVICE_API:ImagePicker |
| src/screens/EingangPruefungScreen.tsx | 3350 | c1152a89104ec3b0 | DIRECT_FETCH:1, CONSOLE:2, TODO:1, DEVICE_API:FileSystem |
| src/screens/HomeScreen.tsx | 48 | dba56a3370e03780 | OK-static |
| src/screens/InboxScreen.tsx | 1638 | 22d60e4f5c321a69 | TODO:1 |
| src/screens/KalkulationOutlierScreen.tsx | 357 | 4432e6f7c5c6f163 | DIRECT_FETCH:1 |
| src/screens/KalkulationScreen.tsx | 701 | 5bd5e013b2276512 | DIRECT_FETCH:1 |
| src/screens/KiCalculationScreen.tsx | 501 | 6dc581f58339768f | DIRECT_FETCH:2 |
| src/screens/LieferscheinScreen.tsx | 2014 | a37c2bf13d19569a | CONSOLE:3, DEVICE_API:Camera,ImagePicker,DocumentPicker,FileSystem |
| src/screens/LoginScreen.tsx | 1966 | f448cda3561172f3 | DIRECT_FETCH:1, DEVICE_API:ImagePicker,SecureStore |
| src/screens/LvImportScreen.tsx | 883 | aad212b6fccf77e2 | DIRECT_FETCH:1, DEVICE_API:DocumentPicker,FileSystem |
| src/screens/LvReadOnlyScreen.tsx | 1079 | d91d377eae733371 | DEVICE_API:Sharing |
| src/screens/MengenEditorScreen.tsx | 882 | f232c505f783a459 | CONSOLE:6 |
| src/screens/MengenListScreen.tsx | 606 | b4baef6b42db101a | OK-static |
| src/screens/PdfViewerScreen.tsx | 601 | a68732be32f5e149 | CONSOLE:1, DEVICE_API:FileSystem,MailComposer,Sharing,Print |
| src/screens/PhotosNotesScreen.tsx | 1748 | fd9a9c12b07495a8 | CONSOLE:1, TODO:2, DEVICE_API:Camera,ImagePicker,DocumentPicker,FileSystem |
| src/screens/ProjectHomeScreen.tsx | 1757 | 9da0c3d096acf1c6 | CONSOLE:2, TODO:2, DEVICE_API:DocumentPicker |
| src/screens/ProjectPdfsScreen.tsx | 737 | 4c3dbc7a4620d279 | DEVICE_API:DocumentPicker,FileSystem |
| src/screens/ProjectsScreen.tsx | 1106 | 62aaf18f8653890b | TODO:1 |
| src/screens/RechnungEditorScreen.tsx | 1981 | f17a3d9430d34bd8 | OK-static |
| src/screens/RechnungListScreen.tsx | 581 | d84d069efaf9e3ef | OK-static |
| src/screens/RechtlichesScreen.tsx | 157 | 303844d7b9f9951f | DEVICE_API:WebBrowser |
| src/screens/RegieScreen.tsx | 2218 | 4333b41119909463 | DIRECT_FETCH:1, CONSOLE:2, DEVICE_API:Camera,ImagePicker,DocumentPicker,FileSystem |
| src/screens/RlcCopilotScreen.tsx | 727 | 97d02c7547591c9c | DIRECT_FETCH:2, TODO:1, DEVICE_API:FileSystem |
| src/screens/SchlussrechnungScreen.tsx | 419 | 34ce9f16754f7d6e | CONSOLE:3 |
| src/screens/ServerSetupScreen.tsx | 348 | addf5a221869e476 | API_UNRESOLVED:rlcbausoftware, DEVICE_API:Camera |
| src/screens/StartScreen.tsx | 451 | f820e99a285833ce | OK-static |
| src/screens/SupportChatScreen.tsx | 517 | 244aed399e641048 | OK-static |
| src/screens/TagesberichtEditorScreen.tsx | 1005 | ecbb24333646d695 | OK-static |
| src/screens/TagesberichtListScreen.tsx | 724 | 8bad673d38ebc814 | OK-static |
| src/screens/TeamRolesScreen.tsx | 721 | c171981a521da016 | OK-static |
| src/storage/projectMeta.ts | 189 | 7c93275c5aa44235 | OK-static |
| src/storage/session.ts | 38 | 7147559596f67fb6 | OK-static |
| src/ui/RlcUi.tsx | 189 | c7ce921ab93a0790 | OK-static |
| src/ui/inlineStyles.ts | 337 | c5a78738afaa6acb | OK-static |
| src/ui/theme.ts | 478 | ac25da0a7ee8cc59 | OK-static |

## Direct fetch outside central API
- src/lib/auth.ts: 2
- src/lib/companyCache.ts: 1
- src/lib/exporters/projectExport.ts: 1
- src/lib/mobilePdfCore.ts: 1
- src/lib/serverProfile.ts: 1
- src/lib/sync.ts: 1
- src/screens/EingangPruefungScreen.tsx: 1
- src/screens/KalkulationOutlierScreen.tsx: 1
- src/screens/KalkulationScreen.tsx: 1
- src/screens/KiCalculationScreen.tsx: 2
- src/screens/LoginScreen.tsx: 1
- src/screens/LvImportScreen.tsx: 1
- src/screens/RegieScreen.tsx: 1
- src/screens/RlcCopilotScreen.tsx: 2

## Sensitive AsyncStorage references
- src/lib/auth.ts: AsyncStorage.setItem(AUTH_MODE_KEY, normalizeMode(mode));
- src/lib/auth.ts: AsyncStorage.getItem(AUTH_MODE_KEY);
- src/lib/auth.ts: AsyncStorage.getItem(TOKEN_KEY));
- src/lib/auth.ts: AsyncStorage.getItem(SERVER_TOKEN_KEY)
- src/lib/companyBundle.ts: AsyncStorage.setItem(FALLBACK_SECRET_KEY, gen);