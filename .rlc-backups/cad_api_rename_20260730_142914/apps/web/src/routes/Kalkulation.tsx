import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function Kalkulation() {
  const subs = [
    { to: 'lv-import',  label: 'LV hochladen / erstellen' },
    { to: 'preise',     label: 'Preise & Mengen' },
    { to: 'angebot',    label: 'Angebot (Export)' },
    { to: 'versionen',  label: 'Versionsvergleich' },
  ];
  return (
    <div className="grid">
      <h2 style={{margin:0}}>Kalkulation</h2>
      <div className="row" style={{flexWrap:'wrap', gap:8}}>
        {subs.map(s => <Link key={s.to} className="tab" to={s.to}>{s.label}</Link>)}
      </div>
      <Outlet />
    </div>
  );
}
