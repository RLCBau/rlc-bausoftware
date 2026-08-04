import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { apiUrl } from "../../lib/apiBase";
// apps/web/src/pages/ki/Maengel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
const shell = {
    display: "grid",
    gap: 16,
    padding: 24
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const input = {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14
};
const btn = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer"
};
const table = {
    width: "100%",
    borderCollapse: "collapse"
};
const th = {
    borderBottom: "1px solid #ccc",
    textAlign: "left",
    padding: 8,
    background: "#f8fafc",
    whiteSpace: "nowrap"
};
const td = {
    padding: 6,
    borderBottom: "1px solid #eee",
    verticalAlign: "top"
};
export default function Maengel() {
    const nav = useNavigate();
    const projectCtx = useProject();
    const currentProject = projectCtx?.currentProject ?? null;
    const storeProjectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [projectInput, setProjectInput] = useState("");
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [useAI, setUseAI] = useState(true);
    const [error, setError] = useState(null);
    const [lvOpts, setLvOpts] = useState([]);
    const [regieOpts, setRegieOpts] = useState([]);
    const fileRef = useRef(null);
    const effectiveProjectId = useMemo(() => projectInput.trim() || storeProjectId || projectCode || "", [projectInput, storeProjectId, projectCode]);
    useEffect(() => {
        if (!effectiveProjectId) {
            setLvOpts([]);
            setRegieOpts([]);
            return;
        }
        void fetch(apiUrl(`/api/lookup/lv?projectId=${encodeURIComponent(effectiveProjectId)}`)).
            then((r) => r.json()).
            then((d) => setLvOpts(Array.isArray(d.items) ? d.items : [])).
            catch(() => { });
        void fetch(apiUrl(`/api/lookup/regieberichte?projectId=${encodeURIComponent(effectiveProjectId)}`)).
            then((r) => r.json()).
            then((d) => setRegieOpts(Array.isArray(d.items) ? d.items : [])).
            catch(() => { });
    }, [effectiveProjectId]);
    async function uploadFotos(e) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            if (fileRef.current)
                fileRef.current.value = "";
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const fd = new FormData();
            fd.append("projectId", effectiveProjectId);
            if (projectCode)
                fd.append("projectCode", projectCode);
            fd.append("file", f);
            const res = await fetch(apiUrl(`/api/ki/maengel/upload?ai=${useAI ? "1" : "0"}`), {
                method: "POST",
                body: fd
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            const detected = data.detected;
            const neu = {
                id: crypto.randomUUID(),
                foto: data.url,
                titel: detected?.title || "Mangel",
                beschreibung: detected?.desc || "",
                kategorie: detected?.cat || "Allgemein",
                prioritaet: isPrioritaet(detected?.prio) ? detected.prio : "mittel",
                status: "offen",
                ort: "",
                lvPos: detected?.lv || "",
                regieberichtId: "",
                faelligAm: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                verantwortlicher: "",
                notiz: "",
                erkannt: JSON.stringify(detected || {}),
                erstelltAm: new Date().toISOString(),
                email: ""
            };
            setItems((arr) => [neu, ...arr]);
        }
        catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : "Upload/Erkennung fehlgeschlagen";
            setError(msg);
            window.alert(`Upload/Erkennung fehlgeschlagen: ${msg}`);
        }
        finally {
            if (fileRef.current)
                fileRef.current.value = "";
            setBusy(false);
        }
    }
    function update(i, patch) {
        setItems((arr) => arr.map((m, idx) => idx === i ? { ...m, ...patch } : m));
    }
    function remove(i) {
        setItems((arr) => arr.filter((_, idx) => idx !== i));
    }
    async function speichern() {
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(apiUrl("/api/ki/maengel/save"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: effectiveProjectId, items })
            });
            if (!res.ok)
                throw new Error(await res.text());
            window.alert("Gespeichert.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
            setError(msg);
            window.alert(`Speichern fehlgeschlagen: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function laden() {
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const r = await fetch(apiUrl("/api/ki/maengel/load"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: effectiveProjectId })
            });
            if (!r.ok)
                throw new Error(await r.text());
            const d = (await r.json());
            setItems(Array.isArray(d.items) ? d.items.map(normalizeMangel) : []);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Laden fehlgeschlagen";
            setError(msg);
            window.alert(`Laden fehlgeschlagen: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function exportPdf(list) {
        if (!effectiveProjectId || !list.length)
            return;
        setBusy(true);
        setError(null);
        try {
            const r = await fetch(apiUrl("/api/ki/maengel/pdf"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: effectiveProjectId, items: list })
            });
            if (!r.ok)
                throw new Error(await r.text());
            const data = (await r.json());
            if (data.url)
                window.open(data.url, "_blank");
            return data.url;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "PDF-Export fehlgeschlagen";
            setError(msg);
            window.alert(`PDF-Export fehlgeschlagen: ${msg}`);
            return undefined;
        }
        finally {
            setBusy(false);
        }
    }
    async function notifySingle(m) {
        if (!m.email?.trim()) {
            window.alert("E-Mail fehlt.");
            return;
        }
        const url = await exportPdf([m]);
        if (!url)
            return;
        const html = `
      <p>Guten Tag,</p>
      <p><b>${escapeHtml(m.titel)}</b> â€“ PrioritÃ¤t: ${escapeHtml(m.prioritaet)} â€“ Status: ${escapeHtml(m.status)}</p>
      <p>Ort: ${escapeHtml(m.ort || "-")} â€“ FÃ¤llig: ${escapeHtml(m.faelligAm || "-")}</p>
      <p>LV-Pos.: ${escapeHtml(m.lvPos || "-")} â€“ Regiebericht: ${escapeHtml(m.regieberichtId || "-")}</p>
      <p>Protokoll: <a href="${url}" target="_blank" rel="noreferrer">${url}</a></p>`;
        try {
            const res = await fetch(apiUrl("/api/ki/maengel/notify"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    to: m.email.trim(),
                    subject: `Mangel: ${m.titel} (${effectiveProjectId})`,
                    html,
                    pdfUrl: url,
                    fileName: "Maengelprotokoll.pdf"
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            window.alert("E-Mail gesendet.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Fehler";
            window.alert(`Mail fehlgeschlagen: ${msg}`);
        }
    }
    async function searchLv(term) {
        if (!effectiveProjectId)
            return;
        try {
            const r = await fetch(apiUrl(`/api/lookup/lv?projectId=${encodeURIComponent(effectiveProjectId)}&q=${encodeURIComponent(term)}`));
            const d = (await r.json());
            setLvOpts(Array.isArray(d.items) ? d.items : []);
        }
        catch { }
    }
    async function searchRegie(term) {
        if (!effectiveProjectId)
            return;
        try {
            const r = await fetch(apiUrl(`/api/lookup/regieberichte?projectId=${encodeURIComponent(effectiveProjectId)}&q=${encodeURIComponent(term)}`));
            const d = (await r.json());
            setRegieOpts(Array.isArray(d.items) ? d.items : []);
        }
        catch { }
    }
    function openLV(pos) {
        if (!pos)
            return;
        nav(`/mengenermittlung/PositionLV?pos=${encodeURIComponent(pos)}&project=${encodeURIComponent(effectiveProjectId)}`);
    }
    function openRegie(id) {
        if (!id)
            return;
        nav(`/mengenermittlung/regieberichte?rid=${encodeURIComponent(id)}&project=${encodeURIComponent(effectiveProjectId)}`);
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h1", { children: "M\u00C3\u00A4ngelmanagement KI-gest\u00C3\u00BCtzt" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-maengel-tsx-1006", children: [_jsxs("label", { children: ["Projekt-ID:\u00A0", _jsx("input", { className: rlcClass(null, input), value: projectInput, onChange: (e) => setProjectInput(e.target.value), placeholder: "P-2025-001" })] }), _jsx("input", { ref: fileRef, type: "file", accept: "image/*", onChange: uploadFotos }), _jsxs("label", { children: ["KI aktiv:\u00A0", _jsx("input", { type: "checkbox", checked: useAI, onChange: (e) => setUseAI(e.target.checked) })] }), _jsx("button", { className: rlcClass(null, btn), onClick: laden, disabled: !effectiveProjectId || busy, children: "Laden" }), _jsx("button", { className: rlcClass(null, btn), onClick: speichern, disabled: !effectiveProjectId || busy, children: busy ? "..." : "Speichern" }), _jsx("button", { className: rlcClass(null, btn), onClick: () => void exportPdf(items), disabled: !items.length || busy, children: "M\u00C3\u00A4ngelprotokoll (PDF)" })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-maengel-tsx-1007", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewÃ¤hlt"] }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-maengel-tsx-1008", children: error })] }), _jsx("datalist", { id: "lvlist", children: lvOpts.map((o) => _jsx("option", { value: o.id, children: o.label }, o.id)) }), _jsx("datalist", { id: "regielist", children: regieOpts.map((o) => _jsx("option", { value: o.id, children: o.label }, o.id)) }), _jsx("div", { className: rlcClass(null, { ...card, overflowX: "auto" }), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsx("tr", { children: [
                                    "Foto",
                                    "Titel",
                                    "Beschreibung",
                                    "Kategorie",
                                    "PrioritÃ¤t",
                                    "Status",
                                    "Ort/Bereich",
                                    "LV-Pos.",
                                    "Regiebericht",
                                    "FÃ¤llig am",
                                    "Verantw.",
                                    "E-Mail",
                                    "Notiz",
                                    "Aktion"
                                ].
                                    map((h) => _jsx("th", { className: rlcClass(null, th), children: h }, h)) }) }), _jsxs("tbody", { children: [items.map((m, i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, minWidth: 110 }), children: m.foto ?
                                                _jsx("a", { href: m.foto, target: "_blank", rel: "noreferrer", children: "Foto" }) :
                                                "-" }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.titel, onChange: (e) => update(i, { titel: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.beschreibung, onChange: (e) => update(i, { beschreibung: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.kategorie, onChange: (e) => update(i, { kategorie: e.target.value }), placeholder: "Erdarbeiten/Leitungen/..." }) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("select", { className: rlcClass(null, input), value: m.prioritaet, onChange: (e) => update(i, {
                                                    prioritaet: e.target.value
                                                }), children: [_jsx("option", { value: "niedrig", children: "niedrig" }), _jsx("option", { value: "mittel", children: "mittel" }), _jsx("option", { value: "hoch", children: "hoch" }), _jsx("option", { value: "kritisch", children: "kritisch" })] }) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("select", { className: rlcClass(null, input), value: m.status, onChange: (e) => update(i, {
                                                    status: e.target.value
                                                }), children: [_jsx("option", { value: "offen", children: "offen" }), _jsx("option", { value: "in Bearbeitung", children: "in Bearbeitung" }), _jsx("option", { value: "behoben", children: "behoben" }), _jsx("option", { value: "abgenommen", children: "abgenommen" })] }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.ort || "", onChange: (e) => update(i, { ort: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, minWidth: 260 }), children: _jsxs("div", { className: "rlc-migrated-pages-ki-maengel-tsx-1009", children: [_jsx("input", { className: rlcClass(null, { ...input, margin: 0 }), list: "lvlist", value: m.lvPos || "", onChange: (e) => {
                                                            update(i, { lvPos: e.target.value });
                                                            void searchLv(e.target.value);
                                                        }, placeholder: "ERD-1001 \u00E2\u20AC\u00A6" }), _jsx("button", { className: rlcClass(null, btn), onClick: () => openLV(m.lvPos), disabled: !m.lvPos, children: "\u00C3\u2013ffnen" })] }) }), _jsx("td", { className: rlcClass(null, { ...td, minWidth: 260 }), children: _jsxs("div", { className: "rlc-migrated-pages-ki-maengel-tsx-1010", children: [_jsx("input", { className: rlcClass(null, { ...input, margin: 0 }), list: "regielist", value: m.regieberichtId || "", onChange: (e) => {
                                                            update(i, { regieberichtId: e.target.value });
                                                            void searchRegie(e.target.value);
                                                        }, placeholder: "RB-2025-\u00E2\u20AC\u00A6" }), _jsx("button", { className: rlcClass(null, btn), onClick: () => openRegie(m.regieberichtId), disabled: !m.regieberichtId, children: "\u00C3\u2013ffnen" })] }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), type: "date", value: m.faelligAm || "", onChange: (e) => update(i, { faelligAm: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.verantwortlicher || "", onChange: (e) => update(i, { verantwortlicher: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.email || "", onChange: (e) => update(i, { email: e.target.value }), placeholder: "name@firma.de" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: m.notiz || "", onChange: (e) => update(i, { notiz: e.target.value }) }) }), _jsxs("td", { className: rlcClass(null, { ...td, width: 180 }), children: [_jsx("button", { className: rlcClass(null, btn), onClick: () => void notifySingle(m), children: "Benachrichtigen" }), _jsx("button", { className: rlcClass(null, { ...btn, marginLeft: 6 }), onClick: () => remove(i), children: "Entf." })] })] }, m.id)), !items.length &&
                                    _jsx("tr", { children: _jsx("td", { colSpan: 14, className: "rlc-migrated-pages-ki-maengel-tsx-1011", children: "Keine M\u00C3\u00A4ngel erfasst." }) })] })] }) })] }));
}
function isPrioritaet(v) {
    return v === "niedrig" || v === "mittel" || v === "hoch" || v === "kritisch";
}
function normalizeMangel(m) {
    const x = (m ?? {});
    return {
        id: String(x.id || crypto.randomUUID()),
        foto: x.foto ? String(x.foto) : undefined,
        titel: String(x.titel || "Mangel"),
        beschreibung: String(x.beschreibung || ""),
        kategorie: String(x.kategorie || "Allgemein"),
        prioritaet: isPrioritaet(x.prioritaet) ? x.prioritaet : "mittel",
        status: x.status === "offen" ||
            x.status === "in Bearbeitung" ||
            x.status === "behoben" ||
            x.status === "abgenommen" ?
            x.status :
            "offen",
        ort: x.ort ? String(x.ort) : "",
        lvPos: x.lvPos ? String(x.lvPos) : "",
        regieberichtId: x.regieberichtId ? String(x.regieberichtId) : "",
        faelligAm: x.faelligAm ? String(x.faelligAm) : "",
        verantwortlicher: x.verantwortlicher ? String(x.verantwortlicher) : "",
        notiz: x.notiz ? String(x.notiz) : "",
        erkannt: x.erkannt ? String(x.erkannt) : "",
        erstelltAm: String(x.erstelltAm || new Date().toISOString()),
        email: x.email ? String(x.email) : ""
    };
}
function escapeHtml(s) {
    return String(s || "").
        replace(/&/g, "&amp;").
        replace(/</g, "&lt;").
        replace(/>/g, "&gt;").
        replace(/"/g, "&quot;").
        replace(/'/g, "&#39;");
}
