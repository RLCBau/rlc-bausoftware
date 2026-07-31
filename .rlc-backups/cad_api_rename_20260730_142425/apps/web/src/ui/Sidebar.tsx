import { NavLink } from "react-router-dom";


export default function Sidebar() {
  return (
    <aside style={{width: 300, padding: 12, borderRight: '1px solid var(--border)', height: '100vh', overflowY:'auto'}}>
      {SECTIONS.map(m => (
        <div key={m.id} style={{marginBottom: 16}}>
          <div style={{fontWeight:700, marginBottom: 8}}>{m.emoji} {m.title}</div>
          <ul style={{listStyle:'none', padding:0, margin:0}}>
            {m.subs.map(s => (
              <li key={s.id} style={{marginBottom: 6}}>
                <NavLink
                  to={`/${m.id}/${s.id}`}
                  className={({isActive}) => `link ${isActive ? 'active' : ''}`}
                >
                  {s.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
