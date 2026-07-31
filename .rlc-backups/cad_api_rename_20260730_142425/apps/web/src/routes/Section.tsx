import React from 'react';
import { useParams, Link } from 'react-router-dom';

const titles: Record<string,string> = {
  kalkulation: 'Kalkulation',
  massenermittlung: 'Massenermittlung',
  cad: 'CAD',
  buero: 'Büro / Verwaltung',
  ki: 'KI',
  info: 'Info / Hilfe',
  buchhaltung: 'Buchhaltung'
};

export default function Section() {
  const { section } = useParams();
  const title = titles[section || ''] || 'Bereich';

  return (
    <div style={{ fontFamily:'system-ui', padding:24 }}>
      <h1>{title}</h1>
      <p>Placeholder-Seite für <b>{title}</b>. Hier kommen die echten Unterseiten rein.</p>
      <Link to="/">← Zurück zum Start</Link>
    </div>
  );
}
