// apps/web/src/lib/ui/Placeholder.tsx

import React from "react";

type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
};

export default function Placeholder({
  title,
  description = "Inhalt folgt – Struktur bleibt fix.",
  action,
  icon,
}: Props) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 24 }}>
      {icon && <div style={{ marginBottom: 12 }}>{icon}</div>}

      <div className="card-title" style={{ marginBottom: 8 }}>
        {title}
      </div>

      <div className="muted" style={{ marginBottom: action ? 16 : 0 }}>
        {description}
      </div>

      {action && <div>{action}</div>}
    </div>
  );
}





