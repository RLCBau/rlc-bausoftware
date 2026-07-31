import React, { PropsWithChildren, useState } from "react";

export function Card({
  title,
  children,
  className = ""
}: PropsWithChildren<{title?: string;className?: string;}>) {
  return (
    <div className={`card ${className}`.trim()}>
      {title ? <div className="card-title">{title}</div> : null}
      {children}
    </div>);

}

export function Row({
  children,
  className = ""
}: PropsWithChildren<{className?: string;}>) {
  return <div className={`toolbar ${className}`.trim()}>{children}</div>;
}

export function Collapsible({
  title,
  defaultOpen = false,
  children,
  className = ""




}: PropsWithChildren<{title: string;defaultOpen?: boolean;className?: string;}>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`${`card ${className}`.trim()} rlc-migrated-ui-kit-tsx-1579`}>
      <button
        type="button"
        className="card-h rlc-migrated-ui-kit-tsx-1580"







        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}>
        
        {title} {open ? "▾" : "▸"}
      </button>

      {open ? <div className="card-b">{children}</div> : null}
    </div>);

}
