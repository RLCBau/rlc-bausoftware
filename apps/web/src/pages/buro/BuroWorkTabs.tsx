import React from "react";

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
        background: "#ffffff"
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={
            active === item.key
              ? "btn btn-primary"
              : "btn"
          }
          onClick={() => {
            if (window.location.pathname !== item.path) {
              window.location.assign(item.path);
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
