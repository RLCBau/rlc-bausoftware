import { rlcClass } from "../ui/rlcRuntimeStyle"; // src/components/Card.tsx
import React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  hover?: boolean;
  clickable?: boolean;
};

export default function Card({
  children,
  style,
  className = "",
  hover = false,
  clickable = false,
  ...rest
}: Props) {
  return (
    <div
      {...rest} className={rlcClass(
        `rlc-card ${hover ? "rlc-card-hover" : ""} ${
        clickable ? "rlc-card-clickable" : ""} ${
        className}`,
        {
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 16,
          background: "var(--card-bg, #fff)",
          transition: "all 0.2s ease",
          cursor: clickable ? "pointer" : "default",
          ...style
        })}>
      
      {children}
    </div>);

}
