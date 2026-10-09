import { PrismaClient } from "@prisma/client";
const prisma=new PrismaClient();
(async()=>{
 const codes=["GAEB-24-020742","GAEB-21118-04-LV","GAEB-21118-05-LV-BA-4-SULZBACHER-STRASSE"];
 for(const code of codes){
  const p=await prisma.project.findFirst({where:{code},select:{code:true,lvSets:{take:1,orderBy:{version:"desc"},select:{positions:{orderBy:{position:"asc"},select:{position:true,kurztext:true,langtext:true,einheit:true}}}}}});
  console.log("\nPROJECT",code);
  const rows=p?.lvSets[0]?.positions||[];
  rows.forEach((r:any,i:number)=>{
    const t=String(r.kurztext||"").toLowerCase();
    if(t.includes("senkrecht")||t.includes("wie vorherige")){
      for(let j=Math.max(0,i-5);j<=Math.min(rows.length-1,i+1);j++){
        const x:any=rows[j];
        console.log(j,x.position,x.einheit,String(x.kurztext||"").slice(0,120),"||",String(x.langtext||"").slice(0,180).replace(/\s+/g," "));
      }
      console.log("---");
    }
  });
 }
 await prisma.$disconnect();
})();