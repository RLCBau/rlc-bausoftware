import { jsx as _jsx } from "react/jsx-runtime";
// apps/web/src/pages/cad/Editor2DNew.tsx
import React from "react";
import Editor2D from "./components/Editor2DCanvas";
export default function Editor2DNew() {
    return (_jsx("div", { style: { height: "100vh", width: "100%", display: "flex", flexDirection: "column" }, children: _jsx(Editor2D, {}) }));
}
