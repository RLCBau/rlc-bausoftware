import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
export default function Login() {
    const [email, setEmail] = useState('admin@rlc.local');
    const [password, setPassword] = useState('Admin!234');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    useEffect(() => {
        if (localStorage.getItem('rlc_token'))
            navigate('/');
    }, [navigate]);
    const login = async () => {
        try {
            const { data } = await api.post('/auth/login', { email, password });
            localStorage.setItem('rlc_token', data.token);
            navigate('/');
        }
        catch {
            setError('Login fehlgeschlagen');
        }
    };
    return (_jsxs("div", { style: { fontFamily: 'system-ui', padding: 24, maxWidth: 380 }, children: [_jsx("h1", { children: "RLC Login" }), _jsx("input", { value: email, onChange: e => setEmail(e.target.value), placeholder: "E-Mail", style: { width: '100%', marginBottom: 8, padding: 8 } }), _jsx("input", { value: password, onChange: e => setPassword(e.target.value), placeholder: "Passwort", type: "password", style: { width: '100%', marginBottom: 12, padding: 8 } }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: login, style: { flex: 1 }, children: "Einloggen" }), _jsx("button", { onClick: () => { setEmail('admin@rlc.local'); setPassword('Admin!234'); }, children: "Demo-Login" })] }), error && _jsx("div", { style: { color: 'crimson', marginTop: 10 }, children: error })] }));
}
