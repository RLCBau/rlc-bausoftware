import React from "react";
import TopBar from "./components/TopBar";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";
import StatusBar from "./components/StatusBar";
import CanvasStage from "./components/CanvasStage";
import "./cad.css";

export default function CadPage() {
  return (
    <div className="cad-root">
      <TopBar />
      <div className="cad-body">
        <LeftPanel />
        <CanvasStage />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}
