import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bin.mjs');

// settings: { kind: 'x-echo', failAfter: true (lança depois de registrar), twice: true (registra o kind duas vezes), invalid: true (impl sem funções) }
export function register(ctx) {
  const settings = ctx.settings();
  const kind = settings.kind || 'x-echo';
  let last = null; // o que o prepare viu do run (GET /last)
  const agentKeys = o => Object.fromEntries(Object.entries(o?.agents || {}).map(([k, v]) => [k, Object.keys(v).sort()]));
  ctx.registerRoute('GET', '/last', () => ({ last }));
  const impl = {
    kind, label: 'X Echo', efforts: ['low'], genAiSystem: 'x-echo', colleagues: 'none',
    defaultBin: () => BIN,
    notFound: (bin, profile) => `x-echo não encontrado ("${bin}") no Perfil "${profile.name}".`,
    catalog: () => ({ models: [{ id: 'x-1', label: 'X 1' }], efforts: ['low'] }),
    resolveModelEffort: ({ model, effort }) => ({ model, effort }),
    nativeTelemetry: (run, profile, { args }) => { args.push('--telemetry-called'); },
    async prepare({ run, opts, env, prompt, systemPrompt, model }) {
      last = { runKeys: Object.keys(run).sort(), runAgents: agentKeys(run.opts), specAgents: agentKeys(opts), hasAgentMeta: 'agentMeta' in opts || 'agentMeta' in (run.opts || {}), profileId: run.profile?.id ?? null, kind: run.kind ?? null, effort: run.effort ?? null };
      env.XECHO_OWN = 'meu';
      return { args: ['--run'], stdin: systemPrompt ? `${systemPrompt}|${prompt}` : prompt, files: [], translator: null, tail: [], model: model || 'x-1' }; },
    finish: () => ({ usage: { input: 11, output: 5 } }),
    refreshWindows: async () => ({ observed: false }),
  };
  if (settings.invalid) return ctx.registerAdapter(kind, { kind, label: 'sem funções' });
  ctx.registerAdapter(kind, impl);
  if (settings.twice) ctx.registerAdapter(kind, impl);
  if (settings.failAfter) throw new Error('falhou depois de registrar o adapter');
}
