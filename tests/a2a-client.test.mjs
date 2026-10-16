import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { createPluginLoader } = require('../plugins/loader.js');
const { createPluginHost } = require('../plugins/host.js');
const { validateAdapter } = require('../adapters/index.js');
import { createA2AClient, validateRemoteProfile } from '../plugins/a2a-client/client.mjs';
const EXT = 'urn:squad:agent-runtime:request:v1';
const token = sub => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ iss: 'https://issuer.test', sub, exp: 9999999999 })).toString('base64url'), 'signature'].join('.');
const profile = { id: 'profile', remote: { projectId: 'p', agentId: 'a', environmentId: 'e', localProject: 'local' } };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) { for (let n = 0; n < 150; n++) {
    if (await fn())
        return;
    await wait(10);
} throw Error('fixture timeout'); }
async function fixture(t, options = {}) {
    const root = mkdtempSync(join(tmpdir(), 'squad-a2a-client-'));
    const requests = [];
    const tasks = new Map();
    let sends = 0, cancels = 0, credential = token('alice'), state = 'TASK_STATE_WORKING', lost = options.lost;
    const server = createServer(async (req, res) => {
        let body = '';
        for await (const c of req)
            body += c;
        requests.push({ url: req.url, method: req.method, authorization: req.headers.authorization, ...(body ? { rpcMethod: JSON.parse(body).method } : {}) });
        res.setHeader('content-type', 'application/json');
        if (options.redirect && req.url === '/v1/projects') {res.writeHead(302,{location:'/unexpected-target'});return res.end('{}');}
        if (req.url === '/v1/projects')
            return res.end(JSON.stringify({ projects: [{ projectId: 'p', environmentId: 'e' }] }));
        if (req.url === '/v1/projects/p/agents')
            return res.end(JSON.stringify({ agents: (options.names ?? ['Agent']).map((name, i) => ({ agentId: i ? 'agent' + i : 'a', name, description: 'Description', cardUrl: origin + '/v1/projects/p/agents/' + (i ? 'agent' + i : 'a') + '/card' })) }));
        if (/^\/v1\/projects\/p\/agents\/(a|agent[123])\/card$/.test(req.url))
            return res.end(JSON.stringify({ name: options.names?.[req.url.includes('/agent') && req.url.match(/agent(\d)/)?.[1] || 0] ?? 'Agent', description: 'Description', version: '1.0', supportedInterfaces: [{ url: options.external ?? origin + req.url.replace(/\/card$/, '/a2a'), protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: { streaming: !!options.streaming, extensions: options.noExtension ? [] : [{ uri: EXT, required: false }] }, defaultInputModes: ['text/plain'], defaultOutputModes: options.textOnly ? ['text/plain'] : ['text/plain', 'application/json'], skills: [{ id: 'code', name: 'Code', description: 'Code', tags: ['code'] }] }));
        const rpc = JSON.parse(body);
        const result = (value, error = false) => res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, [error ? 'error' : 'result']: value }));
        if (rpc.method === 'SubscribeToTask') {
            res.setHeader('content-type', 'text/event-stream');
            res.write('data: {"status":"not-authoritative"}\n\n');
            return res.end();
        }
        if (rpc.method === 'SendMessage') {
            sends++;
            if (options.textOnly && rpc.params.configuration.acceptedOutputModes?.some(m => m !== 'text/plain'))
                return result({ code: -32602, message: 'output mismatch' }, true);
            if (options.reject || (options.rejectRetry && sends > 1))
                return result({ code: -32602, message: 'private rejected input' }, true);
            const key = rpc.params.metadata?.[EXT]?.requestId ?? 'plain';
            if (!tasks.has(key))
                tasks.set(key, { id: 'task-1', contextId: 'ctx-1', status: { state }, artifacts: [{ artifactId: 'result', parts: [{ text: 'done' }] }], metadata: { [EXT]: { requestId: key } } });
            if (lost) {
                lost = false;
                return req.socket.destroy();
            }
            return result({ task: { ...tasks.get(key), status: { state } } });
        }
        if (rpc.method === 'CancelTask') {
            cancels++;
            if (options.cancelUnknown)
                return result({ code: -32002, message: 'unconfirmed' }, true);
            state = 'TASK_STATE_CANCELED';
        }
        const task = [...tasks.values()][0];
        if (!task)
            return result({ code: -32001, message: 'missing' }, true);
        const response = { ...task, status: { state } };
        if (options.badEvidence)
            response.artifacts.push({ artifactId: 'proof', parts: [{ data: { kind: 'codex-exec', outputSha256: '0'.repeat(64) } }] });
        return result(response);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const clients = [];
    const open = (overrides={}) => { const c = createA2AClient({ gatewayUrl: origin, dataDir: root, tokenProvider: () => credential, pollIntervalMs: 20, requestTimeoutMs: 200, ...overrides }); clients.push(c); return c; };
    t.after(async () => { for (const c of clients)
        c.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); rmSync(root, { recursive: true, force: true }); });
    return { open, requests, tasks, root, origin, get sends() { return sends; }, get cancels() { return cancels; }, setState: s => { state = s; }, setToken: s => { credential = token(s); } };
}
test('discovery returns project/environment/skills and rejects external Card execution endpoints', async (t) => {
    const f = await fixture(t);
    const agents = await f.open().discoverAgents();
    assert.equal(agents.agents[0].environmentId, 'e');
    assert.equal(agents.agents[0].skills[0].id, 'code');
    assert.equal(JSON.stringify(agents).includes('signature'), false);
    const bad = await fixture(t, { external: 'https://outside.test/rpc' });
    await assert.rejects(bad.open().discoverAgents());
    assert(bad.requests.every(r => !r.url.includes('outside')));
});
test('lost Send response retries the immutable negotiated request and restart polls known task only', async (t) => {
    const f = await fixture(t, { lost: true });
    const client = f.open();
    const handle = client.startRemote({ id: 'run1', profile, prompt: 'work', systemPrompt: 'instructions', emit: () => { } });
    await until(() => f.sends >= 2);
    assert.equal(f.tasks.size, 1);
    await until(() => f.requests.some(r => r.method === 'POST') && client.getRun('run1')?.taskId === 'task-1');
    client.close();
    const count = f.sends;
    const resumed = f.open().resumeRemote({ id: 'run1', profile, emit: () => { } });
    f.setState('TASK_STATE_COMPLETED');
    const done = await resumed.done;
    assert.equal(done.status, 'done');
    assert.equal(done.result.result, 'done');
    assert.equal(done.costUsd, null);
    assert.equal(done.usage, null);
    assert.equal(f.sends, count);
    assert.equal(readFileSync(join(f.root, 'runs.sqlite')).includes(Buffer.from(token('alice'))), false);
    handle.close();
});
test('cancellation intent survives uncertainty and only confirmed state is terminal', async (t) => {
    const f = await fixture(t, { cancelUnknown: true });
    const c = f.open(), h = c.startRemote({ id: 'cancel1', profile, prompt: 'work', emit: () => { } });
    await until(() => c.getRun('cancel1')?.taskId);
    await h.cancel();
    let finished = false;
    h.done.then(() => { finished = true; });
    await wait(60);
    assert.equal(finished, false);
    assert(f.cancels > 0);
    assert.equal(c.getRun('cancel1').cancelRequested, true);
    f.setState('TASK_STATE_CANCELED');
    assert.equal((await h.done).status, 'cancelled');
});
test('identity changes pause reads and sends; closing a handle does not cancel remote work', async (t) => {
    const f = await fixture(t);
    const c = f.open(), h = c.startRemote({ id: 'identity1', profile, prompt: 'work', emit: () => { } });
    await until(() => c.getRun('identity1')?.taskId);
    f.setToken('bob');
    await wait(40);
    const n = f.requests.length;
    await wait(100);
    assert.equal(f.requests.length, n);
    h.close();
    assert.equal(f.cancels, 0);
    assert.throws(() => c.resumeRemote({ id: 'identity1', profile: { ...profile, remote: { ...profile.remote, environmentId: 'other' } } }));
});
test('unnegotiated lost send stays uncertain without a second submission', async (t) => {
    const f = await fixture(t, { lost: true, noExtension: true }), c = f.open(), h = c.startRemote({ id: 'plain1', profile, prompt: 'work', emit: () => { } });
    await until(() => f.sends === 1);
    await wait(180);
    assert.equal(f.sends, 1);
    assert.equal(c.getRun('plain1').taskId, null);
    h.close();
});
test('bad artifact evidence never produces a completed result', async (t) => {
    const f = await fixture(t, { badEvidence: true }), c = f.open(), h = c.startRemote({ id: 'proof1', profile, prompt: 'work', emit: () => { } });
    await until(() => c.getRun('proof1')?.taskId);
    let done = false;
    h.done.then(() => { done = true; });
    f.setState('TASK_STATE_COMPLETED');
    await wait(100);
    assert.equal(done, false);
    h.close();
});
test('profile and settings reject operational overrides and arbitrary destinations', () => {
    assert.deepEqual(validateRemoteProfile(profile), profile.remote);
    for (const remote of [{ ...profile.remote, token: 'x' }, { ...profile.remote, projectId: '../x' }, { ...profile.remote, localProject: '' }])
        assert.throws(() => validateRemoteProfile({ ...profile, remote }));
    for (const key of ['bin', 'model', 'configDir', 'effort', 'fallbackId'])
        assert.throws(() => validateRemoteProfile({ ...profile, [key]: 'override' }));
    for (const gatewayUrl of ['http://remote.example', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?x=1'])
        assert.throws(() => createA2AClient({ gatewayUrl, dataDir: '/tmp', tokenProvider: () => token('alice') }));
});
test('two client instances cannot both dispatch an unnegotiated request', async (t) => {
    const f = await fixture(t, { noExtension: true, lost: true }), a = f.open(), b = f.open();
    const x = a.startRemote({ id: 'race1', profile, prompt: 'work' }), y = b.startRemote({ id: 'race1', profile, prompt: 'work' });
    await until(() => f.sends === 1);
    await wait(150);
    assert.equal(f.sends, 1);
    x.close();
    y.close();
});
test('immediate cancel persists before dispatch and confirms no submission', async (t) => {
    const f = await fixture(t), c = f.open(), h = c.startRemote({ id: 'earlycancel', profile, prompt: 'work' });
    await h.cancel();
    assert.equal((await h.done).status, 'cancelled');
    assert.equal(c.getRun('earlycancel').cancelRequested, true);
    assert.equal(f.sends, 0);
});
test('pre-dispatch invalid input is terminal without network or a journal intent', async (t) => {
    const f = await fixture(t), c = f.open();
    for (const args of [{ prompt: '' }, { prompt: '😀'.repeat(5000) }, { prompt: 'work', opts: { project: 'wrong' } }]) {
        const h = c.startRemote({ id: 'invalid', profile, ...args });
        assert.equal((await h.done).status, 'error');
        assert.equal(c.getRun('invalid'), null);
    }
    assert.equal(f.requests.length, 0);
});
test('definitive JSON-RPC rejection stops retries without exposing server errors', async (t) => {
    const f = await fixture(t, { reject: true }), c = f.open(), h = c.startRemote({ id: 'reject', profile, prompt: 'work' });
    const done = await h.done;
    assert.equal(done.status, 'error');
    assert.equal(f.sends, 1);
    assert(!JSON.stringify(done).includes('private rejected'));
});
test('SSE disconnection recovers with GetTask, never a second Send', async (t) => {
    const f = await fixture(t, { streaming: true }), c = f.open(), h = c.startRemote({ id: 'stream', profile, prompt: 'work' });
    await until(() => f.requests.some(r => r.rpcMethod === 'SubscribeToTask'));
    await until(() => f.requests.some(r => r.rpcMethod === 'GetTask'));
    assert.equal(f.sends, 1);
    f.setState('TASK_STATE_COMPLETED');
    assert.equal((await h.done).status, 'done');
    assert.equal(f.sends, 1);
});
test('tampered immutable intent fails closed on recovery', async (t) => {
    const f = await fixture(t), c = f.open(), h = c.startRemote({ id: 'tamper', profile, prompt: 'work' });
    await until(() => c.getRun('tamper')?.taskId);
    h.close();
    const db = new Database(join(f.root, 'runs.sqlite'));
    t.after(() => db.close());
    const row = JSON.parse(db.prepare('SELECT record FROM runs WHERE id=?').get('tamper').record);
    row.prompt = 'changed';
    db.prepare('UPDATE runs SET record=? WHERE id=?').run(JSON.stringify(row), 'tamper');
    assert.throws(() => c.resumeRemote({ id: 'tamper', profile }), /JOURNAL_UNCERTAIN/);
});
test('text-only Cards use default output modes and immutable retry payload', async (t) => {
    const f = await fixture(t, { textOnly: true, lost: true }), c = f.open(), h = c.startRemote({ id: 'textonly', profile, prompt: 'work' });
    await until(() => c.getRun('textonly')?.taskId);
    assert.equal(f.sends, 2);
    f.setState('TASK_STATE_COMPLETED');
    assert.equal((await h.done).result.result, 'done');
    const db = new Database(join(f.root, 'runs.sqlite'));
    try {
        const r = JSON.parse(db.prepare('SELECT record FROM runs WHERE id=?').get('textonly').record);
        assert.deepEqual(r.wire.configuration, { returnImmediately: true });
        assert.equal(r.wire.message.messageId, r.messageId);
    }
    finally {
        db.close();
    }
});
test('versioned plugin loads opt-in through real host and returns authenticated discovery route', async (t) => {
    const f = await fixture(t);
    const config = join(f.root, 'squad.local.json');
    writeFileSync(config, JSON.stringify({ plugins: { paths: [fileURLToPath(new URL('../plugins/a2a-client', import.meta.url))], enabled: ['a2a-client'], entries: { 'a2a-client': { grants: ['adapter'], settings: { gatewayUrl: f.origin } } } } }));
    const loader = createPluginLoader({ root: f.root, home: f.root, cwd: f.root, env: { SQUAD_CONFIG: config, SQUAD_CONFIG_SHARED: join(f.root, 'missing.json') } });
    let adapter, response;
    const host = createPluginHost({ getDiscovery: () => loader.load().discovery, dataRoot: f.root, maxBody: 65536, env: { SQUAD_A2A_TOKEN: token('alice') }, log: { log() { }, warn() { }, error() { } }, getRegistry: () => ({ builtinKinds: () => [], register(value) { validateAdapter(value); adapter = value; return () => { }; } }), http: { json(_res, status, body) { response = { status, body }; }, fail(_res, status, body) { response = { status, body }; } } });
    t.after(() => host.dispose());
    await host.load();
    assert.equal(host.statusOf('a2a-client'), 'active');
    assert.equal(adapter.executionMode, 'remote');
    assert.equal((await adapter.status()).error, null);
    assert.equal((await adapter.status()).available, true);
    assert.equal(await host.route({ method: 'GET' }, {}, new URL('http://localhost/api/plugins/a2a-client/agents')), true);
    assert.equal(response.status, 200);
    assert.equal(response.body.agents[0].agentId, 'a');
});
test('prepare persists intent before core admission without HTTP and survives restart', async (t) => {
    const f = await fixture(t), c = f.open();
    await c.prepareRemote({ id: 'prepared', profile, prompt: 'work' });
    assert.equal(f.requests.length, 0);
    assert.equal(c.getRun('prepared').taskId, null);
    c.close();
    const h = f.open().resumeRemote({ id: 'prepared', profile });
    await until(() => f.sends === 1);
    f.setState('TASK_STATE_COMPLETED');
    assert.equal((await h.done).status, 'done');
});
test('discovery treats Codex, Claude, Cursor and Hermes as provider-neutral Cards', async (t) => {
    const f = await fixture(t, { names: ['Codex', 'Claude', 'Cursor', 'Hermes'] });
    const result = await f.open().discoverAgents();
    assert.deepEqual(result.agents.map(a => a.name), ['Codex', 'Claude', 'Cursor', 'Hermes']);
    assert(result.agents.every(a => a.skills[0].id === 'code'));
});

test('close while discovery is pending prevents dispatch after Card resolution',async t=>{
 const f=await fixture(t);let release,reached=false;const gate=new Promise(r=>release=r);
 const c=f.open({fetchImpl:async(url,init)=>{if(url.endsWith('/card')){reached=true;await gate;}return fetch(url,init);}});
 const h=c.startRemote({id:'closeduringdiscovery',profile,prompt:'work'});await until(()=>reached);h.close();release();await wait(60);assert.equal(f.sends,0);assert.equal(c.getRun('closeduringdiscovery').taskId,null);
});
test('invalid UTF-8 JSON response fails closed',async t=>{
 const f=await fixture(t);const c=f.open({fetchImpl:async()=>new Response(Buffer.from([123,34,120,34,58,34,255,34,125]),{headers:{'content-type':'application/json'}})});
 await assert.rejects(c.discoverAgents(),/INVALID_RESPONSE/);
});
test('known task recovery and cancellation do not depend on discovery availability',async t=>{
 const f=await fixture(t),first=f.open(),original=first.startRemote({id:'nodiscovery',profile,prompt:'work'});
 await until(()=>first.getRun('nodiscovery')?.taskId);first.close();const sends=f.sends;let discoveryCalls=0;
 const second=f.open({fetchImpl:async(url,init)=>{if(init.method==='GET'){discoveryCalls++;return new Response('{}',{status:503,headers:{'content-type':'application/json'}});}return fetch(url,init);}});
 const events=[];const recovered=second.resumeRemote({id:'nodiscovery',profile,emit:e=>events.push(e)});await recovered.cancel();await until(()=>f.cancels>0);
 assert.equal((await recovered.done).status,'cancelled');assert.equal(f.sends,sends);assert.equal(discoveryCalls,0);assert.equal(events.filter(e=>e.type==='remote_task').length,1);assert.equal(events.find(e=>e.type==='remote_task').remote.taskId,'task-1');original.close();
});

test('definitive rejection of a retry cannot terminalize a previously ambiguous Send',async t=>{
 const f=await fixture(t,{lost:true,rejectRetry:true}),c=f.open(),h=c.startRemote({id:'rejectretry',profile,prompt:'work'});let finished=false;h.done.then(()=>{finished=true;});
 await until(()=>f.sends>=2);await wait(100);assert.equal(f.tasks.size,1);assert.equal(finished,false);assert.equal(c.getRun('rejectretry').taskId,null);h.close();
});

const jsonResponse=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const mutateResponse=mutate=>async(url,init)=>{
 const response=await fetch(url,init),value=await response.json();mutate(value,url,init);return jsonResponse(value);
};
test('HTTP redirects never forward credentials and malformed bounded responses fail closed',async t=>{
 const redirected=await fixture(t,{redirect:true});await assert.rejects(redirected.open().discoverAgents(),/TRANSPORT_UNCERTAIN/);assert.equal(redirected.requests.length,1);
 const f=await fixture(t);
 for(const [name,response,code] of [
  ['unauthorized',()=>new Response('{}',{status:401}),'AUTH_REQUIRED'],
  ['unavailable',()=>new Response('{}',{status:503}),'HTTP_503'],
  ['html',()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}}),'INVALID_RESPONSE'],
  ['malformed',()=>new Response('{',{headers:{'content-type':'application/json'}}),'INVALID_RESPONSE'],
  ['oversize',()=>jsonResponse({value:'x'.repeat(1048576)}),'RESPONSE_LIMIT'],
 ])await t.test(name,async()=>{const c=f.open({fetchImpl:async()=>response()});await assert.rejects(c.discoverAgents(),new RegExp(code));});
});
test('Cards reject unsupported defaults, mandatory extensions and cross-project discovery',async t=>{
 const f=await fixture(t);
 for(const [name,mutate,code] of [
  ['image-only Card',(v,u)=>{if(u.endsWith('/card'))v.defaultOutputModes=['image/png'];},'INVALID_CARD'],
  ['mandatory extension',(v,u)=>{if(u.endsWith('/card'))v.capabilities.extensions=[{uri:'urn:unknown:required',required:true}];},'UNSUPPORTED_EXTENSION'],
  ['external Card',(v,u)=>{if(u.endsWith('/agents'))v.agents[0].cardUrl='https://outside.test/card';},'INVALID_DISCOVERY'],
  ['malformed skill',(v,u)=>{if(u.endsWith('/card'))v.skills[0].tags=[''];},'INVALID_CARD'],
  ['invalid project',(v,u)=>{if(u.endsWith('/projects'))v.projects[0].projectId='../other';},'INVALID_DISCOVERY'],
  ['invalid directory',(v,u)=>{if(u.endsWith('/agents'))v.agents={};},'INVALID_DISCOVERY'],
 ])await t.test(name,async()=>{const c=f.open({fetchImpl:mutateResponse(mutate)});await assert.rejects(c.discoverAgents(),new RegExp(code));});
});
test('known-task responses cannot substitute task/context or smuggle unverified artifacts',async t=>{
 for(const [name,mutate,code] of [
  ['task identity',v=>{v.result.id='other-task';},'INVALID_TASK'],
  ['context identity',v=>{v.result.contextId='other-context';},'CONTEXT_CHANGED'],
  ['unknown state',v=>{v.result.status.state='DONE';},'INVALID_TASK'],
  ['URI artifact',v=>{v.result.artifacts[0].parts=[{url:'https://outside.test/private'}];},'INVALID_ARTIFACT'],
  ['oversize text',v=>{v.result.artifacts[0].parts=[{text:'x'.repeat(16385)}];},'INVALID_ARTIFACT'],
  ['RPC correlation',v=>{v.id='other-request';},'INVALID_RESPONSE'],
 ])await t.test(name,async st=>{
  const f=await fixture(st);let alter=false,finished=false;const notices=[];
  const c=f.open({fetchImpl:mutateResponse((v,u,init)=>{if(alter&&init.body&&JSON.parse(init.body).method==='GetTask')mutate(v);})});
  const h=c.startRemote({id:'tamperresponse',profile,prompt:'work',emit:e=>notices.push(e)});h.done.then(()=>{finished=true;});await until(()=>c.getRun('tamperresponse')?.taskId);alter=true;f.setState('TASK_STATE_COMPLETED');
  await until(()=>notices.some(e=>e.code===code));assert.equal(finished,false);assert.equal(f.sends,1);h.close();
 });
});
test('status and preparation reject missing or expired credentials without network',async t=>{
 const f=await fixture(t);
 for(const credential of [undefined,'not-a-jwt',[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({iss:'issuer',sub:'alice',exp:1})).toString('base64url'),'signature'].join('.')]){
  const c=f.open({tokenProvider:()=>credential});assert.equal((await c.status()).available,false);await assert.rejects(c.prepareRemote({id:'authfail',profile,prompt:'work'}),/AUTH_REQUIRED/);assert.equal(c.getRun('authfail'),null);
 }
 assert.equal(f.requests.length,0);
});
test('journal authority rejects missing, corrupt and symlinked markers on reopen',async t=>{
 for(const mode of ['missing','corrupt','symlink'])await t.test(mode,async st=>{
  const f=await fixture(st);f.open().close();const marker=join(f.root,'runs.sqlite.authority.json');
  if(mode==='missing')rmSync(marker);else if(mode==='corrupt')writeFileSync(marker,'{');else{renameSync(marker,marker+'.backup');symlinkSync(marker+'.backup',marker);}
  assert.throws(()=>f.open(),/JOURNAL_UNCERTAIN/);
 });
});
test('confirmed terminal states and valid output proof survive cache-only restart',async t=>{
 for(const [state,status] of [['TASK_STATE_COMPLETED','done'],['TASK_STATE_FAILED','error'],['TASK_STATE_REJECTED','error']])await t.test(state,async st=>{
  const f=await fixture(st);f.setState(state);const c=f.open({fetchImpl:mutateResponse((v,u,init)=>{
   if(state==='TASK_STATE_COMPLETED'&&init.body&&JSON.parse(init.body).method==='SendMessage')v.result.task.artifacts.push({artifactId:'proof',parts:[{data:{kind:'codex-exec',outputSha256:createHash('sha256').update('done').digest('hex')}}]});
  })});
  const h=c.startRemote({id:'terminal',profile,prompt:'work'});const result=await h.done;assert.equal(result.status,status);c.close();const requests=f.requests.length;
  assert.deepEqual(await f.open().resumeRemote({id:'terminal',profile}).done,result);assert.equal(f.requests.length,requests);
 });
});
test('malformed terminal cache fails closed rather than replaying a fabricated result',async t=>{
 const f=await fixture(t);f.setState('TASK_STATE_COMPLETED');const c=f.open();await c.startRemote({id:'terminaltamper',profile,prompt:'work'}).done;
 const db=new Database(join(f.root,'runs.sqlite'));try{const row=JSON.parse(db.prepare('SELECT record FROM runs WHERE id=?').get('terminaltamper').record);row.terminal.result.result='fabricated';db.prepare('UPDATE runs SET record=? WHERE id=?').run(JSON.stringify(row),'terminaltamper');}finally{db.close();}
 assert.throws(()=>c.resumeRemote({id:'terminaltamper',profile}),/JOURNAL_UNCERTAIN/);
});

// Portable snapshot of the canonical BaseTool Read descriptor, contract 1.0.0.
const readDescriptor={"toolId":"Read","contractVersion":"1.0.0","name":"Read","description":"Read a bounded portion of a file and return its opaque version.","effects":["read"],"inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"path":{"type":"string","minLength":1,"maxLength":4096,"pattern":"^(?!/)(?!.*[\\\\:\\u0000])(?!.*(?:^|/)(?:\\.|\\.\\.)(?:/|$))(?!.*//)(?!.*?/$).+$"},"offset":{"type":"integer","minimum":0,"maximum":2147483647},"limit":{"type":"integer","minimum":1,"maximum":10000}},"required":["path"],"additionalProperties":false,"title":"ReadInput"},"outputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"content":{"type":"string","minLength":0,"maxLength":1048576},"truncated":{"type":"boolean"},"version":{"type":"string","minLength":1,"maxLength":256}},"required":["content","truncated","version"],"additionalProperties":false,"title":"ReadOutput"}};
test('versioned BaseTool catalog preserves native-mapped guarantees and rejects cross-agent metadata',async t=>{
 const f=await fixture(t),catalogUrl=f.origin+'/v1/projects/p/agents/a/tool-catalog/v1';
 const guarantees={inputValidation:false,outputValidation:false,cancellation:false,workspaceBoundary:false,writeLease:false};
 const entry={descriptor:readDescriptor,binding:{agentId:'a',toolId:'Read',contractVersion:'1.0.0',mode:'native-mapped',nativeToolName:'Read',declaredGuarantees:guarantees,reason:'Descriptive native Read; no canonical BaseTool execution.'},effectiveGuarantees:guarantees,executable:false};
 for(const variant of ['valid','other-agent','other-url','other-version'])await t.test(variant,async()=>{
  const c=f.open({fetchImpl:async(url,init)=>{
   if(url===catalogUrl)return jsonResponse({schemaVersion:'1.0.0',projectId:'p',agentId:variant==='other-agent'?'other':'a',entries:[entry]});
   const response=await fetch(url,init),v=await response.json();
   if(url.endsWith('/agents'))v.agents[0].catalogUrl=variant==='other-url'?'https://outside.test/tools':catalogUrl;
   if(url.endsWith('/card'))v.capabilities.extensions.push({uri:'urn:squad:agent-runtime:tool-catalog:v1',required:false,params:{catalogUrl,schemaVersion:variant==='other-version'?'2.0.0':'1.0.0'}});
   return jsonResponse(v);
  }});
  if(variant!=='valid')await assert.rejects(c.discoverAgents(),/INVALID_CATALOG/);else{const result=await c.discoverAgents();assert.deepEqual(result.agents[0].tools,[entry]);assert.equal(result.agents[0].tools[0].executable,false);}
 });
});
test('a peer declining SubscribeToTask still reconciles with GetTask without re-dispatch',async t=>{
 const f=await fixture(t,{streaming:true});let subscriptions=0;
 const c=f.open({fetchImpl:async(url,init)=>{if(init.body&&JSON.parse(init.body).method==='SubscribeToTask'){subscriptions++;return jsonResponse({error:{code:-32004}});}return fetch(url,init);}});
 const h=c.startRemote({id:'nosubscribe',profile,prompt:'work'});await until(()=>subscriptions===1);await until(()=>f.requests.some(r=>r.rpcMethod==='GetTask'));f.setState('TASK_STATE_COMPLETED');assert.equal((await h.done).status,'done');assert.equal(f.sends,1);
});
