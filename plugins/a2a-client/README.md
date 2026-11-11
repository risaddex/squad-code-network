# Cliente A2A do SQUAD/CODE

Plugin opt-in para o diretório autenticado do `agent-runtime` e A2A 1.0 JSON-RPC. Descobre agentes e skills pelo Card, sem branches por nome de provedor: Codex, Claude, Cursor e Hermes seguem o mesmo contrato. Isso não implica compatibilidade com endpoints A2A 0.3 ou com qualquer diretório externo.

## Instalação

Na configuração **local** do SQUAD/CODE, acrescente o caminho absoluto desta pasta, habilite código e conceda a capacidade `adapter`:

```json
{
  "plugins": {
    "paths": ["/caminho/squad-code-network/plugins/a2a-client"],
    "enabled": ["a2a-client"],
    "entries": {
      "a2a-client": {
        "grants": ["adapter"],
        "settings": {
          "gatewayUrl": "https://agents.example.test",
          "pollIntervalMs": 1000,
          "requestTimeoutMs": 10000
        }
      }
    }
  }
}
```

Forneça `SQUAD_A2A_TOKEN` ao processo host por um mecanismo de secrets. Não coloque o token em settings, perfil, prompt ou URL. O host precisa ser reiniciado para receber uma nova variável de ambiente; a API de embedding permite um `tokenProvider` dinâmico. Renovação conserva `iss` e `sub`. A identidade é apenas decodificada para evitar troca de principal durante retomada; assinatura, validade, audience e ACL são verificadas pelo gateway.

`gatewayUrl` é uma origem HTTPS sem caminho, credenciais, query ou fragmento. HTTP é aceito somente em localhost/127.0.0.1/[::1] explicitamente configurado. Redirects são recusados. URLs externas anunciadas em Cards não são seguidas, e partes URI de artefatos não são baixadas. DNS/TLS e configuração do host pertencem ao domínio confiável de operação.

O perfil usa `adapter: "a2a"` e:

```json
{
  "remote": {
    "projectId": "project",
    "agentId": "cursor",
    "environmentId": "shared-stateful",
    "localProject": "projeto-local"
  }
}
```

Os quatro campos são obrigatórios. `localProject` fixa o vínculo com a operação local; não é enviado como caminho ao agente. Binário, modelo, effort, diretório de configuração e fallback local não são aceitos. O ambiente remoto é definido pelo gateway, conferido na descoberta e não é limpo pelo cliente.

## Persistência e retomada

`prepareRemote` grava a intenção imutável no SQLite do `ctx.dataDir()` antes da admissão durável no core, sem HTTP. Depois, `startRemote` usa a mesma intenção. O journal contém o prompt, referências públicas e estado: proteja essa pasta como dado privado. Token e cabeçalhos de autenticação não são persistidos. UUID/inode, marker, versão e hashes detectam substituição/alteração acidental; não são proteção contra um administrador malicioso com acesso de escrita.

Antes do primeiro Send, os parâmetros são persistidos e fixados. `requestId` e `messageId` permanecem estáveis. Se o Card negocia `urn:squad:agent-runtime:request:v1`, uma resposta perdida permite repetir os mesmos parâmetros com o mesmo requestId. Sem essa extensão, um Send ambíguo permanece incerto e não é repetido. Conhecido o taskId, a retomada usa somente GetTask e, quando solicitado, CancelTask, no endpoint e na identidade fixados no journal. Ela dispensa descoberta e usa polling, de modo que um Card alheio ou diretório indisponível não bloqueia a reconciliação. Não há takeover por TTL nem reenvio automático com um novo ID.

Falhas comprovadas de entrada antes de despacho e rejeições JSON-RPC definitivas na primeira tentativa encerram com erro. Uma rejeição de retry após tentativa ambígua mantém a tarefa incerta, pois não prova a ausência da execução anterior. Falhas de transporte, autenticação, conflito de identidade, resposta inválida ou estado desconhecido permanecem não terminais. O polling aplica timeout por chamada e backoff limitado a 30 s; a reconciliação pode continuar indefinidamente. Falhas não expõem mensagens privadas do servidor. Não há operação administrativa de reset/reparo do journal nesta versão.

Cancelamento persiste a intenção antes da chamada; apenas `TASK_STATE_CANCELED` confirma o cancelamento remoto. Antes de qualquer tentativa de Send, uma intenção cancelada termina sem envio. `close()`/dispose somente param observação e deixam a Promise `done` pendente, sem alegar que o agente foi parado.

Cards com `streaming: true` permitem uma tentativa limitada de SubscribeToTask depois que o taskId é conhecido. SSE serve somente para antecipar GetTask; os deltas não são tratados como resultado autoritativo. Desconexão, timeout ou formato não suportado retornam ao polling, sem Send adicional. O gateway atual não anuncia SSE. O SSE entre navegador e bridge é independente deste canal.

O prompt e as instruções concatenados devem caber em 16 KiB UTF-8; entradas maiores são recusadas antes de admissão/envio. A saída aceita texto e dados JSON limitados, sem buscar artefatos externos. Evidências `codex-exec`, `claude-exec` e `cursor-exec`, quando presentes, exigem `outputSha256` igual ao SHA-256 do texto agregado por nova linha. O resultado do adapter segue o formato de resultado da UI do core; custo e usage permanecem `null`, pois não existe contrato remoto de faturamento verificado.

## API de embedding e validação

```js
import { createA2AClient } from './client.mjs';
const client = createA2AClient({
  gatewayUrl: 'https://agents.example.test',
  dataDir: '/diretorio-privado/a2a-client',
  tokenProvider: () => obterTokenDoHost(),
});
await client.prepareRemote({ id, profile, prompt });
const handle = client.startRemote({ id, profile, prompt, emit });
// Depois de reiniciar: client.resumeRemote({ id, profile, emit });
// handle.cancel() solicita cancelamento; handle.close() apenas para observação.
```

A descoberta está em `GET /api/plugins/a2a-client/agents`; ela projeta projeto, ambiente, agente, nome, versão, descrição, skills e catálogo opcional. O catálogo é descritivo; o cliente não executa BaseTools locais.

Testes locais: `node --test tests/a2a-client.test.mjs` (Node 24 com o módulo nativo better-sqlite3 correspondente). Fixtures usam exclusivamente loopback e diretórios temporários: perda de resposta, retomada, concorrência, token/identidade, cancelamento, SSE, integridade do journal, carregamento pelo host real e Cards de quatro agentes. Não invocam CLIs nem modelos. A prova contra o gateway real é separada da suíte portátil.
