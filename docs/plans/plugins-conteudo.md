# Plugins de conteúdo e configuração local

Objetivo: tudo o que é específico de uma empresa ou de um gosto pessoal (agentes, souls, diretrizes, avatares,
temas do mapa, defaults de execução) sai do código e vem de **plugins de conteúdo**: pastas fora do repositório, apontadas por
arquivos de configuração no estilo `settings.json` / `settings.local.json` do Claude Code. O núcleo fica igual ao
upstream mais um carregador genérico; o conteúdo específico de uma empresa vive num plugin fora do repositório.

## Termos

- **Plugin**: pasta com um `squad-plugin.json` e arquivos que estendem o catálogo (agentes, categorias, souls,
  diretrizes, avatares, temas, defaults). Nunca altera dados já salvos no workspace. O mesmo manifesto pode trazer também código
  do bridge (`server`), que só roda pela configuração local: ver `docs/plans/plugins.md`.
- **Tema**: paleta da interface e do mapa (cidade e escritório) oferecida por um plugin; escolhido nas Configurações.
- **Configuração local**: `squad.config.json` (versionável, compartilhado) e `squad.local.json` (git-ignored, desta
  máquina), na raiz do app. O local vence o compartilhado.

## Configuração

Ordem (o último vence campo a campo; `plugins.paths` é concatenado sem repetir; `plugins.disabled` vale o do último arquivo que o declara; `profiles` são mesclados por `key`):
1. `squad.config.json` (raiz do app, opcional; o upstream não tem); `SQUAD_CONFIG_SHARED=<arquivo>` o substitui (testes)
2. `squad.local.json` (raiz do app, git-ignored)
3. `SQUAD_CONFIG=<arquivo>` (substitui o item 2; usado nos testes)
4. `SQUAD_PLUGINS=<dir>[:<dir>...]` (separador `path.delimiter`), soma aos `plugins.paths`

```json
{
  "$schema": "./schemas/squad.schema.json",
  "plugins": {
    "paths": ["../minha-empresa-squad/plugin", "~/squad-plugins/pessoal"],
    "disabled": ["pessoal"]
  },
  "runtime": { "model": "sonnet", "concurrency": 3 },
  "profiles": [
    { "key": "trabalho", "name": "Claude trabalho", "adapter": "claude", "configDir": "~/.claude-work", "model": "sonnet", "effort": "high" }
  ],
  "defaultProfile": "trabalho"
}
```
- Caminhos relativos resolvem contra a pasta do arquivo que os declarou; `~` expande para o home.
- `runtime`: chaves permitidas = as de `DEFAULT_RUNTIME` do app (o bridge repassa só chaves de um whitelist:
  `permissionMode, model, effort, maxBudgetUsd, timeoutSec, concurrency, addDirs, restrictTools, extraAllowedTools`).
  Vale como **default** para workspaces novos e para campos vazios; nunca sobrescreve o que a pessoa salvou.
- **`runtime` de fonte compartilhada:** `permissionMode`, `addDirs` e `extraAllowedTools` ampliam o que um agente pode fazer, então só valem vindos do arquivo local (`squad.local.json`/`SQUAD_CONFIG`), de um plugin que algum arquivo local nomeia, de `SQUAD_PLUGINS` ou da pasta do home. No `squad.config.json` (runtime direto) e em plugin achado só por ele são avisos e são ignorados; os demais campos de `runtime` seguem como antes.
- `profiles`: Perfis declarados (termos em `CONTEXT.md`; contrato dos Perfis em `docs/plans/perfis-adapters.md`). Detalhes em
  **Perfis da configuração**, abaixo.
- `defaultProfile`: o Perfil padrão: a `key` de um Perfil da configuração ou o id de um Perfil existente (o último arquivo
  que declara vence).
- JSON inválido: o bridge loga, segue sem aquele arquivo e reporta em `warnings`.

## Perfis da configuração

Cada item de `profiles` usa **os mesmos campos de `POST /api/profiles`** mais `key`:
`key, name, adapter (claude|codex), bin, configDir, model, effort, concurrency, fallbackId, threshold, ignoreUserConfig,
telemetry {enabled, native, content}` (formato em `schemas/squad.schema.json`, `$defs.profile`). Campo desconhecido: aviso e
ignorado (inclusive dentro de `telemetry`); headers de telemetria são configuração do bridge, nunca do Perfil. O diretório da conta é `configDir` (o mesmo nome da
API; vira a coluna `config_dir` e chega ao processo como `CLAUDE_CONFIG_DIR` / `CODEX_HOME`).

- `key`: `/^[a-z0-9][a-z0-9-]{0,40}$/`, única no arquivo. O Perfil fica no banco com o id estável `cfg-<key>`.
- Caminhos (`plugins.js`): `configDir` e um `bin` com separador, `~` ou `.` resolvem contra a pasta do arquivo que declarou o
  campo (`~` = home); um `bin` sem barra continua sendo um nome procurado no `PATH`.
- Mescla entre `squad.config.json` e `squad.local.json` (ou `SQUAD_CONFIG`): por `key`, o arquivo posterior sobrescreve campo a
  campo; `telemetry` é mesclado chave a chave. A origem mostrada é o último arquivo que declarou o Perfil.
- Validação (`server.js`): a mesma `validateProfile` de `POST /api/profiles` (nome 1..40 e único, adapter, `configDir` existente,
  `bin` resolvível, esforço do Adapter, teto 1..10, limiar 50..100). `fallbackId` aceita a `key` de outro Perfil da configuração
  ou o id de qualquer Perfil (mesmo Adapter, diferente de si); reserva inválida = aviso e Perfil sem reserva.
- Segredos: nunca valores. Os Perfis não têm campo de segredo; a telemetria guarda só nomes de variáveis de ambiente (ADR 0002).

Sincronização (bridge): na abertura do banco e sempre que a assinatura da configuração muda (o carregador já tem cache por
mtime; a checagem acontece onde a página lê os Perfis: carga da página, `GET /api/plugins`, `GET /api/profiles`, nunca em cada
execução). Na abertura do banco a ordem é: "Codex (padrão)" (`ensureCodexDefault`), depois os Perfis da configuração, então um
`defaultProfile: "codex-default"` funciona; `/api/setup` aguarda os dois, e toda execução (`startRun`) espera a sincronização em
andamento antes de reservar a vaga. Numa transação: primeiro saem os Perfis de configuração que não estão mais no arquivo (assim
trocar a `key` mantendo o `name` não esbarra no nome único), depois upsert de cada Perfil válido como `cfg-<key>` com
`source = 'config'` e `source_file` (colunas novas, migração `user_version` 4), reservas e o padrão. A assinatura (`profiles`
mesclados com `source`/`files`, `defaultProfile`, `defaultProfileFile`, `profilesError`) só é registrada quando a sincronização
termina sem erro de gravação (ex.: nome já usado por um Perfil manual); senão a próxima leitura tenta de novo.
- Perfil que sai da configuração: removido da tabela; reservas que apontavam para ele são limpas; agentes que o usavam caem no
  Perfil padrão (regra existente). Se ele era o padrão, "Claude (padrão)" (ou o primeiro que sobrar) assume. `usage_daily` e as
  Janelas de uso ficam pelo id: se a `key` voltar, o mesmo `cfg-<key>` religa o histórico (uma reserva manual apontada para ele
  não volta).
- Trava parcial: cada item vale por si. Item sem `key` válida (ou que não é objeto): aviso e ignorado. Item com `key` válida e
  campo inválido no schema (tipo, enum, faixa, formato), repetido no mesmo arquivo ou acima de 50 Perfis: marcado `invalid` (aviso
  com arquivo, key e campo, ex. `squad.local.json: Perfil ruim: effort: valor "turbo" não aceito (...)`); o `cfg-<key>` existente
  fica como estava (nem removido, nem alterado) e, se não existe, não é criado. O mesmo vale quando `validateProfile` recusa o
  Perfil mesclado (ex.: `configDir` inexistente). Os demais itens sincronizam normalmente. `GET /api/profiles` traz em cada Perfil
  de configuração `configError` (mensagens) e `configFiles` (arquivos que o declaram, do de menor precedência para o de maior).
- Configuração inválida no nível do arquivo (ilegível, JSON inválido, não é objeto, `profiles` que não é lista): nada muda nos
  Perfis de configuração (não apaga por erro) e vai um aviso.
- `defaultProfile` desconhecido: aviso, o padrão atual fica.
- Avisos: em `warnings` de `#squad-plugins` / `GET /api/plugins` e em `configWarnings` de `GET /api/profiles` (os do carregador sobre
  `profiles`/`defaultProfile` mais os da sincronização), que também traz `configDefault` (nome do arquivo quando o
  `defaultProfile` está valendo, senão `''`), `configDefaultDeclared` e `configDefaultTarget` (arquivo onde "Tornar padrão"
  grava). Cada Perfil traz `source` e `sourceFile`.
- `GET /api/plugins.config` traz `profiles` já mesclados (`{key, ...campos, source, files, invalid?}`), `defaultProfile`,
  `defaultProfileFile`, `profilesError`, `localFile`, `hashes` e `profileWarnings`.

### Gravar no arquivo de origem

Perfis criados pela tela continuam no banco. Um Perfil de configuração é alterado no arquivo, nunca na tabela (a sincronização
que vem em seguida traz a mudança):
- `PUT /api/profiles/cfg-<key>`: primeiro os tipos do corpo (texto, inteiro, booleano, `telemetry` só com
  `enabled/native/content` booleanos; `null` ou `"3"` = 400, nada é convertido). As mudanças são o que difere do Perfil efetivo:
  `bin`/`configDir` comparados depois de resolvidos contra a pasta do arquivo de destino (relativos e `~` valem como na leitura) e
  gravados como a pessoa escreveu; `telemetry` chave a chave, e só as chaves que mudaram entram no objeto `telemetry` do próprio
  item (as herdadas de outro arquivo não são copiadas); a reserva que é Perfil de configuração vai como `key`. Vão **só os campos
  alterados**, no item daquela `key` do arquivo de maior precedência que a declara (o local vence o compartilhado), mantendo o resto
  do arquivo. Antes de gravar: o item exato que será persistido passa pelo schema e o Perfil que vai resultar (a entrada mesclada
  com as mudanças) passa por `validateProfile` e pelas regras de reserva; nome já usado = 409, troca de Adapter = 400. Se a
  sincronização depois da escrita recusar o Perfil, a resposta é 400 dizendo que gravou e por que foi recusado. Sem mudança, nada é
  gravado. Responde `{profile, file, changed}`.
- `POST /api/profiles/:id/default`: quando o Perfil vem da configuração ou a configuração declara `defaultProfile`, grava
  `defaultProfile` (a `key`, ou o id de um Perfil do banco) no arquivo que o declara, ou no local (`squad.local.json`, ou o
  arquivo de `SQUAD_CONFIG`) se nenhum declara; o arquivo é criado se não existir. Sem nada disso continua só no banco.
- `DELETE /api/profiles/cfg-<key>`: remove o item do arquivo. Recusado (409) se a `key` também está num arquivo de menor
  precedência (ele continuaria vindo de lá; a mensagem diz de onde) ou se é o Perfil padrão.
- Item com formato inválido (`invalid`): `PUT`/`DELETE`/padrão respondem 409 até o arquivo ser corrigido.
- Uma operação por vez, inteira (`configOp`): releitura, validação (inclusive "é o padrão?"), escrita e a sincronização depois
  dela; duas requisições sobre o mesmo Perfil (ex.: tornar padrão e excluir) nunca se intercalam. PUT, DELETE e "tornar padrão" de
  Perfis do banco passam pela mesma fila (a decisão de gravar o padrão no arquivo é tomada dentro dela), e excluir o Perfil que é o
  padrão efetivo (no banco ou em `defaultProfile`) é recusado lá dentro.
- Configuração com erro no nível do arquivo (`profilesError`, arquivos em `config.errorFiles`): PUT, DELETE e "tornar padrão" que
  gravariam na configuração respondem 409 citando o arquivo antes de escrever qualquer coisa (a sincronização estaria travada).
- Depois de gravar e sincronizar, o banco é conferido: DELETE = o Perfil sumiu; PUT = os valores efetivos alterados estão lá;
  padrão = o Perfil é o padrão. Se não bateu, a resposta é erro (500) dizendo que gravou e o que não foi aplicado.
- Escrita (`writeConfigFile`): o texto é lido e conferido contra o sha1 da última leitura do bridge (`config.hashes`); depois da
  validação assíncrona ele é lido e conferido de novo, e daí até o `rename` tudo é síncrono (nenhum `await` entre a última
  conferência e a troca). Mudou = 409 e nada é escrito; depois de uma leitura (recarregar a página) a edição passa.
- Arquivo que é link simbólico: grava no destino real (`realpath`), na pasta do destino; o link continua link.
- Temporários com nome aleatório, criados com `wx` (exclusivo) no modo do arquivo original (`stat.mode`; arquivo novo: `0600`),
  `fsync` e `rename`; dono e grupo do original são repassados com `fchown` quando o sistema deixa (EPERM e afins são ignorados:
  na prática o grupo). A cópia `.bak` (com o texto conferido) é escrita do mesmo jeito: um `.bak` existente que seja link é
  substituído, nunca seguido. JSON com 2 espaços + `\n`. Depois de gravar: `invalidate()` do carregador e nova sincronização.
- Teste: `SQUAD_TEST_CONFIG_WRITE_PAUSE_MS` põe uma pausa entre a primeira leitura e a escrita (só para simular uma edição no meio).
- Um arquivo de configuração que não existe só não tem Perfis (os dele saem); um que existe e não pode ser lido não muda nada.

#### Riscos residuais

Sem lock do sistema operacional (o Node não tem `flock`/`openat` portáveis), três janelas continuam abertas:
- **Escritor externo entre a última conferência e o `rename`.** A releitura com sha1 e o `rename` são síncronos e seguidos, mas um
  editor que salve exatamente nesse intervalo (microssegundos) é sobrescrito. Mitigação: o `.bak` guarda o texto conferido e,
  em qualquer outro momento da operação, a mudança dá 409 sem escrever nada.
- **Troca do symlink durante a operação.** O destino é resolvido (`realpath`) no início; se o link for trocado para outro arquivo
  depois disso, a escrita vai para o destino antigo (o conteúdo do novo nunca é lido nem sobrescrito). A conferência por hash do
  destino antigo continua valendo, e a próxima leitura do bridge segue o link novo.
- **Dono, grupo e ACL.** O modo (`stat.mode`) é preservado e o grupo é repassado com `fchown` quando permitido; o dono só se o
  processo tiver permissão (normalmente não) e ACLs/atributos estendidos não são copiados, porque o arquivo é substituído por
  `rename`. Quem depende de ACL no arquivo de configuração deve reaplicá-la ou editar o arquivo à mão.
- UI: o Perfil de configuração tem Editar (o formulário avisa "salvar grava em <arquivo>" e o botão diz "Salvar em <arquivo>"),
  Tornar padrão e Excluir com confirmação em linha que cita o arquivo; Excluir some quando a `key` está em mais de um arquivo.
  Item inválido: selo "FORMATO INVÁLIDO NO ARQUIVO", as mensagens no card e só Testar/Atualizar uso.

### JSON Schema

`schemas/squad.schema.json` (configuração: `$schema`, `plugins` {`paths`, `disabled`}, `runtime`, `profiles`, `defaultProfile`),
`schemas/squad-plugin.schema.json` (manifesto, só campos de conteúdo) e `schemas/squad-agent.schema.json` (frontmatter de `agents/*.md`, para referência
e validação), draft 2020-12, descrições em pt-BR, patterns e enums iguais às constantes de `plugins.js` (`CONSTANTS`; um teste
compara). Nos arquivos, `"$schema": "./schemas/squad.schema.json"` (caminho relativo ao arquivo) liga a validação no editor; o
bridge aceita a chave. `schema.js` é um validador sem dependências do subconjunto usado (`type`, `properties`, `required`,
`additionalProperties`, `items`, `enum`, `const`, `pattern`, `minimum`/`maximum`, `minLength`/`maxLength`, `minItems`/`maxItems`,
`exclusiveMinimum`/`exclusiveMaximum`, `$ref` local com detecção de ciclo e limite de 64 refs aninhadas (erro de validação, não
estouro de pilha), `oneOf`/`anyOf`), com erros por caminho (`profiles[1].effort: ...`). Uso em `plugins.js`: campo desconhecido = aviso e
ignorado (configuração, manifesto, itens, frontmatter); outro erro de schema recusa o item (Perfil, categoria, avatar, tema,
agente) com o caminho do campo. As checagens semânticas continuam e falam primeiro (realpath, assinatura de imagem, limites,
cores, chaves reservadas); os erros de `runtime` e de `plugins.paths`/`plugins.disabled`/`defaultProfile` seguem com as mensagens de antes.
`runtime.maxBudgetUsd` é igual no código e no schema: número maior que 0 e até 1000, ou o mesmo como texto decimal simples com até
4 casas (`BUDGET_RE`: sem sinal, expoente, hexadecimal, espaços ou ponto inicial; `0.0000` fica de fora pelo lookahead),
`""`/`null` = sem teto. Os dois schemas repetem a mesma definição de
`runtime` (o `$ref` é só local); um teste confere que são iguais e que o schema aceita exatamente o que `validateRuntime` aceita.

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
tools: [Read, Glob, Grep]      # só nomes de TOOLS do app, sem repetir
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
  `config: { files: [caminhos lidos], paths: [...], disabled: [...], profiles: [...], defaultProfile, defaultProfileFile, profilesError }`.
- `GET /api/health` ganha `plugins: <quantidade carregada>`.

## Consumo na página (app.js)

No topo de `app.js` (function declarations, antes de qualquer seed/normalize), `readPlugins()` lê `#squad-plugins`
(ausente/inválido = `{plugins:[],runtime:{},warnings:[]}`, demo `file://` incluído) e, **antes** de o catálogo ser usado:
- `AGENT_PRESETS[slot]` (commander/adr/prd) recebe os presets; operadores entram na categoria `category`
  (categorias novas inseridas antes de `before`, default `'outros'`, ou no fim). Nome repetido: vale o primeiro preset que o app
  aceita (role, slot, tamanho das instruções); os outros são ignorados com aviso no console e na aba Plugins.
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
  mescla campo a campo, `plugins.disabled` é do último arquivo que o declara; `profiles` são mesclados por `key` (seção Perfis da configuração). Limites extras: 20 temas,
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

- Revisão do Codex (PR #1):
  - Nome repetido não é mais reservado no bridge (ele não conhece `ROLES` nem os nomes embutidos): todo preset válido vai para a
    página, e `pluginPresets` só reserva o nome depois de todas as checagens (role, slot × role, instruções até 20000). Um preset
    recusado pelo app num plugin anterior não tira mais o lugar de um utilizável de mesmo nome num plugin posterior.
  - `tools` aceita só nomes de `TOOLS` (a lista do app, que `normalizeWorkspace` usa; no app `TOOLS` vem de `pluginLimits().tools`),
    sem repetir; outro nome recusa o agente com aviso, em vez de sumir no primeiro reload.
  - `content` de subset de plugin vai até 8000 (o que o workspace guarda); acima disso o subset é recusado com aviso.
  - Categoria de um agente recrutado (`agentCategory`): a categoria do seu preset de origem (`template`, já persistido) enquanto o role
    for o do preset; senão a do role. O Squad Studio usa isso para marcar ATUAL, posicionar o cursor e listar o agente, então um agente
    vindo de uma categoria de plugin (`roles: []`) continua nela.

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
| Preset | `tools` | só nomes de `TOOLS` (`Read, Glob, Grep, Edit, Write, Bash, WebFetch, WebSearch, NotebookEdit`), sem repetir |
| Preset | `conventions.template` / `conventions.subsets` | 80 / até 20 ids de diretriz |
| Avatar | `key` / `label` | `KEY_RE` acima / 60; imagem ≤ 1 MB, total ≤ 12 MB |
| Tema | `key` / `label` | `KEY_RE` acima / 60; até 200 variáveis `--[a-z0-9-]{1,40}` |
| Diretrizes | ids (família, template, subset, grupo) | `/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/`, fora as chaves reservadas |
| Diretrizes | `name` / `label` / `icon` / `group` | 60 / 60 / 40 / 81 |
| Diretrizes | `tags` / `desc` / `summary` | 300 / 300 / 300 |
| Diretrizes | `content` | template 20000 (vira a `base` do agente); subset 8000 (o que `normalizeWorkspace` guarda de um subset) |

