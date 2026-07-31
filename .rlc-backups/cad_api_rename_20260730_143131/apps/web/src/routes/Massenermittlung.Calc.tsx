import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getLVItem, listLVItems, updateLVItem, type LVItem } from '../lib/api';

type Ctx = { activeProject: string | null };
type Vars = Record<string, number>;

function evalExpr(expr: string, vars: Vars): number {
  const safe = expr.replace(/[a-zA-Z_\u00C0-\u017F][\w\u00C0-\u017F]*/g, m => Object.prototype.hasOwnProperty.call(vars, m) ? String(vars[m]) : '0');
  if (!/^[0-9+\-*/().\s]*$/.test(safe)) throw new Error('Ungültig');
  // eslint-disable-next-line no-new-func
  const v = Number(new Function(`return (${safe});`)());
  return Number.isFinite(v) ? v : 0;
}

export default function Calc() {
  const { activeProject } = useOutletContext<Ctx>();
  const [items, setItems] = useState<LVItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [expr, setExpr] = useState('(laenge * breite) - aussparungen');
  const [vars, setVars] = useState<Vars>({ laenge: 20, breite: 3, aussparungen: 2 });

  useEffect(() => {
    if (!activeProject) return;
    listLVItems(activeProject).then((list) => {
      setItems(list);
      if (list.length) setCurrentId(list[0].id);
    });
  }, [activeProject]);

  useEffect(() => {
    if (!currentId) return;
    getLVItem(currentId).then(it => {
      setExpr(it.calcExpression ?? '(laenge * breite) - aussparungen');
      try { setVars(it.calcVariables ? JSON.parse(it.calcVariables) : {}); } catch { setVars({}); }
    });
  }, [currentId]);

  const result = useMemo(() => { try { return evalExpr(expr, vars); } catch { return 0; } }, [expr, vars]);

  const save = async () => {
    if (!currentId) return;
    const payload = { calcExpression: expr, calcVariables: JSON.stringify(vars), calcResult: result, quantity: result };
    await updateLVItem(currentId, payload);
    alert('Gespeichert');
  };

  return (
    <div className="card grid">
      <div className="row">
        <label>Position</label>
        <select value={currentId ?? ''} onChange={e => setCurrentId(e.target.value)} style={{minWidth:260}}>
          {items.map(i => <option key={i.id} value={i.id}>{i.positionNumber} — {i.shortText}</option>)}
        </select>
        <span className="pill">{items.length}</span>
      </div>

      <label>Ausdruck</label>
      <input value={expr} onChange={e => setExpr(e.target.value)} className="mono"/>

      <div className="row">
        {Object.entries(vars).map(([k, v]) => (
          <div key={k} className="row">
            <label className="muted" style={{width:110}}>{k}</label>
            <input type="number" value={v} onChange={e => setVars(s => ({ ...s, [k]: Number(e.target.value) }))} style={{width:120}}/>
            <button onClick={() => setVars(s => { const c={...s}; delete c[k]; return c; })}>Entfernen</button>
          </div>
        ))}
      </div>

      <div className="row">
        <input placeholder="neueVariable" style={{width:160}} id="nv"/>
        <input placeholder="Wert" type="number" style={{width:120}} id="vv"/>
        <button onClick={() => {
          const nk = (document.getElementById('nv') as HTMLInputElement).value.trim();
          const nv = Number((document.getElementById('vv') as HTMLInputElement).value);
          if (nk) setVars(s => ({ ...s, [nk]: Number.isFinite(nv) ? nv : 0 }));
        }}>Variable hinzufügen</button>
      </div>

      <div className="row">
        <div>Ergebnis:</div>
        <div className="pill mono">{result}</div>
        <button onClick={save}>Speichern</button>
      </div>
    </div>
  );
}
