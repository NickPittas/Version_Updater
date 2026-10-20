import {createRequire} from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/Nick/.codex/tools/after-effects-mcp-extended/package.json');
const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport} = require('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({name:'version-updater-verification',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:'C:/Users/Nick/AppData/Roaming/AfterEffectsMCP/after-effects-mcp-extended.exe',stderr:'pipe'}));
  const tools = await client.listTools();
  const response = await client.callTool({name:'after-effects',arguments:{operation:'inspect',action:'get',parameters:{scope:'capabilities',timeoutMs:10000}}});
  const result = {tools:tools.tools.map(t=>t.name),response};
  fs.writeFileSync(new URL('mcp-verification.json',import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  const payload = response.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  let passed = false;
  try { passed = !response.isError && JSON.parse(payload).status === 'success'; } catch {}
  if (!passed) process.exitCode = 1;
} finally { await client.close(); }
