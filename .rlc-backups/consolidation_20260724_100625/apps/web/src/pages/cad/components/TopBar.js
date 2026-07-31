import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useRef } from "react";
import { useCadStore } from "./store";
import { Upload, FileDown, Pointer, Hand, Minus, Plus, Trash2, RotateCcw, RotateCw, PenLine, RectangleHorizontal, Route, Ruler, Frame, Layers, Save } from "lucide-react";
import { saveAs } from "file-saver";
function TopBar() {
    const fileRef = useRef(null);
    const { setTool, zoomIn, zoomOut, exportJSON, exportSVG, undo, redo, deleteSelection, importAny, bringToFront, sendToBack } = useCadStore();
    return (_jsxs("div", { className: "cad-topbar", children: [_jsxs("div", { className: "cad-topbar-left", children: [_jsxs("button", { className: "btn", onClick: () => fileRef.current?.click(), children: [_jsx(Upload, { size: 16 }), " Import"] }), _jsx("input", { ref: fileRef, type: "file", style: { display: "none" }, accept: ".svg,.dxf,.json,.SVG,.DXF,.JSON", onChange: async (e) => {
                            const f = e.target.files?.[0];
                            if (!f)
                                return;
                            const buf = await f.arrayBuffer();
                            const text = new TextDecoder().decode(new Uint8Array(buf));
                            importAny({ name: f.name, text });
                            e.currentTarget.value = "";
                        } }), _jsxs("button", { className: "btn", onClick: () => saveAs(new Blob([exportJSON()], { type: "application/json" }), "scene.json"), children: [_jsx(FileDown, { size: 16 }), " Export JSON"] }), _jsxs("button", { className: "btn", onClick: () => saveAs(new Blob([exportSVG()], { type: "image/svg+xml" }), "scene.svg"), children: [_jsx(Save, { size: 16 }), " Export SVG"] })] }), _jsxs("div", { className: "cad-topbar-center", children: [_jsxs("button", { className: "btn", onClick: () => setTool("select"), children: [_jsx(Pointer, { size: 16 }), " Seleziona"] }), _jsxs("button", { className: "btn", onClick: () => setTool("pan"), children: [_jsx(Hand, { size: 16 }), " Pan"] }), _jsx("div", { className: "sep" }), _jsxs("button", { className: "btn", onClick: () => setTool("line"), children: [_jsx(PenLine, { size: 16 }), " Linea"] }), _jsxs("button", { className: "btn", onClick: () => setTool("rect"), children: [_jsx(RectangleHorizontal, { size: 16 }), " Rettangolo"] }), _jsxs("button", { className: "btn", onClick: () => setTool("polyline"), children: [_jsx(Route, { size: 16 }), " Polilinea"] }), _jsxs("button", { className: "btn", onClick: () => setTool("dim"), children: [_jsx(Ruler, { size: 16 }), " Quota"] }), _jsxs("button", { className: "btn", onClick: () => setTool("measure"), children: [_jsx(Frame, { size: 16 }), " Misura"] }), _jsx("div", { className: "sep" }), _jsxs("button", { className: "btn", onClick: sendToBack, children: [_jsx(Layers, { size: 16 }), " Back"] }), _jsxs("button", { className: "btn", onClick: bringToFront, children: [_jsx(Layers, { size: 16 }), " Front"] })] }), _jsxs("div", { className: "cad-topbar-right", children: [_jsx("button", { className: "btn", onClick: undo, children: _jsx(RotateCcw, { size: 16 }) }), _jsx("button", { className: "btn", onClick: redo, children: _jsx(RotateCw, { size: 16 }) }), _jsx("button", { className: "btn", onClick: zoomOut, children: _jsx(Minus, { size: 16 }) }), _jsx("button", { className: "btn", onClick: zoomIn, children: _jsx(Plus, { size: 16 }) }), _jsx("button", { className: "btn danger", onClick: deleteSelection, children: _jsx(Trash2, { size: 16 }) })] })] }));
}
export default TopBar;
