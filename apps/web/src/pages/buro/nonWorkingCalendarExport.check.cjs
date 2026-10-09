const assert=require('node:assert/strict');const {nonWorkingCSV,nonWorkingICS}=require(process.argv[2]);
const active={id:'test-id',date:'2028-02-29',title:'Ä'.repeat(80)+'; Grüße, Test',kind:'BETRIEBSRUHE',location:'Standort',notes:'Zeile 1\rBEGIN:VEVENT\nZeile 2\\',active:true};
const archived={...active,id:'archived-id',title:'Archived',active:false};
const output=nonWorkingICS([active,archived],new Date('2026-10-09T10:00:00Z'));const unfolded=output.replace(/\r\n /g,'');
assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301'));assert.ok(unfolded.includes('DTSTAMP:20261009T100000Z'));assert.ok(unfolded.includes('SUMMARY:'+'Ä'.repeat(80)+'\\; Grüße\\, Test'));assert.ok(unfolded.includes('Zeile 1\\nBEGIN:VEVENT\\nZeile 2\\\\'));assert.equal(output.includes('archived-id'),false);assert.equal(output.split('BEGIN:VEVENT').length,3);for(const line of output.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
const csv=nonWorkingCSV([{...active,title:'  =HYPERLINK("x")'},archived]);assert.ok(csv.includes('"\'  =HYPERLINK(""x"")"'));assert.ok(csv.includes('Archiviert'));assert.ok(csv.startsWith('\uFEFF'));
console.log('PASS non-working calendar exports: all-day exclusive end/leap date, escaped line breaks/punctuation, UTF-8 75-byte folding, stable UID/time, archived entries excluded from ICS, CSV formula protection.');
