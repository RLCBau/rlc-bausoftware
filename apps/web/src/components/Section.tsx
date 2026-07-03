import React from "react";
import { Outlet } from "react-router-dom";

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
  centerVisible?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export default function Section({
  left,
  right,
  centerVisible = true,
  children,
  style,
}: Props) {
  const twoCols = centerVisible === false;
  const gridTemplateColumns = twoCols
    ? "260px minmax(0, 1fr)"
    : right
    ? "260px minmax(0, 1fr) 320px"
    : "260px minmax(0, 1fr)";

  const content = children ?? <Outlet />;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns,
        gap: 16,
        padding: 16,
        alignItems: "start",
        ...style,
      }}
    >
      <aside style={{ minWidth: 0 }}>{left}</aside>

      {twoCols ? (
        <section style={{ minWidth: 0 }}>{content}</section>
      ) : (
        <>
          <main style={{ minWidth: 0 }}>{content}</main>
          {right ? <aside style={{ minWidth: 0 }}>{right}</aside> : null}
        </>
      )}
    </div>
  );
}





