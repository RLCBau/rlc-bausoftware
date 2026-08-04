import { jsx as _jsx } from "react/jsx-runtime";
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// apps/web/src/main.tsx (o entry)
import 'leaflet/dist/leaflet.css';
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
