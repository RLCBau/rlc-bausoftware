const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const s3=require('@aws-sdk/client-s3');
const items=new Map();let seq=0;let tamper=false;
class S3StorageProvider {}
const mockProvider=new S3StorageProvider();
mockProvider.client={send:async cmd=>{
 const v=cmd.input||{};
 if(cmd instanceof s3.GetObjectLockConfigurationCommand)return {ObjectLockConfiguration:{ObjectLockEnabled:'Enabled'}};
 if(cmd instanceof s3.GetBucketVersioningCommand)return {Status:'Enabled'};
 if(cmd instanceof s3.PutObjectCommand){const ver='test-version-'+(++seq);items.set(v.Key,{data:Buffer.from(v.Body),ver,until:v.ObjectLockRetainUntilDate});return {VersionId:ver};}
 if(cmd instanceof s3.GetObjectRetentionCommand){const e=items.get(v.Key);if(!e)return {};return {Retention:{Mode:'COMPLIANCE',RetainUntilDate:e.until}};}
 if(cmd instanceof s3.GetObjectCommand){const e=items.get(v.Key);const data=tamper?Buffer.from('tampered'):e.data;return {ContentLength:data.length,Body:{transformToByteArray:async()=>Uint8Array.from(data)}};}
 if(cmd instanceof s3.ListObjectVersionsCommand)return {Versions:[...items.keys()].filter(x=>x.startsWith(v.Prefix)).map(Key=>({Key}))};
 throw Error('UNEXPECTED_S3_'+cmd.constructor.name);
}};
const modulePath=path.resolve('src/services/fiscalWormArchive.ts'),src=fs.readFileSync(modulePath,'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
const m=new Module(modulePath,module);m.filename=modulePath;m.paths=Module._nodeModulePaths(path.dirname(modulePath));
m.require=name=>name==='../storage/storageService'?{storage:mockProvider,storageConfig:{provider:'s3'}}:name==='../storage/providers/s3StorageProvider'?{S3StorageProvider}:require(name);
m._compile(js,modulePath);
(async()=>{
const data=Buffer.from('FAKE-INVOICE-2026');const target='/tmp/rlc-worm-isolated-fixture.txt';fs.writeFileSync(target,data);
const sha=crypto.createHash('sha256').update(data).digest('hex');
const until=new Date(Date.UTC(new Date().getUTCFullYear()+9,11,31)).toISOString();
const input={projectId:'TEST-COMPANY-A',invoiceId:'TEST-INV-1',files:[{filePath:target,name:'invoice.xml',sha256:sha}],retentionUntil:until};
const result=await m.exports.archiveFiscalWorm(input);assert.equal(result.length,1);assert.equal(result[0].sha256,sha);
assert.equal(await m.exports.verifyFiscalWormEvidence(result,'fiscal/TEST-COMPANY-A/TEST-INV-1/'),1);
const companyB=await m.exports.archiveFiscalWorm({...input,projectId:'TEST-COMPANY-B',invoiceId:'TEST-INV-2'});
assert.equal(await m.exports.verifyFiscalWormEvidence(companyB,'fiscal/TEST-COMPANY-B/TEST-INV-2/'),1);
await assert.rejects(()=>m.exports.verifyFiscalWormEvidence(companyB,'fiscal/TEST-COMPANY-A/TEST-INV-1/'),/NAMESPACE/);
await assert.rejects(()=>m.exports.verifyFiscalWormEvidence(result,'fiscal/TEST-COMPANY-B/'),/NAMESPACE/);
tamper=true;await assert.rejects(()=>m.exports.verifyFiscalWormEvidence(result,'fiscal/TEST-COMPANY-A/TEST-INV-1/'),/HASH_MISMATCH/);tamper=false;
await assert.rejects(()=>m.exports.archiveFiscalWorm({...input,projectId:'../BAD'}),/INVALID_INVOICE_NAMESPACE/);
await assert.rejects(()=>m.exports.archiveFiscalWorm({...input,files:[{...input.files[0],sha256:'0'.repeat(64)}]}),/SOURCE_HASH_MISMATCH/);
assert.equal(items.size,2);
fs.unlinkSync(target);
console.log('PASS WORM ISOLATED: COMPLIANCE, readback SHA256, tenant isolation, tamper/hash/path rejects; NO REAL S3 WRITE');
})().catch(e=>{console.error(e);process.exitCode=1;});
