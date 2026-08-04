import { rlcClass } from "../ui/rlcRuntimeStyle";import React from "react";
import { Outlet } from "react-router-dom";

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
  centerVisible?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export default function Section({
  left,
  right,
  centerVisible = true,
  children,
  style
}: Props) {
  const twoCols = centerVisible === false;
  const gridTemplateColumns = twoCols ?
  "260px minmax(0, 1fr)" :
  right ?
  "260px minmax(0, 1fr) 320px" :
  "260px minmax(0, 1fr)";

  const content = children ?? <Outlet />;

  return (
    <div className={rlcClass(null,
    {
      display: "grid",
      gridTemplateColumns,
      gap: 16,
      padding: 16,
      alignItems: "start",
      ...style
    })}>
      
      <aside className="rlc-migrated-components-section-tsx-15">{left}</aside>

      {twoCols ?
      <section className="rlc-migrated-components-section-tsx-16">{content}</section> :

      <>
          <main className="rlc-migrated-components-section-tsx-17">{content}</main>
          {right ? <aside className="rlc-migrated-components-section-tsx-18">{right}</aside> : null}
        </>
      }
    </div>);

}
