import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
export default function Card({ children }) {
    return _jsx("div", { className: "rounded-lg border border-gray-200 bg-white p-4 shadow-sm", children: children });
}
