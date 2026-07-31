import React from "react";
import { useCadStore } from "./store";

function StatusBar() {
  const { cursor, ortho, polar, activeLayerName, zoom } = useCadStore();
  return (
    <div className="cad-status">
      <div>XY: {cursor.x.toFixed(0)},{cursor.y.toFixed(0)}</div>
      <div>Layer: {activeLayerName}</div>
      <div>Zoom: {Math.round(zoom*100)}%</div>
      <div>Ortho: {ortho?"ON":"OFF"} | Polar: {polar?"ON":"OFF"}</div>
    </div>
  );
}

export default StatusBar;
