import{PrismaClient}from'@prisma/client';const p=new PrismaClient();
const q=[['GAEB-31100-3112-01-1-25-ERDARBEITEN','2512'],['GAEB-GAEB-WL-BAU-HOTZLING','0201   3']];
(async()=>{for(const [code,pos] of q){const pr=await p.project.findFirst({where:{code},select:{lvSets:{take:1,orderBy:{version:'desc'},select:{positions:{where:{position:pos},select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true,x84UnitPrice:true}}}}}});console.log('\n'+code+' '+pos);console.log(JSON.stringify(pr?.lvSets[0]?.positions,null,2));}await p.$disconnect()})()
