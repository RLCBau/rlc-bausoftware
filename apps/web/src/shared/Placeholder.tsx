export default function Placeholder({title}:{title:string}) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="muted">Inhalt folgt – Struktur bleibt fix.</div>
    </div>
  );
}
