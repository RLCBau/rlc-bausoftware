// src/components/PageHeader.tsx
import React from "react";

type Props = {
  breadcrumb?: string;
  title: string;
  subtitle?: string;
};

export default function PageHeader({
  breadcrumb,
  title,
  subtitle,
}: Props) {
  return (
    <div style={{ marginBottom: 16 }}>
      {breadcrumb && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted, #6b7280)",
            marginBottom: 4,
          }}
        >
          {breadcrumb}
        </div>
      )}

      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          margin: 0,
        }}
      >
        {title}
      </h1>

      {subtitle && (
        <p
          style={{
            fontSize: 14,
            color: "var(--text-muted, #6b7280)",
            marginTop: 4,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}





