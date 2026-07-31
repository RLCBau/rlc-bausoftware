import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import MengPageHeader from "./MengPageHeader";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";

type StoredFile = {
  file?: string;
  name?: string;
  publicUrl?: string;
  url?: string;
};

type FotoNote = {
  id: string;
  docId?: string;
  date?: string;
  kostenstelle?: string;
  lvItemPos?: string;
  comment?: string;
  bemerkungen?: string;
  note?: string;
  main?: StoredFile | null;
  files?: StoredFile[];
};

type MessageState = {
  title: string;
  text: string;
  tone: "success" | "error";
} | null;

const shell: React.CSSProperties = {
  maxWidth: 1480,
  margin: "0 auto",
  padding: "16px 18px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a"
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dce5f2",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)"
};

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569"
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d9e2f1",
  borderRadius: 11,
  padding: "10px 11px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 650
};

const textarea: React.CSSProperties = {
  ...input,
  minHeight: 120,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.5
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #d7e2f0",
  background: "#fff",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
  cursor: "pointer"
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#0f4ec9",
  color: "#fff",
  borderColor: "#0f4ec9"
};

const fileDrop: React.CSSProperties = {
  border: "2px dashed #93b4ee",
  borderRadius: 16,
  padding: 18,
  background: "#f7faff",
  textAlign: "center",
  cursor: "pointer"
};


function getFotoAuthHeaders(): Record<string, string> {
  const keys = [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc.auth.token",
  "rlc_mobile_token",
  "rlc_auth_token",
  "rlc_access_token"];


  for (const key of keys) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  try {
    const raw =
    localStorage.getItem("auth") ||
    localStorage.getItem("rlc_auth") ||
    localStorage.getItem("user");

    if (raw) {
      const parsed = JSON.parse(raw);
      const token =
      parsed?.token ||
      parsed?.accessToken ||
      parsed?.authToken ||
      parsed?.jwt ||
      parsed?.data?.token ||
      parsed?.data?.accessToken ||
      parsed?.user?.token ||
      parsed?.user?.accessToken;

      if (typeof token === "string" && token.trim()) {
        return { Authorization: `Bearer ${token.trim()}` };
      }
    }
  } catch {


    // Keine gespeicherten Auth-Daten.
  }return {};
}

function fileUrl(file?: StoredFile | null): string {
  const value = String(file?.publicUrl || file?.url || "").trim();
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  return apiUrl(value.startsWith("/") ? value : `/${value}`);
}

function isPdf(name: string, type?: string): boolean {
  return type === "application/pdf" || /\.pdf$/i.test(name);
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("de-DE");
}

export default function BilderZumAufmass() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectId = String(project?.code || project?.id || "").trim();

  const [items, setItems] = React.useState<FotoNote[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [lvItemPos, setLvItemPos] = React.useState("");
  const [kostenstelle, setKostenstelle] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [message, setMessage] = React.useState<MessageState>(null);

  const previewUrl = React.useMemo(
    () => file ? URL.createObjectURL(file) : "",
    [file]
  );

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadItems = React.useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(
          `/api/fotos/projects/${encodeURIComponent(projectId)}/fotos/notes`
        ),
        {
          credentials: "include",
          headers: getFotoAuthHeaders(),
          cache: "no-store"
        }
      );
      const data = await res.json().catch(() => ({}));

      if (res.status === 404) {
        setItems([]);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error: any) {
      setMessage({
        title: "Laden fehlgeschlagen",
        text: error?.message || "Einträge konnten nicht geladen werden.",
        tone: "error"
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const resetForm = React.useCallback(() => {
    setEditingId(null);
    setDate(new Date().toISOString().slice(0, 10));
    setLvItemPos("");
    setKostenstelle("");
    setComment("");
    setFile(null);
  }, []);

  const editItem = React.useCallback((item: FotoNote) => {
    setEditingId(String(item.docId || item.id));
    setDate(item.date || new Date().toISOString().slice(0, 10));
    setLvItemPos(item.lvItemPos || "");
    setKostenstelle(item.kostenstelle || "");
    setComment(item.comment || item.note || item.bemerkungen || "");
    setFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const saveItem = React.useCallback(async () => {
    if (!projectId) {
      setMessage({
        title: "Kein Projekt",
        text: "Bitte zuerst ein Projekt auswählen.",
        tone: "error"
      });
      return;
    }

    if (!editingId && !file) {
      setMessage({
        title: "Datei fehlt",
        text: "Bitte genau ein Foto oder PDF auswählen.",
        tone: "error"
      });
      return;
    }

    if (!comment.trim()) {
      setMessage({
        title: "Beschreibung fehlt",
        text: "Bitte die Aufnahme oder das Dokument beschreiben.",
        tone: "error"
      });
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      if (editingId) form.append("docId", editingId);
      form.append("date", date);
      form.append("lvItemPos", lvItemPos.trim());
      form.append("kostenstelle", kostenstelle.trim());
      form.append("comment", comment.trim());
      form.append("note", comment.trim());
      form.append("bemerkungen", comment.trim());
      if (file) form.append("main", file);

      const res = await fetch(
        apiUrl(
          `/api/fotos/projects/${encodeURIComponent(projectId)}/fotos/notes`
        ),
        {
          method: "POST",
          credentials: "include",
          headers: getFotoAuthHeaders(),
          body: form
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const savedItem = data?.item as FotoNote | undefined;

      if (savedItem?.id) {
        setItems((current) => [
        savedItem,
        ...current.filter(
          (item) =>
          String(item.id) !== String(savedItem.id) &&
          String(item.docId || "") !== String(savedItem.docId || "")
        )]
        );
      } else {
        await loadItems();
      }

      resetForm();

      setMessage({
        title: "Gespeichert",
        text: "Foto/PDF und Beschreibung wurden als neuer Eintrag gespeichert.",
        tone: "success"
      });
    } catch (error: any) {
      setMessage({
        title: "Speichern fehlgeschlagen",
        text: error?.message || "Der Eintrag konnte nicht gespeichert werden.",
        tone: "error"
      });
    } finally {
      setSaving(false);
    }
  }, [
  projectId,
  editingId,
  file,
  comment,
  date,
  lvItemPos,
  kostenstelle,
  resetForm,
  loadItems]
  );

  return (
    <div className={rlcClass(null, shell)}>
      <MengPageHeader
        title="Bilder zum Aufmaß"
        subtitle="Je Foto oder PDF einen eigenen dokumentierten Aufmaß-Eintrag speichern." />
      

      <section className={rlcClass(null, { ...card, marginTop: 16 })}>
        <h2 className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1378">
          {editingId ? "Eintrag bearbeiten" : "Neuen Eintrag anlegen"}
        </h2>

        <div className={rlcClass(null, fieldGrid)}>
          <label className={rlcClass(null, label)}>
            Datum
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)} className={rlcClass(null,
              input)} />
            
          </label>

          <label className={rlcClass(null, label)}>
            LV-Position
            <input
              value={lvItemPos}
              onChange={(e) => setLvItemPos(e.target.value)} className={rlcClass(null,
              input)}
              placeholder="z. B. 001.010" />
            
          </label>

          <label className={rlcClass(null, label)}>
            Bereich / Kostenstelle
            <input
              value={kostenstelle}
              onChange={(e) => setKostenstelle(e.target.value)} className={rlcClass(null,
              input)}
              placeholder="z. B. Bauabschnitt Nord" />
            
          </label>
        </div>

        <label className={rlcClass(null, { ...label, marginTop: 14 })}>
          Beschreibung der Aufnahme / des Dokuments
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)} className={rlcClass(null,
            textarea)}
            placeholder="Ausführungsstand, Lage, Besonderheiten, Mängel oder Bezug zum Aufmaß beschreiben." />
          
        </label>

        <label className={rlcClass(null, { ...fileDrop, display: "block", marginTop: 14 })}>
          <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1379">
            Genau ein JPG, PNG oder PDF auswählen
          </div>
          <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1380">
            Danach Beschreibung ergänzen und im Projekt speichern.
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              e.currentTarget.value = "";
            }} className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1381" />

          
        </label>

        {file && previewUrl ?
        <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1382">







          
            {isPdf(file.name, file.type) ?
          <object
            data={previewUrl}
            type="application/pdf" className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1383">

            
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  PDF öffnen
                </a>
              </object> :

          <img
            src={previewUrl}
            alt={file.name} className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1384" />








          }

            <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1385">








            
              <strong>{file.name}</strong>
              <button type="button" className={rlcClass(null, btn)} onClick={() => setFile(null)}>
                Datei entfernen
              </button>
            </div>
          </div> :
        null}

        <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1386">
          <button
            type="button" className={rlcClass(null,
            {
              ...btnPrimary,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "not-allowed" : "pointer"
            })}
            disabled={saving}
            onClick={saveItem}>
            
            {saving ? "RLC speichert…" : "Eintrag speichern"}
          </button>
        </div>
      </section>

      <section className={rlcClass(null, { ...card, marginTop: 16 })}>
        <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1387">







          
          <h2 className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1388">
            Gespeicherte Einträge
          </h2>
          <button type="button" className={rlcClass(null, btn)} onClick={() => void loadItems()}>
            Aktualisieren
          </button>
        </div>

        {loading ?
        <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1389">RLC lädt…</div> :
        items.length === 0 ?
        <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1390">
            Noch keine Einträge gespeichert.
          </div> :

        <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1391">
            {items.map((item) => {
            const stored = item.main || item.files?.[0] || null;
            const url = fileUrl(stored);
            const name = stored?.name || stored?.file || "Datei";

            return (
              <article
                key={item.id} className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1392">









                
                  <div>
                    {url ?
                  isPdf(name) ?
                  <object
                    data={url}
                    type="application/pdf" className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1393">






                    
                          <a href={url} target="_blank" rel="noreferrer">
                            PDF öffnen
                          </a>
                        </object> :

                  <a href={url} target="_blank" rel="noreferrer">
                          <img
                      src={url}
                      alt={name} className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1394" />







                    
                        </a> :


                  <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1395">








                    
                        Keine Vorschau
                      </div>
                  }
                  </div>

                  <div>
                    <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1396">







                    
                      <strong className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1397">
                        {item.lvItemPos || "Ohne LV-Position"}
                      </strong>
                      <span>{formatDate(item.date)}</span>
                      <span>{item.kostenstelle || "Kein Bereich"}</span>
                    </div>

                    <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1398">





                    
                      {item.comment || item.note || item.bemerkungen || "—"}
                    </div>

                    {url ?
                  <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1399">
                        <a href={url} target="_blank" rel="noreferrer">
                          {name}
                        </a>
                      </div> :
                  null}

                    <button
                    type="button" className={rlcClass(null,
                    { ...btn, marginTop: 10 })}
                    onClick={() => editItem(item)}>
                    
                      Eintrag bearbeiten
                    </button>
                  </div>
                </article>);

          })}
          </div>
        }
      </section>

      {message ?
      <div
        role="dialog"
        aria-modal="true"
        onClick={() => setMessage(null)} className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1400">









        
          <div
          onClick={(e) => e.stopPropagation()} className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1401">







          
            <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1402">
              {message.title}
            </div>
            <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1403">
              {message.text}
            </div>
            <div className="rlc-migrated-pages-mengenermittlung-bilder-tsx-1404">
              <button type="button" className={rlcClass(null, btnPrimary)} onClick={() => setMessage(null)}>
                OK
              </button>
            </div>
          </div>
        </div> :
      null}
    </div>);

}
