import { createA2AClient, validateRemoteProfile } from './client.mjs';
export function register(ctx) {
    const client = createA2AClient({ ...ctx.settings(), dataDir: ctx.dataDir(), tokenProvider: () => ctx.secret('SQUAD_A2A_TOKEN') });
    ctx.onDispose(() => client.close());
    ctx.registerRoute('GET', '/agents', () => client.discoverAgents());
    ctx.registerAdapter('a2a', {
        kind: 'a2a', label: 'A2A', executionMode: 'remote', efforts: [], genAiSystem: 'a2a', colleagues: 'none',
        status: () => client.status(),
        catalog: () => ({ label: 'A2A', executionMode: 'remote', models: [], efforts: [], discoveryPath: '/api/plugins/a2a-client/agents' }),
        validateProfile(src, p) { p.remote = validateRemoteProfile(src); },
        profileExtras: p => ({ executionMode: 'remote', remote: p.remote }),
        prepareRemote: args => client.prepareRemote(args),
        startRemote: args => client.startRemote(args), resumeRemote: args => client.resumeRemote(args),
    });
    return { discoverAgents: () => client.discoverAgents() };
}
