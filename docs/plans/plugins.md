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
   depois de a porta ser nossa. `plugins.ready` é aguardado por `handle()` (após `tokenOk`), `serveIndex`, `startRun` (antes de
   `configProfilesReady`, ver Desvios) e `afterOpen` (antes de `syncConfigProfiles`).
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

### Passo 1: Contrato: concluído (`064c834`)
ADR 0004, este documento, `CONTEXT.md` (Plugin: conteúdo e/ou código, código só pela Configuração local; Capacidade; Adapter
registrado no bridge).

### Passo 2: Registro de adapters e funções puras: concluído (`064c834`)
Apêndice A2 e A5: `adapters/index.js` (registro), `adapters/claude.js` e `adapters/codex.js` com as funções puras movidas do
`server.js` (uso, janelas, catálogo, esforços, args, tradutor, sessão). Testes unitários em `tests/adapters.test.mjs`. Sem mudança
de comportamento (pequenas diferenças de robustez registradas em "Desvios").

### Passo 3: `server.js` passa a usar o registro: concluído (`064c834`)
Apêndice A1/A2: lookups simples, lançamento (`prepare`, `files`, `tail`, `mcpToken`), fim da execução (`finish`, `onEvent`,
`recordWindows`), `refreshWindows`, `settingsFile`, `engines`, catálogo. `npm test` verde a cada troca; teste novo de Perfil com
adapter desconhecido.

### Passo 4: Schemas, descoberta e ordem: concluído (`1729838`)
Apêndice A4: `schemas/squad-plugin.schema.json`, `plugins` em `squad.schema.json`, `CONSTANTS` (`PLUGIN_CAPABILITIES`,
`PLUGIN_EVENTS`); `plugins.js` passa a descobrir todos os plugins (um caminho só, no `load()`, com `orderPlugins`; conteúdo, código ou os
dois no mesmo manifesto); `plugin-host.js` com o host de código; `GET /api/plugins` único; decisão 2.

### Passo 5: Carga, `register` e rotas: concluído (`1729838`)
Apêndice A4: `import()` no `listen`, `plugins.ready`, `ctx` (`log`, `settings`, `dataDir`, `secret`, `onDispose`, `hasCapability`,
`use`), isolamento de erro e congelamento do ctx; `registerRoute` sob `/api/plugins/<id>/` com token/Host/Origin do núcleo.

### Passo 6: Eventos e `beforeSpawn`: concluído (`15e3e19`)
Apêndice A3: `run:start`, `run:event`, `run:finish`, `profile:usage`, `workspace:saved`; `run:beforeSpawn` depois da reserva
síncrona (veto devolve a vaga), `appendSystem`, fail-open/failClosed, `run.content`.

### Passo 7: `registerAdapter`: concluído (`15e3e19`)
Adapter de plugin (`adapter`, `adapter.override`), `engines` e catálogo dinâmicos, erro claro com plugin desligado.

### Passo 8: Documentação e revisão: concluído
README (seção Plugins), `CLAUDE.md` (parágrafo "Plugins and adapter registry"), `CONTEXT.md`, `scripts/dev.mjs` observando
`plugins.js`, `plugin-host.js`, `schema.js`, `schemas/` e `adapters/`, e "Desvios" revisados nesta etapa, com as correções da
revisão do Codex (B1, B2, B3, N1, N2 abaixo).

## Desvios

Passos 2 e 3 (registro, `adapters/claude.js`, `adapters/codex.js`, `server.js` consultando o registro). O que divergiu do Apêndice:

- **`host` ganhou `ROOT` e `longPath`.** `APP_MEMORY_EXCLUDES` (só o Claude usa) foi para `adapters/claude.js` e precisa deles. O resto de `host` segue A2.
- **`nativeTelemetry` recebe também `attrs`** (`squadAttrs(run)`, que fica no núcleo junto do `sendTrace`); o Claude monta `OTEL_RESOURCE_ATTRIBUTES` com ele. O núcleo resolve `cfg`, `base`, `content` e `headers` e só chama o adapter quando o Perfil liga a telemetria nativa.
- **O registro é uma fábrica**, `createRegistry(host)` (não um singleton do módulo): cada start/teste tem o seu, e os embutidos são carregados dali. `register(impl, {override})` guarda uma cópia rasa com `builtin` (um override de embutido tem `builtin: false`; `builtinKinds()` continua listando o kind). `validateAdapter` é exportado. O `register` devolve o undo (passo 7).
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
- **Testes:** `tests/golden-argv.json` guarda o argv completo de 7 execuções (claude cheio/mínimo/telemetria nativa, codex cheio/somente leitura/modelo do Claude/telemetria nativa) gerado pelo `server.js` do HEAD antes do registro; o teste compara o argv atual com ele (caminhos e porta normalizados), e confere que os `-c otel.*` vêm antes do `-` final. O teste do Adapter desconhecido usa teto 1 no Perfil e repete a execução para provar que nenhuma vaga foi tomada; o do vazamento usa um `serviceName` com NUL (o `spawn` lança síncrono depois de o adapter escrever os arquivos). A ADR 0001 não tem tabela, então o tradutor foi testado contra a descrição dela e o mapeamento do código (system/assistant/user/result, `Agent` para `chamar_colega`, uso somado por turno). Os testes de integração de `adapters.test.mjs` usam portas 4800+ para não colidir com os de `bridge.test.mjs` (que rodam em paralelo, em outro processo). `package.json` passou a incluir `plugins.test.mjs` no passo 5 (o arquivo ainda não existia no passo 2-3).

Passos 4 e 5 (schemas, descoberta, ordem, carga, `ctx` e rotas). O que divergiu do Apêndice:

- **Um plugin só, uma descoberta só.** Não há um segundo carregador: `plugins.js` (o dos plugins de conteúdo) passa a descobrir todos os plugins, de `plugins.paths` de cada arquivo, de `SQUAD_PLUGINS` e de `~/.squad-code/plugins/<id>/`, e o mesmo `squad-plugin.json` traz conteúdo, código (`server`) ou os dois. O host do código (`createPluginHost`, `ctx`, rotas) fica em `plugin-host.js`, que recebe de `plugins.js` a lista descoberta (`load().discovery = {plugins, config, warnings}`, cada item com `key, id, dir, local, source, manifest, serverFile, hasCode, content, status?, error?`); `orderPlugins` mora em `plugins.js` (o carregador também a usa para os plugins só de conteúdo) e `plugin-host.js` a reexporta. A configuração dos plugins com código (`entries`, com `settings`) **não** aparece em `api.config`; `enabled` aparece. O cache do carregador cobre as pastas, os manifestos e a pasta do home.
- **`buildPlugin(dir, ctx)`** devolve `{plugin, meta, id, realRoot, read, tag}` (`plugin` = o conteúdo); `ctx.gate(meta, info)` permite ao chamador parar antes de ler o conteúdo. `ctx.seen` (id → pasta) controla o id repetido. `createInsideReader` ganhou `read.locate()` (caminho real validado, para o módulo que o bridge importa em vez de ler).
- **Plugin com `server` também traz conteúdo**, mas o conteúdo só é lido com o id em `plugins.enabled` (fonte local) e só entra na página (`#squad-plugins`) enquanto o código está `active`: um `register` que falha tira o conteúdo da página e de `/api/plugins` (`selectContent`). Plugin com código sem conteúdo nenhum fica fora da tag. Um plugin recusado depois de o id ser conhecido (manifesto inválido, `apiVersion` maior, `server` fora da pasta ou com extensão errada, código por arquivo compartilhado) aparece em `/api/plugins` com `status` `invalid` ou `blocked` e `error`; pasta do home com nome diferente do id e pasta ausente só avisam.
- **Decisão 2 na prática:** `enabled`, `grants`, `settings`, `failClosed` e `hookTimeoutMs` no arquivo compartilhado são avisos e ignorados; `plugins.paths` do compartilhado vale para plugins só de conteúdo, e um plugin com `server` achado só por ele é `blocked`. Se a mesma pasta também estiver em `plugins.paths` do arquivo local (ou em `SQUAD_PLUGINS`), passa a valer como local. Plugins da pasta do home contam como locais (e também precisam de `enabled` para rodar).
- **`GET /api/plugins` é um só:** `{ok, plugins, runtime, warnings, config, restartRequired}`; cada plugin traz o resumo do conteúdo que está na página (`path, categories, presets, avatars` sem `src`, `themes, conventions, runtime`; vazio quando o plugin não está na página) e o estado do código (`hasCode, status, error, source, requires, env, capabilities {asked, granted, missing}, routes, events, adapters, warnings`). Estados: `data` (só conteúdo, ativo), `active` (código carregado), `disabled` (fora de `enabled`, `plugins.disabled` ou dependência desligada; `error` vazio no primeiro caso), `pending`/`loading` (só durante o start), `error`, `denied`, `invalid`, `blocked`. `/api/health.plugins` conta `active` + `data`. O conteúdo é relido a cada chamada; o código não: `restartRequired` compara uma assinatura dos plugins com código (ids, pastas, manifesto) e de `enabled`, `entries` e `hookTimeoutMs` do start com a atual, e um plugin com código que surgiu depois do start aparece `disabled` até reiniciar. `source` é `config` ou `home`. A linha do log sai depois da carga, com todos os plugins ("acme 1.2.0 (2 agente(s))", "hello 1.0.0 (ativo)", "x (desligado: motivo)"; "Plugins: nenhum" sem nenhum): é a única asserção de `bridge.test.mjs` que mudou.
- **`orderPlugins`** devolve `{order, disabled: [{id, reason: 'off'|'requires'|'cycle', message}], warnings}`; plugins só de conteúdo entram na ordem (podem ser dependência). **Ciclo = fail-closed:** os membros do ciclo ficam `disabled` ("ciclo de dependências com X"), quem depende deles também ("depende de um plugin em ciclo"), e o aviso diz "os membros do ciclo ficam desligados" (não carregam em ordem alfabética, ao contrário do que o A4 dizia).
- **Rota de plugin desconhecido** (`/api/plugins/<id desconhecido>/...`) cai no 404 do núcleo ("Rota não encontrada."), idêntico a antes; plugin conhecido mas não ativo responde 404 "não está ativo (status)". Um handler que devolve `undefined` sem ter respondido deixa a resposta com ele (SSE/escrita assíncrona); `{status, body}` só vale com `status` inteiro e a chave `body`. Um `throw` simples vira 500 com a mensagem genérica "Erro interno no plugin." (o detalhe e o stack só vão para o log); erros com `status` explícito (4xx/5xx, p.ex. 413 do `readBody`) mantêm status e mensagem. Valor de `:param` decodificado com `/`, `\\` ou NUL é 400; `params` é `Object.create(null)` e `__proto__`/`constructor`/`prototype` não servem de nome de `:param`. Barras repetidas e a final colapsam como no núcleo (`split('/').filter(Boolean)`); plugin só de conteúdo responde 404 "só de conteúdo e não tem rotas". Subcaminho: `/` ou segmentos `[A-Za-z0-9._~-]+` / `:param`, sem `.` nem `..`, métodos GET/POST/PUT/PATCH/DELETE; rota repetida lança. Entre rotas que casam, o desempate é segmento a segmento da esquerda para a direita (literal antes de `:param`: `/y/:b` vence `/:a/x` para `/y/x`).
- **`ctx` nesta fase:** `id`, `apiVersion`, `log` (`log.warn`, `log.error`; prefixo `[plugin <id>]`), `settings()`, `dataDir()` (cria `<DATA_DIR>/plugins/<id>/` na primeira chamada; é a única coisa que o bridge grava em disco por plugin e pode acontecer antes de existir banco), `secret(nome)`, `onDispose(fn)`, `hasCapability`, `use(id)` (só ids de `requires`), `http`, `registerRoute` e `on`. **`on` só registra** (valida o evento, exige `run.mutate` para `run:beforeSpawn` e aparece em `events`; os eventos passam a ser emitidos no passo 6). **`registerAdapter` entra no passo 7.** `registerRoute`, `on` e `onDispose` lançam depois do `register`; os demais métodos continuam valendo. `settings()` é validada antes do `import()`: settings inválidas (ou acima de 16 KB) deixam o plugin em `error` sem rodar nem importar nada. O `this` de `register` é o módulo (ou `default`, se foi de lá que veio).
- **Tempo do `register`:** 10 s (import incluído); `SQUAD_PLUGIN_REGISTER_TIMEOUT_MS` encurta nos testes. Depois do estouro o ctx já está congelado, então um `register` que continuasse rodando não registra mais nada. Falha, estouro ou `denied`: rotas e eventos saem, os `onDispose` já registrados rodam na hora (1 s), e os dependentes ficam `disabled` ("depende de X, que não carregou (error)").
- **Espera:** `host.pending` é `true` só enquanto os plugins carregam; `handle()` (depois de `tokenOk`), `serveIndex`, `startRun` (antes de `configProfilesReady`) e `afterOpen` só esperam `plugins.ready` nesse intervalo, então com zero plugins o caminho é o de antes.
- **Shutdown:** `dispose()` marca `host.closing` (o loop de carga para; os que faltavam ficam `disabled` "bridge encerrando"), espera até 1 s o `register` em andamento, congela o ctx do que ainda está em `loading` e roda os `onDispose` de todos em paralelo (1 s cada, inclusive os de um plugin que ainda carregava). O processo espera 300 ms sem nenhum, 1,2 s com `onDispose` e 2,3 s se ainda estava carregando.
- **Orçamento de carga:** todos os `register` juntos têm 30 s (`SQUAD_PLUGIN_LOAD_BUDGET_MS` nos testes); o que estoura ou sobra vira `error` "tempo total de carga esgotado" (sem importar os que sobraram).
- **Revisão (segurança):** o `plugins.disabled` do compartilhado não desliga plugin com `server` (só o local); plugin desligado por `plugins.disabled` ou por `requires` não atendido (também os só de conteúdo, que saem da página) continua em `/api/plugins` como `disabled`. `settings`, `failClosed` e `hookTimeoutMs` só valem do arquivo local. `runtime.permissionMode`, `addDirs` e `extraAllowedTools` de fonte compartilhada são ignorados com aviso (um plugin só vale como local se algum arquivo local o nomear, via `SQUAD_PLUGINS` ou na pasta do home). Ids reservados do Windows são recusados (`CONSTANTS.WINDOWS_RESERVED_RE`, a mesma regra das pastas de projeto). Id repetido: as fontes locais são lidas primeiro e vencem; a repetida (ou a recusada) aparece em `/api/plugins` com `status: invalid`, com chave própria por pasta (`id@pasta`), e a rota/`use()` respondem pelo plugin válido. As mensagens de `settings` inválidas citam o campo e a regra, nunca o valor (nem no log); `configSchema` com `pattern` acima de 200 caracteres, `anyOf`/`oneOf` com mais de 16 alternativas ou mais de 32 níveis é recusado antes de validar (`error`).
- **Para o passo 6 (S-L9):** o despachante de eventos filtra o payload pelo grant de cada plugin: `prompt`/`systemPrompt` só com `run.content`, o workspace só com `workspace.read`; sem o grant o campo nem existe no objeto entregue.
- **Testes:** `tests/plugins.test.mjs` (35 testes no passo 5 e 68 ao fim do passo 7; portas 4700-4799 reservadas, usadas 4700-4770 no passo 5 e 4700-4714 depois, ver passo 6-7; `startBridge` próprio com `SQUAD_HOME`, `SQUAD_CONFIG`, `SQUAD_CONFIG_SHARED` e dados temporários), fixtures em `tests/fixtures/plugins/` (`hello`, `throws-on-register`, `not-enabled`, `bad-settings`, `route-echo`, mais `hangs-on-register`, `no-grant`, `needs-hello`, `content-only`, `code-and-content`, `slow`, `zz-after`, `cycle-a` e `cycle-b`). `no-grant` (A5, passo 6) entrou já aqui porque `on('run:beforeSpawn')` é o jeito de provar `denied` sem `registerAdapter`; `code-and-content` prova o manifesto único (conteúdo só com `enabled` e só com o código ativo). O corpo acima de `MAX_BODY` derruba a conexão (o `readBody` do núcleo destrói a requisição): o teste distingue `status 413` de `derrubada`, aceita só esses dois e confere `/api/health` depois. Os testes de `throws-on-register`/`hangs-on-register` conferem por arquivo marcador que o `onDispose` rodou, que as rotas ficaram vazias e que o registro tardio foi recusado; o do plugin `slow` prova que `/api/health` e `serveIndex` esperam `plugins.ready`.

Passos 6 e 7 (eventos, `run:beforeSpawn` e `registerAdapter`). O que divergiu do Apêndice:

- **`run:start` sai antes do primeiro `pushEvent`** (logo depois de `runs.set`/`insertRun`), não depois dos avisos como dizia o A3: assim o observador vê `run:start` antes de qualquer `run:event` da mesma execução. O payload é o do A3 mais `prompt` e `systemPrompt` (só com `run.content`; `systemPrompt` já com o `appendSystem`).
- **Fila por plugin, disjuntor por handler.** A fila de 1000 é uma por plugin (não por handler), para manter a ordem de chegada entre eventos diferentes do mesmo plugin; o descarte (do mais antigo) é contado no handler a que o item pertencia. O disjuntor e a contagem de falhas seguidas são por handler (`on`); o sucesso zera a contagem; aberto, o handler só volta no próximo start. Logs: as 3 primeiras falhas de cada handler, o descarte na 1a e a cada 1000, e uma linha no disjuntor. Handler síncrono não ganha timer (só a promessa é cortada por `hookMs`); um handler síncrono que trava o loop não tem como ser cortado (plugins são confiáveis, decisão 1).
- **`on(event, fn, {partial: true})`** é o opt-in de `stream_event` em `run:event`. `emit(event, payload | () => payload)`: a função só roda se alguém escuta (o hot path de `run:event` não monta nada sem assinante), o payload é congelado só no topo (compartilhado, não clonado) e `emit` nunca lança. `host.listens(event)` diz se há assinante.
- **S-L9 (revisado): conteúdo só com `run.content`.** `prompt`/`systemPrompt` (em `run:start` e `run:beforeSpawn`) e, agora, o stream: sem o grant, `run:event` entrega uma **projeção por whitelist** `{runId, seq, at, type, subtype, parentToolUseId}` (+ `toolName` no tool_use, `isError` e `bytes` no tool_result, `status/code/isError/costUsd/numTurns/usage` no exit), nunca texto, input, content, result, stderr, raw, args nem cwd; `seq` é a posição do evento no stream (os `stream_event` que o plugin não recebe deixam lacuna). Com `run.content`, o evento vem inteiro. `{partial: true}` exige `run.content` (sem o grant o `register` lança e o plugin fica `denied`). O "risco aceito" da versão anterior deixou de existir. `run:finish` sem `run.content` leva `error` só como código (`cancelled|timeout|spawn|exit|agent-error`) e não leva `sessionId`; com o grant vem o texto em `error`, mais `errorCode` e `sessionId`. `ctx.getWorkspace()` **não foi implementado**; `workspace.read` existe no schema, mas nada o usa.
- **`GET /api/plugins` ganhou `observers`** (`[{event, dropped, failures, tripped}]`, uma entrada por handler, **só em plugin com handlers de observação**, para o formato dos demais ficar como estava). O disjuntor aparece ali em `tripped: true`.
- **`run:beforeSpawn`:** fica em `launchRun` depois da criação do `run` e antes do `try` do `prepare`; só há `await` extra quando algum plugin escuta (`pluginHost.listens`). Handlers em série na ordem dos plugins, cada um com `min(hookMs, restante do orçamento)`; orçamento total 5 s (`SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS` nos testes). `{block: 'motivo'}` (ou `{block: true, reason}`) vira `Error` 403 `Execução bloqueada pelo plugin X: motivo` (motivo em uma linha, até 300 caracteres); o primeiro veto vence e os seguintes nem são chamados. `{appendSystem}` aceita só texto (até 20k por plugin, os pedaços juntados por linha em branco, `[systemPrompt, ...].filter(Boolean).join('\n\n').slice(0, 100000)`). Falha, tempo limite ou orçamento esgotado: fail-open (aviso no log), ou bloqueio 403 `... falhou (motivo)` se `plugins.entries.<id>.failClosed` (só do arquivo local, já era a regra); o plugin que não é alcançado por falta de orçamento conta como falha dele. O payload ganhou `prompt` e `systemPrompt` para quem tem `run.content`. O Chamado vetado já virava erro de ferramenta pelo `catch` do `callColleague` ("Não foi possível chamar X: Execução bloqueada...").
- **`profile:usage`** sai em `recordWindows` só quando a gravação deu certo (sem banco não há evento) e leva `windows` como cópia; `overThreshold` usa `overLimit` sobre o que acabou de ser gravado. **`workspace:saved`** sai do PUT e do `POST /api/setup` só com `changes > 0` (nem em `unchanged`, nem em 409).
- **`ctx.registerAdapter(kind, impl)`:** exige `adapter`; `kind` tem de ser igual ao `impl.kind`; sobrescrever `claude`/`codex` exige também `adapter.override` (sem ele lança "Capacidade ... não concedida" e o plugin fica `denied`); um kind que já existe e não é embutido é recusado pelo registro ("já registrado"), mesmo por outro plugin. O formato é o do `validateAdapter`. `createRegistry().register` passou a **devolver o undo** (tira o kind novo ou devolve o embutido que foi sobrescrito, e não faz nada se outro registro entrou por cima depois); o host guarda os undos do plugin e os roda em `undo(r)` (falha, `denied`, tempo limite e `dispose`), do mais novo para o mais antigo, junto das rotas e dos handlers. `createPluginHost` recebe `getRegistry` (o `server.js` passa `() => registry`, que só é lido depois do `listen`). `engines` em `/api/health`, `adapters` em `/api/profiles` e `validateProfile` já iteravam o registro desde o passo 3: nenhuma mudança neles. Plugin desligado com Perfil existente: o erro claro já existia (`missingAdapter`), agora com teste de ponta a ponta (execução 400, `status.error`, fora de `engines`, `refresh` 400, nenhuma vaga tomada).
- **Cópias, não objetos vivos.** Cada plugin recebe o seu `structuredClone` congelado em profundidade (só construído quando há assinante; `emit` aceita função preguiçosa e o hot path de `run:event` nem aloca sem assinante). O `beforeSpawn` clona e congela o payload **por handler** (`tools`, `profile`, `agentSlugs` incluídos): mutar não muda o argv nem o que o próximo plugin vê. `run.result` guarda uma cópia do evento `result`, e o evento de um Chamado repassado ao pai é cópia (o pai não compartilha `message`).
- **Resposta do `beforeSpawn` lida dentro do `try`:** `block`, `reason` e `appendSystem` são lidos uma vez; um getter que lança é falha do plugin (fail-open, ou bloqueio com `failClosed`).
- **`appendSystem` nunca some em silêncio:** se o total passar de 100k, corta-se a **base** (`base.slice(0, 100000 - acréscimo - 2)`); o run recebe um evento `bridge/plugin` (`plugin X acrescentou N caracteres ao system prompt`, com o corte de 20k por plugin quando houver) e um aviso `bridge/warning` com quantos caracteres da base foram cortados. Acréscimos que sozinhos passem de 100k também geram aviso.
- **Probe de uso fora do hook:** `internal.exact` / `meta.kind 'probe'` (o "Atualizar uso" do Perfil) não passa pelo `run:beforeSpawn`: é manutenção do bridge, não execução de agente. Documentado, com teste.
- **Encerramento:** `shuttingDown` é checado depois do hook e de novo depois do `prepare` (antes de `parentAlive`/spawn): nenhum spawn durante o shutdown (503).
- **Fila sob pressão:** descarta primeiro `run:event` (um `stream_event` antes de qualquer outro), preservando `run:start`, `run:finish`, `profile:usage` e `workspace:saved`; só então o mais antigo. `drain` roda com `.catch`; o orçamento do `beforeSpawn` usa `performance.now()`; quando um plugin anterior gastou o orçamento, a mensagem do `failClosed` diz "esgotado pelos plugins anteriores".
- **Adapter de plugin é menos confiável que o embutido:** o filho herda um **env mínimo** (`PATH, HOME, USER, LOGNAME, LANG, LC_*, TMPDIR/TEMP/TMP, SHELL, TERM`, mais as variáveis do `env` do manifesto, mais o que o próprio `prepare` define; no Windows também `SystemRoot, ComSpec, PATHEXT, USERPROFILE, APPDATA, LOCALAPPDATA, WINDIR`; `GIT_CEILING_DIRECTORIES` do núcleo continua); os embutidos seguem com o env inteiro (golden argv/env). `nativeTelemetry` **não é chamado** para adapter de plugin (nenhum header OTLP chega a ele) e o Perfil que o pediu recebe um aviso `bridge/warning`. O adapter recebe uma **visão do run** (`id, kind, label, parentRunId, effort, profile` próprio, `cwd, startedAt, opts`, e getters para `model, seenModel, result, endedAt, translator, status`), sem `parent`, `events`, `files`, `clients`, `child`; `opts` sem `agentMeta` e sem `agents[*].prompt` (também no `spec.opts` do `prepare`).
- **Override só de embutido:** a entrada atual precisa ser `builtin: true`; um segundo override (outro plugin ou repetição) é `denied`. O registro guarda `source` (`builtin` ou `plugin:<id>`) e `envNames`; `adapterSource` aparece em `/api/profiles` (no catálogo de cada adapter e em cada Perfil) e `adapterSources` em `/api/health`; o start loga `Adapter "claude" substituído pelo plugin X.`. O catálogo dos embutidos ganhou `adapterSource: 'builtin'`.
- **Revisão final (Codex).** (B1) O hook só é pulado por `internal.exact` (definido só pelo bridge); `body.meta.kind: "probe"` do corpo público **não** contorna mais o `beforeSpawn`, nem o `failClosed`. (B2) A descoberta (`plugins.js`) ordena as fontes locais antes de deduplicar por realpath: um path compartilhado que aponte para a pasta de um plugin do home (ou um alias por symlink) não elimina o local. (B3) `binVersion(bin, impl)`: a sondagem `--version` do executável de adapter de plugin (`profileStatus`, `/api/health`, `/test`) roda com o env mínimo (`adapterEnv`, o mesmo do lançamento) e o cache de versões tem chave por contexto (executável + env mínimo + `env` do manifesto). (N1) Depois do `import()` verifica-se se a tentativa expirou ou o bridge está encerrando antes de chamar `register()` (top-level await lento não chama mais `register` depois do `error`). (N2) A assinatura de `restartRequired` inclui o sha1 do arquivo `server` (relido só quando tamanho/mtime mudam) e `apiVersion`, `env` e `configSchema` do manifesto. `scripts/dev.mjs` também reinicia o bridge ao mudar `plugins.js`, `plugin-host.js`, `schema.js` e `schemas/`. As faixas de porta de `bridge.test.mjs` (4400-4699 + incremento) podem encostar nas de `plugins.test.mjs` (4700+), e uma execução concorrente com porta ocupada derrubava `startBridge` ("porta já está em uso"): `npm test` passou a rodar os arquivos em sequência (`--test-concurrency=1`).
- **Variáveis novas para teste:** `SQUAD_PLUGIN_HOOK_TIMEOUT_MS` (sobrepõe `plugins.hookTimeoutMs`) e `SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS`.
- **Testes:** 21 novos (passos 6-7) e mais 12 da revisão em `tests/plugins.test.mjs` (5 do despachante direto, sem rede, com `createPluginHost` e `globalThis.__observer` para fila/disjuntor/tempo limite; 5 de eventos e S-L9 e disjuntor no bridge; 8 de `beforeSpawn`; 4 de `registerAdapter`) e 1 em `tests/adapters.test.mjs` (undo do registro). Fixtures novas: `event-log`, `observer-bad`, `policy` (controlado por `POST /mode`) e `fake-adapter` (`x-echo`, `bin.mjs`; `settings.kind/failAfter/twice/invalid`). O `startBridge` do `plugins.test.mjs` expõe `tmp` (TMPDIR do bridge, para provar que o veto não deixa temporário) e a faixa de portas aleatórias caiu de 40 para 15 (4700-4714 mais as usadas em ordem). No teste do Chamado vetado, o `fake-codex` não repassa `isError` no item da chamada, então o erro de ferramenta é conferido pelo `isError` da resposta MCP (e pelo texto no stream do pai).

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
cut4k, resolveBin, startRun, saveWindows(profileId, windows, source), warn, fsp, EFFORTS, CODEX_EFFORTS}` (acrescentou `ROOT` e
`longPath`; `saveWindows` virou `recordWindows`; ver Desvios).

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
  nativeTelemetry?(run, profile, {env, args, warn, base, cfg, content, headers, attrs}) -> void,  // attrs: ver Desvios
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
| `run:start` | antes do primeiro `pushEvent` (ver Desvios, passos 6-7) | `{runId, parentRunId, rootRunId, kind, label, project, projectId, agentId, featureId, profileId, profileName, adapter, model, cwd, pid, startedAt, fallbackFrom}` (+ `prompt` e `systemPrompt` com `run.content`) |
| `run:event` | em `pushEvent` (714-721), após `observe` | `{runId, event}`; sem `stream_event` salvo opt-in `{partial:true}` |
| `run:finish` | após `sendTrace` (1234), antes de fechar clients | `{runId, parentRunId, kind, profileId, adapter, model, status, isError, error, code, costUsd, durationMs, numTurns, usage, sessionId}` |
| `profile:usage` | `recordWindows(profileId, windows, source)` substitui 734 (`event`), 1215 (`session`), 1313 (`refresh`) | `{profileId, adapter, windows, source, overThreshold}` |
| `workspace:saved` | após `syncWorkspace` em PUT /api/workspace (1507) e POST /api/setup (1445), só com mudança | `{rev, savedAt, changes, setup}` (nunca o workspace) |

Prompt/system prompt, e o conteúdo do stream (`run:event` completo, erro e sessionId do `run:finish`), só com capability `run.content` (sem ela, projeção/código; ver "Desvios"). `workspace.read` ainda não entrega nada: `workspace:saved` nunca leva o workspace e `ctx.getWorkspace()` não existe (ver Desvios, passo 6-7); a capacidade só é aceita e concedida. O despachante monta o payload por plugin, omitindo o que o grant não cobre (S-L9). Eventos são somente leitura; cada plugin recebe a sua cópia congelada (ver Desvios).

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
  events, adapters, observers?, warnings}], runtime, warnings, config, restartRequired}` (`env` e `observers` entraram nos passos
  4-7; ver Desvios). `/api/health`: `plugins: <ativos>`;
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
