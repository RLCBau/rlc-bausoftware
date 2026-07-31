import React from "react";
export default function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">{children}</div>;
}
