// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// apps/web/src/main.tsx (o entry)
import 'leaflet/dist/leaflet.css';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

