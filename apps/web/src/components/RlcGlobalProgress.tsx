import React from "react";
import type { RlcProgressPayload } from "../lib/rlcProgress";

type Active = {
  id: string;
  label: string;
  progress: number;
  status: "running" | "success" | "error";
};

function getButtonLabel(target: EventTarget | null): string {
  const el = target as HTMLElement | null;
  const button = el?.closest?.("button") as HTMLButtonElement | null;
  const text = String(button?.innerText || button?.textContent || "").trim();
  return text ? text.replace(/\s+/g, " ").slice(0, 80) : "Aktion";
}

export default function RlcGlobalProgress() {
  const [active, setActive] = React.useState<Active | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const hideRef = React.useRef<number | null>(null);

  function clearTimers() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (hideRef.current) window.clearTimeout(hideRef.current);
    timerRef.current = null;
    hideRef.current = null;
  }

  function start(id: string, label: string, progress = 8) {
    clearTimers();
    setActive({ id, label, progress, status: "running" });

    timerRef.current = window.setInterval(() => {
      setActive((prev) => {
        if (!prev || prev.status !== "running") return prev;
        const next = Math.min(92, prev.progress + Math.max(2, Math.round((100 - prev.progress) * 0.08)));
        return { ...prev, progress: next };
      });
    }, 420);
  }

  function finish(status: "success" | "error", id?: string, label?: string) {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;

    setActive((prev) => ({
      id: id || prev?.id || "rlc-action",
      label: label || prev?.label || "Aktion",
      progress: 100,
      status,
    }));

    hideRef.current = window.setTimeout(() => setActive(null), status === "success" ? 1200 : 2400);
  }

  React.useEffect(() => {
    function onProgress(event: Event) {
      const detail = (event as CustomEvent<RlcProgressPayload>).detail;
      if (!detail?.id || !detail?.label) return;

      if (detail.status === "success") return finish("success", detail.id, detail.label);
      if (detail.status === "error") return finish("error", detail.id, detail.label);

      start(detail.id, detail.label, detail.progress ?? 8);
    }

    function onClick(event: MouseEvent) {
      const el = event.target as HTMLElement | null;
      const button = el?.closest?.("button") as HTMLButtonElement | null;
      if (!button || button.disabled) return;

      const label = getButtonLabel(event.target);
      const id = `click-${Date.now()}`;

      start(id, label, 14);
      window.setTimeout(() => finish("success", id, label), 1800);
    }

    window.addEventListener("rlc:global-progress", onProgress);
    document.addEventListener("click", onClick, true);

    return () => {
      clearTimers();
      window.removeEventListener("rlc:global-progress", onProgress);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!active) return null;

  const progress = Math.max(0, Math.min(100, Math.round(active.progress)));

  return (
    <div style={wrap}>
      <div style={top}>
        <b>
          {active.status === "running"
            ? "RLC arbeitet…"
            : active.status === "success"
              ? "Abgeschlossen"
              : "Fehler"}
        </b>
        <span>{active.label} · {progress}%</span>
      </div>

      <div style={track}>
        <div
          style={{
            ...fill,
            width: `${progress}%`,
            background:
              active.status === "error"
                ? "linear-gradient(90deg,#DC2626,#EF4444)"
                : active.status === "success"
                  ? "linear-gradient(90deg,#16A34A,#22C55E)"
                  : "linear-gradient(90deg,#2563EB,#60A5FA)",
          }}
        />
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 22,
  transform: "translateX(-50%)",
  width: "min(620px, calc(100vw - 32px))",
  zIndex: 99999,
  padding: "13px 15px",
  borderRadius: 16,
  border: "1px solid rgba(191,219,254,0.95)",
  background: "rgba(239,246,255,0.98)",
  boxShadow: "0 18px 45px rgba(15,23,42,0.20)",
};

const top: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13,
  color: "#0F172A",
  marginBottom: 8,
};

const track: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#DBEAFE",
  overflow: "hidden",
};

const fill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  transition: "width 420ms ease",
};

