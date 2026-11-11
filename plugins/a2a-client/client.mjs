import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, constants } from 'node:fs';
import { join } from 'node:path';
import { types } from 'node:util';
const EXT = 'urn:squad:agent-runtime:request:v1';
const TOOL_EXT = 'urn:squad:agent-runtime:tool-catalog:v1';
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
const shortId = v => id(v) && v.length <= 64;
const string = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0');
const digest = v => createHash('sha256').update(v).digest('hex');
const plain = v => !!v && typeof v === 'object' && !types.isProxy(v) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => typeof k === 'string' && Object.getOwnPropertyDescriptor(v, k)?.enumerable && 'value' in Object.getOwnPropertyDescriptor(v, k));
const error = code => Object.assign(new Error(`A2A: ${code}`), { code });
const freeze = v => Object.freeze(v);
const intentDigest = r => digest(JSON.stringify([r.id, r.gateway, r.remote, r.identity, r.prompt, r.requestId, r.messageId]));
const failedHandle = code => ({ done: Promise.resolve({ status: 'error', result: { type: 'result', result: '', is_error: true }, error: `A2A: ${code}`, costUsd: null, usage: null }), cancel: async () => { }, close() { } });
const terminal = new Set(['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED']);
const states = new Set([...terminal, 'TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING', 'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED']);
export function validateRemoteProfile(profile) {
    if (!plain(profile) || ['bin', 'model', 'configDir', 'effort', 'fallbackId'].some(k => profile[k] !== undefined && profile[k] !== ''))
        throw error('INVALID_PROFILE');
    const r = profile.remote;
    if (!plain(r) || Object.keys(r).length !== 4 || !['projectId', 'agentId', 'environmentId', 'localProject'].every(k => Object.hasOwn(r, k)) || ![r.projectId, r.agentId, r.environmentId].every(shortId) || !string(r.localProject, 1024))
        throw error('INVALID_PROFILE');
    return freeze({ projectId: r.projectId, agentId: r.agentId, environmentId: r.environmentId, localProject: r.localProject });
}
function origin(value) {
    try {
        const u = new URL(value);
        if (u.origin !== value || u.username || u.password || u.search || u.hash || !['https:', 'http:'].includes(u.protocol) || (u.protocol === 'http:' && !['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)))
            throw 0;
        return u.origin;
    }
    catch {
        throw error('INVALID_GATEWAY');
    }
}
function credential(value) {
    try {
        if (!string(value, 16384) || !/^[-\w]+\.[-\w]+\.[-\w]+$/.test(value))
            throw 0;
        const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
        if (!plain(claims) || !string(claims.iss, 2048) || !string(claims.sub, 1024) || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now())
            throw 0;
        // Identity guard only. Signature, issuer, audience and ACL are enforced by the gateway.
        return { token: value, identity: JSON.stringify([claims.iss, claims.sub]) };
    }
    catch {
        throw error('AUTH_REQUIRED');
    }
}
function validTask(task, expectedId) {
    if (!plain(task) || !id(task.id) || (expectedId && task.id !== expectedId) || !id(task.contextId) || !plain(task.status) || !states.has(task.status.state))
        throw error('INVALID_TASK');
    if (task.artifacts !== undefined && (!Array.isArray(task.artifacts) || task.artifacts.length > 128))
        throw error('INVALID_ARTIFACT');
    const texts = [], proofs = [];
    for (const artifact of task.artifacts ?? []) {
        if (!plain(artifact) || !id(artifact.artifactId) || !Array.isArray(artifact.parts) || artifact.parts.length > 128)
            throw error('INVALID_ARTIFACT');
        for (const part of artifact.parts) {
            if (!plain(part) || Number(Object.hasOwn(part, 'text')) + Number(Object.hasOwn(part, 'data')) !== 1 || Object.hasOwn(part, 'url') || Object.hasOwn(part, 'raw'))
                throw error('INVALID_ARTIFACT');
            if (Object.hasOwn(part, 'text')) {
                if (typeof part.text !== 'string' || part.text.length > 16384)
                    throw error('INVALID_ARTIFACT');
                texts.push(part.text);
            }
            else if (plain(part.data) && ['codex-exec', 'claude-exec', 'cursor-exec'].includes(part.data.kind))
                proofs.push(part.data);
        }
    }
    const text = texts.join('\n');
    if (text.length > 16384)
        throw error('INVALID_ARTIFACT');
    for (const proof of proofs) {
        if (task.status.state !== 'TASK_STATE_COMPLETED' || !/^[a-f0-9]{64}$/.test(proof.outputSha256) || proof.outputSha256 !== digest(text))
            throw error('INVALID_EVIDENCE');
    }
    return { task, text };
}
/** Trusted embedded API. No credential value or arbitrary remote URL is persisted. */
export function createA2AClient(options) {
    if (!plain(options) || Object.keys(options).some(k => !['gatewayUrl', 'dataDir', 'tokenProvider', 'pollIntervalMs', 'requestTimeoutMs', 'fetchImpl'].includes(k)))
        throw error('INVALID_SETTINGS');
    const gateway = origin(options.gatewayUrl), poll = options.pollIntervalMs ?? 1000, timeout = options.requestTimeoutMs ?? 10000;
    if (!Number.isSafeInteger(poll) || poll < 10 || poll > 30000 || !Number.isSafeInteger(timeout) || timeout < 20 || timeout > 60000 || typeof options.tokenProvider !== 'function' || !string(options.dataDir, 4096) || (options.fetchImpl !== undefined && typeof options.fetchImpl !== 'function'))
        throw error('INVALID_SETTINGS');
    const fetchImpl = options.fetchImpl ?? fetch;
    mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
    const root = realpathSync(options.dataDir), file = join(root, 'runs.sqlite'), marker = file + '.authority.json';
    const exists = p => lstatSync(p, { throwIfNoEntry: false });
    let fresh = false;
    if (!!exists(file) !== !!exists(marker))
        throw error('JOURNAL_UNCERTAIN');
    if (!exists(file)) {
        const fd = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        closeSync(fd);
        fresh = true;
    }
    const st = lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink())
        throw error('JOURNAL_UNCERTAIN');
    const db = new Database(file);
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = FULL');
    db.pragma('busy_timeout = 5000');
    let authority;
    const rootStat = lstatSync(root);
    try {
        if (fresh) {
            authority = randomUUID();
            db.transaction(() => { db.exec('CREATE TABLE authority(id TEXT PRIMARY KEY); CREATE TABLE runs(id TEXT PRIMARY KEY,record TEXT NOT NULL); PRAGMA user_version=1;'); db.prepare('INSERT INTO authority VALUES (?)').run(authority); })();
            writeFileSync(marker, JSON.stringify({ authority, dev: st.dev, ino: st.ino }), { flag: 'wx', mode: 0o600 });
            const fd = openSync(marker, constants.O_RDONLY);
            try {
                fsyncSync(fd);
            }
            finally {
                closeSync(fd);
            }
            const dir = openSync(root, constants.O_RDONLY);
            try {
                fsyncSync(dir);
            }
            finally {
                closeSync(dir);
            }
        }
        else {
            const m = lstatSync(marker);
            if (!m.isFile() || m.isSymbolicLink() || m.size > 4096)
                throw 0;
            const stored = JSON.parse(readFileSync(marker, 'utf8'));
            authority = stored.authority;
            if (stored.dev !== st.dev || stored.ino !== st.ino)
                throw 0;
        }
        if (db.pragma('user_version', { simple: true }) !== 1 || db.prepare('SELECT id FROM authority').get()?.id !== authority)
            throw 0;
    }
    catch {
        db.close();
        throw error('JOURNAL_UNCERTAIN');
    }
    let closed = false;
    const handles = new Map(), controllers = new Set();
    function check() {
        if (closed)
            throw error('CLOSED');
        try {
            const current = lstatSync(file), directory = lstatSync(root), mark = lstatSync(marker);
            const m = mark.isFile() && !mark.isSymbolicLink() && mark.size <= 4096 ? JSON.parse(readFileSync(marker, 'utf8')) : null;
            if (!current.isFile() || current.isSymbolicLink() || current.dev !== st.dev || current.ino !== st.ino || directory.dev !== rootStat.dev || directory.ino !== rootStat.ino || !m || m.authority !== authority || m.dev !== st.dev || m.ino !== st.ino || db.pragma('user_version', { simple: true }) !== 1 || db.prepare('SELECT id FROM authority').get()?.id !== authority)
                throw 0;
        }
        catch {
            throw error('JOURNAL_UNCERTAIN');
        }
    }
    function read(runId) {
        check();
        const row = db.prepare('SELECT record FROM runs WHERE id=?').get(runId);
        if (!row)
            return null;
        try {
            if (Buffer.byteLength(row.record) > 1048576)
                throw 0;
            const r = JSON.parse(row.record);
            if (!plain(r) || r.id !== runId || r.version !== 1 || !id(r.requestId) || !id(r.messageId) || !string(r.identity, 4096) || r.gateway !== gateway || !plain(r.remote) || !string(r.prompt, 16384) || typeof r.attempted !== 'boolean' || typeof r.cancelRequested !== 'boolean' || (r.taskId !== null && !id(r.taskId)))
                throw 0;
            validateRemoteProfile({ remote: r.remote });
            if (r.wire !== null && (!plain(r.wire) || r.wireDigest !== digest(JSON.stringify(r.wire))))
                throw 0;
            if (r.attempted && r.wire === null)
                throw 0;
            if (r.intentDigest !== intentDigest(r) || (r.contextId !== null && !id(r.contextId)) || (r.taskId === null) !== (r.contextId === null) || ![null, true, false].includes(r.dedupe))
                throw 0;
            const identity = JSON.parse(r.identity);
            if (!Array.isArray(identity) || identity.length !== 2 || !identity.every(v => string(v, 2048)))
                throw 0;
            if (r.terminal !== null) {
                const t = r.terminal;
                if (!plain(t) || !['done', 'error', 'cancelled'].includes(t.status) || !plain(t.result) || t.result.type !== 'result' || typeof t.result.result !== 'string' || t.result.result.length > 16384 || t.result.is_error !== (t.status === 'error') || t.costUsd !== null || t.usage !== null || JSON.stringify(t.remote) !== JSON.stringify(publicRemote(r)) || r.terminalDigest !== digest(JSON.stringify(t)))
                    throw 0;
            }
            return r;
        }
        catch {
            throw error('JOURNAL_UNCERTAIN');
        }
    }
    function update(runId, mutate) { check(); return db.transaction(() => { const r = read(runId); if (!r)
        throw error('RUN_NOT_FOUND'); const previousTerminal = r.terminal === null ? null : JSON.stringify(r.terminal); mutate(r); if (previousTerminal !== null && JSON.stringify(r.terminal) !== previousTerminal)
        throw error('TERMINAL_CHANGED'); if (r.terminal !== null)
        r.terminalDigest = digest(JSON.stringify(r.terminal)); const json = JSON.stringify(r); if (Buffer.byteLength(json) > 1048576)
        throw error('JOURNAL_LIMIT'); db.prepare('UPDATE runs SET record=? WHERE id=?').run(json, runId); return r; })(); }
    async function auth(identity) { const c = credential(await options.tokenProvider()); if (identity && c.identity !== identity)
        throw error('IDENTITY_CHANGED'); return c; }
    async function request(path, { identity, body, extensions = false, isStopped = () => false } = {}) {
        if (!path.startsWith('/v1/projects') || path.includes('?') || path.includes('#'))
            throw error('INVALID_ROUTE');
        const c = await auth(identity);
        if (closed || isStopped())
            throw error('CLOSED');
        const controller = new AbortController();
        controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetchImpl(gateway + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal, headers: { authorization: `Bearer ${c.token}`, accept: 'application/json', 'a2a-version': '1.0', ...(body ? { 'content-type': 'application/a2a+json' } : {}), ...(extensions ? { 'a2a-extensions': EXT } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
            if (response.status === 401)
                throw error('AUTH_REQUIRED');
            if (!response.ok)
                throw error(`HTTP_${response.status}`);
            if (!/^application\/(?:a2a\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? ''))
                throw error('INVALID_RESPONSE');
            let size = 0;
            const chunks = [];
            for await (const chunk of response.body) {
                size += chunk.length;
                if (size > 1048576) {
                    controller.abort();
                    throw error('RESPONSE_LIMIT');
                }
                chunks.push(chunk);
            }
            let value;
            try {
                value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)));
            }
            catch {
                throw error('INVALID_RESPONSE');
            }
            if (body) {
                if (!plain(value) || value.jsonrpc !== '2.0' || value.id !== body.id || Number(Object.hasOwn(value, 'result')) + Number(Object.hasOwn(value, 'error')) !== 1)
                    throw error('INVALID_RESPONSE');
                if (value.error)
                    throw error(Number.isSafeInteger(value.error.code) ? `RPC_${value.error.code}` : 'INVALID_RESPONSE');
                return value.result;
            }
            return value;
        }
        catch (e) {
            if (e?.code && /^((?:AUTH|IDENTITY|HTTP|RPC|INVALID|RESPONSE|CLOSED)[A-Z_0-9-]*)$/.test(e.code))
                throw e;
            throw error('TRANSPORT_UNCERTAIN');
        }
        finally {
            clearTimeout(timer);
            controllers.delete(controller);
        }
    }
    const base = r => `/v1/projects/${r.projectId}/agents/${r.agentId}`;
    async function discover(identity) {
        const c = await auth(identity), projects = await request('/v1/projects', { identity: c.identity });
        if (!plain(projects) || !Array.isArray(projects.projects) || projects.projects.length > 100)
            throw error('INVALID_DISCOVERY');
        const result = [];
        let total = 0;
        for (const project of projects.projects) {
            if (!plain(project) || !shortId(project.projectId) || !shortId(project.environmentId))
                throw error('INVALID_DISCOVERY');
            const list = await request(`/v1/projects/${project.projectId}/agents`, { identity: c.identity });
            if (!plain(list) || !Array.isArray(list.agents) || list.agents.length > 100)
                throw error('INVALID_DISCOVERY');
            for (const entry of list.agents) {
                if (++total > 256)
                    throw error('DISCOVERY_LIMIT');
                if (!plain(entry) || !shortId(entry.agentId))
                    throw error('INVALID_DISCOVERY');
                const ref = { ...project, agentId: entry.agentId }, route = base(ref);
                if (entry.cardUrl !== gateway + route + '/card')
                    throw error('INVALID_DISCOVERY');
                const card = await request(route + '/card', { identity: c.identity });
                if (!plain(card) || !string(card.name, 1024) || typeof card.description !== 'string' || card.description.length > 8192 || !string(card.version, 128) || !Array.isArray(card.supportedInterfaces) || !card.supportedInterfaces.some(i => plain(i) && i.url === gateway + route + '/a2a' && i.protocolBinding === 'JSONRPC' && i.protocolVersion === '1.0' && !i.tenant) || !plain(card.capabilities) || !Array.isArray(card.skills) || card.skills.length > 128 || !Array.isArray(card.defaultOutputModes) || !card.defaultOutputModes.length || card.defaultOutputModes.length > 16 || !card.defaultOutputModes.every(m => ['text/plain', 'application/json'].includes(m)))
                    throw error('INVALID_CARD');
                const extensions = card.capabilities.extensions ?? [];
                if (!Array.isArray(extensions) || extensions.length > 32 || extensions.some(e => !plain(e) || !string(e.uri, 2048) || e.required === true))
                    throw error('UNSUPPORTED_EXTENSION');
                const skills = card.skills.map(s => { if (!plain(s) || !string(s.id, 128) || !string(s.name, 1024) || typeof s.description !== 'string' || s.description.length > 8192 || !Array.isArray(s.tags) || s.tags.length > 64 || !s.tags.every(t => string(t, 256)))
                    throw error('INVALID_CARD'); return { id: s.id, name: s.name, description: s.description, tags: [...s.tags] }; });
                let tools;
                if (entry.catalogUrl !== undefined) {
                    const ext = extensions.find(e => e.uri === TOOL_EXT);
                    if (entry.catalogUrl !== gateway + route + '/tool-catalog/v1' || ext?.params?.catalogUrl !== entry.catalogUrl || ext.params.schemaVersion !== '1.0.0')
                        throw error('INVALID_CATALOG');
                    const cat = await request(route + '/tool-catalog/v1', { identity: c.identity });
                    if (!plain(cat) || cat.schemaVersion !== '1.0.0' || cat.projectId !== project.projectId || cat.agentId !== entry.agentId || !Array.isArray(cat.entries) || cat.entries.length > 128)
                        throw error('INVALID_CATALOG');
                    tools = cat.entries;
                }
                result.push({ projectId: project.projectId, agentId: entry.agentId, environmentId: project.environmentId, name: card.name, description: card.description, skills, cardVersion: card.version, ...(tools ? { tools } : {}), streaming: card.capabilities.streaming === true, dedupe: extensions.some(e => e.uri === EXT && e.required === false) });
            }
        }
        return result;
    }
    // SSE is a notification channel only: every state transition is reconciled with GetTask.
    async function subscribe(r, controller, notify) {
        controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const c = await auth(r.identity);
            if (closed || controller.signal.aborted)
                return;
            const response = await fetchImpl(gateway + base(r.remote) + '/a2a', { method: 'POST', redirect: 'error', signal: controller.signal, headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/a2a+json', accept: 'text/event-stream', 'a2a-version': '1.0' }, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'SubscribeToTask', params: { id: r.taskId } }) });
            if (!response.ok || !/^text\/event-stream(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
                controller.abort();
                return;
            }
            let total = 0, frame = '';
            const decoder = new TextDecoder('utf-8', { fatal: true });
            for await (const chunk of response.body) {
                total += chunk.length;
                if (total > 1048576)
                    break;
                frame += decoder.decode(chunk, { stream: true });
                if (frame.length > 65536)
                    break;
                let end;
                while ((end = frame.search(/\r?\n\r?\n/)) !== -1) {
                    const event = frame.slice(0, end);
                    frame = frame.slice(end).replace(/^\r?\n\r?\n/, '');
                    if (event.split(/\r?\n/).some(line => line.startsWith('data:')))
                        notify();
                }
            }
        }
        catch { /* Stream loss never authorizes another SendMessage. */ }
        finally {
            controller.abort();
            clearTimeout(timer);
            controllers.delete(controller);
            notify();
        }
    }
    function publicRemote(r) { return { projectId: r.remote.projectId, agentId: r.remote.agentId, environmentId: r.remote.environmentId, requestId: r.requestId, ...(r.taskId ? { taskId: r.taskId } : {}), ...(r.contextId ? { contextId: r.contextId } : {}) }; }
    function launchInput({ profile, prompt, systemPrompt = '', opts }) {
        const remote = validateRemoteProfile(profile);
        if (opts?.project !== undefined && opts.project !== remote.localProject)
            throw error('PROJECT_MISMATCH');
        if (!string(prompt, 16384) || typeof systemPrompt !== 'string')
            throw error('INVALID_PROMPT');
        const combined = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
        if (Buffer.byteLength(combined) > 16384 || Buffer.byteLength(JSON.stringify(combined)) > 60000)
            throw error('PROMPT_LIMIT');
        return { remote, prompt: combined };
    }
    async function prepareRemote(args) {
        if (!id(args.id))
            throw error('INVALID_RUN');
        const { remote, prompt } = launchInput(args);
        check();
        const c = await auth();
        check();
        const initial = { version: 1, id: args.id, gateway, remote, identity: c.identity, prompt, requestId: randomUUID(), messageId: randomUUID(), taskId: null, contextId: null, attempted: false, dedupe: null, wire: null, wireDigest: null, cancelRequested: false, terminal: null };
        initial.intentDigest = intentDigest(initial);
        db.prepare('INSERT OR IGNORE INTO runs(id,record) VALUES (?,?)').run(args.id, JSON.stringify(initial));
        const stored = read(args.id);
        if (stored.identity !== c.identity)
            throw error('IDENTITY_CHANGED');
        if (stored.prompt !== prompt || JSON.stringify(stored.remote) !== JSON.stringify(remote))
            throw error('RUN_CONFLICT');
        return publicRemote(stored);
    }
    function handle(runId, profile, prompt, resume, emit = () => { }) {
        if (!id(runId))
            throw error('INVALID_RUN');
        const remote = validateRemoteProfile(profile);
        check();
        const existing = read(runId);
        if (resume && !existing)
            throw error('RUN_NOT_FOUND');
        if (existing && (JSON.stringify(existing.remote) !== JSON.stringify(remote) || (!resume && existing.prompt !== prompt)))
            throw error('RUN_CONFLICT');
        if (handles.has(runId))
            return handles.get(runId);
        let stopped = false, timer, wake, resolveDone, lastNotice = '', pendingCancel = false, readyResolve;
        const ready = new Promise(resolve => { readyResolve = resolve; });
        let streamController;
        const done = new Promise(resolve => { resolveDone = resolve; });
        const notify = e => { if (stopped || closed)
            return; try {
            emit(e);
        }
        catch { /* UI callback cannot change durable state */ } };
        const pause = ms => new Promise(resolve => { wake = resolve; timer = setTimeout(() => { wake = null; resolve(); }, ms); });
        const h = { done, async cancel() { if (stopped)
                return; pendingCancel = true; await ready; if (stopped || closed)
                return; update(runId, r => { r.cancelRequested = true; }); if (wake) {
                clearTimeout(timer);
                const release = wake;
                wake = null;
                release();
            } }, close() { stopped = true; streamController?.abort(); readyResolve(); clearTimeout(timer); if (wake) {
                const release = wake;
                wake = null;
                release();
            } handles.delete(runId); } };
        handles.set(runId, h);
        void (async () => {
            let failures = 0, prepared = false, streaming = false, streamAttempted = false, announcedTask = false;
            while (!stopped && !closed) {
                let firstDispatch = false;
                try {
                    let r = read(runId);
                    if (!r) {
                        const c = await auth();
                        if (stopped || closed)
                            break;
                        const initial = { version: 1, id: runId, gateway, remote, identity: c.identity, prompt, requestId: randomUUID(), messageId: randomUUID(), taskId: null, contextId: null, attempted: false, dedupe: null, wire: null, wireDigest: null, cancelRequested: pendingCancel, terminal: null };
                        initial.intentDigest = intentDigest(initial);
                        db.prepare('INSERT OR IGNORE INTO runs(id,record) VALUES (?,?)').run(runId, JSON.stringify(initial));
                        r = read(runId);
                        if (r.prompt !== prompt || JSON.stringify(r.remote) !== JSON.stringify(remote))
                            throw error('RUN_CONFLICT');
                    }
                    readyResolve();
                    await auth(r.identity);
                    if (stopped || closed)
                        break;
                    if (r.taskId && !announcedTask) {
                        announcedTask = true;
                        notify({ type: 'remote_task', remote: publicRemote(r) });
                    }
                    if (r.terminal) {
                        resolveDone(r.terminal);
                        h.close();
                        break;
                    }
                    // A known task is reconciled through its pinned route even if discovery is unavailable.
                    if (r.taskId) prepared = true;
                    if (!prepared) {
                        const agents = await discover(r.identity);
                        if (stopped || closed) break;
                        const selected = agents.find(a => a.projectId === remote.projectId && a.agentId === remote.agentId && a.environmentId === remote.environmentId);
                        if (!selected)
                            throw error('BINDING_UNAVAILABLE');
                        if (r.dedupe !== null && r.dedupe !== selected.dedupe)
                            throw error('CAPABILITY_CHANGED');
                        r = update(runId, row => { row.dedupe = selected.dedupe; });
                        prepared = true;
                        streaming = selected.streaming;
                    }
                    const rpc = async (method, params) => request(base(remote) + '/a2a', { identity: r.identity, isStopped: () => stopped, extensions: r.dedupe, body: { jsonrpc: '2.0', id: randomUUID(), method, params } });
                    let task;
                    if (!r.taskId) {
                        if (r.attempted && !r.dedupe)
                            throw error('SEND_UNCERTAIN');
                        if (r.cancelRequested && !r.attempted) {
                            const final = { status: 'cancelled', result: { type: 'result', result: '', is_error: false }, remote: publicRemote(r), costUsd: null, usage: null };
                            update(runId, row => { row.terminal = final; });
                            continue;
                        }
                        r = update(runId, row => {
                            if (row.taskId)
                                throw error('RECONCILE');
                            if (row.attempted && !row.dedupe)
                                throw error('SEND_UNCERTAIN');
                            if (row.cancelRequested && !row.attempted)
                                throw error('RECONCILE');
                            if (row.wire === null) {
                                row.wire = { message: { messageId: row.messageId, role: 'ROLE_USER', parts: [{ text: row.prompt, mediaType: 'text/plain' }] }, configuration: { returnImmediately: true }, ...(row.dedupe ? { metadata: { [EXT]: { requestId: row.requestId } } } : {}) };
                                row.wireDigest = digest(JSON.stringify(row.wire));
                            }
                            // Capture admission history inside the same transaction as the intent.
                            firstDispatch = !row.attempted;
                            row.attempted = true;
                        });
                        const response = await rpc('SendMessage', r.wire);
                        const parsed = validTask(response?.task);
                        task = parsed.task;
                        r = update(runId, row => { if (row.taskId && row.taskId !== task.id)
                            throw error('TASK_CHANGED'); row.taskId = task.id; row.contextId = task.contextId; });
                        announcedTask = true;
                        notify({ type: 'remote_task', remote: publicRemote(r) });
                    }
                    else {
                        if (r.cancelRequested) {
                            try {
                                await rpc('CancelTask', { id: r.taskId });
                            }
                            catch (e) {
                                if (e.code !== 'RPC_-32002')
                                    throw e;
                            }
                        }
                        task = validTask(await rpc('GetTask', { id: r.taskId }), r.taskId).task;
                    }
                    if (task.contextId !== r.contextId)
                        throw error('CONTEXT_CHANGED');
                    const parsed = validTask(task, r.taskId);
                    if (stopped || closed)
                        break;
                    if (terminal.has(task.status.state)) {
                        const status = task.status.state === 'TASK_STATE_COMPLETED' ? 'done' : task.status.state === 'TASK_STATE_CANCELED' ? 'cancelled' : 'error';
                        const final = { status, result: { type: 'result', result: parsed.text, is_error: status === 'error' }, ...(status === 'error' ? { error: 'A tarefa remota terminou sem sucesso.' } : {}), remote: publicRemote(r), costUsd: null, usage: null };
                        update(runId, row => { row.terminal = final; });
                        resolveDone(final);
                        h.close();
                        break;
                    }
                    if (streaming && !streamAttempted) {
                        streamAttempted = true;
                        streamController = new AbortController();
                        void subscribe(r, streamController, () => { if (wake) {
                            clearTimeout(timer);
                            const release = wake;
                            wake = null;
                            release();
                        } });
                    }
                    failures = 0;
                    lastNotice = '';
                    notify({ type: 'system', subtype: 'remote_status', remote: publicRemote(r), state: task.status.state });
                }
                catch (e) {
                    if (stopped || closed)
                        break;
                    failures++;
                    const code = typeof e?.code === 'string' ? e.code : 'REMOTE_UNCERTAIN';
                    if (firstDispatch && ['RPC_-32600', 'RPC_-32601', 'RPC_-32602', 'RPC_-32004', 'RPC_-32005', 'RPC_-32009'].includes(code)) {
                        const r = read(runId);
                        if (r && !r.taskId && r.attempted) {
                            const final = { status: 'error', result: { type: 'result', result: '', is_error: true }, error: `A2A: ${code}`, remote: publicRemote(r), costUsd: null, usage: null };
                            update(runId, row => { row.terminal = final; });
                            resolveDone(final);
                            h.close();
                            break;
                        }
                    }
                    if (lastNotice !== code) {
                        lastNotice = code;
                        notify({ type: 'system', subtype: 'remote_status', state: 'uncertain', code });
                    }
                }
                if (!stopped && !closed)
                    await pause(Math.min(30000, poll * 2 ** Math.min(failures, 5)));
            }
        })().catch(() => { notify({ type: 'system', subtype: 'remote_status', state: 'uncertain', code: 'JOURNAL_UNCERTAIN' }); });
        return h;
    }
    return {
        prepareRemote,
        async status() { try {
            await auth();
            return { resolved: null, version: null, configDirOk: true, error: null, available: true, executionMode: 'remote' };
        }
        catch {
            return { resolved: null, version: null, configDirOk: true, error: 'A2A: AUTH_REQUIRED', available: false, executionMode: 'remote' };
        } },
        async discoverAgents() { const agents = await discover(); return { agents: agents.map(({ dedupe, streaming, ...publicAgent }) => publicAgent) }; },
        startRemote({ id: runId, profile, prompt, systemPrompt = '', opts, emit }) {
            let combined;
            try {
                combined = launchInput({ profile, prompt, systemPrompt, opts }).prompt;
            }
            catch (e) {
                return failedHandle(e.code ?? 'INVALID_INPUT');
            }
            return handle(runId, profile, combined, false, emit);
        },
        resumeRemote({ id: runId, profile, emit }) { return handle(runId, profile, undefined, true, emit); },
        getRun(runId) { const r = read(runId); return r ? { id: r.id, taskId: r.taskId, cancelRequested: r.cancelRequested, remote: publicRemote(r) } : null; },
        close() { if (closed)
            return; for (const h of [...handles.values()])
            h.close(); closed = true; for (const c of controllers)
            c.abort(); db.close(); },
    };
}
