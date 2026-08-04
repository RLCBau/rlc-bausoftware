import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Foto.tsx
import { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";
const shell = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "12px 16px",
    fontFamily: "Inter,system-ui,Arial"
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const input = {
    margin: "8px 0"
};
const btn = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer"
};
const muted = {
    color: "#6b7280",
    fontSize: 13
};
export default function Foto() {
    const { currentProject } = useProject();
    const projectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [file, setFile] = useState(null);
    const [result, setResult] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const previewUrl = useMemo(() => {
        if (!file)
            return "";
        return URL.createObjectURL(file);
    }, [file]);
    const effectiveProject = projectCode || projectId || "";
    const handleFile = (e) => {
        const next = e.target.files?.[0] || null;
        setFile(next);
        setResult([]);
        setError(null);
    };
    async function runRecognition() {
        if (!file) {
            setError("Bitte zuerst ein Foto auswÃ¤hlen.");
            return;
        }
        if (!effectiveProject) {
            setError("Kein Projekt ausgewÃ¤hlt.");
            return;
        }
        setLoading(true);
        setError(null);
        setResult([]);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("projectId", projectId || "");
            fd.append("projectCode", projectCode || "");
            const uploadRes = await fetch("/api/ki/vision-files", {
                method: "POST",
                body: fd
            });
            if (!uploadRes.ok) {
                throw new Error((await uploadRes.text()) || "Upload fehlgeschlagen");
            }
            const uploadData = await uploadRes.json();
            const suggestRes = await fetch("/api/ki/photos/suggest", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    projectId: projectId || "",
                    projectCode: projectCode || "",
                    files: Array.isArray(uploadData?.files) ? uploadData.files : undefined,
                    fileId: uploadData?.fileId,
                    fileName: file.name
                })
            });
            if (!suggestRes.ok) {
                throw new Error((await suggestRes.text()) || "Foto-KI fehlgeschlagen");
            }
            const data = await suggestRes.json();
            const lines = Array.isArray(data?.items) ?
                data.items :
                Array.isArray(data?.result) ?
                    data.result :
                    Array.isArray(data?.suggestions) ?
                        data.suggestions :
                        typeof data?.text === "string" ?
                            data.text.
                                split("\n").
                                map((x) => x.trim()).
                                filter(Boolean) :
                            [];
            setResult(lines);
        }
        catch (e) {
            setError(e?.message || "Fehler bei Fotoerkennung");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Fotoerkennung (KI)" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, muted), children: ["Projekt: ", effectiveProject || "â€”"] }), _jsx("input", { type: "file", accept: "image/*", className: rlcClass(null, input), onChange: handleFile }), _jsx("div", { className: "rlc-migrated-pages-ki-foto-tsx-1080", children: _jsx("button", { className: rlcClass(null, btn), onClick: () => void runRecognition(), disabled: !file || loading, children: loading ? "Erkenne..." : "Foto analysieren" }) }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-foto-tsx-1081", children: error }), file &&
                        _jsxs("div", { className: "rlc-migrated-pages-ki-foto-tsx-1082", children: [_jsxs("div", { className: rlcClass(null, { ...muted, marginBottom: 8 }), children: ["Datei: ", _jsx("strong", { children: file.name })] }), _jsx("img", { src: previewUrl, alt: "Vorschau", className: "rlc-migrated-pages-ki-foto-tsx-1083" })] })] }), _jsxs("div", { className: rlcClass(null, { ...card, marginTop: 16 }), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-foto-tsx-1084", children: "Ergebnis" }), !result.length && !loading &&
                        _jsx("div", { className: rlcClass(null, muted), children: "Noch keine Analyse durchgef\u00C3\u00BChrt." }), !!result.length &&
                        _jsx("ul", { className: "rlc-migrated-pages-ki-foto-tsx-1085", children: result.map((r, i) => _jsx("li", { className: "rlc-migrated-pages-ki-foto-tsx-1086", children: r }, `${r}-${i}`)) })] })] }));
}
