# Execução local

`local-process.js` encapsula somente o transporte de processos do bridge. É uma
extração do comportamento existente, sem API remota, dependências novas ou mudança
no contrato dos adapters.

## Contrato interno

| Operação | Responsabilidade |
|---|---|
| `spawnBin(resolved, args, opts)` | Iniciar um executável resolvido; preservar wrappers `.cmd`/`.bat` no Windows e `.mjs`/`.cjs`/`.js` pelo Node. Também usado pela sondagem de versão. |
| `start(resolved, args, { cwd, env })` | Iniciar sincronamente o processo da execução, com três pipes e grupo destacado fora do Windows. Retornar o `ChildProcess` original. |
| `observe(child, { onStdout, onStderr, onError, onClose })` | Instalar uma vez os quatro callbacks obrigatórios; stdout/stderr entregam chunks UTF-8, erro entrega o erro do processo e close recebe o código/sinal nativos. |
| `writeInput(child, stdin)` | Encerrar stdin com o conteúdo UTF-8; continuar ignorando erros do pipe de entrada, como antes. |
| `cancel(child)` | Solicitar a sinalização local existente; não confirma término nem retorna estado de tarefa. Aceita handle nulo. |

O bridge chama `start`, registra a execução e emite `run:start` e os eventos
iniciais, instala o timer, chama `observe` e somente então `writeInput`. Não há
`await` entre a última verificação do pai e o spawn/registro do filho. A observação
também é síncrona: os listeners são instalados na mesma passagem do event loop.

O `ChildProcess` permanece em `run.child` por compatibilidade com a execução local;
não é um handle persistente nem um contrato para A2A. A sondagem de versão mantém
seus listeners e seu timeout no bridge e usa apenas `spawnBin`, sem o grupo destacado
das execuções.

## Fronteiras preservadas

- Adapters continuam preparando argv, stdin, ambiente, arquivos temporários e
  tradução específica de cada motor.
- O bridge mantém admissão, hooks, histórico, SSE, limites, timers, famílias de
  execuções e decisão do resultado final.
- Framing JSONL, linha final sem newline, limites de stderr e eventos continuam no
  bridge. No close, ele marca `closing`, limpa o timer e consome a linha pendente
  antes de revogar tokens, parar filhos e finalizar o resultado.
- Erro assíncrono do processo é observado separadamente do close; o close continua
  responsável pela finalização. Exceção síncrona de spawn continua propagada para
  o bloco que remove arquivos temporários.
- Cleanup remove apenas os arquivos temporários já gerenciados pelos adapters;
  não remove workspace, dependências ou caches. O módulo não faz cleanup.

## Sinalização e limites existentes

No Windows, `cancel` chama `taskkill /pid <pid> /T /F`. Nas demais plataformas,
envia `SIGTERM` ao grupo do processo e usa `child.kill('SIGTERM')` se isso falhar.
Handles já encerrados (`exitCode !== null`) ou marcados `killed` são ignorados.
Não há escalada nova, espera por toda a árvore, reconciliação após restart ou
garantia adicional de encerramento. Timeout, cancelamento manual, término do pai
e shutdown continuam usando essa mesma operação.

## Validação

No checkout, a suíte existente usa motores fake e inclui golden argv/env,
cancelamento, histórico e hooks. Não requer chamadas a agentes reais:

```sh
node --check server.js
node --check execution/local-process.js
node --check scripts/dev.mjs
node --test --test-name-pattern 'golden' tests/adapters.test.mjs
npm test
```

`npm run dev` observa também `execution/` para reiniciar o bridge após mudanças no
driver. Nenhum adapter ou plugin precisa migrar neste incremento.
