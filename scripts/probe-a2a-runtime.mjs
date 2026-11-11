// Opt-in external-contract probe; no LLM, personal configuration, or model credentials.
// npm run test:a2a-runtime -- /absolute/path/to/built/agent-runtime
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createA2AClient } from '../plugins/a2a-client/client.mjs';

const source = process.argv[2];
if (!source || !path.isAbsolute(source)) throw Error('Informe o caminho absoluto do agent-runtime já compilado.');
const { fixture } = await import(pathToFileURL(path.join(source, 'packages/tasks/test/fixtures/gateway-fixture.mjs')));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(path.join(tmpdir(), 'squad-a2a-runtime-probe-'));
const f = await fixture();
let client, bridge;
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) { const end=Date.now()+15000; for (;;) { const v=await fn(); if(v)return v; if(Date.now()>end)throw Error('Probe timeout'); await delay(25); } }
async function availablePort() { const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p; }
async function startBridge() {
 const port=await availablePort(), home=path.join(scratch,'home'), data=path.join(scratch,'bridge-data'), projects=path.join(scratch,'projects');
 for(const d of [home,data,projects])await mkdir(d,{recursive:true});
 const config=path.join(scratch,'local.json');
 await writeFile(config,JSON.stringify({plugins:{paths:[path.join(ROOT,'plugins/a2a-client')],enabled:['a2a-client'],entries:{'a2a-client':{grants:['adapter'],settings:{gatewayUrl:f.origin,pollIntervalMs:50,requestTimeoutMs:1000}}}}}));
 const proc=spawn(process.execPath,[path.join(ROOT,'server.js'),'--port',String(port)],{cwd:ROOT,env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:home,SQUAD_HOME:home,SQUAD_DATA_DIR:data,SQUAD_PROJECTS_DIR:projects,SQUAD_CONFIG:config,SQUAD_CONFIG_SHARED:path.join(scratch,'absent.json'),SQUAD_PLUGINS:'',SQUAD_PLUGINS_DIR:'',SQUAD_PRINT_TOKEN:'1',SQUAD_A2A_TOKEN:f.bearer,SQUAD_CLAUDE_BIN:path.join(ROOT,'tests/fake-claude.mjs'),SQUAD_CODEX_BIN:path.join(ROOT,'tests/fake-codex.mjs'),TMPDIR:scratch}});
 let out='';proc.stdout.on('data',d=>out+=d);proc.stderr.on('data',d=>out+=d);const exited=once(proc,'exit');
 const stop=async()=>{if(proc.exitCode===null){proc.kill('SIGTERM');await exited;}};
 try{
 const token=await until(()=>{if(proc.exitCode!==null)throw Error('Bridge fixture failed to start');return out.match(/TOKEN=(\w+)/)?.[1];});
 const api=async(route,body,method=body===undefined?'GET':'POST')=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'content-type':'application/json','x-squad-token':token},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});const j=await r.json();assert.ok(r.ok,`${route}: ${r.status} ${JSON.stringify(j)}`);return j;};
 const events=async runId=>{const r=await fetch(`http://127.0.0.1:${port}/api/runs/${runId}/events`,{headers:{'x-squad-token':token},signal:AbortSignal.timeout(5000)});assert.ok(r.ok);return (await r.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));};
 return{api,stop,events,base:`http://127.0.0.1:${port}`};
 }catch(e){await stop();throw e;}
}
try {
 let lost=false, sends=0;
 const request=async(url,init)=>{
  const body=init?.body?JSON.parse(init.body):null;
  const response=await fetch(url,init);
  if(body?.method==='SendMessage'){sends++;if(!lost){lost=true;await response.arrayBuffer();throw Error('Fixture: resposta de Send perdida após aceitação');}}
  return response;
 };
 client=createA2AClient({gatewayUrl:f.origin,dataDir:path.join(scratch,'client'),tokenProvider:()=>f.bearer,pollIntervalMs:50,requestTimeoutMs:1000,fetchImpl:request});
 const discovery=await client.discoverAgents();
 const agents=Array.isArray(discovery)?discovery:discovery.agents;
 assert.ok(agents.some(a=>a.agentId==='fake'&&a.projectId==='p1'&&a.environmentId==='stateful'));
 const profile={id:'remote',adapter:'a2a',remote:{projectId:'p1',agentId:'fake',environmentId:'stateful',localProject:'probe'}};
 const events=[];
 const h=client.startRemote({id:'probe-lost-send',profile,prompt:'real gateway echo',systemPrompt:'',opts:{project:'probe'},emit:e=>events.push(e)});
 const terminal=await Promise.race([h.done,delay(15000).then(()=>{throw Error('Client completion timeout: '+JSON.stringify(events));})]);
 assert.equal(terminal.status,'done');assert.equal(terminal.result.result,'real gateway echo');assert.equal(terminal.costUsd,null);assert.equal(sends,2);
 const remote=events.find(e=>e.type==='remote_task')?.remote;assert.ok(remote?.taskId);
 const stored=f.store.get(f.scope,remote.taskId);assert.equal(f.executor.inspectEffectCount(stored.executionId),1);
 client.close();
 client=createA2AClient({gatewayUrl:f.origin,dataDir:path.join(scratch,'client'),tokenProvider:()=>f.bearer,pollIntervalMs:50,requestTimeoutMs:1000,fetchImpl:request});
 const resumed=client.resumeRemote({id:'probe-lost-send',profile,emit:()=>{}});
 assert.equal((await resumed.done).status,'done');assert.equal(sends,2,'reabrir journal não reenvia Send');
 bridge=await startBridge();
 await bridge.api('/api/setup',{version:2,agents:[],projects:[{id:'probe',name:'Probe',folder:'probe'}],squads:[]});
 const list=await bridge.api('/api/plugins/a2a-client/agents');assert.ok(list.agents.some(a=>a.agentId==='fake'));
 const created=await bridge.api('/api/profiles',{name:'Remote fixture',adapter:'a2a',remote:profile.remote});
 const started=await bridge.api('/api/runs',{prompt:'bridge gateway echo',options:{profile:created.profile.id,project:'probe'},meta:{projectId:'probe',kind:'chat'}});
 const history=await until(async()=>{const h=await bridge.api(`/api/runs/${started.runId}`);return h.run.status==='running'?null:h;});
 assert.equal(history.run.status,'done');assert.equal(history.run.adapter,'a2a');assert.equal(history.run.costUsd,null);
 const liveEvents=await bridge.events(started.runId);const taskEvent=liveEvents.find(e=>e.type==='remote_task');assert.ok(taskEvent?.remote.taskId);const bridgeTask=f.store.get(f.scope,taskEvent.remote.taskId);assert.equal(f.executor.inspectEffectCount(bridgeTask.executionId),1);assert.deepEqual(await bridge.events(started.runId),liveEvents);assert.equal(f.executor.inspectEffectCount(bridgeTask.executionId),1);
 const runId=started.runId;await bridge.stop();bridge=await startBridge();
 const saved=await bridge.api(`/api/runs/${runId}`);assert.equal(saved.run.status,'done');assert.ok((await bridge.events(runId)).some(e=>e.type==='exit'&&e.status==='done'));
 console.log('PASS: diretório autenticado; Send com resposta perdida => 2 tentativas, 1 efeito; journal reaberto sem reenvio.');
 console.log('PASS: plugin carregado no bridge; perfil persistido; execução e histórico atravessam gateway real + fake; restart preserva resultado.');
 console.log('Somente loopback e arquivos temporários. Nenhuma chamada de LLM ou credencial pessoal.');
 if(process.argv.includes('--inspect')){console.log('UI fixture: '+bridge.base);await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
} finally {
 await bridge?.stop();client?.close();await f.close();await rm(scratch,{recursive:true,force:true});
}
