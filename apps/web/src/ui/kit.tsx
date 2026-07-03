import React, { PropsWithChildren, useState } from "react";

export function Card({
  title,
  children,
  className = "",
}: PropsWithChildren<{ title?: string; className?: string }>) {
  return (
    <div className={`card ${className}`.trim()}>
      {title ? <div className="card-title">{title}</div> : null}
      {children}
    </div>
  );
}

export function Row({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <div className={`toolbar ${className}`.trim()}>{children}</div>;
}

export function Collapsible({
  title,
  defaultOpen = false,
  children,
  className = "",
}: PropsWithChildren<{
  title: string;
  defaultOpen?: boolean;
  className?: string;
}>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`card ${className}`.trim()} style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="card-h"
        style={{
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: 0,
        }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {title} {open ? "▾" : "▸"}
      </button>

      {open ? <div className="card-b">{children}</div> : null}
    </div>
  );
}





