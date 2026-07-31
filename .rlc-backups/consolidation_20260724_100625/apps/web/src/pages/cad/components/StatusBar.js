import { jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useCadStore } from "./store";
function StatusBar() {
    const { cursor, ortho, polar, activeLayerName, zoom } = useCadStore();
    return (_jsxs("div", { className: "cad-status", children: [_jsxs("div", { children: ["XY: ", cursor.x.toFixed(0), ",", cursor.y.toFixed(0)] }), _jsxs("div", { children: ["Layer: ", activeLayerName] }), _jsxs("div", { children: ["Zoom: ", Math.round(zoom * 100), "%"] }), _jsxs("div", { children: ["Ortho: ", ortho ? "ON" : "OFF", " | Polar: ", polar ? "ON" : "OFF"] })] }));
}
export default StatusBar;
