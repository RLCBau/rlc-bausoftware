import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
const API = (import.meta.env.VITE_API_URL?.replace(/\/$/, '') || "https://api.rlcbausoftware.com");
export default function Maengel() {
    const nav = useNavigate();
    const [projectId, setProjectId] = useState("");
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [useAI, setUseAI] = useState(true);
    const [lvOpts, setLvOpts] = useState([]);
    const [regieOpts, setRegieOpts] = useState([]);
    const fileRef = useRef(null);
    useEffect(() => {
        if (!projectId) {
            setLvOpts([]);
            setRegieOpts([]);
            return;
        }
        fetch(`${API}/api/lookup/lv?projectId=${encodeURIComponent(projectId)}`).then(r => r.json()).then(d => setLvOpts(d.items || [])).catch(() => { });
        fetch(`${API}/api/lookup/regieberichte?projectId=${encodeURIComponent(projectId)}`).then(r => r.json()).then(d => setRegieOpts(d.items || [])).catch(() => { });
    }, [projectId]);
    async function uploadFotos(e) {
        const f = e.target.files?.[0];
        if (!f || !projectId)
            return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("projectId", projectId);
            fd.append("file", f);
            const res = await fetch(`${API}/api/ki/maengel/upload?ai=${useAI ? "1" : "0"}`, { method: "POST", body: fd });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            const neu = {
                id: crypto.randomUUID(),
                foto: data.url,
                titel: data.detected?.title || "Mangel",
                beschreibung: data.detected?.desc || "",
                kategorie: data.detected?.cat || "Allgemein",
                prioritaet: data.detected?.prio || "mittel",
                status: "offen",
                ort: "",
                lvPos: data.detected?.lv || "",
                regieberichtId: "",
                faelligAm: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                verantwortlicher: "",
                notiz: "",
                erkannt: JSON.stringify(data.detected),
                erstelltAm: new Date().toISOString()
            };
            setItems(arr => [neu, ...arr]);
        }
        catch (e) {
            alert("Upload/Erkennung fehlgeschlagen: " + e.message);
        }
        finally {
            if (fileRef.current)
                fileRef.current.value = "";
            setBusy(false);
        }
    }
    function update(i, patch) {
        setItems(arr => arr.map((m, idx) => idx === i ? { ...m, ...patch } : m));
    }
    function remove(i) { setItems(arr => arr.filter((_, idx) => idx !== i)); }
    async function speichern() {
        if (!projectId)
            return alert("Projekt-ID fehlt.");
        setBusy(true);
        try {
            const res = await fetch(`${API}/api/ki/maengel/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, items })
            });
            if (!res.ok)
                throw new Error(await res.text());
            alert("Gespeichert.");
        }
        catch (e) {
            alert("Speichern fehlgeschlagen: " + e.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function laden() {
        if (!projectId)
            return alert("Projekt-ID fehlt.");
        setBusy(true);
        try {
            const r = await fetch(`${API}/api/ki/maengel/load`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId })
            });
            if (!r.ok)
                throw new Error(await r.text());
            const d = await r.json();
            setItems(d.items || []);
        }
        catch (e) {
            alert("Laden fehlgeschlagen: " + e.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function exportPdf(list) {
        if (!projectId || !list.length)
            return;
        setBusy(true);
        try {
            const r = await fetch(`${API}/api/ki/maengel/pdf`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, items: list })
            });
            if (!r.ok)
                throw new Error(await r.text());
            const { url } = await r.json();
            window.open(url, "_blank");
            return url;
        }
        catch (e) {
            alert("PDF-Export fehlgeschlagen: " + e.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function notifySingle(m) {
        if (!m.email)
            return alert("E-Mail fehlt.");
        const url = await exportPdf([m]);
        if (!url)
            return;
        const html = `
      <p>Guten Tag,</p>
      <p><b>${m.titel}</b> – Priorität: ${m.prioritaet} – Status: ${m.status}</p>
      <p>Ort: ${m.ort || "-"} – Fällig: ${m.faelligAm || "-"}</p>
      <p>LV-Pos.: ${m.lvPos || "-"} – Regiebericht: ${m.regieberichtId || "-"}</p>
      <p>Protokoll: <a href="${url}" target="_blank">${url}</a></p>`;
        await fetch(`${API}/api/ki/maengel/notify`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectId, to: m.email, subject: `Mangel: ${m.titel} (${projectId})`,
                html, attachPdf: { path: "uploads" + url.replace("/files", "/"), filename: "Maengelprotokoll.pdf" }
            })
        }).then(r => { if (!r.ok)
            throw new Error("Mail fehlgeschlagen"); alert("E-Mail gesendet."); })
            .catch(e => alert(String(e)));
    }
    async function searchLv(term) {
        if (!projectId)
            return;
        const r = await fetch(`${API}/api/lookup/lv?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setLvOpts(d.items || []);
    }
    async function searchRegie(term) {
        if (!projectId)
            return;
        const r = await fetch(`${API}/api/lookup/regieberichte?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setRegieOpts(d.items || []);
    }
    // NAV: apri pagine dedicate
    function openLV(pos) {
        if (!pos)
            return;
        nav(`/mengenermittlung/PositionLV?pos=${encodeURIComponent(pos)}&project=${encodeURIComponent(projectId)}`);
    }
    function openRegie(id) {
        if (!id)
            return;
        nav(`/mengenermittlung/regieberichte?rid=${encodeURIComponent(id)}&project=${encodeURIComponent(projectId)}`);
    }
    return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h1", { children: "M\u00E4ngelmanagement KI-gest\u00FCtzt" }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [_jsxs("label", { children: ["Projekt-ID:\u00A0", _jsx("input", { value: projectId, onChange: e => setProjectId(e.target.value), placeholder: "P-2025-001" })] }), _jsx("input", { ref: fileRef, type: "file", accept: "image/*", onChange: uploadFotos }), _jsxs("label", { children: ["KI aktiv:\u00A0", _jsx("input", { type: "checkbox", checked: useAI, onChange: e => setUseAI(e.target.checked) })] }), _jsx("button", { onClick: laden, disabled: !projectId || busy, children: "Laden" }), _jsx("button", { onClick: speichern, disabled: !projectId || busy, children: busy ? "..." : "Speichern" }), _jsx("button", { onClick: () => exportPdf(items), disabled: !items.length || busy, children: "M\u00E4ngelprotokoll (PDF)" })] }), _jsx("datalist", { id: "lvlist", children: lvOpts.map(o => _jsx("option", { value: o.id, children: o.label }, o.id)) }), _jsx("datalist", { id: "regielist", children: regieOpts.map(o => _jsx("option", { value: o.id, children: o.label }, o.id)) }), _jsx("div", { style: { marginTop: 14, overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: ["Foto", "Titel", "Beschreibung", "Kategorie", "Priorität", "Status", "Ort/Bereich", "LV-Pos.", "Regiebericht", "Fällig am", "Verantw.", "E-Mail", "Notiz", "Aktion"].map(h => (_jsx("th", { style: { borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }, children: h }, h))) }) }), _jsxs("tbody", { children: [items.map((m, i) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: 6, minWidth: 110 }, children: m.foto ? _jsx("a", { href: m.foto, target: "_blank", children: "Foto" }) : "-" }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.titel, onChange: e => update(i, { titel: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.beschreibung, onChange: e => update(i, { beschreibung: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.kategorie, onChange: e => update(i, { kategorie: e.target.value }), placeholder: "Erdarbeiten/Leitungen/..." }) }), _jsx("td", { style: { padding: 6 }, children: _jsxs("select", { value: m.prioritaet, onChange: e => update(i, { prioritaet: e.target.value }), children: [_jsx("option", { children: "niedrig" }), _jsx("option", { children: "mittel" }), _jsx("option", { children: "hoch" }), _jsx("option", { children: "kritisch" })] }) }), _jsx("td", { style: { padding: 6 }, children: _jsxs("select", { value: m.status, onChange: e => update(i, { status: e.target.value }), children: [_jsx("option", { children: "offen" }), _jsx("option", { children: "in Bearbeitung" }), _jsx("option", { children: "behoben" }), _jsx("option", { children: "abgenommen" })] }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.ort || "", onChange: e => update(i, { ort: e.target.value }) }) }), _jsx("td", { style: { padding: 6, minWidth: 260 }, children: _jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx("input", { list: "lvlist", value: m.lvPos || "", onChange: e => { update(i, { lvPos: e.target.value }); searchLv(e.target.value); }, placeholder: "ERD-1001 \u2026" }), _jsx("button", { onClick: () => openLV(m.lvPos), disabled: !m.lvPos, children: "\u00D6ffnen" })] }) }), _jsx("td", { style: { padding: 6, minWidth: 260 }, children: _jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx("input", { list: "regielist", value: m.regieberichtId || "", onChange: e => { update(i, { regieberichtId: e.target.value }); searchRegie(e.target.value); }, placeholder: "RB-2025-\u2026" }), _jsx("button", { onClick: () => openRegie(m.regieberichtId), disabled: !m.regieberichtId, children: "\u00D6ffnen" })] }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { type: "date", value: m.faelligAm || "", onChange: e => update(i, { faelligAm: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.verantwortlicher || "", onChange: e => update(i, { verantwortlicher: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.email || "", onChange: e => update(i, { email: e.target.value }), placeholder: "name@firma.de" }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: m.notiz || "", onChange: e => update(i, { notiz: e.target.value }) }) }), _jsxs("td", { style: { padding: 6, width: 180 }, children: [_jsx("button", { onClick: () => notifySingle(m), children: "Benachrichtigen" }), _jsx("button", { onClick: () => remove(i), style: { marginLeft: 6 }, children: "Entf." })] })] }, m.id))), !items.length && _jsx("tr", { children: _jsx("td", { colSpan: 14, style: { padding: 10, color: "#777" }, children: "Keine M\u00E4ngel erfasst." }) })] })] }) })] }));
}
