const assert = require('node:assert/strict');
const {create, buildScript} = require('../extension/transport.js');
async function run(callbackValue, fileValue, writes = true) {
  let calls = 0, deleted = [], evaluated;
  const host = {
    getSystemPath: key => key === 'extension' ? 'file:///C:/extension%20test' : 'C:/userdata',
    evalScript: (script, callback) => { evaluated = script; callback(callbackValue); }
  };
  const fs = {makedir:()=>({err:0}), readFile:()=>({err:writes ? 0 : 3,data:fileValue}), writeFile:(path)=>{assert.ok(!path.startsWith('C:/extension test/'));return {err:0};}, deleteFile:file=>deleted.push(file)};
  const result = await new Promise(resolve=>create(host, fs, {setTimeout:(fn)=>setTimeout(fn,1),clearTimeout})('VersionUpdater.scan("project")',data=>{calls++;resolve(data);}));
  assert.equal(calls,1);
  assert.equal(deleted.length,2);
  assert.match(evaluated,/C:\/userdata\/VersionUpdater\/request-/);
  return result;
}
(async()=>{
  assert.deepEqual(await run('', '{"ok":true,"rows":[{"item":"shot_v001.mov"}]}'),{ok:true,rows:[{item:'shot_v001.mov'}]});
  assert.deepEqual(await run('EvalScript error.', '\uFEFF{"ok":false,"error":"Source folder unavailable"}'),{ok:false,error:'Source folder unavailable'});
  assert.deepEqual(await run('{"ok":true,"rows":[]}', '', false),{ok:true,rows:[]});
  const script = buildScript('C:/host.jsx', 'C:/response.json', 'VersionUpdater.scan("project")');
  assert.match(script,/f.close\(\)/);
  assert.match(script,/\$\.evalFile/);
  console.log('Transport checks passed: empty callback, failed callback with valid file, BOM, direct callback, explicit host loading.');
})().catch(error=>{console.error(error);process.exitCode=1;});
