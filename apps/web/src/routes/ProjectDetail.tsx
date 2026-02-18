import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';

type Project = { id: string; code: string; name: string; createdAt?: string };

export default function ProjectDetail() {
  const { id } = useParams();
  const [p, setP] = useState<Project | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await api.get(`/projects/${id}`);
      setP(data);
    })();
  }, [id]);

  if (!p) return <div style={{padding:24,fontFamily:'system-ui'}}>Lade…</div>;

  return (
    <div style={{ fontFamily:'system-ui', padding:24 }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 style={{margin:0}}>{p.code} — {p.name}</h1>
        <div style={{display:'flex', gap:8}}>
          <Link to="/projects">Zur Liste</Link>
          <button onClick={()=>navigate('/')}>Start</button>
        </div>
      </div>
      <div style={{marginTop:16,opacity:.8,fontSize:14}}>
        ID: {p.id}<br/>
        Erstellt: {p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}
      </div>
    </div>
  );
}



