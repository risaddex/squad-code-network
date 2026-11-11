import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { validateAdapter } = require('../adapters/index.js');
const { openStore } = require('../db.js');
const remote = { projectId: 'project', agentId: 'agent', environmentId: 'env', localProject: 'local' };

test('remote adapter contract requires resumable transport without fake CLI methods', () => {
  const adapter = { kind:'remote-test', label:'Remote', efforts:[], genAiSystem:'a2a', colleagues:'none', executionMode:'remote', catalog(){return{};}, status(){return{};}, startRemote(){}, resumeRemote(){} };
  assert.doesNotThrow(() => validateAdapter(adapter));
  assert.throws(() => validateAdapter({...adapter,resumeRemote:undefined}), /resumeRemote/);
  assert.throws(() => validateAdapter({...adapter,executionMode:'other'}), /executionMode/);
  assert.throws(() => validateAdapter({...adapter,prepareRemote:true}), /prepareRemote/);
});

test('database preserves remote profile and active remote run while interrupting local run on restart', () => {
  const dir = mkdtempSync(path.join(tmpdir(),'squad-core-remote-'));
  let db;
  try {
    db = openStore(dir);
    const profile = db.createProfile({name:'Remote',adapter:'remote-test',concurrency:2,threshold:90,ignoreUserConfig:true,remote});
    assert.deepEqual(profile.remote,remote);
    for(const mode of ['remote','local']) db.insertRun({id:mode,status:'running',label:'test',meta:{kind:'chat',projectId:null,agentId:null,featureId:null},cwd:'',startedAt:new Date().toISOString(),args:[],profileId:profile.id,adapter:profile.adapter,executionMode:mode,profile,remoteDeadline:123456789});
    db.requestRemoteCancel('remote');
    db.close(); db=openStore(dir);
    assert.equal(db.getRun('local').run.status,'interrupted');
    assert.equal(db.getRun('remote').run.status,'running');
    assert.equal(db.getRun('remote').run.executionMode,'remote');
    assert.equal(db.pendingRemoteRuns().length,1);
    assert.equal(db.pendingRemoteRuns()[0].run.remoteDeadline,123456789);
    assert.equal(db.pendingRemoteRuns()[0].run.cancelRequested,true);
    assert.deepEqual(db.pendingRemoteRuns()[0].profile.remote,remote);
    db.updateProfile(profile.id,{...profile,remote:{...remote,agentId:'changed'}});
    assert.equal(db.pendingRemoteRuns()[0].profile.remote.agentId,'agent');
  } finally { db?.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('remote lifecycle keeps cancellation pending until confirmation and closes without inventing completion', async () => {
  const {attachRemote}=require('../execution/remote-run.js');
  const events=[];let resolve, cancels=0,closed=0,terminal=null;
  const done=new Promise(r=>resolve=r),run={status:'running'};
  attachRemote(run,emit=>{emit({type:'remote_task',remote:{taskId:'t'}});return{done,cancel:async()=>{cancels++;},close(){closed++;}};},{pushEvent:(_,e)=>events.push(e),flush(){},finish:(_,t)=>{terminal=t;}});
  await new Promise(r=>setImmediate(r));
  await run.cancelRemote();
  assert.equal(cancels,1);assert.equal(run.status,'running');assert.equal(terminal,null);
  resolve({status:'cancelled'});await new Promise(r=>setImmediate(r));assert.equal(terminal.status,'cancelled');
  const pending={status:'running'};
  attachRemote(pending,()=>({done:new Promise(()=>{}),cancel:async()=>assert.fail('shutdown must not cancel'),close(){closed++;}}),{pushEvent(){},flush(){},finish(){assert.fail('shutdown must not finish');}});
  await new Promise(r=>setImmediate(r));pending.closeRemote();assert.equal(closed,1);
  const uncertain={status:'running'};
  attachRemote(uncertain,()=>Promise.reject(new Error('network secret')), {pushEvent:(_,e)=>events.push(e),flush(){},finish(){assert.fail('network rejection must not finish');}});
  await new Promise(r=>setImmediate(r));assert.equal(uncertain.status,'running');assert.ok(events.some(e=>e.subtype==='remote_uncertain'));assert.ok(!JSON.stringify(events).includes('secret'));
});

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn){for(let i=0;i<200;i++){const value=await fn();if(value)return value;await delay(25);}throw new Error('wait timeout');}

test('bridge remote path avoids local process/files; persists intent, resumes, and confirms cancel', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'squad-remote-http-'));
  const plugin=path.join(dir,'plugin'),data=path.join(dir,'data'),projects=path.join(dir,'projects');
  mkdirSync(plugin);writeFileSync(path.join(plugin,'squad-plugin.json'),JSON.stringify({id:'remote-fixture',version:'1.0.0',server:'server.mjs',capabilities:['adapter']}));
  writeFileSync(path.join(plugin,'server.mjs'),`
import fs from 'node:fs';import path from 'node:path';
export function register(ctx){
 const journal=path.join(ctx.dataDir(),'starts.json');let handles=[];
 const handle=(id,emit,resume)=>{let resolve;const done=new Promise(r=>resolve=r);emit({type:'remote_task',remote:{taskId:id,resume}});const h={done,cancel:async()=>{setTimeout(()=>resolve({status:'cancelled',result:{result:'confirmed'},remote:{taskId:id},costUsd:null,usage:null}),700);},close(){}};handles.push(h);return h;};
 ctx.registerAdapter('remote-test',{kind:'remote-test',label:'Remote',efforts:[],genAiSystem:'a2a',colleagues:'none',executionMode:'remote',catalog:()=>({models:[],efforts:[]}),status:()=>({available:true,executionMode:'remote'}),validateProfile:(src,p)=>{if(!p.remote)throw new Error('binding required');},
 prepareRemote:({id})=>{fs.writeFileSync(path.join(ctx.dataDir(),id+'.prepared'),'prepared');},
 startRemote:({id,profile,opts,emit})=>{if(!fs.existsSync(path.join(ctx.dataDir(),id+'.prepared')))throw new Error('not prepared');if(opts.cwd)throw new Error('local cwd forwarded');const ids=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)):[];ids.push(id);fs.writeFileSync(journal,JSON.stringify(ids));return handle(id,emit,false);},
 resumeRemote:({id,emit})=>{const ids=JSON.parse(fs.readFileSync(journal));if(!ids.includes(id))throw new Error('missing intent');return handle(id,emit,true);}});
 ctx.registerRoute('GET','/counts',(_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({starts:fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)).length:0}));});
 ctx.onDispose(()=>{for(const h of handles)h.close();});
}
`);
  const config=path.join(dir,'local.json');writeFileSync(config,JSON.stringify({plugins:{paths:[plugin],enabled:['remote-fixture'],entries:{'remote-fixture':{grants:['adapter']}}}}));
  let proc,exit,token,out='';
  async function start(){out='';proc=spawn(process.execPath,[path.join(ROOT,'server.js'),'--port','4917'],{cwd:ROOT,env:{...process.env,SQUAD_HOME:path.join(dir,'home'),SQUAD_CONFIG:config,SQUAD_CONFIG_SHARED:path.join(dir,'absent.json'),SQUAD_PLUGINS_DIR:'',SQUAD_DATA_DIR:data,SQUAD_PROJECTS_DIR:projects,SQUAD_CLAUDE_BIN:'/not/a/cli',SQUAD_CODEX_BIN:'/not/a/cli',SQUAD_PRINT_TOKEN:'1'}});exit=new Promise(r=>proc.once('exit',r));proc.stdout.on('data',d=>out+=d);proc.stderr.on('data',d=>out+=d);token=await waitFor(()=>{if(proc.exitCode!==null)throw new Error(out);return out.match(/TOKEN=(\w+)/)?.[1];});}
  async function stop(){if(proc?.exitCode===null)proc.kill('SIGTERM');await exit;}
  async function api(route,body){const r=await fetch('http://127.0.0.1:4917'+route,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'content-type':'application/json','x-squad-token':token}});const value=await r.json();return {status:r.status,...value};}
  try{
    await start();const setup=await api('/api/setup',{version:2,agents:[],projects:[{id:'p1',name:'Remote'}],squads:[]});assert.equal(setup.status,201,JSON.stringify(setup));
    const p=await api('/api/profiles',{name:'Remote',adapter:'remote-test',remote});assert.equal(p.status,201,JSON.stringify(p));
    assert.equal((await api('/api/health')).engines['remote-test'],true);
    assert.equal((await api('/api/profiles/'+p.profile.id+'/test',{})).ok,true);
    assert.equal((await api('/api/profiles',{name:'Bad local flags',adapter:'remote-test',remote,bin:'/not/a/cli'})).status,400);
    const r=await api('/api/runs',{prompt:'hello',options:{profile:p.profile.id,project:'local',cwd:'/not/a/dir',addDirs:['/missing']}});assert.equal(r.status,201,JSON.stringify(r));assert.deepEqual(r.args,[]);assert.equal(r.cwd,'');
    await waitFor(async()=>(await api('/api/plugins/remote-fixture/counts')).starts===1);
    assert.equal(existsSync(path.join(projects,'local')),false);
    await stop();
    const originalConfig=JSON.parse((await import('node:fs')).readFileSync(config,'utf8'));
    writeFileSync(config,JSON.stringify({...originalConfig,plugins:{...originalConfig.plugins,enabled:[]}}));
    await start();
    const unavailable=await api('/api/runs/'+r.runId);assert.equal(unavailable.run.status,'running');assert.equal(unavailable.run.executionMode,'remote');
    assert.equal((await api('/api/runs/'+r.runId+'/cancel',{})).status,'running');
    assert.equal((await api('/api/runs',{prompt:'no fallback',options:{profile:p.profile.id,project:'local'}})).status,400);
    await stop();writeFileSync(config,JSON.stringify(originalConfig));await start();
    const resumed=await api('/api/runs/'+r.runId);assert.equal(resumed.run.status,'running');assert.equal(resumed.run.executionMode,'remote');
    assert.equal((await api('/api/plugins/remote-fixture/counts')).starts,1,'restart must resume, never start again');
    const cancel=await api('/api/runs/'+r.runId+'/cancel',{});assert.equal(cancel.status,'running');
    assert.equal((await api('/api/runs/'+r.runId)).run.status,'running','cancel acknowledgement is not remote completion');
    await waitFor(async()=>(await api('/api/runs/'+r.runId)).run.status==='cancelled');
    const ev=await fetch('http://127.0.0.1:4917/api/runs/'+r.runId+'/events',{headers:{'x-squad-token':token}}).then(r=>r.text());
    assert.match(ev,/"resume":true/);assert.equal((ev.match(/"type":"exit"/g)||[]).length,1);
    await stop();await start();assert.equal((await api('/api/runs/'+r.runId)).run.status,'cancelled');
    const timed=await api('/api/runs',{prompt:'deadline',options:{profile:p.profile.id,project:'local',timeoutSec:10}});assert.equal(timed.status,201);
    await waitFor(async()=>(await api('/api/plugins/remote-fixture/counts')).starts===2);await stop();
    const Sqlite=require('better-sqlite3'), db=new Sqlite(path.join(data,'squad.db'));
    db.prepare('UPDATE runs SET remote_deadline = ? WHERE id = ?').run(Date.now()-1,timed.runId);db.close();
    await start();await waitFor(async()=>(await api('/api/runs/'+timed.runId)).run.status==='cancelled');
    assert.equal((await api('/api/plugins/remote-fixture/counts')).starts,2,'expired deadline cancels resumed task without new dispatch');
    const del=await fetch('http://127.0.0.1:4917/api/profiles/'+p.profile.id,{method:'DELETE',headers:{'x-squad-token':token}});assert.equal(del.status,200);
    const stale=await api('/api/runs',{prompt:'stale',options:{profile:p.profile.id,project:'local'}});assert.equal(stale.status,409);assert.match(stale.error,/remoto foi removido/);

  } finally {await stop();rmSync(dir,{recursive:true,force:true});}
});

test('remote terminal result and replay exit commit atomically and retain escaped output', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'squad-remote-terminal-'));let db;
  try {
    db=openStore(dir);const profile=db.defaultProfile();
    const run={id:'terminal',status:'running',executionMode:'remote',profile,profileId:profile.id,adapter:'remote-test',meta:{kind:'chat',projectId:null,agentId:null,featureId:null},cwd:'',label:'',startedAt:new Date().toISOString(),args:[],saved:0,pending:[]};
    db.insertRun(run);run.status='done';run.endedAt=new Date().toISOString();
    const result='\u0001'.repeat(16000),exit={type:'exit',status:'done',result,costUsd:null,usage:null};
    db.finishRun(run,exit,[{type:'result',result},exit]);db.close();db=openStore(dir);
    assert.equal(db.getRun(run.id).result.result,result);
    assert.deepEqual(db.runEvents(run.id).map(e=>e.type),['result','exit']);
    assert.deepEqual(db.usage(),[],'unknown remote cost/usage must not be aggregated as zero');
  } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('deleted remote profile IDs stay distinguishable from arbitrary unknown IDs', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'squad-remote-deleted-'));let db;
  try{
    db=openStore(dir);const profile=db.createProfile({name:'Remote removed',adapter:'remote-test',concurrency:2,threshold:90,ignoreUserConfig:true,remote});
    db.deleteProfile(profile.id);assert.equal(db.wasRemoteProfile(profile.id),true);assert.equal(db.wasRemoteProfile('never-existed'),false);
    db.upsertConfigProfile({...profile,id:'cfg-remote'},'/fixture/local.json');db.removeConfigProfile('cfg-remote');
    db.close();db=openStore(dir);assert.equal(db.wasRemoteProfile(profile.id),true);assert.equal(db.wasRemoteProfile('cfg-remote'),true);
  }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
