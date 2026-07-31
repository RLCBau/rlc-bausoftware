import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// apps/web/src/pages/ki/ManuellFoto.tsx
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProject } from "../../store/useProject";
// @ts-ignore – einfache Einbindung
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";
// ⚙️ API-Basis (am besten in .env: VITE_API_URL="https://api.rlcbausoftware.com/api")
const API = import.meta?.env?.VITE_API_URL || "https://api.rlcbausoftware.com/api";
const KI_REGIE_BUFFER_KEY = "ki-regie-buffer";
const prettyScore = (s) => (s * 100).toFixed(1) + "%";
const STATE_STORAGE_KEY = "rlc-manuell-foto-v1";
const HISTORY_KEY_BASE = "rlc-foto-history";
/* ===== Backend-Helfer ==================================== */
async function uploadFotoToBackend(projectId, file, note, extras, boxes) {
    const form = new FormData();
    form.append("file", file);
    form.append("note", note);
    form.append("extras", JSON.stringify(extras));
    form.append("boxes", JSON.stringify(boxes));
    const res = await fetch(`${API}/projects/${projectId}/fotos`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        console.error("Fehler beim Speichern Foto:", await res.text());
        return null;
    }
    const entry = await res.json();
    const backendFile = String(entry.file);
    return {
        id: crypto.randomUUID(),
        projectId,
        createdAt: String(entry.createdAt),
        note: String(entry.note ?? ""),
        extras: Array.isArray(entry.extras) ? entry.extras : [],
        boxes: Array.isArray(entry.boxes) ? entry.boxes : [],
        imgUrl: `${API}/projects/${projectId}/fotos/${backendFile}`,
        savedToBackend: true,
        backendId: String(entry.id),
        backendFile,
    };
}
async function deleteFotoFromBackend(projectId, backendId) {
    const res = await fetch(`${API}/projects/${projectId}/fotos/${backendId}`, {
        method: "DELETE",
    });
    if (!res.ok) {
        console.error("Fehler beim Löschen im Backend:", await res.text());
        return false;
    }
    return true;
}
/** Hilfsfunktion: vorhandenen Verlaufseintrag im Backend speichern (aus imgUrl) */
async function saveFotoEntryToBackend(projectId, entry) {
    if (!entry.imgUrl)
        return null;
    try {
        const resp = await fetch(entry.imgUrl);
        const blob = await resp.blob();
        const file = new File([blob], "baustellenfoto.jpg", {
            type: blob.type || "image/jpeg",
        });
        const saved = await uploadFotoToBackend(projectId, file, entry.note, entry.extras, entry.boxes);
        if (!saved)
            return null;
        return {
            ...entry,
            savedToBackend: true,
            backendId: saved.backendId,
            backendFile: saved.backendFile,
            imgUrl: saved.imgUrl,
            projectId,
        };
    }
    catch (e) {
        console.error("Fehler beim Foto-Speichern ins Projekt", e);
        return null;
    }
}
export default function ManuellFoto() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const urlProjectId = searchParams.get("projectId");
    const from = searchParams.get("from") || "";
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    // ❗ effektive Projekt-ID (für Dateien/Fotos)
    const effectiveProjectId = urlProjectId ||
        project?.code ||
        project?.id ||
        null;
    const historyKey = React.useMemo(() => `${HISTORY_KEY_BASE}_${effectiveProjectId ?? "default"}`, [effectiveProjectId]);
    const [file, setFile] = React.useState(null);
    const [imgUrl, setImgUrl] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    // ✅ zusätzlicher Busy-State nur fürs Speichern (damit Analyse nicht blockiert)
    const [saveBusy, setSaveBusy] = React.useState(false);
    const [result, setResult] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [extras, setExtras] = React.useState([]);
    const [history, setHistory] = React.useState([]);
    const canvasRef = React.useRef(null);
    const imgRef = React.useRef(null);
    /* ---- aktuellen Zustand laden ---- */
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(STATE_STORAGE_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (parsed.imgUrl)
                setImgUrl(parsed.imgUrl);
            if (parsed.note)
                setNote(parsed.note);
            if (parsed.extras)
                setExtras(parsed.extras);
            if (parsed.result)
                setResult(parsed.result);
        }
        catch (e) {
            console.error("Konnte lokalen Zustand nicht laden", e);
        }
    }, []);
    React.useEffect(() => {
        try {
            const data = JSON.stringify({ imgUrl, note, extras, result });
            localStorage.setItem(STATE_STORAGE_KEY, data);
        }
        catch (e) {
            console.error("Konnte lokalen Zustand nicht speichern", e);
        }
    }, [imgUrl, note, extras, result]);
    /* ---- Historie laden ---- */
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(historyKey);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setHistory(parsed);
            }
        }
        catch (e) {
            console.error("Konnte Foto-Historie nicht laden", e);
        }
    }, [historyKey]);
    /* ---- Overlay zeichnen ---- */
    React.useEffect(() => {
        if (!imgUrl || !result?.boxes?.length)
            return;
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas)
            return;
        const draw = () => {
            const W = img.naturalWidth;
            const H = img.naturalHeight;
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext("2d");
            if (!ctx)
                return;
            ctx.clearRect(0, 0, W, H);
            ctx.lineWidth = 3;
            ctx.font = "18px system-ui";
            ctx.textBaseline = "top";
            result.boxes.forEach((b) => {
                if (!b.box)
                    return;
                const [x, y, w, h] = b.box;
                ctx.strokeStyle = "#0b1324";
                ctx.fillStyle = "rgba(11,19,36,0.08)";
                ctx.fillRect(x * W, y * H, w * W, h * H);
                ctx.strokeRect(x * W, y * H, w * W, h * H);
                const tag = `${b.label}${b.qty ? ` (${b.qty} ${b.unit ?? ""})` : ""} ${prettyScore(b.score)}`;
                const tw = ctx.measureText(tag).width + 10;
                const tx = x * W;
                const ty = Math.max(0, y * H - 22);
                ctx.fillStyle = "rgba(255,255,255,0.9)";
                ctx.fillRect(tx, ty, tw, 22);
                ctx.fillStyle = "#0b1324";
                ctx.fillText(tag, tx + 5, ty + 3);
            });
        };
        if (img.complete)
            draw();
        else
            img.onload = draw;
    }, [imgUrl, result]);
    /* ---- Datei wählen ---- */
    const onPick = (f) => {
        setResult(null);
        setExtras([]);
        setError(null);
        setFile(f);
        const url = URL.createObjectURL(f);
        setImgUrl(url);
    };
    const onDrop = (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f)
            onPick(f);
    };
    const onSelect = (e) => {
        const f = e.target.files?.[0];
        if (f)
            onPick(f);
    };
    /* ---- KI-Analyse (mit /ki/photo-analyze) ---- */
    const analyze = async () => {
        if (!file) {
            setError("Bitte zuerst ein Foto importieren (für die KI-Analyse wird die Datei benötigt).");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", file);
            if (note)
                form.append("note", note);
            if (effectiveProjectId)
                form.append("projectId", effectiveProjectId);
            const res = await fetch(`${API}/ki/photo-analyze`, {
                method: "POST",
                body: form,
            });
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data = (await res.json());
            const positions = data.positions || [];
            // Rechte Tabelle (Bauteile)
            const boxes = positions.map((p, idx) => ({
                id: p.id || String(idx + 1),
                label: p.kurztext,
                score: 0.95,
                qty: undefined,
                unit: p.einheit || "",
                box: undefined,
            }));
            setResult({
                boxes,
                summary: data.summary || "Fotoanalyse mit KI durchgeführt.",
            });
            // Zusätzliche Positionen für das Aufmaß + LV-Position speichern
            const extraRows = positions.map((p) => ({
                id: crypto.randomUUID(),
                typ: "KI",
                lvPos: p.id || "", // ⬅️ LV-Positionsnummer für PDF / Regie
                beschreibung: p.kurztext,
                einheit: p.einheit || "",
                menge: 0,
            }));
            setExtras(extraRows);
        }
        catch (e) {
            console.error("Fehler bei KI-Fotoanalyse:", e);
            setError("Fehler bei der KI-Analyse. Bitte Server/OPENAI-Key prüfen.");
        }
        finally {
            setBusy(false);
        }
    };
    /* ---- Extras bearbeiten ---- */
    const addExtra = () => {
        setExtras((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                typ: "Manuell",
                lvPos: "", // manuell noch keine LV-Pos
                beschreibung: "",
                einheit: "m",
                menge: 0,
            },
        ]);
    };
    const patchExtra = (id, patch) => {
        setExtras((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };
    const removeExtra = (id) => {
        setExtras((prev) => prev.filter((r) => r.id !== id));
    };
    /* ---- NEU: Speichern (gleiche Logik wie Ins Aufmaß übernehmen, ohne Navigation) ---- */
    const handleSpeichern = async () => {
        if (!effectiveProjectId) {
            alert("Bitte zuerst ein Projekt wählen.");
            return;
        }
        if (saveBusy)
            return;
        setSaveBusy(true);
        try {
            const boxes = result?.boxes ?? [];
            // 1) Verlaufseintrag anlegen (lokal)
            const entryId = crypto.randomUUID();
            const entry = {
                id: entryId,
                projectId: effectiveProjectId,
                createdAt: new Date().toISOString(),
                imgUrl,
                note,
                extras,
                boxes,
                savedToBackend: false,
            };
            setHistory((prev) => {
                const updated = [...prev, entry];
                try {
                    localStorage.setItem(historyKey, JSON.stringify(updated));
                }
                catch (e) {
                    console.error("Konnte Foto-Historie nicht speichern", e);
                }
                return updated;
            });
            // 2) Foto + Metadaten ins Projekt speichern (FS/DB je nach Backend)
            const saved = await saveFotoEntryToBackend(effectiveProjectId, entry);
            if (saved) {
                setHistory((prev) => {
                    const next = prev.map((h) => (h.id === entryId ? saved : h));
                    try {
                        localStorage.setItem(historyKey, JSON.stringify(next));
                    }
                    catch (e) {
                        console.error("Konnte Foto-Historie nicht speichern", e);
                    }
                    return next;
                });
            }
            else {
                alert("Foto konnte nicht im Projekt gespeichert werden.");
            }
            // 3) Aufmaß-Übernahme-Endpoint triggern (schreibt ins Projekt-Root wie bei Übernehmen)
            try {
                await fetch(`${API}/aufmass/from-foto`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectId: effectiveProjectId,
                        from,
                        note,
                        extras,
                        boxes,
                    }),
                });
            }
            catch (e) {
                console.error("Fehler beim Speichern (from-foto)", e);
                // nicht abbrechen: Foto ist ggf. schon gespeichert
            }
            alert("Gespeichert (Projekt).");
        }
        finally {
            setSaveBusy(false);
        }
    };
    /* ---- Ins Aufmaß übernehmen (inkl. automatischem Projekt-Save) ---- */
    const goToAufmass = async () => {
        const boxes = result?.boxes ?? [];
        if (imgUrl) {
            const entryId = crypto.randomUUID();
            const entry = {
                id: entryId,
                projectId: effectiveProjectId,
                createdAt: new Date().toISOString(),
                imgUrl,
                note,
                extras,
                boxes,
                savedToBackend: false,
            };
            setHistory((prev) => {
                const updated = [...prev, entry];
                try {
                    localStorage.setItem(historyKey, JSON.stringify(updated));
                }
                catch (e) {
                    console.error("Konnte Foto-Historie nicht speichern", e);
                }
                return updated;
            });
            // gleich beim Übergang ins Aufmaß im Projekt speichern
            if (effectiveProjectId) {
                const saved = await saveFotoEntryToBackend(effectiveProjectId, entry);
                if (saved) {
                    setHistory((prev) => {
                        const next = prev.map((h) => (h.id === entryId ? saved : h));
                        try {
                            localStorage.setItem(historyKey, JSON.stringify(next));
                        }
                        catch (e) {
                            console.error("Konnte Foto-Historie nicht speichern", e);
                        }
                        return next;
                    });
                }
            }
        }
        try {
            await fetch("/api/aufmass/from-foto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    from,
                    note,
                    extras,
                    boxes,
                }),
            });
        }
        catch (e) {
            console.error("Fehler beim Übergeben ins Aufmaß", e);
        }
        navigate("/mengenermittlung/aufmasseditor");
    };
    /* ---- Zu Regieberichten (alles aus extras + Foto) ---- */
    const goToRegieberichte = () => {
        if (!effectiveProjectId) {
            alert("Bitte zuerst ein Projekt wählen.");
            return;
        }
        const dateStr = new Date().toISOString().slice(0, 10);
        const baseItems = extras.length > 0
            ? extras
            : (result?.boxes ?? []).map((b) => ({
                id: crypto.randomUUID(),
                typ: "KI",
                lvPos: "",
                beschreibung: b.label,
                einheit: b.unit || "",
                menge: b.qty ?? 0,
            }));
        if (!baseItems.length) {
            alert("Keine Positionen vorhanden. Bitte zuerst die KI laufen lassen oder manuelle Positionen erfassen.");
            return;
        }
        const items = baseItems.map((ex) => ({
            date: dateStr,
            worker: "",
            hours: 0,
            machine: "",
            material: "",
            menge: ex.menge ?? 0,
            einheit: ex.einheit ?? "",
            kurztext: ex.beschreibung || "Regieposition aus Foto",
            lvItemPos: ex.lvPos || "",
            // einfache Foto-Weitergabe (objectURL reicht, da wir direkt weiterleiten)
            photoUrl: imgUrl || null,
        }));
        localStorage.setItem(KI_REGIE_BUFFER_KEY, JSON.stringify({
            projectId: effectiveProjectId,
            items,
        }));
        navigate(`/mengenermittlung/regieberichte?projectId=${encodeURIComponent(effectiveProjectId)}&from=ki&date=${dateStr}`);
    };
    const sumQty = (result?.boxes ?? []).reduce((a, b) => a + (b.qty ?? 0), 0);
    /* ---- PDF Export ---- */
    const exportPdfForEntry = (h) => {
        const doc = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4",
        });
        const left = 15;
        let y = 15;
        const projTitle = project ? `${project.code} – ${project.name}` : "Projekt";
        const projMeta = project ? [project.client, project.place].filter(Boolean).join(" • ") : "";
        doc.setFontSize(14);
        doc.text("Foto-Aufmaß Bericht", left, y);
        y += 8;
        doc.setFontSize(11);
        doc.text(projTitle, left, y);
        y += 5;
        if (projMeta) {
            doc.text(projMeta, left, y);
            y += 5;
        }
        doc.text(`Datum: ${new Date(h.createdAt).toLocaleString("de-DE")}`, left, y);
        y += 6;
        if (h.note && h.note.trim()) {
            doc.text(`Beschreibung: ${h.note}`, left, y);
            y += 6;
        }
        // Tabelle: Typ | LV-Positionen | Beschreibung | Mengen
        const head = [["Typ", "LV-Positionen", "Beschreibung", "Mengen"]];
        const body = h.extras.map((ex) => {
            const mengeStr = (ex.menge ?? 0).toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }) + (ex.einheit ? ` ${ex.einheit}` : "");
            return [
                ex.typ,
                ex.lvPos || "", // ⬅️ Nummer wie 001.001 / FOTO.004
                ex.beschreibung || "", // ⬅️ Text direkt unter "Beschreibung"
                mengeStr,
            ];
        });
        // Platz für Bild rechts freilassen
        const imgWidth = 90;
        const reservedRight = 15 + imgWidth + 5;
        autoTable(doc, {
            startY: y + 2,
            head,
            body,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [37, 99, 235] },
            margin: { left, right: reservedRight },
            columnStyles: {
                0: { cellWidth: 16 }, // Typ
                1: { cellWidth: 24 }, // LV-Pos
                2: { cellWidth: "auto" }, // Beschreibung
                3: { cellWidth: 25, halign: "right" }, // Mengen
            },
        });
        if (h.imgUrl) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const pageWidth = doc.internal.pageSize.getWidth();
                const ratio = img.height / img.width;
                const imgHeight = imgWidth * ratio;
                const x = pageWidth - imgWidth - 15;
                const imgY = 25;
                doc.addImage(img, "JPEG", x, imgY, imgWidth, imgHeight);
                doc.save(`Foto-Aufmass_${project?.code ?? "Projekt"}_${new Date(h.createdAt)
                    .toISOString()
                    .slice(0, 10)}.pdf`);
            };
            img.src = h.imgUrl;
        }
        else {
            doc.save(`Foto-Aufmass_${project?.code ?? "Projekt"}_${new Date(h.createdAt)
                .toISOString()
                .slice(0, 10)}.pdf`);
        }
    };
    /* ---- Verlauf Helper ---- */
    const persistHistory = (next) => {
        try {
            localStorage.setItem(historyKey, JSON.stringify(next));
        }
        catch (e) {
            console.error("Konnte Foto-Historie nicht speichern", e);
        }
    };
    const handleHistoryEdit = (h) => {
        setImgUrl(h.imgUrl);
        setNote(h.note);
        setExtras(h.extras || []);
        setResult({
            boxes: h.boxes || [],
            summary: "Ergebnis aus gespeicherten Daten (Foto-Verlauf). Mengen bitte im Aufmaß prüfen.",
        });
        setFile(null);
    };
    const handleHistoryDelete = async (h) => {
        const confirm = window.confirm("Dieses Foto aus dem Verlauf löschen? (Falls bereits gespeichert, wird es auch im Projekt gelöscht.)");
        if (!confirm)
            return;
        if (effectiveProjectId && h.savedToBackend && h.backendId) {
            await deleteFotoFromBackend(effectiveProjectId, h.backendId);
        }
        setHistory((prev) => {
            const next = prev.filter((x) => x.id !== h.id);
            persistHistory(next);
            return next;
        });
    };
    const handleHistorySave = async (h) => {
        if (!effectiveProjectId) {
            alert("Kein Projekt gewählt – Foto kann nicht im Projekt gespeichert werden.");
            return;
        }
        if (h.savedToBackend) {
            alert("Dieses Foto ist bereits im Projekt gespeichert.");
            return;
        }
        const saved = await saveFotoEntryToBackend(effectiveProjectId, h);
        if (!saved) {
            alert("Foto konnte nicht im Projekt gespeichert werden.");
            return;
        }
        setHistory((prev) => {
            const next = prev.map((x) => (x.id === h.id ? saved : h));
            persistHistory(next);
            return next;
        });
    };
    /* ==================== RENDER ===================== */
    return (_jsxs("div", { className: "card", style: { padding: 0 }, children: [_jsxs("div", { style: {
                    display: "flex",
                    gap: 8,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--line)",
                }, children: [_jsx("div", { style: { fontWeight: 700, opacity: 0.8 }, children: "Manuell \u00B7 per Foto / Sprache" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", type: "button", onClick: analyze, disabled: busy, children: busy ? "Analysiere …" : "KI analysieren" }), _jsx("button", { className: "btn", type: "button", onClick: handleSpeichern, disabled: saveBusy || !effectiveProjectId, style: { marginLeft: 8 }, title: !effectiveProjectId ? "Bitte zuerst ein Projekt wählen" : "Speichert ins Projekt", children: saveBusy ? "Speichert …" : "Speichern" }), _jsx("button", { className: "btn", type: "button", onClick: goToAufmass, style: { marginLeft: 8 }, children: "Ins Aufma\u00DF \u00FCbernehmen" }), _jsx("button", { className: "btn", type: "button", onClick: goToRegieberichte, style: { marginLeft: 8 }, children: "Zu Regieberichten" })] }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "minmax(260px, 50%) minmax(260px, 50%)",
                    gap: 10,
                    padding: 10,
                }, children: [_jsxs("div", { className: "card", style: { padding: 12 }, children: [!imgUrl ? (_jsxs("div", { onDragOver: (e) => e.preventDefault(), onDrop: onDrop, style: {
                                    border: "1px dashed var(--line)",
                                    borderRadius: 10,
                                    padding: 24,
                                    textAlign: "center",
                                    color: "var(--muted)",
                                }, children: [_jsxs("div", { style: { marginBottom: 10 }, children: ["Ziehen Sie ein Baustellenfoto hierher", _jsx("br", {}), "oder klicken Sie auf \u201EFoto importieren (JPG/PNG)\u201C."] }), _jsxs("label", { className: "btn", style: { cursor: "pointer" }, children: ["Foto importieren (JPG/PNG)", _jsx("input", { type: "file", accept: "image/*", onChange: onSelect, style: { display: "none" } })] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                                            border: "1px solid var(--line)",
                                            borderRadius: 10,
                                            padding: 8,
                                            maxHeight: 420,
                                            overflow: "hidden",
                                        }, children: _jsxs("div", { style: {
                                                position: "relative",
                                                width: "100%",
                                                height: 0,
                                                paddingBottom: "65%",
                                            }, children: [_jsx("img", { ref: imgRef, src: imgUrl, alt: "Baustellenfoto", style: {
                                                        position: "absolute",
                                                        inset: 0,
                                                        width: "100%",
                                                        height: "100%",
                                                        objectFit: "contain",
                                                        display: "block",
                                                    } }), _jsx("canvas", { ref: canvasRef, style: {
                                                        position: "absolute",
                                                        inset: 0,
                                                        width: "100%",
                                                        height: "100%",
                                                        pointerEvents: "none",
                                                    } })] }) }), _jsx("div", { style: { marginTop: 10 }, children: _jsxs("label", { className: "btn", style: { cursor: "pointer" }, children: ["Foto importieren", _jsx("input", { type: "file", accept: "image/*", onChange: onSelect, style: { display: "none" } })] }) })] })), error && (_jsx("div", { style: { color: "#b00020", marginTop: 8, fontSize: 13 }, children: error })), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("label", { style: lbl, children: "Sprachnotiz / Text" }), _jsx("textarea", { value: note, onChange: (e) => setNote(e.target.value), placeholder: "z. B. Bereich Nord, Zufahrt, Bauabschnitt \u2026", style: {
                                            ...inpWide,
                                            minHeight: 80,
                                            resize: "vertical",
                                            marginTop: 4,
                                        } })] })] }), _jsxs("div", { className: "card", style: { padding: 12 }, children: [_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "Vorschau (Ergebnisse der KI)" }), !result ? (_jsxs("div", { style: { opacity: 0.7, fontSize: 13 }, children: ["Noch keine Analyse durchgef\u00FChrt. Klicken Sie oben auf", _jsx("b", { children: " \u201EKI analysieren\u201C" }), ", nachdem ein Foto importiert wurde."] })) : (_jsxs(_Fragment, { children: [result.summary && (_jsxs("div", { style: {
                                                    padding: "6px 8px",
                                                    background: "#f7f7fb",
                                                    borderRadius: 6,
                                                    marginBottom: 8,
                                                    fontSize: 13,
                                                }, children: [_jsx("b", { children: "Zusammenfassung:" }), " ", result.summary] })), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Bauteil" }), _jsx("th", { style: th, children: "Sicherheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Einheit" })] }) }), _jsx("tbody", { children: result.boxes.map((b) => (_jsxs("tr", { children: [_jsx("td", { style: td, children: b.label }), _jsx("td", { style: td, children: prettyScore(b.score) }), _jsx("td", { style: td, children: b.qty ?? "-" }), _jsx("td", { style: td, children: b.unit ?? "-" })] }, b.id))) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { style: { ...td, fontWeight: 700 }, colSpan: 2, children: "Summe" }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: sumQty || "-" }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: "\u2013" })] }) })] })] }))] }), _jsxs("div", { children: [_jsxs("div", { style: {
                                            display: "flex",
                                            alignItems: "center",
                                            marginBottom: 6,
                                            gap: 10,
                                        }, children: [_jsx("div", { style: { fontWeight: 600 }, children: "Zus\u00E4tzliche Positionen (aus Foto / manuell)" }), _jsx("button", { className: "btn", type: "button", onClick: addExtra, style: { padding: "4px 10px", fontSize: 12 }, children: "+ Zeile" })] }), extras.length === 0 ? (_jsxs("div", { style: { opacity: 0.7, fontSize: 13 }, children: ["Noch keine zus\u00E4tzlichen Positionen. Mit ", _jsx("b", { children: "\u201E+ Zeile\u201C" }), " ", "kannst du manuelle Positionen erg\u00E4nzen (z. B. \u201EPflaster verlegen\u201C)."] })) : (_jsxs("table", { style: {
                                            width: "100%",
                                            borderCollapse: "collapse",
                                            marginTop: 4,
                                        }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Beschreibung / LV-Bezug" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: extras.map((r) => (_jsxs("tr", { children: [_jsx("td", { style: td, children: r.typ }), _jsxs("td", { style: td, children: [_jsx("input", { type: "text", value: r.beschreibung, onChange: (e) => patchExtra(r.id, { beschreibung: e.target.value }), placeholder: "z. B. Pflasterfl\u00E4che herstellen", style: inpWide }), r.lvPos && (_jsxs("div", { style: { fontSize: 11, opacity: 0.7, marginTop: 2 }, children: ["LV-Pos: ", r.lvPos] }))] }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: r.einheit, onChange: (e) => patchExtra(r.id, { einheit: e.target.value }), style: { ...inpBase, width: 70 } }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", step: "0.01", value: r.menge, onChange: (e) => patchExtra(r.id, { menge: Number(e.target.value) || 0 }), style: { ...inpBase, width: 90 } }) }), _jsx("td", { style: td, children: _jsx("button", { className: "btn", type: "button", onClick: () => removeExtra(r.id), style: { padding: "2px 8px", fontSize: 12 }, children: "\u2715" }) })] }, r.id))) })] }))] })] })] }), history.length > 0 && (_jsx("div", { style: { padding: "0 10px 10px" }, children: _jsxs("div", { style: {
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                    }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6, fontSize: 14 }, children: "Foto-Verlauf (Projekt)" }), _jsx("div", { style: { maxHeight: 260, overflow: "auto" }, children: history.map((h) => (_jsxs("div", { style: {
                                    display: "flex",
                                    gap: 10,
                                    padding: "6px 4px",
                                    borderBottom: "1px solid #E5E7EB",
                                }, children: [_jsx("div", { style: {
                                            width: 80,
                                            height: 60,
                                            borderRadius: 6,
                                            overflow: "hidden",
                                            background: "#F3F4F6",
                                            flexShrink: 0,
                                        }, children: h.imgUrl && (_jsx("img", { src: h.imgUrl, alt: "Foto", style: {
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
                                                display: "block",
                                            } })) }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 2 }, children: new Date(h.createdAt).toLocaleString("de-DE", {
                                                    dateStyle: "short",
                                                    timeStyle: "short",
                                                }) }), _jsx("div", { style: {
                                                    fontSize: 12,
                                                    color: "#4B5563",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }, children: h.note && h.note.trim() ? h.note : "Ohne Beschreibung" }), _jsxs("div", { style: { fontSize: 11, color: "#6B7280", marginTop: 2, marginBottom: 2 }, children: [h.extras.length, " Position(en), KI-Bauteile:", " ", h.boxes.map((b) => b.label).join(", ") || "–"] }), h.extras.length > 0 && (_jsx("div", { style: { fontSize: 11, color: "#111827", marginTop: 2 }, children: h.extras.map((ex) => (_jsxs("div", { children: ["\u2022 ", ex.typ, " \u2013 ", ex.lvPos ? `${ex.lvPos} – ` : "", ex.beschreibung, " (", ex.menge, " ", ex.einheit, ")"] }, ex.id))) })), h.savedToBackend && (_jsx("div", { style: { fontSize: 10, color: "#059669", marginTop: 4 }, children: "\u2713 Im Projekt gespeichert" }))] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }, children: [_jsx("button", { className: "btn", type: "button", style: { fontSize: 11, padding: "2px 8px" }, onClick: () => handleHistorySave(h), disabled: !effectiveProjectId || h.savedToBackend, children: "Foto speichern" }), _jsx("button", { className: "btn", type: "button", style: { fontSize: 11, padding: "2px 8px" }, onClick: () => handleHistoryEdit(h), children: "Foto bearbeiten" }), _jsx("button", { className: "btn", type: "button", style: { fontSize: 11, padding: "2px 8px" }, onClick: () => handleHistoryDelete(h), children: "Foto l\u00F6schen" }), _jsx("button", { className: "btn", type: "button", style: { fontSize: 11, padding: "2px 8px" }, onClick: () => exportPdfForEntry(h), children: "PDF" })] })] }, h.id))) })] }) }))] }));
}
/* ---- Styles ---- */
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle",
};
const lbl = { fontSize: 13, opacity: 0.8 };
const inpBase = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13,
};
const inpWide = { ...inpBase, width: "100%" };
