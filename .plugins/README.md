# .plugins/

Pasta dos plugins deste clone do SQUAD/CODE. Cada subpasta `.plugins/<id>/` é um plugin (com `squad-plugin.json`) e o nome da
pasta precisa ser igual ao `id` do manifesto. Tudo aqui dentro é ignorado pelo git do app, menos este README e o `.gitkeep`:
cada plugin é um repositório próprio.

Guia completo (manifesto, conteúdo x código, capacidades, `ctx`, eventos, segurança): [`plugins/README.md`](../plugins/README.md).

## Instalar

```sh
git clone <url-do-plugin> .plugins/<id>
```

Recarregue a página. O conteúdo (agentes, categorias, diretrizes, avatares, temas, padrões de execução) aparece no catálogo sem
nenhuma configuração: `.plugins/` conta como fonte **local**, com a mesma confiança do `squad.local.json` e de
`~/.squad-code/plugins/<id>/`.

Para criar um plugin novo aqui: `npm run plugin:new -- <id>` (veja `plugins/README.md`, seção "Criar um plugin").

## Habilitar código

Um plugin com código do bridge (`"server"` no manifesto) só roda quando você o habilita no `squad.local.json` (na pasta do app,
git-ignored) e concede as capacidades que ele pede:

```json
{
  "$schema": "./schemas/squad.schema.json",
  "plugins": {
    "enabled": ["<id>"],
    "entries": { "<id>": { "grants": ["run.mutate"] } }
  }
}
```

Depois reinicie o bridge (`npm start` ou `npm run dev`). O `squad.config.json` compartilhado nunca liga código.

## Compatibilidade

O manifesto pode declarar as versões do SQUAD/CODE que suporta em `"squadCode"` (faixa semver, ex. `"^2.1.0"`), comparada com a
`version` do `package.json` do app. Fora da faixa o plugin fica com status **incompatível** em Configurações > Plugins e nada dele
carrega. Sem o campo, o plugin é aceito em qualquer versão.

## Atualizar e remover

```sh
git -C .plugins/<id> pull     # atualizar
rm -rf .plugins/<id>          # remover (tire o id de plugins.enabled se ele tinha código)
```

Conteúdo é relido ao recarregar a página; código, só ao reiniciar o bridge.
