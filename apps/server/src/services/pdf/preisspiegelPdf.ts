import PDFDocument from 'pdfkit';
import fs from 'fs';
import {RLC_PDF_THEME as theme,drawRlcHeader,drawRlcFooter} from './rlcPdfCore';
import {InputError} from '../../domain/officeAddons';
const clean=(v:any)=>String(v??'').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').replace(/\t/g,' ');
function decimal(v:any){const [a,b]=String(v??'').split('.');return a.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(b?','+b:'');}
const eur=(v:any)=>v==null?'Nicht vergleichbar':decimal(v)+' EUR';
export async function preisspiegelPdf(source:any,createdAt=new Date()):Promise<Buffer>{
 const {comparison:c,snapshot:s}=source;
 if(c.positions.length>500||c.offers.length>20)throw new InputError('PDF auf höchstens 500 Positionen und 20 Angebote begrenzt. Vergabepaket eingrenzen.');
 const doc=new PDFDocument({size:'A4',layout:'landscape',bufferPages:true,margins:{top:28,right:34,bottom:24,left:34},info:{Title:'Preisspiegel',Author:s.companyName,Creator:'RLC Bausoftware',Subject:'Gespeicherter Angebotsvergleich '+s.packageKey}});
 const chunks:Buffer[]=[];let bytes=0;
 const result=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>20*1024*1024){reject(new InputError('PDF zu groß. Vergabepaket eingrenzen.'));(doc as any).destroy();}else chunks.push(b);});doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 // Register source only from a fixed installed font path, without company/global file discovery.
 const regular='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
 if(fs.existsSync(regular)&&fs.existsSync(bold)){doc.registerFont('Body',regular);doc.registerFont('BodyBold',bold);}else{doc.registerFont('Body','Helvetica');doc.registerFont('BodyBold','Helvetica-Bold');}
 const date=createdAt.toISOString().slice(0,10),label=s.project.code||s.project.id,left=34,right=doc.page.width-34,bottom=doc.page.height-64;
 let y=0,pageCount=0,currentGroup:any[]=[],groupIndex=0;
 const groups=[];for(let i=0;i<c.offers.length;i+=4)groups.push(c.offers.slice(i,i+4));
 const widths=()=>[72,190,76,...currentGroup.map(()=>((right-left)-338)/currentGroup.length)];
 function lines(v:any,width:number,size=8,bold=false){
  doc.font(bold?'BodyBold':'Body').fontSize(size);
  const out:string[]=[];
  for(const paragraph of clean(v).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;const candidate=line?line+' '+word:word;if(doc.widthOfString(candidate)<=width){line=candidate;continue;}if(line){out.push(line);line='';}for(const ch of word){if(line&&doc.widthOfString(line+ch)>width){out.push(line);line='';}line+=ch;}}out.push(line);}
  return out.length?out:[''];
 }
 function cellLines(values:any[],ws:number[],size:number,bold=false){return values.map((v,i)=>lines(v,ws[i]-12,size,bold));}
 function paint(rows:string[][],ws:number[],offset:number,count:number,size:number,bold:boolean,fill:string){
  const height=count*(size+3)+12;let x=left;
  for(let i=0;i<ws.length;i++){doc.rect(x,y,ws[i],height).fillAndStroke(fill,theme.line);doc.fillColor(theme.text).font(bold?'BodyBold':'Body').fontSize(size);for(let n=0;n<count;n++){const value=rows[i][offset+n];if(value)doc.text(value,x+6,y+6+n*(size+3),{width:ws[i]-12,lineBreak:false});}x+=ws[i];}
  y+=height;
 }
 function startPage(){
  if(++pageCount>500)throw new InputError('PDF zu umfangreich. Vergabepaket eingrenzen.');
  if(pageCount>1)doc.addPage();
  drawRlcHeader(doc,{name:clean(s.companyName)},'Preisspiegel',label,date);
  doc.fillColor(theme.text).font('BodyBold').fontSize(9).text(clean(s.project.name),left,115,{width:right-left,lineBreak:false,ellipsis:true});
  const text='Paket '+s.packageKey+' | '+s.kind+' | Anbietergruppe '+(groupIndex+1)+'/'+groups.length;
  doc.font('Body').fontSize(8).text(clean(text),left,132,{width:right-left,lineBreak:false,ellipsis:true});
  doc.fillColor(theme.muted).fontSize(7).text('Stand '+createdAt.toLocaleString('de-DE',{timeZone:'Europe/Berlin'})+' (Berlin) | Quelle '+s.fingerprint.slice(0,16),left,147,{lineBreak:false});
  y=165;
  const labels=['Position','Kurztext','Bezugsmenge / Einheit',...currentGroup.map((b:any)=>b.supplier+'\n'+b.title+'\n'+b.status+' | '+b.discountPercent+' % Nachlass')];
  const header=cellLines(labels,widths(),8,true);
  const height=Math.max(...header.map(r=>r.length));
  // Very long supplier/title values go in a complete appendix; table headers stay compact.
  const compact=header.map(r=>r.length>5?[...r.slice(0,4),'... (Anbieterblatt)']:r);
  paint(compact,widths(),0,Math.min(5,height),8,true,theme.blueSoft);
 }
 function row(values:any[],ws=widths(),size=8,bold=false,fill:string=theme.white){
  const rows=cellLines(values,ws,size,bold),max=Math.max(...rows.map(r=>r.length));let offset=0;
  const fullHeight=max*(size+3)+12;
  if(fullHeight<=bottom-235&&y+fullHeight>bottom)startPage();
  while(offset<max){const fit=Math.floor((bottom-y-12)/(size+3));if(fit<1){startPage();continue;}const count=Math.min(fit,max-offset);paint(rows,ws,offset,count,size,bold,fill);offset+=count;if(offset<max)startPage();}
 }
 try{
  for(let group=0;group<groups.length;group++){
   currentGroup=groups[group];groupIndex=group;startPage();
   for(let i=0;i<c.positions.length;i++){
    const p=c.positions[i];row([p.position,p.title,decimal(p.quantity)+' '+p.unit,...currentGroup.map((b:any)=>{const cell=b.cells[i];return cell?.comparable?'EP '+eur(cell.unitPrice)+'\nGP '+eur(cell.amount)+(cell.quantityDiff?'\nMenge abweichend':'')+(cell.textDiff?'\nText abweichend':''):cell?.reason||'Fehlt';})],widths(),8,false,i%2?theme.background:theme.white);
   }
   row(['Vergleichssumme netto',...currentGroup.map((b:any)=>eur(b.normalizedTotal))],[338,...widths().slice(3)],8,true,theme.blueSoft);
   row(['Eigene Angebotsmenge',...currentGroup.map((b:any)=>eur(b.offeredTotal))],[338,...widths().slice(3)]);
   row(['Rang / Auswahl',...currentGroup.map((b:any)=>{const rank=c.ranking.find((r:any)=>r.id===b.id);return (rank?'Rang '+rank.rank:'Ohne Rang')+(b.awardedAt?'\nAusgewählt':'');})],[338,...widths().slice(3)]);
   row(['Berechnung / Hinweise','GP = Bezugsmenge x EP, positionsweise auf Cent gerundet. Nachlass wird einmal auf die Summe angewandt.','Netto / EUR',...currentGroup.map((b:any)=>b.issues.length?b.issues.join('\n'):'Vollständig vergleichbar')],widths(),7);
   for(const b of currentGroup){const revision=s.revisions.find((r:any)=>r.id===b.id);row(['Anbieterblatt',b.supplier+'\n'+b.title,b.status,...currentGroup.map((x:any)=>x.id===b.id?'Revision '+revision.revision+'\n'+revision.updatedAt+'\nNachlass '+b.discountPercent+' %'+(b.awardedAt?'\nAusgewählt':''):'')],widths(),8);}
  }
  row(['Grundlage','Vergleich nach Position und Einheit auf den Mengen der gewählten Basis. Mengen- und Textabweichungen ausdrücklich prüfen. Entwürfe und unvollständige Angebote haben keinen Rang. Keine automatische Vergabe oder Vertragsänderung.','Basis-ID',...currentGroup.map((_:any)=>s.baselineId)],widths(),7);
  row(['Quellnachweis',s.fingerprint,'SHA-256',...currentGroup.map(()=> '')],widths(),7);
  const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(range.start+i);drawRlcFooter(doc,'Preisspiegel',label,date,i+1,range.count);}
  doc.end();
 }catch(e){(doc as any).destroy();throw e;}
 return result;
}
