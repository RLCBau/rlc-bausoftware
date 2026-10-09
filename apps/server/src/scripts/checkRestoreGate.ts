import { prisma } from "../lib/prisma";
import { checkRestoredErasureState } from "../lib/erasureLedger";

async function main(){
  const result=await checkRestoredErasureState(prisma);
  if(!result.ready){
    console.error("RESTORE_GATE_BLOCKED",result.error||"UNKNOWN");
    process.exitCode=2;
  }else{
    console.log("RESTORE_GATE_PASS checked="+result.checked);
  }
}
main().catch(err=>{console.error("RESTORE_GATE_ERROR",err?.message||"unknown");process.exitCode=2}).finally(()=>prisma.$disconnect());
