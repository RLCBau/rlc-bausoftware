const API = (path) => `https://api.rlcbausoftware.com${path}`;
export async function apiGet(path) {
    const r = await fetch(API(path), { credentials: "include" });
    if (!r.ok)
        throw new Error(await r.text());
    return r.json();
}
export async function apiPost(path, body) {
    const r = await fetch(API(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
    });
    if (!r.ok)
        throw new Error(await r.text());
    return r.json();
}
export async function apiPut(path, body) {
    const r = await fetch(API(path), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
    });
    if (!r.ok)
        throw new Error(await r.text());
    return r.json();
}
