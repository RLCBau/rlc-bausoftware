import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
export default function ProjectDetail() {
    const { id } = useParams();
    const [p, setP] = useState(null);
    const navigate = useNavigate();
    useEffect(() => {
        (async () => {
            const { data } = await api.get(`/projects/${id}`);
            setP(data);
        })();
    }, [id]);
    if (!p)
        return _jsx("div", { style: { padding: 24, fontFamily: 'system-ui' }, children: "Lade\u2026" });
    return (_jsxs("div", { style: { fontFamily: 'system-ui', padding: 24 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("h1", { style: { margin: 0 }, children: [p.code, " \u2014 ", p.name] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(Link, { to: "/projects", children: "Zur Liste" }), _jsx("button", { onClick: () => navigate('/'), children: "Start" })] })] }), _jsxs("div", { style: { marginTop: 16, opacity: .8, fontSize: 14 }, children: ["ID: ", p.id, _jsx("br", {}), "Erstellt: ", p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'] })] }));
}
