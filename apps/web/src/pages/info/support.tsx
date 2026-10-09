import { rlcClass } from "../../ui/rlcRuntimeStyle";import { API_BASE } from "../../lib/apiBase";
import React, { useMemo, useRef, useState } from "react";
import { buildRlcKnowledgeContext } from "../../copilot/RlcSoftwareKnowledge";

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ts: string;
};

type SupportResponse = {
  ok?: boolean;
  answer?: string;
  message?: string;
  reply?: string;
  error?: string;
};

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

const shell: React.CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter,system-ui,Arial",
  color: "#0f172a"
};

const headerCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  marginBottom: 12
};

const chatWrap: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden"
};

const messagesBox: React.CSSProperties = {
  height: 320,
  overflowY: "auto",
  padding: 14,
  background: "#f8fafc"
};

const rowBase: React.CSSProperties = {
  display: "flex",
  marginBottom: 10
};

const bubbleBase: React.CSSProperties = {
  maxWidth: "78%",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
};

const composer: React.CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  padding: 12,
  background: "#fff"
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 78,
  resize: "vertical",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: 10,
  fontSize: 14,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box"
};

const btnRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  flexWrap: "wrap"
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#fff",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer"
};

const smallInfo: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  marginTop: 8
};

function safeNowIso(): string {
  return new Date().toISOString();
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {


    // ignore localStorage errors
  }}
function getAuthToken(): string | null {
  const candidates = [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc.auth.token",
  "rlc_mobile_token"];


  for (const key of candidates) {
    const v = localStorage.getItem(key);
    if (v && v.trim()) return v.trim();
  }

  try {
    const authObj = readJson<any>("rlc_auth", null);
    if (authObj?.token) return String(authObj.token);
    if (authObj?.accessToken) return String(authObj.accessToken);
  } catch {


    // ignore
  }return null;
}

function getProjectContext() {
  const projectKeys = [
  "rlc.currentProject",
  "rlc_current_project",
  "currentProject",
  "__RLC_CURRENT_PROJECT__"];


  for (const key of projectKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed) return parsed;
    } catch {


      // ignore
    }}
  return null;
}

function extractAnswer(data: SupportResponse | null): string {
  if (!data) return "Keine Antwort vom Server erhalten.";
  return (
    data.answer ||
    data.reply ||
    data.message ||
    data.error ||
    "Der Support hat geantwortet, aber ohne Textinhalt.");

}

export default function Support() {
  const storageKey = "rlc.info.support.chat.v1";

  const initialMessages = useMemo<ChatMsg[]>(() => {
    const saved = readJson<ChatMsg[]>(storageKey, []);
    if (saved.length > 0) return saved;

    return [
    {
      id: uid(),
      role: "assistant",
      text:
      "Willkommen beim RLC Support-Chat.\n\n" +
      "Hier kannst du technische Probleme, Fragen zur Bedienung oder Fehler im Projekt melden.",
      ts: safeNowIso()
    }];

  }, []);

  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [mailSending, setMailSending] = useState(false);
  const [mailStatus, setMailStatus] = useState("");
  const [mailForm, setMailForm] = useState({
    name: "",
    firma: "",
    email: "",
    telefon: "",
    kategorie: "Support",
    betreff: "RLC Bausoftware – Supportanfrage",
    nachricht: ""
  });
  const boxRef = useRef<HTMLDivElement | null>(null);

  function persist(next: ChatMsg[]) {
    setMessages(next);
    writeJson(storageKey, next);

    setTimeout(() => {
      if (boxRef.current) {
        boxRef.current.scrollTop = boxRef.current.scrollHeight;
      }
    }, 30);
  }

  async function send() {
    const value = text.trim();
    if (!value || sending) return;

    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      text: value,
      ts: safeNowIso()
    };

    const nextAfterUser = [...messages, userMsg];
    persist(nextAfterUser);
    setText("");
    setSending(true);
    setStatus("Nachricht wird gesendet...");

    const token = getAuthToken();
    const project = getProjectContext();

    try {
      const res = await fetch(apiUrl("/api/support/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: value,
          messages: nextAfterUser.map((m) => ({
            role: m.role,
            content: m.text
          })),
          context: {
            source: "web-info-support",
            softwareKnowledge: buildRlcKnowledgeContext(
              value,
              window.location.pathname
            ),
            projectId: project?.id ?? null,
            projectCode: project?.code ?? null,
            projectName: project?.name ?? null,
            path: window.location.pathname,
            userAgent: navigator.userAgent
          }
        })
      });

      let data: SupportResponse | null = null;
      try {
        data = (await res.json()) as SupportResponse;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const errText =
        data?.error ||
        data?.message ||
        `Serverfehler (${res.status}) beim Support-Chat.`;

        const assistantMsg: ChatMsg = {
          id: uid(),
          role: "assistant",
          text:
          "Support-Chat derzeit nicht verfügbar.\n\n" +
          errText +
          "\n\n" + (
          !token ?
          "Hinweis: Der Endpoint /api/support/chat ist serverseitig geschützt. Wenn du nicht eingeloggt bist, kommt oft 401/403." :
          "Bitte Server-Logs prüfen oder Auth/Subscription prüfen."),
          ts: safeNowIso()
        };

        persist([...nextAfterUser, assistantMsg]);
        setStatus("Fehler beim Senden.");
        return;
      }

      const assistantMsg: ChatMsg = {
        id: uid(),
        role: "assistant",
        text: extractAnswer(data),
        ts: safeNowIso()
      };

      persist([...nextAfterUser, assistantMsg]);
      setStatus("Nachricht erfolgreich gesendet.");
    } catch (err: any) {
      const assistantMsg: ChatMsg = {
        id: uid(),
        role: "assistant",
        text:
        "Verbindung zum Support-Server fehlgeschlagen.\n\n" +
        `Fehler: ${err?.message || "Unbekannter Fehler"}\n\n` +
        "Bitte prüfe API-URL, Login und Serverstatus.",
        ts: safeNowIso()
      };

      persist([...nextAfterUser, assistantMsg]);
      setStatus("Server nicht erreichbar.");
    } finally {
      setSending(false);
    }
  }

  async function sendSupportMail() {
    if (!mailForm.nachricht.trim()) {
      setMailStatus("Bitte eine Nachricht eingeben.");
      return;
    }

    setMailSending(true);
    setMailStatus("Nachricht wird gesendet...");

    try {
      const token = getAuthToken();

      const textBody = [
        `Name: ${mailForm.name || "—"}`,
        `Firma: ${mailForm.firma || "—"}`,
        `E-Mail: ${mailForm.email || "—"}`,
        `Telefon: ${mailForm.telefon || "—"}`,
        `Kategorie: ${mailForm.kategorie}`,
        "",
        mailForm.nachricht
      ].join("\n");

      const htmlBody = `
        <h2>RLC Bausoftware – Supportanfrage</h2>
        <p><b>Name:</b> ${mailForm.name || "—"}</p>
        <p><b>Firma:</b> ${mailForm.firma || "—"}</p>
        <p><b>E-Mail:</b> ${mailForm.email || "—"}</p>
        <p><b>Telefon:</b> ${mailForm.telefon || "—"}</p>
        <p><b>Kategorie:</b> ${mailForm.kategorie}</p>
        <hr/>
        <p>${mailForm.nachricht.replace(/\n/g, "<br/>")}</p>
      `;

      const res = await fetch(apiUrl("/api/mail/send"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          to: "info@rlcbausoftware.com",
          subject: mailForm.betreff,
          text: textBody,
          html: htmlBody
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setMailStatus("Nachricht erfolgreich gesendet.");
      setMailForm((prev) => ({
        ...prev,
        nachricht: ""
      }));
    } catch (e: any) {
      setMailStatus(e?.message || "Nachricht konnte nicht gesendet werden.");
    } finally {
      setMailSending(false);
    }
  }
  function clearChat() {
    const next: ChatMsg[] = [
    {
      id: uid(),
      role: "assistant",
      text: "Chatverlauf wurde gelöscht.",
      ts: safeNowIso()
    }];

    persist(next);
    setStatus("Chatverlauf gelöscht.");
  }

  return (
    <div className={rlcClass(null, shell)}>
      <div className={rlcClass(null, headerCard)}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 5px" }}>Support / Kontakt</h2>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Fragen, technische Probleme oder Verbesserungsvorschläge direkt an den RLC Support senden.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMailOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "9px 13px",
              borderRadius: 9,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Support per E-Mail kontaktieren
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
          E-Mail: <b>info@rlcbausoftware.com</b>
        </div>
      </div>

      <div className={rlcClass(null, chatWrap)}>
        <div ref={boxRef} className={rlcClass(null, messagesBox)}>
          {messages.map((m) => {
            const isUser = m.role === "user";

            return (
              <div
                key={m.id} className={rlcClass(null,
                {
                  ...rowBase,
                  justifyContent: isUser ? "flex-end" : "flex-start"
                })}>
                
                <div className={rlcClass(null,
                {
                  ...bubbleBase,
                  background: isUser ? "#0f172a" : "#ffffff",
                  color: isUser ? "#ffffff" : "#0f172a",
                  border: isUser ? "1px solid #0f172a" : "1px solid #e2e8f0"
                })}>
                  
                  <div className="rlc-migrated-pages-info-support-tsx-819">






                    
                    {isUser ? "Du" : "RLC Support"}
                  </div>
                  <div>{m.text}</div>
                </div>
              </div>);

          })}
        </div>

        <div className={rlcClass(null, composer)}>
          <textarea className={rlcClass(null,
          textareaStyle)}
          placeholder="Beschreibe dein Problem oder deine Frage..."
          value={text}
          onChange={(e) => setText(e.target.value)} />
          

          <div className={rlcClass(null, btnRow)}>
            <button className={rlcClass(null,
            {
              ...primaryBtn,
              opacity: sending ? 0.7 : 1
            })}
            onClick={send}
            disabled={sending}
            type="button">
              
              {sending ? "Wird gesendet..." : "Nachricht senden"}
            </button>

            <button className={rlcClass(null,
            secondaryBtn)}
            onClick={clearChat}
            disabled={sending}
            type="button">
              
              Chat leeren
            </button>
          </div>

          <div className={rlcClass(null, smallInfo)}>{status || "Bereit."}</div>
        </div>
      </div>
      {mailOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20
          }}
        >
          <div
            style={{
              width: "min(720px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0 }}>Support per E-Mail kontaktieren</h2>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  Empfänger: <b>info@rlcbausoftware.com</b>
                </div>
              </div>

              <button
                type="button"
                style={secondaryBtn}
                onClick={() => setMailOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 12,
                marginTop: 18
              }}
            >
              <input
                style={{ ...textareaStyle, minHeight: 44 }}
                placeholder="Name"
                value={mailForm.name}
                onChange={(e) =>
                  setMailForm((p) => ({ ...p, name: e.target.value }))
                }
              />

              <input
                style={{ ...textareaStyle, minHeight: 44 }}
                placeholder="Firma"
                value={mailForm.firma}
                onChange={(e) =>
                  setMailForm((p) => ({ ...p, firma: e.target.value }))
                }
              />

              <input
                style={{ ...textareaStyle, minHeight: 44 }}
                placeholder="Ihre E-Mail"
                value={mailForm.email}
                onChange={(e) =>
                  setMailForm((p) => ({ ...p, email: e.target.value }))
                }
              />

              <input
                style={{ ...textareaStyle, minHeight: 44 }}
                placeholder="Telefon"
                value={mailForm.telefon}
                onChange={(e) =>
                  setMailForm((p) => ({ ...p, telefon: e.target.value }))
                }
              />

              <select
                style={{ ...textareaStyle, minHeight: 44 }}
                value={mailForm.kategorie}
                onChange={(e) =>
                  setMailForm((p) => ({ ...p, kategorie: e.target.value }))
                }
              >
                <option>Support</option>
                <option>Technisches Problem</option>
                <option>Verbesserungsvorschlag</option>
                <option>Lizenz</option>
                <option>Sonstiges</option>
              </select>

              <input
                style={{ ...textareaStyle, minHeight: 44 }}
                value={mailForm.betreff}
                onChange={(e) =>
                  setMailForm((p) => ({ ...p, betreff: e.target.value }))
                }
              />
            </div>

            <textarea
              style={{ ...textareaStyle, minHeight: 140, marginTop: 12 }}
              placeholder="Nachricht"
              value={mailForm.nachricht}
              onChange={(e) =>
                setMailForm((p) => ({ ...p, nachricht: e.target.value }))
              }
            />

            <div style={btnRow}>
              <button
                type="button"
                style={primaryBtn}
                disabled={mailSending}
                onClick={() => void sendSupportMail()}
              >
                {mailSending ? "Wird gesendet..." : "Nachricht senden"}
              </button>

              <button
                type="button"
                style={secondaryBtn}
                onClick={() => setMailOpen(false)}
              >
                Abbrechen
              </button>
            </div>

            <div style={smallInfo}>{mailStatus}</div>
          </div>
        </div>
      ) : null}

    </div>);

}