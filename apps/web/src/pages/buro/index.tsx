import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";

type Props = {
  children: React.ReactNode;
};

const mainStyle: React.CSSProperties = {
  padding: 0,
  minWidth: 0,
  width: "100%"
};

export default function BuroLayout({ children }: Props) {
  return (
    <main className={rlcClass("card", mainStyle)}>
      {children}
    </main>);

}
