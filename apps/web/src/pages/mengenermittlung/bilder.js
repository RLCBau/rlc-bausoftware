import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import MengPageHeader from "./MengPageHeader";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";
const shell = {
    maxWidth: 1480,
    margin: "0 auto",
    padding: "16px 18px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
    color: "#0f172a"
};
const card = {
    background: "#fff",
    border: "1px solid #dce5f2",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15,23,42,0.06)"
};
const fieldGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12
};
const label = {
    display: "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#475569"
};
const input = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d9e2f1",
    borderRadius: 11,
    padding: "10px 11px",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 650
};
const textarea = {
    ...input,
    minHeight: 120,
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.5
};
const btn = {
    padding: "10px 14px",
    border: "1px solid #d7e2f0",
    background: "#fff",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
    cursor: "pointer"
};
const btnPrimary = {
    ...btn,
    background: "#0f4ec9",
    color: "#fff",
    borderColor: "#0f4ec9"
};
const fileDrop = {
    border: "2px dashed #93b4ee",
    borderRadius: 16,
    padding: 18,
    background: "#f7faff",
    textAlign: "center",
    cursor: "pointer"
};
function getFotoAuthHeaders() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token",
        "rlc_auth_token",
        "rlc_access_token"
    ];
    for (const key of keys) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim()) {
            return { Authorization: `Bearer ${token.trim()}` };
        }
    }
    try {
        const raw = localStorage.getItem("auth") ||
            localStorage.getItem("rlc_auth") ||
            localStorage.getItem("user");
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.token ||
                parsed?.accessToken ||
                parsed?.authToken ||
                parsed?.jwt ||
                parsed?.data?.token ||
                parsed?.data?.accessToken ||
                parsed?.user?.token ||
                parsed?.user?.accessToken;
            if (typeof token === "string" && token.trim()) {
                return { Authorization: `Bearer ${token.trim()}` };
            }
        }
    }
    catch {
        // Keine gespeicherten Auth-Daten.
    }
    return {};
}
function fileUrl(file) {
    const value = String(file?.publicUrl || file?.url || "").trim();
    if (!value)
        return "";
    if (/^(?:https?:|data:|blob:)/i.test(value))
        return value;
    return apiUrl(value.startsWith("/") ? value : `/${value}`);
}
function isPdf(name, type) {
    return type === "application/pdf" || /\.pdf$/i.test(name);
}
function formatDate(value) {
    if (!value)
        return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("de-DE");
}
export default function BilderZumAufmass() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectId = String(project?.code || project?.id || "").trim();
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [editingId, setEditingId] = React.useState(null);
    const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [lvItemPos, setLvItemPos] = React.useState("");
    const [kostenstelle, setKostenstelle] = React.useState("");
    const [comment, setComment] = React.useState("");
    const [file, setFile] = React.useState(null);
    const [message, setMessage] = React.useState(null);
    const previewUrl = React.useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
    React.useEffect(() => {
        return () => {
            if (previewUrl)
                URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);
    const loadItems = React.useCallback(async () => {
        if (!projectId) {
            setItems([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/api/fotos/projects/${encodeURIComponent(projectId)}/fotos/notes`), {
                credentials: "include",
                headers: getFotoAuthHeaders(),
                cache: "no-store"
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 404) {
                setItems([]);
                return;
            }
            if (!res.ok) {
                throw new Error(data?.error || `HTTP ${res.status}`);
            }
            setItems(Array.isArray(data?.items) ? data.items : []);
        }
        catch (error) {
            setMessage({
                title: "Laden fehlgeschlagen",
                text: error?.message || "Einträge konnten nicht geladen werden.",
                tone: "error"
            });
        }
        finally {
            setLoading(false);
        }
    }, [projectId]);
    React.useEffect(() => {
        void loadItems();
    }, [loadItems]);
    const resetForm = React.useCallback(() => {
        setEditingId(null);
        setDate(new Date().toISOString().slice(0, 10));
        setLvItemPos("");
        setKostenstelle("");
        setComment("");
        setFile(null);
    }, []);
    const editItem = React.useCallback((item) => {
        setEditingId(String(item.docId || item.id));
        setDate(item.date || new Date().toISOString().slice(0, 10));
        setLvItemPos(item.lvItemPos || "");
        setKostenstelle(item.kostenstelle || "");
        setComment(item.comment || item.note || item.bemerkungen || "");
        setFile(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);
    const saveItem = React.useCallback(async () => {
        if (!projectId) {
            setMessage({
                title: "Kein Projekt",
                text: "Bitte zuerst ein Projekt auswählen.",
                tone: "error"
            });
            return;
        }
        if (!editingId && !file) {
            setMessage({
                title: "Datei fehlt",
                text: "Bitte genau ein Foto oder PDF auswählen.",
                tone: "error"
            });
            return;
        }
        if (!comment.trim()) {
            setMessage({
                title: "Beschreibung fehlt",
                text: "Bitte die Aufnahme oder das Dokument beschreiben.",
                tone: "error"
            });
            return;
        }
        setSaving(true);
        try {
            const form = new FormData();
            if (editingId)
                form.append("docId", editingId);
            form.append("date", date);
            form.append("lvItemPos", lvItemPos.trim());
            form.append("kostenstelle", kostenstelle.trim());
            form.append("comment", comment.trim());
            form.append("note", comment.trim());
            form.append("bemerkungen", comment.trim());
            if (file)
                form.append("main", file);
            const res = await fetch(apiUrl(`/api/fotos/projects/${encodeURIComponent(projectId)}/fotos/notes`), {
                method: "POST",
                credentials: "include",
                headers: getFotoAuthHeaders(),
                body: form
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok)
                throw new Error(data?.error || `HTTP ${res.status}`);
            const savedItem = data?.item;
            if (savedItem?.id) {
                setItems((current) => [
                    savedItem,
                    ...current.filter((item) => String(item.id) !== String(savedItem.id) &&
                        String(item.docId || "") !== String(savedItem.docId || ""))
                ]);
            }
            else {
                await loadItems();
            }
            resetForm();
            setMessage({
                title: "Gespeichert",
                text: "Foto/PDF und Beschreibung wurden als neuer Eintrag gespeichert.",
                tone: "success"
            });
        }
        catch (error) {
            setMessage({
                title: "Speichern fehlgeschlagen",
                text: error?.message || "Der Eintrag konnte nicht gespeichert werden.",
                tone: "error"
            });
        }
        finally {
            setSaving(false);
        }
    }, [
        projectId,
        editingId,
        file,
        comment,
        date,
        lvItemPos,
        kostenstelle,
        resetForm,
        loadItems
    ]);
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx(MengPageHeader, { title: "Bilder zum Aufma\u00DF", subtitle: "Je Foto oder PDF einen eigenen dokumentierten Aufma\u00DF-Eintrag speichern." }), _jsxs("section", { className: rlcClass(null, { ...card, marginTop: 16 }), children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1378", children: editingId ? "Eintrag bearbeiten" : "Neuen Eintrag anlegen" }), _jsxs("div", { className: rlcClass(null, fieldGrid), children: [_jsxs("label", { className: rlcClass(null, label), children: ["Datum", _jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), className: rlcClass(null, input) })] }), _jsxs("label", { className: rlcClass(null, label), children: ["LV-Position", _jsx("input", { value: lvItemPos, onChange: (e) => setLvItemPos(e.target.value), className: rlcClass(null, input), placeholder: "z. B. 001.010" })] }), _jsxs("label", { className: rlcClass(null, label), children: ["Bereich / Kostenstelle", _jsx("input", { value: kostenstelle, onChange: (e) => setKostenstelle(e.target.value), className: rlcClass(null, input), placeholder: "z. B. Bauabschnitt Nord" })] })] }), _jsxs("label", { className: rlcClass(null, { ...label, marginTop: 14 }), children: ["Beschreibung der Aufnahme / des Dokuments", _jsx("textarea", { value: comment, onChange: (e) => setComment(e.target.value), className: rlcClass(null, textarea), placeholder: "Ausf\u00FChrungsstand, Lage, Besonderheiten, M\u00E4ngel oder Bezug zum Aufma\u00DF beschreiben." })] }), _jsxs("label", { className: rlcClass(null, { ...fileDrop, display: "block", marginTop: 14 }), children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1379", children: "Genau ein JPG, PNG oder PDF ausw\u00E4hlen" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1380", children: "Danach Beschreibung erg\u00E4nzen und im Projekt speichern." }), _jsx("input", { type: "file", accept: "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf", onChange: (e) => {
                                    setFile(e.target.files?.[0] || null);
                                    e.currentTarget.value = "";
                                }, className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1381" })] }), file && previewUrl ?
                        _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1382", children: [isPdf(file.name, file.type) ?
                                    _jsx("object", { data: previewUrl, type: "application/pdf", className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1383", children: _jsx("a", { href: previewUrl, target: "_blank", rel: "noreferrer", children: "PDF \u00F6ffnen" }) }) :
                                    _jsx("img", { src: previewUrl, alt: file.name, className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1384" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1385", children: [_jsx("strong", { children: file.name }), _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => setFile(null), children: "Datei entfernen" })] })] }) :
                        null, _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1386", children: _jsx("button", { type: "button", className: rlcClass(null, {
                                ...btnPrimary,
                                opacity: saving ? 0.6 : 1,
                                cursor: saving ? "not-allowed" : "pointer"
                            }), disabled: saving, onClick: saveItem, children: saving ? "RLC speichert…" : "Eintrag speichern" }) })] }), _jsxs("section", { className: rlcClass(null, { ...card, marginTop: 16 }), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1387", children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1388", children: "Gespeicherte Eintr\u00E4ge" }), _jsx("button", { type: "button", className: rlcClass(null, btn), onClick: () => void loadItems(), children: "Aktualisieren" })] }), loading ?
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1389", children: "RLC l\u00E4dt\u2026" }) :
                        items.length === 0 ?
                            _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1390", children: "Noch keine Eintr\u00E4ge gespeichert." }) :
                            _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1391", children: items.map((item) => {
                                    const stored = item.main || item.files?.[0] || null;
                                    const url = fileUrl(stored);
                                    const name = stored?.name || stored?.file || "Datei";
                                    return (_jsxs("article", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1392", children: [_jsx("div", { children: url ?
                                                    isPdf(name) ?
                                                        _jsx("object", { data: url, type: "application/pdf", className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1393", children: _jsx("a", { href: url, target: "_blank", rel: "noreferrer", children: "PDF \u00F6ffnen" }) }) :
                                                        _jsx("a", { href: url, target: "_blank", rel: "noreferrer", children: _jsx("img", { src: url, alt: name, className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1394" }) }) :
                                                    _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1395", children: "Keine Vorschau" }) }), _jsxs("div", { children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1396", children: [_jsx("strong", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1397", children: item.lvItemPos || "Ohne LV-Position" }), _jsx("span", { children: formatDate(item.date) }), _jsx("span", { children: item.kostenstelle || "Kein Bereich" })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1398", children: item.comment || item.note || item.bemerkungen || "—" }), url ?
                                                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1399", children: _jsx("a", { href: url, target: "_blank", rel: "noreferrer", children: name }) }) :
                                                        null, _jsx("button", { type: "button", className: rlcClass(null, { ...btn, marginTop: 10 }), onClick: () => editItem(item), children: "Eintrag bearbeiten" })] })] }, item.id));
                                }) })] }), message ?
                _jsx("div", { role: "dialog", "aria-modal": "true", onClick: () => setMessage(null), className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1400", children: _jsxs("div", { onClick: (e) => e.stopPropagation(), className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1401", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1402", children: message.title }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1403", children: message.text }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-bilder-tsx-1404", children: _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => setMessage(null), children: "OK" }) })] }) }) :
                null] }));
}
