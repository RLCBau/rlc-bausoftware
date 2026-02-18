import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function Massenermittlung() {
  const subs = [
    { to: 'calc',   label: 'Rechnerische Massen' },
    { to: 'regie',  label: 'Regieberichte' },
    { to: 'ddt',    label: 'Lieferscheine' },
  ];
  return (
    <div className="grid">
      <h2 style={{margin:0}}>Mengenermittlung</h2>
      <div className="row" style={{flexWrap:'wrap', gap:8}}>
        {subs.map(s => <Link key={s.to} className="tab" to={s.to}>{s.label}</Link>)}
      </div>
      <Outlet />
    </div>
  );
}

