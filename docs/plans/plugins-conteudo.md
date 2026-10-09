# Plugins de conteúdo e configuração local

Objetivo: tudo o que é específico de uma empresa ou de um gosto pessoal (agentes, souls, diretrizes, avatares,
temas do mapa, defaults de execução) sai do código e vem de **plugins de conteúdo**: pastas fora do repositório, apontadas por
arquivos de configuração no estilo `settings.json` / `settings.local.json` do Claude Code. O núcleo fica igual ao
upstream mais um carregador genérico; o conteúdo específico de uma empresa vive num plugin fora do repositório.

## Termos

- **Plugin**: pasta com um `squad-plugin.json` e arquivos que estendem o catálogo (agentes, categorias, souls,
  diretrizes, avatares, temas, defaults). Nunca altera dados já salvos no workspace.
- **Tema**: paleta da interface e do mapa (cidade e escritório) oferecida por um plugin; escolhido nas Configurações.
- **Configuração local**: `squad.config.json` (versionável, compartilhado) e `squad.local.json` (git-ignored, desta
  máquina), na raiz do app. O local vence o compartilhado.

## Configuração

Ordem (o último vence campo a campo; `plugins.paths` é concatenado sem repetir; `plugins.disabled` vale o do último arquivo que o declara):
1. `squad.config.json` (raiz do app, opcional; o upstream não tem)
2. `squad.local.json` (raiz do app, git-ignored)
3. `SQUAD_CONFIG=<arquivo>` (substitui o item 2; usado nos testes)
4. `SQUAD_PLUGINS=<dir>[:<dir>...]` (separador `path.delimiter`), soma aos `plugins.paths`

```json
{
  "plugins": {
    "paths": ["../minha-empresa-squad/plugin", "~/squad-plugins/pessoal"],
    "disabled": ["pessoal"]
  },
  "runtime": { "model": "sonnet", "concurrency": 3 },
  "profiles": []
}
```
- Caminhos relativos resolvem contra a pasta do arquivo que os declarou; `~` expande para o home.
- `runtime`: chaves permitidas = as de `DEFAULT_RUNTIME` do app (o bridge repassa só chaves de um whitelist:
  `permissionMode, model, effort, maxBudgetUsd, timeoutSec, concurrency, addDirs, restrictTools, extraAllowedTools`).
  Vale como **default** para workspaces novos e para campos vazios; nunca sobrescreve o que a pessoa salvou.
- `profiles`: reservado para a branch de Perfis (ignorado aqui, mas preservado e devolvido em `config` de `/api/plugins`).
- JSON inválido: o bridge loga, segue sem aquele arquivo e reporta em `warnings`.

## Formato do Plugin

```
plugin/
  squad-plugin.json
  agents/*.md          um preset por arquivo, lidos em ordem alfabética (prefixos 01-, 02- definem a ordem no catálogo)
  avatars/*.{png,jpg,jpeg,webp}
  conventions.json     opcional
```

`squad-plugin.json`:
```json
{
  "id": "minha-empresa",               // /^[a-z0-9][a-z0-9-]{1,40}$/, único entre os plugins carregados
  "name": "Minha Empresa",
  "version": "1.0.0",
  "description": "...",
  "categories": [                       // categorias de operadores no Squad Studio (OP_CATEGORIES)
    { "key": "triagem", "label": "Triagem", "icon": "flow", "description": "...", "before": "outros" }
  ],
  "avatars": [ { "key": "triagem", "label": "TRIAGEM", "file": "avatars/triagem.png" } ],
  "themes": [ { "key": "noite", "label": "Noite", "ui": {"--bg":"#05070a"}, "city": {}, "office": {}, "agent": {}, "run": {} } ],
  "runtime": { "model": "opus" },
  "conventions": "conventions.json"
}
```

`agents/<NOME>.md`: frontmatter (subconjunto de YAML, abaixo) + corpo = `style` do preset (texto que vai depois do
prompt da especialidade, como os presets embutidos).
```
---
name: TRIAGEM                  # obrigatório, /^[A-Z0-9][A-Z0-9-]{1,23}$/, único (embutidos + plugins)
slot: commander                # commander | adr | prd | operator
category: triagem               # só operator: key de categoria (do plugin ou embutida)
role: commander                # chave de ROLES (o bridge não valida; o app descarta preset com role desconhecido)
specialty: Triagem de demandas
icon: flow
model: opus
effort: high
tools: [Read, Glob, Grep]
avatar: raiser                 # key embutida (avatar-raiser ou raiser) ou key de avatar do plugin
description: Organiza e prioriza as demandas...
soul: Controlador calmo e criterioso...
hellos:
  - Oi! Qual é a feature?
  - ...
conventions:
  template: <id de template>
  subsets: [style-java, ...]
---
Conduza como o responsável pela triagem: ...
```

Subconjunto de YAML aceito pelo bridge (sem dependências): `chave: valor` (string, número, true/false; aspas simples
ou duplas opcionais), listas inline `[a, b, "c, d"]`, listas em bloco `- item`, um nível de mapa aninhado
(`conventions:` com chaves indentadas), comentários `#` fora de aspas. Qualquer outra coisa: o arquivo é
recusado com aviso.

`conventions.json` (opcional): `{ "families": { "<family>": { "templates": [...] } }, "subsets": [...], "groups": [...] }`
no mesmo formato de `src/conventions.js` (`CONVENTION_FAMILIES[family].templates`, `CONVENTION_SUBSETS`,
`CONVENTION_GROUPS`). Ids que já existem são recusados (aviso), nunca sobrescritos.

Temas: `ui` = variáveis CSS (`--nome`: cor `#rgb/#rrggbb/#rrggbbaa` ou `rgb()/rgba()`), aplicadas em `:root`;
`city` = chaves de `CITY` (`bg, build, tree, water, wall`; números `0xRRGGBB` ou strings `#rrggbb`; `exposure` número
0.5..2); `office` = chaves de `C` em `city.js`; `agent` = `{ "blue": "#29c8ff" }`; `run` = chaves de `RUN_TONE`.
Chaves desconhecidas são ignoradas.

## Limites e segurança (bridge)

- O Plugin é confiável (a pessoa o instalou), mas o bridge ainda: lê só dentro da pasta do plugin (realpath do
  arquivo dentro do realpath da raiz; symlink para fora é recusado), só as extensões acima, `.md`/`.json` ≤ 256 KB,
  imagem ≤ 1 MB, total de imagens por plugin ≤ 12 MB, ≤ 200 agentes por plugin, ≤ 20 plugins. Sem SVG.
- Imagens viram data URLs (`data:image/png;base64,...`) no JSON injetado.
- O app escapa todo texto vindo de plugin ao renderizar (mesmo caminho dos presets embutidos, `esc`).

## Contrato bridge → página

`serveIndex` injeta, antes dos scripts, `jsonTag('squad-plugins', PLUGINS)` com:
```json
{
  "plugins": [ {
    "id": "minha-empresa", "name": "Minha Empresa", "version": "1.0.0", "description": "...", "path": "/abs/plugin",
    "categories": [ { "key","label","icon","description","before" } ],
    "presets": [ { "slot","category","name","role","specialty","icon","model","effort","tools","avatar","description",
                   "style","soul","hellos","conv":{"template","subsets"} } ],
    "avatars": [ { "key": "plugin:minha-empresa/triagem", "label": "TRIAGEM", "src": "data:image/png;base64,..." } ],
    "themes": [ { "key": "minha-empresa/noite", "label": "Noite", "ui":{}, "city":{}, "office":{}, "agent":{}, "run":{} } ],
    "conventions": { "families":{}, "subsets":[], "groups":[] } | null,
    "runtime": {}
  } ],
  "runtime": {},            // config (squad.config + local) já mesclado sobre o runtime dos plugins
  "warnings": [ "texto em pt-BR" ]
}
```
- Avatares do plugin têm key `plugin:<id>/<key>`. O `avatar` de um preset vai como foi escrito (o bridge não conhece
  `PORTRAITS`); o app resolve nesta ordem: `plugin:<id>/<avatar>`, `avatar-<avatar>`, `<avatar>`.
- Temas têm key `<id>/<key>`.
- O bridge relê os plugins a cada `serveIndex` (cache por mtime dos arquivos lidos), então recarregar a página
  basta depois de editar um plugin. `GET /api/plugins` devolve o mesmo objeto sem os data URLs (`src` omitido) mais
  `config: { files: [caminhos lidos], paths: [...], disabled: [...], profiles: [...] }`.
- `GET /api/health` ganha `plugins: <quantidade carregada>`.

## Consumo na página (app.js)

No topo de `app.js` (function declarations, antes de qualquer seed/normalize), `readPlugins()` lê `#squad-plugins`
(ausente/inválido = `{plugins:[],runtime:{},warnings:[]}`, demo `file://` incluído) e, **antes** de o catálogo ser usado:
- `AGENT_PRESETS[slot]` (commander/adr/prd) recebe os presets; operadores entram na categoria `category`
  (categorias novas inseridas antes de `before`, default `'outros'`, ou no fim). Nome repetido = preset ignorado
  (aviso no console e na aba Plugins).
- `AGENT_SOULS[name] = {soul, hellos}` quando o preset traz soul.
- `TEMPLATE_AVATARS[name]` = key resolvida do avatar; `PORTRAITS[plugin:...] = src` e o avatar entra em `AVATARS`
  (aparece no seletor de foto).
- Diretrizes mescladas em `CONVENTION_FAMILIES`/`CONVENTION_SUBSETS`/`CONVENTION_GROUPS` sem sobrescrever.
- `DEFAULT_RUNTIME` recebe `PLUGINS.runtime` (whitelist) antes do seed; workspaces existentes só preenchem campos vazios.
- Tema: `state.settings.theme` (persistido, `normalizeWorkspace`, `''` = padrão). Aplicado no boot: variáveis CSS em
  `document.documentElement.style` e `window.SQUAD_THEME = {city, office, agent, run}`, que `city.js` lê ao criar a
  cena (`Object.assign` sobre `C`, `CITY`, `AGENT_BLUE`, `RUN_TONE`). Trocar tema salva e recarrega a página.
- Configurações ganha a seção **Plugins**: plugins carregados (nome, versão, caminho, contagens), avisos, o seletor
  de Tema e como instalar (`squad.local.json`).
- Agentes já criados a partir de um plugin continuam no workspace se o plugin sair; perdem só a foto automática
  (voltam ao retrato da especialidade) e o "Restaurar default".

## Saída do núcleo

Conteúdo específico de uma empresa vive num plugin fora do repositório; o núcleo traz só o carregador genérico.
`tools:p.tools?[...p.tools]:...` em `presetDefaults` é genérico e fica.

## Desvios e decisões da implementação

- Bridge (`plugins.js`): presets chegam com todas as chaves (`tools`/`conv` `null` quando ausentes); operador sem `category`
  vai para `outros`; `conventions.json` é lido se existir mesmo sem o campo no manifesto; avisos citam `[<id>] agents/X.md`.
  `runtime` validado nos tipos de `DEFAULT_RUNTIME` (`timeoutSec` 10..7200, `concurrency` 1..8). Na config, `runtime`
  mescla campo a campo, `plugins.disabled` e `profiles` são do último arquivo que os declara. Limites extras: 20 temas,
  30 categorias, 200 avatares por plugin, 200 variáveis por tema. Avatares conferidos pela assinatura do arquivo.
- App: o tema é resolvido antes do boot (`squadThemeBoot`, chamado por `city.js`, que monta a cena antes do `app.js`
  terminar). A escolha de qual workspace carregar (banco, cópia do navegador ou nenhum) é uma função só, `bootChoice()`,
  usada pelo bloco de boot e por `bootThemeKey()`. Se o workspace escolhido falhar na normalização e o boot cair no outro,
  o CSS acompanha na hora e o mapa só na próxima carga.
- Troca de tema: salva e espera a gravação no banco (`diskFlush` e o que ficar na fila), com prazo de 5 s cobrindo toda a
  espera. Só recarrega se a versão atual estiver confirmada no banco (sem gravação pendente) ou gravada com sucesso na cópia
  do navegador (que vence no boot seguinte, `bootChoice`). Senão não recarrega: volta o tema anterior, reabilita o seletor
  e mostra o erro. É recusada durante uma operação. O runtime do plugin preenche só chaves **ausentes** do runtime salvo (`''` é
  escolha da pessoa). Preset recusado quando o slot não combina com o role (adr→architect, prd→po).
- Limitação: avatar de plugin escolhido à mão vira `a.image`, e imagens acima de 800 KB são descartadas pela
  normalização; a foto automática do template não tem esse limite.
- Chaves reservadas: `__proto__`, `constructor` e `prototype` são recusadas como chave no frontmatter (o arquivo é
  recusado), como família, id de template, subset, grupo e em `conventions.subsets` de um preset. O app ainda confere
  famílias com `Object.hasOwn(CONVENTION_FAMILIES, …)`, roles com `Object.hasOwn(ROLES, …)` e avatares com
  `Object.hasOwn(PORTRAITS, …)`; nomes de preset (`/^[A-Z0-9][A-Z0-9-]{1,23}$/`) nunca colidem com chaves do protótipo.

### Limites efetivos (bridge `plugins.js` e app `pluginLimits()`, iguais nas duas pontas)

Texto acima do limite **recusa o item** com aviso (bridge e app), nunca é cortado. Os limites dos agentes seguem o que
`normalizeWorkspace` guarda de um agente, para nada se perder ao recarregar.

| Item | Campo | Limite |
|---|---|---|
| Plugin | `id` | `/^[a-z0-9][a-z0-9-]{1,40}$/` |
| Plugin | `name` / `version` / `description` | 80 / 40 / 1000 (excesso: aviso, o plugin segue com o id como nome) |
| Categoria | `key`, `before` | `/^[a-z0-9][a-z0-9_-]{0,40}$/` |
| Categoria | `label` / `icon` / `description` | 60 / 40 / 500 |
| Preset | `name` | `/^[A-Z0-9][A-Z0-9-]{1,23}$/` |
| Preset | `specialty` / `description` / `soul` | 40 / 1000 / 1200 |
| Preset | `hellos` | até 8, cada uma até 300 |
| Preset | corpo (`style`) | 16000; no app, instruções finais (`presetPrompt`) até 20000, senão o preset é recusado |
| Preset | `tools` | até 30 nomes `/^[A-Za-z][A-Za-z0-9_]*$/` |
| Preset | `conventions.template` / `conventions.subsets` | 80 / até 20 ids de diretriz |
| Avatar | `key` / `label` | `KEY_RE` acima / 60; imagem ≤ 1 MB, total ≤ 12 MB |
| Tema | `key` / `label` | `KEY_RE` acima / 60; até 200 variáveis `--[a-z0-9-]{1,40}` |
| Diretrizes | ids (família, template, subset, grupo) | `/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/`, fora as chaves reservadas |
| Diretrizes | `name` / `label` / `icon` / `group` | 60 / 60 / 40 / 81 |
| Diretrizes | `tags` / `desc` / `summary` / `content` | 300 / 300 / 300 / 20000 |

