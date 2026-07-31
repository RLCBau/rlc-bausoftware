import { Link, useParams } from "react-router-dom";
import { Card } from "../ui/kit";

export default function SectionIndex(){
  const { macro } = useParams();
  const m = SECTIONS.find(x => x.id === macro);
  if(!m) return <p className="muted">Sezione non trovata.</p>;
  return (
    <Card title={m.emoji + " " + m.title}>
      <ul>
        {m.subs.map(s => (
          <li key={s.id} style={{marginBottom:8}}>
            <Link to={`/${m.id}/${s.id}`}>{s.title}</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
