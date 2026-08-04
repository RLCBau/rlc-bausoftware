import { rlcClass } from "../ui/rlcRuntimeStyle"; // apps/web/src/lib/ui/Placeholder.tsx

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
  icon
}: Props) {
  return (
    <div className="card rlc-migrated-shared-placeholder-tsx-1567">
      {icon && <div className="rlc-migrated-shared-placeholder-tsx-1568">{icon}</div>}

      <div className="card-title rlc-migrated-shared-placeholder-tsx-1569">
        {title}
      </div>

      <div className={rlcClass("muted", { marginBottom: action ? 16 : 0 })}>
        {description}
      </div>

      {action && <div>{action}</div>}
    </div>);

}
