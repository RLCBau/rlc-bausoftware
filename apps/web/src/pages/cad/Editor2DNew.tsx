// apps/web/src/pages/cad/Editor2DNew.tsx
import React from "react";
import Editor2D from "./components/Editor2DCanvas";

export default function Editor2DNew() {
  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      <Editor2D />
    </div>
  );
}
