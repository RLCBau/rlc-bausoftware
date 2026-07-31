import React from "react";
import { Outlet } from "react-router-dom";

type Props = {
  left?: React.ReactNode;                  // sidebar sinistra
  right?: React.ReactNode;                 // se vuoi passare un right fisso
  centerVisible?: boolean;                 // false = layout 2 colonne (left | right)
  children?: React.ReactNode;              // contenuto dinamico (Outlet o pagina)
  style?: React.CSSProperties;
};

/**
 * Layout:
 * - centerVisible !== false  -> 260px | 1fr | 320px   (left | center | right)
 * - centerVisible === false  -> 260px | 1fr          (left | right=children/Outlet)
 */
export default function Section({ left, right, centerVisible = true, children, style }: Props) {
  const twoCols = centerVisible === false;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: twoCols ? "260px 1fr" : (right ? "260px 1fr 320px" : "260px 1fr"),
        gap: 16,
        padding: 16,
        ...style,
      }}
    >
      {/* LEFT */}
      <aside>{left}</aside>

      {twoCols ? (
        // Modalità 2 colonne: il contenuto va a DESTRA
        <section style={{ minWidth: 0 }}>
          {children ?? <Outlet />}
        </section>
      ) : (
        // Modalità 3 colonne: centro + opzionale right
        <>
          <main style={{ minWidth: 0 }}>
            {children ?? <Outlet />}
          </main>
          {right ? <aside>{right}</aside> : null}
        </>
      )}
    </div>
  );
}
