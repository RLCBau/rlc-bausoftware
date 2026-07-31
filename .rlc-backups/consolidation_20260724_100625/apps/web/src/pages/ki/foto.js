import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 800, margin: "0 auto", padding: "12px 16px", fontFamily: "Inter,system-ui,Arial" };
const input = { margin: "8px 0" };
export default function Foto() {
    const [result, setResult] = useState([]);
    const handleFile = (e) => {
        if (!e.target.files?.length)
            return;
        setResult(["Gefundene Objekte: Rohr DN 100", "Bogen 45°", "Graben 1,2 m tief"]);
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Fotoerkennung" }), _jsx("input", { type: "file", style: input, onChange: handleFile }), _jsx("ul", { children: result.map((r, i) => _jsx("li", { children: r }, i)) })] }));
}
