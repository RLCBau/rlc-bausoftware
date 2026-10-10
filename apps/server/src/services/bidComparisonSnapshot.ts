import {compareBids,bidInput} from '../domain/preisspiegel';
import {InputError} from '../domain/officeAddons';
import {planVersion} from './constructionPlan';
export async function bidComparisonSnapshot(tx:any,companyId:string,baselineId:string){
 const baseline=await tx.projectBid.findFirst({where:{id:baselineId,companyId,status:{not:'Archiviert'}}});
 if(!baseline)throw new InputError('Vergleichsbasis nicht verfügbar.');
 const project=await tx.project.findFirst({where:{id:baseline.projectId,companyId},select:{id:true,code:true,name:true}});
 const company=await tx.company.findUnique({where:{id:companyId},select:{id:true,name:true}});
 if(!project||!company)throw new InputError('Projekt nicht verfügbar.');
 const bids=await tx.projectBid.findMany({where:{companyId,projectId:baseline.projectId,packageKey:baseline.packageKey,kind:baseline.kind,status:{not:'Archiviert'}},orderBy:{id:'asc'},take:101});
 if(bids.length>100)throw new InputError('Vergabepaket auf höchstens 100 Angebote eingrenzen.');
 let positions=0;for(const b of bids){bidInput({...b,discountPercent:String(b.discountPercent)});positions+=(b.positions as any[]).length;}
 if(positions>100000||bids.length*(baseline.positions as any[]).length>100000)throw new InputError('Vergabepaket zu groß für Vergleich. Bitte eingrenzen.');
 const comparison=compareBids(bids,baseline.id);
 const snapshot={fingerprint:planVersion({project,company,bids}),baselineId:baseline.id,project,companyName:company.name,packageKey:baseline.packageKey,kind:baseline.kind,revisions:bids.map((b:any)=>({id:b.id,revision:b.revision,updatedAt:b.updatedAt.toISOString()}))};
 return {comparison,snapshot,bids,company};
}
