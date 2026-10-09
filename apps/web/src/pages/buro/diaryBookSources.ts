export function diaryBookSources(official:any[],inbox:any[]){
 const key=(r:any)=>String(r.sourceDocId||r.docId||r.id||r.rows?.[0]?.sourceDocId||r.rows?.[0]?.id||r.filename||'');
 const approved=official.filter(r=>String(r.workflowStatus||'').toUpperCase()==='FREIGEGEBEN').map(r=>({...r,official:true}));
 const ids=new Set(approved.map(key));
 const drafts=inbox.filter(r=>{const inner=r.rows?.[0]||r;return String(r.reportType||inner.reportType||'').toUpperCase()==='TAGESBERICHT'&&Boolean(r.inBautagebuch||inner.inBautagebuch||r.bautagebuchTransferredAt||inner.bautagebuchTransferredAt)&&!ids.has(key(r));}).map(r=>({...r,official:false}));
 return [...approved,...drafts];
}
