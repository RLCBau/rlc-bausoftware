import { PropsWithChildren } from "react";

export function Card({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <div className="card">
      {title && <div className="card-title">{title}</div>}
      {children}
    </div>
  );
}

export function Row({ children }: PropsWithChildren) {
  return <div className="toolbar">{children}</div>;
}


export function Collapsible(p: PropsWithChildren<{title:string; defaultOpen?:boolean}>){
  const [open,set] = useState(!!p.defaultOpen);
  return (
    <div className="card" style={{marginBottom:12}}>
      <div className="card-h" style={{cursor:'pointer'}} onClick={()=>set(o=>!o)}>
        {p.title} {open? '▾':'▸'}
      </div>
      {open && <div className="card-b">{p.children}</div>}
    </div>
  );
}
