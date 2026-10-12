const fs=require('fs');
const input='/tmp/rlc-v3-152-technical-audit.json';
const data=JSON.parse(fs.readFileSync(input,'utf8'));
const entries=data.sourceInventory.entries;
const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
const rows=[['Prioritaet','Ressourcengruppe','Ressourcenname','Einheit','EP_Ressource_EUR','Vorkommen','Quellenstatus','Nachweis_erforderlich','Pruefstatus']];
for(let i=0;i<entries.length;i++){
 const e=entries[i];
 const evidence=e.group==='Lohn'?'Tarif/Arbeitszeit + Arbeitgeberkosten + Leistungsansatz':e.group==='Maschinen'?'Geräteverrechnungssatz + Zeitansatz + Betriebsstoff':e.group==='Material'?'Lieferantenangebot/Preisliste + technische Spezifikation':e.group==='Entsorgung'?'AVV + Entsorgungsgebühren + Transportdistanz':'Angebot + Leistungsumfang';
 rows.push([i+1,e.group,e.name,e.unit,e.unitPrice,e.withoutNotes,e.sourceStatus,evidence,'OFFEN']);
}
const file='/tmp/rlc-36-resource-evidence-backlog.csv';
fs.writeFileSync(file,'\ufeff'+rows.map(r=>r.map(csv).join(';')).join('\n')+'\n');
const byGroup={};for(const e of entries){(byGroup[e.group]??={positions:0,unique:0}).positions+=e.withoutNotes;byGroup[e.group].unique++;}
console.log(JSON.stringify({file,unique:entries.length,occurrences:entries.reduce((n,e)=>n+e.withoutNotes,0),byGroup,epChanged:0}));
