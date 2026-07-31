import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
export default function Projects() {
    const [list, setList] = useState([]);
    const navigate = useNavigate();
    const load = async () => {
        const { data } = await api.get('/projects');
        setList(data);
    };
    useEffect(() => { load(); }, []);
    const createProject = async () => {
        const code = prompt('Projekt-Code (z.B. BAU-0003)');
        const name = prompt('Projekt-Name');
        if (!code || !name)
            return;
        await api.post('/projects', { code, name });
        load();
    };
    const del = async (id) => {
        if (!confirm('Projekt wirklich löschen?'))
            return;
        await api.delete(`/projects/${id}`);
        load();
    };
    return (_jsxs("div", { style: { fontFamily: 'system-ui', padding: 24 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("h1", { style: { margin: 0 }, children: "Projekte" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: createProject, children: "+ Neues Projekt" }), _jsx("button", { onClick: () => navigate('/'), children: "Zur\u00FCck" })] })] }), _jsx("ul", { style: { marginTop: 16 }, children: list.map(p => (_jsxs("li", { style: { display: 'flex', gap: 12, alignItems: 'center' }, children: [_jsxs(Link, { to: `/projects/${p.id}`, children: [p.code, " \u2014 ", p.name] }), _jsx("button", { onClick: () => del(p.id), children: "L\u00F6schen" })] }, p.id))) })] }));
}
