import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import TopBar from "./components/TopBar";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";
import StatusBar from "./components/StatusBar";
import CanvasStage from "./components/CanvasStage";
import "./cad.css";
export default function CadPage() {
    return (_jsxs("div", { className: "cad-root", children: [_jsx(TopBar, {}), _jsxs("div", { className: "cad-body", children: [_jsx(LeftPanel, {}), _jsx(CanvasStage, {}), _jsx(RightPanel, {})] }), _jsx(StatusBar, {})] }));
}
