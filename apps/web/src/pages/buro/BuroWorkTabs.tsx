import React from "react";
import { NavLink } from "react-router-dom";

type Active = "kommunikation" | "aufgaben" | "notizen";

export default function BuroWorkTabs({
  active
}: {
  active: Active;
}) {
  const items = [
    {
      key: "kommunikation",
      label: "Kommunikation",
      path: "/buro/kommunikation"
    },
    {
      key: "aufgaben",
      label: "Aufgaben",
      path: "/buro/tasks"
    },
    {
      key: "notizen",
      label: "Notizen",
      path: "/buro/notizen"
    }
  ] as const;

  return (
    <div
      className="card"
      style={{
        display: "flex",
        gap: 8,
        padding: 8,
        marginTop: 12,
        marginBottom: 12,
        position: "sticky",
        top: 8,
        zIndex: 20,
        background: "var(--rlc-surface, var(--surface, inherit))"
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          aria-current={active === item.key ? "page" : undefined}
          className={active === item.key ? "btn btn-primary" : "btn"}
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
