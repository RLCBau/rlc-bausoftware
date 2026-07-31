import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { LagerDB } from "./store.lager";
import { StockItem, PurchaseOrder, PoLine } from "./types";

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle"
};

export default function Lager() {
  const [items, setItems] = React.useState<StockItem[]>(LagerDB.listItems());
  const [pos, setPOs] = React.useState<PurchaseOrder[]>(LagerDB.listPOs());
  const [selId, setSelId] = React.useState<string | null>(LagerDB.listItems()[0]?.id ?? null);
  const [selPOId, setSelPOId] = React.useState<string | null>(LagerDB.listPOs()[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [onlyLow, setOnlyLow] = React.useState(false);

  const refresh = React.useCallback(() => {
    const nextItems = LagerDB.listItems();
    const nextPOs = LagerDB.listPOs();

    setItems(nextItems);
    setPOs(nextPOs);

    setSelId((prev) => {
      if (prev && nextItems.some((x) => x.id === prev)) return prev;
      return nextItems[0]?.id ?? null;
    });

    setSelPOId((prev) => {
      if (prev && nextPOs.some((x) => x.id === prev)) return prev;
      return nextPOs[0]?.id ?? null;
    });
  }, []);

  const sel = React.useMemo(
    () => items.find((x) => x.id === selId) ?? null,
    [items, selId]
  );

  const selPO = React.useMemo(
    () => pos.find((x) => x.id === selPOId) ?? null,
    [pos, selPOId]
  );

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();

    return items.filter((i) => {
      const s = `${i.name} ${i.sku ?? ""} ${i.location ?? ""}`.toLowerCase();
      const okQ = !qq || s.includes(qq);
      const okL = !onlyLow || (i.stock ?? 0) <= (i.minStock ?? 0);
      return okQ && okL;
    });
  }, [items, q, onlyLow]);

  const addItem = React.useCallback(() => {
    const it = LagerDB.createItem();
    refresh();
    setSelId(it.id);
  }, [refresh]);

  const delItem = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Artikel löschen?")) return;
    LagerDB.removeItem(sel.id);
    refresh();
  }, [sel, refresh]);

  const upItem = React.useCallback(
    (p: Partial<StockItem>) => {
      if (!sel) return;
      const next: StockItem = { ...sel, ...p, updatedAt: Date.now() };
      LagerDB.upsertItem(next);
      setSelId(next.id);
      refresh();
    },
    [sel, refresh]
  );

  const receive = React.useCallback(
    (qty: number) => {
      if (!sel || !qty || qty <= 0) return;
      LagerDB.move(sel.id, "IN", qty);
      refresh();
    },
    [sel, refresh]
  );

  const issue = React.useCallback(
    (qty: number) => {
      if (!sel || !qty || qty <= 0) return;
      LagerDB.move(sel.id, "OUT", qty);
      refresh();
    },
    [sel, refresh]
  );

  const addPO = React.useCallback(() => {
    const p = LagerDB.createPO();
    refresh();
    setSelPOId(p.id);
  }, [refresh]);

  const delPO = React.useCallback(() => {
    if (!selPO) return;
    if (!confirm("Bestellung löschen?")) return;
    LagerDB.removePO(selPO.id);
    refresh();
  }, [selPO, refresh]);

  const upPO = React.useCallback(
    (p: Partial<PurchaseOrder>) => {
      if (!selPO) return;
      const next: PurchaseOrder = { ...selPO, ...p, updatedAt: Date.now() };
      LagerDB.upsertPO(next);
      setSelPOId(next.id);
      refresh();
    },
    [selPO, refresh]
  );

  const addLine = React.useCallback(
    (item?: StockItem) => {
      if (!selPO) return;
      const l: PoLine = {
        id: crypto.randomUUID(),
        sku: item?.sku ?? "",
        name: item?.name ?? "",
        qty: 1,
        price: item?.price ?? 0
      };
      upPO({ lines: [l, ...(selPO.lines || [])] });
    },
    [selPO, upPO]
  );

  const delLine = React.useCallback(
    (id: string) => {
      if (!selPO) return;
      upPO({ lines: (selPO.lines || []).filter((x) => x.id !== id) });
    },
    [selPO, upPO]
  );

  const totalPO = React.useCallback((po: PurchaseOrder) => {
    return (po.lines || []).reduce((s, l) => s + l.qty * l.price, 0);
  }, []);

  return (
    <div className="rlc-migrated-pages-buro-lager-tsx-516">
      <div
        className="card rlc-migrated-pages-buro-lager-tsx-517">

        
        <button className="btn" onClick={addItem}>
          + Artikel
        </button>
        <button className="btn" onClick={delItem} disabled={!sel}>
          Löschen
        </button>
        <div className="rlc-migrated-pages-buro-lager-tsx-518" />
        <input
          placeholder="Suche Name / SKU / Lager…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 260 })} />
        
        <label className="rlc-migrated-pages-buro-lager-tsx-519">
          <input
            type="checkbox"
            checked={onlyLow}
            onChange={(e) => setOnlyLow(e.target.checked)} />
          
          <span className="rlc-migrated-pages-buro-lager-tsx-520">nur Unterbestand</span>
        </label>
        <button
          className="btn"
          onClick={() =>
          download(
            "text/csv;charset=utf-8",
            "lager.csv",
            LagerDB.exportCSV(filtered)
          )
          }>
          
          Export CSV
        </button>
      </div>

      <div className="rlc-migrated-pages-buro-lager-tsx-521">






        
        <div className="card rlc-migrated-pages-buro-lager-tsx-522">
          <table className="rlc-migrated-pages-buro-lager-tsx-523">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>SKU</th>
                <th className={rlcClass(null, th)}>Lager</th>
                <th className={rlcClass(null, th)}>Bestand</th>
                <th className={rlcClass(null, th)}>min</th>
                <th className={rlcClass(null, th)}>Preis</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const low = (i.stock ?? 0) <= (i.minStock ?? 0);
                return (
                  <tr
                    key={i.id}
                    onClick={() => setSelId(i.id)} className={rlcClass(null,
                    {
                      cursor: "pointer",
                      background: sel?.id === i.id ? "#f1f5ff" : undefined
                    })}>
                    
                    <td className={rlcClass(null, td)}>
                      <b>{i.name}</b>
                    </td>
                    <td className={rlcClass(null, td)}>{i.sku || "—"}</td>
                    <td className={rlcClass(null, td)}>{i.location || "—"}</td>
                    <td className={rlcClass(null, { ...td, color: low ? "#c03" : undefined })}>{i.stock ?? 0}</td>
                    <td className={rlcClass(null, td)}>{i.minStock ?? 0}</td>
                    <td className={rlcClass(null, td)}>{typeof i.price === "number" ? `${i.price.toFixed(2)} €` : "—"}</td>
                  </tr>);

              })}
              {filtered.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={6}>
                    Keine Artikel.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div className="card rlc-migrated-pages-buro-lager-tsx-524">
          {!sel ?
          <div className="rlc-migrated-pages-buro-lager-tsx-525">Links Artikel wählen oder neu anlegen.</div> :

          <div className="rlc-migrated-pages-buro-lager-tsx-526">
              <label className={rlcClass(null, lbl)}>Name</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.name}
            onChange={(e) => upItem({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>SKU</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.sku ?? ""}
            onChange={(e) => upItem({ sku: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Lagerort</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.location ?? ""}
            onChange={(e) => upItem({ location: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Preis (€)</label>
              <input
              type="number"
              step="0.01" className={rlcClass(null,
              inp)}
              value={sel.price ?? 0}
              onChange={(e) => upItem({ price: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Bestand</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.stock ?? 0}
              onChange={(e) => upItem({ stock: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Mindestbestand</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.minStock ?? 0}
              onChange={(e) => upItem({ minStock: Number(e.target.value) || 0 })} />
            

              <div className="rlc-migrated-pages-buro-lager-tsx-527">
                <button
                className="btn"
                onClick={() => receive(Number(prompt("Eingang Menge:", "1")) || 0)}>
                
                  + Eingang
                </button>
                <button
                className="btn"
                onClick={() => issue(Number(prompt("Ausgang Menge:", "1")) || 0)}>
                
                  − Ausgang
                </button>
                <button
                className="btn"
                onClick={() => {
                  if (!sel) return;
                  addLine(sel);
                }}>
                
                  In Bestellung übernehmen
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      <div className="card rlc-migrated-pages-buro-lager-tsx-528">
        <div className="rlc-migrated-pages-buro-lager-tsx-529">
          <div className="rlc-migrated-pages-buro-lager-tsx-530">Bestellungen</div>
          <div className="rlc-migrated-pages-buro-lager-tsx-531" />
          <button className="btn" onClick={addPO}>
            + Bestellung
          </button>
          <button className="btn" onClick={delPO} disabled={!selPO}>
            Löschen
          </button>
        </div>

        {!selPO ?
        <div className="rlc-migrated-pages-buro-lager-tsx-532">Keine Bestellung ausgewählt.</div> :

        <div className="rlc-migrated-pages-buro-lager-tsx-533">





          
            <label className={rlcClass(null, lbl)}>Nummer</label>
            <input className={rlcClass(null,
          inp)}
          value={selPO.number}
          onChange={(e) => upPO({ number: e.target.value })} />
          

            <label className={rlcClass(null, lbl)}>Lieferant</label>
            <input className={rlcClass(null,
          inp)}
          value={selPO.vendor ?? ""}
          onChange={(e) => upPO({ vendor: e.target.value })} />
          

            <label className={rlcClass(null, lbl)}>Status</label>
            <select className={rlcClass(null,
          inp)}
          value={selPO.status ?? "Entwurf"}
          onChange={(e) => upPO({ status: e.target.value as any })}>
            
              <option>Entwurf</option>
              <option>Bestellt</option>
              <option>Geliefert</option>
              <option>Storniert</option>
            </select>

            <label className={rlcClass(null, lbl)}>Lieferdatum</label>
            <input
            type="date" className={rlcClass(null,
            inp)}
            value={toDateInput(selPO.deliveryDate)}
            onChange={(e) => upPO({ deliveryDate: fromDateInput(e.target.value) })} />
          

            <div className="rlc-migrated-pages-buro-lager-tsx-534">
              <table className="rlc-migrated-pages-buro-lager-tsx-535">
                <thead>
                  <tr>
                    <th className={rlcClass(null, th)}>SKU</th>
                    <th className={rlcClass(null, th)}>Bezeichnung</th>
                    <th className={rlcClass(null, th)}>Menge</th>
                    <th className={rlcClass(null, th)}>Preis</th>
                    <th className={rlcClass(null, th)}>Summe</th>
                    <th className={rlcClass(null, th)}></th>
                  </tr>
                </thead>
                <tbody>
                  {(selPO.lines || []).map((l) =>
                <tr key={l.id}>
                      <td className={rlcClass(null, td)}>
                        <input className={rlcClass(null,
                    { ...inp, width: "100%" })}
                    value={l.sku}
                    onChange={(e) =>
                    upPO({
                      lines: (selPO.lines || []).map((x) =>
                      x.id === l.id ? { ...l, sku: e.target.value } : x
                      )
                    })
                    } />
                    
                      </td>
                      <td className={rlcClass(null, td)}>
                        <input className={rlcClass(null,
                    { ...inp, width: "100%" })}
                    value={l.name}
                    onChange={(e) =>
                    upPO({
                      lines: (selPO.lines || []).map((x) =>
                      x.id === l.id ? { ...l, name: e.target.value } : x
                      )
                    })
                    } />
                    
                      </td>
                      <td className={rlcClass(null, td)}>
                        <input
                      type="number" className={rlcClass(null,
                      inp)}
                      value={l.qty}
                      onChange={(e) =>
                      upPO({
                        lines: (selPO.lines || []).map((x) =>
                        x.id === l.id ? { ...l, qty: Number(e.target.value) || 0 } : x
                        )
                      })
                      } />
                    
                      </td>
                      <td className={rlcClass(null, td)}>
                        <input
                      type="number"
                      step="0.01" className={rlcClass(null,
                      inp)}
                      value={l.price}
                      onChange={(e) =>
                      upPO({
                        lines: (selPO.lines || []).map((x) =>
                        x.id === l.id ? { ...l, price: Number(e.target.value) || 0 } : x
                        )
                      })
                      } />
                    
                      </td>
                      <td className={rlcClass(null, td)}>{(l.qty * l.price).toFixed(2)} €</td>
                      <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                        <button className="btn" onClick={() => delLine(l.id)}>
                          Entfernen
                        </button>
                      </td>
                    </tr>
                )}

                  {(selPO.lines || []).length === 0 &&
                <tr>
                      <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={6}>
                        Keine Positionen.
                      </td>
                    </tr>
                }

                  {(selPO.lines || []).length > 0 &&
                <tr>
                      <td className={rlcClass(null, td)} colSpan={4}>
                        <b>Gesamt</b>
                      </td>
                      <td className={rlcClass(null, { ...td, fontWeight: 600 })}>{totalPO(selPO).toFixed(2)} €</td>
                      <td className={rlcClass(null, td)}></td>
                    </tr>
                }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    </div>);

}

function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromDateInput(v: string) {
  if (!v) return "";
  return `${v}T12:00:00.000Z`;
}

function download(type: string, name: string, data: string) {
  const b = new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
