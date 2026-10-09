import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function register(ctx) {
  if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, 'register hello\n');
  const settings = ctx.settings();
  ctx.log('olá do hello');
  ctx.registerRoute('GET', '/hello', () => ({
    greeting: settings.greeting || 'oi',
    frozen: Object.isFrozen(settings),
    secret: ctx.secret('HELLO_SECRET') ?? null,
    caps: ctx.hasCapability('run.mutate'),
  }));
  ctx.registerRoute('GET', '/other-secret', () => { try { return { value: ctx.secret('PATH') }; } catch (e) { return { error: e.message }; } });
  ctx.registerRoute('GET', '/data-dir', () => ({ dir: ctx.dataDir() }));
  ctx.registerRoute('GET', '/late', () => { try { ctx.registerRoute('GET', '/tarde', () => ({})); return { threw: false }; } catch (e) { return { threw: true, message: e.message }; } });
  ctx.onDispose(() => { writeFileSync(path.join(ctx.dataDir(), 'disposed.txt'), 'bye'); });
  return { greet: name => `oi, ${name}` };
}
