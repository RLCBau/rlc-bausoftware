import React from "react";
type Props = { breadcrumb?: string; title: string; subtitle?: string };
export default function PageHeader({ breadcrumb, title, subtitle }: Props) {
  return (
    <div className="mb-4">
      {breadcrumb && <div className="text-xs text-gray-500">{breadcrumb}</div>}
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
    </div>
  );
}
