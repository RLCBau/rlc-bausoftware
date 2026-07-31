import { RlcUser } from "./types";
const KEY="rlc-users-db";
const load=():RlcUser[]=>JSON.parse(localStorage.getItem(KEY)||"[]");
const save=(a:RlcUser[])=>localStorage.setItem(KEY,JSON.stringify(a));

export const UserDB={
  list():RlcUser[]{return load().sort((a,b)=>a.name.localeCompare(b.name));},
  create():RlcUser{
    const u:{id:string,name:string,email:string,role:string,active:boolean,rights:string[]}={
      id:crypto.randomUUID(),name:"",email:"",role:"Mitarbeiter",active:true,rights:[]
    };
    const all=load();all.push(u);save(all);return u;
  },
  remove(id:string){save(load().filter(x=>x.id!==id));},
  upsert(u:RlcUser){const all=load();const i=all.findIndex(x=>x.id===u.id);
    if(i>=0)all[i]=u;else all.push(u);save(all);}
};
