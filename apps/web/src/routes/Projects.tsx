import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

interface Project { id: string; code: string; name: string; }

export default function Projects() {
  const [list, setList] = useState<Project[]>([]);
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await api.get('/projects');
    setList(data);
  };
  useEffect(() => { load(); }, []);

  const createProject = async () => {
    const code = prompt('Projekt-Code (z.B. BAU-0003)');
    const name = prompt('Projekt-Name');
    if (!code || !name) return;
    await api.post('/projects', { code, name });
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Projekt wirklich löschen?')) return;
    await api.delete(`/projects/${id}`);
    load();
  };

  return (
    <div style={{ fontFamily:'system-ui', padding:24 }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 style={{margin:0}}>Projekte</h1>
        <div style={{display:'flex', gap:8}}>
          <button onClick={createProject}>+ Neues Projekt</button>
          <button onClick={()=>navigate('/')}>Zurück</button>
        </div>
      </div>
      <ul style={{marginTop:16}}>
        {list.map(p => (
          <li key={p.id} style={{display:'flex',gap:12,alignItems:'center'}}>
            <Link to={`/projects/${p.id}`}>{p.code} — {p.name}</Link>
            <button onClick={() => del(p.id)}>Löschen</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
