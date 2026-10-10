# plugins/

Tudo o que é específico de uma empresa ou de um gosto pessoal (agentes, souls, diretrizes, avatares, temas, padrões de execução,
rotas, observadores de execução, motores) entra no SQUAD/CODE por **plugins**, nunca no código do app. Um plugin é uma pasta com um
`squad-plugin.json` que traz **conteúdo**, **código do bridge** (`server`) ou os dois, no mesmo manifesto.

| Arquivo | O que faz |
|---|---|
| `loader.js` | Configuração local (`squad.config.json` + `squad.local.json`), descoberta, ordem (`orderPlugins`), compatibilidade (`squadCode`) e leitura do conteúdo, injetado na página como `#squad-plugins` |
| `host.js` | Código dos plugins: `import()` do `server`, `register(ctx)`, rotas, eventos, `run:beforeSpawn`, Adapters de plugin |

Decisões e "Desvios": [`docs/plans/plugins-conteudo.md`](../docs/plans/plugins-conteudo.md) (conteúdo e configuração),
[`docs/plans/plugins.md`](../docs/plans/plugins.md) (código) e [ADR 0004](../docs/adr/0004-plugins-nao-alteram-o-nucleo.md).
Motores: [`adapters/README.md`](../adapters/README.md).

## Onde ficam

O bridge procura plugins, nesta ordem (uma pasta achada por dois caminhos conta uma vez, pelo realpath; com id repetido vale a
fonte local):

| Fonte | Confiança | Como |
|---|---|---|
| `plugins.paths` do `squad.local.json` (ou do arquivo de `SQUAD_CONFIG`) | local | caminhos relativos à pasta do arquivo, `~` = home |
| `SQUAD_PLUGINS` | local | pastas separadas por `:` (`;` no Windows) |
| `.plugins/<id>/` na pasta do app | local | descoberta automática (o clone; veja [`.plugins/README.md`](../.plugins/README.md)) |
| `~/.squad-code/plugins/<id>/` | local | descoberta automática (instalação por usuário) |
| `plugins.paths` do `squad.config.json` | compartilhada | versionável; só conteúdo |

Nas duas pastas de descoberta automática o nome da pasta precisa ser o `id` do manifesto. `SQUAD_PLUGINS_DIR` troca a pasta
`.plugins/` (vazio desliga; os testes usam isso). Até 20 plugins.

## Criar um plugin

```sh
npm run plugin:new -- <id> [--name "Nome"] [--code] [--no-content] [--no-git] [--dir <pasta>]
```

Cria `.plugins/<id>/` (ou a pasta de `--dir`) com `squad-plugin.json` (`squadCode` = `^<major>.<minor>.0` da versão atual),
`README.md`, `.gitignore`, um agente de exemplo em `agents/` (salvo `--no-content`) e, com `--code`, um `server.mjs` com a rota
`GET /api/plugins/<id>/ping` e um observador de `run:finish`. Por padrão faz `git init` + commit inicial **no repositório do
plugin** (o do app não é tocado; sem git, avisa e segue). Registro, sempre no `squad.local.json` (cópia `.bak`, escrita atômica;
o `squad.config.json` nunca é tocado): `--code` põe o id em `plugins.enabled`; uma `--dir` fora de `.plugins/` e de
`~/.squad-code/plugins/` entra em `plugins.paths`. Recusa id inválido e pasta existente.

Depois: conteúdo aparece ao recarregar a página; código, ao reiniciar o bridge.

## Configuração local

```json
{
  "$schema": "./schemas/squad.schema.json",
  "plugins": {
    "paths": ["../meus-plugins/acme", "~/squad-plugins/pessoal"],
    "disabled": ["pessoal"],
    "enabled": ["acme"],
    "hookTimeoutMs": 3000,
    "entries": { "acme": { "grants": ["run.mutate"], "settings": { "canal": "squad" }, "failClosed": false } }
  },
  "runtime": { "model": "sonnet", "concurrency": 3 }
}
```

- `squad.config.json` (versionável, compartilhado) e `squad.local.json` (git-ignored, desta máquina) ficam na pasta do app; o local
  vence campo a campo, `paths` são concatenados, `disabled` vale o do último arquivo que o declara.
- `enabled`, `entries` (`grants`, `settings`, `failClosed`), `hookTimeoutMs` e o `disabled` de um plugin com código **só valem do
  arquivo local**. `runtime.permissionMode`, `addDirs` e `extraAllowedTools` vindos de fonte compartilhada são ignorados com aviso.
- `runtime`: padrões de execução (`permissionMode, model, effort, maxBudgetUsd, timeoutSec, concurrency, addDirs, restrictTools,
  extraAllowedTools`); preenchem só o que o workspace ainda não tem.
- Os mesmos arquivos declaram Perfis (`profiles`, `defaultProfile`): veja `docs/plans/plugins-conteudo.md`, "Perfis da configuração".
- Schemas: `schemas/squad.schema.json` (configuração), `schemas/squad-plugin.schema.json` (manifesto) e
  `schemas/squad-agent.schema.json` (frontmatter dos agentes). Campo desconhecido é aviso; erro de tipo recusa o item.

## Manifesto (`squad-plugin.json`)

```json
{
  "$schema": "../../schemas/squad-plugin.schema.json",
  "id": "acme",
  "name": "Acme",
  "version": "1.0.0",
  "description": "Agentes e diretrizes da Acme.",
  "squadCode": "^2.1.0",
  "apiVersion": 1,
  "server": "server.mjs",
  "capabilities": ["run.mutate"],
  "requires": [],
  "env": ["ACME_TOKEN"],
  "configSchema": { "type": "object", "properties": { "canal": { "type": "string" } } },
  "categories": [{ "key": "triagem", "label": "Triagem", "before": "outros" }],
  "avatars": [{ "key": "triagem", "label": "TRIAGEM", "file": "avatars/triagem.png" }],
  "themes": [{ "key": "noite", "label": "Noite", "ui": { "--bg": "#05070a" }, "city": {}, "office": {}, "agent": {}, "run": {} }],
  "runtime": { "model": "opus" },
  "conventions": "conventions.json"
}
```

Só `id` (`^[a-z0-9][a-z0-9-]{1,40}$`) é obrigatório. `server`, `apiVersion`, `capabilities`, `requires`, `env` e `configSchema`
são do código; o resto é conteúdo.

### `squadCode` x `apiVersion`

- **`squadCode`**: as versões do **SQUAD/CODE** que o plugin suporta, uma faixa semver comparada com a `version` do `package.json`
  do app. Fora da faixa o plugin fica `incompatible` ("requer SQUAD/CODE ^3.0.0, este é 2.1.0") e **nada** dele carrega, nem
  conteúdo nem código. Faixa ilegível: `invalid`. **Ausente: aceito em qualquer versão, sem aviso** (compatibilidade com plugins
  antigos; o scaffold sempre escreve o campo).
- **`apiVersion`**: a versão do contrato do `ctx` (o que `register(ctx)` recebe). Este bridge oferece a 1; um plugin que exige uma
  maior é `invalid`. Muda só quando o `ctx` muda de forma incompatível, independente da versão do app.

Faixas aceitas pelo matcher (`satisfies`/`parseRange` em `loader.js`, sem dependência): exata (`2.1.0`, `=2.1.0`), `>`, `>=`, `<`,
`<=`, `^` (`^2.1.0` = `>=2.1.0 <3.0.0`; `^0.2.0` = `<0.3.0`; `^0.0.3` = `<0.0.4`), `~` (`~2.1.0` = `<2.2.0`), versão parcial
(`2` = qualquer 2.x, `2.1` = qualquer 2.1.x), `*`, comparadores separados por espaço (todos valem: `>=2.1 <3`) e alternativas com
`||`. Sufixo `-pre`/`+build` da versão é ignorado. Não aceita: faixa com hífen (`1 - 2`) nem `x` dentro da versão (`2.x`).

## Conteúdo

```text
acme/
├── squad-plugin.json
├── agents/*.md         # um agente por arquivo, em ordem alfabética (01-, 02- definem a ordem no catálogo)
├── avatars/*.png       # png, jpg ou webp (sem SVG), até 1 MB cada, 12 MB no total
└── conventions.json    # diretrizes extras (opcional)
```

`agents/<NOME>.md`: frontmatter num subconjunto estrito de YAML (`chave: valor`, listas inline e em bloco, um nível de mapa,
`#` fora de aspas) + corpo = instruções do agente (vão depois do prompt da especialidade):

```markdown
---
name: TRIAGEM            # obrigatório, ^[A-Z0-9][A-Z0-9-]{1,23}$, único no catálogo
slot: operator           # commander | adr | prd | operator
role: backend            # chave de ROLES do app (role desconhecido: o app ignora o agente com aviso)
category: triagem        # só operator: categoria do plugin ou embutida (padrão: outros)
specialty: Triagem
model: sonnet
effort: high
tools: [Read, Glob, Grep]
avatar: triagem          # avatar do plugin ou embutido
description: Organiza e prioriza as demandas.
soul: Calmo e criterioso.
hellos:
  - Oi! Qual é a demanda?
conventions:
  template: <id de template>
  subsets: [style-ts]
---
Conduza como o responsável pela triagem: ...
```

- `conventions.json`: `{ "families": {...}, "subsets": [...], "groups": [...] }` no formato de `src/conventions.js`; ids que já
  existem são recusados, nunca sobrescritos.
- Temas: `ui` = variáveis CSS; `city`, `office`, `agent`, `run` = cores da cena. Escolhidos em Configurações > Plugins (key
  `<id>/<key>`).
- Um plugin nunca altera agentes já criados: o que ele traz aparece no catálogo (Squad Studio, seletor de foto, diretrizes).
- Limites (texto acima do limite recusa o item, nunca corta): tabela "Limites efetivos" em `docs/plans/plugins-conteudo.md`.
- Conteúdo é relido a cada carga da página (cache por mtime). Leituras ficam dentro da pasta do plugin (realpath; link para fora
  é recusado).

## Código

O código de um plugin roda **só** quando: a pasta vem de uma fonte **local**, o id está em `plugins.enabled` do arquivo local e
`plugins.entries.<id>.grants` cobre todas as `capabilities` do manifesto. Um plugin com `server` achado só pelo
`squad.config.json` fica `blocked`; sem os grants, `denied`. O conteúdo de um plugin com código só entra na página enquanto o
código está `active`. Mudou o código? Reinicie o bridge (`restartRequired` em `GET /api/plugins` avisa).

```js
// server.mjs
export function register(ctx) {
  let ultimo = null;
  ctx.on('run:finish', run => { ultimo = { status: run.status, costUsd: run.costUsd }; });
  ctx.registerRoute('GET', '/ultimo', () => ({ ultimo }));
}
```

`register` roda uma vez, no início do bridge (depois que a porta é nossa), com 10 s por plugin e 30 s no total; os plugins carregam
na ordem de `requires` (Kahn, desempate alfabético; ciclo desliga os membros). Um `register` que estourou o tempo nunca é chamado
depois.

### `ctx`

Congelado depois do `register` (registrar rota ou evento depois lança erro).

| Membro | O que faz |
|---|---|
| `id`, `apiVersion` | Id do plugin e versão do contrato |
| `log(msg)` | Log do bridge com o prefixo do plugin |
| `settings()` | `plugins.entries.<id>.settings`, validado pelo `configSchema` antes do import (até 16 KB), congelado |
| `dataDir()` | `<data>/plugins/<id>/`, criado na primeira chamada |
| `secret(name)` | Valor da variável de ambiente `name`, só se declarada em `env` |
| `onDispose(fn)` | Chamado ao encerrar o bridge |
| `hasCapability(cap)` | Se a capacidade foi pedida e concedida |
| `use(id)` | O que o `register` de outro plugin devolveu (só os de `requires`, ativos) |
| `http` | `readBody`, `json`, `fail` do bridge |
| `registerRoute(method, subpath, fn)` | Rota em `/api/plugins/<id>/<subpath>`, com o mesmo token, Host e Origin do núcleo. Objeto devolvido vira JSON; `{status, body}` escolhe o status; um `throw` comum vira 500 genérico (o detalhe vai só para o log) |
| `on(event, fn, {partial})` | Observa um evento (abaixo) |
| `registerAdapter(kind, impl)` | Motor novo ou substituto (capacidade `adapter`; veja `adapters/README.md`) |

### Eventos

| Evento | Quando |
|---|---|
| `run:start` | Execução iniciada |
| `run:event` | Cada evento do stream (`{partial: true}` inclui os `stream_event`, exige `run.content`) |
| `run:finish` | Execução terminou (status, custo, uso, código de erro) |
| `profile:usage` | Uso de um Perfil atualizado |
| `workspace:saved` | Workspace gravado no banco |
| `run:beforeSpawn` | Antes de iniciar o processo (exige `run.mutate`): devolva `{ block: 'motivo' }` (403, a vaga volta) ou `{ appendSystem: 'texto' }` (até 20k por plugin, o corte de 100k do system prompt é reaplicado) |

- Fila por plugin (1000; `run:event` cai primeiro, depois os mais antigos), 3 s por handler (`hookTimeoutMs`), disjuntor depois de 20
  falhas seguidas do mesmo handler. Emitir sem ninguém ouvindo custa um `if`.
- Sem `run.content` o plugin recebe uma projeção: nunca prompt, texto, input, conteúdo, stderr ou cwd.
- `run:beforeSpawn`: 5 s para todos os handlers; falha deixa a execução seguir, salvo `entries.<id>.failClosed: true`. A sonda
  interna de uso do bridge é a única execução que não passa por ele.

### Capacidades

| Capacidade | Libera |
|---|---|
| `run.mutate` | `ctx.on('run:beforeSpawn', fn)`: vetar uma execução ou acrescentar texto ao system prompt |
| `run.content` | Prompt e system prompt em `run:start` e `run:beforeSpawn`; o stream completo em `run:event`; texto de erro e `sessionId` em `run:finish` |
| `adapter` | `ctx.registerAdapter(kind, impl)`: um motor novo, com ambiente mínimo e sem telemetria nativa |
| `adapter.override` | Substituir `claude` ou `codex` embutidos (exige também `adapter`) |
| `workspace.read` | Reservada: pode ser pedida e concedida, mas nenhuma API a entrega ainda |

## Segurança

> O código de um plugin roda **no processo do bridge, com as permissões da sua conta**. Não é sandbox: ele pode ler e gravar
> arquivos e executar comandos como você. `capabilities` (pedidas) e `grants` (concedidas) são consentimento auditável, não
> contenção. Instale só código em que você confia.

- Só a configuração local liga código; o arquivo compartilhado nunca.
- Segredos nunca entram em arquivo: `settings` guarda nomes de variáveis declaradas em `env`, e `ctx.secret` só entrega essas.
- Rotas de plugin ficam sob `/api/plugins/<id>/` e passam pelo mesmo token e checagem de Host/Origin do núcleo.
- Um Adapter de plugin roda com ambiente mínimo (mais o `env` declarado) e vê uma visão restrita da execução.
- Regra do projeto: mudanças no núcleo passam por pontos de extensão; código e conteúdo de empresa vão em plugins, nunca em
  `server.js`, `adapters/` ou `src/`.

## Status

`GET /api/plugins` lista todos os plugins achados (resumo do conteúdo, `hasCode`, `source`, capacidades pedidas, concedidas e
faltantes, rotas, eventos, Adapters, avisos e `restartRequired`); Configurações > Plugins mostra os carregados e, abaixo, os que
não carregaram, cada um com o status:

| Status | Significado |
|---|---|
| `data` | Só conteúdo, carregado |
| `active` | Código carregado (`register` terminou) |
| `disabled` | Fora de `enabled`, em `disabled`, ou um `requires` não carregou |
| `incompatible` | `squadCode` não aceita esta versão do SQUAD/CODE |
| `invalid` | Manifesto com erro, `apiVersion` maior que a oferecida, `squadCode` ilegível, id repetido |
| `blocked` | Código achado só pela configuração compartilhada |
| `denied` | Faltam grants para as capacidades pedidas |
| `error` | `register` lançou erro ou estourou o tempo |
| `pending` / `loading` | Na fila / carregando (no início do bridge) |

## Testes

`tests/plugins.test.mjs` (portas 4700-4714) cobre schema, descoberta (inclusive `.plugins/` e o home), `squadCode`, ordem, carga,
`ctx`, rotas, eventos, `run:beforeSpawn`, `registerAdapter`, `denied` e o scaffold, com os plugins de `tests/fixtures/plugins/`
(`hello`, `content-only`, `code-and-content`, `event-log`, `policy`, `fake-adapter`, `no-grant`...). Os testes isolam
`SQUAD_CONFIG`, `SQUAD_CONFIG_SHARED`, `SQUAD_HOME` e `SQUAD_PLUGINS_DIR` em pastas temporárias: nunca leem o `squad.local.json` nem
o `.plugins/` do clone.

```sh
node --test --test-concurrency=1 tests/plugins.test.mjs
node --test --test-name-pattern "squadCode" tests/plugins.test.mjs
```

Variáveis só para testes: `SQUAD_PLUGIN_REGISTER_TIMEOUT_MS` (10000), `SQUAD_PLUGIN_LOAD_BUDGET_MS` (30000),
`SQUAD_PLUGIN_HOOK_TIMEOUT_MS` (3000, sobrepõe `hookTimeoutMs`) e `SQUAD_PLUGIN_BEFORESPAWN_BUDGET_MS` (5000).
