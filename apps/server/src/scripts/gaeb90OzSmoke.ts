import {buildGaeb90} from '../gaeb/gaeb90';
import iconv from 'iconv-lite';
const rows:any[]=[
 {posNr:'01.01.0001',kurztext:'A',langtext:'Lang A',einheit:'m',menge:1,preis:10},
 {posNr:'01.01.0002',kurztext:'B',langtext:'Lang B',einheit:'St',menge:2,preis:20},
 {posNr:'NA_01',kurztext:'Nachtrag',langtext:'Lang N',einheit:'m2',menge:3,preis:30}
];
const txt=buildGaeb90({format:'D84',rows,project:{code:'BA-2026-028',name:'Test'},company:{name:'RLC Bausoftware Lo Curto',address:'Bahnhofstraße 26, 83435 Bad Reichenhall'},owner:{name:'Lo Curto',street:'Hochkalterstr. 7',pcode:'83483',city:'Bischofswiesen'}});
const buf=iconv.encode(txt,'cp850');
const decoded=iconv.decode(buf,'cp850');
const lines=decoded.split(/\r?\n/).filter(Boolean);
console.log('ALL_80=', lines.every(x=>Buffer.from(x,'latin1').length===80));
console.log('REC11=',lines.filter(x=>x.startsWith('11')).length,'REC12=',lines.filter(x=>x.startsWith('12')).length,'REC31=',lines.filter(x=>x.startsWith('31')).length);
for(const l of lines.filter(x=>x.startsWith('21')||x.includes('RLC-Original-OZ'))) console.log(l);
