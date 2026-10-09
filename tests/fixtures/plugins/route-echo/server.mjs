export default {
  register(ctx) {
    const { http } = ctx;
    ctx.registerRoute('GET', '/echo', (req, res, { url }) => ({ method: req.method, query: Object.fromEntries(url.searchParams) }));
    ctx.registerRoute('POST', '/echo', async (req, res, { body }) => ({ method: req.method, body: await body() }));
    ctx.registerRoute('GET', '/items/:id', (req, res, { params }) => ({ id: params.id }));
    ctx.registerRoute('GET', '/items/:id/parts/:part', (req, res, { params }) => params);
    ctx.registerRoute('GET', '/items/new', () => ({ literal: true }));
    ctx.registerRoute('GET', '/teapot', () => ({ status: 418, body: { ok: false, error: 'sou um bule' } }));
    ctx.registerRoute('GET', '/raw', (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('direto'); });
    ctx.registerRoute('GET', '/:a/x', () => ({ which: 'a-x' }));
    ctx.registerRoute('GET', '/y/:b', () => ({ which: 'y-b' }));
    ctx.registerRoute('GET', '/proto/:id', (req, res, { params }) => ({ nullProto: Object.getPrototypeOf(params) === null, id: params.id }));
    ctx.registerRoute('GET', '/runs', () => ({ plugin: 'route-echo' }));
    ctx.registerRoute('GET', '/boom', () => { throw new Error('explodiu'); });
    ctx.registerRoute('GET', '/boom-async', async () => { throw Object.assign(new Error('recusado'), { status: 422 }); });
    ctx.registerRoute('POST', '/fail-helper', async (req, res) => { http.fail(res, 409, 'conflito'); });
    ctx.registerRoute('GET', '/bad-subpaths', () => {
      const out = {};
      for (const sub of ['/../runs', '/a//b', 'sem-barra', '/a/..', '/x y', '/p/:__proto__', '/p/:constructor', '/p/:prototype']) { try { ctx.registerRoute('GET', sub, () => ({})); out[sub] = 'aceito'; } catch (e) { out[sub] = 'recusado'; } }
      try { ctx.registerRoute('TRACE', '/t', () => ({})); out.TRACE = 'aceito'; } catch { out.TRACE = 'recusado'; }
      return out;
    });
  },
};
