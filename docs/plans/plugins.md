# Plugins do bridge e adapters em registro

Inspirado no sistema de plugins do Hermes Agent (hermes-agent.nousresearch.com/docs/developer-guide/plugins), sem dependências
externas. Princípio (ADR 0004): **plugins nunca alteram o núcleo; o núcleo oferece pontos de extensão.** Escopo destas fases: só o
bridge (adapters plugáveis, rotas, eventos, `beforeSpawn`). Extensão da página (`ui.js`) fica para uma fase posterior.

## Decisões

1. Plugins rodam **in-process, com confiança total** (não é sandbox). `capabilities` + `grants` são consentimento auditável, não
   contenção. Documentado no README e no ADR 0004.
2. **Código só por configuração local.** `plugins.paths`, `plugins.enabled` e `grants` de plugins com `server` valem apenas em
   `squad.local.json` / `SQUAD_CONFIG` (git-ignored). No `squad.config.json` compartilhado viram aviso e são ignorados; o mesmo vale
   para `settings`, `failClosed` e `hookTimeoutMs`, e o `plugins.disabled` compartilhado não desliga plugin com `server`. Plugins só
   de conteúdo (sem `server`, `docs/plans/plugins-conteudo.md`) podem vir de qualquer arquivo e não exigem `enabled`.
   `runtime.permissionMode`, `addDirs` e `extraAllowedTools` vindos de fonte compartilhada (config ou plugin achado só por ela)
   também são ignorados com aviso (ver `docs/plans/plugins-conteudo.md`).
3. **Importação dentro do callback do `listen`.** Descoberta e validação dos manifestos (só leitura) antes; `import()` + `register`
   depois de a porta ser nossa. `plugins.ready` é aguardado por `handle()` (após `tokenOk`), `serveIndex`, `startRun` (junto de
   `configProfilesReady`) e `afterOpen` (antes de `syncConfigProfiles`).
4. `run:beforeSpawn` é **fail-open** por padrão; `plugins.entries.<id>.failClosed: true` vira bloqueio.
5. Observadores com fila limitada (1000, descarta o mais antigo), `setImmediate`, tempo limite por handler (3 s,
   `plugins.hookTimeoutMs`, `SQUAD_PLUGIN_HOOK_TIMEOUT_MS` nos testes) e disjuntor após 20 falhas seguidas.
6. Perfis com adapter de plugin entram só por `POST /api/profiles` nesta fase (o enum do schema da config fica com os embutidos).
7. `ctx.onDispose(fn)` (1 s no shutdown). `run:blocked` adiado. `dataDir()` preguiçoso, documentado.
8. Campo de pastas: `plugins.paths`. `apiVersion: 1`; maior é recusado com mensagem.
9. Com zero plugins o comportamento e as respostas são idênticos aos de hoje (objeto nulo; `emit` sem assinantes é um `if`).
10. Testes novos em `tests/adapters.test.mjs` e `tests/plugins.test.mjs`; os 48 de `bridge.test.mjs` não mudam de asserção.
    `package.json`: `node --test tests/bridge.test.mjs tests/adapters.test.mjs tests/plugins.test.mjs` (nunca `tests/`, que
    executaria os fakes).

## Passos

### Passo 1: Contrato
ADR 0004, este documento, `CONTEXT.md` (Plugin: conteúdo e/ou código, código só pela Configuração local; Capacidade; Adapter
registrado no bridge).

### Passo 2: Registro de adapters e funções puras
Apêndice A2 e A5: `adapters/index.js` (registro), `adapters/claude.js` e `adapters/codex.js` com as funções puras movidas do
`server.js` (uso, janelas, catálogo, esforços, args, tradutor, sessão). Testes unitários em `tests/adapters.test.mjs`. Sem mudança
de comportamento.

### Passo 3: `server.js` passa a usar o registro
Apêndice A1/A2: lookups simples, lançamento (`prepare`, `files`, `tail`, `mcpToken`), fim da execução (`finish`, `onEvent`,
`recordWindows`), `refreshWindows`, `settingsFile`, `engines`, catálogo. `npm test` verde a cada troca; teste novo de Perfil com
adapter desconhecido.

### Passo 4: Schemas, descoberta e ordem
Apêndice A4: `schemas/squad-plugin.schema.json`, `plugins` em `squad.schema.json`, `CONSTANTS` (`PLUGIN_CAPABILITIES`,
`PLUGIN_EVENTS`); `plugins.js` passa a descobrir todos os plugins (um caminho só, `discover` e `orderPlugins`; conteúdo, código ou os
dois no mesmo manifesto); `plugin-host.js` com o host de código; `GET /api/plugins` único; decisão 2.

### Passo 5: Carga, `register` e rotas
Apêndice A4: `import()` no `listen`, `plugins.ready`, `ctx` (`log`, `settings`, `dataDir`, `secret`, `onDispose`, `hasCapability`,
`use`), isolamento de erro e congelamento do ctx; `registerRoute` sob `/api/plugins/<id>/` com token/Host/Origin do núcleo.

### Passo 6: Eventos e `beforeSpawn`
Apêndice A3: `run:start`, `run:event`, `run:finish`, `profile:usage`, `workspace:saved`; `run:beforeSpawn` depois da reserva
síncrona (veto devolve a vaga), `appendSystem`, fail-open/failClosed, `run.content`.

### Passo 7: `registerAdapter`
Adapter de plugin (`adapter`, `adapter.override`), `engines` e catálogo dinâmicos, erro claro com plugin desligado.

### Passo 8: Documentação e revisão
README, `CLAUDE.md`, `scripts/dev.mjs` observando `plugins.js` e `adapters/`, "Desvios" neste arquivo; revisão do Codex.

## Desvios

Passos 2 e 3 (registro, `adapters/claude.js`, `adapters/codex.js`, `server.js` consultando o registro). O que divergiu do Apêndice:

- **`host` ganhou `ROOT` e `longPath`.** `APP_MEMORY_EXCLUDES` (só o Claude usa) foi para `adapters/claude.js` e precisa deles. O resto de `host` segue A2.
- **`nativeTelemetry` recebe também `attrs`** (`squadAttrs(run)`, que fica no núcleo junto do `sendTrace`); o Claude monta `OTEL_RESOURCE_ATTRIBUTES` com ele. O núcleo resolve `cfg`, `base`, `content` e `headers` e só chama o adapter quando o Perfil liga a telemetria nativa.
- **O registro é uma fábrica**, `createRegistry(host)` (não um singleton do módulo): cada start/teste tem o seu, e os embutidos são carregados dali. `register(impl, {override})` guarda uma cópia rasa com `builtin` (um override de embutido tem `builtin: false`; `builtinKinds()` continua listando o kind). `validateAdapter` é exportado. Sem `unregister` ainda (entra com o passo 5/7, quando um erro no `register` do plugin precisar desfazer).
- **Formato validado:** `kind` `/^[a-z][a-z0-9-]{0,39}$/`, `label`, `efforts`, `genAiSystem`, `colleagues` (`native|mcp|none`) e as funções obrigatórias (`defaultBin`, `notFound`, `catalog`, `resolveModelEffort`, `prepare`, `finish`, `refreshWindows`); as opcionais, se existirem, são funções. `label` e `colleagues` não eram usados pelo núcleo ainda.
- **`recordWindows(profileId, windows, source)`** devolve se gravou e, em falha, avisa no console (até 3 vezes por processo) em vez de engolir calado. Antes, `event` e `session` engoliam o erro sem aviso e o `refresh` do codex o propagava como 500; agora nenhuma origem derruba a requisição. `source` ainda não é usado (os eventos entram no passo 6). O `finish` devolve `windows` e o núcleo grava com `'session'`, qualquer que seja o adapter. O `refreshWindows` do codex grava por `host.saveWindows(..., 'refresh')` e só devolve `observed: true` se gravou (sem banco, `observed` passa a ser `false`; antes era `true` com janelas lidas). O do claude depende do `onEvent` (`'event'`) do run de sondagem.
- **`onEvent` e `finish` rodam sob try/catch no núcleo.** `onEvent` (caminho quente) avisa uma vez por execução no console; `finish` que lança vira `console.warn` e um evento `bridge/warning` no run, e o run fecha sem `result`/`usage` do adapter. Antes o código era inline e não lançava; um adapter de plugin pode.
- **Temporários do adapter:** o núcleo passa `files: []` no `spec` e o adapter registra cada arquivo *antes* de escrevê-lo; `prepare`, `nativeTelemetry`, o teste de `parentAlive` e o `spawn` ficam num try/catch que remove `files` se algo lançar. (Antes, uma falha entre a escrita do primeiro arquivo e o spawn vazava os temporários.) `prepare` pode devolver `files`; os itens novos são somados.
- **`resetsAt` inválido** (ex.: `1e20`) no `rate_limit_event` vira `null` em vez de lançar `RangeError` em `toISOString()`.
- **`prepare` do codex não coloca o `-` no fim**: ele vem em `tail: ['-']` e o núcleo o acrescenta depois da telemetria nativa. `codexArgs` perdeu o parâmetro `run`, que não usava; os testes de argv passam por `adapter.prepare`.
- **`profileBin(p, claudePath)`** chama `defaultBin({claudePath, claudePathSet: !!claudePath})` e devolve `''` quando o adapter não está no registro (quem usa o Perfil já trata o adapter ausente antes: `profileStatus`, `startRun`, `/api/health`); o `claudePathSet` real continua só em `opts` (usado pelo Chamado). O `/api/health` agora usa `profileBin(p, bin)` em vez do ramo `adapter === 'claude' && !p.bin`.
- **Adapter ausente do registro:** `startRun` lança 400 (`O Adapter "x" do Perfil "Y" não está disponível...`) antes de reservar vaga; `profileStatus` devolve `error` com a mesma mensagem (sem `binVersion`); `/api/profiles/:id/refresh` responde 400; `/api/health` ignora esses Perfis em `engines`. `pickProfile` não consulta o registro, então não quebra.
- **`validateProfile`:** a mensagem lista os kinds do registro ("Use claude ou codex." enquanto só há os embutidos) e `impl.validateProfile?.(src, p)` roda depois das checagens do núcleo. O enum de `plugins.js`/`db.js` continua sendo os embutidos (teste `builtinKinds() == CONSTANTS.ADAPTERS`).
- **Ficam no núcleo, de propósito:** `DEFAULT_CODEX_BIN` e `afterOpen`/`ensureCodexDefault` (o `db.js` é dono dos ids padrão, A1), `MEM_DEFAULT` com `adapter: 'claude'`, e em `/api/health` o `{ adapter: 'claude' }` de `claudeVersion` (é o interruptor demo/ao vivo da página, que depende do Claude por definição). `grep "=== 'codex'" server.js` não encontra mais nada.
- **`cut4k`** subiu para o bloco de helpers do `server.js` (os adapters o recebem pelo `host`); `adapters/claude.js` importa `WINDOWS` de `db.js`.
- **Testes:** `tests/golden-argv.json` guarda o argv completo de 7 execuções (claude cheio/mínimo/telemetria nativa, codex cheio/somente leitura/modelo do Claude/telemetria nativa) gerado pelo `server.js` do HEAD antes do registro; o teste compara o argv atual com ele (caminhos e porta normalizados), e confere que os `-c otel.*` vêm antes do `-` final. O teste do Adapter desconhecido usa teto 1 no Perfil e repete a execução para provar que nenhuma vaga foi tomada; o do vazamento usa um `serviceName` com NUL (o `spawn` lança síncrono depois de o adapter escrever os arquivos). A ADR 0001 não tem tabela, então o tradutor foi testado contra a descrição dela e o mapeamento do código (system/assistant/user/result, `Agent` para `chamar_colega`, uso somado por turno). Os testes de integração de `adapters.test.mjs` usam portas 4800+ para não colidir com os de `bridge.test.mjs` (que rodam em paralelo, em outro processo). `package.json` ainda não inclui `plugins.test.mjs` (não existe; entrou no passo 5).

Passos 4 e 5 (schemas, descoberta, ordem, carga, `ctx` e rotas). O que divergiu do Apêndice:

- **Um plugin só, uma descoberta só.** Não há um segundo carregador: `plugins.js` (o dos plugins de conteúdo) passa a descobrir todos os plugins, de `plugins.paths` de cada arquivo, de `SQUAD_PLUGINS` e de `~/.squad-code/plugins/<id>/`, e o mesmo `squad-plugin.json` traz conteúdo, código (`server`) ou os dois. O host do código (`createPluginHost`, `ctx`, rotas) fica em `plugin-host.js`, que recebe de `plugins.js` a lista descoberta (`load().discovery = {plugins, config, warnings}`, cada item com `key, id, dir, local, source, manifest, serverFile, hasCode, content, status?, error?`); `orderPlugins` mora em `plugins.js` (o carregador também a usa para os plugins só de conteúdo) e `plugin-host.js` a reexporta. A configuração dos plugins com código (`entries`, com `settings`) **não** aparece em `api.config`; `enabled` aparece. O cache do carregador cobre as pastas, os manifestos e a pasta do home.
- **`buildPlugin(dir, ctx)`** devolve `{plugin, meta, id, realRoot, read, tag}` (`plugin` = o conteúdo); `ctx.gate(meta, info)` permite ao chamador parar antes de ler o conteúdo. `ctx.seen` (id → pasta) controla o id repetido. `createInsideReader` ganhou `read.locate()` (caminho real validado, para o módulo que o bridge importa em vez de ler).
- **Plugin com `server` também traz conteúdo**, mas o conteúdo só é lido com o id em `plugins.enabled` (fonte local) e só entra na página (`#squad-plugins`) enquanto o código está `active`: um `register` que falha tira o conteúdo da página e de `/api/plugins` (`selectContent`). Plugin com código sem conteúdo nenhum fica fora da tag. Um plugin recusado depois de o id ser conhecido (manifesto inválido, `apiVersion` maior, `server` fora da pasta ou com extensão errada, código por arquivo compartilhado) aparece em `/api/plugins` com `status` `invalid` ou `blocked` e `error`; pasta do home com nome diferente do id e pasta ausente só avisam.
- **Decisão 2 na prática:** `enabled`, `grants`, `settings`, `failClosed` e `hookTimeoutMs` no arquivo compartilhado são avisos e ignorados; `plugins.paths` do compartilhado vale para plugins só de conteúdo, e um plugin com `server` achado só por ele é `blocked`. Se a mesma pasta também estiver em `plugins.paths` do arquivo local (ou em `SQUAD_PLUGINS`), passa a valer como local. Plugins da pasta do home contam como locais (e também precisam de `enabled` para rodar).
- **`GET /api/plugins` é um só:** `{ok, plugins, runtime, warnings, config, restartRequired}`; cada plugin traz o resumo do conteúdo que está na página (`path, categories, presets, avatars` sem `src`, `themes, conventions, runtime`; vazio quando o plugin não está na página) e o estado do código (`hasCode, status, error, source, requires, env, capabilities {asked, granted, missing}, routes, events, adapters, warnings`). Estados: `data` (só conteúdo, ativo), `active` (código carregado), `disabled` (fora de `enabled`, `plugins.disabled` ou dependência desligada; `error` vazio no primeiro caso), `pending`/`loading` (só durante o start), `error`, `denied`, `invalid`, `blocked`. `/api/health.plugins` conta `active` + `data`. O conteúdo é relido a cada chamada; o código não: `restartRequired` compara uma assinatura dos plugins com código (ids, pastas, manifesto) e de `enabled`, `entries` e `hookTimeoutMs` do start com a atual, e um plugin com código que surgiu depois do start aparece `disabled` até reiniciar. `source` é `config` ou `home`. A linha do log sai depois da carga, com todos os plugins ("acme 1.2.0 (2 agente(s))", "hello 1.0.0 (ativo)", "x (desligado: motivo)"; "Plugins: nenhum" sem nenhum): é a única asserção de `bridge.test.mjs` que mudou.
- **`orderPlugins`** devolve `{order, disabled: [{id, reason: 'off'|'requires'|'cycle', message}], warnings}`; plugins só de conteúdo entram na ordem (podem ser dependência). **Ciclo = fail-closed:** os membros do ciclo ficam `disabled` ("ciclo de dependências com X"), quem depende deles também ("depende de um plugin em ciclo"), e o aviso diz "os membros do ciclo ficam desligados" (não carregam em ordem alfabética, ao contrário do que o A4 dizia).
- **Rota de plugin desconhecido** (`/api/plugins/<id desconhecido>/...`) cai no 404 do núcleo ("Rota não encontrada."), idêntico a antes; plugin conhecido mas não ativo responde 404 "não está ativo (status)". Um handler que devolve `undefined` sem ter respondido deixa a resposta com ele (SSE/escrita assíncrona); `{status, body}` só vale com `status` inteiro e a chave `body`. Um `throw` simples vira 500 com a mensagem genérica "Erro interno no plugin." (o detalhe e o stack só vão para o log); erros com `status` explícito (4xx/5xx, p.ex. 413 do `readBody`) mantêm status e mensagem. Valor de `:param` decodificado com `/`, `\\` ou NUL é 400; `params` é `Object.create(null)` e `__proto__`/`constructor`/`prototype` não servem de nome de `:param`. Barras repetidas e a final colapsam como no núcleo (`split('/').filter(Boolean)`); plugin só de conteúdo responde 404 "só de conteúdo e não tem rotas". Subcaminho: `/` ou segmentos `[A-Za-z0-9._~-]+` / `:param`, sem `.` nem `..`, métodos GET/POST/PUT/PATCH/DELETE; rota repetida lança. Entre rotas que casam, o desempate é segmento a segmento da esquerda para a direita (literal antes de `:param`: `/y/:b` vence `/:a/x` para `/y/x`).
- **`ctx` nesta fase:** `id`, `apiVersion`, `log` (`log.warn`, `log.error`; prefixo `[plugin <id>]`), `settings()`, `dataDir()` (cria `<DATA_DIR>/plugins/<id>/` na primeira chamada; é a única coisa que o bridge grava em disco por plugin e pode acontecer antes de existir banco), `secret(nome)`, `onDispose(fn)`, `hasCapability`, `use(id)` (só ids de `requires`), `http`, `registerRoute` e `on`. **`on` só registra** (valida o evento, exige `run.mutate` para `run:beforeSpawn` e aparece em `events`); nada emite ainda (passo 6). **`registerAdapter` não existe** (passo 7; o registro de adapters ainda não tem `unregister`). `registerRoute`, `on` e `onDispose` lançam depois do `register`; os demais métodos continuam valendo. `settings()` é validada antes do `import()`: settings inválidas (ou acima de 16 KB) deixam o plugin em `error` sem rodar nem importar nada. O `this` de `register` é o módulo (ou `default`, se foi de lá que veio).
- **Tempo do `register`:** 10 s (import incluído); `SQUAD_PLUGIN_REGISTER_TIMEOUT_MS` encurta nos testes. Depois do estouro o ctx já está congelado, então um `register` que continuasse rodando não registra mais nada. Falha, estouro ou `denied`: rotas e eventos saem, os `onDispose` já registrados rodam na hora (1 s), e os dependentes ficam `disabled` ("depende de X, que não carregou (error)").
- **Espera:** `host.pending` é `true` só enquanto os plugins carregam; `handle()` (depois de `tokenOk`), `serveIndex`, `startRun` (antes de `configProfilesReady`) e `afterOpen` só esperam `plugins.ready` nesse intervalo, então com zero plugins o caminho é o de antes.
- **Shutdown:** `dispose()` marca `host.closing` (o loop de carga para; os que faltavam ficam `disabled` "bridge encerrando"), espera até 1 s o `register` em andamento, congela o ctx do que ainda está em `loading` e roda os `onDispose` de todos em paralelo (1 s cada, inclusive os de um plugin que ainda carregava). O processo espera 300 ms sem nenhum, 1,2 s com `onDispose` e 2,3 s se ainda estava carregando.
- **Orçamento de carga:** todos os `register` juntos têm 30 s (`SQUAD_PLUGIN_LOAD_BUDGET_MS` nos testes); o que estoura ou sobra vira `error` "tempo total de carga esgotado" (sem importar os que sobraram).
- **Revisão (segurança):** o `plugins.disabled` do compartilhado não desliga plugin com `server` (só o local); plugin desligado por `plugins.disabled` ou por `requires` não atendido (também os só de conteúdo, que saem da página) continua em `/api/plugins` como `disabled`. `settings`, `failClosed` e `hookTimeoutMs` só valem do arquivo local. `runtime.permissionMode`, `addDirs` e `extraAllowedTools` de fonte compartilhada são ignorados com aviso (um plugin só vale como local se algum arquivo local o nomear, via `SQUAD_PLUGINS` ou na pasta do home). Ids reservados do Windows são recusados (`CONSTANTS.WINDOWS_RESERVED_RE`, a mesma regra das pastas de projeto). Id repetido: as fontes locais são lidas primeiro e vencem; a repetida (ou a recusada) aparece em `/api/plugins` com `status: invalid`, com chave própria por pasta (`id@pasta`), e a rota/`use()` respondem pelo plugin válido. As mensagens de `settings` inválidas citam o campo e a regra, nunca o valor (nem no log); `configSchema` com `pattern` acima de 200 caracteres, `anyOf`/`oneOf` com mais de 16 alternativas ou mais de 32 níveis é recusado antes de validar (`error`).
- **Para o passo 6 (S-L9):** o despachante de eventos filtra o payload pelo grant de cada plugin: `prompt`/`systemPrompt` só com `run.content`, o workspace só com `workspace.read`; sem o grant o campo nem existe no objeto entregue.
- **Testes:** `tests/plugins.test.mjs` (35 testes, portas 4700-4799 reservadas, `startBridge` próprio com `SQUAD_HOME`, `SQUAD_CONFIG`, `SQUAD_CONFIG_SHARED` e dados temporários), fixtures em `tests/fixtures/plugins/` (`hello`, `throws-on-register`, `not-enabled`, `bad-settings`, `route-echo`, mais `hangs-on-register`, `no-grant`, `needs-hello`, `content-only`, `code-and-content`, `slow`, `zz-after`, `cycle-a` e `cycle-b`). `no-grant` (A5, passo 6) entrou já aqui porque `on('run:beforeSpawn')` é o jeito de provar `denied` sem `registerAdapter`; `code-and-content` prova o manifesto único (conteúdo só com `enabled` e só com o código ativo). O corpo acima de `MAX_BODY` derruba a conexão (o `readBody` do núcleo destrói a requisição): o teste distingue `status 413` de `derrubada`, aceita só esses dois e confere `/api/health` depois. Os testes de `throws-on-register`/`hangs-on-register` conferem por arquivo marcador que o `onDispose` rodou, que as rotas ficaram vazias e que o registro tardio foi recusado; o do plugin `slow` prova que `/api/health` e `serveIndex` esperam `plugins.ready`.

---

## Apêndice: blueprint do arquiteto

Os números de linha referem-se ao `server.js` antes do passo 3.

### A1. Ramos por adapter no server.js

| Linha | O que faz | Destino |
|---|---|---|
| 37, 236 | `DEFAULT_CODEX_BIN`; `profileBin` escolhe o padrão | `adapter.defaultBin` |
| 237 | `codexHome(p)` | `adapter.home` |
| 278 | `profileView` com `modelEfforts` do codex | `adapter.profileExtras` |
| 282-309 | `codexModels`, `adaptersCatalog`, `codexEffort` | `adapter.catalog`, `adapter.resolveModelEffort` |
| 320, 335 | `validateProfile`: adapter e esforços | `ADAPTERS.has(kind)`, `adapter.efforts` |
| 92, 806, 847 | `ALL_EFFORTS` | `allEfforts()` sobre o registro |
| 63-72 | `afterOpen` + `ensureCodexDefault` | fica no núcleo (db.js dono dos ids padrão) |
| 683 | `gen_ai.system` | `adapter.genAiSystem` |
| 695-708 | `nativeTelemetry` | `adapter.nativeTelemetry` |
| 732-735, 741-757 | janelas pelo `rate_limit_event`, `claudeWindows` | `adapter.onEvent` |
| 758-763 | `claudeUsage` | `claude.finish` |
| 855-955 | `CODEX_WRITE_TOOLS`, `claudeLike`, `inGitRepo`, `codexArgs`, `codexTranslator` | `adapters/codex.js` (`prepare`) |
| 957-1046 | sessão do codex | `adapters/codex.js` (interno) |
| 1048-1049, 1168, 1203 | `mcpTokens` | núcleo registra o `mcpToken` devolvido por `prepare` |
| 1085-1087 | não encontrado / esforço | `adapter.notFound`, `adapter.validateLaunch` |
| 1111-1157 | lançamento codex e claude | `adapter.prepare` |
| 1158-1159 | telemetria nativa e `-` | núcleo chama `nativeTelemetry`; `-` vira `tail` |
| 1162-1167, 1237 | arquivos temporários e máscara em `run.args` | `run.files = [{path, mask}]` |
| 1207-1220 | fim do processo por adapter | `adapter.finish` |
| 1310-1322 | `refreshWindows` | `adapter.refreshWindows` |
| 1336-1337 | `settingsPath` só claude | `adapter.settingsFile?` |
| 1425-1434, 1527 | `engines`, `adaptersCatalog()` | iteram o registro |

`db.js` e `plugins.js` (`ADAPTERS`) e o enum do schema continuam sendo a lista dos **embutidos**; teste novo
`registry.builtinKinds() == CONSTANTS.ADAPTERS`.

### A2. Interface

Cada módulo: `module.exports = host => adapter`. `host` = `{HOME, HOST, PORT, TMP_DIR, DEFAULT_BIN, DEFAULT_CODEX_BIN, MODEL_RE,
cut4k, resolveBin, startRun, saveWindows(profileId, windows, source), warn, fsp, EFFORTS, CODEX_EFFORTS}`.

```js
Adapter = {
  kind, label, builtin,
  efforts: string[],
  genAiSystem: string,
  colleagues: 'native'|'mcp'|'none',
  defaultBin({claudePath, claudePathSet}) -> string,
  notFound(bin, profile) -> string,
  home?(profile|null) -> string|null,
  catalog() -> {models:[{id,label}], efforts, modelEfforts?},
  profileExtras?(profile) -> object,
  status?(profile) -> Promise<{resolved,version,configDirOk,error}>,
  validateProfile?(src, p) -> void,
  validateLaunch?(opts, profile) -> void,          // throws
  resolveModelEffort({opts, profile, model, effort, warn}) -> {model, effort},
  prepare(spec) -> Promise<{args, stdin, files:[{path,mask}], translator|null, mcpToken?, tail:string[], model}>,
  nativeTelemetry?(run, profile, {env, args, warn, base, cfg, content, headers}) -> void,
  onEvent?(run, event) -> {windows?}|void,          // síncrono, caminho quente
  finish(run, {code, durationMs}) -> {result?, usage, model?, windows?},
  refreshWindows(profile) -> Promise<{observed}>,
  settingsFile?(profile) -> string|null,
}
```
`spec` = `{id, run, opts, profile, model, effort, prompt, systemPrompt, env, warn, tmpDir}` (o adapter altera `env`). `translator`
segue o contrato de `codexTranslator` (`{feed, finish, openCall, state}`); `null` = passagem direta (claude).

Invariantes: sem `await` entre `parentAlive` (1162), spawn (1166) e `parent.children.add` (1169); o `mcpToken` é registrado nesse
trecho síncrono; `tail` vem depois do `nativeTelemetry`; máscaras `<system-prompt-file>`, `<settings-file>`, `<agents-file>`
iguais; `finish` devolve janelas e o núcleo grava; adapter ausente do registro (plugin desligado) = erro claro em `startRun` e em
`profileView.status.error`, sem quebrar `pickProfile`.

Fica no núcleo: `pickProfile`, `overLimit`, `fallbackId`, admissão, `configProfilesReady`, Perfis da config, `spawnBin`, `killTree`,
`resolveBin`, `binVersion`, timeout, `pushEvent`, `persistEvent`, OTLP/`sendTrace`, `/mcp`, `callColleague`, `validateAgents`,
`validateRunOptions`, editor de settings.json, `db.js`.

### A3. Eventos

| Evento | Onde | Payload |
|---|---|---|
| `run:start` | após `pushEvent` dos warnings (1174), antes do timer (1176) | `{runId, parentRunId, rootRunId, kind, label, project, projectId, agentId, featureId, profileId, profileName, adapter, model, cwd, pid, startedAt, fallbackFrom}` |
| `run:event` | em `pushEvent` (714-721), após `observe` | `{runId, event}`; sem `stream_event` salvo opt-in `{partial:true}` |
| `run:finish` | após `sendTrace` (1234), antes de fechar clients | `{runId, parentRunId, kind, profileId, adapter, model, status, isError, error, code, costUsd, durationMs, numTurns, usage, sessionId}` |
| `profile:usage` | `recordWindows(profileId, windows, source)` substitui 734 (`event`), 1215 (`session`), 1313 (`refresh`) | `{profileId, adapter, windows, source, overThreshold}` |
| `workspace:saved` | após `syncWorkspace` em PUT /api/workspace (1507) e POST /api/setup (1445), só com mudança | `{rev, savedAt, changes, setup}` (nunca o workspace) |

Prompt/system prompt só com capability `run.content`; o workspace só com `workspace.read`; o despachante monta o payload por plugin, omitindo o que o grant não cobre (S-L9). Eventos são somente leitura (documentado, não clonados).

`run:beforeSpawn`: dentro de `launchRun`, **depois** da reserva (`admitBump`), entre a criação do `run` (1109) e o ramo do adapter
(1111). Sem processo, temporários, `runs.set` nem histórico ainda: veto não deixa resto; `release` no `finally` devolve a vaga.
Handlers em série na ordem dos plugins, orçamento total 5 s; `{block}` → `Error` status 403 "Execução bloqueada pelo plugin X:
motivo" (primeiro veto vence); `{appendSystem}` (≤ 20k por plugin) concatenado antes do `prepare`, com o corte de 100k
reaplicado. Payload: `{runId, parentRunId, isCall, kind, project, projectId, agentId, featureId, profile:{id,name,adapter}, model,
effort, tools, permissionMode, cwd, promptChars, hasSystemPrompt, agentSlugs}`. Chamado vetado vira erro de ferramenta.
`parentAlive` continua síncrono depois do hook.

### A4. plugins.js

- `discover({config, home, root})`: `config.plugins.paths` (relativos ao arquivo que declarou) e `<home>/.squad-code/plugins/*/`
  (pasta = `id`); manifesto validado; `{id, dir, realRoot, manifest, source, warnings}`.
- `orderPlugins(list)` (pura): Kahn com fila ordenada alfabeticamente; dependência ausente/desligada desliga o dependente; ciclo =
  aviso e os membros do ciclo (e quem depende deles) ficam desligados (fail-closed).
- `createPluginHost(...)` → `{ready, load(), emit(event,payload), beforeSpawn(payload), route(req,res,url), list(), view()}`;
  objeto nulo sem plugins.
- `makeCtx(plugin, state)`: `registerRoute`, `on`, `registerAdapter`, `settings()`, `dataDir()`, `log`, `secret(name)` (só `env`
  declarado), `onDispose`, `hasCapability`, `use(id)`, `http = {readBody, json, fail}`. Registros só durante `register` (depois o
  ctx congela); `register` com try/catch e 10 s; erro remove tudo que o plugin registrou e desliga dependentes.
- `importPlugin(file)`: `import(pathToFileURL(realFile))`; `mod.register ?? mod.default?.register ?? mod.default`.
- Capabilities: `run.mutate`, `adapter`, `adapter.override`, `run.content`, `workspace.read`. Vale a interseção entre o pedido no
  manifesto e o `grants`. Sem grant → `Capacidade "X" não concedida` → plugin `denied`.
- `settings()`: cópia congelada de `plugins.entries.<id>.settings` validada por `configSchema` (≤ 16 KB); inválido desliga o plugin.
- O host (`createPluginHost`, `ctx`, eventos, rotas) fica em `plugin-host.js`. A descoberta é a de `plugins.js`, o carregador da
  configuração e do conteúdo (`docs/plans/plugins-conteudo.md`), estendido: leitura dos arquivos de config (`plugins` =
  `{paths, disabled, enabled, entries, hookTimeoutMs}`; paths concatenados; enabled do último arquivo local; entries por id),
  `createInsideReader(dir, realRoot, track)` (realpath, limites, sem links para fora; `server` só `.mjs`/`.js`),
  `buildPlugin(dir, ctx)` (o mesmo manifesto traz conteúdo, código ou os dois), `LIMITS.plugins: 20`.
- `schemas/squad-plugin.schema.json` (o schema dos plugins de conteúdo) ganha `apiVersion, server, requires, capabilities, env,
  configSchema`: um schema só para o manifesto (teste garante que não existe outro).
- `squad.schema.json`: `plugins: {paths, disabled, enabled, hookTimeoutMs, entries: {<id>: {grants, settings, failClosed}}}`.
- `GET /api/plugins` (um só, para conteúdo e código): `{ok, plugins:[{id, name, version, description, path, categories, presets,
  avatars, themes, conventions, runtime, hasCode, status, error, source, requires, env, capabilities:{asked, granted, missing}, routes,
  events, adapters, warnings}], runtime, warnings, config, restartRequired}`. `/api/health`: `plugins: <ativos>`;
  `engines` ganha chaves só com adapters de plugin. Log de start: "Plugins: ...".
- Rotas: em `handle()` após `tokenOk`/`parts`; `parts[1]==='plugins' && parts[2]` → `plugins.route`; handler `(req, res, {url,
  params, body(), http})`; objeto → JSON 200, `{status, body}`, ou escrita direta em `res`; exceção → 500; sem timeout (SSE);
  `MAX_BODY`; subpath por regex com `:param`.

### A5. Testes por passo

- Passo 2: registro (duplicado, formato inválido, `builtinKinds`), `claude.finish/onEvent` com `rate_limit_event`, tradutor do
  codex contra a tabela da ADR 0001, `codexArgs` por modo.
- Passo 3: `npm test` verde após cada troca; Perfil com adapter desconhecido (inserido via db) → erro claro e `status.error`.
- Passo 4: schema único do manifesto, enums x `CONSTANTS`; plugin só de conteúdo em `/api/plugins` (`status: data`) e na página;
  manifesto inválido; id duplicado; pasta home com nome ≠ id; `plugins.paths` com código no compartilhado bloqueado;
  `orderPlugins` (topológica, ciclo, ausente).
- Passo 5: fixtures em `tests/fixtures/plugins/` (`hello`, `throws-on-register`, `not-enabled`, `bad-settings`, `route-echo`);
  isolamento de erro; não importado sem `enabled`; segunda instância na porta ocupada não roda `register`; rotas GET/POST, 401 sem
  token, 421 Host, 403 Origin, 404, 500 sem derrubar, `:param`, não ocupa `/api/runs`.
- Passo 6: `event-log` (ordem/contagem, sem `stream_event`, `profile:usage.source`, `workspace:saved` sem workspace); observador
  que lança/trava não altera a execução; disjuntor; `veto` (403 sem resto), teto 1 + hook lento + 2 POST paralelos = um 201 e um
  429, vaga devolvida após veto, `appendSystem` no stdin do fake-codex, veto em Chamado = erro de ferramenta, fail-open/failClosed,
  `no-grant` → `denied`.
- Passo 7: `fake-adapter` (`x-echo`, bin `.mjs`): Perfil via POST roda com `exit.usage`; aparece em `adapters` e `engines`;
  sobrescrever `claude` sem grant derruba o register; com grant vale; plugin desligado → erro claro.
