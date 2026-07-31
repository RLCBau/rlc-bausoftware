import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [email, setEmail] = useState('admin@rlc.local');
  const [password, setPassword] = useState('Admin!234');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('rlc_token')) navigate('/');
  }, [navigate]);

  const login = async () => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('rlc_token', data.token);
      navigate('/');
    } catch {
      setError('Login fehlgeschlagen');
    }
  };

  return (
    <div style={{ fontFamily:'system-ui', padding:24, maxWidth:380 }}>
      <h1>RLC Login</h1>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-Mail" style={{width:'100%',marginBottom:8,padding:8}}/>
      <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Passwort" type="password" style={{width:'100%',marginBottom:12,padding:8}}/>
      <div style={{display:'flex', gap:8}}>
        <button onClick={login} style={{flex:1}}>Einloggen</button>
        <button onClick={()=>{setEmail('admin@rlc.local');setPassword('Admin!234');}}>Demo-Login</button>
      </div>
      {error && <div style={{color:'crimson', marginTop:10}}>{error}</div>}
    </div>
  );
}

