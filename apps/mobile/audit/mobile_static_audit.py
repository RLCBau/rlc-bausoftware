from pathlib import Path
import re, json, hashlib, datetime

root = Path(r"C:\RLC\rlc-app\apps\mobile")
src = root / "src"
files = sorted([p for p in src.rglob("*") if p.suffix in {".ts",".tsx"}])
api_file = src / "lib" / "api.ts"
types_file = src / "navigation" / "types.ts"

def read(p):
    return p.read_text(encoding="utf-8-sig", errors="replace")

api_text = read(api_file)
types_text = read(types_file)

route_block = re.search(r"export type RootStackParamList\s*=\s*\{(.*?)\n\};", types_text, re.S)
routes = set()
if route_block:
    for m in re.finditer(r"^\s{2}([A-Za-z0-9_]+)\s*:", route_block.group(1), re.M):
        routes.add(m.group(1))

api_method_candidates = set(re.findall(r"\b(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(", api_text))
api_method_candidates |= set(re.findall(r"^\s{2}([A-Za-z_$][\w$]*)\s*:", api_text, re.M))

records=[]
used_routes=set()
used_api=set()
direct_fetch=[]
http_literals=[]
async_sensitive=[]
console_logs=[]
todos=[]
expo_sensitive=[]

for p in files:
    txt=read(p)
    rel=str(p.relative_to(root)).replace("\\","/")
    flags=[]
    nav=set(re.findall(r"navigation\.(?:navigate|replace|push)\(\s*[\"']([A-Za-z0-9_]+)[\"']", txt))
    if nav:
        used_routes |= nav
        bad=sorted(nav-routes)
        if bad: flags.append("NAV_UNDECLARED:"+",".join(bad))
    api_calls=set(re.findall(r"\bapi\.([A-Za-z_$][\w$]*)", txt))
    if api_calls:
        used_api |= api_calls
        missing=sorted([x for x in api_calls if x not in api_method_candidates])
        if missing: flags.append("API_UNRESOLVED:"+",".join(missing))
    if p != api_file and re.search(r"\bfetch\s*\(", txt):
        cnt=len(re.findall(r"\bfetch\s*\(", txt))
        direct_fetch.append((rel,cnt))
        flags.append(f"DIRECT_FETCH:{cnt}")
    urls=re.findall(r"[\"'](http://[^\"']+)[\"']", txt)
    if urls:
        http_literals.extend((rel,u) for u in urls)
        flags.append("HTTP_LITERAL")
    for m in re.finditer(r"AsyncStorage\.(?:setItem|getItem|multiSet)\([^\n]{0,160}", txt):
        frag=m.group(0)
        if re.search(r"token|password|passwort|secret|credential|auth_", frag, re.I):
            async_sensitive.append((rel, frag.strip()[:200]))
    cl=len(re.findall(r"\bconsole\.(?:log|debug|warn|error)\s*\(", txt))
    if cl:
        console_logs.append((rel,cl))
        flags.append(f"CONSOLE:{cl}")
    td=len(re.findall(r"TODO|FIXME|HACK|XXX", txt, re.I))
    if td:
        todos.append((rel,td))
        flags.append(f"TODO:{td}")
    sens=[]
    for name in ["Location","Camera","ImagePicker","DocumentPicker","FileSystem","SecureStore","WebBrowser","MailComposer","Sharing","Print"]:
        if name in txt: sens.append(name)
    if sens:
        expo_sensitive.append((rel,sens))
        flags.append("DEVICE_API:"+",".join(sens))
    sha=hashlib.sha256(txt.encode("utf-8",errors="replace")).hexdigest()[:16]
    records.append({"file":rel,"lines":txt.count("\n")+1,"sha16":sha,"flags":flags})

undeclared_routes=sorted(used_routes-routes)
unresolved_api=sorted([x for x in used_api if x not in api_method_candidates])

summary={
 "generated":datetime.datetime.now().isoformat(),
 "files_scanned":len(records),
 "lines_scanned":sum(r["lines"] for r in records),
 "routes_declared":len(routes),
 "routes_used":len(used_routes),
 "undeclared_routes":undeclared_routes,
 "api_members_used":len(used_api),
 "api_members_unresolved":unresolved_api,
 "direct_fetch_files":direct_fetch,
 "http_literals":http_literals,
 "asyncstorage_sensitive_refs":async_sensitive,
 "console_log_files":console_logs,
 "todo_files":todos,
 "device_api_files":expo_sensitive,
}

outdir=root/"audit"
outdir.mkdir(exist_ok=True)
(outdir/"mobile-static-audit-20261016.json").write_text(json.dumps({"summary":summary,"files":records},indent=2,ensure_ascii=False),encoding="utf-8")

md=[]
md.append("# RLC Mobile – Static File-by-File Audit")
md.append("")
md.append(f"Generated: {summary['generated']}")
md.append(f"Files scanned: **{summary['files_scanned']}**; lines: **{summary['lines_scanned']}**")
md.append("")
md.append("## Structural checks")
md.append(f"- Navigation routes declared: {summary['routes_declared']}; used: {summary['routes_used']}; undeclared: {undeclared_routes or 'none'}")
md.append(f"- API members used: {summary['api_members_used']}; unresolved static references: {unresolved_api or 'none'}")
md.append(f"- Files with direct fetch outside api.ts: {len(direct_fetch)}")
md.append(f"- Hardcoded http:// literals: {len(http_literals)}")
md.append(f"- Sensitive AsyncStorage references requiring review: {len(async_sensitive)}")
md.append(f"- Console logging files: {len(console_logs)}")
md.append(f"- TODO/FIXME files: {len(todos)}")
md.append("")
md.append("## File-by-file")
md.append("| File | Lines | SHA16 | Flags |")
md.append("|---|---:|---|---|")
for r in records:
    flags=", ".join(r["flags"]) if r["flags"] else "OK-static"
    md.append(f"| {r['file']} | {r['lines']} | {r['sha16']} | {flags} |")
md.append("")
md.append("## Direct fetch outside central API")
for rel,cnt in direct_fetch:
    md.append(f"- {rel}: {cnt}")
md.append("")
md.append("## Sensitive AsyncStorage references")
for rel,frag in async_sensitive:
    md.append(f"- {rel}: {frag}")
(outdir/"MOBILE_STATIC_AUDIT_20261016.md").write_text("\n".join(md),encoding="utf-8")
print(json.dumps(summary,indent=2,ensure_ascii=False))
