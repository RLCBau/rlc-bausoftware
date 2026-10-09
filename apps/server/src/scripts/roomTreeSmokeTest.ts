import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import {normalizeRoomTree,roomRevision} from "../domain/roomTree";
import {InputError} from "../domain/officeAddons";
const root={id:"room-building",parentId:null,nummer:"1",name:"Gebäude",sortOrder:0};
const room={id:"room-101",parentId:root.id,nummer:"101",name:"Raum 101",sortOrder:1};
assert.throws(()=>normalizeRoomTree({}),InputError);
assert.throws(()=>normalizeRoomTree({orte:[root,root],links:[]}),InputError);
assert.throws(()=>normalizeRoomTree({orte:[{...root,parentId:room.id},room],links:[]}),InputError);
assert.throws(()=>normalizeRoomTree({orte:[root],links:[{ortId:"foreign",positionId:"pos"}]}),InputError);
const parsed=normalizeRoomTree({orte:[root,room],links:[{ortId:room.id,positionId:"pos-1"},{ortId:room.id,positionId:"pos-1"}]});
assert.equal(parsed.links.length,1);
assert.equal(roomRevision([{...room,positions:[{positionId:"b"},{positionId:"a"}]},root]),roomRevision([root,{...room,positions:[{positionId:"a"},{positionId:"b"}]}]));
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_addon_validation_20261008";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.PROJECTS_ROOT="/tmp/rlc-room-test-projects";
const {prisma}=require("../lib/prisma");const router=require("../routes/aufmass").default;
async function main(){
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers["x-user"] || "addon-member",companyId:req.headers["x-company"] || "addon-test-a",companyRole:"BAULEITER"};next();});app.use("/aufmass",router);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
 async function call(method="GET",body?:any,headers:any={}){
  const res=await fetch("http://127.0.0.1:"+port+"/aufmass/orte/addon-project-a",{method,headers:{"Content-Type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json() as any};
 }
 try {
  const initial=await call();assert.equal(initial.status,200);assert.ok(initial.data.revision);
  const created=await call("PUT",{orte:[root,room],links:[{ortId:room.id,positionId:"pos-1"}],baseRevision:initial.data.revision});assert.equal(created.status,200,JSON.stringify(created.data));
  const before=await prisma.aufmassOrt.findUnique({where:{id:room.id}});
  assert.equal((await call("PUT",{})).status,400);
  assert.equal(await prisma.aufmassOrt.count(),2);
  assert.equal((await call("PUT",{orte:[{...root,parentId:room.id},room],links:[]})).status,400);
  assert.equal((await call("PUT",{orte:[root,root],links:[]})).status,400);
  const updated=await call("PUT",{orte:[root,{...room,name:"Raum 101 neu"}],links:[{ortId:room.id,positionId:"pos-1"}],baseRevision:created.data.revision});assert.equal(updated.status,200);
  const after=await prisma.aufmassOrt.findUnique({where:{id:room.id}});assert.equal(after.createdAt.getTime(),before.createdAt.getTime());
  assert.equal((await call("PUT",{orte:[],links:[],baseRevision:created.data.revision})).status,409);
  assert.equal(await prisma.aufmassOrt.count(),2);
  assert.equal((await call("GET",undefined,{"x-company":"addon-test-b"})).status,403);
  assert.equal((await call("GET",undefined,{"x-user":"addon-outsider"})).status,403);
  const saves=await Promise.all([call("PUT",{orte:[root,{...room,name:"Room A"}],links:[],baseRevision:updated.data.revision}),call("PUT",{orte:[root,{...room,name:"Room B"}],links:[],baseRevision:updated.data.revision})]);
  assert.deepEqual(saves.map(s=>s.status).sort(),[200,409]);
  console.log("PASS POSTGRESQL ROOM TREE: strict payloads, cycle/duplicate/link validation, tenant/member scopes, saved identities/timestamps preserved, revision conflicts, simultaneous writes, no empty-payload deletion.");
 } finally {await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(async(e:any)=>{console.error(e.message);await prisma.$disconnect();process.exitCode=1;});
