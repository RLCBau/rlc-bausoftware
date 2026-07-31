import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: ReactNode;
};

export default function MengPageHeader({
  title,
  subtitle,
  badge = "Mengenermittlung",
  actions
}: Props) {
  const navigate = useNavigate();

  return (
    <header className="rlc-page-hero rlc-page-hero--split">
      <div>
        <div className="rlc-page-hero__eyebrow">{badge}</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      <div className="rlc-page-hero__actions">
        {actions}
        <button
          type="button"
          className="rlc-page-hero__button"
          onClick={() => navigate("/mengenermittlung")}
        >
          Übersicht
        </button>
      </div>
    </header>
  );
}
