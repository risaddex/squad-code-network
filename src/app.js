'use strict';
/* Local-first workspace. With the bridge (node server.js) agents run real headless Claude Code (`claude -p`);
   opened via file:// or with the runtime in demo mode, the deterministic simulation is used instead. */
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}`;
const nowISO=()=>new Date().toISOString();
const pad=n=>String(n).padStart(2,'0');
const clock=date=>new Date(date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const clone=value=>JSON.parse(JSON.stringify(value));
const ICONS = {
 target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
 squad:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v2"/>',
 project:'<path d="M3 6h6l2 2h10v12H3Zm0 0V4h7l2 2h9v2"/>',
 flow:'<rect x="9" y="2" width="6" height="5"/><rect x="2" y="17" width="6" height="5"/><rect x="16" y="17" width="6" height="5"/><path d="M12 7v5H5v5m7-5h7v5"/>',
 terminal:'<rect x="2" y="3" width="20" height="18"/><path d="m6 8 4 4-4 4m7 0h5"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><rect x="7" y="4" width="3" height="4"/><rect x="15" y="10" width="3" height="4"/><rect x="8" y="16" width="3" height="4"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 play:'<path d="m8 4 12 8-12 8Z"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',
 stop:'<rect x="5" y="5" width="14" height="14"/>',
 arrow:'<path d="M3 12h18m-7-7 7 7-7 7"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 edit:'<path d="m14 5 5 5M4 20l1-6L16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L10 19Zm9 0h8"/>',
 copy:'<rect x="8" y="8" width="13" height="13"/><path d="M16 8V3H3v13h5"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 file:'<path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8m-8 4h8"/>',
 shield:'<path d="m12 2 8 4v7c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 lightning:'<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
 download:'<path d="M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 upload:'<path d="M12 17V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 trash:'<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
 code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
 board:'<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18m6-18v18M3 8h6m0 6h6m0-8h6"/>',
 back:'<path d="M21 12H3m7-7-7 7 7 7"/>',
 link:'<path d="m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l2-2m-4-12 2-2a4 4 0 0 1 6 6l-2 2"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
};
Object.assign(ICONS,{
 minus:'<path d="M4 12h16"/>',
 maximize:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 lock:'<rect x="5" y="10" width="14" height="11"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 crown:'<path d="M4 18 2 6l6 5 4-8 4 8 6-5-2 12ZM4 21h16"/>',
 radio:'<circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16"/>',
 flag:'<path d="M5 22V3m0 0h13l-3 5 3 5H5"/>',
 cpu:'<rect x="5" y="5" width="14" height="14"/><rect x="9" y="9" width="6" height="6"/><path d="M8 1v4m8-4v4M8 19v4m8-4v4M1 8h4m-4 8h4M19 8h4m-4 8h4"/>',
 screen:'<rect x="2" y="3" width="20" height="14"/><path d="M8 21h8m-4-4v4"/>'
});
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.target}</svg>`;
// Agent Teams (meetup): camera, hang up and the person's own tile.
Object.assign(ICONS,{video:'<rect x="2" y="6" width="13" height="12" rx="2"/><path d="m15 10 6-3.5v11L15 14"/>',leave:'<path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.4-3.4-1.6v-2.6a12 12 0 0 0-6.4 0v2.6l-3.4 1.6Z"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.3-4.2 4.4-6 8-6s6.7 1.8 8 6"/>'});
const ROLES={
 commander:{label:'Comandante',short:'CMD',name:'VANGUARD',icon:'crown',model:'opus',hex:{q:0,r:0},description:'Líder da operação. Transforma o briefing em um plano e distribui cada feature ao especialista certo.',prompt:'Você é o comandante de desenvolvimento. Leia o briefing do projeto, decomponha as features em trabalho verificável, atribua os especialistas certos, respeite as dependências e mantenha os handoffs concisos. Exponha os bloqueios. Não invente resultados de execução. Exija aprovação humana antes de marcar uma feature como concluída.'},
 po:{label:'Product Owner',short:'PO',name:'ECHO',icon:'file',model:'sonnet',hex:{q:0,r:-2},description:'Converte ideias em escopo, histórias de usuário e critérios de aceitação verificáveis.',prompt:'Você é o Product Owner. Refine o briefing do projeto em histórias de usuário, escopo e critérios de aceitação. Registre premissas e dúvidas. Entregue requisitos claros para a arquitetura e a engenharia.'},
 architect:{label:'Arquiteto',short:'ARC',name:'ATLAS',icon:'layers',model:'opus',hex:{q:2,r:-2},description:'Define arquitetura, contratos de API e fronteiras entre os componentes da aplicação.',prompt:'Você é o arquiteto de software. Inspecione o repositório existente antes de propor mudanças. Defina fronteiras de módulos, contratos de API, modelos de dados, dependências e trade-offs técnicos. Prefira soluções simples e fáceis de manter e registre as decisões que importam.'},
 backend:{label:'Backend Engineer',short:'BE',name:'FORGE',icon:'code',model:'sonnet',hex:{q:-2,r:2},description:'Implementa APIs, regras de negócio e persistência com validação e testes.',prompt:'Você é o engenheiro de backend. Implemente a feature atribuída de acordo com os critérios de aceitação. Valide as entradas, proteja os segredos e teste as regras de negócio. Relate com honestidade o que foi e o que não foi executado.'},
 frontend:{label:'Frontend Engineer',short:'FE',name:'PIXEL',icon:'screen',model:'sonnet',hex:{q:0,r:2},description:'Constrói interfaces acessíveis, estados de tela e integrações com o backend.',prompt:'Você é o engenheiro de frontend. Construa interfaces acessíveis e responsivas seguindo o design system do projeto. Integre as APIs documentadas e implemente os estados de carregamento, vazio, erro e sucesso. Inclua os passos de verificação.'},
 qa:{label:'QA / Reviewer',short:'QA',name:'SENTINEL',icon:'shield',model:'sonnet',hex:{q:2,r:0},description:'Verifica requisitos, identifica regressões e prepara evidências para a revisão humana.',prompt:'Você é o revisor de QA. Avalie a implementação contra os critérios de aceitação. Verifique regressões, segurança, acessibilidade e testes que faltam. Separe evidências observadas de suposições. Nunca afirme que um teste passou sem evidência de execução.'}
};
const SCOPES={setup:'Setup do projeto',fullstack:'Full-stack',backend:'Backend',frontend:'Frontend',architect:'Arquitetura',po:'Produto',qa:'Qualidade'};
Object.assign(ICONS,{
 move:'<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
 hexagon:'<path d="M12 2 21 7v10l-9 5-9-5V7Z"/><path d="m12 7 4.5 2.5v5L12 17l-4.5-2.5v-5Z"/>',
 office:'<path d="M3 20h18M4 20V9l8-5 8 5v11"/><rect x="7.5" y="11" width="3.5" height="3"/><rect x="13" y="11" width="3.5" height="3"/><path d="M10 20v-3h4v3"/>',
 palette:'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
 book:'<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4Zm16 0h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6Z"/>',
 server:'<rect x="3" y="3" width="18" height="7"/><rect x="3" y="14" width="18" height="7"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6m-6 11h6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4m8-4v4m-9 7h3m4 0h3m-10 4h3"/>',
 sparkle:'<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="1.5"/><path d="M11 18h2"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
});
// Software-development squad: every specialty has a default codename and portrait.
Object.assign(ROLES.architect,{name:'PROPHET'});
Object.assign(ROLES.commander,{portrait:'security'}); // VANGUARD uses the motherwolf portrait by default
Object.assign(ROLES,{
 pm:{label:'Gestor de Projetos / Scrum',short:'PM',name:'COMPASS',icon:'calendar',model:'sonnet',portrait:'po',hex:{q:1,r:-3},description:'Planeja sprints, riscos e dependências técnicas, e mantém o time alinhado.',prompt:'Você é o gestor de projetos e scrum master de um time de software. Quebre os objetivos em trabalho do tamanho de uma sprint, com responsáveis, dependências e riscos, mantenha o backlog e o quadro fiéis à realidade e escreva atualizações de status concisas. Sinalize bloqueios cedo e nunca reporte progresso que não foi verificado.'},
 designer:{label:'UX/UI Designer',short:'UX',name:'PRISM',icon:'palette',model:'sonnet',portrait:'frontend',hex:{q:3,r:-1},description:'Desenha fluxos, wireframes e especificações de interface acessíveis para o time de frontend.',prompt:'Você é o designer de UX/UI de um time de software. Defina fluxos de usuário, arquitetura da informação, especificações de componentes e estados (carregamento, vazio, erro, sucesso) que o frontend consiga implementar. Siga o design system, priorize a acessibilidade e documente o porquê das decisões.'},
 mobile:{label:'Mobile Engineer',short:'MOB',name:'VALETE',icon:'phone',model:'sonnet',hex:{q:-2,r:0},description:'Desenvolve apps iOS/Android, integrações com APIs, modo offline e performance em dispositivos.',prompt:'Você é o engenheiro mobile. Implemente a feature atribuída para iOS e Android seguindo a stack e a arquitetura do projeto. Trate os estados offline, de carregamento e de erro, respeite as diretrizes de cada plataforma e a acessibilidade e leve em conta performance e bateria. Relate com honestidade o que foi construído e verificado.'},
 devops:{label:'DevOps / SRE',short:'OPS',name:'DEPLOYER',icon:'server',model:'sonnet',hex:{q:-1,r:3},description:'Cuida de build, CI/CD, containers, infraestrutura como código e observabilidade.',prompt:'Você é o engenheiro de DevOps/SRE. Melhore build, CI/CD, containers, infraestrutura como código, observabilidade e confiabilidade. Prefira mudanças reproduzíveis, reversíveis e com o menor privilégio possível. Nunca exponha segredos e nunca rode comandos destrutivos ou de deploy sem aprovação explícita.'},
 security:{label:'Segurança (AppSec)',short:'SEC',name:'MOTHER WOLF',icon:'lock',model:'opus',hex:{q:2,r:1},description:'Revisa ameaças, vulnerabilidades, autenticação, segredos e dependências do código.',prompt:'Você é o engenheiro de segurança de aplicações. Revise o design e o código em busca de vulnerabilidades (OWASP Top 10), falhas de autenticação e autorização, manuseio de segredos, injeção, dependências inseguras e exposição de dados. Classifique os achados por severidade, com correções concretas. Nunca explore nada fora do escopo autorizado.'},
 data:{label:'Engenharia de Dados',short:'DAT',name:'DATABIRD',icon:'database',model:'sonnet',hex:{q:-3,r:1},description:'Modela dados, escreve migrações, pipelines e consultas com integridade e performance.',prompt:'Você é o engenheiro de dados. Projete schemas e migrações, pipelines de dados e consultas pensando em integridade, índices e performance. Mantenha as migrações reversíveis, proteja os dados pessoais e documente os contratos de dados para o restante do time.'},
 docs:{label:'Documentação Técnica',short:'DOC',name:'SCRIBE',icon:'book',model:'haiku',portrait:'architect',hex:{q:-2,r:-1},description:'Escreve README, guias, docs de API e changelogs a partir do código e das entregas.',prompt:'Você é o redator técnico. Produza READMEs, guias de instalação, referências de API e changelogs precisos a partir do código e das entregas reais. Mantenha os exemplos executáveis, estruture o conteúdo para leitura rápida e sinalize tudo o que não conseguiu verificar no repositório.'},
 dba:{label:'Banco de Dados',short:'DB',name:'VAULT',icon:'database',model:'sonnet',portrait:'data',hex:{q:-3,r:3},description:'Especialista em bancos de dados: modelagem, índices, migrações seguras, consultas e performance.',prompt:'Você é o especialista em banco de dados. Projete schemas, escreva migrações seguras e reversíveis, otimize consultas e índices e proteja a integridade dos dados. Relate as mudanças exatas e como foram verificadas.'},
 dotnet:{label:'Dev C# / .NET',short:'C#',name:'SHARPSHOOTER',icon:'csharp',model:'sonnet',portrait:'backend',hex:{q:4,r:-2},description:'Desenvolve serviços e APIs em C# / .NET com testes, injeção de dependência e boas práticas.',prompt:'Você é um desenvolvedor C# / .NET sênior. Implemente a feature atribuída com código testado, interfaces claras e injeção de dependência. Mantenha as mudanças pequenas e relate os arquivos e os testes.'},
 java:{label:'Dev Java',short:'JV',name:'ESPRESSO',icon:'java',model:'sonnet',portrait:'backend',hex:{q:-4,r:2},description:'Desenvolve serviços em Java (Spring e afins) com testes, contratos claros e código limpo.',prompt:'Você é um desenvolvedor Java sênior. Implemente a feature atribuída com código testado (Spring, quando o projeto usar), contratos explícitos e tratamento de erros. Relate os arquivos e os testes.'},
 node:{label:'Dev Node.js',short:'ND',name:'NODE RUNNER',icon:'node',model:'sonnet',portrait:'backend',hex:{q:2,r:2},description:'Desenvolve APIs e serviços em Node.js / TypeScript com validação, testes e observabilidade.',prompt:'Você é um desenvolvedor Node.js / TypeScript sênior. Implemente a feature atribuída com código tipado, validado e testado, seguindo a estrutura existente do projeto. Relate os arquivos e os testes.'},
 react:{label:'Especialista React',short:'RCT',name:'ATOMIC',icon:'react',model:'sonnet',portrait:'frontend',hex:{q:3,r:1},description:'Constrói interfaces em React com componentes acessíveis, estado previsível e testes de UI.',prompt:'Você é um especialista React sênior. Construa componentes acessíveis e bem estruturados, com estado previsível, seguindo o design system. Cubra os estados de carregamento, vazio e erro e relate os arquivos e os testes.'},
 angular:{label:'Especialista Angular',short:'NG',name:'AEGIS',icon:'angular',model:'sonnet',portrait:'frontend',hex:{q:-1,r:4},description:'Constrói aplicações Angular com módulos, serviços, formulários reativos e testes.',prompt:'Você é um especialista Angular sênior. Construa a feature com componentes, serviços e formulários reativos seguindo as boas práticas do Angular. Cubra os estados e a acessibilidade e relate os arquivos e os testes.'},
 custom:{label:'Especialista personalizado',short:'ESP',name:'NOVA',icon:'sparkle',model:'sonnet',portrait:'backend',hex:{q:1,r:2},description:'Especialista de engenharia com foco próprio. Defina o título e as instruções no estúdio.',prompt:'Você é um especialista de engenharia de software neste time. Siga o papel, o escopo e as entregas descritos nas suas instruções e no briefing do projeto. Inspecione o repositório antes de alterá-lo, deixe as premissas explícitas e entregue resultados concisos e verificáveis.'}
});
// Specialties removed when the squad was narrowed to software development; old data is migrated.
const LEGACY_ROLES={writer:['docs','Redator / Copywriter'],analyst:['data','Analista de Dados'],researcher:['custom','Pesquisador'],marketing:['custom','Marketing & Growth'],support:['custom','Suporte / Sucesso do Cliente'],legal:['custom','Jurídico / Compliance'],finance:['custom','Finanças']};
const LEGACY_SCOPES={writer:'docs',analyst:'data'};
const ROLE_GROUPS=[['Liderança',['commander','pm']],['Produto & Design',['po','designer']],['Engenharia',['architect','backend','frontend','mobile','qa','dba','dotnet','java','node','react','angular']],['Plataforma & Segurança',['devops','security','data']],['Documentação',['docs']],['Outra',['custom']]];
const roleOf=a=>ROLES[a?.role]||ROLES.custom;
const roleLabel=a=>a?.specialty||roleOf(a).label;
const roleShort=a=>a?.specialty?(a.specialty.normalize('NFD').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase()||roleOf(a).short):roleOf(a).short;
// Default portraits of PO / ARC / BE / FE / QA now come from the avatar gallery (the old role photos were removed).
const ROLE_DEFAULT_PORTRAIT={po:'avatar-delta',architect:'avatar-bishop',backend:'avatar-recharger',frontend:'avatar-katana',qa:'avatar-spectral'};
// Identity photo of every template agent (catalog codename -> PORTRAITS key). All 48 sources in assets/ are used; the 12 shared
// ones pair agents of distant categories (never inside a category, nor with a commander, reconhecedor or generalist).
const TEMPLATE_AVATARS={
 VANGUARD:'avatar-motherwolf','ABELHA-RAINHA':'avatar-red-misty',PROFETA:'avatar-predator',ZERO:'avatar-trautman',
 ATLAS:'avatar-nomad',BLUEPRINT:'avatar-revisor',PROPHET:'avatar-bishop',ECHO:'avatar-delta',SCOUT:'avatar-crafter',COMPASS:'avatar-zero',
 FORGE:'avatar-recharger','NODE RUNNER':'avatar-dragon',ESPRESSO:'avatar-hobbs',SHARPSHOOTER:'avatar-sharker',VIPER:'avatar-shafter',RAPTOR:'avatar-beast',PHANTOM:'avatar-specter',VOLT:'avatar-linker',BLAZE:'avatar-redliner',
 PIXEL:'avatar-katana',VANILLA:'avatar-lady-red',ATOMIC:'avatar-phasma',AEGIS:'avatar-havan',VERTEX:'avatar-messenger',NEXUS:'avatar-alpha-ghost',
 VAULT:'avatar-05adbe1b-e4a8-4d12-872c-c7774c9bcc14',TUSK:'avatar-phoenix',MARLIN:'avatar-linker',MONGOOSE:'avatar-nuts',REDLINE:'avatar-raiser',
 DEPLOYER:'avatar-deployer',KRAKEN:'avatar-shocker',STRATUS:'avatar-greyman',CERULEAN:'avatar-mistral',BEDROCK:'avatar-stone',PIPELINE:'avatar-specter',
 SENTINEL:'avatar-spectral',SNIPER:'avatar-zero',SCALPEL:'avatar-blader',TEMPO:'avatar-sandman',BEACON:'avatar-beast',
 VALETE:'avatar-valete',HUMMINGBIRD:'avatar-ccb3cc06-ebad-4210-861a-776979806acb',RIPTIDE:'avatar-sharker',SWIFTWING:'avatar-mark-one',KESTREL:'avatar-lady-red',
 'MOTHER WOLF':'avatar-witch',INFILTRATOR:'avatar-greyman',WARDEN:'avatar-phoenix',KEYMASTER:'avatar-mother-protocol',
 FEATHER:'avatar-butterfly',QUILL:'avatar-messenger',PEBBLE:'avatar-stone',KEEL:'avatar-hobbs',GATEKEEPER:'avatar-havan',SURGE:'avatar-shocker',ORBIT:'avatar-mistral',
 LEDGER:'avatar-crafter',KEYSTONE:'avatar-trautman',SKYLINE:'avatar-mark-one',BASTION:'avatar-blader',
 DATABIRD:'avatar-databird',CONDUIT:'avatar-alpha-ghost',TORRENT:'avatar-queen-bee',INSIGHT:'avatar-dragon',
 PRISM:'avatar-butterfly',CANVAS:'avatar-queen-bee',MOSAIC:'avatar-shafter',SCRIBE:'commander',LEXICON:'avatar-codemaker',GUIDE:'avatar-nomade'
};
// Earlier preset photos: agents still showing one of them follow the current identity photo.
const TEMPLATE_AVATARS_V1={ZERO:['avatar-greyman'],'ABELHA-RAINHA':['avatar-mother-protocol','avatar-queen-bee'],VAULT:['avatar-databird'],ECHO:['avatar-phasma'],ATOMIC:['avatar-delta']};
/* Plugins (docs/plans/plugins-conteudo.md): the bridge injects #squad-plugins with presets, categories, souls, avatars, themes, DIRETRIZES and
   runtime defaults from folders outside the repository. Everything here is a function declaration that touches no const of app.js:
   city.js (same script, earlier) calls squadThemeBoot() while building its scene, before app.js runs. Without the tag (demo, file://)
   nothing changes. Plugin text is escaped (E) wherever it is rendered, like the built-in catalog. */
// Limits and ids shared with plugins.js (docs/plans/plugins-conteudo.md, "Limites efetivos"): text over a limit refuses the item with a
// warning, never cut. They follow what normalizeWorkspace keeps of an agent (specialty 40, description 1200, soul 1200, 8 greetings
// of 300, prompt 20000, tools of TOOLS, a subset's content 8000), so nothing a plugin gives is lost on reload. `tools` is TOOLS itself.
function pluginLimits(){return pluginLimits.v||(pluginLimits.v={key:/^[a-z0-9][a-z0-9_-]{0,40}$/,convId:/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/,name:/^[A-Z0-9][A-Z0-9-]{1,23}$/,tools:['Read','Glob','Grep','Edit','Write','Bash','WebFetch','WebSearch','NotebookEdit'],cssVar:/^--[a-z0-9-]{1,40}$/,reserved:['__proto__','constructor','prototype'],
 plugin:{name:80,version:40,description:1000,path:4096},category:{label:60,icon:40,description:500,before:41},avatar:{label:60},theme:{label:60,vars:200},
 preset:{slot:20,category:41,role:40,specialty:40,icon:40,model:80,effort:10,avatar:81,description:1000,style:16000,soul:1200,hello:300,hellos:8,template:80,subsets:20},
 conv:{name:60,label:60,icon:40,group:81,tags:300,desc:300,summary:300,content:20000,subset:8000}});}
function readPlugins(){
 if(readPlugins.v)return readPlugins.v;
 let raw=null;try{const el=document.getElementById('squad-plugins');raw=el?JSON.parse(el.textContent):null;}catch{raw=null;}
 const L=pluginLimits(),warns=[],warn=m=>{warns.push(m);try{console.warn('[SQUAD/CODE plugins] '+m);}catch{}};
 const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),arr=v=>Array.isArray(v)?v:[];
 // Text field: '' when absent, the trimmed text when within max; over max (or not text) throws, so the item is refused.
 const T=(v,max,what)=>{if(v===undefined||v===null||v==='')return'';if(typeof v!=='string')throw Error(`${what}: esperado texto`);if(v.length>max)throw Error(`${what} maior que ${max} caracteres`);return v.trim();};
 const IMG=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,colors=(o,keys)=>{const out={};if(obj(o))for(const k of keys){const c=pluginColor(o[k]);if(c!==null)out[k]=c;}return out;};
 const COLOR=/^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}(\.\d+)?%?\s*,\s*\d{1,3}(\.\d+)?%?\s*,\s*\d{1,3}(\.\d+)?%?\s*(,\s*(0|1|0?\.\d+|1\.0+|\d{1,3}%)\s*)?\))$/i;
 const out={present:!!raw,plugins:[],runtime:obj(raw?.runtime)?raw.runtime:{},warnings:arr(raw?.warnings).filter(w=>typeof w==='string').map(w=>w.slice(0,600)).slice(0,200),appWarnings:warns};
 const each=(list,where,fn)=>{const r=[];for(const x of list){try{if(!obj(x))throw Error('esperado um objeto');r.push(fn(x));}catch(e){warn(`${where} ignorado: ${e.message}.`);}}return r;};
 for(const p of arr(raw?.plugins).slice(0,20)){
  if(!obj(p)||typeof p.id!=='string'||!/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.id)||out.plugins.some(x=>x.id===p.id))continue;
  // Like the bridge: an invalid name/version/description keeps the plugin under its id, with a warning.
  const pk={id:p.id,name:p.id,version:'',description:'',path:''};
  try{Object.assign(pk,{name:T(p.name,L.plugin.name,'nome')||p.id,version:T(p.version,L.plugin.version,'versão'),description:T(p.description,L.plugin.description,'descrição')});}catch(e){warn(`Plugin ${p.id}: ${e.message}.`);}
  try{pk.path=T(p.path,L.plugin.path,'caminho');}catch{pk.path='';}
  const W=`Plugin ${pk.name}`;
  pk.categories=each(arr(p.categories).slice(0,30),`${W}: categoria`,c=>{const key=T(c.key,41,'key');if(!L.key.test(key))throw Error(`key inválida (${key})`);const before=T(c.before,L.category.before,'before');if(before&&!L.key.test(before))throw Error('"before" inválido');
   return{key,label:T(c.label,L.category.label,'label'),icon:T(c.icon,L.category.icon,'ícone'),description:T(c.description,L.category.description,'descrição'),before};});
  pk.declared=arr(p.presets).length; // for Plugins: agents refused here count as ignored
  pk.presets=each(arr(p.presets).slice(0,200),`${W}: agente`,x=>{const P=L.preset,name=T(x.name,24,'nome');
   const tools=Array.isArray(x.tools)?x.tools:null;if(tools&&!tools.every((t,i)=>L.tools.includes(t)&&tools.indexOf(t)===i))throw Error(`${name}: tools aceita só ${L.tools.join(', ')}, sem repetir`);
   const hellos=arr(x.hellos);if(hellos.length>P.hellos)throw Error(`${name}: até ${P.hellos} saudações`);
   const conv=obj(x.conv)?{template:T(x.conv.template,P.template,'conventions.template'),subsets:arr(x.conv.subsets)}:null;
   if(conv&&(conv.subsets.length>P.subsets||!conv.subsets.every(s=>typeof s==='string'&&L.convId.test(s))))throw Error(`${name}: conventions.subsets deve ter até ${P.subsets} ids`);
   return{slot:T(x.slot,P.slot,'slot'),category:T(x.category,P.category,'category'),name,role:T(x.role,P.role,'role'),specialty:T(x.specialty,P.specialty,`${name}: specialty`),icon:T(x.icon,P.icon,'icon'),model:T(x.model,P.model,'model'),effort:T(x.effort,P.effort,'effort'),
    tools:tools?[...tools]:null,avatar:T(x.avatar,P.avatar,'avatar'),description:T(x.description,P.description,`${name}: description`),style:T(x.style,P.style,`${name}: corpo (style)`),soul:T(x.soul,P.soul,`${name}: soul`),
    hellos:hellos.map(h=>T(h,P.hello,`${name}: saudação`)).filter(Boolean),conv,plugin:p.id};});
  pk.avatars=each(arr(p.avatars).slice(0,200),`${W}: avatar`,a=>{if(typeof a.key!=='string'||!a.key.startsWith('plugin:'+p.id+'/')||!L.key.test(a.key.slice(p.id.length+6)))throw Error('key inválida');if(typeof a.src!=='string'||!IMG.test(a.src))throw Error(`${a.key}: imagem inválida`);
   return{key:a.key,label:T(a.label,L.avatar.label,'label')||a.key.slice(a.key.lastIndexOf('/')+1).toUpperCase(),src:a.src};});
  pk.themes=each(arr(p.themes).slice(0,20),`${W}: tema`,t=>{if(typeof t.key!=='string'||!t.key.startsWith(p.id+'/')||!L.key.test(t.key.slice(p.id.length+1)))throw Error('key inválida');
   const ui={};if(obj(t.ui))for(const [k,v] of Object.entries(t.ui).slice(0,L.theme.vars))if(L.cssVar.test(k)&&typeof v==='string'&&COLOR.test(v.trim()))ui[k]=v.trim();else warn(`${W}: tema ${t.key}: variável ${String(k).slice(0,50)} ignorada (nome ou cor inválidos).`);
   const city=colors(t.city,['bg','build','tree','water','wall']),ex=t.city?.exposure;if(typeof ex==='number'&&ex>=.5&&ex<=2)city.exposure=ex;
   return{key:t.key,label:T(t.label,L.theme.label,'label')||t.key,ui,city,office:colors(t.office,['bg','tile','rim','build','cyan','purple','plaza','green','amber']),agent:colors(t.agent,['blue']),run:colors(t.run,['work','plan','wait','call','baton','done'])};});
  pk.conventions=obj(p.conventions)?{families:obj(p.conventions.families)?p.conventions.families:{},subsets:arr(p.conventions.subsets),groups:arr(p.conventions.groups)}:null;
  pk.runtime=obj(p.runtime)?p.runtime:{};
  out.plugins.push(pk);
 }
 readPlugins.v=out;return out;
}
// Theme colors: 0xRRGGBB numbers or '#rgb' / '#rrggbb' strings, always handed to city.js as numbers (it uses Color.setHex).
function pluginColor(v){
 if(typeof v==='number')return Number.isInteger(v)&&v>=0&&v<=0xffffff?v:null;
 if(typeof v!=='string')return null;const s=v.trim();
 if(/^#[0-9a-f]{6}$/i.test(s))return parseInt(s.slice(1),16);
 if(/^#[0-9a-f]{3}$/i.test(s))return parseInt(s.slice(1).split('').map(c=>c+c).join(''),16);
 if(/^0x[0-9a-f]{6}$/i.test(s))return parseInt(s.slice(2),16);
 return null;
}
function pluginWarn(msg){readPlugins().appWarnings.push(msg);try{console.warn('[SQUAD/CODE plugins] '+msg);}catch{}}
function pluginThemes(){return readPlugins().plugins.flatMap(p=>p.themes);}
// The boot copies of #squad-disk and of the browser copy are read once (the boot block takes them from here) so the theme can be
// known before city.js builds its scene. The literal must stay equal to STORE.
function bootDiskTag(){if(!('v' in bootDiskTag)){let t=null;try{const el=document.getElementById('squad-disk');t=el?JSON.parse(el.textContent):null;}catch{t=null;}bootDiskTag.v=t;}return bootDiskTag.v;}
function bootLocal(){
 if(bootLocal.v)return bootLocal.v;const key='squad-code.network.v2';let saved=null,meta=null,local=null,failed=false;
 try{saved=localStorage.getItem(key);meta=JSON.parse(localStorage.getItem(key+'.disk')||'null');}catch{failed=true;}if(saved)try{local=JSON.parse(saved);}catch{local=null;}
 return bootLocal.v={saved,meta,local,failed};
}
/* Which saved workspace the boot loads (database copy, browser copy or none), decided once and shared by the boot block and the
   theme (bootThemeKey), which city.js needs before app.js runs. The database copy wins unless this browser has pending saves on that
   same rev; when both changed, the one with the latest activity (wsActivity) wins and the other becomes a saved version. */
function bootChoice(){
 if(bootChoice.v)return bootChoice.v;
 const tag=bootDiskTag(),{saved,meta,local}=bootLocal(),disk=tag?.workspace&&typeof tag.workspace==='object'?tag.workspace:null;
 const c={tag,disk,saved,meta,local,raw:local,force:false,backup:null,notice:''};
 if(tag?.setup)c.raw=null;
 else if(tag){
  if(!disk||!local)c.raw=disk||local;
  else if(JSON.stringify(disk)===saved||meta&&!meta.pending)c.raw=disk;
  else if(!(meta?.pending&&meta.rev===String(tag.rev||''))){
   if(wsActivity(local)>wsActivity(disk)){c.force=true;c.notice='O workspace deste navegador era mais recente que o salvo no banco local e o substituiu. A versão anterior ficou em Versões salvas (Configurações > Workspace).';}
   else{c.raw=disk;c.backup=saved;c.notice='Este navegador tinha outra versão do workspace. Carreguei a salva no banco local; a do navegador ficou em Versões salvas (Configurações > Workspace).';}
  }
 }
 return bootChoice.v=c;
}
function bootThemeKey(){const t=bootChoice().raw?.settings?.theme;return typeof t==='string'?t.slice(0,100):'';}
// Applies a theme (null = the default look): CSS variables on :root and window.SQUAD_THEME for city.js. Returns what city.js reads.
function applyTheme(t){
 const root=document.documentElement;for(const k of applyTheme.vars||[])root.style.removeProperty(k);applyTheme.vars=[];
 if(t)for(const [k,v] of Object.entries(t.ui)){root.style.setProperty(k,v);applyTheme.vars.push(k);}
 root.dataset.squadTheme=t?t.key:'';
 window.SQUAD_THEME=t?{key:t.key,city:{...t.city},office:{...t.office},agent:{...t.agent},run:{...t.run}}:null;
 return window.SQUAD_THEME;
}
// Called by city.js while it builds the scene (and again by the boot, harmlessly): theme from the saved workspace; an unknown key
// falls back to the default look without touching the saved value.
function squadThemeBoot(){
 if('v' in squadThemeBoot)return squadThemeBoot.v;
 const key=bootThemeKey(),t=key?pluginThemes().find(x=>x.key===key)||null:null;
 squadThemeBoot.key=key;squadThemeBoot.v=applyTheme(t);return squadThemeBoot.v;
}
// Names that belong to the built-in catalog (template photos, souls, each specialty's default agent), taken before any plugin merge.
function builtinPresetNames(){if(!builtinPresetNames.v)builtinPresetNames.v=new Set([...Object.keys(TEMPLATE_AVATARS),...Object.keys(AGENT_SOULS),...Object.values(ROLES).map(r=>r.name)]);return builtinPresetNames.v;}
/* Accepted plugin presets (validated once): a valid unique codename, a role of ROLES, a slot whose seat fits the role, instructions within
   20000. The bridge sends every candidate (repeated names too): a name is taken only by a preset that passed every check, so a later
   plugin's usable preset with the same name still enters. */
function pluginPresets(){
 if(pluginPresets.v)return pluginPresets.v;const list=[],names=new Set(builtinPresetNames()),SLOT_ROLE={commander:'commander',adr:'architect',prd:'po'};
 for(const pk of readPlugins().plugins)for(const p of pk.presets){
  const where=`Plugin ${pk.name}: agente ${p.name||'(sem nome)'}`;
  if(!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(p.name)){pluginWarn(`${where} ignorado: nome inválido (use letras maiúsculas, números e hífen).`);continue;}
  if(names.has(p.name)){pluginWarn(`${where} ignorado: já existe um agente do catálogo ou de outro plugin com esse nome.`);continue;}
  if(!Object.hasOwn(ROLES,p.role)){pluginWarn(`${where} ignorado: especialidade (role) "${p.role}" desconhecida.`);continue;}
  if(!['commander','adr','prd','operator'].includes(p.slot)){pluginWarn(`${where} ignorado: posição (slot) "${p.slot}" inválida.`);continue;}
  if(SLOT_ROLE[p.slot]&&SLOT_ROLE[p.slot]!==p.role){pluginWarn(`${where} ignorado: a posição ${p.slot} pede o role ${SLOT_ROLE[p.slot]}.`);continue;}
  if(p.slot==='operator'&&p.role==='commander'){pluginWarn(`${where} ignorado: um comandante não pode ser operador.`);continue;}
  if(presetPrompt(p).length>20000){pluginWarn(`${where} ignorado: instruções (especialidade + corpo) maiores que 20000 caracteres.`);continue;}
  names.add(p.name);list.push(p);
 }
 return pluginPresets.v=list;
}
// Souls, photos and DIRETRIZES of the plugins: merged before the seed/normalize (they are read at load). Never overwrites built-ins.
function mergePluginCatalog(){
 const P=readPlugins();if(!P.plugins.length)return;
 for(const pk of P.plugins)for(const a of pk.avatars){if(Object.hasOwn(PORTRAITS,a.key))continue;PORTRAITS[a.key]=a.src;AVATARS.push({key:a.key,label:a.label});}
 for(const p of pluginPresets()){
  if(p.soul)AGENT_SOULS[p.name]={soul:p.soul,hellos:p.hellos.length?[...p.hellos]:genericHellos(p.role,p.specialty)};
  if(p.avatar){const k=['plugin:'+p.plugin+'/'+p.avatar,'avatar-'+p.avatar,p.avatar].find(x=>Object.hasOwn(PORTRAITS,x));if(k)TEMPLATE_AVATARS[p.name]=k;else pluginWarn(`Agente ${p.name}: avatar "${p.avatar}" não encontrado; usa a foto da especialidade.`);}
 }
 // DIRETRIZES: ids as in plugins.js (convId, never a reserved name), own families only (Object.hasOwn: a plugin naming "constructor"
 // must not reach Object's prototype), text within the shared limits or the item is refused; existing ids are never overwritten.
 const L=pluginLimits(),C=L.conv,id=k=>typeof k==='string'&&L.convId.test(k)&&!L.reserved.includes(k);
 const text=(v,max,what)=>{if(v===undefined||v===null||v==='')return'';if(typeof v!=='string')throw Error(`${what}: esperado texto`);if(v.length>max)throw Error(`${what} maior que ${max} caracteres`);return v.trim();};
 const item=(where,fn)=>{try{fn();}catch(e){pluginWarn(`${where} ignorado: ${e.message}.`);}};
 for(const pk of P.plugins){
  const c=pk.conventions;if(!c)continue;const tag=`Plugin ${pk.name}, diretrizes`;
  for(const g of c.groups)item(`${tag}: grupo`,()=>{if(!g||!id(g.key))throw Error('key inválida');if(CONVENTION_GROUPS.some(x=>x.key===g.key))throw Error(`"${g.key}" já existe; mantido o original`);
   const label=text(g.label,C.label,'label'),icon=text(g.icon,C.icon,'icon');CONVENTION_GROUPS.push({key:g.key,label:label||g.key,icon:icon||'book'});});
  for(const s of c.subsets)item(`${tag}: subset ${String(s?.key||'').slice(0,80)}`,()=>{if(!s||!id(s.key)||typeof s.content!=='string')throw Error('sem key válida ou conteúdo');if(CONVENTION_SUBSETS.some(x=>x.key===s.key))throw Error('já existe; mantido o original');
   const v={key:s.key,name:text(s.name,C.name,'name')||s.key,group:text(s.group,C.group,'group'),icon:text(s.icon,C.icon,'icon')||'book',tags:text(s.tags,C.tags,'tags'),desc:text(s.desc,C.desc,'desc'),content:text(s.content,C.subset,'content')};CONVENTION_SUBSETS.push(v);});
  for(const [family,f] of Object.entries(c.families)){
   if(!Object.hasOwn(CONVENTION_FAMILIES,family)||L.reserved.includes(family)){pluginWarn(`${tag}: família "${family.slice(0,80)}" desconhecida; templates ignorados.`);continue;}
   const fam=CONVENTION_FAMILIES[family];
   for(const t of Array.isArray(f?.templates)?f.templates:[])item(`${tag}: template ${String(t?.key||'').slice(0,80)} (${family})`,()=>{if(!t||!id(t.key)||typeof t.content!=='string')throw Error('sem key válida ou conteúdo');
    if(Object.values(CONVENTION_FAMILIES).some(x=>x.templates.some(y=>y.key===t.key)))throw Error('já existe; mantido o original');
    fam.templates.push({key:t.key,name:text(t.name,C.name,'name')||t.key,summary:text(t.summary,C.summary,'summary'),content:text(t.content,C.content,'content')});});
  }
 }
}
mergePluginCatalog();
const templateAvatarKey=a=>{const n=retiredPresetName(a?.name)||a?.name;return TEMPLATE_AVATARS[a?.template]?a.template:TEMPLATE_AVATARS[n]?n:'';};
const templatePortrait=a=>PORTRAITS[TEMPLATE_AVATARS[templateAvatarKey(a)]]||'';
// Agents created from scratch take the photo of their specialty's default agent (FORGE, PRISM, MOTHER WOLF…).
const rolePortrait=role=>{const k=ROLES[role]?.portrait;return PORTRAITS[TEMPLATE_AVATARS[ROLES[role]?.name]]||PORTRAITS[ROLE_DEFAULT_PORTRAIT[k]||k]||PORTRAITS[ROLE_DEFAULT_PORTRAIT[role]]||PORTRAITS[role]||PORTRAITS[ROLE_DEFAULT_PORTRAIT.backend];};
const roleOptions=selected=>ROLE_GROUPS.map(([group,keys])=>`<optgroup label="${group}">${keys.map(key=>`<option value="${key}" ${selected===key?'selected':''}>${ROLES[key].label}</option>`).join('')}</optgroup>`).join('');
const CODENAME_RE=/^[\p{L}\p{N}][\p{L}\p{N} -]{1,31}$/u;
// Random codename pool for the studio's dice button (tactical callsigns).
const CODENAMES=['NOMAD','WRAITH','SPECTRE','BANSHEE','HAVOC','JACKAL','REAPER','VIPER','RAVEN','COBRA','WARDEN','PHANTOM','SHADE','TALON','ONYX','BISHOP','ROOK','MAVERICK','OUTLAW','RAMPART','BULWARK','VANDAL','SCALPEL','NEEDLE','SPARROW','HORNET','MANTIS','SCORPION','KODIAK','GRIZZLY','WOLFHOUND','BLOODHOUND','COYOTE','HYENA','LYNX','OCELOT','JAGUAR','CONDOR','KESTREL','HARRIER','OSPREY','VULTURE','MAGPIE','IRONCLAD','STEEL RAIN','DEAD EYE','GHOST SIX','ECHO ONE','BRAVO SIX','ZULU','FOXTROT','WHISKEY','OVERWATCH','PATHFINDER','LONGSHOT','CROSSHAIR','TRIGGER','BLACKOUT','BLACKJACK','DEADBOLT','LOCKDOWN','FALLOUT','AFTERSHOCK','TREMOR','RIPTIDE','UNDERTOW','MONSOON','TYPHOON','AVALANCHE','WILDFIRE','EMBER','CINDER','SULFUR','COBALT','TITANIUM','CHROME','MERCURY','CARBON','NITRO','UMBRA','CIPHER','RELIC','MIDNIGHT','LAZARUS','GRAVEDIGGER','NIGHTSHADE','HEMLOCK','BELLADONNA','WOLFSBANE','CERBERUS','HYDRA','GORGON','CHIMERA','BASILISK','KRAKEN','LEVIATHAN','GOLIATH','HALBERD','CLAYMORE','BEOWULF','ARCHANGEL','BLACKTHORN','BONESAW','BRIMSTONE','BUCKSHOT','BULLDOG','CALIBER','CARNAGE','CATACOMB','CHARON','COLDSTEEL','CORVUS','CROSSBOW','CUTLASS','DAGGER','DAMOCLES','DARKWATER','DEADFALL','DEADLOCK','DEMOLITION','DERVISH','DRAGOON','DRIFTER','DUSKWALKER','EXCALIBUR','EXODUS','FENRIR','FIRESTORM','FLATLINE','FROSTBITE','GALLOWS','GARGOYLE','GAUNTLET','GHOUL','GLADIUS','GRAVEL','GREYHOUND','GRIM','GUNSMOKE','HAILSTORM','HANGMAN','HARBINGER','HATCHET','HEADHUNTER','HELLHOUND','HIGHLANDER','HOLLOWPOINT','HURRICANE','ICEBREAKER','INFERNO','IRONSIDE','JAVELIN','JUGGERNAUT','KATANA','KEVLAR','KILLSWITCH','LANCER','LANDSLIDE','LOCKJAW','LONE WOLF','MACHETE','MAELSTROM','MARAUDER','MERCENARY','MIRAGE','MONGOOSE','MORTAR','MUSTANG','NEMESIS','NIGHTHAWK','NIGHTFALL','NIGHTWATCH','OBSIDIAN','OMEN','ORDNANCE','PALADIN','PANTHER','PARAGON','PHALANX','PIRANHA','PREDATOR','PROWLER','PYTHON','QUARRY','RAGNAROK','RAIDER','RAMROD','RANGER','RAPTOR','RATTLESNAKE','RAZORBACK','RECLUSE','REDLINE','REVENANT','RHINO','RICOCHET','ROGUE','ROUGHNECK','SABRE','SALVO','SAMURAI','SANDSTORM','SAVAGE','SCARECROW','SCAVENGER','SCIMITAR','SCORCH','SERPENT','SHRAPNEL','SHRIKE','SIDEWINDER','SILENCER','SKYFALL','SLEDGEHAMMER','SLINGSHOT','SNAKEBITE','SPARTAN','SPIKE','STALKER','STARLING','STILETTO','STINGRAY','STONEWALL','STORMBREAKER','STRYKER','SUNDOWN','TARANTULA','TEMPEST','THRESHER','THUNDERBOLT','TOMAHAWK','TORNADO','TOXIN','TRAPPER','TRIDENT','TUNGSTEN','UNDERTAKER','URCHIN','VALKYRIE','VENDETTA','VENOM','VERDICT','VORTEX','WARHOUND','WARLOCK','WARPATH','WARTHOG','WIDOWMAKER','WILDCAT','WINTERHAWK','WOLVERINE','WRECKER','YETI','ZEPHYR','ALPHA ONE','DELTA NINE','SIERRA TWO','TANGO DOWN','NOVEMBER','OSCAR MIKE','HOTEL ZERO','KILO SEVEN','VICTOR','YANKEE','ROMEO FIVE','LIMA','GOLF','INDIA','JULIET','QUEBEC','UNIFORM','X-RAY','CHARLIE','MIKE ONE','RED FOX','BLACK MAMBA','IRON WOLF','STEEL VIPER','SILENT OWL','DUST DEVIL','BLUE JAY','GREY WARDEN','NIGHT OWL','IRON MAIDEN','BLACK WIDOW','DARK HORSE','COLD FRONT','ZERO HOUR','LAST CALL','HIGH NOON','BLOOD MOON','DEEP SIX','WILD CARD','RED DAWN','ABYSS','ADDER','AEGIS','AFTERBURNER','ALBATROSS','ALCHEMIST','AMBUSH','ANACONDA','APACHE','APEX','ARBITER','ARGUS','ARSENAL','ASSASSIN','AXEMAN','BADGER','BALLISTA','BARRACUDA','BARRAGE','BASTION','BATTERING RAM','BAYONET','BEARCAT','BERSERKER','BLACKBIRD','BLACKFIN','BLACKHAWK','BLACKSMITH','BLADE','BLINDSIDE','BLOODLINE','BLOWTORCH','BOLTCUTTER','BOOMSLANG','BOUNTY','BRAWLER','BREACHER','BRONCO','BUCCANEER','BUSHMASTER','BUZZARD','CANNONBALL','CARACAL','CASTLE','CATAPULT','CENTURION','CHAINSAW','CHEETAH','CHUPACABRA','CLAWHAMMER','CLOCKWORK','COLDSNAP','COMANCHE','COMMANDO','CONVICT','COPPERHEAD','CORSAIR','COUGAR','CROWBAR','CRUSADER','CYCLONE','DARKSTAR','DEADMAN','DEADSHOT','DEATHSTALKER','DESPERADO','DETONATOR','DIAMONDBACK','DOBERMAN','DOOMSDAY','DRAGONFLY','DREADNOUGHT','DUSTOFF','EAGLE EYE','EARTHQUAKE','EIGHTBALL','ENFORCER','EXECUTIONER','FALCHION','FANG','FERAL','FIREFLY','FIREWALL','FLAK','FLASHBANG','FORTRESS','FREIGHT','FROGMAN','FUGITIVE','FURY','GARROTE','GATEKEEPER','GEIST','GENERAL','GHILLIE','GLACIER','GRAPPLE','GREMLIN','GRENADIER','GRIFFIN','GUARDIAN','GUNNER','GUNSLINGER','HACKSAW','HAMMERHEAD','HARPOON','HAWKEYE','HEATWAVE','HELLFIRE','HIGHWAYMAN','HONEY BADGER','HOODOO','HOWITZER','HUNTSMAN','ICEMAN','IMPALER','INQUISITOR','INTERCEPTOR','IRONHIDE','JACKHAMMER','JESTER','KAMIKAZE','KINGPIN','KINGSNAKE','KNUCKLES','KOMODO','LANDMINE','LANTERN','LASSO','LOCUST','LONGBOW','LOOKOUT','LUMBERJACK','MAGNUM','MAMBA','MANHUNTER','MARKSMAN','MARSHAL','MASTIFF','MATADOR','MEDUSA','MINOTAUR','MOCCASIN','MOHAWK','MOJAVE','MONARCH','MOONSHINE','MORNINGSTAR','MUMMY','NAPALM','NIGHTCRAWLER','NINJA','OUTRIDER','PANZER','PARIAH','PELICAN','PEREGRINE','PHOENIX','PIKE','PILGRIM','PITBULL','PLAGUE','POLTERGEIST','POSSUM','PROWL','PUNISHER','QUICKSILVER','RAMPAGE','RATCHET','RAZOR','REBEL','RECON','REDBACK','REDCAP','RENEGADE','RIFLEMAN','RIOT','ROADKILL','ROCKSLIDE','RONIN','ROTTWEILER','RUSTBUCKET','SAWBLADE','SCOUT','SEAWOLF','SHADOWFAX','SHARPSHOOTER','SHERIFF','SHOTGUN','SIEGE','SKINWALKER','SKULLCAP','SLATE','SLEEPER','SMOKEJUMPER','SNAPDRAGON','SNIPER','SOLDIER','SPARTACUS','SPECTER','SPITFIRE','SPOOK','STAMPEDE','STARFIRE','STEELHEART','STINGER','STORMCROW','STRIKER','SUNDANCE','SWAMP FOX','SWORDFISH','TACTICIAN','TARGE','TASKMASTER','TEMPLAR','TERMINUS','THUNDER','TIGERSHARK','TIMBERWOLF','TOMBSTONE','TORPEDO','TRACKER','TRAILBLAZER','TROJAN','TUNDRA','TURBINE','TUSKER','UNDERDOG','URSA','VAGABOND','VALOR','VIGILANTE','VOLCANO','VOODOO','WARBIRD','WARCRY','WARLORD','WATCHDOG','WEASEL','WHIPLASH','WHIRLWIND','WILDEBEEST','WINDMILL','WINGMAN','WOLFPACK','WOODPECKER','WYVERN','YELLOWJACKET','ZEALOT','ZEBRA','ZENITH','ZODIAC','ZOMBIE','ALPHA SIX','BRAVO TWO','CHARLIE NINE','DELTA ONE','ECHO FOUR','FOXTROT SIX','GOLF THREE','HOTEL NINE','INDIA TWO','JULIET SEVEN','KILO ONE','LIMA SIX','MIKE FOUR','NOVEMBER TEN','OSCAR ONE','PAPA BEAR','QUEBEC FIVE','ROMEO ONE','SIERRA SIX','TANGO SEVEN','UNIFORM TWO','VICTOR NINE','WHISKEY SIX','XRAY ONE','YANKEE FOUR','ZULU NINE','BLACK SITE','BLACK OPS','BLACK SHEEP','BLUE STEEL','BLUE THUNDER','BONE CRUSHER','BROKEN ARROW','CAPTAIN HOOK','CODE RED','COLD CASE','CRIMSON TIDE','DARK MATTER','DARK STAR','DEAD MANS HAND','DESERT FOX','DESERT HAWK','DEVIL DOG','DIRE WOLF','DRY ICE','FAST LANE','FINAL HOUR','FIRE ANT','GHOST RIDER','GOLDEN EYE','GRAVE ROBBER','GREEN BERET','GREY GHOST','HARD TARGET','HELL DIVER','HIGH JUMP','HOT SHOT','IRON CURTAIN','IRON FIST','IRON HORSE','IRON SIGHT','JUNKYARD DOG','KILL ZONE','KING COBRA','LAST STAND','LEAD FOOT','LONE STAR','MAD DOG','MOON DOG','NIGHT RIDER','NIGHT SHIFT','NO MERCY','OLD GUARD','PALE HORSE','POINT BLANK','RED ALERT','RED BARON','RED LION','ROAD WARRIOR','SAND VIPER','SEA SNAKE','SHADOW BOXER','SILENT NIGHT','SILVER FOX','SNOW LEOPARD','SPEC OPS','STEEL CURTAIN','STONE COLD','STORM FRONT','SUDDEN DEATH','SWIFT WIND','TIN MAN','TOP DOG','URBAN LEGEND','WAR PIG','WHITE RABBIT','WHITE WOLF','WILD BUNCH','WILD HORSE','WINTER WOLF','WOLF MOTHER','YELLOW DOG','ZERO DARK'];
const codenameTaken=(name,exceptId)=>state.agents.some(x=>x.id!==exceptId&&x.name.toUpperCase()===name.toUpperCase());
// Agent map icons: 26 extra glyphs, same 24px stroke style as ICONS.
Object.assign(ICONS,{
 bug:'<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8v12M9 8a3 3 0 0 1 6 0M3 13h4m10 0h4M4 7l3 3m13-3-3 3M4 19l3-2m13 2-3-2"/>',
 rocket:'<path d="M12 2c3 2.5 4.5 6 4.5 10L14 17h-4l-2.5-5C7.5 8 9 4.5 12 2Z"/><circle cx="12" cy="9" r="1.6"/><path d="M8 13l-3 2 1 4 3-2m7-4 3 2-1 4-3-2m-5 1v4m2-4v5"/>',
 cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="7"/>',
 cloud:'<path d="M7 19h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 19Z"/>',
 branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-12 3-12 8"/>',
 key:'<circle cx="7.5" cy="14.5" r="4.5"/><path d="m11 11 9-9m-4 4 3 3m-5-1 2 2"/>',
 wrench:'<path d="M15 3a5 5 0 0 0-4.6 7L3.5 17a2 2 0 0 0 3 3l7-6.9A5 5 0 0 0 21 9l-3 3-3-1-1-3 3-3a5 5 0 0 0-2-2Z"/>',
 hammer:'<path d="m14 6 4 4M12 4l3-2 7 7-2 3-3-3-2 2-3-3 2-2ZM12 8 3 17a2 2 0 0 0 3 3l9-9"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 brain:'<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1Zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/><path d="M9 9h3m0 4H9m6-4h-3m0 4h3"/>',
 robot:'<rect x="5" y="8" width="14" height="11" rx="2"/><circle cx="9.5" cy="13" r="1.3"/><circle cx="14.5" cy="13" r="1.3"/><path d="M12 8V4m-1 0h2M9.5 16.5h5M2 12v3m20-3v3"/>',
 paw:'<ellipse cx="12" cy="16" rx="4.5" ry="3.8"/><circle cx="6" cy="10" r="1.8"/><circle cx="9.5" cy="6" r="1.8"/><circle cx="14.5" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/>',
 bird:'<path d="M21 7l-3 1a4 4 0 0 0-7 2v1C7 11 4.5 9 3 6c-1 5 1 9 6 11-1 1-3 2-5 2 8 3 15-1 15-9V9Z"/><path d="M15 9h.01"/>',
 anchor:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10h8M4 13c0 5 4 8 8 8s8-3 8-8M4 13h2m12 0h2"/>',
 star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
 flame:'<path d="M12 22c4 0 7-2.7 7-7 0-5-4-7-5-12-2 2-3 4-3 6-1-1-2-2-2-3-2 2-4 5-4 9 0 4.3 3 7 7 7Z"/><path d="M12 22c-2 0-3-1.5-3-3.5 0-2.5 3-4 3-6.5 1.5 2 3 3.5 3 6.5 0 2-1 3.5-3 3.5Z"/>',
 atom:'<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
 puzzle:'<path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4Z"/>',
 flask:'<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>',
 satellite:'<g transform="rotate(-45 11 13)"><rect x="9" y="10" width="4" height="6"/><rect x="2" y="11" width="5" height="4"/><rect x="15" y="11" width="5" height="4"/><path d="M7 13h2m4 0h2M11 16v3"/></g><path d="M16 3a5 5 0 0 1 5 5M16 6.5a1.5 1.5 0 0 1 1.5 1.5"/>',
 package:'<path d="M12 2 3 7v10l9 5 9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',
 braces:'<path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1m8-18h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>',
 chart:'<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
 chat:'<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 9h8m-8 3h5"/>',
 fingerprint:'<path d="M12 11v4c0 2 .5 4 1.5 6M8.5 13c0 3 .5 5.5 1.5 8M15.5 14c0 2-.2 3.5-.5 5M5.5 16c-.3-1.3-.5-2.7-.5-4a7 7 0 0 1 14 0v2M8.5 10a3.5 3.5 0 0 1 7 0v2"/>'
});
Object.assign(ICONS,{
 wheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M3 12h6.5m5 0H21m-9 2.5V21"/>',
 guard:'<g transform="translate(0 1.2)"><path d="M3 9.8 7.5 5.4 7 .5l2.9 3.2.9-3.5 1.1 2.3c1.2 1.4 3.1 2.4 4.9 3.1l.3 1.3 1.2 1.1c1.5.3 2.7.6 3.9.9.8.4.7 1.4.1 1.8l-1 .7h-2.7l1.5.9-.3.9h-5.4c-1 1.8-2.9 3.8-4 6.6Z"/><path d="M.6 11.5 8 21.4"/><circle cx="4.5" cy="14.1" r=".7"/><circle cx="7.1" cy="17.6" r=".7"/><path d="m14.3 7.5 1.5.6"/></g>',
 question:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5m0 3v.2"/>',
 heart:'<path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20Z"/>',
 js:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M11 11v5a2 2 0 0 1-3.6 1.2m10.1-5.2a2 2 0 0 0-1.9-1h-.3a1.7 1.7 0 0 0 0 3.5h.6a1.75 1.75 0 0 1 0 3.5h-.4a2 2 0 0 1-2-1.2"/>',
 node:'<path d="M12 2 20.7 7v10L12 22l-8.7-5V7Z"/><path d="M9 15.5v-7l6 7v-7"/>',
 java:'<path d="M4 10h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5h-1.8M3 22h16M7 2.5c-1 1.3 1 2.2 0 3.5m3.5-3.5c-1 1.3 1 2.2 0 3.5M14 2.5c-1 1.3 1 2.2 0 3.5"/>',
 html:'<path d="M4 2h16l-1.5 17L12 22l-6.5-3Z"/><path d="M15.5 6.5h-7l.4 5h6l-.5 5-2.4.8-2.4-.8-.1-1.8"/>',
 css:'<path d="M4 2h16l-1.5 17L12 22l-6.5-3Z"/><path d="M8.5 6.5h7l-1 10.3-2.5.9-2.5-.9-.2-1.8M9.5 11.5h5.6"/>',
 angular:'<path d="M12 2 21 5.2l-1.4 11.9L12 22l-7.6-4.9L3 5.2Z"/><path d="M8.5 16.5 12 7l3.5 9.5m-5.7-3.5h4.4"/>',
 react:'<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10.5" ry="3.4"/><ellipse cx="12" cy="12" rx="10.5" ry="3.4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10.5" ry="3.4" transform="rotate(120 12 12)"/>',
 vue:'<path d="M2 3.5 12 21 22 3.5M6.5 3.5 12 13l5.5-9.5M9.8 3.5 12 7.5l2.2-4M2 3.5h7.8m4.4 0H22"/>',
 csharp:'<path d="M12 2 20.7 7v10L12 22l-8.7-5V7Z"/><path d="M12.3 9.3a3.5 3.5 0 1 0 0 5.4M15 10.3v3.8m1.7-3.8v3.8m-2.4-2.9h3.1m-3.1 1.9h3.1"/>',
 typescript:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M6.5 11h5M9 11v7m8.5-6a2 2 0 0 0-1.9-1h-.3a1.7 1.7 0 0 0 0 3.5h.6a1.75 1.75 0 0 1 0 3.5h-.4a2 2 0 0 1-2-1.2"/>',
 rust:'<circle cx="12" cy="12" r="7.6"/><path d="M19.6 12.0L21.6 12.0M18.6 15.8L20.3 16.8M15.8 18.6L16.8 20.3M12.0 19.6L12.0 21.6M8.2 18.6L7.2 20.3M5.4 15.8L3.7 16.8M4.4 12.0L2.4 12.0M5.4 8.2L3.7 7.2M8.2 5.4L7.2 3.7M12.0 4.4L12.0 2.4M15.8 5.4L16.8 3.7M18.6 8.2L20.3 7.2"/><path d="M9.8 15.8V8.2h3a2.1 2.1 0 0 1 0 4.2h-3m2.8 0 2.2 3.4"/>',
 spring:'<path d="M19 4C11 4 5 7.5 5 14c0 1.5.4 2.9 1 4 2-4.5 6-7 10-8.5-4 2-7.5 5-9 9.5 1.4 1 3 1.5 4.8 1.5C18 20.5 20.5 13 19 4Z"/>',
 screwdriver:'<path d="M18.5 1.8 22.2 5.5 15.8 11.9 12.1 8.2Z"/><path d="m16.8 5.4 1.8 1.8m-4.3.7 1.8 1.8M14 10 5 19m-2.2-.6 2.8 2.8"/>',
 dice:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="2.6"/>',
 tower:'<path d="M5 9V3h3v2.5h2.5V3h3v2.5H16V3h3v6ZM6.5 9 6 21h12l-.5-12"/><path d="M10 21v-2.5a2 2 0 0 1 4 0V21M12 11.5v2"/>',
 king:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="m8.5 7.5-.5-3 2 1.3 2-2.3 2 2.3 2-1.3-.5 3ZM9.5 10v8.5m5.5-8.5-5.5 4.8m1.9-1.6L15 18.5"/>',
 queen:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="m9 7.5.4-2.7 1.5 1.1L12 4l1.1 1.9 1.5-1.1.4 2.7Z"/><ellipse cx="12" cy="14" rx="3" ry="4.2"/><path d="m13.2 16.4 2.3 2.8"/>',
 jack:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8.5 7.5h7m-6-.2c0-1.8 1.1-2.8 2.5-2.8s2.5 1 2.5 2.8m-.5-2.6 2-1.4M14 10v6a2.6 2.6 0 0 1-5.2.3"/>',
 'rotate-left':'<path d="M3 4v5h5"/><path d="M3.5 9A9 9 0 1 1 5 17"/>',
 'rotate-right':'<path d="M21 4v5h-5"/><path d="M20.5 9A9 9 0 1 0 19 17"/>',
 // Map side controls (data-icon in shell.html), minimal outlines: hex with a skyline (city), open isometric room (office), ringed
 // planet, magnifier zoom, framing corners around a dot (center), a flat tile on an orbit arrow, the frame with its side panels.
 'map-city':'<path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9Z"/><path d="M8 15.5v-3.5h2.4V8.5h3.2V11H16v4.5"/>',
 'map-office':'<path d="M4 16 12 20l8-4-8-4Z"/><path d="M4 16V8l8-4v8M20 16V8l-8-4"/>',
 'map-planet':'<circle cx="12" cy="12" r="5.5"/><path d="M6.8 10.2C4 11.3 2.6 12.6 3 13.6c.6 1.6 5.3 1.4 10.4-.5s8.7-4.4 8.1-6c-.3-.9-2-1.3-4.4-1"/>',
 'map-zoom-in':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5"/>',
 'map-zoom-out':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 10.5h5"/>',
 'map-center':'<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
 'map-rot-left':'<path d="m12 6 6 3-6 3-6-3Z"/><path d="M19.5 13.5a9 4.5 0 0 1-13.8 5"/><path d="m8.2 21-2.9-2.3 2.2-3"/>',
 'map-rot-right':'<path d="m12 6 6 3-6 3-6-3Z"/><path d="M4.5 13.5a9 4.5 0 0 0 13.8 5"/><path d="m15.8 21 2.9-2.3-2.2-3"/>',
 'map-panels':'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 5v14M16 5v14"/>',
 home:'<path d="M3 11 12 3l9 8"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
 skull:'<path d="M12 2a8 8 0 0 0-8 8c0 2.5 1 4.3 3 5.5V19h10v-3.5c2-1.2 3-3 3-5.5a8 8 0 0 0-8-8Z"/><circle cx="9" cy="10.5" r="1.8"/><circle cx="15" cy="10.5" r="1.8"/><path d="m12 13.3-1 2h2ZM7 19v2.5h10V19m-7 0v2.5m4-2.5v2.5"/>'
});
// Squad presets (bee, slashed zero) and the main technologies of the dev market.
Object.assign(ICONS,{
 bee:'<ellipse cx="12" cy="14.5" rx="4.6" ry="6"/><path d="M7.6 12.6h8.8M7.5 16h9M12 20.5V22"/><circle cx="12" cy="7" r="2.2"/><path d="M11 5.1 9.4 2.6m3.6 2.5 1.6-2.5"/><ellipse cx="6.8" cy="9.6" rx="3.6" ry="2" transform="rotate(-28 6.8 9.6)"/><ellipse cx="17.2" cy="9.6" rx="3.6" ry="2" transform="rotate(28 17.2 9.6)"/>',
 zero:'<ellipse cx="12" cy="12" rx="6" ry="9"/><path d="M17 4.5 7 19.5"/>',
 python:'<path d="M11.8 3C8.9 3 8 4.2 8 6v2h4.2v.9H6.1C4.3 8.9 3 10.3 3 12.3s1.3 3.4 3.1 3.4H8v-2.4c0-1.6 1.2-2.6 2.8-2.6h4.3c1.4 0 2.7-1.2 2.7-2.7V6c0-1.8-1.6-3-4-3Z"/><path d="M12.2 21c2.9 0 3.8-1.2 3.8-3v-2h-4.2v-.9h6.1c1.8 0 3.1-1.4 3.1-3.4s-1.3-3.4-3.1-3.4H16v2.4c0 1.6-1.2 2.6-2.8 2.6H8.9c-1.4 0-2.7 1.2-2.7 2.7V18c0 1.8 1.6 3 4 3Z"/><circle cx="10.3" cy="5.4" r=".5"/><circle cx="13.7" cy="18.6" r=".5"/>',
 go:'<path d="M2 9.5h3.5M1.5 12h4M2.5 14.5h3"/><path d="M13.6 10a3.3 3.3 0 1 0 .3 3.4h-2.4"/><circle cx="19" cy="12" r="3.3"/>',
 php:'<ellipse cx="12" cy="12" rx="10.5" ry="6.5"/><path d="M5.5 15V9h1.8a1.5 1.5 0 0 1 0 3H5.5M10.2 8.3V15m0-3.2c.6-1.1 3-1.2 3 .6V15M15.8 15V9h1.8a1.5 1.5 0 0 1 0 3h-1.8"/>',
 ruby:'<path d="M6.5 3.5h11l4 5.5L12 20.5 2.5 9Z"/><path d="M2.5 9h19M8.5 3.5 7 9l5 11.5L17 9l-1.5-5.5M7 9l5-5.5L17 9"/>',
 kotlin:'<path d="M4 4h16l-8 8 8 8H4Z"/><path d="M4 20 16 8"/>',
 swift:'<path d="M3.5 13.2c3.6 3 7.4 4.2 10.7 3.2-2 1.8-5.2 2.4-8.8 1.8 4 2.7 9 2.8 11.8.1 1-.9 2.4-.9 3.3.1.8-3.1 0-6.4-2.6-9.2.9 2.3.5 4.3-.5 5.5C14.3 12 9.9 9 5.8 5.4c1.9 2.4 4.4 4.7 6.9 6.6C9.5 10.7 6.4 8.8 3.8 6.5c1.7 2.6 4.1 5.1 6.7 7.1-2.4.3-4.8-.1-7-.4Z"/>',
 flutter:'<path d="M14.5 2.5h6L8.2 14.8l-3-3Z"/><path d="M14.5 11.3h6l-5.6 5.6 5.6 5.6h-6l-5.6-5.6Z"/>',
 cpp:'<path d="M12 2 20.7 7v10L12 22l-8.7-5V7Z"/><path d="M11.3 9.6a3.1 3.1 0 1 0 0 4.8M14 12h3.4m-1.7-1.7v3.4"/>',
 docker:'<path d="M2 12.5h17.2c.9 0 1.5-.6 1.9-1.5.6-.2 1.3 0 1.9.4-.5.8-1.3 1.2-2.2 1.2-1.2 4.3-5 7.4-10.3 7.4-4.8 0-7.8-2.8-8.5-7.5Z"/><path d="M5 9.5h3v3H5Zm3 0h3v3H8Zm3 0h3v3h-3Zm-3-3h3v3H8Zm3 0h3v3h-3Zm0-3h3v3h-3Z"/>',
 kubernetes:'<path d="M12 2.4 19.5 6l1.9 8.1-5.2 6.5H7.8l-5.2-6.5L4.5 6Z"/><circle cx="12" cy="12" r="2.6"/><path d="M12 5.6v3.8M12 14.6v3.8M6.2 9.8l3.3 1.3M14.5 12.9l3.3 1.3M17.8 9.8l-3.3 1.3M9.5 12.9l-3.3 1.3"/>',
 aws:'<path d="M6 12V8.4a1.7 1.7 0 0 0-3.2-.7M6 9.8c-3-.4-3.9 2.2-1.5 2.2.8 0 1.3-.4 1.5-1M7.3 7l1.5 5 1.6-3.6 1.6 3.6 1.5-5M18.8 7.7a1.8 1.8 0 0 0-3.2.8c0 1.8 3.5 1.1 3.5 2.9a1.8 1.8 0 0 1-3.5.5"/><path d="M3 15.5c5.2 3.6 12.8 3.6 18 0M18.2 14.2l2.8 1.3-1 2.9"/>',
 azure:'<path d="M10 3 3 20h6.2l3-5.5M13.5 5.5 21 20H8.5"/>',
 gcloud:'<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 17.8 9.6a4.5 4.5 0 0 1-.4 8.9Z"/><path d="M13.9 12.6a2.3 2.3 0 1 0 .2 2.2h-1.8"/>',
 git:'<path d="M12 2.5 21.5 12 12 21.5 2.5 12Z"/><circle cx="10" cy="8.6" r="1.2"/><circle cx="14.6" cy="13.2" r="1.2"/><circle cx="10" cy="15.6" r="1.2"/><path d="M10 9.8v4.6M10.8 9.4l2.9 2.9"/>',
 github:'<path d="M9 19.5c-4.2 1.3-4.2-2.2-6-2.6M15 21.5v-3.6c0-1 .1-1.5-.5-2.1 2.8-.3 5.7-1.4 5.7-6.2a4.8 4.8 0 0 0-1.3-3.3 4.4 4.4 0 0 0-.1-3.3s-1.1-.3-3.6 1.3a12.4 12.4 0 0 0-6.4 0C6.3 2.7 5.2 3 5.2 3a4.4 4.4 0 0 0-.1 3.3 4.8 4.8 0 0 0-1.3 3.3c0 4.8 2.9 5.9 5.7 6.2-.6.6-.6 1.2-.5 2.1v3.6"/>',
 linux:'<path d="M12 2.5c-2.6 0-3.8 2.2-3.8 4.6 0 1.6-.4 2.8-1.4 4.1C5.3 13.2 4.5 15 4.8 17.4"/><path d="M12 2.5c2.6 0 3.8 2.2 3.8 4.6 0 1.6.4 2.8 1.4 4.1 1.5 2 2.3 3.8 2 6.2"/><ellipse cx="12" cy="15.5" rx="3.6" ry="4.6"/><circle cx="10.6" cy="6.7" r=".6"/><circle cx="13.4" cy="6.7" r=".6"/><path d="M11 8.7h2l-1 1.1Z"/><path d="M4 20.5c1.5.4 3.5.4 5-.8M20 20.5c-1.5.4-3.5.4-5-.8"/>',
 postgres:'<path d="M8.4 6.6C6 5 3 6 3 9.2s2.6 4.4 5.4 3.9M15.6 6.6C18 5 21 6 21 9.2s-2.6 4.4-5.4 3.9"/><path d="M8 7.6C8 5.1 9.8 3.5 12 3.5s4 1.6 4 4.1v3.9c0 1.8-.9 3-2 3.8v3.9a1.5 1.5 0 0 1-3 0v-.8"/><path d="M8 7.6v3.9c0 1.5.6 2.6 1.6 3.4"/><circle cx="10.3" cy="9" r=".6"/><circle cx="13.7" cy="9" r=".6"/>',
 mysql:'<path d="M2.5 17.5c3.1-5 7.3-8 12.4-8 2.5 0 4.2 1 5.3 3.1-2 0-3.2.5-4.2 1.5 1 1.5 1.5 3.1 1 5.1-1.5-1.5-3-2.2-4.6-2.1-3 .1-6.2 1-9.9.4Z"/><path d="M13.4 9.6c-.6-2 0-4.1 1.6-5.2.3 2.1.9 3.6 2.1 4.7"/><circle cx="17.4" cy="11.9" r=".5"/>',
 mongodb:'<path d="M12 2c4.1 4.1 5.6 8.1 4.6 12.1-.6 2.6-2.3 4.4-4.6 5.6-2.3-1.2-4-3-4.6-5.6C6.4 10.1 7.9 6.1 12 2Z"/><path d="M12 5.5V22"/>',
 redis:'<path d="M2.5 8.2 12 4.5l9.5 3.7L12 12Z"/><path d="M2.5 12.3 12 16l9.5-3.7M2.5 16.4 12 20.1l9.5-3.7"/><path d="M8 8.1h2.4M13.2 7.4l2.8 1.3M15.2 6.9v2.3"/>',
 graphql:'<path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6Z"/><path d="M12 3.2 4.4 16.4h15.2Z"/><circle cx="12" cy="3.2" r="1.3"/><circle cx="19.6" cy="7.6" r="1.3"/><circle cx="19.6" cy="16.4" r="1.3"/><circle cx="12" cy="20.8" r="1.3"/><circle cx="4.4" cy="16.4" r="1.3"/><circle cx="4.4" cy="7.6" r="1.3"/>',
 nextjs:'<circle cx="12" cy="12" r="9.5"/><path d="M9 16.5v-9l8 11.2M15.5 7.5v5.5"/>',
 svelte:'<path d="M16.6 4.3c-2.1-1.7-5.3-1.4-7.1.6L5.9 8.7c-1.9 2-1.7 5 .3 6.6M7.4 19.7c2.1 1.7 5.3 1.4 7.1-.6l3.6-3.8c1.9-2 1.7-5-.3-6.6"/><path d="M14.8 8.4 9.4 13.2M9.2 15.6l5.4-4.8"/>',
 tailwind:'<path d="M5.5 10.5c1.4-2.9 3.4-3.9 5.9-3 1.5.6 2.3 2 3.9 2.3 2 .3 3.4-.5 4.9-2.3-1.4 2.9-3.4 3.9-5.9 3-1.5-.6-2.3-2-3.9-2.3-2-.3-3.4.5-4.9 2.3Z"/><path d="M2.5 16.5c1.4-2.9 3.4-3.9 5.9-3 1.5.6 2.3 2 3.9 2.3 2 .3 3.4-.5 4.9-2.3-1.4 2.9-3.4 3.9-5.9 3-1.5-.6-2.3-2-3.9-2.3-2-.3-3.4.5-4.9 2.3Z"/>',
 terraform:'<path d="M9 6.2 14 9.1v5.8L9 12Zm6 2.9 5-2.9V12l-5 2.9ZM3 3l5 2.9v5.8L3 8.8Zm6 10.2 5 2.9v5.8L9 19Z"/>',
 firebase:'<path d="M4.8 18.2 7.9 2.8l3.2 6 2.3-4.2 5.8 13.6L12 22Z"/><path d="M4.8 18.2 13.4 4.6"/>',
 supabase:'<path d="M11.2 2.3 11.9 14.8H3.8Z"/><path d="M12.8 21.7 12.1 9.2h8.1Z"/>',
 sqlite:'<path d="M20 3.5c-5.6.3-10.4 3.8-12 9.3L6.6 18l5-1.6C17 14.7 20.3 9.6 20 3.5Z"/><path d="M4 21l9.5-10.5M9 14.2h3.8M11.6 10.8h3.6"/>',
 figma:'<path d="M8.5 2.5H12v6.3H8.5a3.15 3.15 0 0 1 0-6.3ZM12 2.5h3.5a3.15 3.15 0 0 1 0 6.3H12Zm-3.5 6.3H12v6.3H8.5a3.15 3.15 0 0 1 0-6.3Zm0 6.3H12v3.2a3.15 3.15 0 1 1-3.5-3.2Z"/><circle cx="15.3" cy="12" r="3.15"/>',
 kafka:'<circle cx="12" cy="12" r="2.3"/><circle cx="12" cy="4.3" r="1.8"/><circle cx="12" cy="19.7" r="1.8"/><circle cx="18.6" cy="8.4" r="1.8"/><circle cx="18.6" cy="15.6" r="1.8"/><path d="M12 6.1v3.6M12 14.3v3.6M14 10.9l3-1.7M14 13.1l3 1.7"/>'
});
const AGENT_ICONS=['crown','file','layers','code','screen','shield','calendar','palette','phone','server','lock','database','book','sparkle','terminal','cpu','lightning','target','flow','radio','flag','eye','search','link','bug','rocket','cog','cloud','branch','key','wrench','hammer','compass','globe','brain','robot','paw','bird','anchor','star','flame','atom','puzzle','flask','satellite','package','braces','chart','chat','fingerprint','wheel','guard','question','heart','js','node','java','html','css','angular','react','vue','csharp','typescript','rust','spring','screwdriver','home','skull','tower','king','queen','jack','bee','zero','python','go','php','ruby','kotlin','swift','flutter','cpp','docker','kubernetes','aws','azure','gcloud','git','github','linux','postgres','mysql','mongodb','redis','graphql','nextjs','svelte','tailwind','terraform','firebase','supabase','sqlite','figma','kafka'];
const ICON_LABELS={crown:'Coroa',file:'Documento',layers:'Camadas',code:'Código',screen:'Tela',shield:'Escudo',calendar:'Calendário',palette:'Paleta',phone:'Celular',server:'Servidor',lock:'Cadeado',database:'Banco de dados',book:'Livro',sparkle:'Brilho',terminal:'Terminal',cpu:'Processador',lightning:'Raio',target:'Alvo',flow:'Fluxo',radio:'Sinal',flag:'Bandeira',eye:'Olho',search:'Busca',link:'Conexão',bug:'Bug',rocket:'Foguete',cog:'Engrenagem',cloud:'Nuvem',branch:'Branch Git',key:'Chave',wrench:'Chave inglesa',hammer:'Martelo',compass:'Bússola',globe:'Globo',brain:'Cérebro',robot:'Robô',paw:'Pata',bird:'Pássaro',anchor:'Âncora',star:'Estrela',flame:'Chama',atom:'Átomo',puzzle:'Quebra-cabeça',flask:'Frasco',satellite:'Satélite',package:'Plugin',braces:'Chaves {}',chart:'Gráfico',chat:'Conversa',fingerprint:'Digital',wheel:'Volante',guard:'Cão de guarda',question:'Dúvida',heart:'Coração',js:'JavaScript',node:'Node.js',java:'Java',html:'HTML',css:'CSS',angular:'Angular',react:'React',vue:'Vue',csharp:'C#',typescript:'TypeScript',rust:'Rust',spring:'Spring',screwdriver:'Chave de fenda',home:'Casa',skull:'Caveira',tower:'Torre',king:'Rei (carta)',queen:'Rainha (carta)',jack:'Valete (carta)',bee:'Abelha',zero:'Zero cortado',python:'Python',go:'Go',php:'PHP',ruby:'Ruby',kotlin:'Kotlin',swift:'Swift',flutter:'Flutter / Dart',cpp:'C / C++',docker:'Docker',kubernetes:'Kubernetes',aws:'AWS',azure:'Azure',gcloud:'Google Cloud',git:'Git',github:'GitHub',linux:'Linux',postgres:'PostgreSQL',mysql:'MySQL',mongodb:'MongoDB',redis:'Redis',graphql:'GraphQL',nextjs:'Next.js',svelte:'Svelte',tailwind:'Tailwind CSS',terraform:'Terraform',firebase:'Firebase',supabase:'Supabase',sqlite:'SQLite',figma:'Figma',kafka:'Kafka'};
const TECH_ICONS=new Set(['js','typescript','node','java','csharp','html','css','angular','react','vue','rust','spring','database','python','go','php','ruby','kotlin','swift','flutter','cpp','docker','kubernetes','aws','azure','gcloud','git','github','linux','postgres','mysql','mongodb','redis','graphql','nextjs','svelte','tailwind','terraform','firebase','supabase','sqlite','figma','kafka']);
const agentIcon=a=>(a?.icon&&AGENT_ICONS.includes(a.icon))?a.icon:roleOf(a).icon;
// Agent appearance: photo + icon cards; each opens its own gallery over the studio.
const draftRole=()=>$('#agentRole')?.value||ui.draft?.agent.role;
const draftAutoPortrait=()=>ui.draft.isNew?rolePortrait(draftRole()):autoPortrait(ui.draft.agent);
function appearanceHTML(a){
 const current=a.icon&&AGENT_ICONS.includes(a.icon)?a.icon:'';
 return`<div class="look-cards"><button type="button" class="look-card" data-action="look-open" data-kind="photo" id="lookPhotoCard" aria-haspopup="dialog"><img id="lookPhoto" src="${portrait(a)}" alt=""><span class="grow"><strong>FOTO</strong><small id="lookPhotoLabel">${a.image?'Galeria':'Automático'}</small></span>${icon('edit')}</button><button type="button" class="look-card" data-action="look-open" data-kind="icon" id="lookIconCard" aria-haspopup="dialog"><span class="look-diamond" aria-hidden="true"><span class="node-diamond"></span><span class="node-icon" id="lookIcon">${icon(current||roleOf(a).icon)}</span></span><span class="grow"><strong>ÍCONE</strong><small id="lookIconLabel">${current?E(ICON_LABELS[current]):'Automático'}</small></span>${icon('edit')}</button></div><input type="hidden" name="icon" id="agentIcon" value="${E(current)}">`;
}
function lookPickerHTML(kind){
 const photo=kind==='photo',title=photo?'ESCOLHER FOTO':'ESCOLHER ÍCONE';let grid;
 if(photo){
  const img=ui.draft.agent.image,auto=draftAutoPortrait();
  grid=`<div class="portrait-grid look-grid"><button type="button" class="portrait-choice ${img?'':'selected'}" data-action="portrait-pick" data-preset="" title="Automático (foto do template ou da especialidade)"><img src="${auto}" alt="Automático"><span>AUTO</span></button>${portraitChoices().map(({key,label,short,src})=>`<button type="button" class="portrait-choice ${img===src?'selected':''}" data-action="portrait-pick" data-preset="${E(key)}" title="${E(label)}"><img src="${src}" alt="Retrato ${E(label)}"><span>${E(short)}</span></button>`).join('')}</div>`;
 }else{
  const current=$('#agentIcon')?.value||'',auto=ROLES[draftRole()]?.icon||'target';
  const iconBtn=k=>`<button type="button" class="icon-choice ${k===current?'selected':''}" data-action="icon-pick" data-icon-key="${k}" title="${E(ICON_LABELS[k])}" aria-label="${E(ICON_LABELS[k])}">${icon(k)}</button>`;
  grid=`<div class="icon-group-label">GERAL</div><div class="icon-picker look-grid"><button type="button" class="icon-choice auto ${current?'':'selected'}" data-action="icon-pick" data-icon-key="" title="Automático (ícone da especialidade)" aria-label="Automático">${icon(auto)}<small>AUTO</small></button>${AGENT_ICONS.filter(k=>!TECH_ICONS.has(k)).map(iconBtn).join('')}</div><div class="icon-group-label">TECNOLOGIAS</div><div class="icon-picker look-grid">${AGENT_ICONS.filter(k=>TECH_ICONS.has(k)).map(iconBtn).join('')}</div>`;
 }
 return`<div class="look-picker-backdrop" data-action="look-close"></div><div class="look-picker-panel" role="dialog" aria-label="${title}"><header class="look-picker-head"><span class="eyebrow">${title}</span><button type="button" class="icon-button small" data-action="look-close" aria-label="Fechar galeria">${icon('close')}</button></header>${grid}</div>`;
}
function openLookPicker(kind){
 const el=$('#lookPicker');if(!el||ui.draft?.kind!=='agent')return;
 el.innerHTML=lookPickerHTML(kind);el.dataset.kind=kind;el.hidden=false;
 requestAnimationFrame(()=>($('.look-grid .selected',el)||$('.look-grid button',el))?.focus({preventScroll:false}));
}
function closeLookPicker(){
 const el=$('#lookPicker');if(!el||el.hidden)return;const kind=el.dataset.kind;
 el.hidden=true;el.innerHTML='';$(kind==='photo'?'#lookPhotoCard':'#lookIconCard')?.focus({preventScroll:true});
}
function pickAgentIcon(key){
 const input=$('#agentIcon');if(!input)return;const value=AGENT_ICONS.includes(key)?key:'';input.value=value;
 $('#lookIcon').innerHTML=icon(value||ROLES[draftRole()]?.icon||'target');
 $('#lookIconLabel').textContent=value?ICON_LABELS[value]:'Automático';
}
/* Hex grid shared with MapNetwork (axial coordinates, pointy-top). One agent per hex in the workspace. */
const HEX_GRID=10,HEX_DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const hexKey=h=>h.q+','+h.r;
const hexDist=(a,b={q:0,r:0})=>(Math.abs(a.q-b.q)+Math.abs(a.r-b.r)+Math.abs(a.q+a.r-b.q-b.r))/2;
const validHex=h=>!!h&&Number.isInteger(h.q)&&Number.isInteger(h.r)&&hexDist(h)<=HEX_GRID;
function hexRingAround(c,radius){if(radius===0)return[{q:c.q,r:c.r}];const out=[];let q=c.q+HEX_DIRS[4][0]*radius,r=c.r+HEX_DIRS[4][1]*radius;for(let i=0;i<6;i++)for(let j=0;j<radius;j++){out.push({q,r});q+=HEX_DIRS[i][0];r+=HEX_DIRS[i][1];}return out;}
function nearestFreeHex(center,taken,minRadius=0){for(let rad=minRadius;rad<=HEX_GRID*2;rad++){const ring=hexRingAround(center,rad).filter(h=>validHex(h)&&!taken.has(hexKey(h))).sort((a,b)=>hexDist(a)-hexDist(b));if(ring.length)return ring[0];}return null;}
// Slots (hex in the city, desk in the office) belong to the active squad only: agents of other squads never block the map.
const takenHexes=exceptId=>new Set(squad().filter(a=>a.id!==exceptId&&validHex(a.hex)).map(a=>hexKey(a.hex)));
// Legacy free positions (x/y of the old isometric map) are converted to the nearest hex.
function legacyToHex(pos){const x=(pos.x-30)/78,z=(pos.y+70)/78,qf=Math.sqrt(3)/3*x-z/3,rf=2/3*z,sf=-qf-rf;let q=Math.round(qf),r=Math.round(rf),s=Math.round(sf);const dq=Math.abs(q-qf),dr=Math.abs(r-rf),ds=Math.abs(s-sf);if(dq>dr&&dq>ds)q=-r-s;else if(dr>ds)r=-q-s;return{q:q+0,r:r+0};}
function placeAgents(agents){
 for(const a of agents){let h=validHex(a.hex)?a.hex:(a.legacyPosition?legacyToHex(a.legacyPosition):null);if(!validHex(h))h=ROLES[a.role].hex;a.hex={q:h.q,r:h.r};delete a.legacyPosition;}
}
// Positions only need to be unique inside a squad (an agent may sit in several squads): whoever repeats a hex or a desk inside
// the list moves to the nearest free one, commander first, then list order. Returns true when something moved.
function resolveSlots(list){
 const hexes=new Set(),desks=new Set(),order=[...list].sort((a,b)=>deskRank(a)-deskRank(b));let changed=false;
 for(const a of order){
  if(!validHex(a.hex)||hexes.has(hexKey(a.hex))){const h=nearestFreeHex(validHex(a.hex)?a.hex:ROLES[a.role].hex,hexes,0)||{q:0,r:0};a.hex={q:h.q,r:h.r};changed=true;}hexes.add(hexKey(a.hex));
  if(!validDesk(a.desk)||desks.has(a.desk)){a.desk=firstFreeDesk(desks,a.role);changed=true;}desks.add(a.desk);
 }
 return changed;
}
// "Reports to": '' follows the project commander. Links may not point to self or form a cycle.
function linkCreatesCycle(agents,agentId,linkId){const byId=new Map(agents.map(a=>[a.id,a]));let cur=linkId,steps=0;while(cur&&steps++<200){if(cur===agentId)return true;cur=byId.get(cur)?.linkId||'';}return false;}
function sanitizeLinks(agents){const ids=new Set(agents.map(a=>a.id));for(const a of agents){if(!ids.has(a.linkId)||a.linkId===a.id)a.linkId='';}for(const a of agents){if(a.linkId&&linkCreatesCycle(agents.filter(x=>x.id!==a.id).concat({...a,linkId:''}),a.id,a.linkId))a.linkId='';}}
const effectiveLink=(a,p=project())=>a.linkId&&p.agentIds.includes(a.linkId)&&a.linkId!==a.id?a.linkId:p.commanderId;
function isDescendant(candidateId,ancestorId,p=project()){let cur=candidateId,steps=0;while(cur&&steps++<200){const x=agentById(cur);if(!x||x.id===p.commanderId)return false;const up=effectiveLink(x,p);if(up===ancestorId)return true;if(up===cur)return false;cur=up;}return false;}
/* Office desks (isometric office view). Layout lives in MapNetwork; one agent per desk in the workspace. */
const OFFICE_SLOTS=MapNetwork.officeSlots(),OFFICE_ROOM_NAMES=new Map(MapNetwork.officeRooms().map(r=>[r.code,r.name])),DESK_IDS=new Set(OFFICE_SLOTS.map(d=>d.id));
const DESK_ROOM_ORDER=['A','B','C','LAB','REC','CMD','R'],DESK_ROLE_ROOM={commander:'CMD',architect:'REC',po:'REC'};
const ORDERED_DESKS=[...OFFICE_SLOTS].sort((a,b)=>DESK_ROOM_ORDER.indexOf(a.room)-DESK_ROOM_ORDER.indexOf(b.room));
const validDesk=id=>typeof id==='string'&&DESK_IDS.has(id);
const deskRoomName=id=>OFFICE_ROOM_NAMES.get(OFFICE_SLOTS.find(d=>d.id===id)?.room)||'';
// The commander starts in the Sala de Comando, the ADR/PRD reconhecedores in Reconhecimento, everyone else in the first free desk.
function firstFreeDesk(taken,role=''){const room=DESK_ROLE_ROOM[role];if(room){const c=OFFICE_SLOTS.find(d=>d.room===room&&!taken.has(d.id));if(c)return c.id;}return ORDERED_DESKS.find(d=>!taken.has(d.id))?.id||'';}
function deskRank(a){return a.role==='commander'?0:DESK_ROLE_ROOM[a.role]?1:2;}
const takenDesks=exceptId=>new Set(squad().filter(a=>a.id!==exceptId&&validDesk(a.desk)).map(a=>a.desk));
function placeDesks(agents){const taken=new Set(),order=[...agents].sort((a,b)=>deskRank(a)-deskRank(b));for(const a of order){if(!validDesk(a.desk)||taken.has(a.desk))a.desk=firstFreeDesk(taken,a.role);taken.add(a.desk);}}
function deskSelectHTML(a){
 const taken=takenDesks(a.id),rooms=MapNetwork.officeRooms();
 const opts=rooms.map(r=>{const free=OFFICE_SLOTS.filter(d=>d.room===r.code&&(d.id===a.desk||!taken.has(d.id)));return free.length?`<optgroup label="${E(r.name)}">${free.map(d=>`<option value="${d.id}" ${d.id===a.desk?'selected':''}>${d.id}</option>`).join('')}</optgroup>`:'';}).join('');
 return`<div class="field full"><label for="agentDesk">MESA NO ESCRITÓRIO</label><select id="agentDesk" name="desk">${validDesk(a.desk)?'':'<option value="" selected>Automático (primeira mesa livre)</option>'}${opts}</select><span class="hint">Posição do agente na vista de escritório. Também dá para arrastar o agente no mapa ou dar duplo clique numa mesa vazia.</span></div>`;
}
Object.assign(SCOPES,{mobile:'Mobile',pm:'Gestão de projeto',designer:'Design / UX',devops:'Infraestrutura / DevOps',security:'Segurança',data:'Dados / Pipelines',docs:'Documentação'});

const STATUS={backlog:'A fazer',blocked:'Bloqueada',ready:'Pronta',running:'Em execução',review:'Em revisão',done:'Concluída'};
const TOOLS=[...pluginLimits().tools];
const TOOL_INFO={Read:'Leitura de arquivos',Glob:'Busca por arquivos',Grep:'Busca por conteúdo',Edit:'Edição de arquivos',Write:'Criação de arquivos',Bash:'Comandos de terminal',WebFetch:'Buscar páginas web',WebSearch:'Pesquisa na web',NotebookEdit:'Editar notebooks'};
const PERMISSION_MODES={acceptEdits:'acceptEdits / edita arquivos, nega o resto',plan:'plan / somente leitura e planejamento',auto:'auto / classificador decide',dontAsk:'dontAsk / nega o que exigiria aprovação',manual:'manual / padrão (headless nega prompts)',bypassPermissions:'bypassPermissions / SEM VERIFICAÇÕES'};
const EFFORTS=['','low','medium','high','xhigh','max'];
// Every effort any Adapter accepts (Codex adds minimal and ultra): stored agent efforts are kept against this list, since the Perfil may be unknown at boot.
const ALL_EFFORTS=['','minimal','low','medium','high','xhigh','max','ultra'];
// Claude Code models for agents (docs: model-config / sub-agents): aliases follow the newest version, pinned IDs stay fixed.
// Groups for the studio select: [group, [[id, label, hint]]]. 'inherit' sends no --model (session / Claude Code default).
const CLAUDE_MODELS=[
 ['Herdar',[['inherit','HERDAR','Herda o modelo da sessão (padrão do Claude Code).']]],
 ['Sempre a versão mais recente',[['fable','FABLE','Fable: o mais capaz, para as tarefas mais difíceis e longas.'],['opus','OPUS','Opus: raciocínio complexo e decisões de arquitetura.'],['sonnet','SONNET','Sonnet: o dia a dia de código, rápido e equilibrado.'],['haiku','HAIKU','Haiku: rápido e econômico para tarefas simples. Não usa nível de esforço.'],['best','BEST','Usa o Fable quando disponível, senão o Opus.'],['opusplan','OPUSPLAN','Opus no modo plano e Sonnet na execução.'],['opus[1m]','OPUS 1M','Opus com janela de contexto de 1 milhão de tokens.'],['sonnet[1m]','SONNET 1M','Sonnet com janela de contexto de 1 milhão de tokens.']]],
 ['Versão fixa',[['claude-fable-5-1','FABLE 5.1','Versão fixa: Fable 5.1.'],['claude-fable-5','FABLE 5','Versão fixa: Fable 5.'],['claude-opus-5-5','OPUS 5.5','Versão fixa: Opus 5.5.'],['claude-opus-5','OPUS 5','Versão fixa: Opus 5.'],['claude-sonnet-5','SONNET 5','Versão fixa: Sonnet 5.'],['claude-haiku-4-5','HAIKU 4.5','Versão fixa: Haiku 4.5. Não usa nível de esforço.']]]
];
// Per-agent effort ('' = the model's default). ultracode is left out on purpose: it plans multi-agent workflows.
const EFFORT_INFO={'':['PADRÃO','Usa o nível padrão do modelo.'],low:['LOW','Tarefas curtas e objetivas, com baixa latência.'],medium:['MEDIUM','Economiza tokens trocando um pouco de profundidade.'],high:['HIGH','Equilíbrio entre custo e inteligência.'],xhigh:['XHIGH','Raciocínio mais profundo, com mais tokens.'],max:['MAX','O mais profundo; pode ter retorno decrescente e pensar demais.'],minimal:['MINIMAL','Quase sem raciocínio: respostas rápidas para tarefas triviais (Codex).'],ultra:['ULTRA','Acima do máximo, só nos modelos Codex que oferecem (Codex).']};
// Codex models (Adapter codex, `codex exec -m`): 'inherit' sends no -m (the Perfil's model or the Codex default). Efforts go as
// -c model_reasoning_effort (the bridge maps max to xhigh). The bridge may add models through GET /api/profiles (adapterModels).
const CODEX_MODELS=[
 ['Padrão do Perfil',[['inherit','PADRÃO DO PERFIL','Usa o modelo definido no Perfil ou o padrão do Codex.']]],
 ['Codex',[['gpt-5.5-codex','GPT-5.5 CODEX','GPT-5.5 Codex: ajustado para tarefas longas de código.'],['gpt-5.5','GPT-5.5','GPT-5.5: raciocínio geral e decisões de arquitetura.'],['gpt-5.4-mini','GPT-5.4 MINI','GPT-5.4 mini: rápido e econômico para tarefas simples.']]]
];
const CODEX_EFFORTS=['','minimal','low','medium','high','xhigh'];
const ADAPTER_LABEL={claude:'Claude',codex:'Codex'};
// Perfil ids come from the bridge database (GET /api/profiles); '' = Perfil padrão.
function profRef(v){return typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v)?v:'';}
function modelInfo(m){for(const cat of [CLAUDE_MODELS,CODEX_MODELS])for(const [,items] of cat)for(const [id,label,hint] of items)if(id===m)return{id,label,hint};return null;}
function modelLabel(m){return m?modelInfo(m)?.label||String(m).toUpperCase():'PADRÃO';}
function modelHint(m){return modelInfo(m)?.hint||'Modelo personalizado (ID aceito pelo Claude Code).';}
function modelEffortSupport(m){return !/^(claude-)?haiku/.test(String(m||''));} // Haiku has no effort levels
function modelDefaultEffort(m){if(modelAdapterOf(m)==='codex')return'medium';return /^(opus(\[1m\])?|claude-opus-5-5)$/.test(String(m||''))?'medium':'high';}
// Effective effort of a run: the global runtime effort overrides the agent's (like the model); none for models without effort.
function agentEffort(a,r=runtime()){const {model,adapter}=agentModelOf(a,r);if(adapter==='claude'&&!modelEffortSupport(model||a?.model))return{model,effort:'',source:'none'};const pf=agentProfile(a,r),list=adapterEfforts(adapter,model||pf.model,pf);if(r.effort&&list.includes(r.effort))return{model,effort:r.effort,source:'global'};const own=a?.effort||'';if(own&&list.includes(own))return{model,effort:own,source:'agent'};return{model,effort:'',source:'default',dropped:r.effort||own||''};}
const ADR_STATUS=['Proposto','Aceito','Rejeitado','Depreciado','Substituído'];
const DEFAULT_RUNTIME={mode:'claude',claudePath:'',permissionMode:'acceptEdits',model:'',effort:'',maxBudgetUsd:'',timeoutSec:900,concurrency:2,addDirs:'',restrictTools:true,extraAllowedTools:'',forceProfileId:''};
// Plugins: runtime defaults of squad.config/squad.local and the plugins (whitelisted by the bridge and again here) for new workspaces;
// a saved workspace only takes the keys it does not have (pluginRuntime in normalizeWorkspace), never over what the person saved.
function pluginRuntime(){
 if(pluginRuntime.v)return pluginRuntime.v;const P=readPlugins(),src=Object.keys(P.runtime).length?P.runtime:Object.assign({},...P.plugins.map(p=>p.runtime));
 const keys=['permissionMode','model','effort','maxBudgetUsd','timeoutSec','concurrency','addDirs','restrictTools','extraAllowedTools'].filter(k=>src[k]!==undefined&&src[k]!==null),n=normalizeRuntime(src),out={};
 for(const k of keys)out[k]=n[k];return pluginRuntime.v=out;
}
Object.assign(DEFAULT_RUNTIME,pluginRuntime());
const STORE='squad-code.network.v2';
// catalogVersion: one-time catalog migrations already applied to this workspace (migrateCatalogAgents). New workspaces start current.
// teamsChat: width of the Agent Teams chat panel in px (0 = default). opsChat: width of the docked operation chat (0 = default).
// mapQuality: graphics of the hex city ('high': shadows, ambient occlusion and bloom; 'low': plain render).
// theme: key of a plugin theme ('<plugin>/<theme>', '' = default look); an unknown key shows the default and stays saved.
const DEFAULT_SETTINGS={motion:true,stepMs:1800,squadView:'city',cityShape:'flat',mapQuality:'high',catalogVersion:2,teamsChat:0,opsChat:0,theme:'',runtime:{...DEFAULT_RUNTIME}};
function normalizeRuntime(r={}){const str=(v,max)=>typeof v==='string'?v.slice(0,max).trim():'';const n=Number(r.timeoutSec),c=Number(r.concurrency),b=Number(r.maxBudgetUsd);return{mode:r.mode==='demo'?'demo':'claude',claudePath:str(r.claudePath,400),permissionMode:Object.hasOwn(PERMISSION_MODES,r.permissionMode)?r.permissionMode:'acceptEdits',model:/^[A-Za-z0-9._\-\[\]]{0,80}$/.test(r.model||'')?(r.model||''):'',effort:EFFORTS.includes(r.effort)?r.effort:'',maxBudgetUsd:Number.isFinite(b)&&b>0&&b<=1000?String(b):'',timeoutSec:Number.isFinite(n)&&n>=10&&n<=7200?Math.round(n):900,concurrency:Number.isInteger(c)&&c>=1&&c<=8?c:2,addDirs:str(r.addDirs,2000),restrictTools:r.restrictTools!==false,extraAllowedTools:str(r.extraAllowedTools,2000),forceProfileId:profRef(r.forceProfileId)};}
const AGENT_STAGES={discovery:{label:'Descoberta',short:'IDEIA'},identity:{label:'Identidade',short:'IDENTIDADE'},prompt:{label:'Prompt & Tools',short:'PROMPT'},validation:{label:'Validação',short:'VALIDAÇÃO'},ready:{label:'Pronto',short:'PRONTO'}};
const STAGE_ORDER=['discovery','identity','prompt','validation','ready'];
function createFeature(title,index,extra={}){return{id:id('feature'),key:'F'+pad(index),title,description:'',criteria:'Critérios de aceitação definidos no briefing.',scope:'fullstack',priority:'P1',status:'backlog',dependencies:[],route:[],currentAgentId:null,step:0,outputs:[],context:'',tasks:'',sprintId:'',briefs:[],setup:false,...extra};}
/* Every operation opens Sprint 01 with the project setup (F00, `setup: true`): the first feature of the first sprint and a dependency of
   every other feature, so nothing else runs before it is approved. It cannot be deleted nor leave the first sprint; ensureSetup keeps
   the rule on creation, on every save of a feature and on load/import (older operations get it in backlog). */
const SETUP_FEATURE={title:'Setup do projeto',scope:'setup',priority:'P0',
 description:'Preparar a base do projeto na pasta da operação antes de qualquer feature: estrutura de pastas, stack e dependências definidas na arquitetura e nas ADRs, lint, formatação e testes conforme as diretrizes da squad, scripts de build e execução, variáveis de ambiente de exemplo e um README com o passo a passo para rodar.',
 criteria:'O projeto instala e roda localmente seguindo o README.\nLint e testes rodam com sucesso, com ao menos um teste de exemplo.\nA estrutura de pastas segue a arquitetura e as ADRs.\nExiste um .env.example sem segredos.\nNenhuma regra de negócio das features foi implementada nesta etapa.',
 tasks:'Criar a estrutura do repositório e instalar as dependências da stack\nConfigurar lint, formatação e testes\nCriar os scripts de build, execução e teste\nEscrever o README e o .env.example'};
function setupOf(p=project()){return p?.features?.find(f=>f.setup)||null;}
function ensureSetup(p){
 const first=p?.sprints?.[0];if(!first||!Array.isArray(p.features))return null;
 let s=p.features.find(f=>f.setup);for(const f of p.features)if(f.setup&&f!==s)f.setup=false;
 if(!s){if(p.features.length>=150)return null;s=createFeature(SETUP_FEATURE.title,0,{...SETUP_FEATURE,setup:true,sprintId:first.id});p.features.unshift(s);}
 s.sprintId=first.id;s.dependencies=[];if(p.features[0]!==s){p.features.splice(p.features.indexOf(s),1);p.features.unshift(s);}
 for(const f of p.features){if(f===s)continue;if(!f.dependencies.includes(s.id))f.dependencies.unshift(s.id);if(s.status!=='done'&&f.status==='ready')f.status='blocked';}
 return s;
}
// Sprints group a project's features (every feature belongs to exactly one); the first sprint absorbs orphans.
function createSprint(index,extra={}){return{id:id('sprint'),name:'Sprint '+pad(index),goal:'',...extra};}
function sprintById(sid,p=project()){return(p?.sprints||[]).find(s=>s.id===sid)||null;}
function sprintOf(f,p=project()){return sprintById(f?.sprintId,p)||p?.sprints?.[0]||null;}
function sprintFeatures(s,p=project()){const first=p.sprints?.[0];return p.features.filter(f=>f.sprintId===s.id||(s===first&&!sprintById(f.sprintId,p)));}
function sprintCode(s,p=project()){return'S'+pad(Math.max(0,(p?.sprints||[]).indexOf(s))+1);}
function currentSprint(p=project()){const list=p?.sprints||[];return list.find(s=>sprintFeatures(s,p).some(f=>f.status!=='done'))||list.at(-1)||null;}
function seedWorkspace(){
 const agents=['commander','po','architect','backend','frontend','qa'].map(role=>[role,ROLES[role]]).map(([role,r])=>({id:'agent-'+role,name:r.name,role,specialty:'',icon:'',description:r.description,prompt:r.prompt,model:r.model,effort:'',profileId:'',tools:['Read','Glob','Grep',...(['backend','frontend'].includes(role)?['Edit','Write']:[])],image:'',nextId:'',productionStage:'ready',hex:{...r.hex},linkId:'',...defaultSoul({name:r.name,role})}));
 placeDesks(agents);
 const features=[
  createFeature('Autenticação e acesso',1,{priority:'P0',status:'done',description:'Cadastro, login, logout e recuperação de acesso.',criteria:'Validar entradas; restringir acesso administrativo; testar estados de sucesso e erro.',outputs:[{agentId:'agent-qa',at:nowISO(),text:'Registro de exemplo para demonstrar uma feature concluída. Não há código, testes ou execução real associados.',simulated:true}]}),
  createFeature('Catálogo de produtos',2,{priority:'P0',description:'Listagem de produtos com busca, categorias, filtros e página de detalhes.',criteria:'Listagem paginada; filtros combináveis; estados vazio, carregando e erro; layout responsivo.'}),
  createFeature('Carrinho e checkout',3,{priority:'P0',description:'Carrinho persistente e fechamento de pedido em sandbox.',criteria:'Recalcular valores no servidor; validar estoque; não armazenar dados de cartão.'}),
  createFeature('Painel administrativo',4,{priority:'P1',scope:'frontend',description:'Interface para gerenciar produtos, estoque e pedidos.',criteria:'Acesso restrito; validação dos formulários; confirmação de exclusão.'}),
  createFeature('Histórico de pedidos',5,{priority:'P1',scope:'backend',description:'Consulta paginada de pedidos por cliente.',criteria:'Isolamento por cliente; paginação; validação e estados de erro.'}),
  createFeature('Qualidade e acessibilidade',6,{priority:'P2',scope:'qa',description:'Revisão final dos fluxos e checklist de acessibilidade.',criteria:'Listar evidências, lacunas e bloqueios; não declarar testes executados sem execução.'})
 ];
 features[2].dependencies=[features[1].id];features[3].dependencies=[features[0].id];features[4].dependencies=[features[0].id,features[2].id];features[5].dependencies=features.slice(0,5).map(f=>f.id);
 const sprints=[createSprint(1,{id:'sprint-atlas-1',goal:'Base da loja: acesso, catálogo e compra.'}),createSprint(2,{id:'sprint-atlas-2',goal:'Gestão e pós-venda: painel administrativo, histórico de pedidos e qualidade.'})];features.forEach((f,i)=>{f.sprintId=sprints[i<3?0:1].id;});
 const setup=createFeature(SETUP_FEATURE.title,0,{...SETUP_FEATURE,setup:true,sprintId:sprints[0].id,status:'done',outputs:[{agentId:'agent-architect',at:nowISO(),text:'Registro de exemplo para demonstrar o setup concluído. Não há código, testes ou execução real associados.',simulated:true}]});features.forEach(f=>f.dependencies.unshift(setup.id));features.unshift(setup);
 agents.forEach(a=>{a.conventions=defaultConventions(a);});
 return{version:2,agents,conventionLibrary:{templates:[],subsets:[]},squads:[{id:'squad-atlas',name:'SQUAD ATLAS',commanderId:'agent-commander',adrId:'agent-architect',prdId:'agent-po',operatorIds:['agent-backend','agent-frontend','agent-qa'],agentIds:agents.map(a=>a.id),createdAt:nowISO()}],projects:[{id:'project-atlas',squadId:'squad-atlas',code:'OP-001',name:'Atlas Commerce',folder:'op-001-atlas-commerce',briefing:'Construir uma plataforma de e-commerce completa, do catálogo a gestão de pedidos.\n\nO cliente deve descobrir produtos, comprar com segurança e acompanhar seus pedidos. A equipe interna precisa de um painel para gerenciar catálogo, estoque e vendas.\n\nPriorizar uma primeira entrega pequena e funcional. Pagamentos somente em sandbox. Respeitar o design system e os critérios de aceitação. Todas as entregas passam por revisão humana antes de concluídas.',
  vision:'Para lojistas que querem vender online sem montar uma operação complexa, o Atlas Commerce é uma loja completa: o cliente encontra produtos, compra com segurança e acompanha os pedidos, e a equipe interna gerencia catálogo, estoque e vendas num só painel.\n\nMetas da primeira entrega: um fluxo de compra de ponta a ponta em sandbox, catálogo com busca e filtros, e um painel administrativo com acesso restrito.',
  scopeIn:'Cadastro, login e recuperação de acesso\nCatálogo com busca, categorias, filtros e página de produto\nCarrinho persistente e checkout com pagamento em sandbox\nPainel administrativo de produtos, estoque e pedidos\nHistórico de pedidos por cliente\nChecklist de qualidade e acessibilidade dos fluxos',
  scopeOut:'Pagamentos reais e armazenamento de dados de cartão\nAplicativo mobile nativo\nMarketplace com vários vendedores\nIntegração com transportadoras',
  glossary:'SKU: código único que identifica um produto e sua variação\nCarrinho: itens escolhidos pelo cliente antes do checkout, guardados entre sessões\nCheckout: fechamento do pedido, com endereço, frete e pagamento\nSandbox: ambiente de pagamento de teste, sem cobrança real\nPedido: compra confirmada, com itens, valores e status',
  architecture:'Aplicação web com frontend SPA e uma API REST. A API concentra as regras de negócio: preços, estoque e totais do pedido são sempre recalculados no servidor.\n\nDados em banco relacional (usuários, produtos, estoque, carrinhos e pedidos). O pagamento passa por um provedor em modo sandbox via integração server-side. O painel administrativo usa a mesma API, com autorização por papel.',
  adrs:[{id:'adr-atlas-1',title:'Recalcular valores do pedido no servidor',status:'Aceito',date:nowISO().slice(0,10),content:'## Contexto\nO cliente pode alterar preços e quantidades enviados pelo navegador.\n\n## Decisão\nA API recalcula preços, descontos, frete e total a partir do catálogo e do estoque em toda criação e atualização de pedido. Valores vindos do cliente servem só para exibição.\n\n## Consequências\nTotais sempre confiáveis e validação de estoque num só lugar, ao custo de uma consulta a mais por operação do carrinho.'}],
  commanderId:'agent-commander',agentIds:agents.map(a=>a.id),sprints,features,logs:[{id:id('event'),at:nowISO(),agentId:null,type:'system',message:'Workspace de exemplo carregado. Nenhum processo Claude conectado.',simulated:true}],handoffs:[],createdAt:nowISO()}],projectId:'project-atlas',settings:{...DEFAULT_SETTINGS,runtime:{...DEFAULT_RUNTIME}}};
}
function hasCycle(features){const map=new Map(features.map(f=>[f.id,f.dependencies])),active=new Set(),visited=new Set();const visit=id=>{if(active.has(id))return true;if(visited.has(id))return false;active.add(id);for(const next of map.get(id)||[])if(visit(next))return true;active.delete(id);visited.add(id);return false;};return features.some(f=>visit(f.id));}
// Backup normalization: explicit fields, bounded sizes, safe identifiers, and image data URLs only.
function normalizeWorkspace(raw){
 if(!raw||raw.version!==2||!Array.isArray(raw.agents)||!Array.isArray(raw.projects)||raw.agents.length>80||!raw.projects.length||raw.projects.length>30)throw Error('Formato inválido. Use um backup SQUAD CODE Network v2.');
 const seen=new Set(),str=(v,max=20000)=>typeof v==='string'?v.slice(0,max):'';
 const validId=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v)||seen.has(v))throw Error('Identificador inválido ou duplicado.');seen.add(v);return v;};
 const ref=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)?v:'';
 // Log and handoff ids stay as saved (unique ones), so the database rewrites only what changed.
 const kept=new Set(),keepId=(v,prefix)=>{const k=ref(v);if(k&&!kept.has(k)&&!seen.has(k)){kept.add(k);return k;}return id(prefix);};
 const arr=(v,max=100)=>Array.isArray(v)?v.slice(0,max):[];
 const image=v=>typeof v==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<800000?v:'';
 const conv=c=>c&&typeof c==='object'?{family:Object.hasOwn(CONVENTION_FAMILIES,c.family)?c.family:'',template:str(c.template,80),base:str(c.base,20000),subsets:arr(c.subsets,20).filter(x=>x&&typeof x==='object').map(x=>({id:ref(x.id)||id('conv'),name:str(x.name,60).trim()||'Subset',content:str(x.content,8000),source:str(x.source,80)||'custom'})).filter(x=>x.content.trim())}:null;
 const date=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():nowISO();
 const agents=raw.agents.map(a=>{
  if(a&&!Object.hasOwn(ROLES,a.role)&&LEGACY_ROLES[a.role]){const [role,label]=LEGACY_ROLES[a.role];a={...a,role,specialty:a.specialty||label};}
  if(!a||!Object.hasOwn(ROLES,a.role))throw Error('Especialidade de agente inválida.');
  return{id:validId(a.id),name:str(a.name,32)||ROLES[a.role].name,role:a.role,specialty:str(a.specialty,40).trim(),icon:AGENT_ICONS.includes(a.icon)?a.icon:'',description:str(a.description,1200),prompt:str(a.prompt,20000)||ROLES[a.role].prompt,model:typeof a.model==='string'&&/^[A-Za-z0-9._\-\[\]]{1,80}$/.test(a.model)?a.model:'sonnet',effort:ALL_EFFORTS.includes(a.effort)?a.effort:'',profileId:profRef(a.profileId),tools:arr(a.tools,TOOLS.length).filter(t=>TOOLS.includes(t)),image:image(a.image),nextId:ref(a.nextId),productionStage:Object.hasOwn(AGENT_STAGES,a.productionStage)?a.productionStage:'discovery',hex:validHex(a.hex)?{q:a.hex.q,r:a.hex.r}:null,legacyPosition:Number.isFinite(a.position?.x)&&Number.isFinite(a.position?.y)?{x:a.position.x,y:a.position.y}:null,linkId:ref(a.linkId),desk:typeof a.desk==='string'?a.desk:'',template:str(a.template,32),soul:typeof a.soul==='string'?normalizeSoul(a,str(a.soul,1200)):defaultSoul(a).soul,hellos:normalizeHellos(a),conventions:conv(a.conventions)};
 });
 // Retired presets (NOMAD -> PROFETA, ORÁCULO -> ECHO): the old preset agent takes the new codename (and the commander its portrait) when it is free.
 agents.forEach(a=>{const next=retiredPresetName(a.name,a.role);if(next&&!agents.some(x=>x.name===next)){if(a.role==='commander'&&(!a.image||a.image===PORTRAITS['avatar-'+a.name.toLowerCase()]))a.image=PORTRAITS['avatar-predator']||a.image;a.name=next;a.template=next;}const t=retiredPresetName(a.template,a.role);if(t)a.template=t;});
 // Agents without a conventions guide (older workspaces) get the default of their type once.
 agents.forEach(a=>{if(!a.conventions)a.conventions=defaultConventions(a);else if(!a.conventions.family)a.conventions.family=conventionFamilyOf(a);});
 const agentIds=new Set(agents.map(a=>a.id));agents.forEach(a=>{if(!agentIds.has(a.nextId)||a.nextId===a.id)a.nextId='';});placeAgents(agents);agents.forEach(a=>{if(!validDesk(a.desk))a.desk='';});sanitizeLinks(agents);
 const projects=raw.projects.map(p=>{
  if(!p||!Array.isArray(p.features)||p.features.length>150)throw Error('Projeto ou quantidade de features inválidos.');
  const ids=arr(p.agentIds,80).filter(a=>agentIds.has(a));
  const sprints=arr(p.sprints,50).filter(s=>s&&typeof s==='object').map(s=>({id:validId(s.id),name:str(s.name,60)||'Sprint',goal:str(s.goal,2000)}));if(!sprints.length)sprints.push(createSprint(1));const sprintIds=new Set(sprints.map(s=>s.id));
  const features=p.features.map(f=>{if(!f)throw Error('Feature inválida.');return{id:validId(f.id),key:str(f.key,15),title:str(f.title,120)||'Sem título',description:str(f.description,8000),criteria:str(f.criteria,8000),scope:Object.hasOwn(SCOPES,f.scope)?f.scope:LEGACY_SCOPES[f.scope]||'fullstack',priority:['P0','P1','P2'].includes(f.priority)?f.priority:'P1',status:Object.hasOwn(STATUS,f.status)?(f.status==='running'?'ready':f.status):'backlog',dependencies:arr(f.dependencies,150).map(ref),route:arr(f.route,80).filter(a=>ids.includes(a)),currentAgentId:null,step:0,outputs:arr(f.outputs,300).filter(o=>o&&typeof o==='object').map(o=>({agentId:ref(o.agentId),at:date(o.at),text:str(o.text,40000),simulated:o.simulated!==false,error:o.error===true,costUsd:Number.isFinite(o.costUsd)?o.costUsd:null,durationMs:Number.isFinite(o.durationMs)?o.durationMs:null,sessionId:ref(o.sessionId)||null})),context:str(f.context,10000),tasks:str(f.tasks,8000),sprintId:sprintIds.has(f.sprintId)?f.sprintId:sprints[0].id,briefs:arr(f.briefs,80).map(b=>str(b,2000)),setup:f.setup===true};});
  const featureIds=new Set(features.map(f=>f.id));features.forEach(f=>{f.dependencies=[...new Set(f.dependencies.filter(d=>featureIds.has(d)&&d!==f.id))];if(f.briefs.length!==f.route.length)f.briefs=[];if(!f.route.length&&['ready','blocked'].includes(f.status))f.status='backlog';});
  if(hasCycle(features))throw Error('As dependências do backup formam um ciclo.');
  return{id:validId(p.id),code:str(p.code,20),name:str(p.name,70)||'Novo projeto',folder:str(p.folder,80),briefing:str(p.briefing,20000),vision:str(p.vision,8000),scopeIn:str(p.scopeIn,8000),scopeOut:str(p.scopeOut,8000),glossary:str(p.glossary,8000),architecture:str(p.architecture,12000),adrs:arr(p.adrs,50).filter(x=>x&&typeof x==='object').map(x=>({id:ref(x.id)||id('adr'),title:str(x.title,120),status:ADR_STATUS.includes(x.status)?x.status:'Proposto',date:/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')?x.date:'',content:str(x.content,12000)})).filter(x=>x.title),squadId:ref(p.squadId),commanderId:ids.includes(p.commanderId)&&agents.find(a=>a.id===p.commanderId)?.role==='commander'?p.commanderId:'',agentIds:[...new Set(ids)],sprints,features,logs:arr(p.logs,500).filter(l=>l&&typeof l==='object').map(l=>({id:keepId(l.id,'event'),at:date(l.at),agentId:ref(l.agentId)||null,type:['system','plan','agent','handoff','review'].includes(l.type)?l.type:'system',message:str(l.message,3000),simulated:l.simulated!==false})),handoffs:arr(p.handoffs,500).filter(h=>h&&agentIds.has(h.from)&&agentIds.has(h.to)).map(h=>({id:keepId(h.id,'handoff'),at:date(h.at),from:h.from,to:h.to,featureId:ref(h.featureId),context:str(h.context,10000),manual:!!h.manual,simulated:h.simulated!==false})),createdAt:date(p.createdAt)};
 });
 projects.forEach(ensureSetup);
 // Project folders stay as saved when valid and unique; older backups get one derived from code and name.
 {const taken=[];projects.forEach(p=>{if(!validFolder(p.folder)||taken.includes(p.folder))p.folder=projectFolderName(p,taken);taken.push(p.folder);});}
 // Squads: named teams with a mandatory commander. Backups without squads are migrated (one squad per distinct project team).
 const cmdIds=agents.filter(a=>a.role==='commander').map(a=>a.id),isCmd=a=>cmdIds.includes(a);
 const roleOfId=x=>agents.find(a=>a.id===x)?.role;
 // Slots: commander (role commander), ADR (architect), PRD (po) and operators (any other role); old squads are derived from their members.
 const fixSquad=q=>{const pool=[...new Set([q.commanderId,q.adrId,q.prdId,...(q.operatorIds||[]),...(q.agentIds||[])].filter(a=>agentIds.has(a)))];
  const c=roleOfId(q.commanderId)==='commander'?q.commanderId:(pool.find(isCmd)||cmdIds[0]||''),adr=roleOfId(q.adrId)==='architect'?q.adrId:(pool.find(a=>roleOfId(a)==='architect')||''),prd=roleOfId(q.prdId)==='po'?q.prdId:(pool.find(a=>roleOfId(a)==='po')||'');
  const operatorIds=[...new Set((q.operatorIds&&q.operatorIds.length?q.operatorIds:pool).filter(a=>agentIds.has(a)&&![c,adr,prd].includes(a)&&!isCmd(a)))];
  return{...q,commanderId:c,adrId:adr,prdId:prd,operatorIds,agentIds:[...new Set([c,adr,prd,...operatorIds].filter(Boolean))]};};
 const squads=arr(raw.squads,30).filter(q=>q&&typeof q==='object').map(q=>fixSquad({id:validId(q.id),name:(str(q.name,60).trim()||'SQUAD').toUpperCase(),commanderId:ref(q.commanderId),adrId:ref(q.adrId),prdId:ref(q.prdId),operatorIds:arr(q.operatorIds,80).map(ref),agentIds:arr(q.agentIds,80).map(ref),createdAt:date(q.createdAt)}));
 const sameTeam=(q,p)=>q.commanderId===p.commanderId&&q.agentIds.length===p.agentIds.length&&p.agentIds.every(a=>q.agentIds.includes(a));
 projects.forEach(p=>{
  let q=squads.find(x=>x.id===p.squadId)||squads.find(x=>sameTeam(x,p));
  if(!q&&(!Array.isArray(raw.squads)||!squads.length)&&squads.length<30){const base=('SQUAD '+p.name.toUpperCase()).slice(0,54);let name=base,n=2;while(squads.some(x=>x.name===name))name=base+' '+n++;q=fixSquad({id:id('squad'),name,commanderId:p.commanderId,agentIds:p.agentIds,createdAt:p.createdAt});squads.push(q);}
  q=q||squads[0];p.squadId=q.id;p.agentIds=[...q.agentIds];p.commanderId=isCmd(q.commanderId)?q.commanderId:'';
  p.features.forEach(f=>{if(f.route.some(a=>!q.agentIds.includes(a))&&!['done','review'].includes(f.status)){f.route=[];f.status='backlog';}});
 });
 const projectId=projects.some(p=>p.id===raw.projectId)?raw.projectId:projects[0].id;
 const rawLib=raw.conventionLibrary&&typeof raw.conventionLibrary==='object'?raw.conventionLibrary:{};
 const conventionLibrary={templates:arr(rawLib.templates,60).filter(t=>t&&typeof t==='object'&&typeof t.content==='string').map(t=>({id:ref(t.id)||id('ctpl'),name:str(t.name,60).trim()||'Template',family:Object.hasOwn(CONVENTION_FAMILIES,t.family)?t.family:'general',content:str(t.content,20000),createdAt:date(t.createdAt)})),subsets:arr(rawLib.subsets,60).filter(t=>t&&typeof t==='object'&&typeof t.content==='string').map(t=>({id:ref(t.id)||id('csub'),name:str(t.name,60).trim()||'Subset',content:str(t.content,8000),createdAt:date(t.createdAt)}))};
 return{version:2,agents,conventionLibrary,squads,projects,projectId,settings:{motion:raw.settings?.motion!==false,stepMs:[600,1000,1800,3200].includes(raw.settings?.stepMs)?raw.settings.stepMs:1800,squadView:raw.settings?.squadView==='office'?'office':'city',cityShape:raw.settings?.cityShape==='planet'?'planet':'flat',mapQuality:raw.settings?.mapQuality==='low'?'low':'high',squadNodes:raw.settings?.squadNodes==='photo'?'photo':'icon',catalogVersion:Number.isInteger(raw.settings?.catalogVersion)&&raw.settings.catalogVersion>0?raw.settings.catalogVersion:1,teamsChat:Number.isInteger(raw.settings?.teamsChat)&&raw.settings.teamsChat>=280&&raw.settings.teamsChat<=1600?raw.settings.teamsChat:0,opsChat:Number.isInteger(raw.settings?.opsChat)&&raw.settings.opsChat>=280&&raw.settings.opsChat<=1600?raw.settings.opsChat:0,theme:typeof raw.settings?.theme==='string'&&/^[A-Za-z0-9_.\/-]{0,100}$/.test(raw.settings.theme)?raw.settings.theme:'',runtime:normalizeRuntime({...pluginRuntime(),...(raw.settings?.runtime&&typeof raw.settings.runtime==='object'?raw.settings.runtime:{})})}};
}
/* Saved copy. Served by the bridge, the page gets the workspace from its SQLite database (data/squad.db) in #squad-disk and every
   save() also goes there (diskFlush,
   debounced); the disk is the shared truth and localStorage a cache. STORE_DISK = {rev, pending} per browser: the disk rev the copy
   was built on and whether it holds saves the disk never got (bridge down, page with an old token). Boot takes the disk, unless the
   browser has pending saves on top of that same rev; when both changed (or the browser copy predates disk sync and differs), the one
   with the latest activity (wsActivity) wins and the other becomes a saved version. A stale page gets 409 on write (diskConflict). */
const STORE_DISK=STORE+'.disk';
const diskSync={on:false,rev:'',path:'',savedAt:'',status:'',error:'',last:'',json:null,timer:null,busy:false,again:false,force:false,backup:null,notice:'',fromDisk:false,setup:false,localCopy:null};
function wsActivity(w){let t=0;const at=v=>{const n=Date.parse(v);if(n>t)t=n;};for(const p of Array.isArray(w?.projects)?w.projects:[]){at(p?.createdAt);(Array.isArray(p?.logs)?p.logs:[]).forEach(l=>at(l?.at));(Array.isArray(p?.features)?p.features:[]).forEach(f=>(Array.isArray(f?.outputs)?f.outputs:[]).forEach(o=>at(o?.at)));}(Array.isArray(w?.squads)?w.squads:[]).forEach(q=>at(q?.createdAt));return t;}
let state,storageAvailable=true,loadNotice='';
{
 const el=document.getElementById('squad-disk');const B=bootChoice(),{tag,disk,local}=B;el?.remove();let raw=B.raw;
 // No database yet (first start on this machine): nothing loads or saves until the person picks how to start (openDbSetup); the
 // example only fills the screen behind the dialog, and this browser's copy, if any, is offered there and kept untouched.
 if(tag?.setup)Object.assign(diskSync,{setup:true,path:String(tag.path||''),localCopy:local});
 else if(tag){
  Object.assign(diskSync,{on:true,rev:String(tag.rev||''),path:String(tag.path||''),savedAt:String(tag.savedAt||'')});
  if(tag.error)loadNotice=`Não foi possível ler o workspace salvo no banco local. ${tag.error}`;
  if(B.force)diskSync.force=true;if(B.backup!==null)diskSync.backup=B.backup;if(B.notice)diskSync.notice=B.notice; // bootChoice: the pick
 }
 for(const w of diskSync.setup?[]:[raw,raw===local?disk:local])if(w&&!state)try{state=normalizeWorkspace(w);raw=w;}catch(error){if(w===disk)Object.assign(diskSync,{force:true,backup:null,notice:''});else if(!tag)storageAvailable=false;loadNotice=`Não foi possível restaurar o workspace salvo ${w===disk?'no banco local':'neste navegador'} (${error.message}). Use Exportar para guardar seus dados.`;}
 if(!state){state=seedWorkspace();raw=null;}
 diskSync.fromDisk=!!raw&&raw===disk;
 // A saved workspace from before the setup rule gets its F00 on this load: written at once, so its id stays the same.
 diskSync.migrated=diskSync.fromDisk&&!disk.projects.every(p=>Array.isArray(p?.features)&&p.features.some(f=>f?.setup===true));
 if(raw?.projects?.some?.(p=>p?.features?.some?.(f=>f?.status==='running')))loadNotice=loadNotice||'A simulação anterior foi interrompida. As features voltaram para Prontas.';
}
// Theme: city.js already took the one bootThemeKey() predicted; if the loaded workspace says otherwise (a copy that failed to load,
// for instance), the CSS follows now and the map on the next load.
{squadThemeBoot();const t=state.settings.theme;if(t!==squadThemeBoot.key){squadThemeBoot.key=t;applyTheme(t?pluginThemes().find(x=>x.key===t)||null:null);}}
// Operation rooms and chats saved by the bridge (#squad-memory): rooms hydrate lazily in roomOf, chats fill ui right below.
let bootMemory=null;{const el=document.getElementById('squad-memory');try{bootMemory=el?JSON.parse(el.textContent):null;}catch{}el?.remove();}
// Template agents keep no copy of their identity photo: a stored copy of the current or an earlier preset photo becomes "Automático" (it follows TEMPLATE_AVATARS).
state.agents.forEach(a=>{const k=templateAvatarKey(a);if(k&&a.image&&[TEMPLATE_AVATARS[k],...(TEMPLATE_AVATARS_V1[k]||[])].some(x=>PORTRAITS[x]===a.image))a.image='';});
// Preset icons changed (ABELHA-RAINHA -> bee, ZERO -> slashed zero); agents still using the previous preset icon follow.
[['ABELHA-RAINHA','queen','bee'],['ZERO','radio','zero'],['VANILLA','html','js'],['PIPELINE','flow','git'],['SCALPEL','check','flask'],['WARDEN','shield','bug']].forEach(([name,from,to])=>state.agents.forEach(a=>{if(a.name===name&&a.icon===from)a.icon=to;}));
const ui={dismissedId:null,squadSel:null,squadDraft:null,squadPick:null,squadSlotPending:null,squadFlash:null,opsNew:null,opsFeature:null,opsFeatureDraft:null,opsPlan:null,opsFeatView:'list',opsLast:{scope:'fullstack',priority:'P1',sprintId:''},sprintOpen:{},selectedId:state.projects.find(p=>p.id===state.projectId)?.commanderId||state.agents[0]?.id,view:'home',lastView:'home',focus:false,modal:null,returnFocus:null,draft:null,pendingPlan:null,confirm:null,featureQuery:'',logFilter:'all',bridge:{online:false,checked:false,version:null,error:null},opsChat:{open:false,min:false,unread:0,pid:''},consoles:[],consoleId:null,settingsTab:'workspace',settingsScope:'user',settingsFile:null,settingsProfile:'',profiles:{loaded:false,list:[],adapters:null,error:'',usage:null,usageBusy:false},profForm:null,profConfirm:null,profTest:{},profBusy:{},profSaving:false,telemetry:null,telemetryErr:'',usageBy:''};
if(bootMemory?.chats){ui.featureChats=bootMemory.chats.feature||{};ui.agentChats=bootMemory.chats.agent||{};ui.docChats=bootMemory.chats.doc||{};}
let runner=null,timer=null;
const project=()=>state.projects.find(p=>p.id===state.projectId)||state.projects[0];
const agentById=id=>state.agents.find(a=>a.id===id);
const featureById=id=>project().features.find(f=>f.id===id);
const squad=()=>project().agentIds.map(agentById).filter(Boolean);
const autoPortrait=a=>templatePortrait(a)||rolePortrait(a.role);
const portrait=a=>a.image||autoPortrait(a);
const activeFeature=()=>runner?project().features.find(f=>f.id===runner.featureId):null;
const activeAgent=()=>activeFeature()?.currentAgentId;
const stageMeta=stage=>AGENT_STAGES[stage]||AGENT_STAGES.discovery;
const portraitChoices=()=>[...Object.keys(PORTRAITS).filter(key=>ROLES[key]).map(key=>({key,label:ROLES[key].label,short:ROLES[key].short,src:PORTRAITS[key]})),...AVATARS.map(({key,label})=>({key,label,short:label,src:PORTRAITS[key]}))];
function refreshPortraitPicker(){const preview=$('#editorPortrait'), code=$('.photo-code'), stage=$('.photo-stage'); if(!preview||ui.draft?.kind!=='agent')return; const role=$('#agentRole')?.value||ui.draft.agent.role; const img=ui.draft.agent.image||draftAutoPortrait(); preview.src=img; if(code)code.textContent='IDENTITY // '+ROLES[role].short; if(stage)stage.textContent='STAGE // '+stageMeta($('#agentStage')?.value||ui.draft.agent.productionStage).short; const lp=$('#lookPhoto');if(lp)lp.src=img;const ll=$('#lookPhotoLabel');if(ll)ll.textContent=ui.draft.agent.image?'Galeria':'Automático';}
function save(){if(diskSync.setup)return;const json=JSON.stringify(state);try{localStorage.setItem(STORE,json);storageAvailable=true;}catch(error){if(storageAvailable&&!diskSync.on)toast('Armazenamento cheio ou indisponível. Exporte o workspace antes de fechar.','error');storageAvailable=false;}diskQueue(json);updateStorage();}
function updateStorage(){const el=$('#storageState');if(!el)return;const off=diskSync.on&&diskSync.status==='error';el.innerHTML=!storageAvailable&&(!diskSync.on||off)?'SEM PERSISTÊNCIA <span>/</span> EXPORTE O WORKSPACE':off?`SALVO SÓ NO NAVEGADOR <span>/</span> ${diskSync.error==='token'?'RECARREGUE A PÁGINA':'DISCO INDISPONÍVEL'}`:'';}
// Disk writes (see diskSync): the latest JSON goes out 250 ms after the last save, one request at a time, built on diskSync.rev.
function diskMeta(pending){try{localStorage.setItem(STORE_DISK,JSON.stringify({rev:diskSync.rev,pending}));}catch{}}
function diskQueue(json){if(!diskSync.on||json===diskSync.last)return;diskSync.json=json;diskMeta(true);clearTimeout(diskSync.timer);diskSync.timer=setTimeout(diskFlush,250);}
async function diskFlush(leaving=false){
 clearTimeout(diskSync.timer);diskSync.timer=null;if(diskSync.busy){diskSync.again=true;return;}
 const json=diskSync.json;if(json==null||json===diskSync.last)return;
 diskSync.busy=true;let status=0,conflict=false;
 try{
  if(diskSync.backup){await bridgeFetch('/api/workspace/backups',{method:'POST',body:diskSync.backup});diskSync.backup=null;}
  const res=await fetch(`/api/workspace?base=${encodeURIComponent(diskSync.rev)}${diskSync.force?'&force=1':''}`,{method:'PUT',keepalive:leaving&&json.length<60000,headers:{'content-type':'application/json','x-squad-token':BRIDGE_TOKEN},body:json});
  status=res.status;let body={};try{body=await res.json();}catch{}
  if(status===409)conflict=true;
  else{
   if(!res.ok||body.ok===false)throw Error(body.error||`Bridge respondeu ${status}.`);
   Object.assign(diskSync,{rev:body.rev,savedAt:body.savedAt,path:body.path||diskSync.path,last:json,status:'ok',error:'',force:false});diskMeta(diskSync.json!==json);
   if(diskSync.notice){toast(diskSync.notice);diskSync.notice='';}
  }
 }catch(error){
  const first=diskSync.status!=='error';diskSync.status='error';diskSync.error=status===401?'token':error.message;
  if(first)toast(status===401?'O bridge foi reiniciado: recarregue a página para voltar a salvar no banco local. Até lá, as alterações ficam só neste navegador.':`Não foi possível salvar o workspace no banco local (${error.message}). As alterações ficam neste navegador e vão para o banco quando o bridge voltar.`,'error');
  if(!leaving&&(!status||status>=500))diskSync.timer=setTimeout(diskFlush,10000);
 }finally{diskSync.busy=false;}
 updateStorage();
 if(conflict){diskSync.again=false;return diskConflict(json);}
 if(diskSync.again){diskSync.again=false;diskFlush();}
}
// Another tab or window (or the bridge under another address) saved newer data. During a run this page keeps its data (the disk
// version becomes a saved version); otherwise it takes the saved version and its own last state becomes a saved version.
async function diskConflict(json){
 if(runner){diskSync.force=true;diskSync.notice='Outra aba ou janela salvou este workspace durante a operação. Esta página manteve os dados dela; a outra versão ficou em Versões salvas (Configurações > Workspace).';return diskFlush();}
 diskSync.busy=true;
 try{
  const d=await bridgeFetch('/api/workspace');if(!d.workspace)throw Error(d.error||'O workspace sumiu do banco local.');
  await bridgeFetch('/api/workspace/backups',{method:'POST',body:json}).catch(()=>{});
  adoptDisk(d);toast('Outra aba ou janela salvou este workspace. Carreguei essa versão; a desta página ficou em Versões salvas (Configurações > Workspace). Refaça a última alteração se ela não aparecer.','error');
 }catch(error){diskSync.status='error';diskSync.error=error.message;toast(`Não foi possível salvar o workspace no banco local: ${error.message}`,'error');}
 finally{diskSync.busy=false;updateStorage();}
}
// Takes the disk version as is: it counts as already saved (last), so it is not written back and other tabs stay current.
function adoptDisk(d){
 const next=normalizeWorkspace(d.workspace);migrateCatalogAgents(next);state=next;
 Object.assign(diskSync,{rev:d.rev,savedAt:d.savedAt,status:'ok',error:'',json:null,last:JSON.stringify(state)});
 try{localStorage.setItem(STORE,diskSync.last);}catch{}diskMeta(false);
 if(!agentById(ui.selectedId))ui.selectedId=project().commanderId;if(ui.squadSel&&!squadById(ui.squadSel))ui.squadSel=null;render();
}
// A tab coming back (visible or focused) catches up with what other tabs or windows saved meanwhile, before the person edits there.
async function diskRefresh(){
 const idle=()=>diskSync.on&&diskSync.status!=='error'&&!diskSync.busy&&!diskSync.timer&&(diskSync.json==null||diskSync.json===diskSync.last)&&!runner&&!document.hidden;
 if(!idle())return;
 try{const m=await bridgeFetch('/api/workspace?meta=1');if(!m.exists||m.rev===diskSync.rev||!idle())return;
  const d=await bridgeFetch('/api/workspace');if(!d.workspace||!idle())return;adoptDisk(d);toast('Workspace atualizado com o que foi salvo em outra aba ou janela.');}
 catch{}
}
window.addEventListener('pagehide',()=>{if(diskSync.timer)diskFlush(true);roomFlush(true);chatFlush(true);});
window.addEventListener('focus',diskRefresh);document.addEventListener('visibilitychange',diskRefresh);
function toast(message,type='ok'){const el=document.createElement('div');el.className='toast'+(type==='error'?' error':'');el.innerHTML=icon(type==='error'?'info':'check')+`<span>${E(message)}</span>`;$('#toastRoot').append(el);setTimeout(()=>el.remove(),5500);}
// The transmission strip is a temporary toast: it appears when a new event is logged and fades out after a few seconds (hover keeps it).
let lastTransmission,transmissionTimer=null;
function flashTransmission(strip,latest){
 const key=latest?latest.id:'';if(lastTransmission===undefined){lastTransmission=key;return;}if(key===lastTransmission)return;lastTransmission=key;
 const hide=()=>{if(strip.matches(':hover')){transmissionTimer=setTimeout(hide,1500);return;}strip.classList.remove('show');strip.tabIndex=-1;};
 strip.classList.add('show');strip.tabIndex=0;clearTimeout(transmissionTimer);transmissionTimer=setTimeout(hide,5000);
}
function log(message,type='system',agentId=null,p=project()){p.logs.push({id:id('event'),at:nowISO(),agentId,type,message,simulated:true});if(p.logs.length>500)p.logs.splice(0,p.logs.length-500);}
function recordHandoff(from,to,feature,context,manual=false){project().handoffs.push({id:id('handoff'),at:nowISO(),from,to,featureId:feature.id,context,manual,simulated:true});if(project().handoffs.length>500)project().handoffs.shift();log(`${agentById(from)?.name||'ORIGEM'} > ${agentById(to)?.name||'DESTINO'} / ${feature.key}: ${manual?'handoff configurado':liveMode()?'resultado transferido ao próximo agente':'contexto simulado transferido'}.`,'handoff',from);}
function download(name,content,type='application/json'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function guardMutation(){if(runner){toast('Encerre a simulação antes de alterar o squad ou o plano.','error');return false;}return true;}
function nodeLinks(){
 const p=project(),result=[],known=new Set();const add=(from,to,active=false)=>{if(!from||!to||from===to)return;const key=from+'|'+to;if(known.has(key)){if(active)result.find(l=>l.from===from&&l.to===to).active=true;return;}known.add(key);result.push({from,to,active});};
 if(ui.view==='handoffs'){
  const defaults=['po','architect','backend','frontend','qa'].map(role=>squad().find(a=>a.role===role)?.id).filter(Boolean),chain=[p.commanderId,...defaults].filter(Boolean);
  chain.slice(1).forEach((to,i)=>add(chain[i],to));p.features.forEach(f=>f.route.slice(1).forEach((to,i)=>add(f.route[i],to)));p.handoffs.slice(-12).forEach(h=>add(h.from,h.to));
 }else squad().filter(a=>a.id!==p.commanderId).forEach(a=>add(effectiveLink(a,p),a.id));
 if(runner){const f=activeFeature();if(f)add(f.step>0?f.route[f.step-1]:p.commanderId,f.currentAgentId,!runner.paused);}
 return result;
}
function render(){
 const p=project(),team=squad();if(!team.some(a=>a.id===ui.selectedId))ui.selectedId=p.commanderId||team[0]?.id||null;
 if(resolveSlots(team))save();
 const a=agentById(ui.selectedId);$$('.mode-nav [data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===ui.view));
 document.body.classList.toggle('reduce-motion',!state.settings.motion);document.documentElement.style.setProperty('--route',ui.view==='handoffs'?'#ad85dd':'#30c5e8');
 renderLeft(p,team);renderRight(a,p);renderFooter(p);renderNodes(team);renderOpsChat();
 const home=['home','projects','squads'].includes(ui.view);$('#workspace').classList.toggle('home-mode',home);$$('.left-hud,.right-hud,.bottom-hud,.map-side-controls').forEach(el=>{if(!ui.focus)el.inert=home;});const rh=$('#rightHud'),dismissed=profileDismissed();rh.classList.toggle('dismissed',dismissed);if(!ui.focus)rh.inert=home||dismissed;const hv=$('#homeView');if(hv){hv.hidden=ui.view!=='home';if(ui.view==='home')renderHome();}const pv=$('#projectsView');if(pv){pv.hidden=ui.view!=='projects';if(ui.view==='projects')renderProjectsPage();}const sv=$('#squadsView');if(sv){sv.hidden=ui.view!=='squads';if(ui.view==='squads')renderSquadsPage();else{ui.sqShown=null;const sp=$('#sqPopRoot');if(sp?.innerHTML){sp.innerHTML='';delete opsSig.sqPopRoot;}}}
 MapNetwork.setMode(state.settings.squadView);$$('.view-toggle').forEach(el=>{const v=state.settings.squadView,city=state.settings.cityShape==='planet'?'cidade planeta':'cidade hexagonal',now=v==='office'?'escritório isométrico':city,other=v==='office'?city:'escritório isométrico';el.dataset.view=v;el.setAttribute('aria-label',`Vista: ${now}. Alternar para ${other}`);const tip=el.querySelector('.msc-tip b');if(tip)tip.textContent=`Ver ${other}`;else el.title=`Alternar para ${other} (V)`;});
 $$('.shape-toggle').forEach(el=>{const shape=state.settings.cityShape,planet=shape==='planet',on=state.settings.squadView!=='office'&&!$('#mapViewport').classList.contains('no-webgl');el.classList.toggle('off',!on);el.disabled=!on;el.setAttribute('aria-pressed',String(planet));el.setAttribute('aria-label',planet?'Cidade em forma de planeta. Desdobrar em cidade plana':'Cidade plana. Dobrar em planeta');const tip=el.querySelector('.msc-tip b');if(tip)tip.textContent=planet?'Desdobrar cidade':'Dobrar em planeta';if(el.dataset.shape&&el.dataset.shape!==shape){el.classList.remove('folding','unfolding');void el.offsetWidth;el.classList.add(planet?'folding':'unfolding');}el.dataset.shape=shape;});
 MapNetwork.set({running:{id:activeAgent()||'',paused:!!runner?.paused,phase:runner?.phase||''},ops:officeMark(officeOps()),agents:team,links:nodeLinks(),selected:profileDismissed()?'':ui.selectedId,handoffMode:ui.view==='handoffs',paused:['home','projects','squads'].includes(ui.view),cityShape:state.settings.cityShape,mapQuality:state.settings.mapQuality,motion:state.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches});updateStorage();roomChrome();
}
function renderLeft(p,team){
 $('#leftHud').innerHTML=`<div class="project-topline"><span>${E(p.code)} / WORKSPACE</span>${icon('radio')}</div>${ui.view==='handoffs'?'<h1>FLUXO DE<br><span>HANDOFFS.</span></h1>':''}<button class="project-chip" data-action="projects" title="Trocar ou criar projeto">${icon('project')}<span class="grow"><strong>${E(p.name)}</strong><small>${team.length} AGENTES / ${p.features.length} FEATURES</small></span>${icon('chevron')}</button><div class="squad-head"><span>${E(squadById(p.squadId)?.name||'SQUAD')}</span><span>${pad(team.length)}</span></div><div class="roster">${team.map(a=>`<button class="roster-item ${isShownSelected(a.id)?'selected':''}" data-action="select-agent" data-id="${E(a.id)}" aria-label="Selecionar ${E(a.name)}"${ui.view==='network'?' title="Duplo clique para conversar"':''} aria-pressed="${isShownSelected(a.id)}"><img class="roster-avatar" src="${portrait(a)}" alt=""><div><div class="roster-name">${E(a.name)}</div><div class="roster-role">${E(roleLabel(a))}</div></div><div class="roster-end ${activeAgent()===a.id?'busy':''}">${activeAgent()===a.id?'<i class="dot"></i>':icon(agentIcon(a))}<span class="role-short">${roleShort(a)}</span></div></button>`).join('')||'<div class="mission-empty">Monte a squad desta operação no Squad Studio.</div>'}</div><div class="roster-add"><button data-action="agent-new">${icon('plus')} NOVO AGENTE</button><button data-action="briefing">${icon('file')} BRIEFING</button><button data-action="squad-studio">${icon('squad')} SQUAD STUDIO</button></div>`;
}
function renderRight(a,p){
 if(!a){$('#rightHud').innerHTML=`<div class="section-cap"><span>ESTÚDIO DO AGENTE</span></div><p class="agent-description">Adicione um especialista e associe ao projeto para iniciar sua rede.</p><button class="primary-action" data-action="agent-new">CRIAR AGENTE ${icon('plus')}</button>`;return;}
 const busy=activeAgent()===a.id,f=activeFeature(),assigned=p.features.filter(f=>f.route.includes(a.id)&&f.status!=='done'),cs=currentSprint(p),hasPlan=(cs?sprintFeatures(cs,p):p.features).some(f=>['ready','blocked'].includes(f.status));
 $('#rightHud').innerHTML=`<div class="section-cap"><span>PERFIL DO AGENTE</span><button class="icon-button small" data-action="agent-edit" data-id="${E(a.id)}" aria-label="Editar agente">${icon('edit')}</button></div><div class="identity"><div class="identity-portrait"><img src="${portrait(a)}" alt="Retrato de ${E(a.name)}"></div><div class="grow"><div class="identity-name">${E(a.name)}</div><span class="identity-role">${E(roleLabel(a))}</span><div class="identity-id">${roleShort(a)} // ${pad(state.agents.indexOf(a)+1)} / AGENT</div></div></div><p class="agent-description">${E(a.description)}</p><dl>${(()=>{const x=agentEffort(a),mo=agentModelOf(a),g=!!mo.global,pf=agentProfile(a);return`${profilesOn()?`<div class="data-pair"><dt>PERFIL</dt><dd>${E(pf.name.toUpperCase())}${forcedProfile()?' · FORÇADO':''}</dd></div>`:''}<div class="data-pair"><dt>MODELO</dt><dd>${mo.adapter==='codex'?'CODEX':'CLAUDE'} / ${E(modelLabel(mo.model||pf.model||(mo.adapter==='claude'?a.model:'')))}${g?' · GLOBAL':''}</dd></div><div class="data-pair"><dt>ESFORÇO</dt><dd>${x.source==='none'?'N/A':x.effort?E(x.effort.toUpperCase())+(x.source==='global'?' · GLOBAL':''):'PADRÃO'}</dd></div>`;})()}<div class="data-pair ${busy?'active':''}"><dt>ESTADO</dt><dd>${busy?(runner.paused?(runner.inFlight?'PAUSANDO APÓS A ETAPA':'OPERAÇÃO PAUSADA'):(liveMode()?'EXECUTANDO CLAUDE CODE':'EXECUTANDO DEMO')):'EM PRONTIDÃO'}</dd></div><div class="data-pair"><dt>FEATURES ATRIBUÍDAS</dt><dd>${pad(assigned.length)}</dd></div><div class="data-pair"><dt>PRODUÇÃO DO AGENTE</dt><dd>${E(stageMeta(a.productionStage).label.toUpperCase())}</dd></div></dl><div class="tool-tags">${a.tools.map(t=>`<span class="tag">${E(t.toUpperCase())}</span>`).join('')}</div><div class="profile-actions"><button class="action-text" data-action="squad-studio">${icon('squad')} SQUADS</button><button class="action-text" data-action="spawn" data-id="${E(a.id)}" title="Spawn individual${liveMode()?' (claude -p)':' (demo)'}" aria-label="Spawn individual">${icon('play')}</button></div><section class="mission-block"><div class="between"><div class="eyebrow">${busy?'MISSÃO ATUAL':'PRÓXIMA ATRIBUIÇÃO'}</div><button class="icon-button small" data-action="features" aria-label="Ver todas as features">${icon('board')}</button></div>${busy?`<h3 class="mission-title">${E(f.key)} / ${E(f.title)}</h3><div class="mission-sub">ETAPA ${f.step+1} DE ${f.route.length} <span class="cyan">//</span> ${liveMode()?'CLAUDE -P':'SIMULAÇÃO'}</div>`:assigned.length?`<h3 class="mission-title">${E(assigned[0].key)} / ${E(assigned[0].title)}</h3><div class="mission-sub">${E(STATUS[assigned[0].status].toUpperCase())} // ${E(assigned[0].priority)}</div>`:`<div class="mission-empty">${icon('clock')}Aguardando distribuição.<br>O comandante define o plano do squad.</div>`}</section><button class="primary-action" data-action="distribute" ${runner?'disabled':''}>DISTRIBUIR FEATURES ${icon('flow')}</button><button class="secondary-action ${runner?'run-active':''}" data-action="run">${runner?runControl().label.toUpperCase():`${hasPlan?'INICIAR':'PLANEJAR'} ${E((cs?.name||'sprint').toUpperCase())} / ${liveMode()?'CLAUDE':'DEMO'}`} ${icon(runner?runControl().icon:'play')}</button>${runner?'<button class="secondary-action" data-action="stop">'+(liveMode()?'ENCERRAR OPERAÇÃO ':'ENCERRAR DEMO ')+icon('stop')+'</button>':''}${runner||roomOf().messages.length?'<button class="secondary-action" data-action="room">CHAT DA OPERAÇÃO '+icon('chat')+'</button>':''}${ui.consoles.length?'<button class="secondary-action" data-action="console">CONSOLE AO VIVO '+icon('terminal')+'</button>':''}${liveMode()?'':'<div class="demo-note">SIMULAÇÃO LOCAL. SEM EXECUÇÃO DE IA.</div>'}`;
}
function renderNodes(team){const office=state.settings.squadView==='office',f=office?activeFeature():null;$('#mapNodes').innerHTML=team.map((a,i)=>`<button class="map-node ${isShownSelected(a.id)?'selected':''} ${activeAgent()===a.id?'running':''}${deliveredIn(f,a.id)?' delivered':''}" data-action="select-agent" data-id="${E(a.id)}" data-node="${E(a.id)}" aria-label="${E(a.name)}, ${E(roleLabel(a))}" title="${E(a.name)} / Clique para ver as ações (conversar, deslocar ou editar). Duplo clique para conversar. Arraste para mover."><span class="node-diamond"></span><span class="node-icon">${icon(agentIcon(a))}</span>${deliveredIn(f,a.id)?`<span class="node-check" title="Entregou nesta feature">${icon('check')}</span>`:''}<span class="node-index">N.${pad(i+1)}</span><span class="node-caption"><strong>${E(a.name)}</strong><small>${E(isShownSelected(a.id)?roleLabel(a):roleShort(a)+' / '+(activeAgent()===a.id?runTag():'READY'))}${isShownSelected(a.id)?agentProfileChip(a,'sm'):''}</small></span></button>`).join('')+(office?team.map(agentCardHTML).join(''):'')+nodeActionsHTML(team);}
// Quick actions of the selected agent in the Squad view: two gray bubbles beside its marker (MapNetwork pins [data-pin]).
// They appear once the agent is clicked (ui.actionsFor), not for the default selection; the pop plays only when they change.
function nodeActionsHTML(team){const a=ui.view==='network'?team.find(x=>x.id===ui.actionsFor&&isShownSelected(x.id)):null,pop=!!a&&ui.actionsShown!==a.id;ui.actionsShown=a?.id||null;if(!a)return'';const n=E(a.name),id=E(a.id);return`<div class="node-actions${pop?' pop':''}" data-pin="${id}"><button type="button" class="node-bubble chat" data-action="agent-chat" data-id="${id}" title="Conversar com ${n}" aria-label="Conversar com ${n}">${icon('phone')}<span>CONVERSAR</span></button><button type="button" class="node-bubble move" data-action="agent-move" data-id="${id}" title="Deslocar ${n}" aria-label="Deslocar ${n}">${icon('move')}<span>DESLOCAR</span></button><button type="button" class="node-bubble edit" data-action="agent-edit" data-id="${id}" title="Editar ${n}" aria-label="Editar ${n}">${icon('edit')}<span>EDITAR</span></button></div>`;}
// Office view: an always-visible card per agent (photo, name, role); MapNetwork lays them out without overlap.
function agentCardHTML(a){const sel=isShownSelected(a.id),run=activeAgent()===a.id;return`<span class="card-leader ${sel?'selected':''}" data-leader="${E(a.id)}"></span><button class="agent-card ${sel?'selected':''} ${run?'running':''}" data-action="select-agent" data-id="${E(a.id)}" data-card="${E(a.id)}" aria-label="${E(a.name)}, ${E(roleLabel(a))}" title="${E(a.name)} / Clique para ver as ações (conversar, deslocar ou editar). Duplo clique para conversar. Arraste para mover."><img src="${portrait(a)}" alt=""><span class="agent-card-text"><strong>${E(a.name)}</strong><small>${agentProfileChip(a,'sm')}${E(roleLabel(a))}</small></span>${run?'<i class="dot"></i>':''}</button>`;}
function renderFooter(p){
 const done=p.features.filter(f=>f.status==='done').length,review=p.features.filter(f=>f.status==='review').length,percent=p.features.length?Math.round(done/p.features.length*100):0;
 $('#operationProgress').innerHTML=`<div class="progress-caption"><span>PROGRESSO DA OPERAÇÃO</span><strong>${percent}%</strong></div><div class="progress-rail"><span style="width:${percent}%"></span></div><div class="progress-steps">${p.features.slice(0,8).map(f=>`<button class="progress-step ${f.status}" data-action="feature-open" data-id="${E(f.id)}" aria-label="${E(f.title)}: ${E(STATUS[f.status])}" title="${E(f.title)} / ${E(STATUS[f.status])}">${icon(f.status==='done'?'check':f.status==='review'?'eye':f.scope==='backend'?'code':'file')}</button>`).join('')}</div><div class="progress-meta">${pad(done)} / ${pad(p.features.length)} CONCLUÍDAS ${review?' / '+pad(review)+' EM REVISÃO':''}</div>`;
 const latest=p.logs.at(-1),strip=$('#transmissionStrip');strip.classList.toggle('busy',!!runner);flashTransmission(strip,latest);strip.innerHTML=`${icon('radio')}<div class="grow"><strong>${runner?(runner.paused?'TRANSMISSÃO PAUSADA':liveMode()?'CANAL ATIVO / CLAUDE CODE':'CANAL ATIVO / SIMULAÇÃO'):'REGISTRO DE TRANSMISSÕES'}</strong><span>${E(latest?.message||'Nenhum evento registrado.')}</span></div>`;
}
function rollCodename(button){
 const input=$('#agentName');if(!input)return;const current=input.value.trim().toUpperCase();
 const pool=CODENAMES.filter(n=>n!==current&&!codenameTaken(n,ui.draft?.agent.id));
 if(!pool.length)return toast('Todos os codinomes da lista já estão em uso.','error');
 input.value=pool[Math.floor(Math.random()*pool.length)];input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
 button.classList.remove('rolling');void button.offsetWidth;button.classList.add('rolling');
}
// A click on an empty map spot clears the selection: the profile panel hides and nothing is highlighted until an agent is picked again.
const profileDismissed=()=>!!ui.selectedId&&ui.dismissedId===ui.selectedId;
const isShownSelected=id=>id===ui.selectedId&&!profileDismissed();
function selectAgent(id){if(!agentById(id))return;ui.selectedId=id;ui.dismissedId=null;render();}
function closeModal(){if(ui.modal==='db-setup'&&diskSync.setup)return;if(ui.modal==='feature')featureChatStop(true);if(ui.modal==='agent-chat')agentChatStop(true);if(ui.modal==='teams'){docChatStop(true);teamsPowerOff();}const focus=ui.returnFocus;$('#modalRoot').innerHTML='';ui.modal=null;ui.draft=null;ui.pendingPlan=null;ui.confirm=null;if(focus?.isConnected)focus.focus({preventScroll:true});}
function showModal(title,subtitle,body,footer='',size='',kind='other'){
 if(ui.modal==='feature'&&kind!=='feature')featureChatStop(true);if(ui.modal==='agent-chat'&&kind!=='agent-chat')agentChatStop(true);if(ui.modal==='teams'&&kind!=='teams')docChatStop(true);
 if(!ui.modal)ui.returnFocus=document.activeElement;ui.modal=kind;
 $('#modalRoot').innerHTML=`<div class="overlay"><section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><header class="modal-header"><div><div class="eyebrow">${E(subtitle)}</div><h2 id="dialogTitle">${title}</h2></div><button class="icon-button" data-action="modal-close" aria-label="Fechar janela">${icon('close')}</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
 requestAnimationFrame(()=>{const target=$('[autofocus]',$('#modalRoot'))||$('.modal-body input:not([type=checkbox]):not([type=file]),.modal-body select,.modal-body button',$('#modalRoot'))||$('.modal-header button');target?.focus({preventScroll:true});});
}
const cancelButton='<button class="btn ghost" data-action="modal-close">Cancelar</button>';
function confirmAction(title,message,fn,label='Confirmar',danger=false){showModal(E(title),'CONFIRMAÇÃO DO OPERADOR',`<p class="confirm-copy">${E(message)}</p>`,cancelButton+`<button class="btn ${danger?'danger':'primary'}" data-action="confirm">${E(label)}</button>`,'narrow','confirm');ui.confirm=fn;}
function emptyPanel(title,message,action='',label=''){return`<div class="empty-panel">${icon('radio')}<h3>${E(title)}</h3><p>${E(message)}</p>${action?`<button class="btn primary" data-action="${action}">${E(label)}</button>`:''}</div>`;}

/* Agent studio: all tabs are part of the same form, só changing tabs preserves input. */
/* Conventions & best practices (AVANÇADO tab). Catalog lives in conventions.js; an agent's guide = base + subsets,
   appended to its instructions on every run (agentSystemPrompt). */
function conventionFamilyOf(a){
 const r=a?.role,t=`${a?.specialty||''} ${a?.icon||''}`.toLowerCase();
 if(r==='commander')return'commander';if(r==='architect')return'adr';if(r==='po')return'prd';if(r==='pm')return'pm';
 if(['backend','dba'].includes(r)){const sp=String(a?.specialty||'').trim().toLowerCase(),src=sp||String(a?.icon||'');if(/supabase/.test(src))return'supabase';if(/firebase|firestore/.test(src))return'firebase';}
 if(['node','java','dotnet','react','angular'].includes(r))return r;
 if(r==='backend'){if(/node/.test(t))return'node';if(/python|fastapi|django/.test(t))return'python';if(/\bgo\b|golang/.test(t))return'go';if(/php|laravel|symfony/.test(t))return'php';if(/java|spring/.test(t))return'java';if(/c#|\.net|csharp|dotnet/.test(t))return'dotnet';return'backend';}
 if(r==='frontend'){if(/vue|nuxt/.test(t))return'vue';if(/next/.test(t))return'next';if(/react/.test(t))return'react';if(/angular/.test(t))return'angular';if(/html|vanilla|\bjs\b/.test(t))return'vanilla';return'frontend';}
 return({dba:'dba',devops:'devops',qa:'qa',mobile:'mobile',security:'security',data:'data',designer:'design',docs:'docs'})[r]||'general';
}
// Coding style of an agent: the style-* subsets of its stack (CONV_STYLE_SUGGEST by family, refined by the specialty).
function codeStyleKeys(a){
 const fam=conventionFamilyOf(a),t=`${a?.specialty||''} ${a?.icon||''}`.toLowerCase();
 if(fam==='mobile')return /flutter|dart/.test(t)?['style-dart']:/react/.test(t)?['style-ts']:/swift|ios/.test(t)?['style-swift']:/kotlin|android/.test(t)?['style-kotlin']:[];
 if(fam==='dba')return /mongo/.test(t)?['style-js']:/redis/.test(t)?[]:['style-sql'];
 if(fam==='devops')return /terraform|iac/.test(t)?['style-hcl','style-shell']:/docker|kubernetes|ci\/cd|\bgit\b/.test(t)?['style-yaml','style-shell']:['style-shell'];
 if(fam==='qa'&&/acessib|a11y|\beye\b/.test(t))return[];
 if(fam==='data')return /kafka|stream/.test(t)?[]:/analytics|\bbi\b/.test(t)?['style-sql']:['style-sql','style-python'];
 return[...(CONV_STYLE_SUGGEST[fam]||[])];
}
function convTemplateOf(family,key){return CONVENTION_FAMILIES[family]?.templates.find(t=>t.key===key);}
function convSubsetOf(key){return CONVENTION_SUBSETS.find(s=>s.key===key);}
function defaultConventionTemplate(family,a){const fam=CONVENTION_FAMILIES[family]||CONVENTION_FAMILIES.general,t=`${a?.specialty||''} ${a?.icon||''} ${a?.name||''}`;return fam.templates.find(x=>x.hint&&x.hint.test(t))||fam.templates[0];}
function defaultConventions(a,preset){
 const family=conventionFamilyOf(a),tpl=(preset?.template&&convTemplateOf(family,preset.template))||defaultConventionTemplate(family,a);
 const keys=[...new Set([...codeStyleKeys(a),...(preset?.subsets||[])])];
 return{family,template:tpl.key,base:tpl.content,subsets:keys.map(convSubsetOf).filter(Boolean).map(s=>({id:id('conv'),name:s.name,content:s.content,source:'builtin:'+s.key}))};
}
function conventionsMarkdown(c){if(!c)return'';const parts=[];if(c.base?.trim())parts.push(c.base.trim());for(const s of c.subsets||[])if(s.content?.trim())parts.push(`## ${s.name||'Subset'}\n${s.content.trim()}`);return parts.join('\n\n');}
const CONV_HEADER='# Convenções e boas práticas (obrigatório)\nSiga este guia em todo código, nome, estrutura, teste e entrega desta etapa. Se o repositório já tiver um padrão diferente, siga o padrão do repositório e registre a divergência na entrega.';
function agentSystemPrompt(a){const g=conventionsMarkdown(a?.conventions),base=String(a?.prompt||'').trim();return(g?`${base}\n\n${CONV_HEADER}\n\n${g}`:base).slice(0,99000);}
function conventionLabel(a){
 const c=a?.conventions||defaultConventions(a);if(!c)return'';
 const lib=c.template?.startsWith('lib:')?state.conventionLibrary.templates.find(t=>'lib:'+t.id===c.template):null,t=lib||convTemplateOf(c.family,c.template),n=(c.subsets||[]).length;
 return(t?t.name+(t.content!==c.base?' (editado)':''):(c.base?.trim()?'Personalizado':'Sem guia'))+(n?` + ${n} subset${n>1?'s':''}`:'');
}
/* Tiny, escape-first Markdown renderer for the preview (headings, lists, checkboxes, bold/italic, inline and fenced code). */
function renderMarkdown(src){
 const out=[];let list=null,code=null,para=[];
 const inline=t=>E(t).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g,'$1<em>$2</em>');
 const flushP=()=>{if(para.length){out.push(`<p>${inline(para.join(' '))}</p>`);para=[];}},flushL=()=>{if(list){out.push(`<${list.tag}>${list.items.map(i=>`<li>${i}</li>`).join('')}</${list.tag}>`);list=null;}};
 for(const line of String(src||'').split('\n')){
  if(code){if(/^\s*```/.test(line)){out.push(`<pre><code>${E(code.join('\n'))}</code></pre>`);code=null;}else code.push(line);continue;}
  if(/^\s*```/.test(line)){flushP();flushL();code=[];continue;}
  const h=line.match(/^(#{1,4})\s+(.+)/);if(h){flushP();flushL();const n=Math.min(6,h[1].length+2);out.push(`<h${n}>${inline(h[2])}</h${n}>`);continue;}
  const ck=line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)/),ul=line.match(/^\s*[-*]\s+(.*)/),ol=line.match(/^\s*\d+[.)]\s+(.*)/);
  if(ck||ul||ol){flushP();const tag=ol&&!ul?'ol':'ul';if(!list||list.tag!==tag){flushL();list={tag,items:[]};}list.items.push(ck?`<span class="md-check">${ck[1].trim()?'☑':'☐'}</span> ${inline(ck[2])}`:inline((ul||ol)[1]));continue;}
  if(!line.trim()){flushP();flushL();continue;}
  flushL();para.push(line.trim());
 }
 if(code)out.push(`<pre><code>${E(code.join('\n'))}</code></pre>`);flushP();flushL();return out.join('');
}
function conventionsPaneHTML(a){
 const c=a.conventions||defaultConventions(a),fam=CONVENTION_FAMILIES[c.family]?c.family:conventionFamilyOf(a);
 return`<div class="editor-pane hidden" data-pane="advanced"><div class="conv-head"><div><div class="eyebrow">DIRETRIZES DO AGENTE</div><p class="hint">Convenções e boas práticas em Markdown que o agente segue sempre que é executado: nomenclatura, formatação, padrões de projeto, testes e entregas. São anexadas às instruções enviadas ao Claude Code em toda etapa.</p></div><span class="tag accent" id="convFamilyLabel">${E((CONVENTION_FAMILIES[fam]?.label||'').toUpperCase())}</span></div><input type="hidden" id="convFamily" name="convFamily" value="${fam}"><input type="hidden" id="convTemplate" name="convTemplate" value="${E(c.template||'')}"><div class="field conv-tpl-field"><label for="convTemplateSelect">TEMPLATE BASE</label><div class="conv-tpl-row"><select id="convTemplateSelect" aria-describedby="convTplSummary"></select><button type="button" class="icon-button small" id="convLibDel" data-action="conv-lib-del-template" data-id="" hidden title="Excluir da biblioteca" aria-label="Excluir template da biblioteca">${icon('trash')}</button></div><span class="hint" id="convTplSummary"></span></div><div class="conv-undo" id="convUndo" hidden>${icon('check')}<span id="convUndoText">Template aplicado.</span><button type="button" class="link-button" data-action="conv-undo">DESFAZER</button></div><div class="field"><label for="convBase">GUIA BASE (MARKDOWN)</label><textarea id="convBase" name="convBase" class="code conv-base" maxlength="20000" spellcheck="false">${E(c.base||'')}</textarea></div><div class="conv-save"><input id="convTplName" maxlength="60" placeholder="Nome do template na biblioteca" aria-label="Nome do template"><button type="button" class="btn ghost sm" data-action="conv-save-template">${icon('upload')}Salvar como template</button></div><div class="conv-sub-head"><div><div class="eyebrow">SUBSETS</div><span class="hint">Blocos de regras extras anexados depois do guia base. Cada bloco pode ser editado, salvo na biblioteca ou removido.</span></div><button type="button" class="btn ghost sm" data-action="conv-add-toggle" id="convAddBtn" aria-expanded="false">${icon('search')}Adicionar subset</button></div><div class="conv-picker" id="convPicker" hidden></div><div class="conv-subsets" id="convSubsets">${(c.subsets||[]).map(convSubsetHTML).join('')}</div><details class="conv-preview"><summary>PRÉ-VISUALIZAÇÃO FINAL <span id="convCount"></span></summary><div class="conv-md" id="convPreview"></div></details></div>`;
}
// Template dropdown: only the agent's own type (3-5 options) plus same-type templates from the library.
function convTemplateContent(fam,key){if(!key)return undefined;if(key.startsWith('lib:'))return state.conventionLibrary.templates.find(t=>'lib:'+t.id===key)?.content;return convTemplateOf(fam,key)?.content;}
function convTemplateSummary(fam,key){if(key?.startsWith('lib:')){const t=state.conventionLibrary.templates.find(x=>'lib:'+x.id===key);return t?`Da sua biblioteca · salvo em ${new Date(t.createdAt).toLocaleDateString('pt-BR')}`:'';}return convTemplateOf(fam,key)?.summary||'';}
function refreshConvTemplates(){
 const sel=$('#convTemplateSelect');if(!sel)return;
 const fam=$('#convFamily')?.value||'general',key=$('#convTemplate')?.value||'',base=$('#convBase')?.value??'',f=CONVENTION_FAMILIES[fam]||CONVENTION_FAMILIES.general,lib=state.conventionLibrary.templates.filter(t=>t.family===fam);
 const content=convTemplateContent(fam,key),edited=content===undefined||content!==base;
 sel.innerHTML=`${edited?`<option value="__custom" selected>${base.trim()?'Personalizado (editado)':'Sem guia base'}</option>`:''}<optgroup label="${E(f.label)}">${f.templates.map(t=>`<option value="${E(t.key)}" ${!edited&&t.key===key?'selected':''}>${E(t.name)}</option>`).join('')}</optgroup>${lib.length?`<optgroup label="Minha biblioteca">${lib.map(t=>`<option value="lib:${E(t.id)}" ${!edited&&'lib:'+t.id===key?'selected':''}>${E(t.name)}</option>`).join('')}</optgroup>`:''}`;
 const sum=$('#convTplSummary');if(sum)sum.textContent=edited?(content!==undefined?`Baseado em "${sel.querySelector(`option[value="${CSS.escape(key)}"]`)?.textContent||''}" com alterações suas.`:'Guia escrito por você.'):convTemplateSummary(fam,key);
 const del=$('#convLibDel');if(del){const libSel=!edited&&key.startsWith('lib:');del.hidden=!libSel;del.dataset.id=libSel?key.slice(4):'';}
 const lbl=$('#convFamilyLabel');if(lbl)lbl.textContent=(f.label||'').toUpperCase();
}
function convApplyValue(value){
 const base=$('#convBase');if(!base||!value||value==='__custom')return;const fam=$('#convFamily')?.value||'general',content=convTemplateContent(fam,value);if(content===undefined)return;
 if(ui.draft)ui.draft.convUndo={base:base.value,template:$('#convTemplate').value};
 base.value=content;$('#convTemplate').value=value;refreshConvTemplates();
 const u=$('#convUndo');if(u){u.hidden=false;$('#convUndoText').textContent=`Template "${$('#convTemplateSelect').selectedOptions[0]?.textContent||''}" aplicado ao guia base.`;}updateConvPreview();
}
// The guide follows the agent's type: when role/specialty change, the family is re-derived (an untouched catalog text is swapped).
function syncConvFamily(){
 const famEl=$('#convFamily'),base=$('#convBase');if(!famEl||!base)return;
 const who={role:$('#agentRole')?.value,specialty:$('#agentSpecialty')?.value||'',icon:$('#agentIcon')?.value||'',name:$('#agentName')?.value||''},nf=conventionFamilyOf(who);if(nf===famEl.value)return;
 const untouched=!base.value.trim()||(CONVENTION_FAMILIES[famEl.value]?.templates||[]).some(t=>t.content===base.value);famEl.value=nf;
 if(untouched){const t=defaultConventionTemplate(nf,who);base.value=t.content;$('#convTemplate').value=t.key;}
 refreshConvTemplates();refreshConvPicker();updateConvPreview();
}
function convSubsetIcon(src){if(String(src).startsWith('builtin:'))return convSubsetOf(src.slice(8))?.icon||'layers';return String(src).startsWith('lib:')?'star':'edit';}
function convSubsetHTML(s){return`<div class="conv-subset"><input type="hidden" name="convSubId" value="${E(s.id||id('conv'))}"><input type="hidden" name="convSubSource" value="${E(s.source||'custom')}"><div class="conv-subset-head"><span class="conv-subset-icon">${icon(convSubsetIcon(s.source||'custom'))}</span><input name="convSubName" value="${E(s.name||'')}" maxlength="60" placeholder="Nome do subset" aria-label="Nome do subset"><button type="button" class="icon-button small" data-action="conv-sub-save" title="Salvar na biblioteca" aria-label="Salvar subset na biblioteca">${icon('upload')}</button><button type="button" class="icon-button small" data-action="conv-sub-remove" title="Remover subset" aria-label="Remover subset">${icon('trash')}</button></div><textarea name="convSubContent" class="code conv-sub-content" maxlength="8000" spellcheck="false" placeholder="- Regra 1&#10;- Regra 2">${E(s.content||'')}</textarea></div>`;}
/* Subset search menu: search by theme (groups with icons), keyboard navigation, library and blank subset. */
let convTheme='',convCursor=0,convFlat=[];
const convNorm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function convPickerHTML(){
 const lib=state.conventionLibrary.subsets.length;
 return`<div class="conv-search"><span class="conv-search-field">${icon('search')}<input id="convSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Pesquise por tema: testes, segurança, git, acessibilidade..." aria-label="Pesquisar subsets por tema" aria-controls="convResults"></span><div class="conv-themes" role="group" aria-label="Temas">${CONVENTION_GROUPS.map(g=>`<button type="button" class="conv-theme" data-action="conv-theme" data-group="${E(g.key)}" aria-pressed="false">${icon(g.icon)}${E(g.label)}</button>`).join('')}${lib?`<button type="button" class="conv-theme" data-action="conv-theme" data-group="lib" aria-pressed="false">${icon('star')}Minha biblioteca</button>`:''}</div><div class="conv-results" id="convResults" role="listbox" aria-label="Subsets"></div></div>`;
}
function convSearchSections(){
 const fam=$('#convFamily')?.value||'general',suggest=CONVENTION_FAMILIES[fam]?.suggest||[],q=convNorm($('#convSearch')?.value||'').trim(),words=q.split(/\s+/).filter(Boolean);
 const groupLabel=k=>CONVENTION_GROUPS.find(g=>g.key===k)?.label||'';
 const match=(s,g)=>{if(convTheme&&g!==convTheme)return false;if(!words.length)return true;const hay=convNorm(`${s.name} ${s.desc||''} ${s.tags||''} ${groupLabel(g)}`);return words.every(w=>hay.includes(w));};
 const sections=[];
 if(!words.length&&!convTheme&&suggest.length)sections.push({key:'suggest',label:'Sugeridos para este agente',icon:'sparkle',items:suggest.map(convSubsetOf).filter(Boolean).map(s=>({s,src:'builtin:'+s.key}))});
 for(const g of CONVENTION_GROUPS){const items=CONVENTION_SUBSETS.filter(s=>s.group===g.key&&match(s,g.key)).map(s=>({s,src:'builtin:'+s.key}));if(items.length)sections.push({key:g.key,label:g.label,icon:g.icon,items});}
 const lib=state.conventionLibrary.subsets.filter(s=>match({name:s.name,desc:s.content.slice(0,400),tags:'minha biblioteca'},'lib'));
 if(lib.length)sections.push({key:'lib',label:'Minha biblioteca',icon:'star',items:lib.map(s=>({s:{...s,icon:'star',desc:s.content.replace(/\s+/g,' ').slice(0,90)},src:'lib:'+s.id,lib:true}))});
 return sections;
}
function renderConvResults(){
 const box=$('#convResults');if(!box)return;const sections=convSearchSections(),used=new Set($$('#convSubsets [name=convSubSource]').map(i=>i.value)),flat=[];
 const row=it=>{const u=used.has(it.src),idx=u?-1:flat.push(it.src)-1;return`<div class="conv-row ${u?'used':''}" ${u?'':`data-ci="${idx}"`}><button type="button" data-action="conv-add-subset" data-src="${E(it.src)}" ${u?'disabled':''} role="option"><span class="conv-row-icon">${icon(it.s.icon||'layers')}</span><span class="conv-row-text"><strong>${E(it.s.name)}</strong><small>${E(u?'Já adicionado a este agente':it.s.desc||'')}</small></span>${icon(u?'check':'plus')}</button>${it.lib?`<button type="button" class="conv-row-del" data-action="conv-lib-del-subset" data-id="${E(it.s.id)}" title="Excluir da biblioteca" aria-label="Excluir ${E(it.s.name)} da biblioteca">${icon('trash')}</button>`:''}</div>`;};
 box.innerHTML=sections.map(sec=>`<div class="conv-rgroup"><div class="conv-rhead">${icon(sec.icon)}<span>${E(sec.label)}</span><em>${pad(sec.items.length)}</em></div>${sec.items.map(row).join('')}</div>`).join('')+(sections.length?'':'<p class="hint conv-empty">Nenhum subset encontrado para esse tema.</p>')+`<div class="conv-rgroup"><div class="conv-row" data-ci="${flat.push('custom')-1}"><button type="button" data-action="conv-add-subset" data-src="custom" role="option"><span class="conv-row-icon">${icon('edit')}</span><span class="conv-row-text"><strong>Subset em branco</strong><small>Escreva suas próprias regras.</small></span>${icon('plus')}</button></div></div>`;
 convFlat=flat;convCursor=Math.max(0,Math.min(convCursor,flat.length-1));markConvCursor();
 $$('.conv-theme').forEach(b=>{const on=b.dataset.group===convTheme;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}
function markConvCursor(){$$('#convResults .conv-row').forEach(r=>r.classList.toggle('active',Number(r.dataset.ci)===convCursor&&r.dataset.ci!==undefined));$('#convResults .conv-row.active')?.scrollIntoView({block:'nearest'});}
function toggleConvPicker(force){
 const pk=$('#convPicker'),btn=$('#convAddBtn');if(!pk)return;const open=force??pk.hidden;pk.hidden=!open;btn?.setAttribute('aria-expanded',String(open));
 if(open){convTheme='';convCursor=0;pk.innerHTML=convPickerHTML();renderConvResults();$('#convSearch')?.focus({preventScroll:true});pk.scrollIntoView({block:'nearest',behavior:reducedMotionOn()?'auto':'smooth'});}
}
function refreshConvPicker(){const p=$('#convPicker');if(p&&!p.hidden)renderConvResults();}
function convSaveTemplate(){
 const content=($('#convBase')?.value||'').trim(),lib=state.conventionLibrary.templates;if(!content)return toast('O guia base está vazio.','error');if(lib.length>=60)return toast('Limite de 60 templates na biblioteca.','error');
 const t={id:id('ctpl'),name:(($('#convTplName').value||'').trim()||`Guia de ${($('#agentName')?.value||'agente').trim().toUpperCase()||'AGENTE'}`).slice(0,60),family:$('#convFamily')?.value||'general',content:content.slice(0,20000),createdAt:nowISO()};
 lib.push(t);$('#convBase').value=content;$('#convTemplate').value='lib:'+t.id;$('#convTplName').value='';save();refreshConvTemplates();toast(`Template "${t.name}" salvo na biblioteca.`);
}
function convAddSubset(src){
 const box=$('#convSubsets');if(!box)return;if(box.querySelectorAll('.conv-subset').length>=20)return toast('Limite de 20 subsets por agente.','error');let s;
 if(src.startsWith('builtin:')){const b=convSubsetOf(src.slice(8));if(!b)return;s={name:b.name,content:b.content,source:src};}
 else if(src.startsWith('lib:')){const l=state.conventionLibrary.subsets.find(x=>x.id===src.slice(4));if(!l)return;s={name:l.name,content:l.content,source:src};}
 else s={name:'',content:'',source:'custom'};
 box.insertAdjacentHTML('beforeend',convSubsetHTML({...s,id:id('conv')}));const el=box.lastElementChild;el.classList.add('fresh');toggleConvPicker(false);
 (src==='custom'?el.querySelector('[name=convSubName]'):el.querySelector('textarea')).focus();el.scrollIntoView({block:'nearest'});updateConvPreview();
}
function convSaveSubset(control){
 const block=control.closest('.conv-subset'),lib=state.conventionLibrary.subsets;if(!block)return;
 const name=block.querySelector('[name=convSubName]').value.trim(),content=block.querySelector('[name=convSubContent]').value.trim();
 if(!content)return toast('O subset está vazio.','error');if(lib.length>=60)return toast('Limite de 60 subsets na biblioteca.','error');
 const s={id:id('csub'),name:(name||'Subset').slice(0,60),content:content.slice(0,8000),createdAt:nowISO()};lib.push(s);block.querySelector('[name=convSubSource]').value='lib:'+s.id;block.querySelector('.conv-subset-icon').innerHTML=icon('star');save();refreshConvPicker();toast(`Subset "${s.name}" salvo na biblioteca.`);
}
function convDeleteLibrary(kind,itemId){
 const lib=state.conventionLibrary,list=kind==='template'?lib.templates:lib.subsets,item=list.find(x=>x.id===itemId);if(!item)return;
 if(kind==='template')lib.templates=list.filter(x=>x.id!==itemId);else lib.subsets=list.filter(x=>x.id!==itemId);
 save();refreshConvTemplates();refreshConvPicker();toast(`"${item.name}" excluído da biblioteca. Os agentes que já usam esse texto não mudam.`);
}
function convFormGuide(){const f=$('#agentForm');if(!f)return'';const d=new FormData(f),contents=d.getAll('convSubContent');return conventionsMarkdown({base:String(d.get('convBase')||''),subsets:d.getAll('convSubName').map((n,i)=>({name:String(n).trim()||'Subset',content:String(contents[i]||'')}))});}
let convPreviewTimer=null;
function updateConvPreview(){clearTimeout(convPreviewTimer);convPreviewTimer=setTimeout(()=>{const g=convFormGuide(),box=$('#convPreview'),c=$('#convCount');if(box)box.innerHTML=g?renderMarkdown(g):'<p class="hint">Nenhuma convenção definida para este agente.</p>';if(c)c.textContent=`${g.length.toLocaleString('pt-BR')} caracteres`;},120);}
function convUndo(){const u=ui.draft?.convUndo;if(!u)return;$('#convBase').value=u.base;$('#convTemplate').value=u.template;ui.draft.convUndo=null;$('#convUndo').hidden=true;refreshConvTemplates();updateConvPreview();}
// A custom agent's untouched generic greetings follow its specialty/title while it is being edited.
function syncGenericHellos(){const d=ui.draft;if(d?.kind!=='agent'||agentTemplateOf(d.agent))return;const role=$('#agentRole')?.value||d.agent.role,spec=$('#agentSpecialty')?.value||'',prev=d.helloBase||{role:d.agent.role,specialty:d.agent.specialty||''},inputs=$$('#helloList input'),old=genericHellos(prev.role,prev.specialty);if(inputs.length===old.length&&inputs.every((inp,i)=>inp.value.trim()===old[i])){const next=genericHellos(role,spec);inputs.forEach((inp,i)=>{inp.value=next[i]||inp.value;});}d.helloBase={role,specialty:spec};}
function helloRowHTML(h,i){return`<div class="hello-row"><span class="hello-num">${i+1}</span><input name="hello" maxlength="300" value="${E(h)}" placeholder="Oi! Me conta o que você precisa." autocomplete="off" aria-label="Mensagem inicial ${i+1}"><button type="button" class="icon-button small" data-action="hello-remove" aria-label="Remover variação" title="Remover variação">${icon('trash')}</button></div>`;}
function renumberHellos(){const rows=$$('#helloList .hello-row');rows.forEach((r,i)=>{r.querySelector('.hello-num').textContent=i+1;r.querySelector('input').setAttribute('aria-label',`Mensagem inicial ${i+1}`);});const add=$('[data-action="hello-add"]');if(add)add.disabled=rows.length>=8;}
function openAgentEditor(agentId,opts={}){
 if(!guardMutation())return;
 const existing=agentById(agentId);
 if(!existing&&state.agents.length>=80)return toast('Limite de 80 agentes por workspace.','error');
 const role=ROLES[opts.role]?opts.role:'backend',r=ROLES[role];
 const a=opts.draft?clone(opts.draft):existing?clone(existing):{id:id('agent'),name:codenameTaken(r.name)?'':r.name,role,specialty:'',icon:'',model:r.model,effort:'',profileId:'',description:r.description,prompt:r.prompt,tools:['Read','Glob','Grep','Edit','Write'],image:'',nextId:'',productionStage:'discovery',hex:validHex(opts.hex)?{q:opts.hex.q,r:opts.hex.r}:null,linkId:'',desk:validDesk(opts.desk)?opts.desk:'',...defaultSoul({name:codenameTaken(r.name)?'':r.name,role})};
 if(!a.conventions)a.conventions=defaultConventions(a);
 const tpl=existing?agentTemplateOf(a):null;
 // Created from a map double click: the agent joins that squad on save (squadJoinSlot picks the position).
 const joinQ=existing?null:squadById(opts.squadId)||null;
 const form=`<form id="agentForm" novalidate><div class="editor-layout"><div class="editor-side"><div class="editor-photo"><img id="editorPortrait" src="${portrait(a)}" alt="Retrato do agente"><span class="photo-code">IDENTITY // ${roleShort(a)}</span><span class="photo-stage">STAGE // ${stageMeta(a.productionStage).short}</span></div><p class="editor-side-note">${validHex(a.hex)?`POSIÇÃO NO MAPA<br>Q ${a.hex.q} / R ${a.hex.r}<br><br>`:'POSIÇÃO NO MAPA<br>Hexágono livre mais próximo da conexão<br><br>'}${validDesk(a.desk)?`MESA ${E(a.desk)}<br>${E(deskRoomName(a.desk).toUpperCase())}<br><br>`:''}ID: ${E(a.id.slice(-12))}</p></div><div><nav class="editor-nav" aria-label="Abas do estúdio">${[['general','IDENTIDADE'],['prompt','INSTRUÇÕES'],['tools','FERRAMENTAS'],['advanced','DIRETRIZES'],['projects','SQUADS']].map(([key,title],i)=>`<button type="button" class="editor-tab ${i===0?'active':''}" data-action="editor-tab" data-tab="${key}">${title}</button>`).join('')}</nav><div class="editor-pane" data-pane="general"><div class="form-grid"><div class="field full"><label for="agentName"><span class="label-ico">👤</span>CODINOME</label><div class="input-action"><input id="agentName" name="name" value="${E(a.name)}" maxlength="32" placeholder="Ex.: ${E(roleOf(a).name)}" autocomplete="off" autofocus style="text-transform:uppercase"><button type="button" class="dice-button" data-action="codename-roll" title="Codinome aleatório" aria-label="Gerar codinome aleatório">${icon('dice')}</button></div></div><div class="form-section eyebrow">CONFIGURAÇÕES GERAIS DO BRIDGE</div>${profileFieldHTML(a)}${modelFieldHTML(a)}${effortFieldHTML(a)}<div class="form-section eyebrow">AGENT CONFIG</div><div class="field"><label for="agentRole">ESPECIALIDADE</label><select id="agentRole" name="role">${roleOptions(a.role)}</select></div><div class="field"><label for="agentSpecialty">TÍTULO DA ESPECIALIDADE</label><input id="agentSpecialty" name="specialty" value="${E(a.specialty||'')}" maxlength="40" placeholder="${E(roleOf(a).label)}" autocomplete="off"><span class="hint">Opcional. Ex.: Tech Lead de Pagamentos, SRE de Kubernetes, Engenheiro de Performance. Obrigatório em Especialista personalizado.</span></div><div class="field full"><label for="agentDescription">RESPONSABILIDADE</label><textarea id="agentDescription" name="description" maxlength="1200">${E(a.description)}</textarea></div><div class="field"><label for="agentNext">PREFERÊNCIA DE HANDOFF</label><select id="agentNext" name="nextId"><option value="">Comandante decide</option>${state.agents.filter(x=>x.id!==a.id).map(x=>`<option value="${E(x.id)}" ${a.nextId===x.id?'selected':''}>${E(x.name)} / ${E(roleLabel(x))}</option>`).join('')}</select><span class="hint">Adiciona o destino ao plano quando ele pertence ao squad e ainda não faz parte da rota.</span></div><div class="field"><label for="agentStage">ESTÁGIO DE PRODUÇÃO</label><select id="agentStage" name="productionStage">${Object.entries(AGENT_STAGES).map(([key,s])=>`<option value="${key}" ${a.productionStage===key?'selected':''}>${E(s.label)}</option>`).join('')}</select></div><div class="field full"><div class="notice" style="margin-bottom:0">${icon('board')}A produção do agente também aparece no Kanban de agentes. Use este campo para indicar se ele ainda está em descoberta, definindo identidade, refinando prompts, em validação ou pronto para uso.</div></div><div class="form-section eyebrow">COSMÉTICOS</div><div class="field full"><span class="label">APARÊNCIA NA MESA DO SQUAD</span>${appearanceHTML(a)}<span class="hint">Clique na foto ou no ícone para abrir a galeria. Automático usa o padrão da especialidade.</span></div><div class="field full"><label for="agentLink">CONECTADO A</label>${(()=>{const p=project(),isCmd=p.commanderId===a.id,cmd=agentById(p.commanderId);if(isCmd)return '<select id="agentLink" name="linkId" disabled><option value="">Centro do squad</option></select><span class="hint">O comandante fica no centro e recebe as conexões dos demais agentes.</span>';const options=squad().filter(x=>x.id!==a.id&&!isDescendant(x.id,a.id,p));const current=effectiveLink(a,p)||'';return `<select id="agentLink" name="linkId">${options.length?options.map(x=>`<option value="${E(x.id)}" ${x.id===current?'selected':''}>${E(x.name)} / ${E(roleLabel(x))}${x.id===p.commanderId?' (centro)':''}</option>`).join(''):'<option value="">Sem agentes no squad</option>'}</select><span class="hint">Com quem este agente fica conectado na mesa do squad. Padrão: ${E(cmd?.name||'comandante')}.</span>`;})()}</div>${deskSelectHTML(a)}<div class="field full soul-field"><label for="agentSoul">SOUL <small>personalidade · como conversa</small></label><textarea id="agentSoul" name="soul" maxlength="1200" placeholder="Quem é, como fala, ritmo, humor, manias…">${E(a.soul||'')}</textarea><span class="label soul-hello">MENSAGENS INICIAIS <small>uma é sorteada ao começar cada conversa</small></span><div class="hello-list" id="helloList">${(a.hellos||[]).map(helloRowHTML).join('')}</div><button type="button" class="btn ghost sm hello-add" data-action="hello-add" ${(a.hellos||[]).length>=8?'disabled':''}>${icon('plus')}Adicionar variação</button><span class="hint">Molda o jeito de conversar e de iniciar as conversas (ex.: co-escrita de features) e vai na exportação. Todo agente fica sempre de prontidão.</span></div></div></div><div class="editor-pane hidden" data-pane="prompt"><div class="field"><label for="agentPrompt">SYSTEM PROMPT / INSTRUÇÕES DO AGENTE</label><textarea id="agentPrompt" class="code" name="prompt" maxlength="20000">${E(a.prompt)}</textarea><span class="hint">Defina papel, limites, entregáveis e contexto para o próximo especialista. Com o bridge ativo, estas instruções são anexadas ao system prompt do Claude Code (--append-system-prompt-file).</span></div><button type="button" class="btn ghost sm" data-action="prompt-reset" style="margin-top:10px">${icon('file')} Usar instruções da especialidade</button></div><div class="editor-pane hidden" data-pane="tools"><div class="eyebrow" style="margin-bottom:15px">FERRAMENTAS SOLICITADAS</div><div class="check-grid">${TOOLS.map(t=>`<label class="check-card"><input type="checkbox" name="tools" value="${t}" ${a.tools.includes(t)?'checked':''}><span><strong>${t}</strong><small>${TOOL_INFO[t]}</small></span></label>`).join('')}</div><div class="notice warning">${icon('lock')}<span>Com o bridge ativo, estas ferramentas são passadas ao <code>claude -p</code> (via --tools e --allowedTools, conforme as configurações do Claude Code). O modo de permissão global continua valendo: em modo headless, qualquer ação que exigiria aprovação é negada.</span></div></div>${conventionsPaneHTML(a)}<div class="editor-pane hidden" data-pane="projects"><div class="eyebrow" style="margin-bottom:15px">POSIÇÕES NAS SQUADS</div><div class="check-grid">${existing&&squadSlotsOf(a.id).length?squadSlotsOf(a.id).map(h=>`<div class="check-card"><span class="sq-chip ${h.slot}">${icon(h.slot==='commander'?'crown':h.slot==='adr'?'layers':h.slot==='prd'?'file':'cog')}</span><span><strong>${E(h.squad.name)}</strong><small>${E(h.label)}</small></span></div>`).join(''):joinQ?`<p class="hint">Ao salvar, entra na squad <strong>${E(joinQ.name)}</strong> como operador (ou como reconhecedor ADR/PRD, se a vaga estiver livre).</p>`:'<p class="hint">Este agente ainda não ocupa nenhuma posição em squads.</p>'}</div><div class="notice">${icon('link')}As squads são montadas no Squad Studio, na árvore de comando (comandante, ADR, PRD e operadores). <button type="button" class="link-button" data-action="squad-studio">Abrir Squad Studio ${icon('chevron')}</button></div></div></div></div><div class="look-picker" id="lookPicker" hidden></div></form>`;
 showModal(existing?'ESTÚDIO DO <span class="word-tag">AGENTE</span>':'RECRUTAR <span class="word-tag">AGENTE</span>','SQUAD CODE / IDENTIDADE & CAPACIDADES',form,`${existing?`<button class="btn danger square" data-action="agent-delete" data-id="${E(a.id)}" aria-label="Excluir agente">${icon('trash')}</button><button class="btn ghost" data-action="agent-duplicate" data-id="${E(a.id)}">${icon('copy')}Duplicar</button><button class="btn ghost" data-action="agent-export" data-id="${E(a.id)}" title="Exporta a versao salva">${icon('download')}.md</button>${tpl?`<button class="btn ghost" data-action="agent-restore" title="Restaura codinome, especialidade, aparência, modelo, responsabilidade, SOUL, instruções, ferramentas e diretrizes do template ${E(tpl.name)}. Estágio, mesa, conexões e squads não mudam.">${icon('rotate-left')}Restaurar default</button>`:''}<span class="grow"></span>`:'<span class="footer-note">LOCAL / SEM EXECUÇÃO</span>'}${cancelButton}<button class="btn primary" type="submit" form="agentForm">${icon('check')}Salvar agente</button>`,'','agent');
 ui.draft={kind:'agent',agent:a,isNew:!existing,squadId:joinQ?.id||''};refreshConvTemplates();updateConvPreview();
 requestAnimationFrame(refreshPortraitPicker);
}
function editorTab(tab){$$('.editor-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));$$('.editor-pane').forEach(el=>el.classList.toggle('hidden',el.dataset.pane!==tab));}
function invalidateAgentRoutes(p,agentId){
 for(const f of p.features){if(f.route.includes(agentId)&&!['done','review'].includes(f.status)){f.route=[];f.status='backlog';f.currentAgentId=null;f.step=0;}}
}
// Agent studio: model (catalog groups, a custom ID stays selectable) and effort pills; syncEffortField follows the model live.
// The catalog follows the Adapter of the agent's Perfil (ownProfile): a model of the other Adapter shows as the Perfil default.
function modelFieldHTML(a,ad=ownProfile(a.profileId).adapter){const cat=adapterModels(ad),m=modelFits(a.model,ad)?a.model||'inherit':'inherit',inCat=cat.some(([,items])=>items.some(x=>x[0]===m)),custom=inCat?'':`<option value="${E(m)}" selected>${E(m)} (personalizado)</option>`;return`<div class="field" data-adapter="${ad}"><label for="agentModel"><span class="label-ico">🧠</span>MODELO${ad==='codex'?' <small>codex</small>':''}</label><select id="agentModel" name="model">${custom}${cat.map(([g,items])=>`<optgroup label="${E(g)}">${items.map(([id,label])=>`<option value="${E(id)}" ${m===id?'selected':''}>${E(label)}${id.startsWith('claude-')?' · '+E(id):''}</option>`).join('')}</optgroup>`).join('')}</select><span class="hint" id="agentModelHint">${E(modelHint(m))}</span></div>`;}
function effortHint(m,e){if(!modelEffortSupport(m))return 'Haiku não usa nível de esforço.';const base=m&&m!=='inherit'?`Padrão do ${modelLabel(m)}: ${modelDefaultEffort(m)}.`:'Padrão: o do modelo da sessão.',g=runtime().effort?` Hoje o esforço global (${runtime().effort}) sobrescreve este, nas configurações do Claude Code.`:'';return`${EFFORT_INFO[e]?.[1]||''} ${base}${g}`;}
function effortFieldHTML(a,ad=ownProfile(a.profileId).adapter){const pf=ownProfile(a.profileId),keep=a.keepEffort??a.effort,base=adapterEfforts(ad,a.model,pf),list=adapterEfforts(ad,a.model,pf,keep),ok=modelEffortSupport(a.model),cur=ok&&list.includes(a.effort)?a.effort:'';return`<div class="field full effort-field" data-list="${list.join()}"><span class="label">NÍVEL DE ESFORÇO</span><div class="effort-pills" role="radiogroup" aria-label="Nível de esforço">${list.map(e=>{const kept=!base.includes(e);return`<label class="effort-pill${kept?' kept':''}" title="${E(EFFORT_INFO[e][1])}${kept?' Configurado neste agente, mas o modelo deste Perfil não o lista: na execução vale o padrão do modelo.':''}"><input type="radio" name="effort" value="${e}" ${cur===e?'checked':''} ${ok?'':'disabled'}><span>${EFFORT_INFO[e][0]}${kept?' · CONFIGURADO':''}</span></label>`;}).join('')}</div><span class="hint" id="agentEffortHint">${E(effortHint(a.model,cur))}</span></div>`;}
function syncEffortField(){const sel=$('#agentModel');if(!sel)return;const m=sel.value;{const ef=$('#agentForm .effort-field'),ad=sel.closest('.field')?.dataset.adapter;if(ef&&ad&&ef.dataset.list!==adapterEfforts(ad,m,ownProfile($('#agentProfile')?.value??ui.draft?.agent?.profileId??''),ui.draft?.agent?.effort||'').join())ef.outerHTML=effortFieldHTML({model:m,effort:document.querySelector('#agentForm input[name=effort]:checked')?.value||'',profileId:$('#agentProfile')?.value??ui.draft?.agent?.profileId??'',keepEffort:ui.draft?.agent?.effort||''},ad);}const ok=modelEffortSupport(m),radios=[...document.querySelectorAll('#agentForm input[name=effort]')];const mh=$('#agentModelHint');if(mh)mh.textContent=modelHint(m);radios.forEach(x=>{x.disabled=!ok;});if(!ok){const d=radios.find(x=>x.value==='');if(d)d.checked=true;}const eh=$('#agentEffortHint');if(eh)eh.textContent=effortHint(m,radios.find(x=>x.checked)?.value||'');}
function saveAgent(form){
 if(!guardMutation()||ui.draft?.kind!=='agent')return;
 const d=new FormData(form),a=ui.draft.agent,name=String(d.get('name')||'').trim().replace(/\s+/g,' ').toUpperCase(),prompt=String(d.get('prompt')||'').trim();
 if(!name){editorTab('general');$('#agentName').focus();return toast('Informe o codinome do agente.','error');}
 if(!CODENAME_RE.test(name)){editorTab('general');$('#agentName').focus();return toast('Use um codinome com letras, números, espaço ou hífen (ex.: MOTHER WOLF).','error');}
 if(codenameTaken(name,a.id)){editorTab('general');$('#agentName').focus();return toast(`O codinome ${name} já pertence a outro agente.`,'error');}
 if(!prompt){editorTab('prompt');$('#agentPrompt').focus();return toast('Defina as instruções do agente.','error');}
 const role=d.get('role'),oldRole=a.role;
 if(!ROLES[role])return toast('Escolha uma especialidade valida.','error');
 const joinQ=ui.draft.isNew&&!ui.squadSlotPending?squadById(ui.draft.squadId):null;
 if(joinQ&&!squadJoinSlot(joinQ,{...a,role})){editorTab('general');$('#agentRole')?.focus();return toast(`A squad ${joinQ.name} já tem comandante (${agentById(joinQ.commanderId).name}). Escolha outra especialidade ou troque o comandante no Squad Studio.`,'error');}
 {const held=squadSlotsOf(a.id).filter(h=>!slotFits(h.slot,{...a,role}));if(held.length){editorTab('general');return toast(`${a.name} ocupa ${held.map(h=>h.label+' em '+h.squad.name).join(', ')}. Troque o agente dessa posição no Squad Studio antes de mudar a especialidade.`,'error');}}
 const specialty=String(d.get('specialty')||'').trim().slice(0,40);
 if(role==='custom'&&!specialty){editorTab('general');$('#agentSpecialty').focus();return toast('Informe o título da especialidade personalizada.','error');}
 const iconKey=String(d.get('icon')||''),linkRaw=String(d.get('linkId')||''),linkId=linkRaw&&linkRaw!==project().commanderId&&linkRaw!==a.id&&agentById(linkRaw)&&!linkCreatesCycle(state.agents.filter(x=>x.id!==a.id).concat({...a,linkId:''}),a.id,linkRaw)?linkRaw:'';
 const template=ui.draft.isNew?(presetByName(name)?.name||''):(agentTemplateOf(a)?.name||'');
 Object.assign(a,{linkId,name,role,specialty,template,soul:String(d.get('soul')||'').trim().slice(0,1200),hellos:d.getAll('hello').map(x=>String(x).trim().slice(0,300)).filter(Boolean).slice(0,8),icon:AGENT_ICONS.includes(iconKey)?iconKey:'',...(()=>{const m=String(d.get('model')||''),model=/^[A-Za-z0-9._\-\[\]]{1,80}$/.test(m)?m:'sonnet',e=String(d.get('effort')||'');const profileId=profRef(String(d.get('profileId')??a.profileId??''));const pfo=ownProfile(profileId);return{model,effort:adapterEfforts(pfo.adapter,model,pfo,a.effort).includes(e)&&modelEffortSupport(model)?e:'',profileId};})(),description:String(d.get('description')||'').trim(),prompt,tools:d.getAll('tools').filter(t=>TOOLS.includes(t)),nextId:String(d.get('nextId')||''),productionStage:Object.hasOwn(AGENT_STAGES,String(d.get('productionStage')||''))?String(d.get('productionStage')):'discovery'});
 {const names=d.getAll('convSubName'),contents=d.getAll('convSubContent'),sources=d.getAll('convSubSource'),ids=d.getAll('convSubId'),fam=String(d.get('convFamily')||'');
  a.conventions={family:Object.hasOwn(CONVENTION_FAMILIES,fam)?fam:conventionFamilyOf(a),template:String(d.get('convTemplate')||'').slice(0,80),base:String(d.get('convBase')??'').slice(0,20000),subsets:names.map((n,k)=>({id:String(ids[k]||id('conv')).slice(0,100),name:String(n).trim().slice(0,60)||'Subset',content:String(contents[k]||'').slice(0,8000),source:String(sources[k]||'custom').slice(0,80)})).filter(x=>x.content.trim()).slice(0,20)};}
 {const wanted=String(d.get('desk')||''),busyDesks=takenDesks(a.id);a.desk=validDesk(wanted)&&!busyDesks.has(wanted)?wanted:validDesk(a.desk)&&!busyDesks.has(a.desk)?a.desk:firstFreeDesk(busyDesks,a.role);}
 if(ui.draft.isNew){const taken=takenHexes(a.id);if(!validHex(a.hex)||taken.has(hexKey(a.hex))){const anchor=agentById(a.linkId||project().commanderId);a.hex=nearestFreeHex(validHex(anchor?.hex)?anchor.hex:{q:0,r:0},taken,anchor?1:0)||{q:0,r:0};}state.agents.push(a);}else state.agents[state.agents.findIndex(x=>x.id===a.id)]=a;
 if(oldRole!==role)state.projects.forEach(p=>invalidateAgentRoutes(p,a.id));
 // A custom agent created from the Squad Studio goes straight into the position that was being edited.
 if(ui.draft.isNew&&ui.squadSlotPending&&ui.squadDraft){const {slot,index}=ui.squadSlotPending;if(slotFits(slot,a)){assignSlot(ui.squadDraft,slot,index,a.id);ui.squadPick=null;}else toast(`${a.name} foi criado, mas não pode ocupar a posição de ${SQUAD_SLOTS[slot].label}.`,'error');}
 ui.squadSlotPending=null;
 // Created on the map: joins that squad (and an open Squad Studio draft of it, so a later save there keeps the agent).
 let joined='';if(joinQ){const slot=squadJoinSlot(joinQ,a);squadJoin(joinQ,slot,a.id);syncSquad(joinQ);const dq=ui.squadDraft;if(dq&&!dq.isNew&&dq.id===joinQ.id){const ds=squadJoinSlot(dq,a);if(ds)squadJoin(dq,ds,a.id);}joined=`${joinQ.name} como ${SQUAD_SLOTS[slot].label}`;}
 const created=ui.draft.isNew;log(`Perfil ${a.name} ${created?'criado':'atualizado'}${joined?` e adicionado à squad ${joined}`:''}.`,'agent',a.id);ui.selectedId=a.id;save();closeModal();render();if(created&&ui.view!=='home')MapNetwork.focus(a.id);toast(joined?`Agente salvo e adicionado à squad ${joined}.`:'Agente salvo no workspace.');
}
function duplicateAgent(agentId){
 if(!guardMutation())return;const original=agentById(agentId);if(!original)return;
 if(state.agents.length>=80)return toast('Limite de 80 agentes atingido.','error');
 const a=clone(original);a.id=id('agent');a.template='';a.image=original.image||templatePortrait(original);let count=2;let name;do{name=original.name.slice(0,26)+'-'+pad(count++);}while(state.agents.some(x=>x.name===name));a.name=name;a.hex=nearestFreeHex(validHex(original.hex)?original.hex:{q:0,r:0},takenHexes(),1)||{q:0,r:0};a.desk=firstFreeDesk(takenDesks(),a.role);
 state.agents.push(a);if(a.role!=='commander'){const qs=state.squads.filter(q=>q.agentIds.includes(original.id));(qs.length?qs:[squadById(project().squadId)].filter(Boolean)).forEach(q=>{q.operatorIds.push(a.id);syncSquad(q);});}ui.selectedId=a.id;log(`Agente ${original.name} duplicado como ${a.name}.`,'agent',a.id);save();closeModal();render();openAgentEditor(a.id);toast('Cópia criada. Edite o perfil do novo agente.');
}
function deleteAgent(agentId){
 if(!guardMutation())return;const a=agentById(agentId);if(!a)return;
 const held=squadSlotsOf(a.id).filter(h=>h.slot!=='op');if(held.length)return toast(`${a.name} ocupa ${held.map(h=>h.label+' em '+h.squad.name).join(', ')}. Troque o agente dessa posição no Squad Studio antes de excluir.`,'error');
 confirmAction('EXCLUIR AGENTE',`Excluir ${a.name} de todos os projetos? Os planos pendentes que utilizam este agente precisarão ser redistribuidos. Entregas e registros já existentes serão preservados.`,()=>{
  state.agents=state.agents.filter(x=>x.id!==a.id);state.agents.forEach(x=>{if(x.nextId===a.id)x.nextId='';if(x.linkId===a.id)x.linkId='';});
  state.squads.forEach(q=>{q.operatorIds=q.operatorIds.filter(x=>x!==a.id);});state.projects.forEach(p=>invalidateAgentRoutes(p,a.id));state.squads.forEach(syncSquad);ui.squadDraft=null;ui.squadPick=null;
  log(`Perfil ${a.name} excluido.`,'system');save();render();toast('Agente excluido.');
 },'Excluir agente',true);
}
function uploadAgentImage(){toast('Envio de foto desativado. Escolha um retrato da galeria curada.','error');}
/* Claude Code export: one agent (.md, agent studio) or a whole squad (.zip with CLAUDE.md, .claude/agents/*.md and .claude/settings.json). */
function slugOf(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
// Each project works in its own folder under the bridge's projects/ root. The name is set once, at creation: renaming keeps it.
function validFolder(v){return typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(v)&&!/^(con|prn|aux|nul|com\d|lpt\d)$/.test(v);}
function projectFolderName(p,taken=[]){const slug=[slugOf(p.code),slugOf(p.name)].filter(Boolean).join('-').slice(0,72).replace(/-+$/,''),base=validFolder(slug)?slug:'projeto';let name=base,n=2;while(taken.includes(name))name=`${base}-${n++}`;return name;}
function projectDirLabel(p=project()){const dir=ui.bridge.projectsDir;if(!p?.folder)return dir||'projects/';return dir?dir+(dir.includes('\\')?'\\':'/')+p.folder:'projects/'+p.folder;}
function agentSlug(a){return slugOf(a.name)||'agent';}
function soulMarkdown(a){const soul=String(a?.soul||'').trim(),hellos=(a?.hellos||[]).map(h=>String(h).trim()).filter(Boolean);if(!soul&&!hellos.length)return'';return`\n\n## Soul\n${soul?`${soul}\n`:''}${hellos.length?`\nComo você inicia uma conversa (escolha uma destas e varie, sempre no seu jeito):\n${hellos.map(h=>`- "${h}"`).join('\n')}\n`:''}\nUse essa personalidade como temperamento, não como personagem: converse de forma natural e humana, sem bordões e sem travessões. Ela não muda as regras, o conteúdo técnico nem o formato das entregas. Você está sempre de prontidão.`;}
function agentMarkdown(a,{slug=agentSlug(a),description=a.description,extra='',tools=a.tools,color=''}={}){return`---\nname: ${slug}\ndescription: ${JSON.stringify(String(description||'').replace(/\s+/g,' ').trim())}\ntools: ${tools.join(', ')}\nmodel: ${a.model}${a.effort&&modelEffortSupport(a.model)?`\neffort: ${a.effort}`:''}${color?`\ncolor: ${color}`:''}\n---\n\n${agentSystemPrompt(a)}${soulMarkdown(a)}${extra?`\n\n${extra}`:''}\n`;}
function exportAgent(agentId){const a=agentById(agentId);if(!a)return;const slug=agentSlug(a);download(slug+'.md',agentMarkdown(a),'text/markdown;charset=utf-8');toast('Definição salva exportada. Nenhum arquivo foi instalado automaticamente.');}
// Store-only ZIP (no compression) with UTF-8 names: enough for a handful of text files, no dependencies.
function zipFiles(files){
 const enc=new TextEncoder(),table=zipFiles.table||(zipFiles.table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;}));
 const crc32=b=>{let c=0xFFFFFFFF;for(const x of b)c=table[(c^x)&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
 const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),date=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
 const parts=[],central=[];let offset=0;
 for(const f of files){
  const name=enc.encode(f.name),data=enc.encode(f.data),crc=crc32(data);
  const h=new DataView(new ArrayBuffer(30));[[0,0x04034b50,4],[4,20],[6,0x0800],[8,0],[10,time],[12,date],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length],[28,0]].forEach(([o,v,n])=>n===4?h.setUint32(o,v,true):h.setUint16(o,v,true));
  const c=new DataView(new ArrayBuffer(46));[[0,0x02014b50,4],[4,20],[6,20],[8,0x0800],[10,0],[12,time],[14,date],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length],[30,0],[32,0],[34,0],[36,0],[38,0,4],[42,offset,4]].forEach(([o,v,n])=>n===4?c.setUint32(o,v,true):c.setUint16(o,v,true));
  parts.push(new Uint8Array(h.buffer),name,data);central.push(new Uint8Array(c.buffer),name);offset+=30+name.length+data.length;
 }
 const size=central.reduce((s,b)=>s+b.length,0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+size+22);let p=0;for(const b of[...parts,...central,new Uint8Array(e.buffer)]){out.set(b,p);p+=b.length;}return out;
}
// Runtime permission mode -> settings.json defaultMode. bypassPermissions is deliberately left out (see projectExportFiles).
const EXPORT_PERMISSION_MODE={acceptEdits:'acceptEdits',plan:'plan',auto:'auto',dontAsk:'dontAsk',manual:'default'};
// Subagent colors accepted by Claude Code (/agents): position first, then specialty.
function agentColor(a,slot){if(slot==='commander')return'red';if(slot==='adr')return'purple';if(slot==='prd')return'yellow';return({qa:'green',devops:'orange',security:'orange',mobile:'pink',designer:'pink',docs:'yellow',pm:'yellow',architect:'purple',po:'yellow',frontend:'cyan',react:'cyan',angular:'cyan'})[a.role]||'blue';}
/* Project export (PROJETOS page): the operation's squad as Claude Code subagents + the project docs in the layout
   docs/project · docs/architecture (overview, adr/, diagrams/) · docs/standards · docs/features/<NNN-slug>/{spec,acceptance-criteria,tasks}.md.
   .claude/ only holds Claude Code configuration. */
// Paths used by older DIRETRIZES texts; exported agent files are rewritten to the docs/ layout above.
const LEGACY_DOC_PATHS=[['`docs/adr/NNNN-titulo-em-kebab-case.md`, com numeração sequencial de 4 dígitos','`docs/architecture/adr/ADR-NNN-titulo-em-kebab-case.md`, com numeração sequencial de 3 dígitos'],['Índice em `docs/adr/README.md`','Índice na seção **Decisões** de `docs/architecture/overview.md`'],['`docs/prd/<feature-em-kebab-case>.md`','`docs/features/<NNN-feature>/spec.md`'],['versionados em `docs/architecture/`','versionados em `docs/architecture/diagrams/`'],['docs/adr/','docs/architecture/adr/'],['docs/prd/','docs/features/']];
function modernDocPaths(t,isAdr){for(const [a,b] of LEGACY_DOC_PATHS)t=t.split(a).join(b);return isAdr?t.replace(/NNNN/g,'ADR-NNN').replace(/# ADR-NNN\. /g,'# ADR-NNN: '):t;}
// docs/standards: which DIRETRIZES (base guides by agent family, built-in subsets by group) feed each file; fallback = catalog subsets.
const STANDARD_FILES=[
 {file:'coding-style',title:'Padrões de código',intro:'Nomenclatura, formatação, estrutura, padrões de projeto e testes.',families:['backend','node','java','dotnet','python','go','php','frontend','vanilla','react','angular','vue','next','mobile','qa'],groups:['style','quality','architecture','tests','frontend'],fallback:['review-checklist','errors']},
 {file:'api-guidelines',title:'Diretrizes de API',intro:'Contratos, rotas, status, paginação, versionamento e integrações.',families:[],groups:['backend'],fallback:['api-rest']},
 {file:'database-guidelines',title:'Diretrizes de banco de dados',intro:'Modelagem, migrações, consultas e dados.',families:['dba','supabase','firebase','data'],groups:['data'],fallback:['migrations','sql-naming']},
 {file:'git-conventions',title:'Convenções de Git',intro:'Commits, branches, pull requests e releases.',families:[],groups:['delivery'],fallback:['commits','git-flow']},
 {file:'security-guidelines',title:'Diretrizes de segurança',intro:'Autenticação, autorização, segredos, dados pessoais e dependências.',families:['security'],groups:['security'],fallback:['security-owasp','secrets']}
];
function projectExportFiles(p){
 const q=squadById(p.squadId);if(!q)return null;
 const r=runtime(),cell=t=>String(t??'').replace(/\|/g,'\\|').replace(/\s+/g,' ').trim(),clip=(t,n)=>t.length>n?t.slice(0,n)+'\n[...]':t,lines=t=>String(t||'').split('\n').map(x=>x.trim()).filter(Boolean),yq=v=>JSON.stringify(String(v??''));
 const POS={commander:'Comandante',adr:'Reconhecedor ADR',prd:'Reconhecedor PRD',op:'Operador'},LAYER={commander:'01 Comando',adr:'02 Inteligência',prd:'02 Inteligência',op:'03 Operadores'};
 const today=new Date().toISOString().slice(0,10),opTitle=`${p.code} — ${p.name}`,todo=hint=>`_A definir._ ${hint}`;
 // Members in chain-of-command order; an agent holding two positions gets one file.
 const byId=new Map();for(const [slot,aid] of [['commander',q.commanderId],['adr',q.adrId],['prd',q.prdId],...(q.operatorIds||[]).map(x=>['op',x])]){const a=agentById(aid);if(!a)continue;if(byId.has(a.id))byId.get(a.id).slots.push(slot);else byId.set(a.id,{a,slots:[slot]});}
 const list=[...byId.values()],used=new Set();for(const m of list){const base=agentSlug(m.a);let s=base,n=2;while(used.has(s))s=`${base}-${n++}`;used.add(s);m.slug=s;}
 const slugFor=aid=>byId.get(aid)?.slug,ref=aid=>slugFor(aid)?'`'+slugFor(aid)+'`':'',cmd=list.find(m=>m.slots.includes('commander')),adr=list.find(m=>m.slots.includes('adr')),prd=list.find(m=>m.slots.includes('prd'));
 const cmdRef=cmd?`\`${cmd.slug}\``:'o comandante',adrRef=adr?`\`${adr.slug}\``:'o reconhecedor ADR',prdRef=prd?`\`${prd.slug}\``:'o reconhecedor PRD',members=list.map(m=>m.a);
 // Routes (same role mapping as routeFor); a feature keeps its applied route when it is inside the squad.
 const scopeRoute=scope=>{const route=[],missing=[];for(const role of scopeRoles(scope)){const a=(ROLE_FAMILY[role]||[role]).map(x=>members.find(y=>y.role===x)).find(Boolean);if(a)route.push(a.id);else missing.push(ROLES[role].label);}return{route,missing};};
 const featureRoute=f=>f.route?.length&&f.route.every(x=>byId.has(x))?{route:f.route,missing:[]}:scopeRoute(f.scope);
 const routeText=ids=>ids.map(ref).join(' → ');
 // Features: docs/features/<NNN>-<slug>/ (NNN from the key), real deliveries only, suggested order.
 const byFid=new Map(p.features.map(f=>[f.id,f])),featDir=new Map(),takenDirs=new Set();
 p.features.forEach((f,i)=>{const num=String(parseInt(String(f.key).match(/\d+/)?.[0]||String(i+1),10)).padStart(3,'0'),base=`${num}-${slugOf(f.title)||'feature'}`;let s=base,n=2;while(takenDirs.has(s))s=`${base}-${n++}`;takenDirs.add(s);featDir.set(f.id,s);});
 const realOutputs=f=>(f.outputs||[]).filter(o=>!o.error&&o.simulated===false);
 const onlySimulated=f=>['done','review'].includes(f.status)&&!realOutputs(f).length;
 const specStatus=f=>onlySimulated(f)?'backlog':f.status,statusLabel=f=>STATUS[specStatus(f)]||specStatus(f);
 const depsOf=f=>f.dependencies.map(d=>byFid.get(d)).filter(Boolean);
 const criteriaItems=t=>{let items=lines(t).filter(x=>!/^#{1,6}\s/.test(x)).map(x=>x.replace(/^(?:[-*•]\s*|\d+[.)]\s*)?(?:\[[ xX]\]\s*)?/,'').trim()).filter(Boolean);if(items.length===1&&items[0].includes(';'))items=items[0].split(';').map(x=>x.trim()).filter(Boolean);return items.map(x=>{const t2=x.replace(/[.;]\s*$/,'');return t2.charAt(0).toUpperCase()+t2.slice(1);});};
 const taskItems=t=>lines(t).filter(x=>!/^#{1,6}\s/.test(x)).map(x=>{const m=x.match(/^(?:[-*•]\s*|\d+[.)]\s*)?(\[[ xX]\])?\s*(.*)$/);return{done:/x/i.test(m[1]||''),text:m[2].trim()};}).filter(x=>x.text);
 // Suggested order: sprint by sprint; inside a sprint, dependency levels, then priority (dependencies outside the sprint count as resolved).
 const sprintName=f=>sprintOf(f,p)?.name||'',order=[];{const placed=new Set(),prio={P0:0,P1:1,P2:2};for(const sp of p.sprints){const mine=new Set(sprintFeatures(sp,p).map(f=>f.id));let rest=sprintFeatures(sp,p);while(rest.length){let level=rest.filter(f=>f.dependencies.every(d=>placed.has(d)||!byFid.has(d)||!mine.has(d)));if(!level.length)level=rest;level=[...level].sort((a,b)=>(prio[a.priority]-prio[b.priority])||String(a.key).localeCompare(String(b.key),undefined,{numeric:true}));level.forEach(f=>{order.push(f);placed.add(f.id);});rest=rest.filter(f=>!placed.has(f.id));}}}
 const featLink=(f,from)=>`${from}${featDir.get(f.id)}/spec.md`;
 const STEP={po:'PRD: histórias, escopo e critérios de aceitação',architect:'ADR: decisões de arquitetura',qa:'QA: verificação dos critérios de aceitação'};
 const featureFiles=p.features.flatMap(f=>{const dir=`docs/features/${featDir.get(f.id)}`,fr=featureRoute(f),deps=depsOf(f),real=realOutputs(f),done=specStatus(f)==='done',box=done?'[x]':'[ ]';
  const steps=fr.route.map((aid,i)=>{const a=agentById(aid);return`${i+1}. \`${slugFor(aid)}\` — ${a.name} (${roleLabel(a)})`;});
  const spec=['---',`id: ${yq(f.key)}`,`title: ${yq(f.title)}`,`operation: ${yq(p.code)}`,`area: ${f.scope}`,`priority: ${f.priority}`,`sprint: ${yq(sprintName(f))}`,`status: ${specStatus(f)}`,`depends_on: [${deps.map(d=>yq(d.key)).join(', ')}]`,`route: [${fr.route.map(slugFor).join(', ')}]`,'---','',
   `# ${f.key} — ${f.title}`,'',
   `**Área:** ${SCOPES[f.scope]||f.scope} · **Prioridade:** ${f.priority} · **Sprint:** ${sprintName(f)} · **Status:** ${statusLabel(f)} · **Operação:** [${opTitle}](../../project/briefing.md)`,'',
   'Critérios de aceitação: [acceptance-criteria.md](acceptance-criteria.md) · Tarefas: [tasks.md](tasks.md)','',
   '## Escopo','',f.description?.trim()||'(não detalhado)','',
   '## Dependências','',...(deps.length?deps.map(d=>`- [${d.key} — ${d.title}](${featLink(d,'../')}) · ${statusLabel(d)}`):['Nenhuma.']),'',
   '## Rota de execução','',...(steps.length?steps:['(sem especialistas na squad para esta área)']),...(fr.missing.length?['',`Falta na squad: ${fr.missing.join(', ')}.`]:[]),'',
   ...(f.context?.trim()?['## Contexto de handoff','',clip(f.context.trim(),4000),'']:[]),
   '## Entregas','',...(real.length?real.slice(-3).flatMap(o=>[`### ${agentById(o.agentId)?.name||'Agente'} · ${String(o.at).slice(0,10)}`,'',clip(String(o.text||'').trim(),2500),'']):[onlySimulated(f)?`_No SQUAD/CODE esta feature está "${STATUS[f.status]}" só em simulação, sem entrega real: trate como não implementada._`:'_Nenhuma entrega registrada._',''])].join('\n');
  const crit=criteriaItems(f.criteria),criteria=[`# Critérios de aceitação — ${f.key} ${f.title}`,'','> Spec: [spec.md](spec.md). Marque `- [x]` só depois de verificar, com a evidência registrada em spec.md → Entregas.','',...(crit.length?crit.map(x=>`- ${box} ${x}`):['- [ ] (critérios não definidos)']),''].join('\n');
  const tasks=taskItems(f.tasks),tasksMd=[`# Tarefas — ${f.key} ${f.title}`,'','> Spec: [spec.md](spec.md) · Critérios: [acceptance-criteria.md](acceptance-criteria.md)','',
   '## Tarefas técnicas','',...(tasks.length?tasks.map(t=>`- [${t.done||done?'x':' '}] ${t.text}`):['_Nenhuma tarefa detalhada no SQUAD/CODE. O PRD e o ADR desta rota quebram o trabalho aqui._']),'',
   '## Etapas da rota','',...fr.route.map(aid=>{const a=agentById(aid);return`- ${box} ${STEP[a.role]||`Implementação: ${roleLabel(a)}`} — \`${slugFor(aid)}\``;}),`- ${box} Revisão humana e aprovação`,''].join('\n');
  return[{name:`${dir}/spec.md`,data:spec},{name:`${dir}/acceptance-criteria.md`,data:criteria},{name:`${dir}/tasks.md`,data:tasksMd}];});
 // docs/project
 const featureTable=from=>p.features.length?['| Feature | Sprint | Área | Prioridade | Status | Depende de | Rota |','|---|---|---|---|---|---|---|',...order.map(f=>`| [${cell(f.key)} — ${cell(f.title)}](${featLink(f,from)}) | ${cell(sprintName(f))} | ${cell(SCOPES[f.scope]||f.scope)} | ${f.priority} | ${cell(statusLabel(f))} | ${depsOf(f).map(d=>d.key).join(', ')||'—'} | ${routeText(featureRoute(f).route)||'—'} |`)]:['_Nenhuma feature cadastrada nesta operação._'];
 const bullets=(t,hint)=>lines(t).length?lines(t).map(x=>`- ${x.replace(/^[-*•]\s*/,'')}`):[todo(hint)];
 const glossary=lines(p.glossary).map(l=>{const m=l.match(/^(.+?)\s*(?::|—|–|\s-\s)\s*(.*)$/);return m?[m[1].trim(),m[2].trim()]:[l,''];});
 const projectFiles=[
  {name:'docs/project/briefing.md',data:[`# ${opTitle}`,'',`> Operação executada pela squad **${q.name}**. Exportada do SQUAD/CODE em ${today}.`,'','## Briefing','',p.briefing?.trim()||'(sem briefing)','','## Documentos do projeto','','- [Visão do produto](product-vision.md)','- [Escopo e features](scope.md)','- [Glossário](glossary.md)','- [Arquitetura](../architecture/overview.md)',''].join('\n')},
  {name:'docs/project/product-vision.md',data:[`# Visão do produto · ${opTitle}`,'',p.vision?.trim()||todo('Descreva para quem é o produto, o problema que resolve, a proposta de valor, os diferenciais e as metas.'),''].join('\n')},
  {name:'docs/project/scope.md',data:[`# Escopo · ${opTitle}`,'','## Dentro do escopo','',...bullets(p.scopeIn,'Liste o que esta operação entrega.'),'','## Fora do escopo','',...bullets(p.scopeOut,'Liste o que fica de fora, para evitar ambiguidade.'),'','## Features','',...featureTable('../features/'),'',...(p.features.length?['## Sprints','','Cada feature pertence a uma sprint. `/executar-sprint <sprint>` roda, nesta ordem, as features da sprint que já podem começar.','',...p.sprints.flatMap((sp,i)=>{const fs=order.filter(f=>sprintOf(f,p)===sp),dn=fs.filter(f=>specStatus(f)==='done').length;return[`### S${String(i+1).padStart(2,'0')} · ${sp.name}`,'',...(sp.goal?[`**Objetivo:** ${sp.goal}`,'']:[]),`Andamento: ${dn}/${fs.length} concluídas.`,'',...(fs.length?fs.map((f,j)=>`${j+1}. [${f.key} — ${f.title}](${featLink(f,'../features/')}) · ${statusLabel(f)}`):['_Sem features._']),''];})]:[]),...(order.length?['## Ordem sugerida','','Sprint por sprint; dentro de cada sprint, respeita as dependências e, em cada nível, a prioridade (P0 primeiro):','',...order.map((f,i)=>`${i+1}. [${f.key} — ${f.title}](${featLink(f,'../features/')})`),'']:[]),'## Status das features','','O `status` fica no frontmatter de cada `spec.md` e é a fonte da verdade do andamento.','','| Valor | Significado |','|---|---|','| `backlog` | A fazer |','| `blocked` | Aguarda dependências |','| `ready` | Pronta para executar |','| `review` | Rota concluída, aguardando revisão humana |','| `done` | Aprovada na revisão humana |',''].join('\n')},
  {name:'docs/project/glossary.md',data:[`# Glossário · ${opTitle}`,'',...(glossary.length?['| Termo | Definição |','|---|---|',...glossary.map(([t,d])=>`| ${cell(t)} | ${cell(d)||'—'} |`)]:[todo(`Registre os termos do domínio (um por linha, "Termo: definição"). ${prdRef} acrescenta termos novos aqui.`)]),''].join('\n')}
 ];
 // docs/architecture
 const adrs=(p.adrs||[]).map((a,i)=>({...a,num:`ADR-${String(i+1).padStart(3,'0')}`,file:`ADR-${String(i+1).padStart(3,'0')}-${slugOf(a.title)||'decisao'}.md`}));
 const architectureFiles=[
  {name:'docs/architecture/overview.md',data:[`# Arquitetura · ${opTitle}`,'','## Visão geral','',p.architecture?.trim()||todo(`Componentes, integrações, dados, ambientes e restrições técnicas. ${adrRef} completa esta visão a cada decisão.`),'',
   '## Decisões','',...(adrs.length?['| ADR | Título | Status | Data |','|---|---|---|---|',...adrs.map(a=>`| [${a.num}](adr/${a.file}) | ${cell(a.title)} | ${a.status} | ${a.date||'—'} |`)]:[`_Nenhuma decisão registrada ainda._ ${adrRef} registra cada decisão em \`adr/ADR-NNN-<titulo>.md\` e atualiza esta tabela.`]),'',
   '## Diagramas','','Diagramas (Mermaid ou C4) ficam em [`diagrams/`](diagrams/), versionados junto com o ADR que os motivou.',''].join('\n')},
  ...adrs.map(a=>({name:`docs/architecture/adr/${a.file}`,data:[`# ${a.num}: ${a.title}`,'',`- Status: ${a.status}`,`- Data: ${a.date||today}`,`- Operação: ${opTitle}`,'',a.content?.trim()||ADR_SKELETON.trim(),''].join('\n')})),
  ...(adrs.length?[]:[{name:'docs/architecture/adr/.gitkeep',data:''}]),
  {name:'docs/architecture/diagrams/.gitkeep',data:''}
 ];
 // docs/standards, compiled from the squad's DIRETRIZES (identical blocks are merged, citing every source agent)
 const demote=md=>{let fence=false;return String(md).split('\n').map(l=>{if(/^\s*```/.test(l))fence=!fence;return!fence&&/^#{1,5} /.test(l)?'#'+l:l;}).join('\n');};
 const standardFiles=STANDARD_FILES.map(def=>{const blocks=new Map(),add=(key,title,content,src)=>{const c=String(content||'').trim();if(!c)return;const k=key+'\n'+c;if(!blocks.has(k))blocks.set(k,{title,content:c,sources:[]});if(src&&!blocks.get(k).sources.includes(src))blocks.get(k).sources.push(src);};
  for(const a of members){const c=a.conventions;if(!c)continue;const fam=c.family||conventionFamilyOf(a);
   if(def.families.includes(fam)&&c.base?.trim()){const t=convTemplateOf(fam,c.template);add('base:'+fam,`${CONVENTION_FAMILIES[fam]?.label||fam}${t?' — '+t.name:''}`,c.base,a.name);}
   for(const s of c.subsets||[]){const key=String(s.source||'').startsWith('builtin:')?s.source.slice(8):'',meta=key?convSubsetOf(key):null;if(meta&&def.groups.includes(meta.group))add('sub:'+key,s.name||meta.name,s.content,a.name);}}
  let items=[...blocks.values()];const fromCatalog=!items.length;if(fromCatalog)items=def.fallback.map(convSubsetOf).filter(Boolean).map(m=>({title:m.name,content:m.content,sources:[]}));
  const body=items.map(b=>{const md=demote(b.content),head=/^\s*#/.test(md)?'':`## ${b.title}\n\n`;return`${head}${md}${b.sources.length?`\n\n_Fonte: diretrizes de ${b.sources.join(', ')}._`:''}`;}).join('\n\n');
  return{name:`docs/standards/${def.file}.md`,data:[`# ${def.title}`,'',`> ${def.intro} Compilado das diretrizes (aba DIRETRIZES) dos agentes da squad **${q.name}** em ${today}. Em conflito com um padrão já existente no repositório, siga o repositório e registre a divergência na entrega.`,...(fromCatalog?['','> Nenhum agente da squad define regras deste tema: este arquivo traz o padrão do catálogo do SQUAD/CODE.']:[]),'',body,''].join('\n')};});
 // Subagents (same format as /agents); legacy doc paths in the saved guides are rewritten.
 const USE={commander:'Use para receber o briefing, decompor o trabalho em features e delegar cada etapa ao especialista certo.',adr:'Use antes da implementação para registrar as decisões de arquitetura (ADR).',prd:'Use no início de cada feature para escrever o PRD: histórias, escopo e critérios de aceitação.'};
 const WHERE={adr:['','## Onde registrar','- ADRs em `docs/architecture/adr/ADR-NNN-<titulo-em-kebab-case>.md`, com numeração sequencial de 3 dígitos; atualize a tabela **Decisões** de `docs/architecture/overview.md`.','- Diagramas (Mermaid ou C4) em `docs/architecture/diagrams/`.'],prd:['','## Onde registrar','- Complete a `spec.md` (histórias, requisitos e regras) e a `acceptance-criteria.md` (critérios verificáveis) da feature em `docs/features/<NNN-feature>/`, e quebre o trabalho em `tasks.md`.','- Termos novos do domínio vão para `docs/project/glossary.md`.'],op:['','## Onde registrar','- Siga os padrões de `docs/standards/` e marque em `tasks.md` da feature as tarefas que concluir.']};
 const agentFiles=list.map(m=>{const a=m.a,main=m.slots[0],next=a.nextId&&byId.has(a.nextId)?byId.get(a.nextId):null;
  const description=`${m.slots.map(s=>POS[s]).join(' e ')} da squad ${q.name} — ${roleLabel(a)}. ${a.description} ${USE[main]||`Use para as etapas de ${roleLabel(a)}.`}`;
  const position=[`## Posição na squad ${q.name}`,`- Camada: ${[...new Set(m.slots.map(s=>LAYER[s]))].join(', ')} · Posição: ${m.slots.map(s=>POS[s]).join(', ')}`,main==='commander'?'- Você distribui as features da operação: a cadeia de comando e as rotas por área estão em CLAUDE.md; briefing, visão, escopo e glossário em `docs/project/`; as features em `docs/features/`.':`- Reporta a: ${cmd?`${cmd.a.name} (\`${cmd.slug}\`), que distribui as features`:'o comandante da squad'}.`,main==='commander'?'':'- Antes de cada etapa leia `docs/project/briefing.md`, a pasta da feature em `docs/features/` e os padrões de `docs/standards/`.',next?`- Preferência de handoff: ${next.a.name} (\`${next.slug}\`).`:''].filter(Boolean);
  // Subagents cannot call other subagents: the commander orchestrates only as the main session (claude --agent <slug>), with the Agent tool.
  const orchestration=main==='commander'?['','## Como orquestrar no Claude Code',`- Como sessão principal (\`claude --agent ${m.slug}\`): delegue cada etapa com a ferramenta Agent ao subagente da rota da feature, uma etapa por vez. No prompt de cada etapa envie o briefing, a spec, os critérios de aceitação e as tarefas da feature, as entregas das dependências e os resumos de handoff das etapas anteriores.`,'- Nunca pule o PRD e o ADR quando a rota os incluir, e pare ao final da rota para a revisão humana.','- Quando chamado como subagente, você não delega: devolva o plano de distribuição (feature → rota, dependências e riscos) para a sessão principal executar.']:[];
  const handoff=['','## Handoff','- Ao terminar sua etapa, responda com um resumo de handoff para o próximo especialista da rota: o que foi feito, arquivos alterados, decisões, pendências e o próximo passo.','- Se for a última etapa, entregue um relatório para a revisão humana: o que foi entregue, arquivos alterados, evidências de verificação executadas, lacunas e riscos.','- Não declare testes ou verificações que não executou.','- Responda em português do Brasil.'];
  const tools=main==='commander'?[...new Set([...a.tools,'Agent'])]:a.tools,fam=a.conventions?.family||conventionFamilyOf(a);
  return{name:`.claude/agents/${m.slug}.md`,data:modernDocPaths(agentMarkdown(a,{slug:m.slug,description,tools,color:agentColor(a,main),extra:[...position,...(WHERE[main]||[]),...orchestration,...handoff].join('\n')}),fam==='adr')};});
 // Slash commands: the orchestration the SQUAD/CODE runner does, for the terminal (review -> human approval -> done).
 const commandFiles=[
  {name:'.claude/commands/planejar-operacao.md',data:['---',`description: ${yq(`Monta o plano de distribuição das features pendentes de ${opTitle}, sem executar nada.`)}`,'---','',`Você está coordenando a squad **${q.name}** na operação **${opTitle}**. Leia \`CLAUDE.md\`, os documentos de \`docs/project/\` (briefing, visão, escopo e glossário), \`docs/architecture/overview.md\` e o frontmatter de cada \`docs/features/*/spec.md\`.`,'',`Use o subagente ${cmdRef} (comandante) para montar o plano de distribuição:`,'','1. Liste as features com `status` diferente de `done`, na ordem sugerida de `docs/project/scope.md`.','2. Para cada uma, mostre a rota (`route`), as dependências (`depends_on`) e se já pode começar (todas as dependências com `status: done`).','3. Aponte especialistas que faltam na squad, decisões de arquitetura pendentes e riscos.','','Não execute nenhuma etapa nem altere arquivos: apresente o plano e aguarde a decisão humana.',''].join('\n')},
  {name:'.claude/commands/executar-feature.md',data:['---',`description: ${yq(`Executa uma feature de ${opTitle} pela rota da squad (PRD → ADR → operadores → QA), com handoff entre os subagentes, e para na revisão humana.`)}`,'argument-hint: "<feature, ex.: F02>"','---','',`Execute a feature **$ARGUMENTS** da operação **${opTitle}** com a squad **${q.name}**.`,'',
   '1. Encontre a pasta da feature em `docs/features/`: é a que tem `id: "$ARGUMENTS"` no frontmatter do `spec.md`. Leia `spec.md`, `acceptance-criteria.md` e `tasks.md`, além de `CLAUDE.md`, `docs/project/briefing.md`, `docs/architecture/overview.md` e `docs/standards/`.',
   '2. Confira `depends_on`: se alguma feature dependente não estiver com `status: done`, pare e informe quais faltam.',
   '3. Mude o `status` do `spec.md` para `ready` e siga a `route`, uma etapa por vez, chamando cada subagente pelo nome com a ferramenta Agent. No prompt de cada etapa envie:','   - o briefing da operação;','   - a spec, os critérios de aceitação e as tarefas da feature;','   - as entregas registradas nas features das dependências;','   - os resumos de handoff das etapas anteriores desta rota;','   - "Etapa N de M da rota" com a sequência completa.',
   '4. Depois de cada etapa, marque-a em **Etapas da rota** do `tasks.md` (e as tarefas técnicas concluídas) e repasse o resumo de handoff para a próxima. Não pule etapas nem rode duas ao mesmo tempo.',
   '5. Ao terminar a rota, mude o `status` para `review` e apresente o relatório da última etapa para a revisão humana.',
   '6. Só depois que a pessoa aprovar: mude o `status` para `done`, marque em `acceptance-criteria.md` os critérios verificados (`- [x]`), marque a revisão humana em `tasks.md` e registre um resumo da entrega em `## Entregas` do `spec.md`.',''].join('\n')},
  {name:'.claude/commands/executar-sprint.md',data:['---',`description: ${yq(`Executa uma sprint de ${opTitle}: roda, na ordem sugerida, as features da sprint que já podem começar, cada uma pela rota da squad, e para na revisão humana.`)}`,'argument-hint: "<sprint, ex.: S01 ou Sprint 01>"','---','',`Execute a sprint **$ARGUMENTS** da operação **${opTitle}** com a squad **${q.name}**.`,'',
   '1. Em `docs/project/scope.md`, seção **Sprints**, encontre a sprint `$ARGUMENTS` (pelo código, ex.: `S01`, ou pelo nome) e a lista das features dela, na ordem sugerida. O `spec.md` de cada feature também traz a sprint no frontmatter (`sprint:`).',
   '2. Separe as features da sprint com `status` diferente de `done` e `review`. Uma feature só começa quando todas as de `depends_on` estão com `status: done`; as demais ficam para depois e entram no relatório final.',
   '3. Para cada feature que pode começar, na ordem, siga o procedimento de `/executar-feature` (rota completa, uma etapa por vez, com handoff entre os subagentes) até ela chegar a `status: review`. Não rode duas features ao mesmo tempo.',
   '4. Uma feature em `review` ainda não está concluída: as que dependem dela esperam a aprovação humana.',
   '5. Ao final, apresente o relatório da sprint: features enviadas para revisão, features que aguardam dependências (e quais) e bloqueios encontrados. Não marque nada como `done` sem a aprovação da pessoa.',''].join('\n')}
 ];
 const routes=[],gaps=[];for(const [scope,label] of Object.entries(SCOPES)){const sr=scopeRoute(scope);if(sr.missing.length)gaps.push(label);else routes.push(`| ${label} | ${routeText(sr.route)} |`);}
 const bypass=r.permissionMode==='bypassPermissions';
 const flags=[`--permission-mode ${bypass?'bypassPermissions':(r.permissionMode==='manual'?'default':r.permissionMode)}`,r.model?`--model ${r.model}`:'',r.effort?`--effort ${r.effort}`:'',r.maxBudgetUsd?`--max-budget-usd ${Number(r.maxBudgetUsd)}`:''].filter(Boolean).join(' ');
 const nextFeat=order.find(f=>specStatus(f)!=='done')?.key||p.features[0]?.key||'F01',nextSprint=(()=>{const f=order.find(x=>specStatus(x)!=='done');return f?sprintCode(sprintOf(f,p),p):'S01';})(),firstOp=list.find(m=>m.slots.includes('op'));
 const claudeMd=[
  '# CLAUDE.md','',`Projeto **${opTitle}**, executado pela squad **${q.name}**. Exportado do SQUAD/CODE em ${today}.`,'',
  '## Mapa da documentação','','| Caminho | Conteúdo |','|---|---|',
  '| `docs/project/` | `briefing.md` (missão), `product-vision.md`, `scope.md` (dentro/fora do escopo, features e ordem sugerida) e `glossary.md`. |',
  '| `docs/architecture/` | `overview.md` (visão geral e índice de decisões), `adr/ADR-NNN-*.md` e `diagrams/`. |',
  '| `docs/standards/` | `coding-style`, `api-guidelines`, `database-guidelines`, `git-conventions` e `security-guidelines`, compilados das diretrizes da squad. |',
  '| `docs/features/<NNN-feature>/` | `spec.md` (frontmatter com `status`), `acceptance-criteria.md` e `tasks.md`. |',
  '| `.claude/agents/` | Subagentes da squad. |','| `.claude/commands/` | `/planejar-operacao`, `/executar-sprint` e `/executar-feature`. |','| `.claude/settings.json` | Permissões do Claude Code. |','',
  'Estes caminhos prevalecem sobre caminhos citados nos guias dos agentes.','',
  '## Cadeia de comando','','| Camada | Posição | Agente | Especialidade | Modelo | Esforço | Subagente |','|---|---|---|---|---|---|---|',...list.flatMap(m=>m.slots.map(s=>`| ${LAYER[s]} | ${POS[s]} | ${cell(m.a.name)} | ${cell(roleLabel(m.a))} | \`${m.a.model}\` | ${m.a.effort&&modelEffortSupport(m.a.model)?`\`${m.a.effort}\``:'padrão'} | \`${m.slug}\` |`)),'',
  '## Como trabalhamos','',
  `1. **Comando**: ${cmdRef} recebe o briefing, toma decisões e delega. Quebra o trabalho em features com escopo, prioridade, dependências e critérios de aceitação verificáveis, e escolhe o especialista de cada etapa.`,
  `2. **Inteligência**: ${prdRef} completa a spec e os critérios de aceitação de cada feature, e ${adrRef} registra as decisões de arquitetura (ADR) antes da implementação.`,
  '3. **Operadores**: executam tecnicamente a missão, cada um na sua especialidade, seguindo `docs/standards/` e o guia de diretrizes do próprio arquivo de agente.',
  '4. Cada etapa termina com um resumo de handoff para a próxima: o que foi feito, arquivos alterados, decisões, pendências e o próximo passo. A última etapa entrega um relatório para a revisão humana.',
  '5. O `spec.md` é a fonte da verdade: `review` ao fim da rota, `done` só com **aprovação humana**. Features dependentes só começam depois que as anteriores estiverem `done`.',
  '6. Não declare testes ou verificações que não foram executados.',
  '7. Se o repositório já tiver um padrão diferente de `docs/standards/`, siga o repositório e registre a divergência na entrega.',
  '8. Responda em português do Brasil.','',
  '## Features','',...(p.features.length?['| Feature | Sprint | Área | Prioridade | Status |','|---|---|---|---|---|',...order.map(f=>`| [${cell(f.key)} — ${cell(f.title)}](${featLink(f,'docs/features/')}) | ${cell(sprintName(f))} | ${cell(SCOPES[f.scope]||f.scope)} | ${f.priority} | ${cell(statusLabel(f))} |`),'','Sprints, dependências, rotas e ordem sugerida: `docs/project/scope.md`.']:['_Nenhuma feature cadastrada._']),'',
  '## Como usar no terminal','',
  '- Abra o Claude Code na raiz do repositório (`claude`). Este arquivo, os subagentes (`/agents` lista todos) e as permissões são carregados automaticamente.',
  '- Na primeira vez, abra `claude` de forma interativa e aceite o aviso de confiança do diretório: até lá o Claude Code ignora as permissões de `.claude/settings.json`.',
  `- \`/planejar-operacao\` monta o plano de distribuição; \`/executar-sprint ${nextSprint}\` roda as features da sprint que já podem começar; \`/executar-feature ${nextFeat}\` roda a rota de uma feature com handoffs. Os dois param na revisão humana.`,
  `- Para delegar direto a um especialista, peça pelo nome: "use o subagente ${firstOp?`\`${firstOp.slug}\``:'`<nome>`'} para …".`,
  `- Para a sessão inteira atuar como o comandante: \`claude --agent ${cmd?.slug||'<comandante>'}\`.`,
  `- Sem interação: \`claude -p "/executar-feature ${nextFeat}" ${flags}\`.`,
  '- Subagentes não chamam outros subagentes: a orquestração acontece na sessão principal (ou na sessão `--agent` do comandante).','',
  '## Rotas por área','','Sequência de subagentes para cada área de feature:','','| Área | Rota |','|---|---|',...routes,...(gaps.length?['',`Áreas sem especialista nesta squad: ${gaps.join(', ')}.`]:[]),'',
  '## Execução headless no SQUAD/CODE (referência)','',
  `Configuração usada pelo SQUAD/CODE ao rodar cada etapa com \`claude -p\`: orçamento por etapa ${r.maxBudgetUsd?`US$ ${Number(r.maxBudgetUsd)}`:'sem limite'}, timeout de ${r.timeoutSec} s, ${r.concurrency} etapa(s) em paralelo.`,
  ...(bypass?['','> O SQUAD/CODE está configurado com `bypassPermissions` para as execuções headless. Esse modo **não** foi exportado para `.claude/settings.json`, porque valeria para qualquer pessoa que abrir este repositório. Use-o só em execuções controladas.']:[]),''
 ].join('\n');
 // settings.json: the same allow rule runOptionsFor applies to every run (agent tools + extra allowed tools).
 const tools=new Set(members.flatMap(a=>a.tools)),allow=[...new Set([...TOOLS.filter(t=>tools.has(t)),...splitList(r.extraAllowedTools)])];
 const permissions={allow,defaultMode:EXPORT_PERMISSION_MODE[r.permissionMode]||'default'},dirs=splitList(r.addDirs);if(dirs.length)permissions.additionalDirectories=dirs;
 const settings={$schema:'https://json.schemastore.org/claude-code-settings.json',permissions};if(r.model)settings.model=r.model;if(['low','medium','high','xhigh'].includes(r.effort))settings.effortLevel=r.effort; // effortLevel accepts up to xhigh (max is per session)
 return[{name:'CLAUDE.md',data:claudeMd},...projectFiles,...architectureFiles,...standardFiles,...featureFiles,{name:'.claude/settings.json',data:JSON.stringify(settings,null,2)+'\n'},...agentFiles,...commandFiles];
}
function exportProject(projectId){
 const p=state.projects.find(x=>x.id===projectId);if(!p)return;
 const files=projectExportFiles(p);if(!files)return toast('Associe uma squad à operação antes de exportar.','error');
 const n=files.filter(f=>f.name.startsWith('.claude/agents/')).length,s=p.features.length;
 download(`${[slugOf(p.code),slugOf(p.name)].filter(Boolean).join('-')||'operacao'}.zip`,zipFiles(files),'application/zip');
 toast(`${p.code} exportada: CLAUDE.md, docs (projeto, arquitetura, ${STANDARD_FILES.length} padrões, ${s} feature${s===1?'':'s'}), ${n} agente${n===1?'':'s'}, 2 comandos e settings.json. Extraia o .zip na raiz do repositório.`);
}

/* Project workspace and briefing. */
function openProjects(){goView('projects');}
function switchProject(projectId,stay=false){
 if(runner)return toast('Encerre a simulação antes de trocar de projeto.','error');
 const p=state.projects.find(p=>p.id===projectId);if(!p)return;state.projectId=p.id;ui.selectedId=p.commanderId||p.agentIds[0];ui.opsNew=null;if(!stay)ui.view='network';closeModal();save();render();if(!stay)MapNetwork.home();
}
// PROJETOS page: create/edit happen inline (renderProjectsPage); these entry points just route there.
function openProjectEditor(projectId){
 if(!guardMutation())return;
 if(projectId){if(projectId!==state.projectId){if(runner)return toast('Encerre a simulação antes de trocar de projeto.','error');switchProject(projectId,true);}ui.opsNew=null;}
 else return openOpNew();
 if(ui.modal)closeModal();ui.view='projects';render();$('#projectName')?.focus();
}
function blankProject(sq){return{id:id('project'),code:'OP-'+String(state.projects.length+1).padStart(3,'0'),name:'',briefing:'',vision:'',scopeIn:'',scopeOut:'',glossary:'',architecture:'',adrs:[],squadId:sq?.id||'',commanderId:sq?.commanderId||'',agentIds:[...(sq?.agentIds||[])],sprints:[],features:[],logs:[],handoffs:[],createdAt:nowISO()};}
/* Nova operação: a two-step wizard (name, then an existing squad or a new one built in the Squad Studio). The operation is created
   right away with an empty briefing; projectGaps/runGate keep it from running until the project is complete. */
const opNewSub=step=>`${'OP-'+String(state.projects.length+1).padStart(3,'0')} / ${step}`;
function openOpNew(name=''){
 if(!guardMutation())return;if(state.projects.length>=30)return toast('Limite de 30 projetos por workspace.','error');
 ui.opNew={name};
 showModal('NOVA <span class="word-tag">OPERAÇÃO</span>',opNewSub('1 DE 2 · NOME'),`<form id="opNewForm" novalidate><div class="field"><label for="opNewName">NOME DO PROJETO</label><input id="opNewName" name="name" value="${E(name)}" maxlength="70" placeholder="Ex.: Atlas Commerce" autocomplete="off" autofocus></div><p class="hint">Depois você escolhe a squad que vai executar a operação.</p></form>`,`${cancelButton}<button class="btn primary" type="submit" form="opNewForm">${icon('arrow')}Continuar</button>`,'narrow','op-new');
}
function opNewNext(form){
 const name=String(new FormData(form).get('name')||'').trim().replace(/\s+/g,' ').slice(0,70);
 if(!name){$('#opNewName')?.focus();return toast('Informe o nome do projeto.','error');}
 ui.opNew={name};opNewSquadStep();
}
function opNewSquadStep(){
 if(!ui.opNew?.name)return openOpNew();const ready=state.squads.filter(q=>!squadMissing(q,false).length).length,full=state.squads.length>=30;
 showModal('NOVA <span class="word-tag">OPERAÇÃO</span>',opNewSub('2 DE 2 · SQUAD'),`<p class="op-new-ask">Quem vai executar <strong>${E(ui.opNew.name)}</strong>?</p><div class="op-choices"><button type="button" class="op-choice" data-action="op-new-existing" ${ready?'':'disabled'}>${icon('squad')}<strong>Selecionar squad existente</strong><small>${ready?`${ready} squad(s) completa(s) disponível(is).`:'Nenhuma squad completa ainda.'}</small></button><button type="button" class="op-choice" data-action="op-new-squad" ${full?'disabled':''}>${icon('plus')}<strong>Criar nova squad</strong><small>${full?'Limite de 30 squads por workspace.':'Monte comandante, ADR, PRD e operadores no Squad Studio.'}</small></button></div>`,`<button class="btn ghost" data-action="op-new-back">${icon('back')}Voltar</button>${cancelButton}`,'narrow','op-new');
}
function opNewPickStep(){
 if(!ui.opNew?.name)return openOpNew();const ok=q=>q&&!squadMissing(q,false).length,cur=squadById(project().squadId),def=ok(cur)?cur:state.squads.find(ok);
 if(!def)return opNewSquadStep();
 showModal('NOVA <span class="word-tag">OPERAÇÃO</span>',opNewSub('2 DE 2 · SQUAD'),`<form id="opNewSquadForm" novalidate><p class="op-new-ask">Squad de <strong>${E(ui.opNew.name)}</strong></p>${squadPickerHTML({squadId:def.id})}</form>`,`<button class="btn ghost" data-action="op-new-back-squad">${icon('back')}Voltar</button><button class="btn primary" type="submit" form="opNewSquadForm">${icon('check')}Criar operação</button>`,'narrow','op-new');
}
function opNewCreate(form){
 const sq=squadById(new FormData(form).get('squadId'));if(!sq)return toast('Escolha a squad da operação.','error');
 const miss=squadMissing(sq,false);if(miss.length)return toast(`A squad ${sq.name} está incompleta. Falta: ${miss.join(', ')}.`,'error');
 createOperation(ui.opNew?.name,sq);
}
function opNewNewSquad(){
 const name=ui.opNew?.name;if(!name)return openOpNew();
 ui.opPending={name};newSquad();
 if(!ui.squadDraft?.isNew){ui.opPending=null;return;}
 toast(`Monte a squad de ${name}. Ao criar a squad, a operação é criada com ela.`);
}
function createOperation(name,sq,msg){
 if(!guardMutation())return;ui.opPending=null;if(!name||!sq)return;if(state.projects.length>=30)return toast('Limite de 30 projetos por workspace.','error');
 const p=blankProject(sq);p.name=name;applySquad(p,sq);p.folder=projectFolderName(p,state.projects.map(x=>x.folder));p.sprints=[createSprint(1)];ensureSetup(p);state.projects.push(p);
 state.projectId=p.id;ui.selectedId=p.commanderId;ui.opsNew=null;ui.opNew=null;ui.opsFeature=null;ui.opsFeatureDraft=null;ui.opsPlan=null;
 log(`Operação ${p.name} criada com a squad ${sq.name}.`,'system',null,p);save();if(ui.modal)closeModal();ui.view='projects';render();$('#projectBriefing')?.focus();
 toast(msg||'Operação criada com o setup do projeto na Sprint 01. Escreva o briefing ou abra o Agent Teams para co-escrever com a squad.');
}
/* Project documentation (exported to docs/project and docs/architecture). docs/standards comes from the squad's DIRETRIZES. */
const ADR_SKELETON='## Contexto\n\n\n## Decisão\n\n\n## Consequências\n';
// The first data of an operation is co-written in Agent Teams (openAgentTeams), an online meetup with the squad's commander
// (who conducts), PRD and ADR reconhecedores. Each field has an owner (chatFamily of the agent that writes it). Fields use the
// FE_MD shape; list fields hold one item per line, like the export.
const PROJECT_DOCS={
 kickoff:{title:'Agent Teams',path:'docs/',agents:['commander','prd','adr'],adrs:true,fields:[
  {field:'briefing',id:'docBriefing',name:'briefing',label:'BRIEFING DO PROJETO',hint:'objetivo, usuários, restrições e pronto',placeholder:'Objetivo, usuários, escopo, restrições e definição de pronto.',empty:'Clique para escrever o briefing do projeto.',max:20000,owner:'commander'},
  {field:'vision',id:'docVision',name:'vision',label:'VISÃO DO PRODUTO',hint:'para quem, problema e valor',placeholder:'Para quem é, que problema resolve, proposta de valor, diferenciais e metas.',empty:'Clique para escrever a visão do produto.',max:8000,owner:'prd'},
  {field:'scopeIn',id:'docScopeIn',name:'scopeIn',label:'DENTRO DO ESCOPO',hint:'um item por linha',placeholder:'Catálogo com busca e filtros\nCheckout com pagamento em sandbox',empty:'Clique para listar o que a operação entrega.',max:8000,list:true,owner:'prd'},
  {field:'scopeOut',id:'docScopeOut',name:'scopeOut',label:'FORA DO ESCOPO',hint:'um item por linha',placeholder:'Pagamentos reais\nAplicativo mobile nativo',empty:'Clique para listar o que fica de fora.',max:8000,list:true,owner:'prd'},
  {field:'glossary',id:'docGlossary',name:'glossary',label:'GLOSSÁRIO',hint:'termo: definição, um por linha',placeholder:'SKU: código único que identifica um produto',empty:'Clique para escrever os termos do domínio.',max:8000,list:true,owner:'prd'},
  {field:'architecture',id:'docArchitecture',name:'architecture',label:'ARQUITETURA',hint:'visão geral: componentes, dados e integrações',placeholder:'Componentes, integrações, dados, ambientes e restrições técnicas.',empty:'Clique para escrever a visão geral da arquitetura.',max:12000,owner:'adr'}],
  quick:[['Seguir a pauta','Pode conduzir pela pauta, começando pelo que ainda falta.'],['Primeira versão de tudo','Montem uma primeira versão de tudo (briefing, visão, escopo, glossário, arquitetura e ADRs) a partir do que já existe na operação e me digam o que precisam confirmar.'],['Revisar o que existe','Revisem o que já está escrito e me apontem lacunas e incoerências antes de mudar qualquer coisa.']]}
};
const DOC_MD=Object.values(PROJECT_DOCS).flatMap(d=>d.fields);
// Places on the project page that open Agent Teams: the briefing field and the rows of DOCUMENTAÇÃO (fields → badge).
const DOC_ROWS={briefing:{title:'Briefing do projeto',doc:'kickoff',fields:['briefing']},vision:{title:'Visão do produto',path:'docs/project/product-vision.md',doc:'kickoff',fields:['vision']},scope:{title:'Escopo',path:'docs/project/scope.md',doc:'kickoff',fields:['scopeIn','scopeOut']},glossary:{title:'Glossário',path:'docs/project/glossary.md',doc:'kickoff',fields:['glossary']},architecture:{title:'Arquitetura',path:'docs/architecture/',doc:'kickoff',fields:['architecture']}};
// Agenda of the meetup (top bar chips and the "## Pauta" of the prompt): each item is filled like projectGaps checks it.
const TEAMS_AGENDA=[['briefing','Briefing',['briefing']],['vision','Visão',['vision']],['scope','Escopo',['scopeIn','scopeOut']],['glossary','Glossário',['glossary']],['architecture','Arquitetura',['architecture'],true]];
function adrBlockHTML(a,i){return`<div class="adr-block"><input type="hidden" name="adrId" value="${E(a.id)}"><div class="adr-head"><span class="adr-num">ADR-${String(i+1).padStart(3,'0')}</span><input name="adrTitle" value="${E(a.title)}" maxlength="120" placeholder="Título da decisão (ex.: Usar PostgreSQL como banco principal)" aria-label="Título do ADR"><select name="adrStatus" aria-label="Status do ADR">${ADR_STATUS.map(x=>`<option ${a.status===x?'selected':''}>${x}</option>`).join('')}</select><button type="button" class="icon-button small" data-action="adr-remove" aria-label="Remover ADR">${icon('trash')}</button></div><textarea name="adrContent" class="code" maxlength="12000" aria-label="Contexto, decisão e consequências">${E(a.content)}</textarea></div>`;}
function renumberAdrs(list=$('#adrList')){[...(list?.querySelectorAll('.adr-num')||[])].forEach((el,i)=>el.textContent='ADR-'+String(i+1).padStart(3,'0'));}
function adrValues(list){return[...(list?.querySelectorAll('.adr-block')||[])].map(b=>({id:b.querySelector('[name=adrId]').value,title:b.querySelector('[name=adrTitle]').value,status:b.querySelector('[name=adrStatus]').value,content:b.querySelector('[name=adrContent]').value}));}
function docBadges(v,adrs=0){const on=!!String(v||'').trim();return`<em class="ops-doc-state${on?' on':''}">${on?'PREENCHIDO':'VAZIO'}</em>${adrs?`<em class="ops-doc-state on">${adrs} ADR${adrs>1?'S':''}</em>`:''}`;}
function projectDocsHTML(p){
 const adrs=p.adrs||[],q=squadById(p.squadId);
 const doc=(row,v,body,n)=>{const r=DOC_ROWS[row];return`<details class="ops-doc" data-doc-row="${row}"><summary><span>${r.title}</span><small>${r.path}</small><span class="ops-doc-badges">${docBadges(v,n)}</span>${docAgentButton(row,docAgents(r.doc,q))}</summary><div class="ops-doc-body">${body}</div></details>`;};
 return`<div class="field full"><span class="label">DOCUMENTAÇÃO DO PROJETO</span><span class="hint">Vai para <code>docs/project/</code> e <code>docs/architecture/</code> na exportação para o Claude Code. <code>docs/standards/</code> sai das diretrizes dos agentes da squad e <code>docs/features/</code> das features da operação. Clique nos retratos para abrir o <b>Agent Teams</b>: uma reunião online com o comandante e os reconhecedores PRD e ADR em que vocês co-escrevem o briefing, a visão, o escopo, o glossário e a arquitetura conversando.</span><div class="ops-docs">${
  doc('vision',p.vision,`<textarea name="vision" maxlength="8000" aria-label="Visão do produto" placeholder="Para quem é, que problema resolve, proposta de valor, diferenciais e metas.">${E(p.vision||'')}</textarea>`)}${
  doc('scope',(p.scopeIn||'')+(p.scopeOut||''),`<div class="form-grid"><div class="field"><label for="projectScopeIn">DENTRO DO ESCOPO / UM POR LINHA</label><textarea id="projectScopeIn" name="scopeIn" maxlength="8000" placeholder="Catálogo com busca e filtros&#10;Checkout com pagamento em sandbox">${E(p.scopeIn||'')}</textarea></div><div class="field"><label for="projectScopeOut">FORA DO ESCOPO / UM POR LINHA</label><textarea id="projectScopeOut" name="scopeOut" maxlength="8000" placeholder="Pagamentos reais&#10;Aplicativo mobile nativo">${E(p.scopeOut||'')}</textarea></div></div>`)}${
  doc('glossary',p.glossary,`<textarea name="glossary" maxlength="8000" aria-label="Glossário" placeholder="Termo: definição (um por linha)&#10;SKU: código único que identifica um produto">${E(p.glossary||'')}</textarea>`)}${
  doc('architecture',p.architecture,`<label class="label" for="projectArchitecture">VISÃO GERAL</label><textarea id="projectArchitecture" name="architecture" maxlength="12000" placeholder="Componentes, integrações, dados, ambientes e restrições técnicas.">${E(p.architecture||'')}</textarea><span class="label adr-label">DECISÕES DE ARQUITETURA (ADR)</span><div class="adr-list" id="adrList">${adrs.map(adrBlockHTML).join('')}</div><button type="button" class="btn ghost sm" data-action="adr-add">${icon('plus')}Adicionar ADR</button>`,adrs.length)}</div></div>`;
}
function projectFormHTML(p,isNew){return`<form id="projectForm" class="ops-form" novalidate><div class="form-grid"><div class="field full"><label for="projectName">NOME DO PROJETO</label><input name="name" id="projectName" value="${E(p.name)}" maxlength="70" placeholder="Ex.: Atlas Commerce"></div><div class="field full" data-doc-row="briefing"><div class="doc-label-row"><label for="projectBriefing">BRIEFING DO PROJETO</label>${docAgentButton('briefing',docAgents('kickoff',squadById(p.squadId)))}</div><textarea name="briefing" id="projectBriefing" maxlength="20000" style="min-height:150px" placeholder="Objetivo, usuários, escopo, restrições e definição de pronto.">${E(p.briefing)}</textarea></div>${squadPickerHTML(p)}${projectDocsHTML(p)}${isNew?`<div class="field full"><label for="projectFeatures">FEATURES INICIAIS / UMA POR LINHA</label><textarea id="projectFeatures" name="features" maxlength="20000" placeholder="Autenticação de usuários&#10;Catálogo de produtos&#10;Painel administrativo"></textarea><span class="hint">Voce poderá detalhar critérios, prioridades e dependências depois.</span></div>`:''}</div></form>`;}
function saveProject(form){
 if(!guardMutation())return;const isNew=!!ui.opsNew,d=new FormData(form),p=isNew?ui.opsNew:clone(project()),name=String(d.get('name')||'').trim(),briefing=String(d.get('briefing')||'').trim(),sq=squadById(d.get('squadId'));
 if(!name){$('#projectName').focus();return toast('Informe o nome do projeto.','error');}if(!sq)return toast('Escolha a squad da operação.','error');{const miss=squadMissing(sq,false);if(miss.length)return toast(`A squad ${sq.name} está incompleta. Falta: ${miss.join(', ')}. Complete-a no Squad Studio.`,'error');}
 const adrIds=d.getAll('adrId'),adrStatus=d.getAll('adrStatus'),adrContent=d.getAll('adrContent'),today=new Date().toISOString().slice(0,10);
 const adrs=d.getAll('adrTitle').map((t,i)=>{const old=(p.adrs||[]).find(x=>x.id===adrIds[i]);return{id:String(adrIds[i]||id('adr')).slice(0,100),title:String(t).trim().slice(0,120),status:ADR_STATUS.includes(adrStatus[i])?adrStatus[i]:'Proposto',date:old?.date||today,content:String(adrContent[i]||'').trim().slice(0,12000)};}).filter(x=>x.title).slice(0,50);
 const txt=(k,n)=>String(d.get(k)||'').trim().slice(0,n);
 Object.assign(p,{name,briefing,vision:txt('vision',8000),scopeIn:txt('scopeIn',8000),scopeOut:txt('scopeOut',8000),glossary:txt('glossary',8000),architecture:txt('architecture',12000),adrs});applySquad(p,sq);
 if(isNew){p.folder=projectFolderName(p,state.projects.map(x=>x.folder));const lines=String(d.get('features')||'').split('\n').map(s=>s.trim()).filter(Boolean);if(lines.length>100)return toast('Use até 100 features iniciais.','error');p.sprints=[createSprint(1)];p.features=lines.map((title,i)=>createFeature(title.slice(0,120),i+1,{sprintId:p.sprints[0].id}));ensureSetup(p);state.projects.push(p);}else state.projects[state.projects.findIndex(x=>x.id===p.id)]=p;
 state.projectId=p.id;ui.selectedId=p.commanderId;ui.opsNew=null;log(`Briefing de ${p.name} ${isNew?'criado':'atualizado'}.`,'system',null,p);save();ui.view='projects';render();toast(isNew?'Operação criada. Defina as features a desenvolver.':'Projeto salvo.');
}
function deleteProject(projectId){
 if(!guardMutation())return;const p=state.projects.find(p=>p.id===projectId);if(!p)return;if(state.projects.length===1)return toast('Mantenha ao menos um projeto. Crie outro antes de excluir este.','error');
 confirmAction('EXCLUIR PROJETO',`Excluir ${p.name}, suas features e transmissões? Os perfis dos agentes permanecerão no workspace, e a pasta projects/${p.folder} fica no disco com o que já foi implementado.`,()=>{state.projects=state.projects.filter(x=>x.id!==p.id);if(state.projectId===p.id)state.projectId=state.projects[0].id;ui.selectedId=project().commanderId;save();render();toast('Projeto excluido.');},'Excluir projeto',true);
}
function openBriefing(){openOpsSection('opsBriefing');}
// Execution gate: no sprint, feature or spawn runs until every field of the saved project is filled (form and documentation, at least one ADR, each with content).
function projectGaps(p=project()){
 const t=v=>String(v||'').trim(),adrs=p?.adrs||[];
 const miss=[['name','nome'],['briefing','briefing'],['vision','visão do produto'],['scopeIn','dentro do escopo'],['scopeOut','fora do escopo'],['glossary','glossário'],['architecture','arquitetura']].filter(([k])=>!t(p?.[k])).map(([,label])=>label);
 if(!squadById(p?.squadId))miss.push('squad');
 if(!adrs.length)miss.push('ao menos um ADR');else adrs.forEach((x,i)=>{if(!t(x.title)||!t(x.content))miss.push(`ADR-${String(i+1).padStart(3,'0')} completo`);});
 return miss;
}
function runGate(p=project()){
 const miss=projectGaps(p);if(!miss.length)return true;
 toast(`Preencha e salve todos os campos de ${p.name||'o projeto'} antes de executar. Falta: ${miss.join(', ')}.`,'error');if(!ui.opsNew)openBriefing();return false;
}

/* Features, dependencies, and deterministic commander planning. */
function depsReady(f,p=project()){return f.dependencies.every(id=>p.features.find(x=>x.id===id)?.status==='done');}
function refreshBlocked(){for(const f of project().features){if(['ready','blocked'].includes(f.status))f.status=depsReady(f)?'ready':'blocked';}}
function kanbanHTML(){
 const p=project(),query=ui.featureQuery.toLowerCase();
 const sIdx=f=>p.sprints.indexOf(sprintOf(f,p));
 return[['backlog','A FAZER'],['ready','PRONTAS'],['running','EM EXECUÇÃO'],['review','REVISÃO HUMANA'],['done','CONCLUÍDAS']].map(([status,label])=>{
  const fs=p.features.filter(f=>(status==='backlog'?['backlog','blocked'].includes(f.status):f.status===status)&&(!query||`${f.title} ${f.key} ${SCOPES[f.scope]}`.toLowerCase().includes(query))).sort((a,b)=>(sIdx(a)-sIdx(b))||(b.setup-a.setup)||a.priority.localeCompare(b.priority));
  return`<section class="kanban-column" data-status="${status}"><div class="kanban-head"><span>${label}</span><span>${pad(fs.length)}</span></div>${fs.map(f=>`<button class="feature-card ${f.status}" data-action="feature-open" data-id="${E(f.id)}"><div class="feature-card-top"><span>${E(f.key)} <small class="card-sprint" title="${E(sprintOf(f,p)?.name||'')}">${E(sprintCode(sprintOf(f,p),p))}</small></span><span class="priority ${f.priority.toLowerCase()}">${f.priority}</span></div><h3>${E(f.title)}</h3><div class="feature-card-bottom">${icon(f.status==='blocked'?'lock':f.status==='review'?'eye':f.status==='done'?'check':'layers')} ${E(f.status==='blocked'?'Aguarda dependência':f.status==='review'?'Sua aprovação':SCOPES[f.scope])}</div>${f.route.length?`<div class="feature-card-route">${f.route.map(id=>E(agentById(id)?.name||'REMOVIDO')).join(' &rsaquo; ')}</div>`:''}</button>`).join('')||'<div class="column-empty">SEM FEATURES</div>'}</section>`;
 }).join('');
}

// Feature management lives on the PROJETOS page; these helpers route there and scroll to a section.
function openOpsSection(id){if(ui.modal)closeModal();ui.opsNew=null;ui.view='projects';render();requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}));}
function openOpsFeature(key){ui.opsFeature=key;ui.opsFeatureDraft=null;openOpsSection('opsFeatures');}
function openFeatures(){openOpsSection('opsFeatures');}
function refreshFeatureModal(){if(ui.view==='projects'){renderProjectsPage();return;}if(ui.modal==='features'){const root=$('#kanbanRoot');if(root){const scroll=root.scrollLeft;root.innerHTML=kanbanHTML();root.scrollLeft=scroll;const run=$('.modal-toolbar [data-action=run]');if(run)run.innerHTML=icon(runner?runControl().icon:'play')+(runner?runControl().label:(liveMode()?'Iniciar operação':'Iniciar demo'));$$('.modal-toolbar [data-action=feature-new],.modal-toolbar [data-action=distribute]').forEach(el=>el.disabled=!!runner);const stop=$('.modal-toolbar [data-action=stop]');if(stop)stop.hidden=!runner;}}}
/* Feature editor (modal) with co-writing by the squad's Reconhecedor PRD: the person talks in natural language, the agent
   fills Escopo, Critérios and Tarefas through the bridge (claude -p, no tools) and every change can be undone. */
const FE_FIELD_ID={title:'featureTitle',description:'featureDescription',criteria:'featureCriteria',tasks:'featureTasks',briefing:'docBriefing',vision:'docVision',scopeIn:'docScopeIn',scopeOut:'docScopeOut',glossary:'docGlossary',architecture:'docArchitecture',adrs:'docAdrList'},FE_FIELD_LABEL={title:'Título',description:'Escopo',criteria:'Critérios',tasks:'Tarefas',briefing:'Briefing',vision:'Visão do produto',scopeIn:'Dentro do escopo',scopeOut:'Fora do escopo',glossary:'Glossário',architecture:'Visão geral',adrs:'ADRs'};
const COWRITE_SYSTEM=['# Modo co-escrita de feature (SQUAD/CODE)','Você está co-escrevendo UMA feature com a pessoa, dentro do editor do SQUAD/CODE. Não execute nada, não use ferramentas e não escreva código.','- Responda em português do Brasil, com mensagens curtas de chat (até 5 frases), no jeito da sua SOUL. Se faltar informação importante, faça no máximo 2 perguntas.','- A mensagem é conversa: texto corrido, sem travessões, sem listas e sem negrito. Markdown, listas e subtítulos ficam só dentro dos campos do JSON, sempre sem emojis.','- Se houver o que atualizar ou uma pergunta com opções, termine com UM bloco ```json contendo só as chaves necessárias:','  - "ask": {"question": "pergunta curta", "options": ["opção 1", "opção 2"]} para perguntar com 2 a 4 opções curtas de escolha única. As opções viram botões e a pessoa também pode responder escrevendo. Use quando uma escolha ajudar a decidir; a pergunta vai só aí, não a repita no texto;','  - "scope": escopo em Markdown (o que deve ser entregue, comportamento esperado e limites; parágrafos curtos, listas e subtítulos ### quando ajudarem);','  - "criteria": lista de critérios de aceitação verificáveis, um por item;','  - "tasks": lista de tarefas técnicas pequenas e ordenadas, uma por item;','  - "title": só se o título estiver vazio ou se a pessoa pedir.','- Os campos são Markdown. Nos itens de "criteria" e "tasks", escreva só o texto de cada item, sem marcadores.','- Parta do conteúdo atual do formulário: preserve o que a pessoa escreveu e mude só o necessário. Cada valor do JSON substitui o campo inteiro.','- Siga as suas diretrizes de PRD no formato dos critérios e das histórias.'].join('\n');
// Bridge options of every chat turn (co-writing and agent chat), over runOptionsFor: text only, streamed (partial).
const CHAT_RUN={tools:[],allowedTools:[],permissionMode:'dontAsk',partial:true,timeoutSec:180};
function coWriterAgent(){const p=project(),q=squadById(p.squadId);return agentById(q?.prdId)||agentById(q?.commanderId)||agentById(p.commanderId)||null;}
function featureDraftFor(featureId,sprintId){const p=project(),f=featureById(featureId),sid=(sprintById(sprintId,p)||sprintById(ui.opsLast?.sprintId,p)||currentSprint(p))?.id||'',maxKey=Math.max(0,...p.features.map(x=>parseInt(x.key.replace(/\D/g,''),10)||0));return{key:f?f.id:'new',feature:f?clone(f):createFeature('',maxKey+1,{criteria:'',scope:ui.opsLast?.scope&&ui.opsLast.scope!=='setup'?ui.opsLast.scope:'fullstack',priority:ui.opsLast?.priority||'P1',sprintId:sid,dependencies:setupOf(p)?[setupOf(p).id]:[]}),isNew:!f};}
function openFeatureEditor(featureId,sprintId){
 if(!guardMutation())return;const existing=featureById(featureId);if(!existing&&project().features.length>=150)return toast('Limite de 150 features por projeto.','error');
 if(existing&&['done','review','running'].includes(existing.status))return openOpsFeature(existing.id);
 ui.opsFeature=null;render();
 ui.opsFeatureDraft=featureDraftFor(existing?.id,sprintId);ui.featureChat=newFeatureChat(existing?.id||'new');
 const d=ui.opsFeatureDraft,f=d.feature,p=project();
 showModal(d.isNew?'NOVA <span class="word-tag">FEATURE</span>':'EDITAR <span class="word-tag">FEATURE</span>',`${p.code} / ${f.key}${d.isNew?' / NOVA':` / ${STATUS[f.status]||''}`}`,featureEditorHTML(f),`${d.isNew||f.setup?'':`<button class="btn danger square" data-action="feature-delete" data-id="${E(f.id)}" aria-label="Excluir feature" title="Excluir feature">${icon('trash')}</button>`}<span class="grow"></span>${cancelButton}<button class="btn primary" type="submit" form="featureForm">${icon('check')}Salvar feature</button>`,'wide feature-editor','feature');
 renderFeatureChat();requestAnimationFrame(()=>$$('#featureForm .fe-area').forEach(autoGrow));
}
function featureEditorHTML(f){
 const others=project().features.filter(x=>x.id!==f.id),a=coWriterAgent(),model=coWriterModel(a),live=liveMode(),depKeys=f.dependencies.map(x=>featureById(x)?.key).filter(Boolean);
 return`<div class="fe-layout"><form id="featureForm" class="fe-form" novalidate>
<input id="featureTitle" class="fe-title" name="title" value="${E(f.title)}" maxlength="120" placeholder="Título da feature" autocomplete="off" autofocus aria-label="Título da feature">
<div class="fe-meta"><label class="fe-select"><span>ÁREA</span><select id="featureScope" name="scope">${Object.entries(SCOPES).filter(([k])=>k!=='setup'||f.setup).map(([k,l])=>`<option value="${k}" ${f.scope===k?'selected':''}>${E(l)}</option>`).join('')}</select></label><label class="fe-select"><span>PRIORIDADE</span><select id="featurePriority" name="priority">${PRIORITIES.map(([v,l])=>`<option value="${v}" ${f.priority===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="fe-select"><span>SPRINT</span><select id="featureSprint" name="sprintId"${f.setup?' disabled title="O setup do projeto fica sempre na primeira sprint."':''}>${project().sprints.map(s=>`<option value="${E(s.id)}" ${sprintOf(f)===s?'selected':''}>${E(sprintCode(s))} / ${E(s.name)}</option>`).join('')}</select></label></div>
${FE_MD.map(def=>feMdFieldHTML(def,f[def.field]||'')).join('')}
<details class="fe-deps"${f.dependencies.some(x=>!featureById(x)?.setup)?' open':''}><summary>DEPENDÊNCIAS <small id="feDepSummary">${depKeys.length?E(depKeys.join(', ')):'nenhuma'}</small></summary><div class="fe-dep-list">${f.setup?'<p class="hint">O setup do projeto é a primeira feature da Sprint 01: não depende de nenhuma outra, e todas as outras dependem dele.</p>':others.map(x=>`<label class="fe-dep"${x.setup?' title="Toda feature depende do setup do projeto."':''}><input type="checkbox" name="dependencies" value="${E(x.id)}" ${f.dependencies.includes(x.id)||x.setup?'checked':''}${x.setup?' disabled':''}><span><b>${E(x.key)}</b> ${E(x.title)}</span></label>`).join('')||'<p class="hint">Nenhuma outra feature neste projeto.</p>'}</div></details>
</form>${feChatHTML(a,model,live)}</div>`;
}
function autoGrow(el){if(!el)return;el.style.height='auto';el.style.height=Math.max(el.classList.contains('fe-area')?84:0,el.scrollHeight+2)+'px';}
function flashField(el){el.classList.remove('fe-updated');void el.offsetWidth;el.classList.add('fe-updated');setTimeout(()=>el.classList.remove('fe-updated'),1800);}
// Markdown blocks (Escopo, Critérios, Tarefas): rendered like the DIRETRIZES preview, click to edit the source, collapsible.
const FE_MD=[{field:'description',id:'featureDescription',name:'description',label:'ESCOPO',hint:'o que deve ser entregue',placeholder:'Contexto, comportamento esperado e limites da feature.',empty:'Clique para escrever o escopo da feature.'},{field:'criteria',id:'featureCriteria',name:'criteria',label:'CRITÉRIOS DE ACEITAÇÃO',hint:'lista verificável',placeholder:'- Dado… quando… então…',empty:'Clique para escrever os critérios de aceitação.'},{field:'tasks',id:'featureTasks',name:'tasks',label:'TAREFAS',hint:'checklist',placeholder:'- [ ] Criar tabela products\n- [ ] Endpoint GET /products com paginação',empty:'Clique para quebrar a feature em tarefas.'}];
const FE_MD_TOOLS=[['bold','B','Negrito (Ctrl+B)'],['italic','I','Itálico (Ctrl+I)'],['h','H','Subtítulo'],['ul','•','Lista'],['check','☐','Checklist'],['code','</>','Código']];
function feCount(field,v){const t=String(v||'').trim();if(!t)return'vazio';if(['description','briefing','vision','architecture'].includes(field)){const n=t.split(/\s+/).length;return`${n} palavra${n===1?'':'s'}`;}if(DOC_MD.some(d=>d.list&&d.field===field)){const n=t.split('\n').filter(l=>l.trim()).length,[one,many]=field==='glossary'?['termo','termos']:['item','itens'];return`${n} ${n===1?one:many}`;}const lines=t.split('\n').filter(l=>l.trim()&&!/^#{1,6}\s/.test(l.trim())),bullets=lines.filter(l=>/^\s*(?:[-*•]|\d+[.)])\s+/.test(l)).length,n=bullets||lines.length,word=field==='tasks'?'tarefa':'critério';return`${n} ${word}${n===1?'':'s'}`;}
// List fields (scope, glossary) hold one item per line, like the export: one bullet per line, the glossary term in bold.
function feViewHTML(def,v){if(!String(v||'').trim())return`<p class="fe-md-empty">${E(def.empty)}</p>`;if(!def.list)return renderMarkdown(v);return`<ul>${String(v).split('\n').map(l=>l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/,'')).filter(Boolean).map(l=>{const m=def.field==='glossary'&&l.match(/^(.+?)\s*(?::|—|–|\s-\s)\s*(.+)$/);return`<li>${m?`<b>${E(m[1])}</b>: ${E(m[2])}`:E(l)}</li>`;}).join('')}</ul>`;}
function feMdFieldHTML(def,value){const edit=!String(value||'').trim();return`<section class="fe-md${edit?' editing':''}" data-field="${def.field}"><header class="fe-md-head"><button type="button" class="fe-md-toggle" data-action="fe-collapse" aria-expanded="true"><span class="fe-chev"></span>${def.label}<small>${def.hint}</small></button><em class="fe-md-count">${feCount(def.field,value)}</em><div class="fe-md-modes" role="group" aria-label="Modo de ${def.label.toLowerCase()}"><button type="button" data-action="fe-md-mode" data-mode="view" class="${edit?'':'on'}">Visualizar</button><button type="button" data-action="fe-md-mode" data-mode="edit" class="${edit?'on':''}">Editar</button></div></header><div class="fe-md-body">${def.list?'':`<div class="fe-md-tools">${FE_MD_TOOLS.map(([k,l,t])=>`<button type="button" data-action="fe-md-tool" data-tool="${k}" title="${t}" aria-label="${t}">${E(l)}</button>`).join('')}</div>`}<div class="conv-md fe-md-view" data-action="fe-md-open" tabindex="0" role="button" aria-label="Editar ${def.label.toLowerCase()}">${feViewHTML(def,value)}</div><textarea id="${def.id}" class="fe-area" name="${def.name}" maxlength="${def.max||8000}" placeholder="${E(def.placeholder)}" aria-label="${def.label}">${E(value||'')}</textarea></div></section>`;}
function feMdRefresh(sec){const def=[...FE_MD,...DOC_MD].find(d=>d.field===sec?.dataset.field),ta=sec?.querySelector('.fe-area');if(!def||!ta)return;sec.querySelector('.fe-md-view').innerHTML=feViewHTML(def,ta.value);sec.querySelector('.fe-md-count').textContent=feCount(def.field,ta.value);}
function feMdMode(sec,mode){if(!sec)return;const ta=sec.querySelector('.fe-area');sec.classList.toggle('editing',mode==='edit');sec.querySelectorAll('[data-action="fe-md-mode"]').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));if(mode==='edit'){sec.classList.remove('collapsed');sec.querySelector('[data-action="fe-collapse"]')?.setAttribute('aria-expanded','true');autoGrow(ta);ta.focus();}else feMdRefresh(sec);}
// Toolbar: wraps the selection (bold/italic/code) or prefixes the selected lines (heading/list/checklist); applying again removes it.
function feMdTool(ta,tool){
 if(!ta)return;const s=ta.selectionStart,e=ta.selectionEnd,v=ta.value,wrap={bold:'**',italic:'*',code:'`'}[tool];
 if(wrap){const sel=v.slice(s,e),around=v.slice(s-wrap.length,s)===wrap&&v.slice(e,e+wrap.length)===wrap,inside=sel.length>2*wrap.length&&sel.startsWith(wrap)&&sel.endsWith(wrap);
  if(around){ta.value=v.slice(0,s-wrap.length)+sel+v.slice(e+wrap.length);ta.setSelectionRange(s-wrap.length,e-wrap.length);}
  else if(inside){const txt=sel.slice(wrap.length,-wrap.length);ta.value=v.slice(0,s)+txt+v.slice(e);ta.setSelectionRange(s,s+txt.length);}
  else{const txt=sel||'texto';ta.value=v.slice(0,s)+wrap+txt+wrap+v.slice(e);ta.setSelectionRange(s+wrap.length,s+wrap.length+txt.length);}}
 else{const prefix={h:'### ',ul:'- ',check:'- [ ] '}[tool];if(!prefix)return;const ls=v.lastIndexOf('\n',s-1)+1,nl=v.indexOf('\n',e),le=nl<0?v.length:nl,lines=v.slice(ls,le).split('\n'),all=lines.every(l=>l.startsWith(prefix));const block=lines.map(l=>all?l.slice(prefix.length):prefix+l.replace(/^(?:#{1,6}\s+|[-*]\s+(?:\[[ xX]\]\s+)?)/,'')).join('\n');ta.value=v.slice(0,ls)+block+v.slice(le);ta.setSelectionRange(ls,ls+block.length);}
 ta.focus();ta.dispatchEvent(new Event('input',{bubbles:true}));
}
// Single path for programmatic changes (agent replies, undo): value + render + expand + highlight.
function setFeField(field,value,opts={}){
 const el=document.getElementById(FE_FIELD_ID[field]);if(!el)return;el.value=value;autoGrow(el);const sec=el.closest('.fe-md');if(!sec){flashField(el);if(opts.write)el.scrollIntoView({block:'nearest',behavior:feReduced()?'auto':'smooth'});return;}
 sec.classList.remove('collapsed');sec.querySelector('[data-action="fe-collapse"]')?.setAttribute('aria-expanded','true');if(document.activeElement!==el&&value.trim())feMdMode(sec,'view');else feMdRefresh(sec);
 sec.classList.remove('fe-updated');void sec.offsetWidth;sec.classList.add('fe-updated');setTimeout(()=>sec.classList.remove('fe-updated'),1800);
 if(opts.write&&!feReduced()){const view=sec.querySelector('.fe-md-view'),parts=[...view.querySelectorAll('p,li,h3,h4,h5,h6,pre')];parts.forEach((n,i)=>n.style.setProperty('--i',i));view.classList.remove('fe-writing');void view.offsetWidth;view.classList.add('fe-writing');
  sec.querySelector('.fe-agent-badge')?.remove();sec.querySelector('.fe-md-toggle')?.insertAdjacentHTML('afterend',`<span class="fe-agent-badge">✎ ${E(chatAgent(chatNow())?.name||'AGENTE')}</span>`);
  setTimeout(()=>{view.classList.remove('fe-writing');sec.querySelector('.fe-agent-badge')?.remove();},900+70*parts.length);sec.scrollIntoView({block:'nearest',behavior:'smooth'});}
}
// Effective co-writing model: same rule as runOptionsFor (global runtime model > agent model > Claude Code default).
function coWriterModel(a){const mo=agentModelOf(a),global=mo.global,own=mo.own,pf=agentProfile(a),m=mo.model||pf.model||'',x=agentEffort(a),eng=mo.adapter==='codex'?'Codex':'Claude Code',pfx=profilesOn()?` Perfil ${pf.name}${/claude|codex/i.test(pf.name)?'':` (${ADAPTER_LABEL[mo.adapter]})`}.`:'';
 const mt=(global?`Modelo global definido nas configurações do Claude Code${own&&own!==global?` (substitui o do agente: ${modelLabel(own)})`:''}.`:own?'Modelo definido no estúdio do agente.':pf.model?`Sem modelo no agente: usa o do Perfil ${pf.name}.`:`Sem modelo definido: usa o padrão do ${eng}.`)+pfx;
 // Effort gets its own chip (effortChipHTML); with no level set it shows the model's default, which is what the run uses.
 const lvl=x.effort||(m?modelDefaultEffort(m):''),effort=x.source==='none'?null:{level:lvl,source:x.source,label:lvl?EFFORT_INFO[lvl]?.[0]||lvl.toUpperCase():'PADRÃO',
  title:x.source==='global'?`Esforço ${x.effort} definido nas configurações do Claude Code (substitui o do agente).`:x.effort?`Esforço ${x.effort} definido no estúdio do agente. ${EFFORT_INFO[x.effort]?.[1]||''}`:m?`Esforço padrão do ${modelLabel(m)}: ${lvl}. Ajuste no estúdio do agente.`:'Esforço padrão do modelo do Claude Code. Ajuste no estúdio do agente.'};
 return{label:m?modelLabel(m):'PADRÃO',title:mt,effort};}
function effortChipHTML(e){if(!e)return'';const n=Math.min(5,Math.max(0,ALL_EFFORTS.indexOf(e.level)-1));return`<span class="fe-effort${e.source==='default'?' dflt':''}" title="${E(e.title)}" aria-label="Nível de esforço: ${E(e.label)}"><i class="fe-effort-bars" aria-hidden="true">${[1,2,3,4,5].map(k=>`<b${k<=n?' class="on"':''}></b>`).join('')}</i>${E(e.label)}</span>`;}
// Co-writing chat, iMessage style: incremental DOM (bubbles pop in, smooth scroll), typing dots, sends queued while the agent
// replies, and replies that edit the fields one at a time. The conversation lives in memory per feature for the session only.
const FE_QUICK=[['Escrever do zero','Escreva o escopo, os critérios de aceitação e as tarefas a partir do título e do contexto do projeto.'],['Melhorar critérios','Revise os critérios de aceitação para ficarem verificáveis e sem ambiguidade.'],['Quebrar em tarefas','Quebre o escopo em tarefas técnicas pequenas e ordenadas.']];
function feReduced(){return document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;}
function feWait(ms){return new Promise(r=>setTimeout(r,feReduced()?0:ms));}
function newFeatureChat(featureId){const saved=ui.featureChats?.[featureId];return{kind:'feature',featureId,greeting:saved?.greeting||feGreeting(coWriterAgent()),messages:saved?saved.messages.map(m=>({...m})):[],seq:saved?.seq||0,queue:[],busy:false,runId:null,started:0,token:null,read:false,opened:Date.now()};}
function feClock(t){const d=new Date(t),today=d.toDateString()===new Date().toDateString();return`${today?'Hoje':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
// SOUL in the conversation: tone, rhythm and greeting of the agent (never the rules, the technical content or the JSON).
function feGreeting(a,fallback){const list=(a?.hellos||[]).map(h=>String(h).trim()).filter(Boolean);return list.length?list[Math.floor(Math.random()*list.length)]:fallback||'Oi! Me conte o que essa feature precisa resolver. Eu escrevo o escopo, os critérios e as tarefas junto com você, e você ajusta o que quiser.';}
function soulBlock(a,greeting){const soul=String(a?.soul||'').trim(),hello=String(greeting||'').trim();if(!soul&&!hello)return'';return['## SOUL: como você conversa',soul,'- A SOUL é o seu temperamento, não um personagem. Converse como uma pessoa de verdade mandando mensagem para um colega de trabalho: primeira pessoa, frases naturais e variadas, no seu ritmo e com o seu humor.','- Nada de bordões, trocadilhos repetidos ou metáforas temáticas forçadas. Se uma comparação vier natural, uma basta.','- Nunca use travessão (— ou –) nem hífen como pontuação. Use vírgula, ponto ou dois-pontos.','- Fuja do jeito de texto de IA: não abra com "Claro!", "Boa pergunta" ou "Ótima pergunta!", não feche com "Espero ter ajudado" ou "Em resumo", não use títulos, negrito ou listas com marcadores na mensagem, não enfileire adjetivos nem itens de três em três e não termine toda mensagem com uma pergunta genérica.','- Você está sempre de prontidão: responde na hora, pronto para agir.','- A SOUL muda só o tom da conversa: não muda as regras, o conteúdo técnico nem o formato do JSON dos campos.',hello?`- Você abriu esta conversa dizendo: "${hello}". Não repita o cumprimento.`:''].filter(Boolean).join('\n');}
function coWriteRoleTag(a){return a?.role==='po'?'RECONHECEDOR PRD':a?.role==='architect'?'RECONHECEDOR ADR':a?roleLabel(a).toUpperCase():'';}
function feChatHTML(a,model,live,opts={}){
 const name=E(a?.name||opts.none||'SEM AGENTE PRD'),send='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
 // Header unchanged (avatar, name + model chip, role); only the conversation below follows the iMessage style.
 return`<aside class="fe-chat" aria-label="Conversa com ${name}"><header class="fe-chat-head">${a?`<img src="${portrait(a)}" alt="">`:''}<div><div class="fe-chat-id"><strong>${name}</strong>${a?`<span class="fe-model" title="${E(model.title)}">${E(model.label)}</span>${effortChipHTML(model.effort)}`:''}</div><small>CO-ESCRITA · ${E(coWriteRoleTag(a))}</small></div></header>
<div class="fe-msgs" id="feMsgs" aria-live="polite"></div><button type="button" class="fe-jump" id="feJump" data-action="fe-jump" hidden>Nova mensagem ↓</button>
${live&&a?`<div class="fe-compose"><div class="fe-suggest" id="feSuggest">${(opts.quick||FE_QUICK).map(([l,t])=>`<button type="button" data-action="fe-quick" data-text="${E(t)}">${l}</button>`).join('')}</div><div class="fe-pill"><textarea id="feChatInput" rows="1" maxlength="4000" placeholder="Mensagem para ${name}" aria-label="Mensagem para ${name}"></textarea><button type="button" class="fe-send" data-action="fe-send" aria-label="Enviar" title="Enviar (Enter)" disabled>${send}</button></div></div>`:`<div class="fe-compose offline"><p class="fe-note">${a?'A conversa usa o Claude Code pelo bridge. Rode <code>npm start</code> e abra <code>http://127.0.0.1:4317</code> com a execução ligada. O formulário funciona normalmente sem ele.':E(opts.missing||'A squad desta operação não tem agente PRD.')}</p></div>`}</aside>`;
}
function feFootHTML(m){
 const out=[];
 if(m.editing)out.push(`<span class="fe-editing">✎ editando ${FE_FIELD_LABEL[m.editing]}…</span>`);
 else if(m.updated?.length)out.push(`<span class="fe-edits">${m.updated.map(k=>`<button type="button" class="fe-field-chip" data-action="fe-field" data-field="${k}">${FE_FIELD_LABEL[k]}</button>`).join('')}${m.prev?`<button type="button" class="link-button" data-action="fe-undo" data-mid="${m.id}">Desfazer</button>`:'<em>desfeito</em>'}</span>`);
 const meta=[m.cost!=null?`US$ ${Number(m.cost).toFixed(4).replace('.',',')}`:'',m.secs?`${m.secs} s`:''].filter(Boolean).join(' · ');
 if(meta)out.push(`<small class="fe-meta-line">${meta}</small>`);
 return out.join('');
}
function feMsgHTML(m){
 if(m.role==='system')return`<div class="fe-row system" data-mid="${m.id}"><p class="fe-note${m.error?' error':''}">${E(m.text)}${m.retry?` <button type="button" class="link-button" data-action="fe-retry" data-mid="${m.id}">Tentar de novo</button>`:''}</p></div>`;
 const c=chatNow(),tag=h=>teamsMentionOn(c)?teamsMentionHTML(h,c):h,body=m.role==='agent'?`<div class="fe-bubble-md">${tag(renderMarkdown(m.text))}</div>`:tag(E(m.text).replace(/\n/g,'<br>')),who=c?.group&&m.agentId?` data-who="${E(m.agentId)}"`:'';
 return`<div class="fe-row ${m.role}" data-mid="${m.id}"${who}>${feSenderFor(m)}<div class="fe-bubble ${m.role}${m.live?' live':''}">${body}</div>${m.role==='agent'?`<div class="fe-foot">${feFootHTML(m)}</div>${acPickHTML(m)}`:''}</div>`;
}
// Group chat (c.group): the agent's portrait and name above the first bubble of each run of its messages.
function feSenderHTML(a,at){return a?`<span class="fe-sender"><img src="${portrait(a)}" alt="">${E(a.name)}${at&&ui.modal==='teams'?`<time>${feClock(at).split(' ').pop()}</time>`:''}</span>`:'';}
function feSenderFor(m){const c=chatNow();if(!c?.group||m.role!=='agent'||!m.agentId)return'';const i=c.messages.indexOf(m),prev=i>0?c.messages[i-1]:null,before=prev?(prev.role==='agent'?prev.agentId:null):c.group.at(-1);return before===m.agentId?'':feSenderHTML(agentById(m.agentId),m.at);}
// Who is typing in a group chat (name over the dots); the row's data-who keeps the bubble tails per author.
function chatWho(a){const row=$('#feMsgs .fe-typing-row'),el=row?.querySelector('.fe-typing-who');if(!el)return;const on=!!(a&&chatNow()?.group);el.innerHTML=on?`<img src="${portrait(a)}" alt="">${E(a.name)}`:'';if(on)row.dataset.who=a.id;else delete row.dataset.who;}
function feTimeBefore(list,i){const m=list[i],p=list[i-1];return p&&m.at-p.at>5*60e3?`<div class="fe-time">${feClock(m.at)}</div>`:'';}
// The chat on screen: the agent chat (phone) or the co-writing chat of the feature editor; both use the same DOM ids.
function chatNow(){return ui.modal==='agent-chat'?ui.agentChat:ui.modal==='teams'?ui.docChat:ui.featureChat;}
/* Chats between openings (ui.featureChats / agentChats / docChats) and, with the bridge, in the database (PUT /api/chats/:kind/:key):
   each turn 800 ms after the last change, at once when the chat closes, by beacon when the page closes. */
const CHAT_MAPS={feature:'featureChats',agent:'agentChats',doc:'docChats'},chatSaveQ=new Map();let chatSaveTimer=0;
function chatKey(c){return c?.kind==='feature'?(c.featureId&&c.featureId!=='new'?c.featureId:''):c?.kind==='doc'?c.key||'':c?.kind==='agent'?c.agentId||'':'';}
// What a chat keeps: no live bubble, undo snapshot or retry handle; an agent chat's old options are spent.
function chatSnapshot(c){
 const msgs=c.messages.filter(m=>!m.live);
 if(c.kind==='agent')return{seq:c.seq,greeting:c.greeting,focus:c.focus,messages:msgs.map(m=>({...m,used:m.used||!!(m.options||m.list),retry:null}))};
 const out={seq:c.seq,greeting:c.greeting,messages:msgs.map(m=>({...m,prev:null,editing:null,retry:null}))};
 if(c.kind==='doc')Object.assign(out,{greetings:c.greetings,since:c.since});return out;
}
function chatStash(c){const key=chatKey(c),map=CHAT_MAPS[c?.kind];if(!key||!map||!c.messages.length)return;(ui[map]||(ui[map]={}))[key]=chatSnapshot(c);chatPersist(c);chatFlush();}
function chatPersist(c){if(!diskSync.on||!chatKey(c))return;chatSaveQ.set(c.kind+':'+chatKey(c),c);clearTimeout(chatSaveTimer);chatSaveTimer=setTimeout(chatFlush,800);}
function chatFlush(leaving=false){
 clearTimeout(chatSaveTimer);chatSaveTimer=0;
 for(const [qid,c] of chatSaveQ){chatSaveQ.delete(qid);const key=chatKey(c);if(!key||!c.messages.length)continue;
  const url=`/api/chats/${c.kind}/${encodeURIComponent(key)}`,body=JSON.stringify({projectId:c.kind==='feature'?project().id:null,data:chatSnapshot(c)});
  if(leaving&&navigator.sendBeacon&&body.length<60000&&navigator.sendBeacon(`${url}?token=${BRIDGE_TOKEN}`,new Blob([body],{type:'application/json'})))continue;
  bridgeFetch(url,{method:'PUT',body,keepalive:leaving&&body.length<60000}).catch(()=>{});}
}
function chatAgent(c){return c?.kind==='agent'||c?.kind==='doc'?agentById(c.speakerId||c.agentId):coWriterAgent();}
function renderFeatureChat(onReady){
 const box=$('#feMsgs'),c=chatNow();if(!box||!c)return;
 const greet=!c.greeted&&!c.messages.length&&!feReduced(),hellos=c.group?c.group.map(id=>({a:agentById(id),text:c.greetings?.[id]})).filter(h=>h.a&&h.text):[{text:c.greeting||feGreeting(chatAgent(c))}];
 box.innerHTML=`<div class="fe-time">${feClock(c.messages[0]?.at||c.opened)}</div>`+hellos.map((h,i)=>`<div class="fe-row agent" data-mid="welcome${i||''}"${h.a?` data-who="${E(h.a.id)}"`:''}${greet?' hidden':''}>${h.a?feSenderHTML(h.a):''}<div class="fe-bubble agent">${teamsMentionOn(c)?teamsMentionHTML(E(h.text),c):E(h.text)}</div></div>`).join('')+c.messages.map((m,i)=>feTimeBefore(c.messages,i)+feMsgHTML(m)).join('')+`<div class="fe-row agent fe-typing-row" hidden><span class="fe-sender fe-typing-who"></span><div class="fe-bubble agent fe-typing" aria-label="Digitando"><i></i><i></i><i></i></div><button type="button" class="link-button fe-stop" data-action="fe-stop">Parar</button></div>`;
 chatWho(c.busy?agentById(c.speakerId):null);chatTyping(c.busy&&!!c.runId,false);chatReceipt();chatSuggest();chatTails();box.scrollTop=box.scrollHeight;feSendState();
 // Each greeting pops after its own typing dots: a group chat greets agent by agent.
 if(greet){const row=box.querySelector('.fe-typing-row'),ws=[...box.querySelectorAll('[data-mid^="welcome"]')];let k=0;row.classList.add('greet');chatWho(hellos[0]?.a);chatTyping(true);
  const next=()=>{if(chatNow()!==c)return;const w=ws[k++];if(w){w.hidden=false;w.classList.add('fe-pop');}if(k<ws.length){chatWho(hellos[k].a);chatTails();setTimeout(next,700);return;}row.classList.remove('greet');chatWho(null);if(!c.busy)chatTyping(false);c.greeted=true;chatTails();onReady?.();};
  setTimeout(next,850);}else{c.greeted=true;onReady?.();}
}
// Tail only on the last bubble of each run of the same author (the typing bubble has its own "thought" dots).
function chatTails(){const rows=$$('#feMsgs .fe-row:not([hidden])');rows.forEach((r,i)=>{const b=r.querySelector('.fe-bubble');if(!b||b.classList.contains('fe-typing'))return;const who=r.classList.contains('user')?'user':'agent',next=rows[i+1];b.classList.toggle('tail',!(next&&next.classList.contains(who)&&next.querySelector('.fe-bubble')&&next.dataset.who===r.dataset.who));});}
function chatReceipt(){const box=$('#feMsgs'),c=chatNow();if(!box||!c)return;box.querySelector('.fe-receipt')?.remove();const last=c.messages.at(-1);if(last?.role!=='user')return;box.querySelector(`[data-mid="${last.id}"]`)?.insertAdjacentHTML('afterend',`<div class="fe-receipt">${c.read?'Lido':'Entregue'}</div>`);}
function chatSuggest(){const s=$('#feSuggest');if(s)s.hidden=chatNow()?.messages.some(m=>m.role==='user');}
function feNearBottom(box){return box.scrollHeight-box.scrollTop-box.clientHeight<90;}
function feScroll(box,follow){if(!box)return;const jump=$('#feJump');if(follow){box.scrollTo({top:box.scrollHeight,behavior:feReduced()?'auto':'smooth'});if(jump)jump.hidden=true;}else if(jump)jump.hidden=false;}
function chatTyping(on,animate=true){const box=$('#feMsgs'),row=box?.querySelector('.fe-typing-row');if(!row)return;const near=feNearBottom(box);if(on&&row.hidden){row.hidden=false;row.classList.remove('streaming');if(animate){row.classList.remove('fe-pop');void row.offsetWidth;row.classList.add('fe-pop');}}else if(!on)row.hidden=true;chatTails();if(on)feScroll(box,near);}
function chatPush(m){
 const c=chatNow();if(!c)return m;m.id=m.id||'m'+(++c.seq);m.at=m.at||Date.now();const box=$('#feMsgs');
 // Only the latest agent message keeps its options: a new message from the person retires the earlier ones.
 if(m.role==='user')for(const x of c.messages)if(!x.used&&(x.options||x.list)){x.used=true;box?.querySelector(`[data-mid="${x.id}"] .ac-pick`)?.remove();}
 c.messages.push(m);chatPersist(c);if(!box)return m;const near=feNearBottom(box),i=c.messages.length-1;
 if(m.role==='agent'&&ui.modal==='teams'&&$('#atRoot')?.dataset.tab==='docs'){const u=$('#atUnread');if(u)u.hidden=false;}
 box.querySelector('.fe-typing-row').insertAdjacentHTML('beforebegin',feTimeBefore(c.messages,i)+feMsgHTML(m));
 box.querySelector(`[data-mid="${m.id}"]`)?.classList.add('fe-pop');
 chatTails();chatReceipt();chatSuggest();feScroll(box,near||m.role==='user');return m;
}
function chatFooter(m){chatPersist(chatNow());const f=$(`#feMsgs [data-mid="${m.id}"] .fe-foot`);if(f)f.innerHTML=feFootHTML(m);}
function feSendState(){const i=$('#feChatInput'),b=$('.fe-send');if(i&&b)b.disabled=!i.value.trim();}
function coWritePrompt(a,msgs){
 const p=project(),f=ui.opsFeatureDraft?.feature,val=id=>(document.getElementById(id)?.value||'').trim(),clip=(t,n)=>t.length>n?t.slice(0,n)+' […]':t,c=ui.featureChat,fresh=new Set(msgs.map(m=>m.id));
 const deps=[...document.querySelectorAll('#featureForm [name=dependencies]:checked')].map(x=>featureById(x.value)?.key).filter(Boolean);
 const others=p.features.filter(x=>x.id!==f?.id).map(x=>`- ${x.key}: ${x.title} (${SCOPES[x.scope]||x.scope}, ${x.priority})`).join('\n');
 const history=[`${a.name}: ${c.greeting||feGreeting(a)}`,...c.messages.filter(m=>!fresh.has(m.id)&&m.role!=='system').slice(-12).map(m=>`${m.role==='user'?'Pessoa':a.name}: ${m.text}`)].join('\n\n');
 return[`# Co-escrita da feature ${f?.key||''} · ${p.code} ${p.name}`,`## Projeto\n${clip(p.briefing||'(sem briefing)',3000)}`,p.scopeIn?.trim()?`Dentro do escopo:\n${clip(p.scopeIn,1500)}`:'',p.scopeOut?.trim()?`Fora do escopo:\n${clip(p.scopeOut,1500)}`:'',others?`## Outras features do projeto\n${others}`:'',
  `## Formulário agora (a pessoa pode ter editado)\nTítulo: ${val('featureTitle')||'(vazio)'}\nÁrea: ${SCOPES[val('featureScope')]||''} · Prioridade: ${val('featurePriority')}${deps.length?` · Depende de: ${deps.join(', ')}`:''}\n\n### Escopo\n${val('featureDescription')||'(vazio)'}\n\n### Critérios de aceitação\n${val('featureCriteria')||'(vazio)'}\n\n### Tarefas\n${val('featureTasks')||'(vazio)'}`,
  history?`## Conversa até aqui\n${history}`:'',`## ${msgs.length>1?'Novas mensagens':'Nova mensagem'} da pessoa\n${msgs.map(m=>m.text).join('\n\n')}`].filter(Boolean).join('\n\n');
}
// Chat bubbles never show a dash used as punctuation (em/en dash, or a hyphen between spaces). Code and numeric ranges stay.
function chatClean(t){return String(t||'').split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part,i)=>i%2?part:part.replace(/^([ \t]*)[—–][ \t]*/gm,'$1').replace(/[ \t]*[—–][ \t]*$/gm,'').replace(/(\S)([ \t]*)[—–]([ \t]*)(?=(\S))/g,(m,a,s1,s2,b)=>!s1&&!s2&&/\d/.test(a)&&/\d/.test(b)?m:a+', ').replace(/(\S)[ \t]+-[ \t]+(?=\S)/g,'$1, ').replace(/,[ \t]*([,.;:!?])/g,'$1').replace(/(\S)[ \t]{2,}/g,'$1 ')).join('').trim();}
function lenientJSON(src){try{return JSON.parse(src);}catch{}let out='',str=false,esc=false;for(const ch of String(src)){if(str){if(esc){esc=false;out+=ch;continue;}if(ch==='\\'){esc=true;out+=ch;continue;}if(ch==='"')str=false;out+=ch==='\n'?'\\n':ch==='\r'?'':ch==='\t'?'\\t':ch;}else{if(ch==='"')str=true;out+=ch;}}try{return JSON.parse(out);}catch{return null;}}
function parseCoWrite(text){const t=String(text||''),blocks=[...t.matchAll(/```json\s*([\s\S]*?)```/gi)],last=blocks.at(-1);let data=null;if(last)data=lenientJSON(last[1]);return{reply:(last?t.slice(0,last.index)+t.slice(last.index+last[0].length):t).trim(),data};}
// The agents' way to ask (claude -p has no AskUserQuestion): "ask" in the reply's ```json block, one question with 2 to 6
// short options that become buttons (id 'ask'); the person may also just write. The question closes the bubble text.
function chatAsk(data){let q=data&&typeof data==='object'?data.ask:null;if(Array.isArray(q))q=q[0];if(!q||typeof q!=='object')return null;const question=chatClean(String(q.question||'').slice(0,300)),options=[...new Set((Array.isArray(q.options)?q.options:[]).map(o=>String(o&&typeof o==='object'?o.label??'':o??'').trim().slice(0,80)).filter(Boolean))].slice(0,6);return options.length>=2?{question,options}:null;}
function chatAskText(text,ask){return ask?.question&&!text.includes(ask.question)?[text,ask.question].filter(Boolean).join('\n\n'):text;}
function chatAskOptions(ask){return ask?ask.options.map(o=>({id:'ask',arg:o,label:o,say:o})):[];}
// Live reply (bridge option partial → --include-partial-messages): text deltas grow one agent bubble while the model writes;
// from ```json on nothing shows (the block is parsed at the end). The typing row stays only for its Parar button.
function chatStream(mine,agentId,onFirst){
 const s={text:'',m:null,raf:0};
 const paint=()=>{s.raf=0;if(!mine())return;const t=chatClean(s.text.split('```json')[0].replace(/`{1,3}(?:j(?:s(?:o(?:n)?)?)?)?$/,''));if(!t||s.m?.text===t)return;const box=$('#feMsgs');
  if(!s.m){box?.querySelector('.fe-typing-row')?.classList.add('streaming');s.m=chatPush({role:'agent',...(agentId?{agentId}:{}),text:t,live:true});onFirst?.();return;}
  s.m.text=t;const el=box?.querySelector(`[data-mid="${s.m.id}"] .fe-bubble-md`);if(!el)return;const near=feNearBottom(box),c=chatNow();el.innerHTML=teamsMentionOn(c)?teamsMentionHTML(renderMarkdown(t),c):renderMarkdown(t);if(near)box.scrollTop=box.scrollHeight;};
 s.onEvent=evt=>{if(evt?.type==='stream_event'){const d=evt.event?.type==='content_block_delta'?evt.event.delta:null;if(d?.type!=='text_delta'||typeof d.text!=='string')return;s.delta=true;s.text+=d.text;}else if(evt?.type==='assistant'&&!s.delta&&!evt.parent_tool_use_id){const t=(evt.message?.content||[]).filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('');if(!t.trim())return;s.text+=(s.text?'\n\n':'')+t;}else return;if(!s.raf)s.raf=requestAnimationFrame(paint);};
 s.stop=()=>{if(s.raf)cancelAnimationFrame(s.raf);s.raf=0;return s.m;};
 return s;
}
// Final state of an agent message: fills the live bubble when there is one (re-rendered in place), otherwise a new bubble.
function chatSettle(m,fields){if(!m)return chatPush({role:'agent',...fields});Object.assign(m,fields,{live:false});chatPersist(chatNow());chatRefresh(m);return m;}
function chatRefresh(m){const box=$('#feMsgs'),row=box?.querySelector(`[data-mid="${m.id}"]`);if(!row)return;const near=feNearBottom(box);row.outerHTML=feMsgHTML(m);chatTails();if(near)feScroll(box,true);}
// Agent reply: the bubble pops in first, then the fields are edited one at a time ("✎ editando…" in the bubble, reveal in the block).
async function applyCoWrite(result,cost,meta={}){
 const c=ui.featureChat;if(!c)return null;const {reply,data}=parseCoWrite(result),changes=[];
 const asList=(items,check)=>items.map(x=>String(x).trim().replace(/^•\s*/,'- ')).filter(Boolean).map(x=>check?(/^[-*]\s+\[[ xX]\]\s/.test(x)?x:`- [ ] ${x.replace(/^(?:[-*]|\d+[.)])\s+/,'')}`):(/^(?:[-*]|\d+[.)])\s/.test(x)?x:`- ${x}`)).join('\n');
 if(data&&typeof data==='object')for(const [k,field] of [['title','title'],['scope','description'],['criteria','criteria'],['tasks','tasks']]){if(!(k in data))continue;const raw=data[k],v=Array.isArray(raw)?(field==='title'?raw.join(' ').trim():asList(raw,field==='tasks')):typeof raw==='string'?raw.trim():null;const el=document.getElementById(FE_FIELD_ID[field]);if(v===null||!el||el.value.trim()===v)continue;changes.push({field,value:v.slice(0,el.maxLength>0?el.maxLength:8000)});}
 return chatApply(c,reply,data,changes,cost,meta);
}
// Shared by both co-writing chats (feature and project document): the bubble settles, then each change lands with its undo value.
async function chatApply(c,reply,data,changes,cost,meta){
 const ask=chatAsk(data),m=chatSettle(meta.m,{...(meta.agent?{agentId:meta.agent.id}:{}),text:chatAskText(chatClean(reply),ask)||(changes.length?'Pronto, vou atualizar os campos.':'(sem resposta)'),updated:[],prev:null,cost:cost??null,secs:meta.secs||null,editing:changes[0]?.field||null,options:chatAskOptions(ask)});
 // In the meetup each field stays on the shared screen long enough to be read before the next one.
 const prev={},gap=c.group&&ui.modal==='teams'?1500:420;
 for(const [i,ch] of changes.entries()){
  await feWait(i?gap:340);if(chatNow()!==c)return m;
  m.editing=ch.field;chatFooter(m);
  if(ch.field==='adrs'){prev.adrs=adrValues($('#docAdrList'));applyDocAdrs(ch.value);}else{prev[ch.field]=document.getElementById(FE_FIELD_ID[ch.field])?.value??'';setFeField(ch.field,ch.value,{write:true});}m.updated.push(ch.field);
  teamsShow(c,meta.agent,ch.field);
 }
 m.editing=null;m.prev=changes.length?prev:null;chatFooter(m);return m;
}
function undoCoWrite(mid){const c=chatNow(),m=c?.messages.find(x=>x.id===mid);if(!m?.prev)return;for(const [k,v] of Object.entries(m.prev)){if(k==='adrs')setDocAdrs(v);else setFeField(k,v);}m.prev=null;chatFooter(m);if(c.group){c.sharing=null;teamsSync();}}
// One turn for a block of new messages; messages sent meanwhile wait in the queue and go together next. In the meetup (c.group)
// the round is a queue of agents (docTurnCrew): each one is its own claude -p (own instructions, SOUL, model and effort), sees what
// the previous ones said in this round and can pass the word to a colleague ("next"), at most TEAMS_ROUND turns per round.
const TEAMS_ROUND=3;
async function runCoWrite(msgs){
 const c=chatNow(),doc=c?.kind==='doc'?PROJECT_DOCS[c.doc]:null;if(!c||c.kind==='agent'||!msgs.length)return;
 const crew=c.group?docTurnCrew(c,msgs):[chatAgent(c)].filter(Boolean);if(!crew.length)return;
 const token={};c.token=token;c.busy=true;c.read=false;c.sharing=null;const mine=()=>chatNow()===c&&c.token===token,round=[];
 let limit=TEAMS_ROUND;
 try{
  for(let i=0;i<crew.length&&i<limit;i++){
   const a=crew[i];c.speakerId=c.group?a.id:null;c.phase=c.group?'thinking':null;c.started=Date.now();chatWho(a);teamsSync();let live=null;
   const turn={i,crew,round};
   try{
    // Chat runs: no tools and no plan mode (its planning flow slowed replies and made the model fake tool calls); text streams live.
    const started=await bridgeFetch('/api/runs',{method:'POST',body:JSON.stringify({prompt:doc?docCoWritePrompt(a,c,msgs,turn):coWritePrompt(a,msgs),systemPrompt:agentSystemPrompt(a)+'\n\n'+[soulBlock(a,chatGreeting(c,a)),doc?docCoWriteSystem(doc,a,c,turn):COWRITE_SYSTEM].filter(Boolean).join('\n\n'),label:doc?`${a.name} / co-escrita ${doc.title.toLowerCase()}`:`${a.name} / co-escrita ${ui.opsFeatureDraft?.feature.key||''}`,meta:runMeta(doc&&ui.opsNew?null:project(),a,doc?null:ui.opsFeatureDraft?.feature,doc?'doc':'cowrite'),options:{...runOptionsFor(a,runtime(),doc&&ui.opsNew?null:project()),...CHAT_RUN}})});
    if(!mine()){bridgeFetch(`/api/runs/${started.runId}/cancel`,{method:'POST'}).catch(()=>{});return;}
    c.runId=started.runId;c.read=true;chatReceipt();chatTyping(true);
    // The tile goes from "pensando" to "falando" with the first words; a screen still shared by a colleague goes back to the gallery.
    live=chatStream(mine,c.group?a.id:null,()=>{if(!c.group)return;c.phase='speaking';if(c.sharing?.agentId!==a.id)c.sharing=null;teamsSync();});const exit=await streamRun(started.runId,live.onEvent);
    if(!mine())return;
    const lm=live.stop();c.runId=null;chatTyping(false);const secs=Math.max(1,Math.round((Date.now()-c.started)/1000));
    if(exit.isError){if(lm)chatSettle(lm,{});chatPush(exit.status==='cancelled'?{role:'system',text:'Resposta interrompida.'}:{role:'system',text:`Não consegui responder: ${exit.error||'falha na execução do Claude Code.'}`,error:true,retry:msgs.map(x=>x.id)});break;}
    const out={},m=await (doc?applyDocWrite:applyCoWrite)(exit.result||'',exit.costUsd,{secs,m:lm,agent:c.group?a:null,out});
    if(!mine())return;
    round.push({agent:a,mid:m?.id,text:m?.text||'',updated:m?.updated||[]});
    // A guest leaves once it delivered (it waits when it asked the person something); a host can call guests, who speak next.
    const guest=c.guests?.get(a.id);
    if(guest){if(m?.options?.some(o=>o.id==='ask'))guest.waiting=true;else{await feWait(700);if(!mine())return;teamsGuestOut(c,a.id);}}
    else{
     let at=i+1;for(const inv of out.invite||[])if(teamsJoin(c,inv.agent,a.name,inv.reason)){crew.splice(at++,0,inv.agent);limit++;}
     if(out.next&&!crew.includes(out.next))crew.push(out.next);
    }
   }catch(error){if(mine()){const lm=live?.stop();if(lm)chatSettle(lm,{});chatTyping(false);chatPush({role:'system',text:`Não consegui responder: ${error.message}`,error:true,retry:msgs.map(x=>x.id)});}break;}
  }
 }finally{if(mine()){
  // Guests left over leave too: one that did not get to speak (error, limit) or that waited for an answer the person did not give.
  for(const [id,g] of [...(c.guests||[])])if(!g.waiting||!crew.some(x=>x.id===id))teamsGuestOut(c,id);
  c.busy=false;c.runId=null;c.speakerId=null;c.phase=null;chatWho(null);chatTyping(false);teamsSync();if(c.queue.length)runCoWrite(c.queue.splice(0));}}
}
function chatGreeting(c,a){return c?.greetings?.[a?.id]||c?.greeting||'';}
// Mentions in the meetup: @CODENAME or @role of a participant, any case (longest first, so "MOTHER WOLF" wins over "MOTHER").
// Only a mention directs a message: a name written without @ does not.
const DOC_ROLE_WORDS={commander:['comandante'],po:['prd'],architect:['adr','arquiteto']};
// Squad members outside the meeting count too: tagging one of them calls it in (teamsMentionsPool).
function teamsMentionKeys(c){return[...(c?.group||[]),...teamsPool(c).map(a=>a.id)].map(agentById).filter(Boolean).flatMap(a=>[[a.name,a],...(DOC_ROLE_WORDS[a.role]||[]).map(w=>[w,a])]).sort((x,y)=>y[0].length-x[0].length);}
function teamsMentionRe(c){const keys=teamsMentionKeys(c);return keys.length?new RegExp(`@(${keys.map(([k])=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?![\\p{L}\\p{N}])`,'giu'):null;}
function teamsMentionAgent(keys,word){return keys.find(([k])=>k.toLowerCase()===String(word).toLowerCase())?.[1]||null;}
function teamsMentionHits(c,text){const re=teamsMentionRe(c);if(!re)return new Set();const keys=teamsMentionKeys(c);return new Set([...String(text||'').matchAll(re)].map(m=>teamsMentionAgent(keys,m[1])).filter(Boolean));}
function teamsMentions(c,text){const hit=teamsMentionHits(c,text);return c.group.map(agentById).filter(a=>hit.has(a));}
function teamsMentionsPool(c,text){const hit=teamsMentionHits(c,text);return teamsPool(c).filter(a=>hit.has(a));}
// Rendered chat HTML: participants' @mentions become clickable chips (text between tags only, never inside code).
function teamsMentionOn(c){return!!c?.group&&ui.modal==='teams';}
function teamsMentionHTML(html,c){
 const re=teamsMentionRe(c);if(!re)return html;const keys=teamsMentionKeys(c);let code=0;
 return String(html).split(/(<[^>]+>)/).map(part=>{if(part.startsWith('<')){if(/^<(code|pre)\b/i.test(part))code++;else if(/^<\/(code|pre)>/i.test(part))code=Math.max(0,code-1);return part;}if(code)return part;
  return part.replace(re,(m,w)=>{const a=teamsMentionAgent(keys,w);return a?`<button type="button" class="at-mention" data-action="teams-mention" data-name="${E(a.name)}" title="${E(`Marcar ${a.name} · ${roleLabel(a)}`)}">@${E(w.toLowerCase()===a.name.toLowerCase()?a.name:w)}</button>`:m;});}).join('');
}
// Who opens a round of the meetup: squad members the person calls in with @ (they join and speak first), the participants it tags
// with @ (in the squad's order), else the one whose question is being answered, else the commander, who conducts.
function docTurnCrew(c,msgs){
 const text=msgs.map(m=>m.text).join('\n'),called=teamsMentionsPool(c,text).filter(a=>teamsJoin(c,a,'Você',text));
 const list=c.group.map(agentById).filter(Boolean),named=teamsMentions(c,text).filter(a=>!called.includes(a));if(called.length||named.length)return[...called,...named];
 const first=c.messages.indexOf(msgs[0]),prev=c.messages.slice(0,first<0?c.messages.length:first).reverse().find(m=>m.role!=='system');
 if(prev?.role==='agent'&&prev.options?.some(o=>o.id==='ask')){const a=list.find(x=>x.id===prev.agentId);if(a)return[a];}
 return list.slice(0,1);
}
function sendFeatureChat(preset){
 const c=chatNow(),a=chatAgent(c),input=$('#feChatInput');if(!c||c.kind==='agent')return;const text=String(preset??input?.value??'').trim();if(!text)return;
 if(!liveMode())return toast('Conecte o bridge do Claude Code para co-escrever.','error');if(!a)return toast(c.kind==='doc'?'A squad desta operação não tem um reconhecedor para este documento.':'A squad desta operação não tem agente PRD.','error');
 if(preset==null&&input){input.value='';autoGrow(input);feSendState();input.focus();teamsMentionClose();teamsSync();}
 c.read=false;const m=chatPush({role:'user',text});
 if(c.busy)c.queue.push(m);else runCoWrite([m]);
}
function featureCoWrite(text){sendFeatureChat(text);}
function retryCoWrite(mid){const c=chatNow(),note=c?.messages.find(x=>x.id===mid);if(!note?.retry||c.busy)return;const msgs=note.retry.map(id=>c.messages.find(x=>x.id===id)).filter(Boolean);note.retry=null;$(`#feMsgs [data-mid="${mid}"]`)?.remove();c.messages=c.messages.filter(x=>x!==note);if(c.kind==='agent')runAgentChat(msgs,note.task);else runCoWrite(msgs);}
// Stops the running turn; on close the conversation is kept in memory for this feature (not in the workspace) and late results are ignored.
function featureChatStop(discard=false){
 const c=ui.featureChat;if(!c)return;if(c.runId)bridgeFetch(`/api/runs/${c.runId}/cancel`,{method:'POST'}).catch(()=>{});
 if(discard){chatStash(c);c.token=null;ui.featureChat=null;}
}
/* Agent Teams: the first data of an operation (PROJECT_DOCS.kickoff) is co-written in an online meetup, Teams style: a video stage
   with the squad's commander, PRD and ADR reconhecedores, the chat beside it and a Documentos tab. The conversation is a group chat
   of the co-writing engine (kind 'doc', ui.docChat, same DOM ids) shown in the modal kind 'teams'. The commander conducts: a round
   starts with whoever docTurnCrew picks and an agent can pass the word to a colleague ("next"). It starts from the page form, the
   person's unsaved edits included, and "Salvar no projeto" writes back into the form and saves the project (a new operation only
   fills it). It only opens with the bridge: there is no demo of it. */
function docSquad(){const sid=$('#projectForm [name=squadId]:checked')?.value;return squadById(sid)||squadById((ui.opsNew||project()).squadId);}
// Agents of a document (or of a page row), in the order they answer; an empty seat falls back to the commander.
function docAgents(key,q=docSquad()){const d=PROJECT_DOCS[DOC_ROWS[key]?.doc||key];if(!d)return[];const seat={commander:q?.commanderId,prd:q?.prdId,adr:q?.adrId},list=[...new Set(d.agents.map(r=>agentById(seat[r])).filter(Boolean))];return list.length?list:[agentById(q?.commanderId)].filter(Boolean);}
function teamsNames(list){return list.length>1?list.slice(0,-1).join(', ')+' e '+list.at(-1):list[0]||'';}
function docAgentButton(row,list){if(!list?.length)return'';const t=E(`Abrir o Agent Teams com ${teamsNames(list.map(a=>`${a.name} (${roleLabel(a)})`))}`);return`<button type="button" class="ops-doc-agent${list.length>1?' group':''}" data-action="agent-teams" title="${t}" aria-label="${t}">${list.map(a=>`<img src="${portrait(a)}" alt="">`).join('')}</button>`;}
function teamsCtaHTML(list){return`<button type="button" class="at-cta" data-action="agent-teams" title="Reunião online com o comandante e os reconhecedores PRD e ADR para co-escrever os documentos"><span class="at-cta-faces">${list.map(a=>`<img src="${portrait(a)}" alt="">`).join('')}</span><span><b>${icon('video')}Agent Teams</b><small>${list.length?`Kickoff com ${E(teamsNames(list.map(a=>a.name)))}`:'Sem agentes na squad'}</small></span></button>`;}
// Picking another squad in the form does not re-render the page: the briefing, the document rows and the Agent Teams button follow it here.
function refreshDocAgents(){$$('#projectForm [data-doc-row]').forEach(el=>{const row=el.dataset.docRow,html=docAgentButton(row,docAgents(row)),b=el.querySelector('.ops-doc-agent');if(b)b.outerHTML=html;else(el.querySelector('summary')||el.querySelector('.doc-label-row'))?.insertAdjacentHTML('beforeend',html);});const cta=$('#opsBriefing .at-cta');if(cta)cta.outerHTML=teamsCtaHTML(docAgents('kickoff'));}
function newDocChat(key,list){
 const ids=list.map(a=>a.id),k=ui.opsNew||!ids.length?null:`${project().id}:${key}:${ids.join('+')}`,saved=k&&ui.docChats?.[k];
 // Greetings when the agent has none of its own (SOUL hellos win, like in every chat): each one says its part of the meetup.
 const fallback={commander:'Oi! Eu conduzo o kickoff e cuido do briefing.',prd:'Oi! Eu fico com a visão do produto, o escopo e o glossário.',adr:'Oi! Comigo ficam a arquitetura e os ADRs.'};
 const greetings=saved?.greetings||Object.fromEntries(list.map(a=>[a.id,feGreeting(a,fallback[chatFamily(a)]||fallback.commander)]));
 return{kind:'doc',doc:key,key:k,agentId:ids[0]||null,group:ids.length>1?ids:null,hosts:ids.slice(),guests:new Map(),greetings,greeting:greetings[ids[0]]||'',messages:saved?saved.messages.map(m=>({...m})):[],seq:saved?.seq||0,queue:[],busy:false,runId:null,speakerId:null,phase:null,sharing:null,started:0,token:null,read:false,opened:Date.now()};
}
/* Guests of the meetup: squad members outside it (the operators) are called in for a demand, by an agent ("invite" in its reply)
   or by the person (@CODENAME). A guest joins (camera + note), answers in the same round and leaves; when it asked the person
   something it waits for the answer, replies and then leaves. While present its id is part of c.group, like the hosts. */
const TEAMS_GUESTS=3;
function teamsPool(c){const q=docSquad();if(!q||!c?.group)return[];return[...new Set([q.commanderId,q.prdId,q.adrId,...(q.operatorIds||[])])].filter(id=>id&&!c.group.includes(id)).map(agentById).filter(Boolean);}
function teamsJoin(c,a,by,reason){
 if(!c?.group||!a||c.group.includes(a.id)||c.guests.size>=TEAMS_GUESTS)return false;
 c.guests.set(a.id,{by,reason:String(reason||'').trim().slice(0,200),waiting:false});c.group=[...c.group,a.id];
 const why=acClip(reason,140);
 chatPush({role:'system',text:`${by} chamou ${a.name} para a reunião${why?`: ${why}${/[.!?…]$/.test(why)?'':'.'}`:'.'} ${a.name} entrou na chamada.`});
 teamsAddTile(a);teamsSync();return true;
}
function teamsGuestOut(c,id,quiet=false){
 if(!c?.guests?.has(id))return;c.guests.delete(id);c.group=c.group.filter(x=>x!==id);
 if(!quiet)chatPush({role:'system',text:`${agentById(id)?.name||'O convidado'} saiu da reunião.`});
 teamsRemoveTile(id);teamsSync();
}
// Who writes a field in the meetup: its owner, or the commander when that seat is empty.
function docOwner(f,c){const fams=(c?.group||[c?.agentId]).map(agentById).filter(Boolean).map(chatFamily);return fams.includes(f.owner)?f.owner:'commander';}
function docCoWriteSystem(def,a,c,turn){
 const keys={briefing:'  - "briefing": o briefing do projeto em Markdown (objetivo, usuários, restrições, prioridades e definição de pronto; parágrafos curtos e subtítulos ### quando ajudarem);',vision:'  - "vision": a visão do produto em Markdown (para quem é, problema que resolve, proposta de valor, diferenciais e metas; parágrafos curtos e subtítulos ### quando ajudarem);',scopeIn:'  - "scopeIn": lista do que fica dentro do escopo, um item curto por entrada;',scopeOut:'  - "scopeOut": lista do que fica fora do escopo, um item curto por entrada;',glossary:'  - "glossary": lista de termos do domínio, cada entrada no formato "Termo: definição curta";',architecture:'  - "architecture": a visão geral da arquitetura em Markdown (componentes, integrações, dados, ambientes e restrições técnicas; subtítulos ### quando ajudarem);'};
 // In the meetup each agent writes only the fields it owns; the colleagues' fields go through "next".
 const group=c?.group?c.group.map(agentById).filter(Boolean):[],mates=group.filter(x=>x.id!==a?.id),fam=chatFamily(a),names=l=>teamsNames(l.map(x=>x.name)),label=f=>FE_FIELD_LABEL[f.field].toLowerCase();
 const mine=f=>!group.length||docOwner(f,c)===fam,fields=def.fields.filter(mine),adrs=def.adrs&&(!group.length||docOwner({owner:'adr'},c)===fam),rest=def.fields.filter(f=>!mine(f));
 const parts=x=>{const fx=chatFamily(x),fs=def.fields.filter(f=>docOwner(f,c)===fx).map(label);if(def.adrs&&docOwner({owner:'adr'},c)===fx)fs.push('os ADRs');return fs.length?`${x.name} (${roleLabel(x)}) escreve ${teamsNames(fs)}`:'';};
 const role={commander:'Você é o comandante e organizador da reunião: conduz a pauta (briefing, visão do produto, escopo, glossário e arquitetura com ADRs) e escreve o briefing (objetivo, usuários, restrições, prioridades e definição de pronto).',prd:'Você é o reconhecedor PRD: escreve a visão do produto, o escopo (dentro e fora) e o glossário, sempre coerentes com o briefing.',adr:'Você é o reconhecedor ADR: escreve a visão geral da arquitetura e registra as decisões em ADRs, com ao menos um ADR completo (contexto, decisão e consequências).'}[fam];
 const prev=turn?.i>0?turn.crew.slice(0,turn.i):[];
 // Guests (called in for a demand) only answer it; the hosts can call squad members outside the meeting ("invite").
 const guest=c?.guests?.get(a?.id),hosts=mates.filter(x=>!c?.guests?.has(x.id)),pool=group.length&&!guest?teamsPool(c):[];
 if(guest)return['# Agent Teams: convidado numa reunião de kickoff (SQUAD/CODE)',`Você (${a.name}, ${roleLabel(a)}) foi chamado para uma reunião online da sua squad por ${guest.by==='Você'?'a pessoa':guest.by}. A demanda: ${guest.reason||'contribuir com a sua especialidade para os primeiros documentos da operação'}. Não execute nada, não use ferramentas e não escreva código.`,
  `- Na reunião, ${hosts.map(parts).filter(Boolean).join('; ')}. Os documentos são deles: você não escreve campos, diz o que eles precisam levar em conta, citando-os com @CODINOME.`,
  '- Responda a demanda com a sua especialidade, direto ao ponto (até 4 frases), falando com a pessoa como numa chamada. Depois de responder, você sai da chamada.',
  '- Se precisar de uma decisão da pessoa antes, termine com UM bloco ```json {"ask": {"question": "pergunta curta", "options": ["opção 1", "opção 2"]}} com 2 a 4 opções curtas; você responde quando ela escolher e então sai.',
  '- A mensagem é conversa: texto corrido em português do Brasil, no jeito da sua SOUL, sem travessões, sem listas, sem negrito e sem emojis.'].join('\n');
 const head=group.length?['# Agent Teams: reunião de kickoff (SQUAD/CODE)',`Você está numa reunião online com a pessoa e com ${names(mates)}, da sua squad, para co-escrever os primeiros documentos de uma operação. A conversa é consultiva: vocês entendem o que a pessoa quer, propõem caminhos e escrevem juntos. Não execute nada, não use ferramentas e não escreva código.`,role?`- ${role}`:'',
  `- Na reunião, ${mates.map(parts).filter(Boolean).join('; ')}.`,
  fam==='commander'?'- Você conduz: siga a pauta pelo que ainda falta (veja "## Pauta"), faça uma ou duas perguntas por vez, resuma o que ficou decidido e escreva o briefing assim que ele estiver claro. Quando o assunto for de um colega, passe a palavra a ele com "next" em vez de responder ou escrever no lugar dele.':'- O comandante conduz a reunião. Responda à sua parte, escreva os seus campos e, se precisar de uma decisão, pergunte à pessoa. A próxima mensagem da pessoa volta sozinha para o comandante: não devolva a palavra só por devolver.',
  prev.length?`- ${names(prev)} já falou nesta rodada (veja "## Nesta rodada"): não repita o que foi dito, complemente com a sua parte.`:'',
  '- Fale com a pessoa, como numa chamada, sem conversar só entre vocês. Cite os colegas sempre com @CODINOME (ex.: @'+(mates[0]?.name||'ECHO')+'), como no Teams. Para passar a palavra, escreva @CODINOME no texto e mande "next".',
  '- A pessoa direciona perguntas com @: quando ela marcar você, responda direto a ela.',
  pool.length?`- Colegas da squad fora da reunião: ${pool.map(x=>`${x.name} (${roleLabel(x)})`).join(', ')}. Se uma demanda precisar da especialidade de um deles, chame-o com "invite": ele entra na chamada, responde a demanda e sai.`:'']
  :['# Modo co-escrita de documento do projeto (SQUAD/CODE)',`Você está co-escrevendo com a pessoa os documentos de uma operação, dentro do SQUAD/CODE. Não execute nada, não use ferramentas e não escreva código.`];
 return[...head,`- Responda em português do Brasil, com mensagens curtas de chat (até ${group.length?4:5} frases), no jeito da sua SOUL. Se faltar informação importante, faça no máximo 2 perguntas.`,'- A mensagem é conversa: texto corrido, sem travessões, sem listas e sem negrito. Markdown, listas e subtítulos ficam só dentro dos campos do JSON, sempre sem emojis.','- Se houver o que atualizar, uma pergunta com opções ou um colega para chamar, termine com UM bloco ```json contendo só as chaves necessárias:','  - "ask": {"question": "pergunta curta", "options": ["opção 1", "opção 2"]} para perguntar com 2 a 4 opções curtas de escolha única. As opções viram botões e a pessoa também pode responder escrevendo. Use quando uma escolha ajudar a decidir; a pergunta vai só aí, não a repita no texto;',...fields.map(f=>keys[f.field]),
  adrs?`  - "adrs": lista só com os ADRs que você registra ou revisa, cada um {"ref": "ADR-002", "title": "título curto da decisão", "status": "Proposto", "content": "## Contexto\\n...\\n\\n## Decisão\\n...\\n\\n## Consequências\\n..."}. Use "ref" apenas para revisar um ADR que já existe (mande o ADR inteiro); sem "ref" o ADR é novo. Status: ${ADR_STATUS.join(', ')}.`:'',
  mates.length?`  - "next": o codinome de um colega (${names(mates)}) para falar logo depois de você, quando a parte dele for necessária agora; cite-o com @ no texto. No máximo um.`:'',
  pool.length?'  - "invite": [{"agent": "CODINOME", "reason": "o que ele precisa resolver"}] para chamar colegas da squad que não estão na reunião (no máximo dois); cite-os com @ no texto. Eles falam logo depois de você;':'',
  rest.length||(def.adrs&&!adrs)?`- ${teamsNames([...rest.map(label),...(def.adrs&&!adrs?['os ADRs']:[])])} são dos colegas: não mande essas chaves; se precisar deles agora, use "next".`:'',
  '- Nas listas, escreva só o texto de cada item, sem marcadores.','- Parta do conteúdo atual dos documentos: preserve o que a pessoa escreveu e mude só o necessário. Cada valor do JSON substitui o campo inteiro.','- Use o briefing, as features e os outros documentos do projeto como contexto, sem contradizê-los.',`- Siga as suas diretrizes de ${fam==='adr'?'ADR e arquitetura':fam==='commander'?'comando':'PRD'}.`].filter(Boolean).join('\n');
}
// Agenda of the meetup from the Documentos tab (filled like projectGaps checks it): top bar chips and "## Pauta" of the prompt.
function teamsValue(field){return String(document.getElementById(FE_FIELD_ID[field])?.value||'').trim();}
function teamsAgenda(){const adrs=adrValues($('#docAdrList')),okAdrs=adrs.length&&adrs.every(x=>x.title.trim()&&x.content.trim());return TEAMS_AGENDA.map(([key,label,fields,withAdrs])=>{const filled=fields.every(f=>teamsValue(f));let detail=fields.map(f=>feCount(f,teamsValue(f))).join(' / ');if(withAdrs)detail+=` · ${adrs.length?`${adrs.length} ADR${adrs.length>1?'s':''}${okAdrs?'':' (incompleto)'}`:'nenhum ADR'}`;return{key,label,field:fields[0],done:filled&&(!withAdrs||okAdrs),detail};});}
function docCoWritePrompt(a,c,msgs,turn){
 const def=PROJECT_DOCS[c.doc],pf=$('#projectForm'),cur=ui.opsNew||project(),q=docSquad(),fv=k=>String(pf?.elements.namedItem(k)?.value??cur[k]??'').trim(),mv=el=>(document.getElementById(el)?.value||'').trim(),num=i=>'ADR-'+String(i+1).padStart(3,'0');
 // This round's replies go in their own section below, after the person's new messages.
 const round=turn?.round||[],skip=new Set([...msgs.map(m=>m.id),...round.map(r=>r.mid).filter(Boolean)]),who=m=>m.role==='user'?'Pessoa':agentById(m.agentId)?.name||a.name;
 const team=(q?.agentIds||[]).map(agentById).filter(Boolean).map(x=>`- ${x.name}: ${roleLabel(x)}${x.id===a.id?' (você)':c.group?.includes(x.id)?' (na reunião)':''}`).join('\n');
 const feats=ui.opsNew?fv('features').split('\n').map(t=>t.trim()).filter(Boolean).map(t=>`- ${t}`).join('\n'):cur.sprints.map(s=>{const fs=sprintFeatures(s,cur);return fs.length?`### ${s.name}${s.goal?`: ${s.goal}`:''}\n${fs.map(f=>`- ${f.key}: ${f.title} (${SCOPES[f.scope]||f.scope}, ${f.priority})`).join('\n')}`:'';}).filter(Boolean).join('\n');
 const guests=[...(c.guests||[])].map(([id,g])=>`- ${agentById(id)?.name||id}: chamado por ${g.by}${g.reason?`, para: ${g.reason}`:''}`).join('\n'),called=c.guests?.get(a.id);
 const adrs=def.adrs?adrValues($('#docAdrList')).map((x,i)=>`#### ${num(i)}: ${x.title.trim()||'(sem título)'} (${x.status})\n${acClip(x.content,1200)||'(sem conteúdo)'}`).join('\n\n'):'';
 const now=def.fields.map(f=>`### ${FE_FIELD_LABEL[f.field]}\n${mv(f.id)||'(vazio)'}`).join('\n\n')+(def.adrs?`\n\n### ADRs\n${adrs||'(nenhum registrado)'}`:'');
 const agenda=teamsAgenda().map(x=>`- ${x.label}: ${x.done?'ok':'falta'} (${x.detail})`).join('\n');
 const hellos=(c.group||[c.agentId]).map(id=>[agentById(id)?.name||a.name,chatGreeting(c,agentById(id))]).filter(([,t])=>t).map(([n,t])=>`${n}: ${t}`);
 const history=[...hellos,...c.messages.filter(m=>!skip.has(m.id)&&m.role!=='system').slice(-14).map(m=>`${who(m)}: ${m.text}`)].join('\n\n');
 const tagged=c.group?teamsMentions(c,msgs.map(m=>m.text).join('\n')):[];
 const said=round.map(r=>`${r.agent.name}: ${r.text}${r.updated.length?`\n(atualizou: ${r.updated.map(k=>FE_FIELD_LABEL[k]).join(', ')})`:''}`).join('\n\n');
 return[`# Agent Teams · kickoff de ${cur.code} ${fv('name')||cur.name||'Nova operação'}`,team?`## Squad ${q.name}\n${team}`:'',guests?`## Convidados na reunião\n${guests}`:'',called?`## Por que você está aqui\n${called.by==='Você'?'A pessoa':called.by} chamou você para: ${called.reason||'contribuir com a sua especialidade'}. Responda essa demanda; depois você sai da chamada.`:'',feats?`## Features\n${feats}`:'',`## Pauta\n${agenda}`,
  `## Documentos agora (a pessoa pode ter editado)\n${now}`,`## Conversa até aqui\n${history}`,`## ${msgs.length>1?'Novas mensagens':'Nova mensagem'} da pessoa${tagged.length?` (marcou ${tagged.map(x=>'@'+x.name).join(', ')})`:''}\n${msgs.map(m=>m.text).join('\n\n')}`,said?`## Nesta rodada\n${said}\n\nAgora é a sua vez, ${a.name}.`:''].filter(Boolean).join('\n\n');
}
/* Meetup screen: top bar (clock, agenda, tabs, save, leave), stage (agent tiles in a gallery or a shared screen while an agent writes)
   and the side panel (chat and Documentos). The tiles follow the chat state (c.speakerId + c.phase: thinking, speaking, sharing). */
const TEAMS_STATE={thinking:'<i></i><i></i><i></i>pensando',speaking:'<span class="at-eq"><i></i><i></i><i></i><i></i></span>falando',sharing:'compartilhando',typing:'<i></i><i></i><i></i>digitando'};
function openAgentTeams(){
 if(!guardMutation())return;if(!liveMode())return toast('O Agent Teams usa o Claude Code real: rode npm start e abra http://127.0.0.1:4317 com a execução ligada.','error');
 const def=PROJECT_DOCS.kickoff,pf=$('#projectForm'),cur=ui.opsNew||project(),list=docAgents('kickoff');if(!list.length)return toast('A squad desta operação não tem comandante nem reconhecedores.','error');
 const vals=Object.fromEntries(def.fields.map(f=>[f.field,pf?.elements.namedItem(f.name)?.value??cur[f.field]??''])),adrs=pf?adrValues(pf.querySelector('#adrList')):clone(cur.adrs||[]);
 ui.docChat=newDocChat('kickoff',list);const c=ui.docChat;
 showModal('AGENT TEAMS',`${cur.code} / KICKOFF`,teamsHTML(cur,list,vals,adrs),'','agent-teams','teams');ui.teamsT0=performance.now();
 c.snapshot=teamsSnapshot();teamsSideSet(state.settings.teamsChat||0);teamsTick();clearInterval(ui.teamsTimer);ui.teamsTimer=setInterval(teamsTick,1000);teamsSync();
 renderFeatureChat(()=>teamsOpening(c));
}
function teamsHTML(cur,list,vals,adrs){
 const def=PROJECT_DOCS.kickoff,name=$('#projectForm')?.elements.namedItem('name')?.value.trim()||cur.name||'Nova operação',send='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
 return`<div class="at" id="atRoot" data-tab="chat">
<header class="at-bar"><div class="at-brand"><span class="at-logo">${icon('video')}</span><div><strong>Agent Teams</strong><small>Kickoff · ${E(cur.code)} ${E(name)}</small></div></div><span class="at-clock" id="atClock" title="Duração da reunião">00:00</span>
<nav class="at-agenda" id="atAgenda" aria-label="Pauta da reunião"></nav>
<div class="at-actions"><div class="at-tabs" role="tablist"><button type="button" role="tab" data-action="teams-tab" data-tab="chat" class="on" aria-selected="true">${icon('chat')}Chat<i class="at-unread" id="atUnread" hidden></i></button><button type="button" role="tab" data-action="teams-tab" data-tab="docs" aria-selected="false">${icon('file')}Documentos <em id="atDocCount"></em></button></div><button class="btn primary sm" type="submit" form="docForm">${icon('check')}${ui.opsNew?'Aplicar ao formulário':'Salvar no projeto'}</button><button type="button" class="btn sm at-leave" data-action="teams-leave">${icon('leave')}Sair</button></div>
<div class="at-confirm" id="atConfirm" hidden><span>Sair sem salvar os documentos?</span><button type="button" class="btn primary sm" data-action="teams-save-leave">Salvar e sair</button><button type="button" class="btn danger sm" data-action="teams-leave-now">Sair sem salvar</button><button type="button" class="btn ghost sm" data-action="teams-stay">Continuar</button></div></header>
<section class="at-stage" id="atStage" data-mode="gallery" aria-label="Participantes"><div class="at-tiles" data-n="${list.length + 1}" style="--n:${list.length + 1}">${list.map((a, i) => teamsTileHTML(a, i)).join('')}<figure class="at-tile you" data-state="idle" style="--i:${list.length}"><span class="at-you">${icon('user')}</span><span class="at-tile-state"></span><figcaption class="at-plate"><strong>Você</strong><small>${E(cur.code)}</small></figcaption></figure></div>
<div class="at-screen" id="atScreen" hidden><header class="at-screen-head" id="atScreenWho"></header><div class="at-screen-body conv-md" id="atScreenBody"></div><button type="button" class="btn ghost sm at-unshare" data-action="teams-unshare">Voltar à galeria</button></div></section>
<div class="at-split" id="atSplit" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="atSide" aria-label="Largura do chat" title="Arraste para redimensionar o chat (duplo clique volta ao padrão)"></div>
<aside class="at-side" id="atSide"><div class="at-pane at-chat fe-chat" data-pane="chat" aria-label="Chat da reunião"><div class="fe-msgs" id="feMsgs" aria-live="polite"></div><button type="button" class="fe-jump" id="feJump" data-action="fe-jump" hidden>Nova mensagem ↓</button>
<div class="fe-compose"><div class="fe-suggest" id="feSuggest">${def.quick.map(([l,t])=>`<button type="button" data-action="fe-quick" data-text="${E(t)}">${l}</button>`).join('')}</div><div class="at-mention-menu" id="atMention" role="listbox" aria-label="Marcar participante" hidden></div><div class="at-to" id="atTo" aria-live="polite"></div><div class="fe-pill"><textarea id="feChatInput" rows="1" maxlength="4000" placeholder="Digite uma mensagem. Use @ para marcar alguém" aria-label="Mensagem para a reunião" autofocus></textarea><button type="button" class="fe-send" data-action="fe-send" aria-label="Enviar" title="Enviar (Enter)" disabled>${send}</button></div></div></div>
<div class="at-pane at-docs" data-pane="docs" hidden><form id="docForm" class="fe-form doc-form" novalidate><p class="hint doc-hint">Vai para <code>docs/project/</code> e <code>docs/architecture/</code> na exportação para o Claude Code. Edite à vontade: os agentes partem do que estiver aqui.</p>${def.fields.map(f=>feMdFieldHTML(f,vals[f.field]||'')).join('')}<div class="field full doc-adrs"><span class="label adr-label">DECISÕES DE ARQUITETURA (ADR)</span><div class="adr-list" id="docAdrList">${adrs.map(adrBlockHTML).join('')}</div><button type="button" class="btn ghost sm" data-action="adr-add">${icon('plus')}Adicionar ADR</button></div></form></div></aside></div>`;
}
function teamsTileHTML(a,i,guest=false){return`<figure class="at-tile${guest?' guest':''}" data-agent="${E(a.id)}" data-state="idle" style="--i:${i}${guest?`;--crt-t:${(-(performance.now()-(ui.teamsT0||0))/1000).toFixed(3)}s`:''}" data-action="teams-mention" data-name="${E(a.name)}" title="Marcar @${E(a.name)} no chat"><img class="at-tile-bg" src="${portrait(a)}" alt=""><img class="at-tile-face" src="${portrait(a)}" alt="${E(a.name)}"><span class="at-tile-state"></span><span class="at-tile-typing" aria-hidden="true"><i></i><i></i><i></i></span>${guest?'<span class="at-guest-tag">CONVIDADO</span>':''}<figcaption class="at-plate"><strong>${E(a.name)}</strong><small>${E(coWriteRoleTag(a))}${a.role==='commander'?' · ORGANIZADOR':''}</small></figcaption></figure>`;}
// Guest cameras join before "Você" and leave with a short fade; the grid takes 3 or 4 columns as the call grows (data-n / --n).
function teamsTilesCount(){const box=$('#atRoot .at-tiles');if(!box)return;const n=box.querySelectorAll('.at-tile:not(.leaving)').length;box.dataset.n=n;box.style.setProperty('--n',n);}
function teamsAddTile(a){const box=$('#atRoot .at-tiles');if(!box||box.querySelector(`[data-agent="${CSS.escape(a.id)}"]`))return;box.querySelector('.at-tile.you')?.insertAdjacentHTML('beforebegin',teamsTileHTML(a,0,true));teamsTilesCount();}
function teamsRemoveTile(id){const el=$(`#atRoot .at-tile[data-agent="${CSS.escape(id)}"]`);if(!el)return;el.classList.add('leaving');teamsTilesCount();setTimeout(()=>{el.remove();teamsTilesCount();},feReduced()?0:450);}
function teamsSnapshot(){return JSON.stringify([PROJECT_DOCS.kickoff.fields.map(f=>teamsValue(f.field)),adrValues($('#docAdrList'))]);}
function teamsDirty(){const c=ui.docChat;return!!c&&ui.modal==='teams'&&c.snapshot!==teamsSnapshot();}
function teamsTick(){const el=$('#atClock'),c=ui.docChat;if(!el||!c){clearInterval(ui.teamsTimer);return;}const s=Math.floor((performance.now()-(ui.teamsT0||0))/1000),h=Math.floor(s/3600),p=n=>String(n).padStart(2,'0');el.textContent=`${h?h+':':''}${p(Math.floor(s/60)%60)}:${p(s%60)}`;}
function teamsStop(){clearInterval(ui.teamsTimer);ui.teamsTimer=null;}
// Sair: the meetup powers off like a CRT (flash, the screen collapses to a bright line, then a dot). closeModal hands the overlay to
// the page as an inert ghost (ids stripped, so the next modal's #feMsgs/#feChatInput are found first; .at-off freezes its animations)
// and tears the modal down at once; the ghost removes itself. Skipped with reduced motion. The clock (teamsTick) counts from ui.teamsT0,
// set on every open, so it restarts even when the conversation is restored from ui.docChats.
function teamsPowerOff(){const ov=$('#modalRoot>.overlay');if(!ov||feReduced())return;ov.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));ov.setAttribute('inert','');ov.setAttribute('aria-hidden','true');ov.classList.add('at-off');document.body.appendChild(ov);setTimeout(()=>ov.remove(),860);}
// Tiles, agenda chips and the Documentos counter follow the chat; the shared screen follows c.sharing. No-op outside the meetup.
function teamsSync(){
 if(ui.modal!=='teams')return;const c=ui.docChat,root=$('#atRoot');if(!c||!root)return;
 for(const t of root.querySelectorAll('.at-tile[data-agent]')){const st=c.busy&&c.speakerId===t.dataset.agent&&c.phase?c.phase:'idle';if(t.dataset.state!==st){t.dataset.state=st;t.querySelector('.at-tile-state').innerHTML=TEAMS_STATE[st]||'';}}
 const you=root.querySelector('.at-tile.you'),ys=$('#feChatInput')?.value.trim()?'typing':'idle';if(you&&you.dataset.state!==ys){you.dataset.state=ys;you.querySelector('.at-tile-state').innerHTML=TEAMS_STATE[ys]||'';}
 // "Para:" above the field: who will answer the message being written (the @tagged, else the pending question's author or the commander).
 const to=$('#atTo');if(to&&c.group){const val=$('#feChatInput')?.value||'',calling=teamsMentionsPool(c,val),tagged=teamsMentions(c,val),next=tagged.length||calling.length?tagged:docTurnCrew(c,[{text:''}]),line=next.length||calling.length?`Para ${[...calling.map(a=>`<b>@${E(a.name)}</b> <span>entra na chamada</span>`),...next.map(a=>`<b>@${E(a.name)}</b>`)].join(' ')}${tagged.length||calling.length?'':` <span>${next[0].id===c.group[0]?'conduz a reunião':'responde à pergunta dele'}</span>`}`:'';if(to.innerHTML!==line)to.innerHTML=line;}
 const ag=teamsAgenda(),html=ag.map(x=>`<button type="button" class="at-chip${x.done?' done':''}" data-action="teams-agenda" data-field="${x.field}" title="${E(x.label)}: ${E(x.detail)}"><i></i>${E(x.label)}</button>`).join(''),bar=$('#atAgenda');if(bar&&bar.dataset.html!==html){bar.innerHTML=html;bar.dataset.html=html;}
 const n=$('#atDocCount');if(n)n.textContent=`${ag.filter(x=>x.done).length}/${ag.length}`;
 const stage=$('#atStage'),sc=$('#atScreen'),s=c.sharing,mode=s?'share':'gallery';if(stage&&stage.dataset.mode!==mode){stage.dataset.mode=mode;sc.hidden=!s;}
 if(s){const a=agentById(s.agentId),live=c.busy&&c.speakerId===s.agentId,head=`${a?`<img src="${portrait(a)}" alt="">`:''}<span><b>${E(a?.name||'AGENTE')}</b> ${live?'está compartilhando':'compartilhou'}</span><em>${E(s.field==='adrs'?'Decisões de arquitetura (ADR)':FE_FIELD_LABEL[s.field]||'')}</em>`,w=$('#atScreenWho');if(w&&w.innerHTML!==head)w.innerHTML=head;}
}
// The agent "shares its screen" while it writes a field: the stage shows the field rendered, revealed block by block.
function teamsShow(c,a,field){
 if(ui.modal!=='teams'||!c?.group||chatNow()!==c)return;c.sharing={agentId:a?.id||c.speakerId,field};c.phase='sharing';teamsSync();
 const body=$('#atScreenBody');if(!body)return;const def=DOC_MD.find(d=>d.field===field);
 body.innerHTML=field==='adrs'?(adrValues($('#docAdrList')).map((x,i)=>`<section class="at-adr"><h3>ADR-${String(i+1).padStart(3,'0')}: ${E(x.title||'(sem título)')} <em>${E(x.status)}</em></h3>${renderMarkdown(x.content||'')}</section>`).join('')||'<p class="fe-md-empty">Nenhum ADR registrado.</p>'):`<h2 class="at-screen-title">${E(def?.label||'')}</h2>${def?feViewHTML(def,teamsValue(field)):''}`;
 body.scrollTop=0;if(feReduced())return;const parts=[...body.querySelectorAll('p,li,h3,h4,h5,h6,pre,.at-adr')];parts.forEach((n,i)=>n.style.setProperty('--i',Math.min(i,24)));body.classList.remove('fe-writing');void body.offsetWidth;body.classList.add('fe-writing');
}
function teamsTab(tab){
 const root=$('#atRoot');if(!root)return;root.dataset.tab=tab;root.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==tab);root.querySelectorAll('[data-action="teams-tab"]').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));});
 if(tab==='docs')$$('#docForm .fe-area').forEach(autoGrow);else{const u=$('#atUnread');if(u)u.hidden=true;const box=$('#feMsgs');if(box)box.scrollTop=box.scrollHeight;$('#feChatInput')?.focus();}
}
function teamsAgendaOpen(field){teamsTab('docs');const el=field==='architecture'?document.getElementById(FE_FIELD_ID.architecture)?.closest('.fe-md'):document.getElementById(FE_FIELD_ID[field])?.closest('.fe-md');if(!el)return;el.classList.remove('collapsed');el.scrollIntoView({block:'start',behavior:feReduced()?'auto':'smooth'});el.classList.remove('fe-updated');void el.offsetWidth;el.classList.add('fe-updated');setTimeout(()=>el.classList.remove('fe-updated'),1400);}
// Scripted opening (no run): after the greetings the commander presents the agenda by what is missing.
function teamsOpening(c){
 if(chatNow()!==c||c.messages.length||c.busy)return;const a=agentById(c.group?.[0]||c.agentId);if(!a)return;
 const ag=teamsAgenda(),miss=ag.filter(x=>!x.done).map(x=>x.label.toLowerCase()),done=ag.filter(x=>x.done).map(x=>x.label.toLowerCase());
 const text=!miss.length?'Os documentos já estão preenchidos. Querem revisar algum ponto antes de salvar? É só dizer por onde começamos.':!done.length?`A pauta de hoje é ${teamsNames(miss)}. Vou conduzindo e chamo cada um na hora certa. Para começar: que problema esse produto resolve e para quem?`:`Já temos ${teamsNames(done)}. Falta ${teamsNames(miss)}. Seguimos por aí ou você quer revisar algo do que já está escrito?`;
 c.busy=true;c.speakerId=a.id;c.phase='thinking';chatWho(a);chatTyping(true);teamsSync();
 setTimeout(()=>{if(chatNow()!==c)return;chatTyping(false);chatPush({role:'agent',agentId:a.id,text});c.busy=false;c.speakerId=null;c.phase=null;chatWho(null);teamsSync();if(c.queue.length)runCoWrite(c.queue.splice(0));},feReduced()?0:900);
}
// Leaving with unsaved documents asks in the top bar (confirmAction would replace this modal).
function teamsLeave(){if(teamsDirty()){const box=$('#atConfirm');if(box){box.hidden=false;box.querySelector('.btn.primary')?.focus();}return;}closeModal();}
// Composer mentions: "@" opens the participants filtered by what follows (codename or role); ↑/↓ and Enter/Tab pick (capture
// listener), Esc closes. Picking, or clicking a tile or a mention in the chat, writes "@CODENAME ".
function teamsMentionQuery(){const i=$('#feChatInput');if(!i)return null;const upto=i.value.slice(0,i.selectionStart??i.value.length),m=upto.match(/(^|\s)@([\p{L}\p{N}-]*)$/u);return m?{q:m[2].toLowerCase(),start:upto.length-m[2].length-1}:null;}
function teamsMentionMenu(){
 const box=$('#atMention'),c=ui.docChat;if(!box||!c?.group)return;const q=teamsMentionQuery();
 const match=a=>!q.q||a.name.toLowerCase().startsWith(q.q)||(DOC_ROLE_WORDS[a.role]||[]).some(w=>w.startsWith(q.q));
 // In the meeting first, then the squad members outside it ("Convidar": tagging one calls it in).
 const here=q?c.group.map(agentById).filter(Boolean).filter(match):[],invite=q?teamsPool(c).filter(match):[],all=[...here,...invite];
 if(!all.length)return teamsMentionClose();
 const keep=box.querySelector('.on')?.dataset.name,on=all.some(a=>a.name===keep)?keep:all[0].name;
 const item=(a,tag)=>`<button type="button" role="option" class="at-mention-item${a.name===on?' on':''}" data-action="teams-mention-pick" data-name="${E(a.name)}" aria-selected="${a.name===on}"><img src="${portrait(a)}" alt=""><b>@${E(a.name)}</b><small>${E(tag)}</small></button>`;
 box.innerHTML=here.map(a=>item(a,c.guests.has(a.id)?'CONVIDADO':coWriteRoleTag(a))).join('')+(invite.length?`<div class="at-mention-head">Convidar para a reunião</div>${invite.map(a=>item(a,coWriteRoleTag(a))).join('')}`:'');box.hidden=false;
}
function teamsMentionClose(){const b=$('#atMention');if(b&&!b.hidden){b.hidden=true;b.innerHTML='';}}
function teamsMentionPick(name){const i=$('#feChatInput'),q=teamsMentionQuery();if(!i||!q)return teamsMentionInsert(name);const end=i.selectionStart??i.value.length,ins=`@${name} `;i.value=i.value.slice(0,q.start)+ins+i.value.slice(end);const pos=q.start+ins.length;i.focus();i.setSelectionRange(pos,pos);teamsMentionClose();autoGrow(i);feSendState();teamsSync();}
function teamsMentionInsert(name){
 if($('#atRoot')?.dataset.tab!=='chat')teamsTab('chat');const i=$('#feChatInput');if(!i)return;if(teamsMentionQuery())return teamsMentionPick(name);
 const s=i.selectionStart??i.value.length,before=i.value.slice(0,s),ins=`${before&&!/\s$/.test(before)?' ':''}@${name} `;i.value=before+ins+i.value.slice(i.selectionEnd??s);const pos=s+ins.length;i.focus();i.setSelectionRange(pos,pos);autoGrow(i);feSendState();teamsSync();
}
// Chat width: drag the bar between the stage and the panel (pointer capture), ←/→ by 24 px, Home/End go to the limits, double click
// goes back to the default. Kept in the workspace (state.settings.teamsChat, 0 = default); CSS also caps it at 60vw.
function teamsSideLimits(){const w=$('#atRoot')?.getBoundingClientRect().width||innerWidth;return[300,Math.max(300,Math.round(w*.6))];}
function teamsSideSet(px,persist){
 const root=$('#atRoot');if(!root)return;const [lo,hi]=teamsSideLimits();px=px?Math.round(Math.min(hi,Math.max(lo,px))):0;
 if(px)root.style.setProperty('--at-side',px+'px');else root.style.removeProperty('--at-side');
 const split=$('#atSplit');if(split){split.setAttribute('aria-valuemin',lo);split.setAttribute('aria-valuemax',hi);split.setAttribute('aria-valuenow',Math.round($('#atSide')?.getBoundingClientRect().width||px||lo));}
 if(persist&&state.settings.teamsChat!==px){state.settings.teamsChat=px;save();}
}
function teamsSplitDrag(event){
 const split=event.target.closest?.('#atSplit');if(!split||event.button>0)return;event.preventDefault();split.focus();split.setPointerCapture?.(event.pointerId);document.body.classList.add('at-resizing');
 const right=$('#atRoot').getBoundingClientRect().right;let px=0;const move=e=>{px=right-e.clientX;teamsSideSet(px);};
 const up=()=>{split.removeEventListener('pointermove',move);split.removeEventListener('pointerup',up);split.removeEventListener('pointercancel',up);document.body.classList.remove('at-resizing');if(px)teamsSideSet(px,true);};
 split.addEventListener('pointermove',move);split.addEventListener('pointerup',up);split.addEventListener('pointercancel',up);
}
function teamsSplitKey(event){const [lo,hi]=teamsSideLimits(),cur=$('#atSide')?.getBoundingClientRect().width||384,px={ArrowLeft:cur+24,ArrowRight:cur-24,Home:lo,End:hi}[event.key];if(px==null)return;event.preventDefault();teamsSideSet(px,true);}
// Agent reply: list fields become one item per line; ADRs with "ref" revise that block, the others are appended.
async function applyDocWrite(result,cost,meta={}){
 const c=ui.docChat,def=PROJECT_DOCS[c?.doc];if(!c||!def)return null;const {reply,data}=parseCoWrite(result),changes=[];
 const item=x=>x&&typeof x==='object'?[x.term??x.termo??x.title??x.name,x.definition??x.definicao??x.description].filter(Boolean).join(': '):String(x??'');
 const lines=v=>(Array.isArray(v)?v.map(item):String(v??'').split('\n')).map(x=>x.trim().replace(/^(?:[-*•]|\d+[.)])\s+/,'')).filter(Boolean).join('\n');
 // A meetup guest only talks (and may ask): the documents keep their owners, and it neither passes the word nor calls others.
 const guest=!!(meta.agent&&c.guests?.has(meta.agent.id));
 if(data&&typeof data==='object'&&!guest){
  for(const f of def.fields){if(!(f.field in data))continue;const raw=data[f.field],v=f.list?lines(raw):typeof raw==='string'?raw.trim():null,el=document.getElementById(f.id);if(v===null||!el||el.value.trim()===v)continue;changes.push({field:f.field,value:v.slice(0,f.max||8000)});}
  if(def.adrs&&Array.isArray(data.adrs)){const v=data.adrs.filter(x=>x&&typeof x==='object'&&String(x.title||x.ref||'').trim()).slice(0,50).map(x=>({ref:String(x.ref||'').trim(),title:String(x.title||'').trim().slice(0,120),status:ADR_STATUS.includes(x.status)?x.status:'',content:String(x.content||'').trim().slice(0,12000)}));if(v.length)changes.push({field:'adrs',value:v});}
 }
 // Meetup: "next" passes the word to a colleague of the meeting, who speaks right after in this round (runCoWrite).
 if(meta.out&&c.group&&!guest&&data&&typeof data==='object'&&data.next){const n=String(Array.isArray(data.next)?data.next[0]:data.next).trim().replace(/^@/,'').toUpperCase(),x=c.group.map(agentById).find(g=>g&&g.name.toUpperCase()===n&&g.id!==meta.agent?.id);if(x)meta.out.next=x;}
 // "invite" calls squad members outside the meeting (at most 2 per reply), each with what it has to solve.
 if(meta.out&&c.group&&!guest&&data&&typeof data==='object'&&data.invite){
  const pool=teamsPool(c),seen=new Set();
  meta.out.invite=(Array.isArray(data.invite)?data.invite:[data.invite]).map(x=>{const obj=x&&typeof x==='object',name=String(obj?x.agent??x.name??x.codename??'':x).trim().replace(/^@/,'').toUpperCase(),a=pool.find(p=>p.name.toUpperCase()===name);if(!a||seen.has(a.id))return null;seen.add(a.id);return{agent:a,reason:String(obj?x.reason??x.motivo??x.task??'':'').trim().slice(0,200)};}).filter(Boolean).slice(0,2);
 }
 return chatApply(c,reply,data,changes,cost,meta);
}
function applyDocAdrs(items){
 const list=$('#docAdrList');if(!list)return;const hit=[];
 for(const x of items){const n=parseInt(x.ref.match(/\d+/)?.[0],10),b=n>0?list.children[n-1]:null;
  if(b){if(x.title)b.querySelector('[name=adrTitle]').value=x.title;if(x.status)b.querySelector('[name=adrStatus]').value=x.status;if(x.content)b.querySelector('[name=adrContent]').value=x.content;hit.push(b);}
  else if(x.title&&list.children.length<50){list.insertAdjacentHTML('beforeend',adrBlockHTML({id:id('adr'),title:x.title,status:x.status||'Proposto',content:x.content||ADR_SKELETON},list.children.length));hit.push(list.lastElementChild);}}
 renumberAdrs(list);hit.forEach(b=>{b.classList.remove('fe-updated');void b.offsetWidth;b.classList.add('fe-updated');setTimeout(()=>b.classList.remove('fe-updated'),1800);});
 hit[0]?.scrollIntoView({block:'nearest',behavior:feReduced()?'auto':'smooth'});
}
function setDocAdrs(list){const el=$('#docAdrList');if(el)el.innerHTML=list.map(adrBlockHTML).join('');}
function docChatStop(discard=false){
 const c=ui.docChat;if(!c)return;if(c.runId)bridgeFetch(`/api/runs/${c.runId}/cancel`,{method:'POST'}).catch(()=>{});
 if(discard){teamsStop();for(const id of [...(c.guests?.keys()||[])])teamsGuestOut(c,id,true);chatStash(c);c.token=null;ui.docChat=null;}
}
function saveProjectDoc(form){
 const key=ui.docChat?.doc,def=PROJECT_DOCS[key];if(!def)return closeModal();
 const vals=def.fields.map(f=>[f.name,String(form.elements.namedItem(f.name)?.value||'').trim().slice(0,f.max||8000)]),adrs=def.adrs?adrValues($('#docAdrList')):null;
 closeModal();
 let pf=$('#projectForm');if(!pf){ui.view='projects';render();pf=$('#projectForm');if(!pf)return;}
 for(const [k,v] of vals){const el=pf.elements.namedItem(k);if(el)el.value=v;}
 if(adrs){const list=pf.querySelector('#adrList');if(list)list.innerHTML=adrs.map(adrBlockHTML).join('');}
 const creating=!!ui.opsNew;if(!creating)saveProject(pf);
 // Every place of the document on the page opens and lights up together: briefing, vision, scope, glossary and architecture.
 const val=Object.fromEntries(vals),rows=Object.entries(DOC_ROWS).filter(([,r])=>r.doc===key).map(([row,r])=>[$(`#projectForm [data-doc-row="${row}"]`),r]).filter(([el])=>el);
 for(const [el,r] of rows){
  if(creating){const b=el.querySelector('.ops-doc-badges');if(b)b.innerHTML=docBadges(r.fields.map(f=>val[f]||'').join(''),adrs&&r.fields.includes('architecture')?adrs.filter(x=>x.title.trim()).length:0);}
  if(el.tagName==='DETAILS')el.open=true;el.classList.remove('fe-updated');void el.offsetWidth;el.classList.add('fe-updated');setTimeout(()=>el.classList.remove('fe-updated'),1800);
 }
 if(creating)toast('Documentos preenchidos. Clique em Criar operação para registrar.');
 rows[0]?.[0].scrollIntoView({block:'nearest',behavior:feReduced()?'auto':'smooth'});
}
/* Agent chat: in the Squad view, clicking an agent opens a phone (iMessage) with it. The agent greets (SOUL), offers the options
   of its function (AGENT_CHAT_MENUS) and, with the bridge, talks freely (claude -p, no tools). It shares the chat engine and the
   DOM of the co-writing chat (chatNow): only one modal is open at a time. The conversation lives in memory per agent, for the session. */
const AGENT_CHAT_SYSTEM=['# Modo conversa no celular (SQUAD/CODE)','Você está trocando mensagens com a pessoa pelo celular do SQUAD/CODE, no seu papel na squad. Aqui é só conversa: não execute nada, não use ferramentas e não altere arquivos.','- Escreva como no WhatsApp ou no iMessage: mensagens curtas, normalmente de 1 a 3 frases. Vá além disso só se a pessoa pedir detalhes.','- Texto corrido, sem títulos, sem negrito e sem listas com marcadores. Se precisar citar vários itens, use uma frase ou linhas curtas sem marcador.','- Nunca use travessão (— ou –) nem hífen como pontuação.','- Emojis são bem-vindos quando combinarem com a sua SOUL e com o momento: no máximo um ou dois, nunca em toda mensagem e nunca vários seguidos.','- Use o contexto do projeto, da squad e das features abaixo. Se faltar informação, diga o que falta e, se fizer sentido, indique quem da squad pode ajudar.','- Não invente status de execução, entregas ou resultados de testes.','- Você não altera features, ADRs nem o plano por aqui: para isso, indique as opções do chat ou as telas do SQUAD/CODE.','- Responda sempre por texto. Para perguntar algo com opções, termine com UM bloco ```json {"ask": {"question": "pergunta curta", "options": ["opção 1", "opção 2"]}} com 2 a 4 opções curtas de escolha única: elas viram botões e a pessoa também pode responder escrevendo. Use só quando uma escolha ajudar; a pergunta vai só no bloco, não a repita no texto.'].join('\n');
// Options by function: [id, label, needs the bridge]. Without the bridge the free-talk options are hidden; the others work in demo mode.
const AGENT_CHAT_MENUS={
 prd:[['ask','Tirar uma dúvida',1],['edit','Editar uma feature'],['create','Criar nova feature'],['free','Falar livremente',1]],
 adr:[['ask','Tirar uma dúvida',1],['adrs','Ver ADRs do projeto'],['adr-new','Registrar um ADR'],['review','Revisar uma feature',1],['free','Falar livremente',1]],
 commander:[['status','Status da operação'],['distribute','Distribuir features'],['run','Iniciar operação'],['reviews','Revisões pendentes'],['free','Falar livremente',1]],
 op:[['mine','Minhas features'],['spawn','Spawn individual'],['ask','Tirar uma dúvida técnica',1],['free','Falar livremente',1]]
};
// Line above the options: after the greeting it does not ask again, it just points to the shortcuts (picked at random).
const AGENT_CHAT_MENU_LINES={first:['Se quiser, começa por um destes atalhos, ou é só me escrever 🙂','Deixei uns atalhos aqui embaixo, mas pode me escrever direto também.','Escolhe um atalho ou me manda uma mensagem, do jeito que preferir.'],firstOff:['Se ajudar, começa por um destes atalhos:','Deixei uns atalhos aqui embaixo para a gente começar.'],again:['Oi de novo! Seguimos por onde?','Voltei. Por onde a gente continua?'],menu:['Beleza, os atalhos estão aqui de novo.','Certo. O que mais eu posso fazer por você?']};
const AGENT_CHAT_ASK={prd:'Pode perguntar! Produto, escopo, critérios ou qualquer feature da operação.',adr:'Manda a dúvida: arquitetura, contratos, dados, integrações ou os ADRs do projeto.',commander:'Pode falar. Estou acompanhando a operação inteira.',op:'Pode perguntar! Stack, implementação, testes ou qualquer feature da minha rota.'};
const AC_MENU={id:'menu',label:'Voltar ao menu'};
function acMenuLine(kind){const l=AGENT_CHAT_MENU_LINES[kind==='first'&&!liveMode()?'firstOff':kind];return l[Math.floor(Math.random()*l.length)];}
function chatFamily(a){return a?.role==='commander'?'commander':a?.role==='architect'?'adr':a?.role==='po'?'prd':'op';}
function agentMenuOptions(a){const rev=project().features.filter(f=>f.status==='review').length;return AGENT_CHAT_MENUS[chatFamily(a)].filter(([,,live])=>!live||liveMode()).map(([id,label])=>({id,label:id==='reviews'&&rev?`${label} (${rev})`:label}));}
function acFeatureRow(f,id){return{id,arg:f.id,key:f.key,title:f.title,tag:STATUS[f.status]||f.status,tone:f.status};}
function acClip(t,n){t=String(t||'').trim();return t.length>n?t.slice(0,n).trimEnd()+'…':t;}
function acPickHTML(m){
 if(m.used||(!m.options?.length&&!m.list?.length))return'';const attrs=o=>`data-action="ac-opt" data-mid="${E(m.id)}" data-opt="${E(o.id)}" data-arg="${E(o.arg||'')}"`;
 return`<div class="ac-pick">${m.list?.length?`<div class="ac-list">${m.list.map(o=>`<button type="button" class="ac-list-row" ${attrs(o)}><b>${E(o.key||'')}</b><span>${E(o.title||o.label||'')}</span>${o.tag?`<em class="${E(o.tone||'')}">${E(o.tag)}</em>`:''}</button>`).join('')}</div>`:''}${m.options?.length?`<div class="ac-options">${m.options.map(o=>`<button type="button" class="ac-opt" ${attrs(o)}>${E(o.label)}</button>`).join('')}</div>`:''}${m.options?.some(o=>o.id==='ask')?'<small class="ac-hint">Ou escreva outra resposta.</small>':''}</div>`;
}
function agentPhoneHTML(a){
 const name=E(a.name),model=coWriterModel(a),now=new Date(),clock=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,send='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
 return`<div class="ac-phone"><div class="ac-screen fe-chat" role="group" aria-label="Conversa com ${name}">
<div class="ac-status"><span class="ac-clock">${clock}</span><span class="ac-island" aria-hidden="true"></span><span class="ac-icons" aria-hidden="true"><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg viewBox="0 0 16 12"><path d="M8 11.6 5.7 9.2a3.3 3.3 0 0 1 4.6 0Z"/><path d="M3.4 6.9a6.5 6.5 0 0 1 9.2 0l-1.5 1.5a4.4 4.4 0 0 0-6.2 0Z"/><path d="M1.1 4.6a9.8 9.8 0 0 1 13.8 0l-1.5 1.5a7.7 7.7 0 0 0-10.8 0Z"/></svg><svg viewBox="0 0 27 12" class="ac-battery"><rect x=".5" y=".5" width="23" height="11" rx="3.3"/><rect x="2" y="2" width="18" height="8" rx="2"/><path d="M25 4.2v3.6c.8-.3 1.3-1 1.3-1.8S25.8 4.5 25 4.2Z"/></svg></span></div>
<header class="fe-chat-head ac-head"><img src="${portrait(a)}" alt=""><div><div class="fe-chat-id"><strong>${name}</strong><span class="fe-model" title="${E(model.title)}">${E(model.label)}</span>${effortChipHTML(model.effort)}</div><small>${E(roleLabel(a).toUpperCase())}</small></div><button type="button" class="icon-button small ac-close" data-action="modal-close" aria-label="Fechar conversa" title="Fechar (Esc)">${icon('close')}</button></header>
<div class="fe-msgs" id="feMsgs" aria-live="polite"></div><button type="button" class="fe-jump" id="feJump" data-action="fe-jump" hidden>Nova mensagem ↓</button>
${liveMode()?`<div class="fe-compose"><div class="fe-pill"><textarea id="feChatInput" rows="1" maxlength="4000" placeholder="iMessage" aria-label="Mensagem para ${name}" autofocus></textarea><button type="button" class="fe-send" data-action="fe-send" aria-label="Enviar" title="Enviar (Enter)" disabled>${send}</button></div></div>`:`<div class="fe-compose offline"><p class="fe-note">As opções funcionam aqui mesmo. Para conversar livremente, conecte o Claude Code: rode <code>npm start</code> e abra <code>http://127.0.0.1:4317</code> com a execução ligada.</p></div>`}
<div class="ac-home" aria-hidden="true"></div></div></div>`;
}
function openAgentChat(agentId){
 const a=agentById(agentId);if(!a)return;if(ui.modal)closeModal();ui.selectedId=a.id;ui.dismissedId=null;render();
 const saved=ui.agentChats?.[a.id];
 ui.agentChat={kind:'agent',agentId:a.id,greeting:saved?.greeting||feGreeting(a),messages:saved?saved.messages.map(m=>({...m})):[],seq:saved?.seq||0,queue:[],busy:false,runId:null,started:0,token:null,read:true,opened:Date.now(),focus:saved?.focus||null,flow:null,greeted:!!saved};
 showModal(E(a.name),'CONVERSA',agentPhoneHTML(a),'','agent-phone','agent-chat');
 const c=ui.agentChat;renderFeatureChat(()=>agentChatMenu(c));
}
// Every time the chat opens, the agent offers the options of its function (once the greeting is on screen).
function agentChatMenu(c){const a=agentById(c?.agentId);if(!a||chatNow()!==c)return;const last=c.messages.at(-1);if(last?.menu&&!last.used)return;agentSay(c,{text:acMenuLine(c.messages.length?'again':'first'),options:agentMenuOptions(a),menu:true},c.messages.length?520:640);}
// Scripted reply: typing dots for a moment, then the bubble with its options. Messages typed meanwhile wait in the queue.
async function agentSay(c,msg,ms=560){
 if(chatNow()!==c)return false;c.busy=true;const row=$('#feMsgs .fe-typing-row');row?.classList.add('greet');chatTyping(true);await feWait(ms);
 if(chatNow()!==c)return false;row?.classList.remove('greet');chatTyping(false);chatPush({role:'agent',...msg});c.busy=false;
 if(c.queue.length)runAgentChat(c.queue.splice(0));return true;
}
// A tapped option goes out as the person's bubble; the agent answers it (text + new options, or opens the right screen).
async function agentChatChoose(mid,opt,arg=''){
 const c=chatNow();if(!c||c.busy)return;const m=c.messages.find(x=>x.id===mid);if(!m||m.used)return;
 const o=[...(m.list||[]),...(m.options||[])].find(x=>x.id===opt&&(x.arg||'')===arg);if(!o)return;
 // An answer to the agent's own question ("ask") goes back to it as the person's message, in both chats.
 if(o.id==='ask'){if(!liveMode())return toast('Conecte o bridge do Claude Code para responder.','error');c.read=false;const u=chatPush({role:'user',text:o.say});return c.kind==='agent'?runAgentChat([u]):runCoWrite([u]);}
 const a=c.kind==='agent'?agentById(c.agentId):null;if(!a)return;
 chatPush({role:'user',text:o.say||(o.key?`${o.key} · ${o.title}`:o.label)});
 await agentChatAct(c,a,opt,arg);
}
function operationStatusMD(p){
 const n=s=>p.features.filter(f=>f.status===s).length,and=l=>l.length>1?l.slice(0,-1).join(', ')+' e '+l.at(-1):l[0]||'',total=p.features.length,pct=total?Math.round(n('done')/total*100):0,who=agentById(activeAgent()),cur=activeFeature();
 if(!total)return`A operação ${p.name} ainda não tem features. Cadastre as primeiras no projeto que eu distribuo para a squad.`;
 const counts=[['done','concluída','concluídas'],['review','em revisão','em revisão'],['running','em execução','em execução'],['ready','pronta','prontas'],['blocked','bloqueada','bloqueadas'],['backlog','a fazer','a fazer']].filter(([k])=>n(k)).map(([k,one,many])=>`${n(k)} ${n(k)===1?one:many}`);
 const cs=currentSprint(p),csf=cs?sprintFeatures(cs,p):[],next=csf.filter(f=>f.status==='ready'&&f.route.length&&depsReady(f)).slice(0,3).map(f=>`${f.key} (${f.title})`);
 return[`A operação ${p.name} está em ${pct}%. ${total===1?'Tem 1 feature':`São ${total} features`}: ${and(counts)}.`,cs?`A sprint atual é ${cs.name}, com ${csf.filter(f=>f.status==='done').length} de ${csf.length} features concluídas.`:'',who?`Agora ${who.name} está com a ${cur?cur.key:'etapa atual'}${runner?.paused?', mas a operação está pausada':''}.`:runner?'A operação está rodando.':'Ninguém está executando agora, a squad está de prontidão.',next.length?(next.length===1?`A próxima da fila da sprint é a ${next[0]}.`:`Na fila da sprint, as próximas são ${and(next)}.`):''].filter(Boolean).join(' ');
}
// Project documentation (Arquitetura > ADRs) in the operation page; with add, a new ADR block ready to fill.
function openProjectAdrs(add){
 openOpsSection('opsBriefing');
 setTimeout(()=>{const list=$('#adrList');if(!list)return;const doc=list.closest('details');if(doc)doc.open=true;if(add)$('[data-action="adr-add"]')?.click();(add?list.lastElementChild:doc)?.scrollIntoView({behavior:'smooth',block:'center'});if(add)toast('ADR novo aberto na documentação do projeto. Clique em Salvar projeto para registrar.');},140);
}
async function agentChatAct(c,a,opt,arg){
 const p=project(),fam=chatFamily(a),f=featureById(arg),live=liveMode(),num=i=>'ADR-'+String(i+1).padStart(3,'0');
 const say=(text,x={})=>agentSay(c,{text,options:[...(x.options||[]),AC_MENU].filter(Boolean),list:x.list});
 const go=async(text,fn)=>{if(await agentSay(c,{text})){await feWait(380);if(chatNow()===c)fn();}};
 const listen=async text=>{await say(text);setTimeout(()=>$('#feChatInput')?.focus(),30);};
 const missing=()=>say('Não encontrei esse item. Ele pode ter sido removido.');
 c.flow=null;
 switch(opt){
  case 'menu':c.focus=null;return agentSay(c,{text:acMenuLine('menu'),options:agentMenuOptions(a),menu:true});
  case 'ask':c.focus=null;return listen(AGENT_CHAT_ASK[fam]);
  case 'free':c.focus=null;return listen('Manda. Estou ouvindo.');
  // PRD
  case 'edit':{const l=p.features.filter(x=>!['done','review','running'].includes(x.status));return l.length?say('Qual feature você quer editar?',{list:l.map(x=>acFeatureRow(x,'edit-pick'))}):say('Não há features para editar agora: todas estão em execução, em revisão ou concluídas.',{options:[{id:'create',label:'Criar nova feature'}]});}
  case 'edit-pick':return f?go(`Abrindo a ${f.key} no editor. Vamos nessa!`,()=>openFeatureEditor(f.id)):missing();
  case 'create':if(!live)return go('Abrindo o editor para uma nova feature.',()=>openFeatureEditor(null));await say('Me conta a ideia da feature em uma frase. Eu abro o editor e já começo a escrever com você.',{options:[{id:'create-blank',label:'Abrir editor em branco'}]});c.flow='create';setTimeout(()=>$('#feChatInput')?.focus(),30);return;
  case 'create-blank':return go('Abrindo o editor em branco.',()=>openFeatureEditor(null));
  // ADR
  case 'adrs':{const l=p.adrs||[];return l.length?say('Estas são as decisões registradas. Qual você quer ver?',{list:l.map((x,i)=>({id:'adr-pick',arg:x.id,key:num(i),title:x.title,tag:x.status,tone:'adr'}))}):say('Ainda não há ADRs registrados neste projeto.',{options:[{id:'adr-new',label:'Registrar um ADR'}]});}
  case 'adr-pick':{const l=p.adrs||[],i=l.findIndex(x=>x.id===arg),x=l[i];if(!x)return missing();return say(`${num(i)}: ${x.title} (${x.status}${x.date?', '+x.date:''}).\n\n${acClip(x.content,900)||'Ainda sem conteúdo.'}`,{options:[{id:'adr-open',label:'Abrir no projeto'},live&&{id:'adr-ask',arg:x.id,label:'Perguntar sobre este ADR'}]});}
  case 'adr-ask':c.focus={adr:arg};return listen('Pode mandar a pergunta sobre esse ADR.');
  case 'adr-open':return go('Abrindo as decisões de arquitetura do projeto.',()=>openProjectAdrs(false));
  case 'adr-new':return go('Vou abrir a documentação do projeto com um ADR novo para você preencher.',()=>openProjectAdrs(true));
  case 'review':{const l=p.features.filter(x=>x.status!=='done');return l.length?say('Qual feature eu reviso?',{list:l.map(x=>({...acFeatureRow(x,'review-pick'),say:`Revisa a arquitetura da ${x.key} · ${x.title}?`}))}):say('Não há features abertas para revisar.');}
  case 'review-pick':if(!f)return missing();c.focus={feature:f.id};return runAgentChat([c.messages.at(-1)],`Revise a arquitetura da feature ${f.key}: riscos, contratos de API, modelo de dados, integrações e ADRs relacionados. Diga o que precisa ser decidido antes de implementar.`);
  // Commander
  case 'status':return say(operationStatusMD(p),{options:[{id:'distribute',label:'Distribuir features'},{id:'run',label:'Executar sprint atual'},p.features.some(x=>x.status==='review')&&{id:'reviews',label:'Revisões pendentes'}]});
  case 'distribute':if(!p.briefing.trim())return say('Preciso do briefing antes de distribuir. Escreva o contexto da operação e me chame de novo.',{options:[{id:'open-briefing',label:'Abrir briefing'}]});return go('Vou montar o plano de distribuição.',()=>openDistribution());
  case 'run':{if(runner)return say('A operação já está em andamento. Acompanhe pelo mapa e pelo registro de transmissões.');{const miss=projectGaps(p);if(miss.length)return say(`Ainda não dá para executar: o projeto precisa estar completo antes. Falta preencher ${miss.join(', ')}.`,{options:[{id:'open-briefing',label:'Abrir briefing'}]});}refreshBlocked();const s=currentSprint(p),fs=s?sprintFeatures(s,p):[];
   if(fs.some(x=>x.status==='backlog'&&!routeFor(x).missing.length))return go(`${s.name} ainda tem features sem rota. Vou montar o plano dela primeiro, e você aplica e executa.`,()=>{closeModal();startRun();});
   if(fs.some(x=>x.status==='ready'&&x.route.length&&depsReady(x)))return go(live?`Iniciando ${s.name} com o Claude Code!`:`Iniciando ${s.name} em modo demonstração!`,()=>{closeModal();startRun();});
   return say(`Nenhuma feature de ${s?.name||'sprint atual'} está pronta para executar agora. Confira as revisões e as dependências.`,{options:[fs.some(x=>x.status==='review')&&{id:'reviews',label:'Revisões pendentes'},p.features.some(x=>x.status==='backlog')&&{id:'distribute',label:'Distribuir features'}]});}
  case 'reviews':{const l=p.features.filter(x=>x.status==='review');return l.length?say('Estas entregas aguardam a sua revisão:',{list:l.map(x=>acFeatureRow(x,'review-open'))}):say('Nenhuma entrega aguardando revisão.');}
  case 'review-open':return f?go(`Abrindo a ${f.key} para revisão.`,()=>openOpsFeature(f.id)):missing();
  case 'open-briefing':return go('Abrindo o briefing da operação.',()=>openOpsSection('opsBriefing'));
  // Operators
  case 'mine':{const l=p.features.filter(x=>x.route.includes(a.id));return l.length?say('Essas estão na minha rota:',{list:l.map(x=>acFeatureRow(x,'mine-pick'))}):say('Nenhuma feature na minha rota ainda. O comandante distribui as features no plano.',{options:[{id:'spawn',label:'Spawn individual'}]});}
  case 'mine-pick':{if(!f)return missing();const i=f.route.indexOf(a.id),prev=agentById(f.route[i-1]),st={backlog:'ainda não começou',blocked:'está bloqueada',ready:'está pronta para começar',running:'está em execução',review:'está em revisão',done:'já foi concluída'}[f.status]||'';
   return say([`A ${f.key} (${f.title}) ${st}, com prioridade ${f.priority}.${i>=0?` Eu entro na etapa ${i+1} de ${f.route.length}${prev?`, depois de ${prev.name}`:''}.`:''}`,acClip(f.description,320)].filter(Boolean).join('\n\n'),{options:[{id:'feature-open',arg:f.id,label:'Abrir feature'},live&&{id:'feature-ask',arg:f.id,label:'Falar sobre ela'},{id:'spawn',label:'Spawn individual'}]});}
  case 'feature-open':return f?go(`Abrindo a ${f.key}.`,()=>openFeatureEditor(f.id)):missing();
  case 'feature-ask':if(!f)return missing();c.focus={feature:f.id};return listen(`Pode mandar: o que você quer saber da ${f.key}?`);
  case 'spawn':return go('Abrindo o spawn individual.',()=>openSpawn(a.id));
 }
}
function sendAgentChat(){
 const c=chatNow(),input=$('#feChatInput');if(c?.kind!=='agent')return;const text=String(input?.value||'').trim();if(!text)return;
 if(!liveMode())return toast('Conecte o bridge do Claude Code para conversar livremente.','error');
 input.value='';autoGrow(input);feSendState();input.focus();
 c.read=false;const m=chatPush({role:'user',text});
 // "Criar nova feature": the idea opens the editor and becomes the first co-writing message of the PRD.
 if(c.flow==='create'&&!c.busy){c.flow=null;return agentSay(c,{text:'Boa! Abrindo o editor e já começo a escrever com você.'}).then(ok=>ok&&feWait(380)).then(()=>{if(chatNow()!==c)return;openFeatureEditor(null);if(ui.modal==='feature')sendFeatureChat(text);});}
 if(c.busy)c.queue.push(m);else runAgentChat([m]);
}
function agentChatPrompt(a,c,msgs,task){
 const p=project(),q=squadById(p.squadId),clip=(t,n)=>acClip(t,n),fresh=new Set(msgs.map(m=>m.id)),names=ids=>ids.map(x=>agentById(x)?.name).filter(Boolean).join(' → ');
 const team=p.agentIds.map(agentById).filter(Boolean).map(x=>`- ${x.name}: ${roleLabel(x)}${x.id===a.id?' (você)':''}`).join('\n');
 const feats=!p.features.length?'':p.sprints.map(s=>{const fs=sprintFeatures(s,p);return`### ${s.name}${s.goal?`: ${s.goal}`:''}\n${fs.map(f=>`- ${f.key}: ${f.title} (${STATUS[f.status]||f.status}, ${f.priority}${f.route.length?`, rota: ${names(f.route)}`:''})`).join('\n')||'(sem features)'}`;}).join('\n');
 const f=c.focus?.feature?featureById(c.focus.feature):null,adr=c.focus?.adr?(p.adrs||[]).find(x=>x.id===c.focus.adr):null;
 const history=[`${a.name}: ${c.greeting}`,...c.messages.filter(m=>!fresh.has(m.id)&&m.role!=='system').slice(-12).map(m=>`${m.role==='user'?'Pessoa':a.name}: ${m.text}`)].join('\n\n');
 return[`# Conversa com ${a.name} · ${p.code} ${p.name}`,`## Projeto\n${clip(p.briefing,3000)||'(sem briefing)'}`,p.scopeIn?.trim()?`Dentro do escopo:\n${clip(p.scopeIn,1500)}`:'',p.scopeOut?.trim()?`Fora do escopo:\n${clip(p.scopeOut,1500)}`:'',`## Squad ${q?.name||''}\n${team}`,`## Features\n${feats||'(nenhuma ainda)'}`,
  a.role==='architect'&&p.architecture?.trim()?`## Visão de arquitetura\n${clip(p.architecture,2500)}`:'',a.role==='architect'&&(p.adrs||[]).length?`## ADRs\n${p.adrs.map((x,i)=>`- ADR-${String(i+1).padStart(3,'0')}: ${x.title} (${x.status})`).join('\n')}`:'',
  f?`## Feature em foco: ${f.key}, ${f.title}\n${STATUS[f.status]||f.status} · ${f.priority} · ${SCOPES[f.scope]||f.scope}\n\n### Escopo\n${clip(f.description,2500)||'(vazio)'}\n\n### Critérios de aceitação\n${clip(f.criteria,2000)||'(vazio)'}\n\n### Tarefas\n${clip(f.tasks,2000)||'(vazio)'}`:'',
  adr?`## ADR em foco: ${adr.title} (${adr.status})\n${clip(adr.content,4000)||'(sem conteúdo)'}`:'',
  `## Conversa até aqui\n${history}`,`## ${msgs.length>1?'Novas mensagens':'Nova mensagem'} da pessoa\n${msgs.map(m=>m.text).join('\n\n')}`,task?`## O que fazer agora\n${task}`:'',`## Como responder\nComo mensagem de celular, no seu jeito: curta (1 a 3 frases; se precisar citar vários pontos, poucas linhas curtas), sem travessões, sem elogiar a pergunta e sem oferecer mais ajuda no final.`].filter(Boolean).join('\n\n');
}
// Free conversation: one turn per block of new messages (the ones sent meanwhile wait and go together), like runCoWrite.
async function runAgentChat(msgs,task){
 const c=chatNow(),a=agentById(c?.agentId);if(c?.kind!=='agent'||!a||!msgs.length)return;
 const token={};c.token=token;c.busy=true;c.started=Date.now();c.read=false;const mine=()=>chatNow()===c&&c.token===token;let live=null;
 try{
  const started=await bridgeFetch('/api/runs',{method:'POST',body:JSON.stringify({prompt:agentChatPrompt(a,c,msgs,task),systemPrompt:agentSystemPrompt(a)+'\n\n'+[soulBlock(a,c.greeting),AGENT_CHAT_SYSTEM].filter(Boolean).join('\n\n'),label:`${a.name} / conversa`,meta:runMeta(project(),a,null,'chat'),options:{...runOptionsFor(a),...CHAT_RUN}})});
  if(!mine()){bridgeFetch(`/api/runs/${started.runId}/cancel`,{method:'POST'}).catch(()=>{});return;}
  c.runId=started.runId;c.read=true;chatReceipt();chatTyping(true);
  live=chatStream(mine);const exit=await streamRun(started.runId,live.onEvent);
  if(!mine())return;
  const lm=live.stop();c.runId=null;chatTyping(false);const secs=Math.max(1,Math.round((Date.now()-c.started)/1000));
  if(exit.isError){if(lm)chatSettle(lm,{});chatPush(exit.status==='cancelled'?{role:'system',text:'Resposta interrompida.'}:{role:'system',text:`Não consegui responder: ${exit.error||'falha na execução do Claude Code.'}`,error:true,retry:msgs.map(x=>x.id),task:task||null});}
  // A ```json block is only taken out of the reply when it carries an "ask" (a technical answer may show JSON on purpose).
  else{const raw=exit.result||'',{reply,data}=parseCoWrite(raw),ask=chatAsk(data);chatSettle(lm,{text:chatAskText(chatClean(ask?reply:raw),ask)||'(sem resposta)',cost:exit.costUsd??null,secs,options:[...chatAskOptions(ask),AC_MENU]});}
 }catch(error){if(mine()){const lm=live?.stop();if(lm)chatSettle(lm,{});chatTyping(false);chatPush({role:'system',text:`Não consegui responder: ${error.message}`,error:true,retry:msgs.map(x=>x.id),task:task||null});}}
 finally{if(mine()){c.busy=false;c.runId=null;chatTyping(false);if(c.queue.length)runAgentChat(c.queue.splice(0));}}
}
// Stops the running turn; on close the conversation is kept in memory for this agent (its pending options are retired).
function agentChatStop(discard=false){
 const c=ui.agentChat;if(!c)return;if(c.runId)bridgeFetch(`/api/runs/${c.runId}/cancel`,{method:'POST'}).catch(()=>{});
 if(discard){chatStash(c);c.token=null;ui.agentChat=null;}
}
function saveFeature(form){
 if(!guardMutation()||!ui.opsFeatureDraft)return;const d=new FormData(form),f=ui.opsFeatureDraft.feature,title=String(d.get('title')||'').trim(),criteria=String(d.get('criteria')||'').trim();
 if(!title){$('#featureTitle').focus();return toast('Informe o título da feature.','error');}if(!criteria){$('#featureCriteria').focus();return toast('Defina critérios de aceitação verificáveis.','error');}
 const dependencies=d.getAll('dependencies').filter(id=>id!==f.id&&featureById(id));
 const candidate={...f,dependencies};const all=project().features.filter(x=>x.id!==f.id).concat(candidate);if(hasCycle(all))return toast('Estas dependências criariam um ciclo. Revise a seleção.','error');
 Object.assign(f,{title,criteria,tasks:String(d.get('tasks')||'').trim().slice(0,8000),description:String(d.get('description')||'').trim(),scope:d.get('scope'),priority:d.get('priority'),sprintId:sprintById(d.get('sprintId'))?.id||sprintOf(f)?.id||'',dependencies,route:[],briefs:[],status:'backlog',currentAgentId:null,step:0});
 const isNew=ui.opsFeatureDraft.isNew;if(isNew){project().features.push(f);ui.opsLast={scope:f.scope,priority:f.priority,sprintId:f.sprintId};if(ui.featureChat?.featureId==='new')ui.featureChat.featureId=f.id;}else project().features[project().features.findIndex(x=>x.id===f.id)]=f;
 ensureSetup(project());setSprintOpen(f.sprintId,true);log(`${f.key} / ${f.title}: feature ${isNew?'criada':'atualizada'}. Distribuição pendente.`,'plan');ui.opsFeature=null;ui.opsFeatureDraft=null;if(ui.modal==='feature')closeModal();save();render();toast('Feature salva. Distribua o plano para atribuir os especialistas.');
}
function deleteFeature(featureId){
 if(!guardMutation())return;const f=featureById(featureId);if(!f)return;
 if(f.setup)return toast('O setup do projeto não pode ser excluído: toda operação começa por ele na Sprint 01.','error');
 const blocked=project().features.filter(x=>x.dependencies.includes(f.id));
 if(blocked.length)return toast('Remova primeiro as dependências em: '+blocked.map(x=>x.key).join(', ')+'.','error');
 confirmAction('EXCLUIR FEATURE',`Excluir ${f.key} / ${f.title}? Essa ação remove o escopo e os registros de entrega desta feature.`,()=>{project().features=project().features.filter(x=>x.id!==f.id);log(`${f.key} excluida.`,'plan');if(ui.opsFeature===f.id){ui.opsFeature=null;ui.opsFeatureDraft=null;}save();render();},'Excluir feature',true);
}
// Sprints: name + goal; progress comes from their features. Moving a feature between sprints keeps route and status.
function openSprintEditor(sprintId){
 if(!guardMutation())return;const p=project(),s=sprintById(sprintId,p);if(!s&&p.sprints.length>=50)return toast('Limite de 50 sprints por projeto.','error');
 const name=s?.name||'Sprint '+pad(p.sprints.length+1);
 showModal(s?'EDITAR <span class="word-tag">SPRINT</span>':'NOVA <span class="word-tag">SPRINT</span>',`${p.code} / ${s?sprintCode(s,p):'S'+pad(p.sprints.length+1)}`,`<form id="sprintForm" novalidate><input type="hidden" name="sprintId" value="${E(s?.id||'')}"><div class="field"><label for="sprintName">NOME</label><input id="sprintName" name="name" value="${E(name)}" maxlength="60" autocomplete="off" autofocus></div><div class="field"><label for="sprintGoal">OBJETIVO</label><textarea id="sprintGoal" name="goal" rows="4" maxlength="2000" placeholder="O que esta sprint entrega, em uma ou duas frases.">${E(s?.goal||'')}</textarea></div></form>`,`${cancelButton}<button class="btn primary" type="submit" form="sprintForm">${icon('check')}Salvar sprint</button>`,'narrow','sprint');
}
function saveSprint(form){
 if(!guardMutation())return;const p=project(),d=new FormData(form),name=String(d.get('name')||'').trim().slice(0,60),goal=String(d.get('goal')||'').trim().slice(0,2000),s=sprintById(d.get('sprintId'),p);
 if(!name){$('#sprintName').focus();return toast('Informe o nome da sprint.','error');}
 if(s)Object.assign(s,{name,goal});else{if(p.sprints.length>=50)return toast('Limite de 50 sprints por projeto.','error');const n=createSprint(p.sprints.length+1,{name,goal});p.sprints.push(n);setSprintOpen(n.id,true);}
 log(`${name}: sprint ${s?'atualizada':'criada'}.`,'plan');closeModal();save();render();toast(s?'Sprint atualizada.':'Sprint criada. Crie features nela ou arraste features de outra sprint.');
}
function deleteSprint(sprintId){
 if(!guardMutation())return;const p=project(),s=sprintById(sprintId,p);if(!s)return;
 if(p.sprints.length<=1)return toast('Toda operação precisa de pelo menos uma sprint.','error');
 const fs=sprintFeatures(s,p);if(fs.length)return toast(`Mova ou exclua as features da ${s.name} antes: ${fs.map(f=>f.key).join(', ')}.`,'error');
 confirmAction('EXCLUIR SPRINT',`Excluir ${s.name}? A sprint está vazia.`,()=>{p.sprints=p.sprints.filter(x=>x.id!==s.id);delete ui.sprintOpen[s.id];log(`${s.name} excluída.`,'plan');save();render();},'Excluir sprint',true);
}
// Sprints start collapsed; opening one draws its tree once (cube stub, trunk, branches, rows) through .drawing, which re-renders never replay.
let sprintDrawTimer=0;
function setSprintOpen(sid,open){const was=!!ui.sprintOpen[sid];ui.sprintOpen[sid]=!!open;if(!open||was)return;const s=sprintById(sid);ui.sprintDraw=sid;clearTimeout(sprintDrawTimer);sprintDrawTimer=setTimeout(()=>{if(ui.sprintDraw!==sid)return;ui.sprintDraw=null;document.querySelector(`.sprint[data-sprint="${CSS.escape(sid)}"]`)?.classList.remove('drawing');},(s?sprintFeatures(s).length:0)*110+1000);}
function sprintCubeSVG(){return'<svg class="sprint-cube" viewBox="0 0 24 24" aria-hidden="true"><path class="cube-top" d="M12 2.5 20.5 7.25 12 12 3.5 7.25Z"/><path class="cube-left" d="M3.5 7.25 12 12v9.5l-8.5-4.75Z"/><path class="cube-right" d="M20.5 7.25 12 12v9.5l8.5-4.75Z"/></svg>';}
function moveFeatureToSprint(featureId,sprintId){
 const p=project(),f=featureById(featureId),s=sprintById(sprintId,p);if(!f||!s||sprintOf(f,p)===s)return;if(!guardMutation())return;
 if(f.setup)return toast('O setup do projeto fica sempre na primeira sprint.','error');
 f.sprintId=s.id;setSprintOpen(s.id,true);log(`${f.key} / ${f.title}: movida para ${s.name}.`,'plan');save();render();toast(`${f.key} agora está na ${s.name}.`);
}
// Specialists of the same family can take a scope's step (e.g. a Node.js dev covers the backend step).
const ROLE_FAMILY={backend:['backend','node','java','dotnet','dba'],frontend:['frontend','react','angular']};
function scopeRoles(scope){return({setup:['architect','backend','frontend','qa'],fullstack:['po','architect','backend','frontend','qa'],backend:['po','architect','backend','qa'],frontend:['po','architect','frontend','qa'],mobile:['po','architect','mobile','qa']})[scope]||[scope];}
function routeFor(f){
 const roles=scopeRoles(f.scope);
 const members=squad(),route=[],missing=[];
 for(const role of roles){const fam=ROLE_FAMILY[role]||[role],a=fam.map(r=>members.find(m=>m.role===r)).find(Boolean);if(a)route.push(a.id);else missing.push(ROLES[role].label);}
 // A preference is advisory and cannot produce recursive routing or leave the project.
 for(const agentId of [...route]){const a=agentById(agentId),next=agentById(a?.nextId);if(next&&members.some(x=>x.id===next.id)&&!route.includes(next.id)){const qa=route.findIndex(id=>agentById(id)?.role==='qa');route.splice(qa>=0?qa:route.length,0,next.id);}}
 return{featureId:f.id,route,missing};
}
function openDistribution(scope=null){
 if(!guardMutation())return;const p=project(),commander=agentById(p.commanderId),sp=sprintById(scope?.sprintId,p),only=scope?.featureId?featureById(scope.featureId):null;if(!sp&&!only)scope=null;
 if(!commander||commander.role!=='commander'||!p.agentIds.includes(commander.id))return toast('A squad da operação precisa de um comandante.','error');
 if(!p.briefing.trim())return toast('Escreva o briefing antes de distribuir features.','error');
 const sIdx=f=>p.sprints.indexOf(sprintOf(f,p)),pending=p.features.filter(f=>!['done','review'].includes(f.status)&&(!sp||sprintOf(f,p)===sp)&&(!only||f===only)).sort((a,b)=>(sIdx(a)-sIdx(b))||(b.setup-a.setup)||a.priority.localeCompare(b.priority));
 const scopeLabel=only?`${only.key} / ${only.title}`:sp?sp.name:'';
 if(!pending.length)return toast(scopeLabel?`${scopeLabel}: não há features pendentes de distribuição.`:p.features.length?'Não há features pendentes de distribuição. Revise as entregas.':'Adicione features ao projeto antes de distribuir.','error');
 const plan=pending.map(routeFor),valid=plan.filter(x=>!x.missing.length);
 const body=`<div class="state-bar">${icon('crown')}<strong>${E(commander.name)}</strong><span>BRIEFING RECEBIDO / ${scopeLabel?E(scopeLabel.toUpperCase())+' / ':''}${pending.length} FEATURE${pending.length>1?'S':''} ANALISADA${pending.length>1?'S':''}</span></div><p class="prose" style="margin-bottom:18px;font-size:12px">O comandante propõe esta sequência de especialistas a partir do escopo. A distribuição abaixo e determinística: nenhum modelo de IA foi consultado.</p><div style="overflow:auto"><table class="plan-table"><thead><tr><th>FEATURE</th><th>PRIORIDADE</th><th>ROTA DE EXECUÇÃO / HANDOFF</th></tr></thead><tbody>${plan.map(item=>{const f=featureById(item.featureId);return`<tr><td><span class="plan-key">${E(f.key)}</span>${E(f.title)}<small class="plan-sprint">${E(sprintCode(sprintOf(f,p),p))} / ${E(sprintOf(f,p)?.name||'')}</small></td><td><span class="priority ${f.priority.toLowerCase()}">${f.priority}</span></td><td><div class="route-pills">${item.route.map(id=>`<span class="tag">${E(agentById(id)?.name)}</span>`).join(icon('arrow'))}</div>${item.missing.length?`<div class="plan-error">Falta no squad: ${E(item.missing.join(', '))}</div>`:!depsReady(f)?`<div class="plan-error">${icon('lock')} Aguarda ${f.dependencies.filter(id=>featureById(id)?.status!=='done').map(id=>E(featureById(id)?.key)).join(', ')}</div>`:'<div class="hint" style="margin-top:6px">Pronta para iniciar.</div>'}</td></tr>`;}).join('')}</tbody></table></div><div class="notice">${icon('info')}Aplicar o plano não inicia a simulação. Features com dependências aguardam aprovação das anteriores. Features sem especialistas suficientes permanecem em A fazer.</div>`;
 ui.opsPlan={plan,html:body,valid:valid.length,total:plan.length,commander:commander.name,scope,scopeLabel};openOpsSection('opsPlan');
}
function applyPlan(run=false){
 const plan=ui.opsPlan?.plan,scope=ui.opsPlan?.scope;if(!guardMutation()||!plan)return;let count=0;
 for(const item of plan){const f=featureById(item.featureId);if(!f||item.missing.length)continue;f.route=item.route;f.briefs=[];f.step=0;f.currentAgentId=null;f.status=depsReady(f)?'ready':'blocked';count++;}
 log(`Plano aplicado: ${count} features distribuídas entre os especialistas.`,'plan',project().commanderId);ui.opsPlan=null;save();render();if(run&&scope)return startRun(scope);toast(scope?'Plano aplicado. Execute a sprint ou a feature para iniciar os handoffs.':'Plano aplicado. Execute uma sprint ou uma feature para iniciar os handoffs.');
}

/* Claude Code bridge (server.js). The page talks to it only when it was served by the bridge. */
const BRIDGE_TOKEN=document.querySelector('meta[name="squad-bridge-token"]')?.content||'';
const runtime=()=>state.settings.runtime||(state.settings.runtime={...DEFAULT_RUNTIME});
const liveMode=()=>runtime().mode==='claude'&&ui.bridge.online;
const runTag=()=>liveMode()?'CLAUDE':'DEMO';
// Who ran it and where, for the bridge's run history (console > Histórico).
function runMeta(p,a,f,kind){return{projectId:p?.id||null,agentId:a?.id||null,featureId:f&&f.id!=='new'?f.id:null,kind};}
async function bridgeFetch(path,init={}){
 if(!BRIDGE_TOKEN)throw Error('Bridge indisponível. Inicie com "node server.js" e abra http://127.0.0.1:4317.');
 const res=await fetch(path,{...init,headers:{'content-type':'application/json','x-squad-token':BRIDGE_TOKEN,...(init.headers||{})}});
 let body={};try{body=await res.json();}catch{}
 if(!res.ok||body.ok===false)throw Object.assign(Error(body.error||`Bridge respondeu ${res.status}.`),{status:res.status});
 return body;
}
async function checkBridge(notify=false){
 if(!BRIDGE_TOKEN){ui.bridge={online:false,checked:true,version:null,error:'Página aberta sem o bridge.'};renderIndicator();return ui.bridge;}
 try{
  const h=await bridgeFetch('/api/health'+(runtime().claudePath?'?claudePath='+encodeURIComponent(runtime().claudePath):''));
  ui.bridge={online:!!h.claudeVersion,checked:true,version:h.claudeVersion,path:h.claudePath,error:h.claudeError,defaultCwd:h.defaultCwd,projectsDir:h.projectsDir,home:h.home,platform:h.platform};
  bridgeFetch('/api/config',{method:'POST',body:JSON.stringify({concurrency:runtime().concurrency})}).catch(()=>{});
  loadProfiles().then(()=>loadUsage(true));
  if(notify)toast(h.claudeVersion?`Claude Code ${h.claudeVersion} conectado.`:`Bridge ativo, mas o Claude Code falhou: ${h.claudeError}`,h.claudeVersion?'ok':'error');
 }catch(error){ui.bridge={online:false,checked:true,version:null,error:error.message};if(notify)toast(error.message,'error');}
 const setupStatus=$('#dbSetupStatus');if(setupStatus)setupStatus.innerHTML=dbSetupStatusHTML();
 renderIndicator();if(!runner)render();return ui.bridge;
}
function renderIndicator(){
 const el=$('#modeIndicator');if(!el)return;const live=liveMode(),b=ui.bridge,version=String(b.version||'').split(' ')[0];
 el.classList.toggle('live',live);el.classList.toggle('warn',b.online&&!live);el.classList.toggle('offline',!b.online);
 const status=!b.checked?'VERIFICANDO':live?`v${version} / ${runtime().permissionMode.toUpperCase()}`:b.online?`v${version} / EXECUÇÃO DESLIGADA`:BRIDGE_TOKEN?'NÃO ENCONTRADO':'NÃO CONECTADO';
 el.innerHTML=`<i></i>CLAUDE CODE / ${E(status)}`;
 el.title=live?`Claude Code ${b.version} em ${b.path}. Clique para configurar.`:(b.error||'Clique para configurar o Claude Code');
}
/** Reads a text/event-stream through fetch (keeps the token in a header) and resolves on the exit event. */
async function streamRun(runId,onEvent){
 const res=await fetch(`/api/runs/${encodeURIComponent(runId)}/events`,{headers:{'x-squad-token':BRIDGE_TOKEN}});
 if(!res.ok||!res.body)throw Error('Não foi possível acompanhar a execução.');
 const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',exit=null;
 for(;;){
  const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
  let cut;while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);const data=chunk.split('\n').filter(l=>l.startsWith('data: ')).map(l=>l.slice(6)).join('\n');if(!data)continue;let evt;try{evt=JSON.parse(data);}catch{continue;}onEvent(evt);if(evt.type==='exit')exit=evt;}
 }
 if(!exit)throw Error('Conexão com o bridge encerrada antes do fim da execução.');
 return exit;
}
const splitList=v=>String(v||'').split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
function runOptionsFor(a,r=runtime(),p=project()){
 const model=agentModelOf(a,r).model;
 const allowed=[...a.tools,...splitList(r.extraAllowedTools)];
 return{profile:r.forceProfileId||a.profileId||'',claudePath:r.claudePath,project:p?.folder||'',model,permissionMode:r.permissionMode,effort:agentEffort(a,r).effort,maxBudgetUsd:r.maxBudgetUsd,timeoutSec:r.timeoutSec,addDirs:splitList(r.addDirs),allowedTools:[...new Set(allowed)],tools:r.restrictTools?a.tools.filter(t=>TOOLS.includes(t)):undefined};
}
/* Perfis (docs/plans/perfis-adapters.md, ADR 0002): instâncias de um Adapter (claude, codex) guardadas no banco do bridge, fora do
   workspace. ui.profiles = {loaded, list, adapters, error, usage}; sem bridge só existe o Perfil padrão implícito (Claude). O agente
   guarda só profileId ('' = padrão) e settings.runtime.forceProfileId força um Perfil para todas as execuções. */
function profilesData(){try{return ui.profiles||null;}catch{return null;}}
function profilesOn(){return !!(BRIDGE_TOKEN&&profilesData()?.loaded);}
function profileById(id){return id?(profilesData()?.list||[]).find(p=>p.id===id)||null:null;}
function defaultProfile(){const l=profilesData()?.list||[];return l.find(p=>p.isDefault)||l[0]||{id:'',name:'Claude (padrão)',adapter:'claude',isDefault:true,implicit:true,bin:'',configDir:'',model:'',effort:'',concurrency:2,threshold:90,fallbackId:'',windows:{},active:0,status:{},telemetry:{}};}
function forcedProfile(r=runtime()){return profileById(r.forceProfileId);}
// Perfil efetivo: o forçado nas configurações, senão o do agente, senão o padrão (id desconhecido nesta máquina cai no padrão).
function agentProfile(a,r=runtime()){if(r.forceProfileId)return forcedProfile(r)||defaultProfile();return profileById(a?.profileId)||defaultProfile();}
function agentAdapter(a,r=runtime()){return agentProfile(a,r).adapter==='codex'?'codex':'claude';}
// Perfil do próprio agente, sem o forçado: decide o catálogo de modelo e esforço do estúdio.
function ownProfile(id){return profileById(id)||defaultProfile();}
function profMs(v){if(v==null||v==='')return null;const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;const t=Date.parse(v);return Number.isFinite(t)?t:null;}
function normProfile(p){
 if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id)return null;const w=p.windows&&typeof p.windows==='object'?p.windows:{},t=p.telemetry&&typeof p.telemetry==='object'?p.telemetry:{};
 const win=k=>{const x=w[k];if(!x||typeof x!=='object')return null;const u=Number(x.utilization);return{utilization:Number.isFinite(u)?u:null,resetsAt:profMs(x.resetsAt),observedAt:profMs(x.observedAt)};};
 return{id:p.id,name:String(p.name||p.id).slice(0,40),adapter:p.adapter==='codex'?'codex':'claude',bin:String(p.bin||''),configDir:String(p.configDir||''),model:String(p.model||''),effort:String(p.effort||''),concurrency:Number(p.concurrency)||2,fallbackId:String(p.fallbackId||''),threshold:Number(p.threshold)||90,ignoreUserConfig:p.ignoreUserConfig!==false,telemetry:{enabled:!!t.enabled,native:!!t.native,content:!!t.content},isDefault:!!p.isDefault,modelEfforts:p.modelEfforts&&typeof p.modelEfforts==='object'&&!Array.isArray(p.modelEfforts)?Object.fromEntries(Object.entries(p.modelEfforts).filter(([k,v])=>/^[A-Za-z0-9._\-\[\]]{1,80}$/.test(k)&&Array.isArray(v)).map(([k,v])=>[k,v.filter(e=>ALL_EFFORTS.includes(e)&&e)])):null,status:p.status&&typeof p.status==='object'?p.status:{},windows:{five_hour:win('five_hour'),seven_day:win('seven_day')},active:Number(p.active)||0};
}
async function loadProfiles(){
 if(!BRIDGE_TOKEN)return;const ps=ui.profiles;
 try{const d=await bridgeFetch('/api/profiles');ps.list=(Array.isArray(d.profiles)?d.profiles:[]).map(normProfile).filter(Boolean);ps.adapters=d.adapters&&typeof d.adapters==='object'?d.adapters:null;ps.loaded=true;ps.error='';ps.at=Date.now();}
 catch(error){ps.error=error.message;if(!ps.list.length)ps.loaded=false;}
 profilesChanged();
}
let profRefreshTimer=0;
function profilesRefreshSoon(){if(!BRIDGE_TOKEN)return;clearTimeout(profRefreshTimer);profRefreshTimer=setTimeout(()=>loadProfiles().then(()=>loadUsage(true)),1200);}
function profilesChanged(){
 if(ui.modal==='settings'&&ui.settingsTab==='profiles'){const set=(sel,html)=>{const el=$(sel);if(el)el.innerHTML=html;};set('#profNotice',profNoticeHTML());set('#profList',profListHTML());const f=$('#pfForce');if(f){f.innerHTML=forceOptionsHTML();f.disabled=!profilesOn()||!!runner;}const nb=$('[data-action="prof-new"]');if(nb)nb.disabled=!profilesOn();}
 if(!runner)render();else renderHomeUsage();
}
// Chip do Perfil: nome curto + cor do Adapter (sala, card do agente no escritório, legenda da cidade).
function profileChipHTML(p,cls=''){if(!p)return'';const ad=p.adapter==='codex'?'codex':'claude',short=String(p.name||'').replace(/\s*\(padrão\)\s*/i,'').trim().slice(0,14)||ADAPTER_LABEL[ad];return`<span class="prof-chip ${ad}${cls?' '+cls:''}" title="Perfil ${E(p.name||short)} (${ADAPTER_LABEL[ad]})">${E(short)}</span>`;}
function agentProfileChip(a,cls){return profilesOn()?profileChipHTML(agentProfile(a),cls):'';}
// Catálogo por Adapter: o local (CLAUDE_MODELS / CODEX_MODELS) mais os modelos que o bridge informar em GET /api/profiles (adapters).
function adapterModels(ad){
 const local=ad==='codex'?CODEX_MODELS:CLAUDE_MODELS,api=profilesData()?.adapters?.[ad]?.models;if(!Array.isArray(api)||!api.length)return local;
 const known=new Set(local.flatMap(([,items])=>items.map(x=>x[0]))),extra=[];
 for(const m of api){const id=typeof m==='string'?m:m&&typeof m==='object'?String(m.id||m.value||''):'';if(!/^[A-Za-z0-9._\-\[\]]{1,80}$/.test(id)||known.has(id))continue;known.add(id);extra.push([id,String(m?.label||id).toUpperCase().slice(0,30),String(m?.hint||m?.description||'Modelo informado pelo bridge.').slice(0,200)]);}
 return extra.length?[...local,['Informados pelo bridge',extra]]:local;
}
// Efforts of an Adapter: the Perfil's own modelEfforts (read from its config dir by the bridge), then adapters[ad].modelEfforts, then
// adapters[ad].efforts (Codex: max/ultra only when the model lists them), then the local list. keep: an effort already configured
// on the agent or the Perfil, kept in the list (shown as "configurado") so editing and saving never drop it.
function adapterEfforts(ad,model,pf,keep){
 const info=profilesData()?.adapters?.[ad]||{},ok=l=>Array.isArray(l)?l.filter(e=>e&&ALL_EFFORTS.includes(e)):[],pick=me=>model&&me&&typeof me==='object'&&!Array.isArray(me)?ok(me[model]):[];
 let per=pick(pf?.adapter===ad?pf?.modelEfforts:null);if(!per.length)per=pick(info.modelEfforts);
 let list;if(per.length)list=['',...new Set(per)];else{const l=ok(info.efforts).filter(e=>ad!=='codex'||!['max','ultra'].includes(e));list=l.length?['',...new Set(l)]:ad==='codex'?CODEX_EFFORTS:EFFORTS;}
 return keep&&ALL_EFFORTS.includes(keep)&&!list.includes(keep)?[...list,keep]:list;
}
function modelAdapterOf(m){m=String(m||'');if(!m||m==='inherit')return'';const inCat=cat=>cat.some(([,items])=>items.some(x=>x[0]===m));if(inCat(CODEX_MODELS)||/^(gpt-|o[1-9]|codex)/i.test(m))return'codex';if(inCat(CLAUDE_MODELS)||/^(claude-|opus|sonnet|haiku|fable|best$|opusplan)/i.test(m))return'claude';return'';}
function modelFits(m,ad){const k=modelAdapterOf(m);return !k||k===ad;}
// Modelo efetivo no Adapter do Perfil: o global das configurações (quando serve a esse Adapter), senão o do agente; '' = padrão do Perfil.
function agentModelOf(a,r=runtime()){const ad=agentAdapter(a,r),global=r.model&&modelFits(r.model,ad)?r.model:'',own=a?.model&&a.model!=='inherit'&&modelFits(a.model,ad)?a.model:'';return{adapter:ad,global,own,model:global||own};}
// Estúdio do agente: seletor de Perfil; trocar o Perfil troca o catálogo de modelo e esforço (syncProfileField).
function profileFieldHTML(a){
 const on=profilesOn(),list=profilesData()?.list||[],cur=a.profileId||'',known=!cur||list.some(p=>p.id===cur),dflt=defaultProfile(),forced=forcedProfile();
 const opts=`<option value="">Padrão (${E(dflt.name)})</option>${list.map(p=>`<option value="${E(p.id)}" ${p.id===cur?'selected':''}>${E(p.name)} / ${ADAPTER_LABEL[p.adapter]}</option>`).join('')}${known?'':`<option value="${E(cur)}" selected>Perfil ausente nesta máquina (usa o padrão)</option>`}`;
 const hint=!on?'Perfis precisam do bridge. Sem ele o agente roda no Perfil padrão (Claude).':forced?`Hoje todas as execuções usam o Perfil ${E(forced.name)} (Configurações > Perfis).`:'Conta e motor (Claude Code ou Codex) em que este agente roda. Gerencie em Configurações > Perfis.';
 return`<div class="field full"><label for="agentProfile">PERFIL</label><select id="agentProfile" name="profileId" ${on?'':'disabled'}>${opts}</select>${on?'':`<input type="hidden" name="profileId" value="${E(cur)}">`}<span class="hint">${hint}</span></div>`;
}
function syncProfileField(){
 const sel=$('#agentProfile');if(!sel||ui.draft?.kind!=='agent')return;const ad=ownProfile(sel.value).adapter,mf=$('#agentModel')?.closest('.field');if(!mf||mf.dataset.adapter===ad)return;
 const cur=$('#agentModel').value,model=modelFits(cur,ad)?cur:'inherit',e=document.querySelector('#agentForm input[name=effort]:checked')?.value||'';
 mf.outerHTML=modelFieldHTML({model},ad);const ef=$('#agentForm .effort-field');if(ef)ef.outerHTML=effortFieldHTML({model,effort:e,profileId:sel.value,keepEffort:ui.draft.agent.effort||''},ad);syncEffortField();
}
/* Configurações > Perfis: lista (status, Janelas de uso, ações), formulário, Perfil forçado e telemetria. Ações recarregam só a lista;
   a exclusão pede confirmação em linha (nunca confirmAction dentro deste modal). */
function profAgo(ms){if(!ms)return'';const s=Math.max(0,(Date.now()-ms)/1000);return s<60?'agora':s<3600?`há ${Math.round(s/60)} min`:s<86400?`há ${Math.round(s/3600)} h`:`há ${Math.round(s/86400)} d`;}
function profUntil(ms){if(!ms)return'';const s=(ms-Date.now())/1000;if(s<=0)return'já reiniciou';return s<3600?`reinicia em ${Math.max(1,Math.round(s/60))} min`:s<86400?`reinicia em ${Math.round(s/3600)} h`:`reinicia ${new Date(ms).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}`;}
function fmtTok(n){n=Number(n)||0;try{return new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n);}catch{return String(n);}}
function windowBarHTML(w,label,threshold=90){
 if(!w||w.utilization==null)return`<div class="prof-win empty"><span class="prof-win-label">${label}</span><i class="prof-bar"><b style="width:0"></b></i><span class="prof-win-pct">--</span><small>sem leitura</small></div>`;
 const pct=Math.max(0,Math.min(100,Math.round(w.utilization*100))),tone=pct>=threshold?'bad':pct>=threshold-20?'warn':'';
 return`<div class="prof-win ${tone}" title="Janela de ${label==='5H'?'5 horas':'7 dias'}: ${pct}% usado${w.resetsAt?`, ${profUntil(w.resetsAt)}`:''}. Lido ${profAgo(w.observedAt)||'sem data'}."><span class="prof-win-label">${label}</span><i class="prof-bar"><b style="width:${pct}%"></b><s style="left:${threshold}%"></s></i><span class="prof-win-pct">${pct}%</span><small>${[profUntil(w.resetsAt),w.observedAt?'lido '+profAgo(w.observedAt):''].filter(Boolean).join(' · ')}</small></div>`;
}
function profNoticeHTML(){
 const ps=ui.profiles;
 if(!BRIDGE_TOKEN)return`<div class="notice warning" style="margin-top:0">${icon('info')}<span>Perfis precisam do bridge. Sem ele as execuções usam o Perfil padrão (Claude Code) e estes controles ficam desativados. Abra o app com <code>npm start</code> em <code>http://127.0.0.1:4317</code>.</span></div>`;
 if(!ps.loaded)return`<div class="notice ${ps.error?'warning':''}" style="margin-top:0">${icon('info')}<span>${ps.error?`Não foi possível carregar os Perfis: ${E(ps.error)}`:'Carregando os Perfis do bridge…'}</span></div>`;
 return`<div class="notice" style="margin-top:0">${icon('lock')}<span>Os Perfis ficam no banco do bridge, fora do workspace: não entram no backup JSON. Cada agente guarda só a escolha do Perfil; numa máquina sem esse Perfil ele roda no padrão.</span></div>`;
}
function forceOptionsHTML(){const list=profilesData()?.list||[],cur=runtime().forceProfileId||'';return`<option value="">Nenhum: cada agente usa o seu</option>${list.map(p=>`<option value="${E(p.id)}" ${p.id===cur?'selected':''}>${E(p.name)} / ${ADAPTER_LABEL[p.adapter]}</option>`).join('')}${cur&&!list.some(p=>p.id===cur)?`<option value="${E(cur)}" selected>Perfil ausente nesta máquina</option>`:''}`;}
function profStatusHTML(p){
 const t=ui.profTest[p.id],s={...p.status,...(t||{})};
 if(s.error)return`<span class="prof-status bad" title="${E(s.error)}">${icon('info')}${E(String(s.error).slice(0,80))}</span>`;
 if(s.configDirOk===false)return`<span class="prof-status bad">${icon('info')}diretório de configuração não encontrado</span>`;
 if(s.version)return`<span class="prof-status ok">${icon('check')}${E(String(s.version).slice(0,40))}</span>`;
 return`<span class="prof-status">sem teste</span>`;
}
function profListHTML(){
 const ps=ui.profiles;if(!BRIDGE_TOKEN)return'';if(!ps.loaded)return`<p class="hint">${ps.error?'Sem Perfis carregados.':'Carregando…'}</p>`;
 if(!ps.list.length)return`<p class="hint">Nenhum Perfil cadastrado. Crie o primeiro em Novo Perfil.</p>`;
 const forced=runtime().forceProfileId,busy=ui.profBusy||{};
 return ps.list.map(p=>{const fb=profileById(p.fallbackId),users=state.agents.filter(a=>a.profileId===p.id).length,dis=busy[p.id]?'disabled':'';
  const meta=[`executável: ${p.bin||'padrão do bridge'}`,`configuração: ${p.configDir||'padrão da conta'}`,`modelo: ${p.model?modelLabel(p.model):'padrão'}`,`esforço: ${p.effort||'padrão'}`,`teto ${p.concurrency} (${p.active} em execução)`,`limiar ${p.threshold}%`,`reserva: ${fb?fb.name:'nenhuma'}`,p.adapter==='codex'?(p.ignoreUserConfig?'ignora a config do usuário':'lê a config do usuário'):'',p.telemetry.enabled?`telemetria${p.telemetry.native?' + nativa':''}${p.telemetry.content?' + conteúdo':''}`:'',users?`${users} agente${users>1?'s':''}`:''].filter(Boolean);
  const confirm=ui.profConfirm===p.id?`<div class="prof-confirm" role="alert"><span>Excluir o Perfil <strong>${E(p.name)}</strong>?${users?` ${users} agente${users>1?'s passam':' passa'} a rodar no Perfil padrão.`:''}${forced===p.id?' Ele também deixa de ser o Perfil forçado.':''}</span><button type="button" class="btn ghost sm" data-action="prof-delete-no">Cancelar</button><button type="button" class="btn danger sm" data-action="prof-delete-yes" data-id="${E(p.id)}" ${dis}>${icon('trash')}Excluir</button></div>`:'';
  return`<article class="prof-card ${p.adapter}" data-pid="${E(p.id)}"><div class="prof-card-head">${profileChipHTML({name:ADAPTER_LABEL[p.adapter],adapter:p.adapter})}<strong>${E(p.name)}</strong>${p.isDefault?'<span class="tag accent">PADRÃO</span>':''}${forced===p.id?'<span class="tag">FORÇADO</span>':''}<span class="grow"></span>${profStatusHTML(p)}</div><p class="prof-meta">${meta.map(E).join(' · ')}</p><div class="prof-wins">${windowBarHTML(p.windows.five_hour,'5H',p.threshold)}${windowBarHTML(p.windows.seven_day,'7D',p.threshold)}</div><div class="prof-actions"><button type="button" class="btn ghost sm" data-action="prof-edit" data-id="${E(p.id)}" ${dis}>${icon('edit')}Editar</button><button type="button" class="btn ghost sm" data-action="prof-test" data-id="${E(p.id)}" ${dis}>${icon('radio')}Testar</button><button type="button" class="btn ghost sm" data-action="prof-refresh" data-id="${E(p.id)}" ${dis} title="${p.adapter==='claude'?'Roda uma chamada mínima no Haiku para ler as Janelas de uso.':'Lê o arquivo de sessão mais recente do Codex.'}">${icon('clock')}Atualizar uso</button>${p.isDefault?'':`<button type="button" class="btn ghost sm" data-action="prof-default" data-id="${E(p.id)}" ${dis}>${icon('crown')}Tornar padrão</button><button type="button" class="btn ghost sm danger-text" data-action="prof-delete" data-id="${E(p.id)}" ${dis}>${icon('trash')}Excluir</button>`}</div>${confirm}</article>`;}).join('');
}
function profFormHTML(f){
 const ad=f.adapter==='codex'?'codex':'claude',editing=!!f.id,list=(profilesData()?.list||[]).filter(p=>p.adapter===ad&&p.id!==f.id),t=f.telemetry||{},models=adapterModels(ad).flatMap(([,items])=>items.map(x=>x[0])).filter(x=>x!=='inherit');
 const chk=(name,on,title,small)=>`<label class="check-card full"><input type="checkbox" name="${name}" ${on?'checked':''}><span><strong>${title}</strong><small>${small}</small></span></label>`;
 return`<form id="profileForm" class="prof-form" novalidate data-id="${E(f.id||'')}"><div class="prof-form-head"><span class="eyebrow">${editing?'EDITAR PERFIL':'NOVO PERFIL'}</span></div><div class="form-grid"><div class="field"><label for="pfName">NOME</label><input id="pfName" name="name" value="${E(f.name||'')}" maxlength="40" placeholder="Ex.: Claude trabalho" autocomplete="off" required></div><div class="field"><label for="pfAdapter">ADAPTER</label><select id="pfAdapter" name="adapter" ${editing?'disabled':''}>${Object.entries(ADAPTER_LABEL).map(([k,l])=>`<option value="${k}" ${k===ad?'selected':''}>${l}${k==='claude'?' (claude -p)':' (codex exec)'}</option>`).join('')}</select>${editing?`<input type="hidden" name="adapter" value="${ad}"><span class="hint">O Adapter não muda depois de criado.</span>`:''}</div><div class="field"><label for="pfBin">EXECUTÁVEL</label><input id="pfBin" name="bin" value="${E(f.bin||'')}" maxlength="400" placeholder="${ad} (padrão do bridge)" autocomplete="off"><span class="hint">Nome no PATH ou caminho completo. Vazio = padrão.</span></div><div class="field"><label for="pfDir">DIRETÓRIO DE CONFIGURAÇÃO</label><input id="pfDir" name="configDir" value="${E(f.configDir||'')}" maxlength="400" placeholder="${ad==='codex'?'~/.codex-trabalho':'~/.claude-trabalho'}" autocomplete="off"><span class="hint">Pasta da conta (${ad==='codex'?'CODEX_HOME':'CLAUDE_CONFIG_DIR'}), caminho absoluto ou com ~. Vazio = a padrão.</span></div><div class="field"><label for="pfModel">MODELO PADRÃO</label><input id="pfModel" name="model" value="${E(f.model||'')}" maxlength="80" list="pfModels" placeholder="vazio = padrão da CLI" autocomplete="off"><datalist id="pfModels">${models.map(m=>`<option value="${E(m)}">`).join('')}</datalist></div><div class="field"><label for="pfEffort">ESFORÇO PADRÃO</label><select id="pfEffort" name="effort">${(()=>{const pf=profileById(f.id),base=adapterEfforts(ad,f.model,pf);return adapterEfforts(ad,f.model,pf,f.effort).map(e=>`<option value="${e}" ${f.effort===e?'selected':''}>${e?e.toUpperCase():'Padrão do modelo'}${base.includes(e)?'':' (configurado)'}</option>`).join('');})()}</select></div><div class="field"><label for="pfConc">EXECUÇÕES SIMULTÂNEAS</label><input id="pfConc" name="concurrency" type="number" min="1" max="10" step="1" value="${E(f.concurrency??2)}"></div><div class="field"><label for="pfThr">LIMIAR DA JANELA DE USO (%)</label><input id="pfThr" name="threshold" type="number" min="50" max="100" step="1" value="${E(f.threshold??90)}"><span class="hint">Acima dele: aviso e, com reserva, as novas execuções vão para ela.</span></div><div class="field full"><label for="pfFallback">PERFIL RESERVA</label><select id="pfFallback" name="fallbackId"><option value="">Nenhum</option>${list.map(p=>`<option value="${E(p.id)}" ${p.id===f.fallbackId?'selected':''}>${E(p.name)}</option>`).join('')}</select><span class="hint">Só Perfis do mesmo Adapter (${ADAPTER_LABEL[ad]}).</span></div>${ad==='codex'?chk('ignoreUserConfig',f.ignoreUserConfig!==false,'Ignorar a configuração do usuário','Passa --ignore-user-config: o Codex não lê o config.toml da conta, só o login.'):''}${chk('telEnabled',t.enabled,'Telemetria do bridge','Envia um trace OTLP por execução deste Perfil (tokens, ferramentas, chamados).')}${chk('telNative',t.native,'Telemetria nativa da CLI','Liga também a telemetria própria do Claude Code ou do Codex.')}${chk('telContent',t.content,'Incluir prompt e resposta','Adiciona o conteúdo das execuções aos traces. Deixe desligado se o destino não for seu.')}</div><div class="flex wrap prof-form-actions"><span class="grow"></span><button type="button" class="btn ghost" data-action="prof-cancel">Cancelar</button><button type="submit" class="btn primary" ${ui.profSaving?'disabled':''}>${icon('check')}${editing?'Salvar Perfil':'Criar Perfil'}</button></div></form>`;
}
function profFormValues(form){const d=new FormData(form),num=(k,min,max,dv)=>{const n=Math.round(Number(d.get(k)));return Number.isFinite(n)?Math.min(max,Math.max(min,n)):dv;};return{id:form.dataset.id||'',name:String(d.get('name')||'').trim().replace(/\s+/g,' '),adapter:d.get('adapter')==='codex'?'codex':'claude',bin:String(d.get('bin')||'').trim(),configDir:String(d.get('configDir')||'').trim(),model:String(d.get('model')||'').trim(),effort:adapterEfforts(d.get('adapter')==='codex'?'codex':'claude',String(d.get('model')||'').trim(),profileById(form.dataset.id||''),profileById(form.dataset.id||'')?.effort).includes(String(d.get('effort')||''))?String(d.get('effort')||''):'',concurrency:num('concurrency',1,10,2),threshold:num('threshold',50,100,90),fallbackId:String(d.get('fallbackId')||''),ignoreUserConfig:d.has('ignoreUserConfig'),telemetry:{enabled:d.has('telEnabled'),native:d.has('telNative'),content:d.has('telContent')}};}
function profFormRefresh(){const box=$('#profFormBox');if(box)box.innerHTML=ui.profForm?profFormHTML(ui.profForm):'';}
async function saveProfile(form){
 if(!profilesOn())return toast('Perfis precisam do bridge.','error');const v=profFormValues(form);
 if(!v.name||v.name.length>40){$('#pfName')?.focus();return toast('Dê um nome de 1 a 40 caracteres ao Perfil.','error');}
 if(v.model&&!/^[A-Za-z0-9._\-\[\]]{1,80}$/.test(v.model)){$('#pfModel')?.focus();return toast('Modelo inválido.','error');}
 const body={name:v.name,adapter:v.adapter,bin:v.bin,configDir:v.configDir,model:v.model,effort:v.effort,concurrency:v.concurrency,threshold:v.threshold,fallbackId:v.fallbackId,ignoreUserConfig:v.ignoreUserConfig,telemetry:v.telemetry};
 ui.profForm=v;ui.profSaving=true;profFormRefresh();
 try{await bridgeFetch(v.id?`/api/profiles/${encodeURIComponent(v.id)}`:'/api/profiles',{method:v.id?'PUT':'POST',body:JSON.stringify(body)});ui.profForm=null;toast(v.id?`Perfil ${v.name} salvo.`:`Perfil ${v.name} criado.`);log(`Perfil de execução ${v.name} (${ADAPTER_LABEL[v.adapter]}) ${v.id?'atualizado':'criado'}.`,'system');save();}
 catch(error){toast(error.message,'error');}
 finally{ui.profSaving=false;}
 profFormRefresh();await loadProfiles();
}
async function profAction(kind,pid){
 const p=profileById(pid);if(!p||!profilesOn())return;ui.profBusy[pid]=true;profilesChanged();
 try{
  if(kind==='test'){const r=await bridgeFetch(`/api/profiles/${encodeURIComponent(pid)}/test`,{method:'POST'});const s=r.status&&typeof r.status==='object'?r.status:r;ui.profTest[pid]={version:s.version||'',configDirOk:s.configDirOk,error:s.error||''};toast(s.error?`Perfil ${p.name}: ${s.error}`:`Perfil ${p.name} respondeu${s.version?': '+s.version:''}.`,s.error?'error':'ok');}
  else if(kind==='refresh'){await bridgeFetch(`/api/profiles/${encodeURIComponent(pid)}/refresh`,{method:'POST'});toast(`Janelas de uso do Perfil ${p.name} atualizadas.`);}
  else if(kind==='default'){await bridgeFetch(`/api/profiles/${encodeURIComponent(pid)}/default`,{method:'POST'});toast(`${p.name} é o novo Perfil padrão.`);log(`Perfil padrão: ${p.name}.`,'system');save();}
  else if(kind==='delete'){await bridgeFetch(`/api/profiles/${encodeURIComponent(pid)}`,{method:'DELETE'});ui.profConfirm=null;if(ui.profForm?.id===pid){ui.profForm=null;profFormRefresh();}if(runtime().forceProfileId===pid)runtime().forceProfileId='';log(`Perfil de execução ${p.name} excluído.`,'system');save();toast(`Perfil ${p.name} excluído.`);}
 }catch(error){toast(error.message,'error');if(kind==='test')ui.profTest[pid]={error:error.message};}
 finally{delete ui.profBusy[pid];}
 await loadProfiles();if(kind==='refresh')loadUsage(true);
}
function setForcedProfile(value){
 if(!guardMutation()){const f=$('#pfForce');if(f)f.value=runtime().forceProfileId||'';return;}
 const id=profRef(value),p=profileById(id);runtime().forceProfileId=p?id:'';save();
 log(p?`Todas as execuções forçadas no Perfil ${p.name}.`:'Execuções voltaram a usar o Perfil de cada agente.','system');toast(p?`Todas as execuções vão rodar no Perfil ${p.name}.`:'Cada agente volta a usar o próprio Perfil.');profilesChanged();
}
function profilesPaneHTML(){
 const on=profilesOn(),locked=runner?'disabled':'';
 return`<div id="profNotice">${profNoticeHTML()}</div><div class="settings-row"><div><h3>Forçar Perfil em todas as execuções</h3><p>Ignora o Perfil de cada agente e roda etapas, chamados e chats no Perfil escolhido. Fica salvo no workspace.</p></div><select id="pfForce" aria-label="Forçar Perfil em todas as execuções" ${on?'':'disabled'} ${locked}>${forceOptionsHTML()}</select></div><div class="prof-head"><span class="eyebrow">PERFIS</span><button type="button" class="btn ghost sm" data-action="prof-new" ${on?'':'disabled'}>${icon('plus')}Novo Perfil</button></div><div id="profFormBox">${ui.profForm?profFormHTML(ui.profForm):''}</div><div id="profList" class="prof-list">${profListHTML()}</div><div class="prof-head"><span class="eyebrow">TELEMETRIA (OTLP/HTTP JSON)</span></div><div id="telemetryBox">${telemetryHTML()}</div>`;
}
function telHeaderRowHTML(h={}){const st=h.name||h.env?(h.present?'<span class="prof-status ok">presente</span>':'<span class="prof-status bad">faltando</span>'):'<span class="prof-status">nova</span>';return`<div class="tel-row"><input name="hdrName" value="${E(h.name||'')}" maxlength="80" placeholder="Header (ex.: Authorization)" autocomplete="off" aria-label="Nome do header"><span class="tel-arrow" aria-hidden="true">→</span><input name="hdrEnv" value="${E(h.env||'')}" maxlength="80" placeholder="Variável de ambiente (ex.: OTLP_TOKEN)" autocomplete="off" aria-label="Variável de ambiente com o valor">${st}<button type="button" class="icon-button small" data-action="tel-hdr-remove" aria-label="Remover header" title="Remover header">${icon('trash')}</button></div>`;}
function telemetryHTML(){
 if(!BRIDGE_TOKEN)return`<p class="hint">A telemetria é enviada pelo bridge e precisa dele.</p>`;
 const t=ui.telemetry;if(!t)return`<p class="hint">${ui.telemetryErr?`Não foi possível ler a telemetria: ${E(ui.telemetryErr)}`:'Carregando…'}</p>`;
 return`<form id="telemetryForm" novalidate><div class="form-grid"><div class="field"><label for="telEndpoint">ENDPOINT</label><input id="telEndpoint" name="endpoint" value="${E(t.endpoint||'')}" maxlength="400" placeholder="vazio = OTEL_EXPORTER_OTLP_ENDPOINT" autocomplete="off"></div><div class="field"><label for="telService">SERVICE NAME</label><input id="telService" name="serviceName" value="${E(t.serviceName||'')}" maxlength="80" placeholder="squad-code" autocomplete="off"></div><div class="field full"><span class="label">HEADERS</span><div id="telHeaders" class="tel-headers">${(t.headers||[]).map(telHeaderRowHTML).join('')}</div><button type="button" class="btn ghost sm" data-action="tel-hdr-add">${icon('plus')}Adicionar header</button><span class="hint">Guarde só o nome da variável de ambiente: o valor é lido do ambiente do bridge na hora do envio e nunca é salvo nem exibido. A telemetria só sai para Perfis com a telemetria ligada.</span></div></div><div class="flex wrap prof-form-actions"><span class="grow"></span><button type="submit" class="btn primary">${icon('check')}Salvar telemetria</button></div></form>`;
}
async function loadTelemetry(){if(!BRIDGE_TOKEN)return;try{const d=await bridgeFetch('/api/telemetry');ui.telemetry=normTelemetry(d);ui.telemetryErr='';}catch(error){ui.telemetryErr=error.message;}const box=$('#telemetryBox');if(box&&ui.modal==='settings')box.innerHTML=telemetryHTML();}
function normTelemetry(d){const t=d?.telemetry&&typeof d.telemetry==='object'?d.telemetry:d||{};return{endpoint:String(t.endpoint||''),serviceName:String(t.serviceName||''),headers:Array.isArray(t.headers)?t.headers.filter(h=>h&&typeof h==='object').map(h=>({name:String(h.name||''),env:String(h.env||''),present:!!h.present})):[]};}
async function saveTelemetry(form){
 const d=new FormData(form),names=d.getAll('hdrName').map(x=>String(x).trim()),envs=d.getAll('hdrEnv').map(x=>String(x).trim()),headersEnv={};
 for(let i=0;i<names.length;i++){if(!names[i]&&!envs[i])continue;if(!/^[A-Za-z0-9-]{1,80}$/.test(names[i]))return toast(`Header inválido: ${names[i]||'(vazio)'}.`,'error');if(!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(envs[i]))return toast(`Use o nome de uma variável de ambiente (letras, números e _) para ${names[i]}, nunca o valor.`,'error');headersEnv[names[i]]=envs[i];}
 const body={endpoint:String(d.get('endpoint')||'').trim(),serviceName:String(d.get('serviceName')||'').trim(),headersEnv};
 if(body.endpoint&&!/^https?:\/\/\S+$/i.test(body.endpoint))return toast('O endpoint deve começar com http:// ou https://.','error');
 try{const r=await bridgeFetch('/api/telemetry',{method:'PUT',body:JSON.stringify(body)});ui.telemetry=r&&('endpoint' in r||r.telemetry)?normTelemetry(r):null;toast('Telemetria salva.');if(!ui.telemetry)await loadTelemetry();else{const box=$('#telemetryBox');if(box)box.innerHTML=telemetryHTML();}}
 catch(error){toast(error.message,'error');}
}
/* Painel > Uso dos perfis: Janelas de uso, tokens de hoje e dos últimos 7 dias por Perfil (GET /api/usage) e a quebra por agente ou
   operação. Bloco com assinatura (opsBlock): renders do Painel não o recriam sem mudança de dados. */
function usageRows(d){
 const list=Array.isArray(d)?d:Array.isArray(d?.rows)?d.rows:Array.isArray(d?.usage)?d.usage:Array.isArray(d?.items)?d.items:d?.by&&typeof d.by==='object'&&!Array.isArray(d.by)?Object.entries(d.by).map(([key,v])=>({key,...v})):[];
 const n=v=>Number.isFinite(+v)?+v:0;
 return list.filter(x=>x&&typeof x==='object').map(x=>{const t=x.tokens&&typeof x.tokens==='object'?x.tokens:x;return{key:String(x.key??x.id??x.profileId??x.profile_id??x.agentId??x.agent_id??x.projectId??x.project_id??x.day??''),input:n(t.input??t.inputTokens??t.input_tokens),cacheRead:n(t.cacheRead??t.cacheReadTokens??t.cache_read_tokens),cacheWrite:n(t.cacheWrite??t.cacheWriteTokens??t.cache_write_tokens),output:n(t.output??t.outputTokens??t.output_tokens),reasoning:n(t.reasoning??t.reasoningTokens??t.reasoning_tokens),runs:n(x.runs??x.count??x.n)};});
}
async function loadUsage(force=false){
 const ps=ui.profiles;if(!BRIDGE_TOKEN||!ps.loaded||ps.usageBusy)return;if(!force&&ps.usage&&Date.now()-ps.usage.at<60000&&ps.usage.by===ui.usageBy)return;ps.usageBusy=true;
 const now=new Date(),to=now.toISOString(),day=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString(),week=new Date(now.getTime()-7*864e5).toISOString(),by=ui.usageBy;
 const q=(from,kind)=>bridgeFetch(`/api/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&by=${kind}`).then(usageRows,()=>null);
 try{const [today,seven,rows]=await Promise.all([q(day,'profile'),q(week,'profile'),by?q(week,by):null]);ps.usage={today,week:seven,by,rows,at:Date.now()};}
 finally{ps.usageBusy=false;}
 renderHomeUsage();
}
function usageTokHTML(r,label){if(!r)return`<span class="prof-tok"><b>${label}</b>sem dados</span>`;return`<span class="prof-tok" title="${label}: ${r.runs} execuções, ${r.input} de input, ${r.cacheRead+r.cacheWrite} de cache, ${r.output} de output${r.reasoning?`, ${r.reasoning} de raciocínio`:''}"><b>${label}</b>in ${fmtTok(r.input)} · cache ${fmtTok(r.cacheRead+r.cacheWrite)} · out ${fmtTok(r.output)}</span>`;}
function homeUsageHTML(){
 const ps=ui.profiles,u=ps.usage,head=extra=>`<div class="home-section-head"><span>USO DOS PERFIS</span><span class="flex">${extra||''}</span></div>`;
 if(!BRIDGE_TOKEN)return head()+`<p class="hint home-usage-off">O uso por Perfil (Janelas de 5 horas e 7 dias, tokens por execução) aparece com o bridge. Aqui as execuções são simuladas.</p>`;
 if(!ps.loaded)return head()+`<p class="hint home-usage-off">${ps.error?`Perfis indisponíveis: ${E(ps.error)}`:'Carregando os Perfis…'}</p>`;
 const by=ui.usageBy,tabs=[['agent','Por agente'],['project','Por operação']].map(([k,l])=>`<button type="button" class="link-button ${by===k?'on':''}" data-action="usage-by" data-by="${k}" aria-pressed="${by===k}">${l.toUpperCase()}</button>`).join('')+`<button type="button" class="link-button" data-action="usage-refresh" title="Atualizar">${icon('rotate-left')}</button>`;
 const pick=(rows,id)=>rows?rows.find(r=>r.key===id)||{key:id,input:0,cacheRead:0,cacheWrite:0,output:0,reasoning:0,runs:0}:null;
 const cards=ps.list.map(p=>`<div class="prof-usage ${p.adapter}"><div class="prof-usage-head">${profileChipHTML({name:ADAPTER_LABEL[p.adapter],adapter:p.adapter})}<strong>${E(p.name)}</strong>${p.isDefault?'<span class="tag accent">PADRÃO</span>':''}${runtime().forceProfileId===p.id?'<span class="tag">FORÇADO</span>':''}<span class="grow"></span><span class="prof-run ${p.active?'on':''}" title="Execuções ativas / teto do Perfil">${p.active}/${p.concurrency}</span></div><div class="prof-wins">${windowBarHTML(p.windows.five_hour,'5H',p.threshold)}${windowBarHTML(p.windows.seven_day,'7D',p.threshold)}</div><div class="prof-toks">${usageTokHTML(pick(u?.today,p.id),'HOJE')}${usageTokHTML(pick(u?.week,p.id),'7 DIAS')}</div></div>`).join('');
 let detail='';
 if(by){const rows=(u?.by===by?u.rows:null);const name=k=>by==='agent'?agentById(k)?.name||(k?'agente removido':'sem agente'):(()=>{const p=state.projects.find(x=>x.id===k);return p?`${p.code} ${p.name}`:k?'operação removida':'sem operação';})();
  detail=`<div class="prof-usage-detail"><div class="prof-usage-row head"><span>${by==='agent'?'AGENTE':'OPERAÇÃO'} · 7 DIAS</span><span>EXEC.</span><span>INPUT</span><span>CACHE</span><span>OUTPUT</span></div>${!rows?`<p class="hint">${u?.by===by?'Sem dados.':'Carregando…'}</p>`:rows.length?rows.slice().sort((a,b)=>(b.input+b.output)-(a.input+a.output)).slice(0,30).map(r=>`<div class="prof-usage-row"><span>${E(name(r.key))}</span><span>${r.runs}</span><span>${fmtTok(r.input)}</span><span>${fmtTok(r.cacheRead+r.cacheWrite)}</span><span>${fmtTok(r.output)}</span></div>`).join(''):'<p class="hint">Nenhuma execução nos últimos 7 dias.</p>'}</div>`;}
 return head(tabs)+`<div class="prof-usage-grid">${cards||'<p class="hint">Nenhum Perfil cadastrado.</p>'}</div>${detail}${u?`<p class="hint prof-usage-age">Tokens lidos ${profAgo(u.at)}. Só execuções feitas pelo app.</p>`:''}`;
}
function renderHomeUsage(){
 if(ui.view!=='home'||!$('#homeUsage'))return;const ps=ui.profiles,u=ps.usage;
 const sig=JSON.stringify([!!BRIDGE_TOKEN,ps.loaded,ps.error,runtime().forceProfileId,ps.list.map(p=>[p.id,p.name,p.adapter,p.isDefault,p.active,p.concurrency,p.threshold,p.windows]),u&&[u.at,u.by,u.today,u.week,u.rows],ui.usageBy,Math.floor(Date.now()/60000)]);
 opsBlock('homeUsage',sig,homeUsageHTML);
 if(ps.loaded&&!ps.usageBusy&&(!u||Date.now()-u.at>60000||u.by!==ui.usageBy))loadUsage();
}
/* Command preview: mirrors the argument order built by server.js (startRun). */
function claudeArgs(o,systemFile){
 const args=[['-p'],['--output-format','stream-json'],['--verbose'],['--permission-prompts','none']];
 if(systemFile)args.push(['--append-system-prompt-file',systemFile]);
 if(o.project)args.push(['--settings','squad.settings.json']);
 if(o.agents)args.push(['--agents','squad.agents.json']);
 if(o.forwardSubagents)args.push(['--forward-subagent-text']);
 if(o.model)args.push(['--model',o.model]);
 if(o.permissionMode)args.push(['--permission-mode',o.permissionMode]);
 if(o.effort)args.push(['--effort',o.effort]);
 if(o.maxBudgetUsd)args.push(['--max-budget-usd',String(Number(o.maxBudgetUsd))]);
 if(o.tools)args.push(['--tools',o.tools.join(',')]);
 if(o.allowedTools.length)args.push(['--allowedTools',o.allowedTools.join(',')]);
 for(const d of o.addDirs)args.push(['--add-dir',d]);
 return args;
}
function shellQuote(value,shell){
 const v=String(value);if(/^[A-Za-z0-9_\-.:\\/=@,+]+$/.test(v))return v;
 return shell==='bash'?`'${v.replace(/'/g,`'\\''`)}'`:`'${v.replace(/'/g,"''")}'`;
}
function commandPreview(a,r,shell){
 const o=stepRunOptions(a,project(),r).options,bin=r.claudePath||'claude',cwd=projectDirLabel(),slug=a.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'agente';
 const sys=agentSystemPrompt(a).trim()?`${slug}.system.md`:'',q=v=>shellQuote(v,shell),cont=shell==='bash'?' \\':' `';
 const flags=claudeArgs(o,sys).map(pair=>'  '+pair.map((t,i)=>i===0?`<b>${E(t)}</b>`:`<i>${E(q(t))}</i>`).join(' '));
 const lines=[`<em># ${E(a.name)} / ${E(roleLabel(a))} / modelo ${E(o.model||'padrão do Claude Code')} / limite ${E(o.timeoutSec)}s</em>`];
 lines.push(`<span>cd ${E(q(cwd))}</span>`);
 const head=shell==='bash'?`<span>${E(q(bin))}</span>`:`<span>Get-Content .\\${E(slug)}.prompt.md -Raw | ${bin.includes(' ')?'& ':''}${E(q(bin))}</span>`;
 const body=[head,...flags];
 const joined=body.map((l,i)=>i<body.length-1?l+cont:l);
 if(shell==='bash')joined[joined.length-1]+=` <span>&lt; ${E(slug)}.prompt.md</span>`;
 return lines.concat(joined).join('\n');
}
function previewDraftRuntime(){const form=$('#runtimeForm');if(!form)return runtime();const d=new FormData(form),raw=Object.fromEntries(d.entries());raw.restrictTools=d.has('restrictTools');return normalizeRuntime(raw);}
function refreshCommandPreview(){
 const out=$('#cmdPreview');if(!out)return;const a=agentById($('#cmdAgent')?.value)||agentById(ui.selectedId)||squad()[0];if(!a){out.innerHTML='<em># Nenhum agente no squad.</em>';return;}
 const shell=$('#cmdShell')?.value||'powershell',r=previewDraftRuntime();
 out.innerHTML=commandPreview(a,r,shell);
 const note=$('#cmdNote');if(note)note.textContent=r.mode==='demo'?'Modo demo: nenhum comando é executado. Este é o comando que rodaria no modo Claude Code real.':`O bridge envia o prompt da etapa por stdin e grava as instruções de ${a.name} em um arquivo temporário. Em squad.settings.json vai o claudeMdExcludes que tira o CLAUDE.md do SQUAD/CODE do contexto dos agentes. Para testar manualmente, crie ${a.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.prompt.md, .system.md e squad.settings.json.`;
}
function commandPreviewHTML(){
 const team=squad(),sel=team.some(a=>a.id===ui.selectedId)?ui.selectedId:team[0]?.id,win=(ui.bridge.platform||navigator.platform||'').toLowerCase().startsWith('win');
 return`<div class="cmd-preview"><div class="cmd-preview-head"><span class="eyebrow">PREVIEW DA CHAMADA NO TERMINAL</span><div class="flex wrap"><select id="cmdAgent" aria-label="Agente do preview">${team.map(a=>`<option value="${E(a.id)}" ${a.id===sel?'selected':''}>${E(a.name)} / ${E(roleShort(a))}</option>`).join('')}</select><select id="cmdShell" aria-label="Shell do preview"><option value="powershell" ${win?'selected':''}>PowerShell</option><option value="bash" ${win?'':'selected'}>Bash</option></select><button type="button" class="btn ghost sm" data-action="cmd-copy">${icon('copy')}Copiar</button></div></div><pre id="cmdPreview" class="cmd-lines"></pre><span class="hint" id="cmdNote"></span></div>`;
}
function buildStepPrompt(f,a,p){
 const route=f.route.map(id=>agentById(id)),next=route[f.step+1],clip=(t,n)=>t.length>n?t.slice(0,n)+'\n[...]':t,sp=sprintOf(f,p);
 const brief=f.briefs?.length===f.route.length?f.briefs[f.step]:'',mates=Object.entries(squadSubagents(a,p).keys).map(([key,id])=>{const m=agentById(id);return`- ${key}: ${m.name}, ${roleLabel(m)}`;});
 const deps=f.dependencies.map(id=>p.features.find(x=>x.id===id)).filter(Boolean).map(d=>{const last=[...d.outputs].reverse().find(o=>!o.error);return`- ${d.key} / ${d.title}${last?`\n  Entrega aprovada (${agentById(last.agentId)?.name||'agente'}):\n  ${clip(last.text,2000).replace(/\n/g,'\n  ')}`:''}`;}).join('\n');
 const previous=f.outputs.slice(f.runStart??f.outputs.length).filter(o=>!o.error).slice(-4).map(o=>`### ${agentById(o.agentId)?.name||'Agente'} (${agentById(o.agentId)?roleLabel(agentById(o.agentId)):''})\n${clip(o.text,6000)}`).join('\n\n');
 return[
  `# Operação ${p.code}: ${p.name}`,
  `## Briefing do projeto\n${p.briefing||'(sem briefing)'}`,
  `## Sua atribuição\nVocê é ${a.name}, ${roleLabel(a)}. Etapa ${f.step+1} de ${f.route.length} da rota: ${route.map(x=>x?.name||'?').join(' > ')}.`,
  `## Feature ${f.key}: ${f.title}\nPrioridade: ${f.priority} / Área: ${SCOPES[f.scope]}${sp?` / Sprint: ${sp.name}${sp.goal?`\nObjetivo da sprint: ${sp.goal}`:''}`:''}\n\nEscopo:\n${f.description||'(não detalhado)'}\n\nCritérios de aceitação:\n${f.criteria}`,
  deps?`## Dependências já aprovadas\n${deps}`:'',
  f.context?`## Contexto de handoff registrado\n${clip(f.context,6000)}`:'',
  previous?`## Entregas anteriores nesta rota\n${previous}`:'',
  brief?`## Instrução do comandante para você\n${brief}`:'',
  mates.length?`## Colegas que você pode chamar\n${agentAdapter(a)==='codex'?'Use a ferramenta chamar_colega (servidor MCP squad) com agente igual ao identificador e o pedido em pedido,':'Use a ferramenta Agent com subagent_type igual ao identificador'} para pedir a um colega uma decisão, uma revisão ou uma parte que é da especialidade dele. Explique no pedido o que precisa e o contexto. O colega trabalha na mesma pasta, com as ferramentas dele, e devolve a resposta para você. Não delegue a sua etapa inteira.\n${mates.join('\n')}`:'',
  `## Entrega esperada\nSiga rigorosamente o guia de convenções e boas práticas anexado às suas instruções. Trabalhe na pasta desta operação, que é o diretório de trabalho atual (projects/${p.folder}): todo código, teste e documento da implementação fica dentro dela, e nada fora dela deve ser criado ou alterado. Execute a sua parte respeitando o seu papel. Não declare testes ou verificações que não executou.\n${next?`Ao terminar, responda com um resumo de handoff para ${next.name} (${roleLabel(next)}): o que foi feito, arquivos alterados, decisões, pendências e o próximo passo.`:'Você é a última etapa. Responda com um relatório para a revisão humana: o que foi entregue, arquivos alterados, evidências de verificação executadas, lacunas e riscos.'}\nResponda em português do Brasil.`
 ].filter(Boolean).join('\n\n');
}
function newConsole(meta){const c={id:meta.runId||id('console'),lines:[],status:'running',startedAt:nowISO(),...meta};ui.consoles.push(c);if(ui.consoles.length>12)ui.consoles.shift();ui.consoleId=c.id;return c;}
function consoleLine(c,kind,text){c.lines.push({kind,text:String(text).slice(0,6000),at:nowISO()});if(c.lines.length>1500)c.lines.splice(0,c.lines.length-1500);scheduleConsoleRefresh();}
function describeTool(block){const input=block.input||{};const hint=input.command||input.file_path||input.path||input.pattern||input.url||input.query||input.description||Object.values(input).find(v=>typeof v==='string')||'';return`${block.name}${hint?'  '+String(hint).replace(/\s+/g,' ').slice(0,160):''}`;}
function handleRunEvent(c,evt){
 if(evt.type==='bridge'&&evt.subtype==='spawned')consoleLine(c,'cmd',`$ ${evt.adapter==='codex'?'codex':'claude'} ${(evt.args||[]).join(' ')}\n  cwd: ${evt.cwd} / pid ${evt.pid}`);
 else if(evt.type==='bridge'&&evt.subtype==='profile'){c.profile={id:evt.profileId,name:evt.name,adapter:evt.adapter};consoleLine(c,evt.fallbackFrom?'warn':'sys',`Perfil ${evt.name||evt.profileId||'?'} (${ADAPTER_LABEL[evt.adapter]||evt.adapter||'?'})${evt.fallbackFrom?` / reserva: a Janela de uso de ${profileById(evt.fallbackFrom)?.name||evt.fallbackFrom} passou do limiar`:''}`);profilesRefreshSoon();}
 else if(evt.type==='bridge'&&evt.subtype==='warning')consoleLine(c,'warn',String(evt.message||'Aviso do bridge.'));
 else if(evt.type==='bridge')consoleLine(c,'warn',evt.subtype==='timeout'?`Tempo limite de ${evt.timeoutSec}s atingido. Encerrando processo.`:'Cancelamento solicitado.');
 else if(evt.type==='system'&&evt.subtype==='init'){c.sessionId=evt.session_id;consoleLine(c,'sys',`sessão ${evt.session_id} / modelo ${evt.model||'?'} / permissão ${evt.permissionMode||'?'} / ${evt.tools?.length??0} ferramentas`);}
 else if(evt.type==='assistant')for(const b of evt.message?.content||[]){if(b.type==='text'&&b.text.trim())consoleLine(c,'text',b.text);else if(b.type==='tool_use')consoleLine(c,'tool',describeTool(b));}
 else if(evt.type==='user')for(const b of evt.message?.content||[]){if(b.type==='tool_result'&&b.is_error)consoleLine(c,'error',typeof b.content==='string'?b.content.slice(0,600):'Falha na ferramenta.');}
 else if(evt.type==='result'){c.costUsd=evt.total_cost_usd??null;if(evt.permission_denials?.length)consoleLine(c,'warn',`Permissões negadas: ${evt.permission_denials.map(d=>d.tool_name).join(', ')}. Ajuste ferramentas ou o modo de permissão.`);}
 else if(evt.type==='stderr'&&evt.text.trim())consoleLine(c,'dim',evt.text.trim());
 else if(evt.type==='raw')consoleLine(c,'dim',evt.text);
 else if(evt.type==='exit'){c.status=evt.status;c.costUsd=evt.costUsd??c.costUsd;const u=evt.usage&&typeof evt.usage==='object'?evt.usage:null,tok=u?` / tokens in ${fmtTok(u.input)} · cache ${fmtTok((u.cacheRead||0)+(u.cacheWrite||0))} · out ${fmtTok(u.output)}`:'';consoleLine(c,evt.isError?'error':'ok',evt.isError?`FALHOU: ${evt.error}`:`CONCLUÍDO em ${evt.durationMs?Math.round(evt.durationMs/1000)+'s':'?'} / ${evt.numTurns??'?'} turnos${evt.costUsd!=null?` / US$ ${Number(evt.costUsd).toFixed(4)}`:''}${tok}`);if(!c.history)profilesRefreshSoon();}
}
let consoleFrame=0;
function scheduleConsoleRefresh(){if(consoleFrame||ui.modal!=='console')return;consoleFrame=requestAnimationFrame(()=>{consoleFrame=0;refreshConsole();});}
function consoleHTML(c){
 if(!c)return emptyPanel('Nenhuma execução ainda','Distribua as features e inicie a operação, ou faça um spawn individual com o bridge conectado.');
 return`<div class="console-meta"><span class="tag ${c.status==='running'?'accent':''}">${E(c.status.toUpperCase())}</span><span>${E(agentById(c.agentId)?.name||'AGENTE')} / ${E(featureById(c.featureId)?.key||'')}</span>${c.sessionId?`<span>SESSÃO ${E(c.sessionId.slice(0,8))}</span>`:''}${c.costUsd!=null?`<span>US$ ${Number(c.costUsd).toFixed(4)}</span>`:''}</div><div class="console-lines" id="consoleLines">${c.lines.map(l=>`<div class="console-line ${l.kind}"><time>${clock(l.at)}</time><pre>${E(l.text)}</pre></div>`).join('')||'<div class="console-line dim"><pre>Aguardando saída do processo...</pre></div>'}</div>`;
}
function consoleTabsHTML(){const current=ui.consoleId||ui.consoles.at(-1)?.id;return ui.consoles.slice().reverse().map(c=>`<button class="btn sm ${c.id===current?'white':'ghost'}" data-action="console-pick" data-id="${E(c.id)}">${E(agentById(c.agentId)?.name||'AGENTE')} / ${E(featureById(c.featureId)?.key||'')} ${c.status==='running'?'&bull;':''}</button>`).join('')||'<span class="hint">Sem execuções nesta sessão.</span>';}
function refreshConsole(){
 if(ui.modal!=='console')return;const root=$('#consoleRoot');if(!root)return;const lines=$('#consoleLines'),stick=!lines||lines.scrollHeight-lines.scrollTop-lines.clientHeight<60;
 const tabs=$('#consoleTabs'),html=consoleTabsHTML();if(tabs&&tabs.dataset.html!==html){tabs.innerHTML=html;tabs.dataset.html=html;}
 root.innerHTML=ui.consoleHistory?consoleHistoryHTML(ui.consoleHistory):consoleHTML(ui.consoles.find(c=>c.id===ui.consoleId)||ui.consoles.at(-1));
 const next=$('#consoleLines');if(next&&stick)next.scrollTop=next.scrollHeight;
 const cancel=$('.modal-footer [data-action=stop]');if(cancel)cancel.hidden=!runner;
}
function openConsole(consoleId){
 if(consoleId)ui.consoleId=consoleId;ui.consoleHistory=null;
 showModal('CONSOLE DO <span class="word-tag">CLAUDE CODE</span>',project().code+' / claude -p / STREAM-JSON',`<div class="modal-toolbar"><div class="flex wrap" id="consoleTabs"></div><div class="flex wrap">${BRIDGE_TOKEN?`<button class="btn ghost sm" data-action="console-history">${icon('clock')}Histórico</button>`:''}<button class="btn ghost sm" data-action="logs">${icon('radio')}Transmissões</button></div></div><div id="consoleRoot"></div>`,`<span class="footer-note">${liveMode()?'EXECUÇÃO REAL / '+E(projectDirLabel()):'BRIDGE DESCONECTADO'}</span><span class="grow"></span><button class="btn danger" data-action="stop" ${runner?'':'hidden'}>${icon('stop')}Encerrar operação</button>`,'wide','console');
 refreshConsole();
}
/* Run history from the bridge database: this operation's earlier runs (also from before a restart) replay into a console. */
const RUN_KIND={step:'etapa',spawn:'spawn',plan:'plano',chat:'conversa',cowrite:'co-escrita',doc:'Agent Teams'};
async function openConsoleHistory(){
 if(!BRIDGE_TOKEN)return toast('O histórico de execuções precisa do bridge.','error');
 try{const d=await bridgeFetch(`/api/runs?projectId=${encodeURIComponent(project().id)}&limit=40`);ui.consoleHistory=d.runs;refreshConsole();}
 catch(error){toast(error.message,'error');}
}
function consoleHistoryHTML(list){return`<div class="console-history"><div class="console-history-head"><strong>HISTÓRICO DE EXECUÇÕES / ${E(project().code)}</strong><button class="btn ghost sm" data-action="console-history-close">${icon('close')}Fechar histórico</button></div>${list.length?list.map(r=>`<button class="console-run" data-action="console-replay" data-id="${E(r.id)}"><span class="tag ${r.status==='running'?'accent':''}">${E(String(r.status||'').toUpperCase())}</span><strong>${E(r.label||'Execução')}</strong><span>${E(RUN_KIND[r.kind]||'')}</span><time>${E(versionWhen(r.startedAt))}</time>${r.costUsd!=null?`<span>US$ ${Number(r.costUsd).toFixed(4)}</span>`:''}</button>`).join(''):emptyPanel('Sem execuções salvas','As execuções desta operação com o bridge aparecem aqui, inclusive as de sessões anteriores.')}</div>`;}
async function replayRun(runId){
 const r=ui.consoleHistory?.find(x=>x.id===runId);ui.consoleHistory=null;
 if(ui.consoles.some(c=>c.id===runId)){ui.consoleId=runId;return refreshConsole();}
 const c=newConsole({runId,agentId:r?.agentId||null,featureId:r?.featureId||null,history:true});c.startedAt=r?.startedAt||c.startedAt;c.status=r?.status||'done';
 consoleLine(c,'sys',`Reprodução do histórico / ${r?.label||runId}`);refreshConsole();
 try{await streamRun(runId,evt=>handleRunEvent(c,evt));}catch(error){consoleLine(c,'error',error.message);}
 refreshConsole();
}
async function executeLiveStep(f,a,p,owner){
 f.runStart??=f.outputs.length;
 const prompt=buildStepPrompt(f,a,p),{options,keys}=stepRunOptions(a,p),ctx=roomCtx(a,f,keys);
 let started;
 try{started=await bridgeFetch('/api/runs',{method:'POST',body:JSON.stringify({prompt,systemPrompt:agentSystemPrompt(a),label:`${a.name} / ${f.key}`,meta:runMeta(p,a,f,owner?.kind==='spawn'?'spawn':'step'),options})});}
 catch(error){return{error:error.message};}
 if(runner!==owner){bridgeFetch(`/api/runs/${started.runId}/cancel`,{method:'POST'}).catch(()=>{});return{cancelled:true};}
 owner.runId=started.runId;
 const c=newConsole({runId:started.runId,agentId:a.id,featureId:f.id});
 log(`${a.name}: claude -p iniciado para ${f.key} (${options.model||'modelo padrão'} / ${options.permissionMode}).`,'agent',a.id,p);p.logs.at(-1).simulated=false;save();render();refreshFeatureModal();refreshConsole();
 try{const exit=await streamRun(started.runId,evt=>{handleRunEvent(c,evt);if(runner===owner)roomEvent(ctx,evt);});exit.room=ctx;return exit;}
 catch(error){c.status='error';consoleLine(c,'error',error.message);return{error:error.message};}
 finally{if(owner.runId===started.runId)owner.runId=null;ctx.calls.forEach(id=>roomCalling.delete(id));roomChrome();}
}

/* Operation room: the commander plans the run and the squad talks in a group chat (steps, calls between agents, baton passes).
   Memory only, per project (ui.rooms); logs and handoffs stay the persisted record. */
const ROOM_MAX=800,roomCalling=new Set();
// With the bridge the room is saved too (POST /api/rooms/:projectId): changed and removed messages, 600 ms after the last change.
const roomOwner=new WeakMap(),roomSaveQ=new Map();let roomSaveTimer=0;
function roomQueue(m,pid,removed=false){
 if(!diskSync.on||!m||!pid)return;let q=roomSaveQ.get(pid);if(!q)roomSaveQ.set(pid,q={up:new Map(),rm:new Set()});
 if(removed){q.up.delete(m.id);q.rm.add(m.id);}else{q.rm.delete(m.id);q.up.set(m.id,m);}
 clearTimeout(roomSaveTimer);roomSaveTimer=setTimeout(roomFlush,600);
}
function roomFlush(leaving=false){
 clearTimeout(roomSaveTimer);roomSaveTimer=0;
 for(const [pid,q] of roomSaveQ){roomSaveQ.delete(pid);
  const url=`/api/rooms/${encodeURIComponent(pid)}`,body=JSON.stringify({seq:ui.rooms?.[pid]?.seq||0,upserts:[...q.up.values()],removes:[...q.rm]});
  if(leaving&&navigator.sendBeacon&&body.length<60000&&navigator.sendBeacon(`${url}?token=${BRIDGE_TOKEN}`,new Blob([body],{type:'application/json'})))continue;
  // A failed save goes back to the queue and leaves with the next change.
  bridgeFetch(url,{method:'POST',body,keepalive:leaving&&body.length<60000}).catch(()=>{for(const [k,m] of q.up)if(!roomSaveQ.get(pid)?.rm.has(k))roomQueue(m,pid);for(const k of q.rm)roomQueue({id:k},pid,true);clearTimeout(roomSaveTimer);roomSaveTimer=0;});}
}
const COMMANDER_PLAN_SYSTEM=['# Modo planejamento de execução (SQUAD/CODE)','Você é o comandante da squad e vai montar o plano de execução que a pessoa aprova antes de a squad começar. Não execute nada, não use ferramentas e não escreva código.','- Para cada feature listada, defina a rota: a ordem dos colegas que vão trabalhar nela, do primeiro ao último, usando só os codinomes da squad. Você coordena e não entra na rota.','- A rota sugerida é um ponto de partida: mantenha, encurte ou reordene quando o escopo da feature pedir. Quando houver QA na squad, termine com quem verifica a entrega.','- Para cada colega da rota escreva uma instrução curta e concreta (1 ou 2 frases) do que ele entrega naquela feature.','- Primeiro escreva para a squad, em português do Brasil, de 2 a 4 frases no seu jeito: a estratégia e a ordem de ataque. Sem travessões e sem listas longas.','- Termine com UM bloco ```json exatamente neste formato:','{"plan":[{"feature":"F02","route":["CODINOME","CODINOME"],"briefs":{"CODINOME":"instrução"}}]}'].join('\n');
const CALLED_AGENT_SYSTEM=['# Chamado por um colega (SQUAD/CODE)','Um colega da squad chamou você no meio da etapa dele. Faça só o que ele pediu, dentro da sua especialidade, na pasta do projeto (o diretório de trabalho atual). Não refaça a etapa dele e não avance a rota.','Responda para ele em português do Brasil, de forma objetiva: o que você decidiu ou fez, os arquivos que alterou e o que ele precisa saber para continuar. Não declare testes ou verificações que não executou.'].join('\n');
// Setup of the project (F00): each colleague prepares their part of the base, never a feature.
const SETUP_BRIEF={architect:'Definir a estrutura do repositório, a stack e as convenções de {f} a partir da arquitetura, das ADRs e das diretrizes, sem implementar features.',backend:'Criar a base do backend em {f}: projeto, dependências, configuração, scripts de build e teste e um endpoint de saúde.',frontend:'Criar a base do frontend em {f}: projeto, dependências, estrutura de pastas, lint e um teste de exemplo.',mobile:'Criar a base do app em {f}: projeto, dependências, estrutura de pastas, lint e um teste de exemplo.',qa:'Verificar {f}: o projeto instala, roda, passa no lint e nos testes com os comandos do README.'};
const ROLE_BRIEF={po:'Refinar o escopo e os critérios de aceitação de {f} e deixar o handoff claro para quem implementa.',architect:'Definir contratos, fronteiras e decisões técnicas de {f} antes da implementação.',backend:'Implementar a API, as regras de negócio e a persistência de {f}.',frontend:'Implementar a interface de {f} com os estados de carregamento, vazio e erro, integrada à API.',mobile:'Implementar as telas de {f} no app, integradas à API.',qa:'Verificar {f} contra os critérios de aceitação e reportar evidências, lacunas e riscos.'};
const SIM_WORK={po:['Fechei o escopo e os critérios de aceitação. O handoff já diz o que entra e o que fica de fora.',[['file','Leu docs/project/briefing.md'],['edit','Editou docs/features/{k}/acceptance-criteria.md']]],architect:['Contratos e fronteiras definidos, com a decisão registrada.',[['file','Leu docs/architecture/overview.md'],['edit','Criou docs/architecture/adr/{k}.md']]],backend:['API e validações prontas, com os totais recalculados no servidor.',[['file','Leu docs/features/{k}/spec.md'],['edit','Editou src/api/{k}.ts'],['terminal','Rodou npm test']]],frontend:['Tela pronta, com os estados de carregamento, vazio e erro.',[['file','Leu src/api/{k}.ts'],['edit','Editou src/ui/{k}.tsx'],['terminal','Rodou npm run build']]],qa:['Conferi a entrega contra os critérios e listei as evidências.',[['file','Leu docs/features/{k}/acceptance-criteria.md'],['terminal','Rodou npm test'],['check','Checklist de acessibilidade']]],default:['Minha parte está feita.',[['file','Leu docs/features/{k}/spec.md'],['edit','Editou os arquivos da feature']]]};
const SIM_CALL={backend:'Antes de fechar a {f}: o contrato da API segue o que ficou decidido ou mudou algo?',frontend:'Qual formato de erro a API da {f} devolve? Quero tratar isso na tela.',default:'Pode confirmar o que ficou combinado para a {f} antes de eu seguir?'};
function roleFamilyOf(a){const r=a?.role;return Object.entries(ROLE_FAMILY).find(([,list])=>list.includes(r))?.[0]||r;}
function defaultBrief(a,f){const t=(f.setup?SETUP_BRIEF:ROLE_BRIEF)[roleFamilyOf(a)];return t?t.replace('{f}',`${f.key} (${f.title})`):`Executar a parte de ${roleLabel(a)} em ${f.key} (${f.title}).`;}
function runControl(){if(!runner)return null;if(runner.phase==='planning')return{icon:'radio',label:'Planejando',busy:true};if(runner.phase==='awaiting')return{icon:'check',label:'Aprovar plano'};return runner.paused?{icon:'play',label:'Retomar'}:{icon:'pause',label:'Pausar'};}
function roomOf(p=project()){ui.rooms??={};return ui.rooms[p.id]??=roomHydrate(p.id);}
// A project's saved room (#squad-memory, read once): what was live when the page closed ends there (no pending plan, no open call).
function roomHydrate(pid){
 const r={messages:[],seq:0,typing:null},saved=bootMemory?.rooms?.[pid];if(!saved)return r;delete bootMemory.rooms[pid];
 for(const m of Array.isArray(saved.messages)?saved.messages:[]){if(!m||typeof m.id!=='string'||!/^rm\d+$/.test(m.id))continue;if(m.kind==='plan'&&m.status==='awaiting')m.status='cancelled';if(m.kind==='call'&&m.status==='open')m.status='cancelled';if(m.live)m.live=false;roomOwner.set(m,pid);r.messages.push(m);}
 r.seq=Math.max(Number(saved.seq)||0,...r.messages.map(m=>Number(m.id.slice(2))||0));return r;
}
function roomAgentName(id){const a=agentById(id);return a?a.name:String(id||'').startsWith('sub:')?String(id).slice(4).toUpperCase():'AGENTE';}
function roomFace(id,cls=''){const a=agentById(id);return a?`<img class="room-face ${cls}" src="${portrait(a)}" alt="">`:`<span class="room-face ${cls} none">${icon('robot')}</span>`;}
function roomMetaHTML(m,who,extra=''){const a=agentById(who);return`<div class="room-meta"><strong>${E(m.human?'VOCÊ':roomAgentName(who))}</strong>${a&&!extra?`<span>${E(roleLabel(a))}</span>`:''}${extra}${m.profile?profileChipHTML(m.profile,'sm'):''}${m.featureKey?`<em>${E(m.featureKey)}</em>`:''}<time>${clock(m.at)}</time></div>`;}
function roomClip(t,n){t=String(t||'');return t.length>n?t.slice(0,n)+'…':t;}
function roomMsgHTML(m){
 if(m.kind==='system')return`<div class="room-row system" data-rid="${m.id}"><p class="room-note ${m.tone||''}">${E(m.text)}</p></div>`;
 if(m.kind==='say'){const a=agentById(m.agentId),acts=m.activity||[],shown=acts.slice(-6);return`<div class="room-row say${m.thread?' thread':''}${m.human?' human':''}${a?.role==='commander'?' cmd':''}${m.error?' error':''}" data-rid="${m.id}">${m.human?'<span class="room-face human">VOCÊ</span>':roomFace(m.agentId)}<div class="room-msg">${roomMetaHTML(m,m.agentId)}${m.text?`<div class="room-bubble">${renderMarkdown(m.text)}</div>`:''}${acts.length?`<ul class="room-acts">${acts.length>shown.length?`<li class="more">+${acts.length-shown.length} ações antes</li>`:''}${shown.map(x=>`<li class="${x.error?'error':''}">${icon(x.icon)}<span>${E(x.text)}</span></li>`).join('')}</ul>`:''}</div></div>`;}
 if(m.kind==='call'){const to=m.to?roomAgentName(m.to):(m.toLabel||'SUBAGENTE').toUpperCase(),state=m.status==='open'?'aguardando resposta':m.status==='cancelled'?'encerrada com a operação':m.status==='error'?'a chamada falhou':m.status==='async'?'segue em segundo plano':'respondeu';
  return`<div class="room-row call ${m.status}" data-rid="${m.id}"><div class="room-call"><div class="room-call-faces">${roomFace(m.from)}<span class="room-call-line"><i></i></span>${roomFace(m.to||'sub:'+to)}</div><div class="room-msg">${roomMetaHTML(m,m.from,`<span>chamou</span><strong>${E(to)}</strong>`)}${m.text?`<p class="room-call-ask">${E(roomClip(m.text,900))}</p>`:''}${m.answer?`<div class="room-call-answer"><b>${E(to)} ${state}</b>${renderMarkdown(roomClip(m.answer,1600))}</div>`:`<span class="room-call-state ${m.status}">${state}</span>`}</div></div></div>`;}
 if(m.kind==='baton'){const to=m.to?roomAgentName(m.to):'VOCÊ';return`<div class="room-row baton" data-rid="${m.id}"><div class="room-baton"><div class="room-baton-track">${roomFace(m.from)}<span class="room-baton-run"><i></i></span>${m.to?roomFace(m.to):'<span class="room-face human">VOCÊ</span>'}</div><div class="room-msg">${roomMetaHTML(m,m.from,`<span>passou o bastão para</span><strong>${E(to)}</strong>${m.to?'':'<span>para revisão</span>'}`)}${m.text?`<details class="room-delivery"><summary>Entrega${m.simulated?' simulada':''}</summary><div class="room-md">${renderMarkdown(roomClip(m.text,8000))}</div></details>`:''}</div></div></div>`;}
 if(m.kind==='plan')return roomPlanHTML(m);
 if(m.kind==='review'){const f=featureById(m.featureId);return`<div class="room-row review" data-rid="${m.id}"><div class="room-card room-review">${icon('check')}<span><b>${E(m.featureKey)}</b> ${E(f?.title||'')} ${f?.status==='review'?'aguarda a sua revisão.':'saiu da revisão.'}</span>${f?.status==='review'?`<button class="btn sm primary" data-action="feature-open" data-id="${E(f.id)}">Revisar</button>`:f?`<em>${E(STATUS[f.status]||'')}</em>`:''}</div></div>`;}
 return'';
}
function roomPlanHTML(m){
 const src={commander:'MONTADO PELO COMANDANTE',demo:'MONTADO NA DEMONSTRAÇÃO',default:'DISTRIBUIÇÃO PADRÃO DA SQUAD'}[m.source]||'';
 const items=m.items.map(it=>{const f=featureById(it.featureId);if(!f)return'';const briefs=it.route.map((id,i)=>it.briefs[i]?`<li><b>${E(roomAgentName(id))}</b>${E(it.briefs[i])}</li>`:'').join('');
  return`<div class="room-plan-item"><div class="room-plan-f"><b>${E(f.key)}</b><span>${E(f.title)}</span><em class="tag">${E(f.priority)}</em>${depsReady(f)?'':'<em class="tag">AGUARDA DEPENDÊNCIAS</em>'}</div>${it.route.length?`<div class="room-route">${it.route.map((id,i)=>`${i?icon('arrow'):''}<span class="room-pill">${roomFace(id,'sm')}${E(roomAgentName(id))}</span>`).join('')}</div>`:`<p class="plan-error">Sem rota: faltam ${E(it.missing.join(', ')||'especialistas')} na squad.</p>`}${briefs?`<details${m.status==='awaiting'?' open':''}><summary>Instruções do comandante</summary><ul class="room-briefs">${briefs}</ul></details>`:''}</div>`;}).join('');
 const foot=m.status==='awaiting'?`<div class="room-card-actions"><button class="btn ghost sm" data-action="room-cancel">${icon('close')}Cancelar</button><button class="btn primary sm" data-action="room-approve">${icon('play')}Executar plano</button></div>`:`<p class="room-card-state ${m.status}">${m.status==='approved'?'Plano aprovado. A squad está executando.':'Plano cancelado. Nenhuma feature foi alterada.'}</p>`;
 return`<div class="room-row plan" data-rid="${m.id}"><div class="room-card room-plan ${m.status}"><div class="room-card-head">${icon('flow')}<strong>PLANO DE EXECUÇÃO</strong><span>${E(m.label||'')}</span><em>${src}</em></div>${items}${foot}</div></div>`;
}
function roomFeedEl(){return ui.opsChat.open&&ui.opsChat.pid===project().id?$('#roomFeed'):null;}
function roomNear(el){return el.scrollHeight-el.scrollTop-el.clientHeight<140;}
function roomPush(msg,p=project()){
 const r=roomOf(p),m={id:'rm'+(++r.seq),at:nowISO(),...msg};r.messages.push(m);roomOwner.set(m,p.id);roomQueue(m,p.id);if(r.messages.length>ROOM_MAX)r.messages.splice(0,r.messages.length-ROOM_MAX);
 const feed=roomFeedEl();if(feed&&p===project()){const near=roomNear(feed);feed.querySelector('.room-empty')?.remove();feed.querySelector('.room-typing')?.remove();feed.insertAdjacentHTML('beforeend',roomMsgHTML(m)+roomTypingHTML(r));if(near)feed.scrollTop=feed.scrollHeight;}
 if(ui.opsChat.open&&ui.opsChat.min&&p===project()){ui.opsChat.unread++;opsChatMini();}
 officeFeed();return m;
}
const roomDirty=new Set();let roomFrame=0;
function roomUpdate(m){if(!m)return;roomQueue(m,roomOwner.get(m));officeFeed();roomDirty.add(m);if(roomFrame)return;roomFrame=requestAnimationFrame(()=>{roomFrame=0;const list=[...roomDirty],feed=roomFeedEl();roomDirty.clear();if(!feed)return;const near=roomNear(feed);for(const x of list){const el=feed.querySelector(`[data-rid="${x.id}"]`);if(el)el.outerHTML=roomMsgHTML(x);}if(near)feed.scrollTop=feed.scrollHeight;});}
function roomRemove(m){const r=roomOf(),i=r.messages.indexOf(m);if(i>=0)r.messages.splice(i,1);roomQueue(m,roomOwner.get(m)||project().id,true);roomFeedEl()?.querySelector(`[data-rid="${m.id}"]`)?.remove();officeFeed();}
function roomTypingHTML(r){const t=r.typing;return t?`<div class="room-row room-typing">${roomFace(t.agentId,'sm')}<span><b>${E(roomAgentName(t.agentId))}</b> ${E(t.label||'está digitando')}</span><i class="room-dots"><b></b><b></b><b></b></i></div>`:'';}
function roomTyping(agentId,label=''){const r=roomOf();r.typing=agentId?{agentId,label}:null;const feed=roomFeedEl();if(feed){const near=roomNear(feed);feed.querySelector('.room-typing')?.remove();feed.insertAdjacentHTML('beforeend',roomTypingHTML(r));if(near)feed.scrollTop=feed.scrollHeight;}roomChrome();}
// Already passed the baton in feature f (route index up to the current step, not the one holding it): room crew and office ✓.
function deliveredIn(f,id){if(!f||f.currentAgentId===id)return false;const i=f.route.indexOf(id);return i>=0&&i<=f.step;}
// What a squad member is doing in the current run (room crew column and office popups).
function crewStatus(a,p,f){if(a.id===p.commanderId&&runner&&['planning','awaiting'].includes(runner.phase))return['plan',runner.phase==='planning'?'montando o plano':'aguardando aprovação'];if(runner&&roomCalling.has(a.id))return['call','atendendo chamada'];if(f&&f.currentAgentId===a.id)return['baton','com o bastão'];if(f&&f.route.indexOf(a.id)>f.step)return['queue','na fila'];if(deliveredIn(f,a.id))return['done','entregou'];if(a.id===p.commanderId&&runner)return['plan','coordenando'];return['idle','livre'];}
function roomCrewHTML(p=project()){
 const team=p.agentIds.map(agentById).filter(Boolean).sort((a,b)=>(b.role==='commander')-(a.role==='commander')),f=activeFeature();
 return`<div class="room-crew-head">SQUAD / ${E(squadById(p.squadId)?.name||'')}</div>${team.map(a=>{const [k,label]=crewStatus(a,p,f);return`<div class="room-crew-row ${k}">${roomFace(a.id,'sm')}<strong>${E(a.name)}</strong><span>${E(roleLabel(a))}</span><em>${E(label)}</em></div>`;}).join('')}`;
}
function roomStatus(){
 if(!runner)return roomOf().messages.length?'SEM EXECUÇÃO EM ANDAMENTO':'NENHUMA EXECUÇÃO AINDA';if(runner.phase==='planning')return'COMANDANTE MONTANDO O PLANO';if(runner.phase==='awaiting')return'PLANO AGUARDA A SUA APROVAÇÃO';
 const f=activeFeature(),a=agentById(f?.currentAgentId);if(runner.paused)return runner.inFlight?'PAUSANDO APÓS A ETAPA':'PAUSADA';return f&&a?`${f.key} / ETAPA ${f.step+1} DE ${f.route.length} / ${a.name}`:'SELECIONANDO A PRÓXIMA FEATURE';
}
function roomControlsHTML(){const rc=runControl();return`${ui.consoles.length?`<button class="btn ghost sm" data-action="console">${icon('terminal')}Console</button>`:''}${rc?`<button class="btn sm${runner.phase==='awaiting'?' primary':''}" data-action="run" ${rc.busy?'disabled':''}>${icon(rc.icon)}${E(rc.label)}</button><button class="btn danger sm" data-action="stop">${icon('stop')}Encerrar</button>`:''}`;}
function roomChrome(){officeFeed();if(!ui.opsChat.open)return;if(ui.opsChat.min)opsChatMini();const close=$('#opsChatClose');if(close)close.hidden=!!runner;const st=$('#roomStatus');if(st){st.textContent=roomStatus();st.parentElement.classList.toggle('idle',!runner);}const crew=$('#roomCrew');if(crew)crew.innerHTML=roomCrewHTML();const ctl=$('#roomControls'),html=roomControlsHTML();if(ctl&&ctl.dataset.html!==html){ctl.innerHTML=html;ctl.dataset.html=html;}}
/* Office view of the run (MapNetwork.ops): a popup over each agent at work (who it is, what it is doing now) and the errands the
   office walks (the commander's briefing, the baton carried to the next desk, the delivery to the commander for review). Errands are
   room messages numbered by their seq, so the last delivery still plays after the run ends. Sent by render() and on room changes. */
let officeFrame=0,officeSig='';
function officeText(t,n=120){return roomClip(String(t||'').replace(/```[\s\S]*$/,'').replace(/[`*_#>|]/g,'').replace(/\s+/g,' ').trim(),n);}
function officeOps(){
 const p=project(),r=roomOf(p),f=activeFeature(),tag=liveMode()?'CLAUDE':'DEMO',from=runner?.roomSeq??-1,msgs=r.messages.slice(-60),seqOf=m=>+String(m.id).slice(2)||0,crew=[];
 const pop=(a,x)=>({id:a.id,name:a.name,role:roleLabel(a),img:portrait(a),say:speech(a.id),...x,ico:icon(x.icon||'radio')});
 const speech=id=>{const m=said(id,m=>!!String(m.text||'').trim());return m?officeText(m.text,160):'';};
 const said=(id,ok)=>{for(let i=msgs.length-1;i>=0;i--){const m=msgs[i];if(seqOf(m)<=from)break;if(m.kind==='say'&&!m.human&&m.agentId===id&&ok(m))return m;}return null;};
 const doing=(m,fb)=>{const act=m?.activity?.at(-1);return act?{icon:act.icon,doing:act.text}:fb;};
 const openCall=ok=>{for(let i=msgs.length-1;i>=0;i--){const m=msgs[i];if(seqOf(m)<=from)break;if(m.kind==='call'&&m.status==='open'&&ok(m))return m;}return null;};
 if(runner&&['planning','awaiting'].includes(runner.phase)){const c=agentById(p.commanderId),plan=runner.phase==='planning';
  if(c)crew.push(pop(c,{tone:plan?'plan':'wait',chip:plan?'PLANEJANDO':'AGUARDA APROVAÇÃO',...(plan?doing(said(c.id,m=>!m.featureKey),{icon:'flow',doing:`Montando o plano de ${runner.label}`}):{icon:'check',doing:'Plano pronto. Aprove no chat da operação.'}),foot:`${String(runner.label||'').toUpperCase()} · ${tag}`,hold:'war'}));}
 if(runner?.phase==='running'&&f){const a=agentById(f.currentAgentId);
  if(a){const call=openCall(m=>m.from===a.id),callee=call&&roomAgentName(call.to||'sub:'+(call.toLabel||'subagente')),waiting=call&&!runner.paused;
   crew.push(pop(a,{tone:runner.paused?'wait':waiting?'call':'work',chip:runner.paused?(runner.inFlight?'PAUSANDO APÓS A ETAPA':'PAUSADO'):waiting?`CHAMOU ${callee}`:'TRABALHANDO',...(waiting?{icon:'phone',doing:`Aguardando a resposta de ${callee}`}:doing(said(a.id,m=>m.featureKey===f.key&&!m.thread),{icon:'radio',doing:officeText(defaultBrief(a,f))})),foot:`${f.key} · ETAPA ${f.step+1}/${f.route.length} · ${tag}`}));
   for(const id of roomCalling){const b=agentById(id);if(!b||b.id===a.id)continue;const card=openCall(m=>m.to===id),caller=agentById(card?.from)||a;
    crew.push(pop(b,{tone:'call',chip:`ATENDENDO ${caller.name}`,...doing(card&&said(b.id,m=>m.thread===card.id),{icon:'phone',doing:officeText(card?.text||`Chamado por ${caller.name}`)}),foot:`${f.key} · CHAMADA · ${tag}`,hold:'call',peer:caller.id}));}}}
 const events=[];
 for(const m of msgs){const seq=seqOf(m);if(m.ops==='stop'){events.push({seq,stop:1});continue;}
  const mover=m.kind==='baton'?m.from:m.agentId,a=agentById(mover);if(!a)continue;let x=null;
  if(m.ops==='brief'&&m.to)x={peer:m.to,tone:'plan',chip:`BRIEFING → ${roomAgentName(m.to)}`,icon:'flow',doing:`Leva a ${m.featureKey} para ${roomAgentName(m.to)}`};
  else if(m.kind==='baton'&&m.to)x={peer:m.to,tone:'baton',chip:`PASSANDO O BASTÃO → ${roomAgentName(m.to)}`,icon:'arrow',doing:`Entrega a sua parte da ${m.featureKey}`};
  else if(m.kind==='baton'&&!m.spawn&&p.commanderId&&p.commanderId!==m.from&&agentById(p.commanderId))x={peer:p.commanderId,tone:'done',chip:'ENTREGA P/ REVISÃO',icon:'check',doing:`${m.featureKey} fechou a rota e vai para a sua revisão`};
  if(x)events.push({seq,mover,peer:x.peer,pop:pop(a,{...x,peer:undefined,foot:`${m.featureKey} · ${m.simulated===false?'CLAUDE':'DEMO'}`})});}
 return{room:p.id,seq:r.seq,run:runner?{phase:runner.phase,paused:!!runner.paused}:null,crew,events};
}
function officeSigOf(d){return JSON.stringify(d,(k,v)=>k==='img'||k==='ico'?undefined:v);}
function officeMark(d){officeSig=officeSigOf(d);return d;}
function officeSend(){cancelAnimationFrame(officeFrame);officeFrame=0;const d=officeOps(),sig=officeSigOf(d);if(sig===officeSig)return;officeSig=sig;MapNetwork.ops?.(d);}
function officeFeed(){if(!officeFrame)officeFrame=requestAnimationFrame(officeSend);}
// Somebody is watching the map ('office' | 'city', motion on): the demo spaces its beats (and waits for the office's walks).
function officeLive(){return MapNetwork.officeOps?.live()||'';}
function officeSettled(){officeSend();return MapNetwork.officeOps?.settled()??true;}
/* Operation chat: replaces the room modal. Opening it (every run start, the room action, the War Room) takes the person to the Squad
   map in the isometric office; the panel takes the left HUD's place (#workspace.ops-chat-on hides the roster and the agent/briefing
   buttons) and keeps the room's DOM ids, so roomPush/roomUpdate/roomTyping/roomChrome feed it as they fed the modal. It can be
   minimized (a bar with the last message and the unread count; the office popups carry the run) and closed only with no run. */
function opsChatOn(){return ui.opsChat.open&&ui.view==='network';}
function openOpsChat(){
 if(state.settings.squadView!=='office'){state.settings.squadView='office';save();}
 ui.opsChat={open:true,min:false,unread:0,pid:''};
 if(ui.view!=='network')goView('network');else render();
}
function opsChatBuild(p=project()){
 const el=$('#opsChat'),r=roomOf(p),live=liveMode(),c=agentById(p.commanderId);ui.opsChat.pid=p.id;
 el.innerHTML=`<header class="oc-head">${c?`<img class="oc-avatar" src="${portrait(c)}" alt="">`:`<span class="oc-avatar none">${icon('squad')}</span>`}<div class="oc-title"><strong>${E(p.code)} · ${E(p.name)}</strong><span class="room-status${runner?'':' idle'}"><i></i><span id="roomStatus">${E(roomStatus())}</span></span></div>${live?'':'<em class="tag">DEMO</em>'}<button class="icon-button oc-min" data-action="ops-chat-min" aria-label="Minimizar o chat" title="Minimizar"><span></span></button><button class="icon-button" id="opsChatClose" data-action="ops-chat-close" aria-label="Fechar o chat" title="Fechar"${runner?' hidden':''}>${icon('close')}</button></header><div class="room-crew" id="roomCrew" aria-label="Squad">${roomCrewHTML(p)}</div><div class="room-feed" id="roomFeed" aria-live="polite">${r.messages.map(roomMsgHTML).join('')||'<p class="room-empty">Quando você executar uma sprint ou uma feature, o comandante monta o plano aqui e a squad conversa enquanto trabalha.</p>'}${roomTypingHTML(r)}</div><footer class="oc-foot"><div class="flex wrap" id="roomControls">${roomControlsHTML()}</div><span class="oc-dir">${live?`EXECUÇÃO REAL / ${E(projectDirLabel(p))}`:'SIMULAÇÃO LOCAL / NENHUMA IA EXECUTADA'}</span></footer><button class="oc-mini" id="opsChatMini" data-action="ops-chat-restore" aria-label="Abrir o chat da operação"></button><div class="oc-split" id="ocSplit" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Redimensionar o chat" title="Arraste para redimensionar. Duplo clique volta ao padrão."></div>`;
 opsChatMini();opsChatScroll();
}
function opsChatScroll(){requestAnimationFrame(()=>{const feed=$('#roomFeed');if(feed)feed.scrollTop=feed.scrollHeight;});}
const OPS_CHAT_KIND={plan:'Plano do comandante',call:'Chamada entre colegas',baton:'Passagem de bastão',review:'Entrega para revisão'};
function opsChatMini(){
 const el=$('#opsChatMini');if(!el)return;const r=roomOf(),m=r.messages.at(-1),who=m?.human?'Você':m?.kind==='say'||m?.kind==='plan'?roomAgentName(m.agentId||project().commanderId):'',n=ui.opsChat.unread;
 const text=m?officeText(m.kind==='say'||m.kind==='system'?m.text:OPS_CHAT_KIND[m.kind]||m.text,90):'Nenhuma mensagem ainda';
 el.innerHTML=`<span class="oc-mini-dot${runner?' live':''}"></span><span class="oc-mini-text"><strong>${E(project().code)} · CHAT DA OPERAÇÃO</strong><small>${who?`<b>${E(who)}:</b> `:''}${E(text)}</small></span>${n?`<em class="oc-unread">${n>99?'99+':n}</em>`:''}`;
}
function opsChatMin(min){ui.opsChat.min=min;if(!min)ui.opsChat.unread=0;renderOpsChat();if(!min){opsChatScroll();$('#roomFeed')?.focus?.({preventScroll:true});}}
function opsChatClose(){if(runner)return opsChatMin(true);ui.opsChat.open=false;render();}
function renderOpsChat(){
 const el=$('#opsChat');if(!el)return;const on=opsChatOn(),ws=$('#workspace'),dock=opsChatDockW();ws.classList.toggle('ops-chat-on',on);el.hidden=!on;
 ws.classList.toggle('ops-chat-dock',!!dock);ws.style.setProperty('--oc-w',opsChatWidth()+'px');MapNetwork.setInset?.(dock);if(!on)return;
 if(ui.opsChat.pid!==project().id||!el.firstChild)opsChatBuild();
 el.classList.toggle('min',ui.opsChat.min);if(ui.opsChat.min)opsChatMini();opsChatSplitAria();
}
/* Docked on the left edge, from under the top bar to the bottom (#workspace --oc-w, .ops-chat-dock moves the bottom strip aside and
   MapNetwork.setInset centres the map in the free area). Width: drag the right edge (#ocSplit, pointer capture), ←/→ by 24 px,
   Home/End go to the limits, double click goes back to the default. Kept in the workspace (state.settings.opsChat, 0 = default). */
const OPS_CHAT_W=380;
// At most half the window (720 px), leaving the top bar room for its tabs and status (measured once per window width).
let opsChatRoom=null;
function opsChatLimits(){if(!opsChatRoom||opsChatRoom.w!==innerWidth){const nav=$('.topbar .mode-nav')?.offsetWidth||460,meta=$('.topbar .system-meta')?.offsetWidth||260;opsChatRoom={w:innerWidth,hi:Math.max(300,Math.round(Math.min(720,innerWidth*.5,innerWidth-nav-meta-90)))};}return[300,opsChatRoom.hi];}
function opsChatWidth(px=state.settings.opsChat){const [lo,hi]=opsChatLimits();return Math.round(Math.min(hi,Math.max(lo,px||OPS_CHAT_W)));}
function opsChatDockW(){return opsChatOn()&&!ui.opsChat.min&&innerWidth>900?opsChatWidth():0;}
function opsChatSplitAria(w=opsChatWidth()){const split=$('#ocSplit');if(!split)return;const [lo,hi]=opsChatLimits();split.setAttribute('aria-valuemin',lo);split.setAttribute('aria-valuemax',hi);split.setAttribute('aria-valuenow',w);}
function opsChatSideSet(px,persist){
 const w=opsChatWidth(px);$('#workspace').style.setProperty('--oc-w',w+'px');MapNetwork.setInset?.(opsChatDockW()?w:0);opsChatSplitAria(w);
 if(persist){const v=px?w:0;if(state.settings.opsChat!==v){state.settings.opsChat=v;save();}}
}
function opsChatSplitDrag(event){
 const split=event.target.closest?.('#ocSplit');if(!split||event.button>0)return;event.preventDefault();split.focus();split.setPointerCapture?.(event.pointerId);document.body.classList.add('oc-resizing');
 opsChatRoom=null;const left=$('#workspace').getBoundingClientRect().left;let px=0;const move=e=>{px=e.clientX-left;opsChatSideSet(px);};
 const up=()=>{split.removeEventListener('pointermove',move);split.removeEventListener('pointerup',up);split.removeEventListener('pointercancel',up);document.body.classList.remove('oc-resizing');if(px)opsChatSideSet(px,true);};
 split.addEventListener('pointermove',move);split.addEventListener('pointerup',up);split.addEventListener('pointercancel',up);
}
function opsChatSplitKey(event){const [lo,hi]=opsChatLimits(),cur=opsChatWidth(),px={ArrowLeft:cur-24,ArrowRight:cur+24,Home:lo,End:hi}[event.key];if(px==null)return;event.preventDefault();opsChatSideSet(px,true);}
// A step opens with the agent saying what it takes on (the commander's instruction when there is one).
function roomStepStart(f,prevId){
 const a=agentById(f.currentAgentId);if(!a)return;const prev=agentById(prevId),brief=f.briefs?.length===f.route.length?f.briefs[f.step]:'',part=brief||defaultBrief(a,f);
 const pf=liveMode()&&profilesOn()?agentProfile(a):null;roomPush({kind:'say',agentId:a.id,featureKey:f.key,text:`${prev?`Peguei a ${f.key} com ${prev.name}.`:`Começando a ${f.key}.`} Minha parte: ${part.charAt(0).toLowerCase()+part.slice(1)}`,...(pf?{profile:{name:pf.name,adapter:pf.adapter}}:{})});
 roomTyping(a.id,'está trabalhando');
}
// A demo step is a list of beats (first action, a call to a colleague and its answer, the other actions, the summary). Nobody watching
// the map: simulationStep plays them all in one tick; watched: one per scheduleStep, so the office walks and the city shows each of them.
function simBeats(f,a){
 const fam=roleFamilyOf(a),[say,acts]=SIM_WORK[fam]||SIM_WORK.default,k=slugOf(`${f.key} ${f.title}`).slice(0,40),chips=acts.map(([ic,t])=>({kind:'act',icon:ic,text:t.replace('{k}',k)}));
 const p=project(),adr=agentById(squadById(p.squadId)?.adrId),prev=agentById(f.route[f.step-1]),to=['po','architect','qa','commander'].includes(fam)?null:adr&&adr.id!==a.id&&p.agentIds.includes(adr.id)?adr:prev;
 const beats=chips.slice(0,1);if(to&&to.id!==a.id)beats.push({kind:'call',to:to.id},{kind:'answer'});beats.push(...chips.slice(1),{kind:'done',text:say});
 return{fid:f.id,aid:a.id,step:f.step,fam,i:0,beats,msg:null,card:null};
}
function simBeat(s,b){
 const f=featureById(s.fid),a=agentById(s.aid);if(!f||!a||!b)return;
 if(b.kind==='act'){if(!s.msg)s.msg=roomPush({kind:'say',agentId:a.id,featureKey:f.key,text:'',activity:[]});s.msg.activity.push({icon:b.icon,text:b.text});roomUpdate(s.msg);}
 else if(b.kind==='call'){s.card=roomPush({kind:'call',from:a.id,to:b.to,featureKey:f.key,status:'open',text:(SIM_CALL[s.fam]||SIM_CALL.default).replace('{f}',f.key)});roomCalling.add(b.to);roomChrome();}
 else if(b.kind==='answer'){const c=s.card;if(!c||c.status!=='open')return;c.status='answered';c.answer=agentById(c.to)?.role==='architect'?'Segue o que ficou decidido: contrato REST, validação no servidor e erros no formato padrão. Pode seguir.':'Confirmado. Mantém o que ficou no handoff e segue.';roomCalling.delete(c.to);roomUpdate(c);roomChrome();}
 else if(b.kind==='done'){if(s.msg){s.msg.text=b.text;roomUpdate(s.msg);}else s.msg=roomPush({kind:'say',agentId:a.id,featureKey:f.key,text:b.text});}
}
// Live stream -> room: text becomes bubbles, tools become activity chips, the Agent tool becomes a call card whose subagent talks in a thread.
function roomCtx(a,f,keys){return{agentId:a.id,key:f.key,keys:keys||{},calls:new Map(),cards:new Map(),last:{},lastMain:null};}
function toolActivity(b){const i=b.input||{},hint=String(i.file_path||i.notebook_path||i.path||i.command||i.pattern||i.url||i.query||i.description||'').replace(/\s+/g,' ').trim().slice(0,160),file=['Read','Edit','MultiEdit','Write','NotebookEdit'].includes(b.name);
 const [ic,verb]={Read:['file','Leu'],Edit:['edit','Editou'],MultiEdit:['edit','Editou'],Write:['edit','Criou'],NotebookEdit:['edit','Editou'],Bash:['terminal','Rodou'],Glob:['search','Buscou arquivos'],Grep:['search','Buscou'],WebFetch:['globe','Abriu'],WebSearch:['globe','Pesquisou'],TodoWrite:['check','Atualizou a lista de tarefas']}[b.name]||['cog',b.name];
 return{icon:ic,text:`${verb}${hint&&b.name!=='TodoWrite'?' '+(file?hint.replace(/^.*[\\/](?=[^\\/]+$)/,''):hint):''}`};}
function toolResultText(c){return typeof c==='string'?c:Array.isArray(c)?c.map(x=>typeof x==='string'?x:x?.text||'').join('\n').trim():'';}
// A foreground subagent's result is framed by Claude Code ("[Subagent hand-back] ... The report follows:", every report line indented, then agentId/usage): keep the report.
function subagentReport(t){t=String(t||'');if(!/^\[Subagent hand-back\]/.test(t))return t.trim();const out=[];for(const l of t.slice(t.indexOf('\n')+1).split('\n')){if(l&&!l.startsWith('  '))break;out.push(l.slice(2));}return out.join('\n').trim();}
function roomEvent(ctx,evt){
 if(evt.type==='bridge'&&evt.subtype==='profile'){ctx.profile={name:evt.name,adapter:evt.adapter};if(evt.fallbackFrom)roomPush({kind:'system',tone:'warn',text:`A Janela de uso do Perfil ${profileById(evt.fallbackFrom)?.name||evt.fallbackFrom} passou do limiar: ${roomAgentName(ctx.agentId)} segue no Perfil reserva ${evt.name||''}.`});return;}
 if(evt.type==='assistant'){
  const parent=evt.parent_tool_use_id||null,who=parent?ctx.calls.get(parent):ctx.agentId,thread=parent?ctx.cards.get(parent)?.id:undefined;if(!who)return;
  for(const b of evt.message?.content||[]){
   if(b.type==='text'&&b.text.trim()){const raw=b.text.trim();const m=roomPush({kind:'say',agentId:who,featureKey:ctx.key,thread,text:roomClip(raw,1600),raw:raw.slice(0,400)});ctx.last[who]=m;if(!parent)ctx.lastMain=m;}
   else if(b.type==='tool_use'&&b.name==='Agent'&&!parent){const type=String(b.input?.subagent_type||'subagente'),target=ctx.keys[type]||null,id=target||'sub:'+type;ctx.calls.set(b.id,id);if(target)roomCalling.add(target);
    ctx.cards.set(b.id,roomPush({kind:'call',from:ctx.agentId,to:target,toLabel:target?'':type,featureKey:ctx.key,text:String(b.input?.prompt||b.input?.description||''),status:'open'}));ctx.lastMain=null;roomChrome();}
   else if(b.type==='tool_use'){let m=ctx.last[who];if(!m){m=roomPush({kind:'say',agentId:who,featureKey:ctx.key,thread,text:'',activity:[]});ctx.last[who]=m;}(m.activity??=[]).push({...toolActivity(b),toolId:b.id});roomUpdate(m);if(!parent)ctx.lastMain=null;}
  }
 }else if(evt.type==='user'){
  for(const b of evt.message?.content||[]){if(b.type!=='tool_result')continue;const card=ctx.cards.get(b.tool_use_id);
   if(card){const answer=subagentReport(toolResultText(b.content)),async=/^Async agent launched/i.test(answer),who=ctx.calls.get(b.tool_use_id),last=ctx.last[who];card.status=b.is_error?'error':async?'async':'answered';card.answer=async?'':answer;
    // The colleague's last line in the thread is usually the report itself: the card shows it once.
    if(last?.thread===card.id&&last.raw&&!last.activity?.length&&answer.startsWith(last.raw.slice(0,300)))roomRemove(last);roomCalling.delete(who);ctx.last[who]=null;roomUpdate(card);roomChrome();}
   else if(b.is_error){const m=Object.values(ctx.last).find(x=>x?.activity?.some(y=>y.toolId===b.tool_use_id)),act=m?.activity.find(y=>y.toolId===b.tool_use_id);if(act){act.error=true;roomUpdate(m);}}}
 }
}
// Colleagues the agent may call (Claude Code subagents, --agents): each keeps its own instructions, tools, model and effort, never beyond the caller's session.
function squadSubagents(a,p=project(),r=runtime()){
 const defs={},keys={},callerAd=agentAdapter(a,r);
 for(const m of p.agentIds.map(agentById).filter(Boolean)){if(m.id===a.id)continue;const base=(agentSlug(m).slice(0,40).replace(/-+$/,'')||'agente');let key=base,n=2;while(keys[key])key=`${base}-${n++}`;
  const o=runOptionsFor(m,r,p),def={description:`${m.name}, ${roleLabel(m)} da squad. ${String(m.description||'').replace(/\s+/g,' ').trim()}`.slice(0,760)+` Chame ${m.name} para uma decisão, uma revisão ou uma parte que é da especialidade dele.`,prompt:(agentSystemPrompt(m)+'\n\n'+CALLED_AGENT_SYSTEM).slice(0,58000)};
  if(o.tools)def.tools=o.tools;if(o.model&&(callerAd==='codex'||modelFits(o.model,'claude')))def.model=o.model;if(o.effort)def.effort=o.effort;if(o.profile)def.profile=o.profile;def.agentId=m.id;defs[key]=def;keys[key]=m.id;}
 return{defs,keys};
}
function stepRunOptions(a,p=project(),r=runtime()){
 const o=runOptionsFor(a,r,p),{defs,keys}=squadSubagents(a,p,r);if(!Object.keys(defs).length)return{options:o,keys};
 return{options:{...o,agents:defs,forwardSubagents:true,tools:o.tools?[...o.tools,'Agent']:undefined,allowedTools:[...new Set([...o.allowedTools,'Agent'])]},keys};
}
/* The commander plans the scope before anything runs: routes and one instruction per agent, approved by the person in the room. */
function commanderPlanPrompt(p,owner,suggest){
 const clip=(t,n)=>{t=String(t||'').trim();return t.length>n?t.slice(0,n)+' [...]':t;},sp=sprintById(owner.sprintId,p);
 return[`# Operação ${p.code}: ${p.name}`,`## Briefing\n${clip(p.briefing,4000)}`,
  `## O que vai ser executado\n${owner.kind==='feature'?`Só a feature ${suggest[0].f.key}.`:`${sp?.name||'Sprint'}${sp?.goal?`: ${sp.goal}`:''}`}`,
  `## Squad (codinome / papel / descrição)\n${squad().filter(a=>a.role!=='commander').map(a=>`- ${a.name} / ${roleLabel(a)} / ${clip(a.description,220)}`).join('\n')}`,
  `## Features para planejar\n${suggest.map(({f,route,missing})=>[`### ${f.key}: ${f.title}`,`Prioridade ${f.priority} / Área: ${SCOPES[f.scope]||f.scope} / Status: ${STATUS[f.status]}${f.dependencies.length?` / Dependências: ${f.dependencies.map(id=>p.features.find(x=>x.id===id)).filter(Boolean).map(d=>`${d.key} (${STATUS[d.status]})`).join(', ')}`:''}`,f.description?`Escopo: ${clip(f.description,900)}`:'',`Critérios: ${clip(f.criteria,700)}`,f.context?`Contexto de handoff: ${clip(f.context,600)}`:'',`Rota sugerida: ${route.length?route.map(id=>agentById(id)?.name).join(' > '):'nenhuma'}${missing.length?` (faltam na squad: ${missing.join(', ')})`:''}`].filter(Boolean).join('\n')).join('\n\n')}`,
  'Monte o plano de execução.'].join('\n\n');
}
function validatePlan(data,suggest){
 const items=Array.isArray(data?.plan)?data.plan:null;if(!items)return null;
 const team=squad().filter(a=>a.role!=='commander'),who=n=>{const v=String(n||'').trim();return team.find(a=>a.name.toUpperCase()===v.toUpperCase()||agentSlug(a)===v.toLowerCase());};let used=0;
 const plan=suggest.map(({f,route,missing})=>{const it=items.find(x=>String(x?.feature||'').trim().toUpperCase()===f.key.toUpperCase()),ids=[...new Set((Array.isArray(it?.route)?it.route:[]).map(who).filter(Boolean).map(a=>a.id))].slice(0,12);
  if(!ids.length)return{featureId:f.id,route:missing.length?[]:route,briefs:missing.length?[]:route.map(id=>defaultBrief(agentById(id),f)),missing:missing.length?missing:[]};
  used++;const b=it.briefs,briefs=ids.map((id,i)=>{const a=agentById(id),v=Array.isArray(b)?b[i]:b&&typeof b==='object'?(b[a.name]??b[a.name.toLowerCase()]??b[agentSlug(a)]):'';return String(v||'').trim().slice(0,2000)||defaultBrief(a,f);});
  return{featureId:f.id,route:ids,briefs,missing:[]};});
 return used?plan:null;
}
async function commanderPlanRun(owner,cmd,p,suggest){
 let started;try{started=await bridgeFetch('/api/runs',{method:'POST',body:JSON.stringify({prompt:commanderPlanPrompt(p,owner,suggest),systemPrompt:agentSystemPrompt(cmd)+'\n\n'+[soulBlock(cmd),COMMANDER_PLAN_SYSTEM].filter(Boolean).join('\n\n'),label:`${cmd.name} / plano de ${owner.label}`,meta:runMeta(p,cmd,null,'plan'),options:{...runOptionsFor(cmd,runtime(),p),...CHAT_RUN,timeoutSec:300}})});}
 catch(error){return{error:error.message};}
 if(runner!==owner){bridgeFetch(`/api/runs/${started.runId}/cancel`,{method:'POST'}).catch(()=>{});return{cancelled:true};}
 owner.planRunId=started.runId;const c=newConsole({runId:started.runId,agentId:cmd.id,featureId:null});let text='',bubble=null;
 try{
  const exit=await streamRun(started.runId,evt=>{handleRunEvent(c,evt);const d=evt.type==='stream_event'&&evt.event?.delta?.type==='text_delta'?evt.event.delta.text:'';if(!d||runner!==owner)return;text+=d;const shown=chatClean(text.split('```')[0]);if(!shown)return;
   if(!bubble){roomTyping(null);bubble=roomPush({kind:'say',agentId:cmd.id,text:shown,live:true});roomTyping(cmd.id,'está montando o plano');}else{bubble.text=shown;roomUpdate(bubble);}});
  return exit.isError||exit.error?{error:exit.error||'falha na execução',bubble}:{text:exit.result||text,bubble,costUsd:exit.costUsd};
 }catch(error){return{error:error.message,bubble};}
 finally{if(owner.planRunId===started.runId)owner.planRunId=null;}
}
async function planWithCommander(owner,pending){
 const p=project(),cmd=agentById(p.commanderId),live=liveMode(),suggest=pending.map(f=>({f,...routeFor(f)}));
 roomTyping(cmd?.id||null,'está montando o plano');render();
 let plan=null,message='',source=live?'commander':'demo',note='',bubble=null;
 if(live&&cmd){
  const res=await commanderPlanRun(owner,cmd,p,suggest);if(runner!==owner||res.cancelled)return;bubble=res.bubble;
  if(res.error)note=`O comandante não conseguiu planejar (${res.error.slice(0,220)}). Usei a distribuição padrão da squad.`;
  else{
   // The plan comes in the reply's ```json block; a bare {"plan": ...} object (no fence) is accepted too.
   const raw=String(res.text||'');owner.planRaw=raw.slice(0,20000);const parsed=parseCoWrite(raw),bare=raw.lastIndexOf('{"plan"');let data=parsed.data,reply=parsed.reply;
   if(!Array.isArray(data?.plan)&&bare>=0){data=lenientJSON(raw.slice(bare).replace(/```[\s\S]*$/,''));reply=raw.slice(0,bare);}
   message=chatClean(reply);plan=validatePlan(data,suggest);if(!plan)note='O comandante não devolveu um plano válido. Usei a distribuição padrão da squad.';
  }
 }else{await feWait(Math.min(state.settings.stepMs,1800));if(runner!==owner)return;}
 if(!plan){plan=suggest.map(({f,route,missing})=>({featureId:f.id,route:missing.length?[]:route,briefs:missing.length?[]:route.map(id=>defaultBrief(agentById(id),f)),missing}));if(live)source='default';}
 const routed=plan.filter(x=>x.route.length),first=routed.map(x=>featureById(x.featureId)).filter(f=>depsReady(f)).sort((a,b)=>a.priority.localeCompare(b.priority))[0],firstIt=first&&plan.find(x=>x.featureId===first.id);
 if(!message&&!live)message=`Plano pronto para ${owner.label}: ${routed.length} de ${plan.length} feature${plan.length>1?'s':''} com rota${first?`, começando pela ${first.key} com ${agentById(firstIt.route[0])?.name}`:''}. Confere as instruções e aprova que eu solto a squad.`;
 roomTyping(null);
 if(bubble){if(message)bubble.text=message;bubble.live=false;roomUpdate(bubble);}else if(message&&cmd)roomPush({kind:'say',agentId:cmd.id,text:message});
 if(note)roomPush({kind:'system',text:note,tone:'warn'});
 if(!routed.length){roomPush({kind:'system',text:'Nenhuma feature tem especialistas na squad para montar uma rota. Complete a squad no Squad Studio.',tone:'error'});runner=null;save();render();return;}
 owner.plan=plan;owner.phase='awaiting';owner.planMsgId=roomPush({kind:'plan',items:plan,status:'awaiting',source,label:owner.label}).id;
 log(`${cmd?.name||'COMANDANTE'} montou o plano de ${owner.label}: ${routed.length} de ${plan.length} features com rota. Aguardando aprovação.`,'plan',cmd?.id||null,p);if(live&&source==='commander')p.logs.at(-1).simulated=false;
 save();render();if(!opsChatOn()||ui.opsChat.min)toast('O comandante montou o plano. Aprove no chat da operação.');
}
function beginPlan(r,what,pending){
 beginRun({...r,phase:'planning'},what);
 roomPush({kind:'system',text:`${what}. ${pending.length} feature${pending.length>1?'s':''} para o comandante planejar: ${pending.map(f=>f.key).join(', ')}.`});
 openOpsChat();planWithCommander(runner,pending);
}
function roomApprove(){
 const r=runner;if(!r||r.phase!=='awaiting'||!r.plan)return;const p=project();
 roomPush({kind:'say',human:true,text:'Aprovado. Podem executar.'});
 let count=0;for(const it of r.plan){const f=featureById(it.featureId);if(!f||!it.route.length||['done','review','running'].includes(f.status))continue;f.route=[...it.route];f.briefs=[...it.briefs];f.step=0;f.currentAgentId=null;f.status=depsReady(f)?'ready':'blocked';count++;}
 const card=roomOf(p).messages.find(m=>m.id===r.planMsgId);if(card){card.status='approved';roomUpdate(card);}
 log(`Plano aprovado pelo operador: ${count} feature${count===1?'':'s'} com rota.`,'plan',p.commanderId);
 r.phase='running';save();render();launchNext(r.single?r.onlyId:null);
}
window.addEventListener('beforeunload',event=>{if(runner&&liveMode()){event.preventDefault();event.returnValue='';}});

/* Sequential simulator. Human review is a separate state transition. */
// In the demo, while the office is watched, the next beat also waits (at most 9 s more) until nobody is still walking to an errand.
function scheduleStep(callback,ms=state.settings.stepMs){clearTimeout(timer);const t0=Date.now(),go=()=>{if(!runner||runner.paused||runner.phase!=='running')return;if(!liveMode()&&Date.now()-t0<ms+9000&&!officeSettled()){timer=setTimeout(go,200);return;}callback();};timer=setTimeout(go,ms);}
// Runs are scoped: a whole sprint (default: the current sprint) or a single feature with its full route.
// Every run starts with the commander planning it in the operation room; nothing executes before the person approves the plan.
function startRun(scope=null){
 if(runner){
  if(runner.phase==='awaiting')return roomApprove();if(runner.phase==='planning'){if(!opsChatOn()||ui.opsChat.min)openOpsChat();return toast('O comandante ainda está montando o plano.');}
  runner.paused=!runner.paused;clearTimeout(timer);log(runner.paused?'Simulação pausada pelo operador.':'Simulação retomada.','system');roomPush({kind:'system',text:runner.paused?(runner.inFlight?'Pausa pedida: o agente termina a etapa em andamento e a squad para.':'Execução pausada pelo operador.'):'Execução retomada.'});if(!runner.paused&&!runner.runId&&!runner.inFlight)scheduleStep(runner.featureId?simulationStep:launchNext);if(runner.paused&&runner.inFlight)toast('O agente atual termina a etapa em andamento antes de pausar.');save();render();if(ui.modal==='features')openFeatures();return;
 }
 if(!runGate())return;refreshBlocked();const p=project();if(scope?.featureId)return startFeatureRun(featureById(scope.featureId));
 const s=sprintById(scope?.sprintId,p)||currentSprint(p);if(!s)return toast('Crie uma sprint antes de executar.','error');
 const fs=sprintFeatures(s,p);if(!fs.length)return toast(`${s.name} não tem features. Crie ou arraste features para ela.`,'error');if(fs.every(f=>f.status==='done'))return toast(`${s.name} já está concluída. Todas as entregas foram aprovadas.`);
 const pending=fs.filter(f=>['backlog','ready','blocked'].includes(f.status)),review=fs.filter(f=>f.status==='review');
 if(!pending.some(f=>depsReady(f)))return toast(pending.length?`${s.name}: ${blockedWhy(pending[0],p)}`:review.length?`${s.name}: ${review.map(f=>f.key).join(', ')} aguarda${review.length>1?'m':''} sua revisão.`:`${s.name}: nenhuma feature pendente.`,'error');
 beginPlan({featureId:null,paused:false,single:false,sprintId:s.id,kind:'sprint',label:s.name},`${s.name} iniciada`,pending);
}
function startFeatureRun(f){
 if(!f)return;if(f.status==='done')return toast(`${f.key} já foi concluída.`);if(f.status==='review')return openReview(f.id);if(!depsReady(f))return toast(blockedWhy(f),'error');
 beginPlan({featureId:null,paused:false,single:true,sprintId:sprintOf(f)?.id||'',kind:'feature',label:f.key,onlyId:f.id},`${f.key} iniciada individualmente`,[f]);
}
function beginRun(r,what){runner=r;r.roomSeq=roomOf().seq;if(liveMode()){log(`${what} com Claude Code ${ui.bridge.version} (claude -p).`,'system');project().logs.at(-1).simulated=false;}else log(`${what} em modo demonstracao. Nenhum processo Claude foi criado.`,'system');closeModal();}
function pendingDeps(f,p=project()){return f.dependencies.map(id=>p.features.find(x=>x.id===id)).filter(d=>d&&d.status!=='done');}
function blockedWhy(f,p=project()){const deps=pendingDeps(f,p);return deps.length?`${f.key} aguarda ${deps.map(d=>`${d.key} (${sprintOf(d,p)?.name||'sem sprint'})`).join(', ')}.`:`${f.key} está bloqueada.`;}
function launchNext(preferredId=null){
 if(!runner||runner.paused||runner.phase!=='running')return;refreshBlocked();const p=project(),cmdId=p.commanderId;
 const f=preferredId?featureById(preferredId):p.features.filter(f=>f.status==='ready'&&f.route.length&&depsReady(f)&&(!runner.sprintId||sprintOf(f)?.id===runner.sprintId)).sort((a,b)=>a.priority.localeCompare(b.priority))[0];
 if(!f||!f.route.length||!depsReady(f)||f.status!=='ready'){
  const s=runner.kind==='sprint'?sprintById(runner.sprintId):null,tag=s?`${s.name}: `:'',scopeFs=s?sprintFeatures(s):[f].filter(Boolean),inReview=scopeFs.filter(x=>x.status==='review'),left=scopeFs.filter(x=>['backlog','ready','blocked'].includes(x.status));runner=null;clearTimeout(timer);const review=inReview.length;
  roomTyping(null);roomPush({kind:'say',agentId:cmdId,text:`${s?`${s.name} fechou esta rodada.`:'Fim da execução.'}${review?` ${inReview.map(x=>x.key).join(', ')} ${review>1?'aguardam':'aguarda'} a sua revisão.`:''}${left.length?` Ficam para depois: ${left.map(x=>`${x.key} (${STATUS[x.status].toLowerCase()})`).join(', ')}.`:''}${!review&&!left.length?' Nada pendente por aqui.':''}`});
  log(s?tag+(review?'execução aguardando revisão humana.':'nenhuma feature pronta para executar.'):review?'Execução simulada aguardando revisão humana.':'Nenhuma feature pronta para simular.','system');save();render();refreshFeatureModal();toast(s?tag+(review?'entregas aguardam sua revisão.':'fila da sprint encerrada.'):review?'Entregas aguardam sua revisão na tela de Features.':'Fila da simulação encerrada.');return;
 }
 if(!f.route.every(id=>p.agentIds.includes(id)&&agentById(id))){f.route=[];f.briefs=[];f.status='backlog';runner=null;roomTyping(null);roomPush({kind:'system',text:`A rota da ${f.key} tem um agente que saiu da squad. Redistribua a feature.`,tone:'error'});save();render();return toast('A rota contem um agente indisponível. Redistribua a feature.','error');}
 f.status='running';f.step=0;f.currentAgentId=f.route[0];f.runStart=f.outputs.length;runner.featureId=f.id;
 log(`${agentById(cmdId)?.name||'COMANDANTE'} atribuiu ${f.key} a ${agentById(f.currentAgentId).name}.`,'plan',cmdId);log(`${f.key}: briefing e contexto recebidos. Etapa 1/${f.route.length}.`,'agent',f.currentAgentId);
 if(runner.kind!=='spawn')roomPush({kind:'say',agentId:cmdId,featureKey:f.key,ops:'brief',to:f.route[0],text:`${agentById(f.route[0]).name}, a ${f.key} (${f.title}) começa com você. Rota: ${f.route.map(id=>agentById(id)?.name).join(' > ')}.`});
 roomStepStart(f,null);save();render();refreshFeatureModal();scheduleStep(simulationStep);
}
function simulationStep(){
 if(!runner||runner.paused||runner.phase!=='running')return;const f=activeFeature();if(!f){launchNext();return;}const a=agentById(f.currentAgentId);if(!a){stopRun();return;}
 if(liveMode())return liveStep(f,a);
 let s=runner.sim;if(!s||s.fid!==f.id||s.aid!==a.id||s.step!==f.step)s=runner.sim=simBeats(f,a);
 while(s.i<s.beats.length-1){simBeat(s,s.beats[s.i++]);const w=officeLive();if(w)return scheduleStep(simulationStep,w==='office'?Math.max(400,state.settings.stepMs*.6):Math.max(350,state.settings.stepMs*.4));}
 runner.sim=null;
 const texts={po:'Escopo e critérios organizados para o handoff de requisitos.',architect:'Contratos e fronteiras de componentes organizados para orientar a implementação.',backend:'Plano de API, validações e persistência preparado.',frontend:'Estados de interface e pontos de integracao organizados.',qa:'Checklist de verificação preparado para revisão humana.',commander:'Briefing decomposto em responsabilidades para o squad.'};
 const text=`[SIMULAÇÃO / SEM CÓDIGO EXECUTADO]\n${texts[roleFamilyOf(a)]||texts[a.role]||'Parte da especialidade organizada para o próximo agente.'}\n\nFeature: ${f.title}\nCriterios: ${f.criteria}\n\nEste e um registro ilustrativo. Nenhum arquivo foi escrito, teste executado ou resultado real verificado.`;
 f.outputs.push({agentId:a.id,at:nowISO(),text,simulated:true,error:false,costUsd:null,durationMs:null,sessionId:null});if(f.outputs.length>300)f.outputs.shift();
 roomTyping(null);simBeat(s,s.beats[s.i]);
 advanceRoute(f,a,text,false);
}
function advanceRoute(f,a,text,real){
 const p=project(),mark=()=>{if(real)p.logs.at(-1).simulated=false;};
 if(f.step+1<f.route.length){const next=f.route[f.step+1];recordHandoff(a.id,next,f,real?text:`${text}\n\nContexto anterior: ${f.context.slice(0,1000)}`);if(real)p.handoffs.at(-1).simulated=false;mark();f.step++;f.currentAgentId=next;log(`${f.key}: etapa ${f.step+1}/${f.route.length} iniciada${real?'':' na demonstracao'}.`,'agent',next);mark();
  roomTyping(null);roomPush({kind:'baton',from:a.id,to:next,featureKey:f.key,text,simulated:!real});roomStepStart(f,a.id);save();render();refreshFeatureModal();scheduleStep(simulationStep);}
 else{f.status='review';f.currentAgentId=null;runner.featureId=null;log(`${f.key} enviada para revisão humana. Nenhuma entrega foi aprovada automaticamente.`,'review',a.id);mark();const single=runner.single,kind=runner.kind;
  roomTyping(null);roomPush({kind:'baton',from:a.id,to:null,featureKey:f.key,text,simulated:!real,spawn:kind==='spawn'});if(kind!=='spawn')roomPush({kind:'say',agentId:p.commanderId,featureKey:f.key,text:`${f.key} fechou a rota. A entrega está com você para revisão; aprovar libera quem depende dela.`});roomPush({kind:'review',featureId:f.id,featureKey:f.key});
  save();render();refreshFeatureModal();if(single){runner=null;save();render();toast(kind==='feature'?`${f.key} ${real?'concluída':'concluída na simulação'}. Revise a entrega.`:real?'Spawn concluído. Revise a entrega na tela de Features.':'Spawn simulado concluído. Revise a entrega na tela de Features.');}else scheduleStep(launchNext);}
}
async function liveStep(f,a){
 const owner=runner,p=project();if(owner.inFlight)return;owner.inFlight=true;render();
 let exit;try{exit=await executeLiveStep(f,a,p,owner);}finally{owner.inFlight=false;}
 if(runner!==owner||exit.cancelled)return;
 if(exit.error||exit.isError){
  const message=exit.error||'Falha na execução do Claude Code.';
  f.outputs.push({agentId:a.id,at:nowISO(),text:`[FALHA] ${message}`,simulated:false,error:true,costUsd:exit.costUsd??null,durationMs:null,sessionId:exit.sessionId??null});
  f.status='ready';f.currentAgentId=null;f.step=0;runner=null;clearTimeout(timer);
  log(`${a.name} falhou em ${f.key}: ${message.slice(0,400)}. A feature voltou para Prontas.`,'agent',a.id,p);p.logs.at(-1).simulated=false;
  roomTyping(null);roomPush({kind:'say',agentId:a.id,featureKey:f.key,text:`Não consegui concluir a ${f.key}: ${message.slice(0,600)}`,error:true});roomPush({kind:'system',text:`${f.key} voltou para Prontas e a execução parou.`,tone:'error'});
  save();render();refreshFeatureModal();refreshConsole();toast(`${a.name} falhou: ${message.slice(0,160)}`,'error');return;
 }
 const text=exit.result||'(o agente não retornou texto)';
 // The final report goes in the baton card: drop the bubble that only repeats it.
 const last=exit.room?.lastMain;if(last?.raw&&text.trim().startsWith(last.raw.slice(0,300)))roomRemove(last);
 f.outputs.push({agentId:a.id,at:nowISO(),text,simulated:false,error:false,costUsd:exit.costUsd??null,durationMs:exit.durationMs??null,sessionId:exit.sessionId??null});if(f.outputs.length>300)f.outputs.shift();
 log(`${a.name} concluiu a etapa de ${f.key}${exit.costUsd!=null?` / US$ ${exit.costUsd.toFixed(4)}`:''}.`,'agent',a.id,p);p.logs.at(-1).simulated=false;
 advanceRoute(f,a,text,true);
}
function stopRun(){
 if(!runner)return;clearTimeout(timer);const planning=['planning','awaiting'].includes(runner.phase);
 for(const id of [runner.runId,runner.planRunId])if(id)bridgeFetch(`/api/runs/${id}/cancel`,{method:'POST'}).catch(error=>toast(error.message,'error'));
 const card=planning&&roomOf().messages.find(m=>m.id===runner.planMsgId);if(card){card.status='cancelled';roomUpdate(card);}
 const f=activeFeature();if(f){f.status='ready';f.currentAgentId=null;f.step=0;}runner=null;roomCalling.clear();
 for(const m of roomOf().messages)if(m.kind==='call'&&m.status==='open'){m.status='cancelled';roomUpdate(m);}
 roomTyping(null);roomPush({kind:'system',ops:'stop',text:planning?'Plano cancelado. Nenhuma feature foi alterada.':`Operação encerrada pelo operador.${f?` A ${f.key} voltou para Prontas.`:''}`,tone:'warn'});
 log(planning?'Plano cancelado pelo operador. Nenhuma feature foi alterada.':'Operação encerrada pelo operador. A feature interrompida volta para Prontas.','system');save();render();if(ui.modal==='features')openFeatures();refreshConsole();toast(planning?'Plano cancelado.':'Operação interrompida.');
}
function openSpawn(agentId){
 if(!guardMutation()||!runGate())return;const a=agentById(agentId||ui.selectedId);if(!a)return;
 const candidates=project().features.filter(f=>!['done','review'].includes(f.status)&&depsReady(f));
 if(!candidates.length)return toast('Não há feature disponível para spawn. Adicione uma ou revise as dependências.','error');
 const live=liveMode();
 showModal('SPAWN <span class="word-tag">INDIVIDUAL</span>',(live?'CLAUDE CODE / claude -p / ':'SESSÃO SIMULADA / ')+a.name,`<form id="spawnForm"><div class="field"><label for="spawnFeature">FEATURE PARA ${E(a.name)}</label><select id="spawnFeature" name="featureId">${candidates.map(f=>`<option value="${E(f.id)}">${E(f.key)} / ${E(f.title)}</option>`).join('')}</select></div><div class="notice warning">${icon('info')}A rota desta feature será substituida por uma sessão individual de ${E(a.name)}. Depois, a entrega vai para revisão humana. ${live?`O Claude Code roda na pasta da operação, ${E(projectDirLabel())}, com permissão ${E(runtime().permissionMode)} e modelo ${E(runOptionsFor(a).model||'padrão')}.`:'Não há execução real de IA.'}</div><input type="hidden" name="agentId" value="${E(a.id)}"></form>`,cancelButton+'<button class="btn primary" type="submit" form="spawnForm">'+icon('play')+(live?'Spawn / claude -p':'Iniciar spawn / demo')+'</button>','narrow','spawn');
}
function spawnAgent(form){if(!guardMutation()||!runGate())return;const d=new FormData(form),f=featureById(d.get('featureId')),a=agentById(d.get('agentId'));if(!f||!a||!project().agentIds.includes(a.id)||!depsReady(f)||['done','review'].includes(f.status))return toast('Feature ou agente indisponível.','error');f.route=[a.id];f.briefs=[];f.status='ready';runner={featureId:null,paused:false,single:true,phase:'running',kind:'spawn',label:f.key,sprintId:'',roomSeq:roomOf().seq};closeModal();log(`Spawn individual de ${a.name} solicitado para ${f.key}.`,'agent',a.id);roomPush({kind:'system',text:`Spawn individual de ${a.name} para ${f.key}. Sem comandante: a sessão é só dele.`});openOpsChat();launchNext(f.id);}
function openReview(featureId){if(featureById(featureId))openOpsFeature(featureId);}
function reviewHTML(f){
 const outputs=f.outputs.map(o=>`<article class="review-output"><h3>${E(agentById(o.agentId)?.name||'AGENTE REMOVIDO')} / ${o.simulated?'REGISTRO SIMULADO':o.error?'FALHA NA EXECUÇÃO':'CLAUDE CODE'}</h3><time>${clock(o.at)}${o.costUsd!=null?` / US$ ${Number(o.costUsd).toFixed(4)}`:''}${o.durationMs?` / ${Math.round(o.durationMs/1000)}s`:''}${o.sessionId?` / sessão ${E(o.sessionId.slice(0,8))}`:''}</time><p>${E(o.text)}</p></article>`).join('');
 const body=`<div class="between" style="margin-bottom:20px"><span class="tag">${E(f.key)} / ${E(SCOPES[f.scope])}</span><span class="status-label ${f.status}">${E(STATUS[f.status].toUpperCase())}</span></div><h3 style="font-size:20px;font-weight:450;margin-bottom:18px">${E(f.title)}</h3><div class="eyebrow" style="margin-bottom:8px">CRITÉRIOS DE ACEITAÇÃO</div><p class="prose" style="margin-bottom:25px">${E(f.criteria)}</p><div class="eyebrow" style="margin-bottom:18px">ENTREGAS DOS ESPECIALISTAS</div>${outputs||'<p class="prose">Nenhum registro de entrega disponível ainda.</p>'}<div class="notice warning">${icon('info')}${f.outputs.some(o=>!o.simulated)?'Registros do Claude Code: revise os arquivos alterados no repositório antes de aprovar. Aprovar libera as features dependentes.':'Estes registros sao simulados. Aprovar altera apenas o estado demonstrativo da feature; não valida código real.'}</div>`;
 const footer=f.status==='review'?`<button class="btn ghost" data-action="feature-rework" data-id="${E(f.id)}">${icon('edit')}Solicitar ajustes</button><button class="btn primary" data-action="feature-approve" data-id="${E(f.id)}">${icon('check')}${f.outputs.some(o=>!o.simulated)?'Aprovar entrega':'Aprovar entrega / demo'}</button>`:'';
 return body+(footer?`<div class="ops-detail-actions">${footer}</div>`:'');
}
function approveFeature(featureId,approve){
 const f=featureById(featureId);if(!f||f.status!=='review')return toast('Somente features em revisão podem ser aprovadas.','error');
 f.status=approve?'done':'ready';f.step=0;f.currentAgentId=null;
 log(`${f.key}: ${approve?'entrega aprovada pelo operador':'ajustes solicitados pelo operador'}.`,'review');refreshBlocked();save();closeModal();render();toast(approve?'Entrega aprovada na demonstracao. Dependências liberadas.':'Feature devolvida para a fila de execução.');
}
function openFeature(featureId){const f=featureById(featureId);if(!f)return;if(['done','review','running'].includes(f.status))openOpsFeature(featureId);else openFeatureEditor(featureId);}

/* Explicit handoffs keep the activity and the context together. */
function openHandoffForm(){
 if(!guardMutation())return;const members=squad(),candidates=project().features.filter(f=>!['done','review','running'].includes(f.status));
 if(members.length<2)return toast('Associe pelo menos dois agentes ao projeto.','error');if(!candidates.length)return toast('Adicione uma feature pendente antes de criar um handoff.','error');
 const from=members.find(a=>a.id===ui.selectedId)||members[0],preferred=from.nextId||members.find(a=>a.id!==from.id).id;
 showModal('NOVO <span class="word-tag">HANDOFF</span>','TRANSFERÊNCIA DE ATIVIDADE / CONTEXTO EXPLICITO',`<form id="handoffForm" novalidate><div class="form-grid"><div class="field"><label for="handoffFrom">AGENTE DE ORIGEM</label><select id="handoffFrom" name="from">${members.map(a=>`<option value="${E(a.id)}" ${a.id===from.id?'selected':''}>${E(a.name)}</option>`).join('')}</select></div><div class="field"><label for="handoffTo">AGENTE DE DESTINO</label><select id="handoffTo" name="to">${members.map(a=>`<option value="${E(a.id)}" ${a.id===preferred?'selected':''}>${E(a.name)} / ${E(roleLabel(a))}</option>`).join('')}</select></div><div class="field full"><label for="handoffFeature">FEATURE / ATIVIDADE</label><select id="handoffFeature" name="featureId">${candidates.map(f=>`<option value="${E(f.id)}">${E(f.key)} / ${E(f.title)}</option>`).join('')}</select></div><div class="field full"><label for="handoffContext">CONTEXTO PARA O PRÓXIMO AGENTE</label><textarea id="handoffContext" name="context" maxlength="10000" style="min-height:140px" placeholder="O que foi definido? Qual e o próximo passo? Quais sao os contratos, restrições e critérios?"></textarea></div></div><div class="notice">${icon('flow')}Este handoff substitui a rota pendente da feature por Origem > Destino e preserva suas dependências. O registro é local; não inicia execução automaticamente.</div></form>`,cancelButton+'<button class="btn primary" form="handoffForm" type="submit">'+icon('arrow')+'Registrar handoff</button>','','handoff');
}
function saveHandoff(form){
 if(!guardMutation())return;const d=new FormData(form),from=d.get('from'),to=d.get('to'),f=featureById(d.get('featureId')),context=String(d.get('context')||'').trim();
 if(from===to)return toast('Origem e destino precisam ser diferentes.','error');if(!context){$('#handoffContext').focus();return toast('Descreva o contexto da transferência.','error');}
 if(!f||!project().agentIds.includes(from)||!project().agentIds.includes(to)||['done','review','running'].includes(f.status))return toast('Feature ou agente indisponível.','error');
 f.route=[from,to];f.briefs=[];f.context=context;f.step=0;f.currentAgentId=null;f.status=depsReady(f)?'ready':'blocked';recordHandoff(from,to,f,context,true);ui.view='handoffs';ui.selectedId=to;save();closeModal();render();toast('Handoff registrado. A rota e o contexto foram atualizados.');
}
function openHandoffHistory(){
 const handoffs=[...project().handoffs].reverse();
 showModal('REDE DE <span class="word-tag">HANDOFFS</span>',project().code+' / TRANSMISSÕES ENTRE ESPECIALISTAS',`<div class="modal-toolbar"><p>A tarefa muda de agente, mas o contexto acompanha a entrega. Os registros abaixo pertencem a demonstracao local.</p><button class="btn primary" data-action="handoff-new" ${runner?'disabled':''}>${icon('plus')}Novo handoff</button></div>${handoffs.length?`<div class="timeline">${handoffs.map(h=>`<article class="timeline-row"><time>${clock(h.at)}</time>${icon('flow')}<div><h3>${E(agentById(h.from)?.name||'REMOVIDO')} &rarr; ${E(agentById(h.to)?.name||'REMOVIDO')} <span class="muted">/ ${E(featureById(h.featureId)?.key||'ARQUIVADA')}</span></h3><p>${E(h.context.slice(0,600))}${h.context.length>600?'...':''}</p></div><span class="tag">${h.manual?'MANUAL':h.simulated===false?'CLAUDE':'DEMO'}</span></article>`).join('')}</div>`:emptyPanel('Nenhuma transferência ainda','Distribua as features e inicie a demonstracao, ou configure um handoff manual.','handoff-new','Configurar handoff')}`,'','','handoff-history');
}
function logsHTML(){const logs=[...project().logs].reverse().filter(l=>ui.logFilter==='all'||l.type===ui.logFilter);return logs.length?logs.map(l=>`<div class="log-grid"><time>${clock(l.at)}</time><strong>${E(agentById(l.agentId)?.name||'SISTEMA')}</strong><span>${E(l.message)}</span><span class="tag ${l.simulated?'':'accent'}">${l.simulated?'DEMO':'CLAUDE'}</span></div>`).join(''):emptyPanel('Canal em silêncio','Nenhum evento para este filtro.');}
function openLogs(){
 showModal('REGISTRO DE <span class="word-tag">TRANSMISSÕES</span>',project().code+' / HISTÓRICO LOCAL',`<div class="modal-toolbar"><div class="flex wrap">${[['all','Todos'],['agent','Agentes'],['plan','Plano'],['handoff','Handoffs'],['review','Revisões']].map(([key,label])=>`<button class="btn sm ${ui.logFilter===key?'white':'ghost'}" data-action="log-filter" data-filter="${key}">${label}</button>`).join('')}</div><div class="flex wrap"><button class="btn ghost sm" data-action="console">${icon('terminal')}Console</button><button class="btn ghost sm" data-action="logs-export">${icon('download')}Exportar log</button></div></div><div id="logRows">${logsHTML()}</div>`,'','','logs');
}
function openSettings(tab=ui.settingsTab){
 ui.settingsTab=['workspace','claude','profiles','settingsjson','plugins'].includes(tab)?tab:'workspace';const r=runtime(),b=ui.bridge,locked=runner?'disabled':'';
 const tabs=[['workspace','WORKSPACE'],['claude','CLAUDE CODE'],['profiles','PERFIS'],['settingsjson','SETTINGS.JSON'],['plugins','PLUGINS']].map(([key,title])=>`<button type="button" class="editor-tab ${key===ui.settingsTab?'active':''}" data-action="settings-tab" data-tab="${key}">${title}</button>`).join('');
 const bridgeState=b.online?`<div class="notice" style="margin-top:0">${icon('check')}<span>Bridge conectado ao <strong>Claude Code ${E(b.version)}</strong><br><small>${E(b.path||'')} / ${E(b.platform||'')} / pasta dos projetos: ${E(b.projectsDir||'')}</small></span></div>`:`<div class="notice warning" style="margin-top:0">${icon('info')}<span>${BRIDGE_TOKEN?'O bridge respondeu, mas o Claude Code não foi encontrado: '+E(b.error||''):'Esta página não foi servida pelo bridge. Para executar agentes reais, rode <code>node server.js</code> na pasta do projeto e abra <code>http://127.0.0.1:4317</code>. Até lá, a operação usa a simulação local.'}</span></div>`;
 const workspace=`<div class="settings-row"><div><h3>Movimento e transmissões</h3><p>Animações de interface, marcadores ativos e pacotes nas rotas. Respeita a preferência de movimento reduzido do sistema.</p></div><button class="toggle" role="switch" aria-label="Ativar movimento" aria-checked="${state.settings.motion}" data-action="setting-toggle" data-setting="motion"></button></div><div class="settings-row"><div><h3>Gráficos da cidade em alta qualidade</h3><p>Sombras suaves, oclusão de ambiente e brilho na cidade hexagonal. Desligue em computadores mais lentos; em quadros lentos a qualidade também cai sozinha.</p></div><button class="toggle" role="switch" aria-label="Gráficos da cidade em alta qualidade" aria-checked="${state.settings.mapQuality!=='low'}" data-action="setting-toggle" data-setting="mapQuality"></button></div><div class="settings-row"><div><h3>Cidade em modo planeta</h3><p>A cidade hexagonal vira um planeta 3D, no estilo Mario Galaxy: arraste para girar o planeta e ver os agentes do outro lado. Precisa de WebGL.</p></div><button class="toggle" role="switch" aria-label="Cidade em modo planeta" aria-checked="${state.settings.cityShape==='planet'}" data-action="setting-toggle" data-setting="cityShape"></button></div><div class="settings-row"><div><h3>Intervalo entre etapas</h3><p>Pausa entre as etapas dos agentes. No modo demo, é a duração de cada etapa simulada.</p></div><select id="demoSpeed" aria-label="Intervalo entre etapas">${[[600,'Rápida / 0,6 s'],[1000,'Ágil / 1 s'],[1800,'Normal / 1,8 s'],[3200,'Lenta / 3,2 s']].map(([value,label])=>`<option value="${value}" ${state.settings.stepMs===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="settings-row"><div><h3>Exportar workspace</h3><p>Backup JSON com agentes, retratos, prompts, projetos, features, histórico e configurações do runtime.</p></div><button class="btn" data-action="export">${icon('download')}Exportar</button></div><div class="settings-row"><div><h3>Importar backup</h3><p>Restaura um backup JSON (exportado ou de <code>data/legacy-json</code>) após confirmação. Substitui os dados atuais${diskSync.on?', que ficam nas versões salvas':''}.</p></div><button class="btn" data-action="import" ${locked}>${icon('upload')}Importar</button></div><div class="settings-row"><div><h3>Reiniciar workspace</h3><p>Remove alterações deste workspace e restaura o projeto Atlas Commerce.</p></div><button class="btn danger" data-action="reset" ${locked}>${icon('trash')}Reiniciar</button></div>${diskSync.on?`<div class="settings-row ws-versions-row"><div><h3>Versões salvas</h3><p>O banco guarda uma versão do workspace antes da primeira alteração de cada início do bridge, antes de importar ou restaurar e quando outra aba salva por cima. Ficam as 30 mais recentes.</p><div id="wsVersions" class="ws-versions"><span class="hint">Carregando…</span></div></div></div>`:''}<div class="notice" style="margin-bottom:0">${icon('lock')}<span>${diskSync.on?`O workspace, a sala da operação, as conversas e o histórico de execuções ficam no banco SQLite local <code>${E(diskSync.path||'data/squad.db')}</code>${diskSync.status==='error'?` (agora indisponível: ${E(diskSync.error==='token'?'recarregue a página':diskSync.error)}; as alterações ficam neste navegador até lá)`:diskSync.savedAt?` (último salvamento às ${clock(diskSync.savedAt)})`:''}, e o workspace também neste navegador. Nenhum dos dois é um cofre de segredos`:'Os dados ficam só no navegador deste dispositivo. Abra a página pelo bridge (<code>npm start</code>, <code>http://127.0.0.1:4317</code>) para salvá-los no banco local. O armazenamento local não é um cofre de segredos'}: não coloque credenciais nos prompts ou no briefing.</span></div>`;
 const claude=`${bridgeState}<form id="runtimeForm" novalidate><div class="form-grid"><div class="field"><label for="rtMode">EXECUÇÃO DOS AGENTES</label><select id="rtMode" name="mode"><option value="claude" ${r.mode==='claude'?'selected':''}>Claude Code real (claude -p)</option><option value="demo" ${r.mode==='demo'?'selected':''}>Simulação local (demo)</option></select></div><div class="field"><label for="rtPath">EXECUTÁVEL DO CLAUDE</label><input id="rtPath" name="claudePath" value="${E(r.claudePath)}" maxlength="400" placeholder="claude (padrão do bridge)" autocomplete="off"><span class="hint">Nome no PATH ou caminho completo. Vazio = padrão do bridge.</span></div><div class="field full"><span class="label">PASTA DOS PROJETOS</span><div class="hint" style="margin-top:10px;word-break:break-all">Cada operação trabalha na sua própria pasta dentro de <code>${E(b.projectsDir||'projects/')}</code>, criada na primeira execução. É lá que os agentes leem e escrevem os arquivos. Esta operação: <code>${E(projectDirLabel())}</code>.</div></div><div class="field"><label for="rtPerm">MODO DE PERMISSÃO</label><select id="rtPerm" name="permissionMode">${Object.entries(PERMISSION_MODES).map(([k,label])=>`<option value="${k}" ${r.permissionMode===k?'selected':''}>${E(label)}</option>`).join('')}</select></div><div class="field"><label for="rtModel">MODELO (SOBRESCREVE O DO AGENTE)</label><input id="rtModel" name="model" value="${E(r.model)}" maxlength="80" placeholder="vazio = modelo de cada agente" list="rtModels" autocomplete="off"><datalist id="rtModels">${CLAUDE_MODELS.flatMap(([,items])=>items.map(([id])=>id)).filter(id=>id!=='inherit').map(m=>`<option value="${m}">`).join('')}</datalist></div><div class="field"><label for="rtEffort">ESFORÇO (SOBRESCREVE O DO AGENTE)</label><select id="rtEffort" name="effort">${EFFORTS.map(e=>`<option value="${e}" ${r.effort===e?'selected':''}>${e?e.toUpperCase():'Vazio = esforço de cada agente'}</option>`).join('')}</select></div><div class="field"><label for="rtBudget">ORÇAMENTO MÁXIMO POR ETAPA (USD)</label><input id="rtBudget" name="maxBudgetUsd" type="number" min="0.01" max="1000" step="0.01" value="${E(r.maxBudgetUsd)}" placeholder="sem limite"></div><div class="field"><label for="rtTimeout">TEMPO LIMITE POR ETAPA (S)</label><input id="rtTimeout" name="timeoutSec" type="number" min="10" max="7200" step="10" value="${E(r.timeoutSec)}"></div><div class="field"><label for="rtConc">EXECUÇÕES SIMULTÂNEAS NO BRIDGE</label><input id="rtConc" name="concurrency" type="number" min="1" max="8" step="1" value="${E(r.concurrency)}"></div><div class="field full"><label for="rtAllowed">REGRAS EXTRAS DE ALLOWEDTOOLS</label><input id="rtAllowed" name="extraAllowedTools" value="${E(r.extraAllowedTools)}" maxlength="2000" placeholder='Ex.: Bash(npm test), Bash(git status)' autocomplete="off"><span class="hint">Separadas por vírgula. Somadas às ferramentas de cada agente em --allowedTools.</span></div><div class="field full"><label for="rtDirs">DIRETÓRIOS ADICIONAIS (--add-dir)</label><input id="rtDirs" name="addDirs" value="${E(r.addDirs)}" maxlength="2000" placeholder="Separados por vírgula" autocomplete="off"></div><label class="check-card full"><input type="checkbox" name="restrictTools" ${r.restrictTools?'checked':''}><span><strong>Restringir às ferramentas do agente</strong><small>Passa --tools com a seleção do estúdio. Desmarcado, o agente recebe as ferramentas padrão do Claude Code.</small></span></label></div>${r.permissionMode==='bypassPermissions'?`<div class="notice warning">${icon('lock')}bypassPermissions desativa todas as verificações. Os agentes podem executar qualquer comando nesta máquina.</div>`:''}<div class="notice">${icon('info')}<span>Cada etapa roda <code>claude -p --output-format stream-json</code> com o prompt do agente anexado ao system prompt. O Claude Code usa a sua autenticação local e as execuções são cobradas na sua conta.</span></div>${commandPreviewHTML()}</form>`;
 const sj=`<div class="notice" style="margin-top:0">${icon('file')}<span>Edita os arquivos reais de configuração do Claude Code. Um backup <code>.bak</code> é criado antes de salvar. Os escopos de projeto e local usam a pasta da operação atual, <code>projects/${E(project().folder)}/.claude/</code>.</span></div><div class="form-grid"><div class="field"><label for="sjScope">ESCOPO</label><select id="sjScope">${[['user','Usuário / ~/.claude/settings.json'],['project','Projeto / .claude/settings.json'],['local','Local / .claude/settings.local.json']].map(([k,l])=>`<option value="${k}" ${ui.settingsScope===k?'selected':''}>${l}</option>`).join('')}</select></div><div class="field" id="sjProfileField" ${ui.settingsScope==='user'&&profilesOn()?'':'hidden'}><label for="sjProfile">PERFIL CLAUDE</label><select id="sjProfile">${sjProfilesHTML()}</select><span class="hint">No escopo usuário, edita o settings.json do diretório de configuração deste Perfil (sem diretório: ~/.claude).</span></div><div class="field"><span class="label">ARQUIVO</span><div class="hint" id="sjPath" style="margin-top:10px;word-break:break-all">${E(ui.settingsFile?.path||'Carregue para ver o caminho.')}</div></div><div class="field full"><label for="sjText">CONTEÚDO JSON</label><textarea id="sjText" class="code" spellcheck="false" style="min-height:320px">${E(ui.settingsFile?.text??'')}</textarea><span class="hint" id="sjStatus">${ui.settingsFile?(ui.settingsFile.exists?'Arquivo carregado.':'Arquivo ainda não existe; salvar vai criá-lo.'):''}</span></div></div><div class="flex wrap" style="gap:8px;margin-top:6px"><button class="btn ghost" data-action="settings-load" ${b.online||BRIDGE_TOKEN?'':'disabled'}>${icon('download')}Carregar</button><button class="btn ghost" data-action="settings-validate">${icon('check')}Validar JSON</button><button class="btn primary" data-action="settings-save" ${BRIDGE_TOKEN?'':'disabled'}>${icon('upload')}Salvar arquivo</button></div>`;
 const body=`<nav class="editor-nav" aria-label="Seções das configurações">${tabs}</nav><div class="editor-pane ${ui.settingsTab==='workspace'?'':'hidden'}" data-pane="workspace">${workspace}</div><div class="editor-pane ${ui.settingsTab==='claude'?'':'hidden'}" data-pane="claude">${claude}</div><div class="editor-pane ${ui.settingsTab==='profiles'?'':'hidden'}" data-pane="profiles">${ui.settingsTab==='profiles'?profilesPaneHTML():''}</div><div class="editor-pane ${ui.settingsTab==='settingsjson'?'':'hidden'}" data-pane="settingsjson">${sj}</div><div class="editor-pane ${ui.settingsTab==='plugins'?'':'hidden'}" data-pane="extensions">${pluginsHTML()}</div>`;
 const footer=ui.settingsTab==='claude'?`<button class="btn ghost" data-action="bridge-test">${icon('radio')}Testar conexão</button><span class="grow"></span>${cancelButton}<button class="btn primary" type="submit" form="runtimeForm" ${locked}>${icon('check')}Salvar configurações</button>`:'';
 showModal('CONFIGURAÇÕES DO <span class="word-tag">WORKSPACE</span>',liveMode()?'CLAUDE CODE CONECTADO / '+E(b.version||''):'LOCAL-FIRST / RUNTIME DESCONECTADO',body,footer,'','settings');
 if(ui.settingsTab==='settingsjson'&&!ui.settingsFile&&BRIDGE_TOKEN)loadClaudeSettings();
 if(ui.settingsTab==='workspace'&&diskSync.on)loadVersions();
 if(ui.settingsTab==='claude')refreshCommandPreview();
 if(ui.settingsTab==='profiles'&&BRIDGE_TOKEN){loadProfiles();if(!ui.telemetry)loadTelemetry();}
}
/* Configurações > Plugins: plugins loaded by the bridge (#squad-plugins), their warnings and the app's, the theme picker and how to
   install. A theme change saves and reloads (city.js builds its scene once, at load). */
function pluginsHTML(){
 const P=readPlugins(),themes=pluginThemes(),cur=state.settings.theme||'',warn=[...P.warnings,...P.appWarnings];
 const install=`<div class="notice" style="margin-bottom:0">${icon('info')}<span><strong>Como instalar um plugin.</strong> Crie <code>squad.local.json</code> na pasta do app (ao lado de <code>server.js</code>) com <code>{"plugins": {"paths": ["caminho/do/plugin"]}}</code> e recarregue a página. Caminhos relativos valem a partir do arquivo e <code>~</code> é a sua pasta pessoal. Um plugin nunca altera agentes já criados: os agentes, categorias, diretrizes, avatares e temas dele aparecem no catálogo.</span></div>`;
 if(!BRIDGE_TOKEN)return`<div class="notice" style="margin-top:0">${icon('lock')}<span><strong>Disponível com o bridge.</strong> Plugins e temas são lidos pelo bridge local. Rode <code>npm start</code> na pasta do app e abra <code>http://127.0.0.1:4317</code>.</span></div>${install}`;
 const count=(n,one,many)=>`${n} ${n===1?one:many}`;
 const plugins=P.plugins.length?P.plugins.map(pk=>{const c=pk.conventions,diret=c?c.subsets.length+c.groups.length+Object.values(c.families).reduce((n,f)=>n+(Array.isArray(f?.templates)?f.templates.length:0),0):0,ok=pluginPresets().filter(p=>p.plugin===pk.id).length,all=Math.max(pk.declared||0,pk.presets.length);
  return`<div class="settings-row"><div><h3>${E(pk.name)}${pk.version?` <small>v${E(pk.version)}</small>`:''}</h3>${pk.description?`<p>${E(pk.description)}</p>`:''}<p class="hint" style="word-break:break-all">ID <code>${E(pk.id)}</code>${pk.path?` / <code>${E(pk.path)}</code>`:''}</p><p class="hint">${[count(ok,'agente','agentes')+(ok<all?` (${all-ok} ignorado${all-ok>1?'s':''})`:''),count(pk.categories.length,'categoria','categorias'),count(pk.avatars.length,'avatar','avatares'),count(pk.themes.length,'tema','temas'),count(diret,'diretriz','diretrizes')].join(' / ')}</p></div></div>`;}).join('')
  :`<div class="settings-row"><div><h3>Nenhum plugin carregado</h3><p>${P.present?'O bridge não encontrou plugins na configuração local.':'Esta página não recebeu a lista de plugins do bridge (versão antiga do bridge?).'}</p></div></div>`;
 const known=!cur||themes.some(t=>t.key===cur),pluginOf=k=>P.plugins.find(pk=>k.startsWith(pk.id+'/'))?.name||'';
 const theme=`<div class="settings-row"><div><h3>Tema</h3><p>Cores da interface, da cidade e do escritório oferecidas pelos plugins. Trocar o tema salva o workspace e recarrega a página.</p>${known?'':`<p class="hint">O tema salvo (<code>${E(cur)}</code>) não está em nenhum plugin carregado; a página usa o tema padrão e mantém a escolha.</p>`}</div><select id="themeSelect" aria-label="Tema" ${runner||diskSync.setup?'disabled':''}><option value="" ${cur?'':'selected'}>Padrão</option>${known?'':`<option value="${E(cur)}" selected>${E(cur)} (não encontrado)</option>`}${themes.map(t=>`<option value="${E(t.key)}" ${t.key===cur?'selected':''}>${E(t.label)}${pluginOf(t.key)?' / '+E(pluginOf(t.key)):''}</option>`).join('')}</select></div>`;
 const warnings=warn.length?`<div class="notice warning">${icon('info')}<span><strong>Avisos dos plugins</strong><br>${warn.map(w=>E(w)).join('<br>')}</span></div>`:'';
 return`${plugins}${theme}${warnings}${install}`;
}
// Theme change: saves and reloads only once the current workspace is safe, written to the database (no pending write on its rev)
// or to this browser's copy (which then wins at the next boot, see bootChoice). The whole wait is capped at 5 s; without either,
// the page stays open with the previous theme, the picker comes back and an error says why.
async function setTheme(key){
 if(runner){toast('Encerre a operação antes de trocar o tema: a página é recarregada.','error');openSettings('plugins');return;}
 const prev=state.settings.theme||'';if(diskSync.setup||key===prev)return;
 state.settings.theme=key;save();$('#themeSelect')?.setAttribute('disabled','');toast('Salvando o tema…');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 if(diskSync.on)await Promise.race([(async()=>{await diskFlush();while(diskSync.busy||diskSync.timer&&diskSync.status!=='error')await sleep(100);})(),sleep(5000)]);
 const json=JSON.stringify(state);let local=false;try{local=localStorage.getItem(STORE)===json;}catch{local=false;}
 const disk=diskSync.on&&diskSync.status!=='error'&&!diskSync.busy&&!diskSync.timer&&diskSync.last===json;
 if(disk||local){location.reload();return;}
 state.settings.theme=prev;save();
 toast(`Não foi possível salvar o tema (${diskSync.on?(diskSync.status==='error'?(diskSync.error==='token'?'o bridge foi reiniciado, recarregue a página':diskSync.error):'o banco local não respondeu a tempo')+' e ':''}o armazenamento do navegador está indisponível). A página não foi recarregada; exporte o workspace antes de tentar de novo.`,'error');
 if(ui.modal==='settings')openSettings('plugins');
}
function saveRuntime(form){
 if(!guardMutation())return;const d=new FormData(form),raw=Object.fromEntries(d.entries());raw.restrictTools=d.has('restrictTools');
 state.settings.runtime=normalizeRuntime(raw);save();log(`Runtime do Claude Code atualizado: ${runtime().mode==='claude'?'execução real':'demo'} / ${runtime().permissionMode}.`,'system');
 toast('Configurações do Claude Code salvas.');checkBridge().then(()=>openSettings('claude'));
}
const settingsQuery=()=>{const scope=$('#sjScope')?.value||ui.settingsScope||'user',prof=scope==='user'&&profilesOn()?($('#sjProfile')?.value||ui.settingsProfile||''):'';return`scope=${encodeURIComponent(scope)}&project=${encodeURIComponent(project().folder||'')}${prof?`&profile=${encodeURIComponent(prof)}`:''}`;};
function sjProfilesHTML(){const list=(profilesData()?.list||[]).filter(p=>p.adapter==='claude');if(!list.some(p=>p.id===ui.settingsProfile))ui.settingsProfile=(list.find(p=>p.isDefault)||list[0])?.id||'';return list.map(p=>`<option value="${E(p.id)}" ${p.id===ui.settingsProfile?'selected':''}>${E(p.name)}${p.configDir?' / '+E(p.configDir):''}</option>`).join('');}
async function loadClaudeSettings(){
 ui.settingsScope=$('#sjScope')?.value||ui.settingsScope||'user';
 try{ui.settingsFile=await bridgeFetch('/api/claude/settings?'+settingsQuery());if(ui.modal==='settings'&&ui.settingsTab==='settingsjson'){$('#sjText').value=ui.settingsFile.text;$('#sjPath').textContent=ui.settingsFile.path;$('#sjStatus').textContent=ui.settingsFile.exists?'Arquivo carregado.':'Arquivo ainda não existe; salvar vai criá-lo.';}}
 catch(error){toast(error.message,'error');const st=$('#sjStatus');if(st)st.textContent=error.message;}
}
function validateSettingsText(){
 const text=$('#sjText')?.value??'',st=$('#sjStatus');
 try{const parsed=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('O conteúdo deve ser um objeto JSON.');if(st)st.textContent='JSON válido.';return text;}
 catch(error){if(st)st.textContent='JSON inválido: '+error.message;toast('JSON inválido: '+error.message,'error');return null;}
}
function saveClaudeSettings(){
 const text=validateSettingsText();if(text===null)return;const scope=$('#sjScope').value,query=settingsQuery(),target=ui.settingsFile?.path||scope;
 ui.settingsFile={...(ui.settingsFile||{}),text};ui.settingsScope=scope;
 confirmAction('SALVAR SETTINGS.JSON',`Gravar este conteúdo em ${target}? O arquivo atual será copiado para .bak antes.`,async()=>{
  try{const res=await bridgeFetch('/api/claude/settings?'+query,{method:'PUT',body:JSON.stringify({text})});ui.settingsFile={...res,text:JSON.stringify(JSON.parse(text),null,2)+'\n',exists:true};log(`settings.json (${scope}) atualizado em ${res.path}.`,'system');save();toast(res.backup?'Salvo. Backup em '+res.backup:'Arquivo criado em '+res.path);}
  catch(error){toast(error.message,'error');}
  openSettings('settingsjson');
 },'Salvar arquivo');
}
function openHelp(){
 const shortcuts=[['Mouse','Arrastar a cidade para navegar'],['Roda','Ampliar ou reduzir o mapa'],['Clique','Em um agente: mostra os atalhos de conversar, deslocar e editar'],['Duplo clique','Em um agente: abrir a conversa. Em um hexágono vazio: criar um agente ali'],['Shift','Shift + arrastar um agente para outro hexágono'],['Botão direito','Arrastar para girar a câmera'],['V','Alternar entre cidade hexagonal e escritório'],['P','Na cidade: dobrar em planeta ou desdobrar'],['0','Centralizar mapa e restaurar o zoom'],['Q / E','Alternar entre Painel, Projetos, Rede e Handoffs'],['A','Criar um agente no estúdio'],['B','Abrir briefing do projeto'],['F','Abrir quadro de features'],['G','Abrir Squad Studio'],['L','Abrir registro de transmissões'],['C','Abrir console do Claude Code'],['H','Ocultar ou mostrar os painéis'],['Espaco','Iniciar, pausar ou retomar a operação'],['Esc','Fechar o painel aberto']];
 showModal('CONTROLES DA <span class="word-tag">REDE</span>','GAME-MENU UI / WORKSPACE DE DESENVOLVIMENTO',`<div class="shortcut-grid">${shortcuts.map(([key,text])=>`<div class="shortcut-row"><kbd>${key}</kbd><span>${text}</span></div>`).join('')}</div><div class="notice">${icon('info')}Clique em um agente para seleciona-lo. Clique duas vezes para abrir o estúdio. No celular, a seleção abre o estúdio diretamente. O mapa é uma cidade procedural fictícia: seus marcadores representam especialistas, não localizações reais.</div><div class="notice purple">${icon('flow')}Para experimentar o fluxo completo: Briefing > Features > Distribuir > Aplicar plano > Iniciar demo > Revisão humana.</div>`,'','','help');
}
// Import and saved versions: with the bridge, the current workspace becomes a saved version first, so the swap can be undone.
function restoreWorkspace(raw,label){
 const imported=normalizeWorkspace(raw);migrateCatalogAgents(imported);
 confirmAction('RESTAURAR WORKSPACE',`Substituir os dados atuais por ${imported.agents.length} agentes e ${imported.projects.length} projetos de ${label}? ${diskSync.on?'A versão atual fica nas versões salvas.':'Exporte um backup antes de continuar.'}`,async()=>{if(diskSync.on)await bridgeFetch('/api/workspace/backups',{method:'POST',body:JSON.stringify(state)}).catch(()=>{});state=imported;ui.selectedId=project().commanderId;ui.view='network';save();render();MapNetwork.home();toast('Backup restaurado.');},'Restaurar backup');
}
async function importWorkspace(file){
 if(!file||!guardMutation())return;
 if(file.size>12*1024*1024)return toast('O backup deve ter até 12 MB.','error');
 try{restoreWorkspace(JSON.parse(await file.text()),file.name);}
 catch(error){toast(error.message||'Arquivo de backup inválido.','error');}
}
/* First start without a database (diskSync.setup, from #squad-disk.setup): a dialog that cannot be closed asks how to start, and
   POST /api/setup creates data/squad.db with that workspace. From scratch (freshWorkspace), the example, a backup or this browser's
   copy; a browser copy left aside becomes a saved version. Nothing is saved before (save() returns). */
function dbSetupStatusHTML(){
 const b=ui.bridge||{},claude=!b.checked?`<span class="db-check">${icon('clock')}Claude Code: verificando...</span>`:b.version?`<span class="db-check ok">${icon('check')}Claude Code ${E(b.version)}</span>`:`<span class="db-check bad">${icon('terminal')}Claude Code não encontrado</span>`;
 return`<span class="db-check ok">${icon('check')}Bridge conectado</span>${claude}${b.checked&&!b.version?`<p class="hint">${E(b.error||'')} Instale o Claude Code, rode <code>claude</code> uma vez no terminal para fazer login e clique em testar de novo (passo a passo no README). Sem ele o app funciona, mas as execuções ficam só na simulação. <button type="button" class="btn sm" data-action="bridge-test">Testar de novo</button></p>`:''}`;
}
function dbSetupLocal(){if(!diskSync.localCopy)return null;try{return normalizeWorkspace(diskSync.localCopy);}catch{return null;}}
function openDbSetup(){
 const copy=dbSetupLocal(),when=copy&&wsActivity(copy)?` · atividade em ${new Date(wsActivity(copy)).toLocaleDateString('pt-BR')}`:'';
 showModal('NENHUM <span class="word-tag">BANCO</span> ENCONTRADO','PRIMEIRA EXECUÇÃO',`<p class="op-new-ask">Nenhum banco de dados foi encontrado. Para usar o SQUAD/CODE, inicie um novo; ele será criado em:</p><code class="db-setup-path">${E(diskSync.path)}</code><div id="dbSetupStatus" class="db-setup-status">${dbSetupStatusHTML()}</div><form id="dbSetupForm" class="db-setup-fresh" novalidate><div class="field"><label for="dbSetupName">NOME DA PRIMEIRA OPERAÇÃO</label><input id="dbSetupName" name="name" maxlength="70" placeholder="Ex.: Loja da Ana" autocomplete="off" autofocus></div><button class="btn primary" type="submit">${icon('plus')}Começar do zero</button><p class="hint">Cria os agentes e a squad padrão e uma operação vazia para você preencher o briefing.</p></form><div class="db-setup-or">ou</div><div class="op-choices"><button type="button" class="op-choice" data-action="db-setup-demo">${icon('layers')}<strong>Carregar exemplo</strong><small>Atlas Commerce: um e-commerce com squad, sprints e features prontos para explorar.</small></button><button type="button" class="op-choice" data-action="db-setup-import">${icon('upload')}<strong>Importar backup</strong><small>Um .json exportado em Configurações &gt; Workspace, de outra máquina ou instalação.</small></button>${copy?`<button type="button" class="op-choice" data-action="db-setup-local">${icon('database')}<strong>Recuperar a cópia deste navegador</strong><small>${copy.projects.length} ${copy.projects.length===1?'operação':'operações'}, ${copy.agents.length} agentes${when}.</small></button>`:''}</div><input type="file" id="dbSetupImport" accept=".json,application/json" hidden>`,`<span class="footer-note">Nada é gravado em disco até você escolher.</span>`,'db-setup-modal','db-setup');
 $('#modalRoot .modal-header [data-action="modal-close"]')?.remove();
}
// From scratch: the catalog agents, their DIRETRIZES and the default squad of the example, with one empty operation (as createOperation).
function freshWorkspace(name){
 const w=seedWorkspace(),sq=w.squads[0];sq.id=id('squad');sq.name='SQUAD 01';
 const p=blankProject(sq);p.code='OP-001';p.name=name;p.folder=projectFolderName(p,[]);p.sprints=[createSprint(1)];ensureSetup(p);
 w.projects=[p];w.projectId=p.id;return w;
}
function dbSetupLock(on){$$('#modalRoot button,#modalRoot input').forEach(el=>{el.disabled=on;});}
async function dbSetupCreate(raw,kind){
 if(ui.dbSetupBusy||!diskSync.setup)return;let ws;
 try{ws=normalizeWorkspace(raw);migrateCatalogAgents(ws);}catch(error){return toast(error.message||'Workspace inválido.','error');}
 ui.dbSetupBusy=true;dbSetupLock(true);
 try{
  const r=await bridgeFetch('/api/setup',{method:'POST',body:JSON.stringify(ws)});
  Object.assign(diskSync,{setup:false,on:true,rev:String(r.rev||''),savedAt:String(r.savedAt||''),path:String(r.path||diskSync.path),status:'',error:''});
  if(diskSync.localCopy&&kind!=='local')bridgeFetch('/api/workspace/backups',{method:'POST',body:JSON.stringify(diskSync.localCopy)}).catch(()=>{});
  diskSync.localCopy=null;state=ws;diskSync.last=JSON.stringify(state);diskMeta(false);
  ui.selectedId=project().commanderId;closeModal();save();render();MapNetwork.home();
  if(kind==='fresh')goView('projects');
  toast(`Banco de dados criado em ${diskSync.path}.`);
 }catch(error){
  if(error.status===409){toast('Outra aba já criou o banco de dados. Recarregando...','error');setTimeout(()=>location.reload(),1500);return;}
  toast(error.message||'Não foi possível criar o banco de dados.','error');
 }finally{ui.dbSetupBusy=false;if(diskSync.setup)dbSetupLock(false);}
}
function dbSetupFresh(form){
 const name=String(new FormData(form).get('name')||'').trim().replace(/\s+/g,' ').slice(0,70);
 if(!name){$('#dbSetupName')?.focus();return toast('Informe o nome da primeira operação.','error');}
 dbSetupCreate(freshWorkspace(name),'fresh');
}
async function dbSetupImport(file){
 if(!file)return;if(file.size>12*1024*1024)return toast('O backup deve ter até 12 MB.','error');
 let raw;try{raw=JSON.parse(await file.text());}catch{return toast('Arquivo de backup inválido.','error');}
 dbSetupCreate(raw,'import');
}
const VERSION_ORIGIN={disco:'Antes de uma alteração','navegador':'Cópia de um navegador ou aba','migração':'Migração dos arquivos JSON'};
const versionWhen=at=>new Date(at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
function versionsHTML(list){return list.length?list.map(v=>`<div class="ws-version"><div><strong>${E(versionWhen(v.createdAt))}</strong><span>${E(VERSION_ORIGIN[v.origin]||v.origin)} / ${v.projects??'?'} projeto(s) / ${v.agents??'?'} agente(s)</span>${v.label?`<small>${E(v.label)}</small>`:''}</div><button class="btn sm" data-action="ws-restore" data-id="${E(v.id)}" ${runner?'disabled':''}>${icon('upload')}Restaurar</button></div>`).join(''):'<span class="hint">Nenhuma versão ainda.</span>';}
async function loadVersions(){
 try{const d=await bridgeFetch('/api/workspace/snapshots');ui.versions=d.snapshots;const box=$('#wsVersions');if(box)box.innerHTML=versionsHTML(d.snapshots);}
 catch(error){const box=$('#wsVersions');if(box)box.innerHTML=`<span class="hint">${E(error.message)}</span>`;}
}
async function restoreVersion(versionId){
 if(!guardMutation())return;
 try{const d=await bridgeFetch(`/api/workspace/snapshots/${encodeURIComponent(versionId)}`),v=ui.versions?.find(x=>String(x.id)===String(versionId));restoreWorkspace(d.workspace,v?`a versão de ${versionWhen(v.createdAt)}`:'uma versão salva');}
 catch(error){toast(error.message||'Versão inválida.','error');}
}
function toggleFocus(){ui.focus=!ui.focus;$('#workspace').classList.toggle('focus-mode',ui.focus);$$('.left-hud,.right-hud,.bottom-hud,.map-side-controls').forEach(el=>{el.inert=ui.focus;el.setAttribute('aria-hidden',String(ui.focus));});}
function goView(view){
 if(ui.modal)closeModal();
 if(view!=='projects')ui.opsNew=null;if(view!=='squads'){ui.squadPick=null;if(ui.squadDraft?.isNew)ui.squadDraft=null;ui.opPending=null;}
 ui.view=view;render();
 if(view==='handoffs'){toast('Rotas de handoff ativas. Abra o histórico pelo painel do agente.');}
}
function nextView(direction){const views=['home','projects','network','handoffs'],v=views[(views.indexOf(ui.view)+direction+views.length)%views.length];v==='network'?openSquadView():goView(v);}
/* SQUAD tab: with more than one operation it asks whose squad to show (during a run only the running operation can be shown). */
function openSquadView(){
 if(state.projects.length<2||runner)return goView('network');
 showModal('VER <span class="word-tag">SQUAD</span>','ESCOLHA A OPERAÇÃO',`<p class="op-new-ask">De qual operação você quer ver a squad?</p><div class="op-pick-list">${state.projects.map(x=>{const on=x.id===state.projectId;return`<button type="button" class="ops-item ${on?'active':''}" data-action="squad-view-op" data-id="${E(x.id)}" aria-pressed="${on}"><span class="between"><span class="eyebrow">${E(x.code)}</span>${on?'<span class="tag accent">ATIVA</span>':''}</span><strong>${E(x.name)}</strong><small>${E(squadById(x.squadId)?.name||'SEM SQUAD')} · ${x.agentIds.length} AGENTES</small><span class="mini-faces">${x.agentIds.map(agentById).filter(Boolean).slice(0,8).map(a=>`<img src="${portrait(a)}" alt="" title="${E(a.name)}">`).join('')}</span></button>`;}).join('')}</div>`,cancelButton,'narrow','op-pick');
}
function squadViewOp(projectId){if(!homeSwitch(projectId))return;goView('network');MapNetwork.home();}

/* General home (PAINEL): read-only overview across every project. */
const money=v=>'US$ '+Number(v||0).toFixed(v>=100?0:v>=1?2:4);
const realOutputs=f=>f.outputs.filter(o=>o.simulated===false&&!o.error);
function homeProjectCard(p){
 const count=s=>p.features.filter(f=>s.includes(f.status)).length,total=p.features.length,done=count(['done']),percent=total?Math.round(done/total*100):0,active=p.id===state.projectId;
 const stats=[['A FAZER',count(['backlog','blocked'])],['PRONTAS',count(['ready'])],['RODANDO',count(['running'])],['REVISÃO',count(['review'])],['FEITAS',done]];
 return`<article class="home-project ${active?'current':''}"><div class="between"><span class="eyebrow">${E(p.code)}</span>${active?'<span class="tag accent">ATIVO</span>':''}</div><h3>${E(p.name)}</h3><p>${p.briefing.trim()?E(p.briefing.slice(0,110)):'<em class="muted">Briefing pendente.</em>'}</p><div class="home-progress"><div class="progress-rail"><span style="width:${percent}%"></span></div><strong>${percent}%</strong></div><dl class="home-stats">${stats.map(([label,n])=>`<div class="${n&&label==='REVISÃO'?'attention':''}"><dt>${label}</dt><dd>${pad(n)}</dd></div>`).join('')}</dl><div class="between home-project-foot"><div class="mini-faces">${p.agentIds.map(agentById).filter(Boolean).slice(0,6).map(a=>`<img src="${portrait(a)}" alt="${E(a.name)}" title="${E(a.name)}">`).join('')}</div><div class="flex"><button class="btn sm ${active?'white':''}" data-action="home-open-project" data-id="${E(p.id)}">${icon('arrow')}Abrir projeto</button><button class="btn sm" data-action="home-open-teams" data-id="${E(p.id)}" title="Agent Teams: reunião online com o comandante e os reconhecedores PRD e ADR para co-escrever os documentos">${icon('video')}Abrir times</button></div></div></article>`;
}
function homeRunHTML(){
 if(!runner){const p=project(),cs=currentSprint(p),fs=cs?sprintFeatures(cs,p):[],ready=fs.some(f=>f.status==='ready'&&f.route.length&&depsReady(f,p)),plan=!ready&&fs.some(f=>f.status==='backlog'),name=cs?.name||'sprint';return`<div class="home-run idle">${icon('clock')}<div class="grow"><strong>Nenhuma operação em andamento</strong><span>${E(p.name)} / ${E(name)}: ${ready?'features prontas para iniciar':plan?'distribua as features para montar o plano':fs.length&&fs.every(f=>f.status==='done')?'todas as sprints concluídas':'aguardando revisão ou dependências'}</span></div><button class="btn ${ready?'primary':'ghost'} sm" data-action="${ready||plan?'run':'features'}">${icon(ready?'play':plan?'flow':'layers')}${ready?`${liveMode()?'Executar':'Simular'} ${E(name)}`:plan?`Planejar ${E(name)}`:'Ver sprints'}</button></div>`;}
 const f=activeFeature(),a=agentById(f?.currentAgentId),state_=runner.phase==='planning'?'COMANDANTE PLANEJANDO':runner.phase==='awaiting'?'PLANO AGUARDA APROVAÇÃO':runner.paused?(runner.inFlight?'PAUSANDO APÓS A ETAPA':'PAUSADA'):(runner.inFlight||!liveMode()?'EXECUTANDO':'PREPARANDO ETAPA');
 return`<div class="home-run live">${a?`<img src="${portrait(a)}" alt="">`:icon('radio')}<div class="grow"><span class="eyebrow">${E(state_)} / ${sprintById(runner.sprintId)?E(sprintById(runner.sprintId).name.toUpperCase())+' / ':''}${liveMode()?'CLAUDE CODE':'DEMO'}</span><strong>${f?`${E(f.key)} / ${E(f.title)}`:runner.phase==='planning'?'O comandante está montando o plano':runner.phase==='awaiting'?'Aprove o plano no chat da operação':'Selecionando próxima feature'}</strong><span>${a?`${E(a.name)} / ${E(roleLabel(a))} / etapa ${f.step+1} de ${f.route.length}`:E(project().name)}</span></div><div class="flex wrap"><button class="btn ghost sm" data-action="room">${icon('chat')}Chat</button>${ui.consoles.length?`<button class="btn ghost sm" data-action="console">${icon('terminal')}Console</button>`:''}<button class="btn sm" data-action="run">${icon(runControl().icon)}${runControl().label}</button><button class="btn danger sm" data-action="stop">${icon('stop')}Encerrar</button></div></div>`;
}
function homeReviewHTML(){
 const items=state.projects.flatMap(p=>p.features.filter(f=>f.status==='review').map(f=>({p,f})));
 if(!items.length)return`<div class="home-empty">${icon('check')}Nenhuma entrega aguardando aprovação.</div>`;
 return items.map(({p,f})=>{const last=f.outputs.at(-1),real=f.outputs.some(o=>o.simulated===false),cost=realOutputs(f).reduce((s,o)=>s+(o.costUsd||0),0);return`<button class="home-review" data-action="home-open-review" data-id="${E(f.id)}" data-project="${E(p.id)}"><span class="plan-key">${E(f.key)}</span><span class="grow"><strong>${E(f.title)}</strong><small>${E(p.name)} / ${E(agentById(last?.agentId)?.name||'sem entrega')}${cost?' / '+money(cost):''}</small></span><span class="tag ${real?'accent':''}">${real?'CLAUDE':'DEMO'}</span>${icon('chevron')}</button>`;}).join('');
}
function homeActivityHTML(){
 const rows=state.projects.flatMap(p=>p.logs.map(l=>({p,l}))).sort((x,y)=>y.l.at.localeCompare(x.l.at)).slice(0,14);
 if(!rows.length)return`<div class="home-empty">${icon('radio')}Canal em silêncio.</div>`;
 return rows.map(({p,l})=>`<div class="home-activity"><time>${clock(l.at)}</time><span class="home-activity-body"><strong>${E(p.code)} / ${E(agentById(l.agentId)?.name||'SISTEMA')}</strong><span>${E(l.message)}</span></span><span class="tag ${l.simulated?'':'accent'}">${l.simulated?'DEMO':'CLAUDE'}</span></div>`).join('');
}
function renderHome(){
 const root=$('#homeView');if(!root)return;const scroll=root.scrollTop;
 const review=state.projects.reduce((n,p)=>n+p.features.filter(f=>f.status==='review').length,0);
 const today=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
 const keepUsage=$('#homeUsage');
 root.innerHTML=`<div class="home-inner"><header class="home-head"><div><div class="eyebrow">SQUAD CODE / ${E(today)}</div><h1>PAINEL <span>GERAL.</span></h1><p>${state.projects.length} operação(ões), ${state.agents.length} agentes${review?`, <strong>${review} entrega(s) aguardando sua aprovação</strong>`:''}.</p></div><div class="flex wrap home-actions"><button class="btn ghost" data-action="agent-new">${icon('plus')}Novo agente</button><button class="btn ghost" data-action="project-new">${icon('project')}Nova operação</button><button class="btn primary" data-action="view" data-view="network">${icon('arrow')}Abrir rede do squad</button></div></header>
<section class="home-section home-projects-wrap"><div class="home-section-head"><span>OPERAÇÕES</span><span>${pad(state.projects.length)}</span></div><div class="home-projects">${state.projects.map(homeProjectCard).join('')}<button class="home-project new" data-action="project-new">${icon('plus')}<strong>Nova operação</strong><small>Nome do projeto e squad.</small></button></div></section><section class="home-section home-squads-wrap"><div class="home-section-head"><span>SQUADS</span><span class="flex">${pad(state.squads.length)}<button class="link-button" data-action="squad-studio">SQUAD STUDIO ${icon('chevron')}</button></span></div><div class="home-squads">${homeSquadsHTML()}</div></section>
<section class="home-section home-usage-wrap" id="homeUsage" aria-label="Uso dos perfis"></section>
<div class="home-grid"><section class="home-section"><div class="home-section-head"><span>OPERAÇÃO ATIVA</span>${runner?'<i class="dot"></i>':''}</div>${homeRunHTML()}<div class="home-section-head" style="margin-top:22px"><span>AGUARDANDO REVISÃO</span><span>${pad(review)}</span></div><div class="home-list">${homeReviewHTML()}</div></section>
<section class="home-section"><div class="home-section-head"><span>ATIVIDADE RECENTE</span><button class="link-button" data-action="logs">VER TRANSMISSÕES ${icon('chevron')}</button></div><div class="home-list home-activity-list">${homeActivityHTML()}</div></section></div></div>`;
 {const slot=$('#homeUsage');if(keepUsage&&slot&&keepUsage!==slot)slot.replaceWith(keepUsage);else delete opsSig.homeUsage;}renderHomeUsage();
 root.scrollTop=scroll;
}
/* PROJETOS page: operations list + inline briefing + features of the active operation.
   Each block re-renders only when the data it shows changes, so background renders never wipe what is being typed. */
const opsSig={};
function opsBlock(id,sig,html){const el=document.getElementById(id);if(!el||opsSig[id]===sig)return;opsSig[id]=sig;el.innerHTML=html();}
const PRIORITIES=[['P0','P0 / Essencial'],['P1','P1 / Importante'],['P2','P2 / Incremento']];
function renderProjectsPage(){
 const root=$('#projectsView');if(!root)return;
 if(!root.querySelector('#opsList')){Object.keys(opsSig).forEach(k=>delete opsSig[k]);root.innerHTML=`<div class="home-inner ops-inner"><header class="home-head"><div><div class="eyebrow">SQUAD CODE / WORKSPACE</div><h1>PROJETOS <span>& OPERAÇÕES.</span></h1><p>Crie operações, escreva o briefing e defina as features que o squad vai desenvolver.</p></div><div class="flex wrap home-actions"><button class="btn primary" data-action="project-new">${icon('plus')}Nova operação</button></div></header><div class="ops-layout"><aside class="ops-list" id="opsList" aria-label="Operações"></aside><div class="ops-main"><div id="opsHeader"></div><section class="ops-section" id="opsBriefing" aria-label="Briefing"></section><section class="ops-section" id="opsFeatures" aria-label="Features"></section></div></div></div>`;}
 const p=project(),creating=!!ui.opsNew,cur=creating?ui.opsNew:p;
 opsBlock('opsList',JSON.stringify([state.projectId,creating,state.projects.map(x=>[x.id,x.code,x.name,squadById(x.squadId)?.name,x.features.length,x.features.filter(f=>f.status==='done').length])]),()=>`<div class="ops-list-head"><span>OPERAÇÕES</span><span>${pad(state.projects.length)}</span></div>${state.projects.map(x=>{const done=x.features.filter(f=>f.status==='done').length,on=!creating&&x.id===state.projectId;return`<button class="ops-item ${on?'active':''}" data-action="ops-select" data-id="${E(x.id)}" aria-pressed="${on}"><span class="between"><span class="eyebrow">${E(x.code)}</span>${x.id===state.projectId?'<span class="tag accent">ATIVA</span>':''}</span><strong>${E(x.name)}</strong><small>${E(squadById(x.squadId)?.name||'SEM SQUAD')} · ${done}/${x.features.length} FEATURES</small><i class="ops-progress"><b style="width:${x.features.length?Math.round(done/x.features.length*100):0}%"></b></i></button>`;}).join('')}<button class="ops-item new ${creating?'active':''}" data-action="project-new">${icon('plus')}<strong>NOVA OPERAÇÃO</strong></button>`);
 opsBlock('opsHeader',JSON.stringify([creating,cur.id,cur.code,cur.name,cur.agentIds.length,cur.features.length,!!runner]),()=>`<div class="ops-title"><div><span class="eyebrow">${E(cur.code)} / ${creating?'NOVA OPERAÇÃO':'OPERAÇÃO ATIVA'}</span><h2>${E(cur.name||'Nova operação')}</h2><div class="ops-badges"><span class="tag accent">${E(squadById(cur.squadId)?.name||'SEM SQUAD')}</span><span class="tag">${cur.agentIds.length} AGENTES</span><span class="tag">${cur.features.length} FEATURES</span>${creating?'':`<span class="tag">PASTA projects/${E(cur.folder)}</span>`}${runner&&!creating?'<span class="tag accent">EM EXECUÇÃO</span>':''}</div></div>${creating?'':`<div class="flex wrap"><button class="btn primary" data-action="ops-open-squad">${icon('squad')}Abrir no squad</button><button class="btn" data-action="project-export" data-id="${E(cur.id)}" title="Exporta a versão salva para o Claude Code: CLAUDE.md, docs/ (project, architecture, standards e uma pasta por feature), .claude/agents/, .claude/commands/ e .claude/settings.json">${icon('download')}Exportar</button><button class="btn danger" data-action="project-delete" data-id="${E(cur.id)}">${icon('trash')}Excluir</button></div>`}</div>`);
 opsBlock('opsBriefing',JSON.stringify([creating,cur.id,creating?0:[p.name,p.briefing,p.squadId,p.vision,p.scopeIn,p.scopeOut,p.glossary,p.architecture,JSON.stringify(p.adrs||[])],state.squads.map(q=>[q.id,q.name,q.commanderId,q.agentIds]),state.agents.map(a=>[a.id,a.name,a.role,a.image.length])]),()=>`<div class="ops-section-head"><div><span class="eyebrow">01 / BRIEFING</span><h3>Contexto da operação</h3></div>${teamsCtaHTML(docAgents('kickoff',squadById(cur.squadId)))}</div>${projectFormHTML(cur,creating)}<div class="ops-form-actions">${creating?`<button class="btn" type="button" data-action="ops-cancel-new">Cancelar</button>`:''}<button class="btn primary" type="submit" form="projectForm">${icon('check')}${creating?'Criar operação':'Salvar projeto'}</button></div>`);
 opsBlock('opsFeatures',creating?'new':'board:'+p.id,()=>{['opsFeaturesHead','opsPlan','opsFeatureList','opsFeatureDetail'].forEach(k=>delete opsSig[k]);return creating?`<div class="ops-section-head"><div><span class="eyebrow">02 / FEATURES</span><h3>O que será desenvolvido</h3></div></div><p class="hint">Liste as features iniciais no briefing acima (uma por linha). Depois de criar a operação, você poderá adicionar, priorizar e distribuir as features aqui.</p>`:`<div id="opsFeaturesHead"></div><div id="opsPlan"></div><div class="ops-features-body" id="opsFeatBody"><div id="opsFeatureList" class="ops-feature-list"></div><aside id="opsFeatureDetail" class="ops-detail" aria-label="Detalhe da feature"></aside></div>`;});
 if(!creating)renderOpsFeatures(p);
}
function renderOpsFeatures(p){
 const cur=currentSprint(p),runSprint=runner?sprintById(runner.sprintId,p):null,runLabel=runner?(['planning','awaiting'].includes(runner.phase)?runControl().label:`${runControl().label} ${runner.kind==='feature'?'feature':runSprint?.name||'operação'}`):`${liveMode()?'Executar':'Simular'} ${cur?.name||'sprint'}`,view=ui.opsFeatView,gaps=projectGaps(p);
 opsBlock('opsFeaturesHead',JSON.stringify([p.id,!!runner,!!runner?.paused,runner?.phase,roomOf(p).messages.length>0,runner?.sprintId,runner?.kind,cur?.id,cur?.name,view,liveMode(),gaps]),()=>`<div class="ops-section-head"><div><span class="eyebrow">02 / SPRINTS E FEATURES</span><h3>O que será desenvolvido</h3></div><div class="flex wrap"><button class="btn" data-action="sprint-new" ${runner?'disabled':''}>${icon('plus')}Nova sprint</button><button class="btn" data-action="feature-new" ${runner?'disabled':''}>${icon('plus')}Nova feature</button><button class="btn" data-action="distribute" ${runner?'disabled':''}>${icon('flow')}Distribuir features</button><button class="btn primary" data-action="run" title="${runner?'':`Executa a sprint atual (${E(cur?.name||'')}): a primeira com features pendentes`}">${icon(runner?runControl().icon:'play')}${E(runLabel)}</button>${runner?`<button class="btn danger" data-action="stop">${icon('stop')}Encerrar</button>`:''}${runner||roomOf(p).messages.length?`<button class="btn ghost" data-action="room">${icon('chat')}Chat da operação</button>`:''}</div></div>${gaps.length&&!runner?`<div class="notice warning ops-run-gate">${icon('lock')}<span><strong>Execução bloqueada.</strong> Nenhuma sprint ou feature roda até todos os campos do projeto estarem preenchidos e salvos. Falta: ${E(gaps.join(', '))}.</span><button class="btn ghost sm" data-action="briefing">${icon('edit')}Completar projeto</button></div>`:''}<div class="ops-feature-tools"><div class="search-box">${icon('search')}<input id="featureSearch" type="search" placeholder="Buscar features..." value="${E(ui.featureQuery)}" aria-label="Buscar features"></div><div class="ops-segmented" role="group" aria-label="Modo de visualização"><button class="${view==='list'?'active':''}" data-action="ops-feat-view" data-view="list" aria-pressed="${view==='list'}">${icon('settings')}Lista</button><button class="${view==='board'?'active':''}" data-action="ops-feat-view" data-view="board" aria-pressed="${view==='board'}">${icon('board')}Quadro</button></div></div>`);
 const plan=ui.opsPlan;
 opsBlock('opsPlan',plan?JSON.stringify([p.id,plan.valid,plan.total,plan.html.length,plan.scopeLabel||'']):'',()=>plan?`<section class="ops-plan"><div class="ops-section-head"><div><span class="eyebrow">PLANO DO COMANDANTE / ${E(plan.commander)}</span><h3>${plan.scopeLabel?`Distribuição / ${E(plan.scopeLabel)}`:'Distribuição de responsabilidades'}</h3></div><span class="footer-note">${plan.valid} / ${plan.total} ROTAS COMPLETAS</span></div>${plan.html}<div class="ops-detail-actions"><button class="btn" data-action="ops-plan-discard">${icon('close')}Descartar</button><button class="btn ${plan.scope?'':'primary'}" data-action="plan-apply" ${plan.valid?'':'disabled'}>${icon('check')}Aplicar plano</button>${plan.scope?`<button class="btn primary" data-action="plan-apply" data-run="1" ${plan.valid?'':'disabled'}>${icon('play')}Aplicar e executar</button>`:''}</div></section>`:'');
 const q=ui.featureQuery.toLowerCase(),match=f=>!q||`${f.title} ${f.key} ${SCOPES[f.scope]}`.toLowerCase().includes(q);
 opsBlock('opsFeatureList',JSON.stringify([p.id,view,q,ui.opsFeature,!!runner,runner?.sprintId,!!runner?.paused,runner?.phase,runner?.kind,p.sprints.map(s=>[s.id,s.name,s.goal,ui.sprintOpen[s.id]]),p.features.map(f=>[f.id,f.key,f.title,f.scope,f.priority,f.status,f.route,f.dependencies,f.sprintId])]),()=>{
  if(view==='board')return`<div class="kanban ops-kanban">${kanbanHTML()}</div>`;
  const row=(f,i=0)=>{const blocked=f.status==='blocked'||(f.status==='ready'&&!depsReady(f,p)),runTitle=f.status==='backlog'?'Executar esta feature (mostra o plano de distribuição antes)':blocked?blockedWhy(f,p):'Executar só esta feature';return`<div class="sprint-node st-${f.status}" style="--i:${i}"><div class="ops-feature ${ui.opsFeature===f.id?'selected':''}"${runner||f.setup?'':` draggable="true" data-feature="${E(f.id)}"`}><span class="ops-key">${E(f.key)}</span><button class="grow ops-feature-open" data-action="feature-open" data-id="${E(f.id)}"><strong>${E(f.title)}</strong><small>${E(SCOPES[f.scope]||f.scope)}${f.dependencies.length?` · ${f.dependencies.length} dependência(s)`:''}</small></button><span class="tag">${E(f.priority)}</span><span class="ops-status s-${f.status}">${E(STATUS[f.status].toUpperCase())}</span><div class="mini-faces">${f.route.map(agentById).filter(Boolean).slice(0,6).map(a=>`<img src="${portrait(a)}" alt="${E(a.name)}" title="${E(a.name)}">`).join('')||'<small class="muted">SEM ROTA</small>'}</div>${['backlog','ready','blocked'].includes(f.status)?`<button class="icon-button small ops-run ${blocked?'is-blocked':''}" data-action="feature-run" data-id="${E(f.id)}" aria-label="Executar ${E(f.key)}" title="${E(runTitle)}" ${runner?'disabled':''}>${icon(blocked?'lock':'play')}</button>`:''}<button class="icon-button small" data-action="feature-open" data-id="${E(f.id)}" aria-label="Abrir ${E(f.key)}" title="${['done','review','running'].includes(f.status)?'Ver entrega / revisar':'Editar / detalhar'}">${icon(['done','review','running'].includes(f.status)?'eye':'edit')}</button>${f.setup?'':`<button class="icon-button small" data-action="feature-delete" data-id="${E(f.id)}" aria-label="Excluir ${E(f.key)}" title="Excluir" ${runner?'disabled':''}>${icon('trash')}</button>`}</div></div>`;};
  const sprintHTML=s=>{const fs=sprintFeatures(s,p),shown=fs.filter(match);if(q&&!shown.length)return'';const done=fs.filter(f=>f.status==='done').length,review=fs.filter(f=>f.status==='review').length,complete=!!fs.length&&done===fs.length,isOpen=!!q||!!ui.sprintOpen[s.id],drawing=isOpen&&!q&&ui.sprintDraw===s.id,running=!!runner&&runner.sprintId===s.id,pct=fs.length?Math.round(done/fs.length*100):0;
   return`<section class="sprint${isOpen?'':' collapsed'}${drawing?' drawing':''}${running?' running':''}${complete?' complete':''}" data-sprint="${E(s.id)}"><header class="sprint-head"><button class="sprint-toggle" data-action="sprint-toggle" data-id="${E(s.id)}" aria-expanded="${isOpen}">${sprintCubeSVG()}<span class="fe-chev"></span><span class="sprint-code">${sprintCode(s,p)}</span><span class="sprint-title"><strong>${E(s.name)}</strong>${s.goal?`<small>${E(s.goal)}</small>`:''}</span></button>`+
    `<span class="sprint-meta">${running?`<span class="tag accent">${runner.paused?'PAUSADA':'EM EXECUÇÃO'}</span>`:s===cur&&!complete&&!runner?'<span class="tag accent">ATUAL</span>':''}${review?`<span class="tag">${pad(review)} EM REVISÃO</span>`:''}<span class="sprint-count" title="Concluídas / total">${pad(done)}/${pad(fs.length)}</span><i class="ops-progress"><b style="width:${pct}%"></b></i></span>`+
    `<span class="sprint-actions">${running?`<button class="btn sm" data-action="run">${icon(runControl().icon)}${runControl().label}</button>`:`<button class="btn sm ${s===cur&&!runner?'primary':''}" data-action="sprint-run" data-id="${E(s.id)}" ${runner||!fs.length||complete?'disabled':''} title="${complete?'Sprint concluída':!fs.length?'Sprint sem features':`Executar as features de ${E(s.name)}`}">${icon('play')}Executar sprint</button>`}<button class="icon-button small" data-action="feature-new" data-sprint="${E(s.id)}" aria-label="Nova feature em ${E(s.name)}" title="Nova feature nesta sprint" ${runner?'disabled':''}>${icon('plus')}</button><button class="icon-button small" data-action="sprint-edit" data-id="${E(s.id)}" aria-label="Editar ${E(s.name)}" title="Editar sprint" ${runner?'disabled':''}>${icon('edit')}</button><button class="icon-button small" data-action="sprint-delete" data-id="${E(s.id)}" aria-label="Excluir ${E(s.name)}" title="${p.sprints.length<2?'Toda operação precisa de pelo menos uma sprint':'Excluir sprint (só vazia)'}" ${runner||p.sprints.length<2?'disabled':''}>${icon('trash')}</button></span></header>`+
    `<div class="sprint-body" style="--n:${shown.length}">${shown.map(row).join('')||`<div class="sprint-empty">${runner?'Nenhuma feature nesta sprint.':'Arraste features para cá ou crie uma nova com o botão +.'}</div>`}</div></section>`;};
  const html=p.sprints.map(sprintHTML).join('');
  return`<div class="ops-sprints">${html||`<div class="mission-empty">${q?'Nenhuma feature encontrada para a busca.':'Nenhuma sprint ainda. Clique em Nova sprint para criar a primeira.'}</div>`}</div>`;
 });
 // Detail panel: editable form for pending features, delivery review for running/review/done.
 // Pending features are edited in the modal editor (openFeatureEditor); this panel only reviews deliveries.
 let key=ui.opsFeature,f=key&&key!=='new'?featureById(key):null;
 if(key&&(!f||!['done','review','running'].includes(f.status))){ui.opsFeature=key=null;f=null;}
 const body=$('#opsFeatBody');if(body)body.classList.toggle('with-detail',!!key);
 opsBlock('opsFeatureDetail',!key?'':JSON.stringify(['review',key,f.status,f.outputs.length]),()=>{
  if(!key)return'';
  return`<div class="ops-detail-head"><div><span class="eyebrow">${E(project().code)} / ${E(f.key)}</span><h3>Revisão de entrega</h3></div><button class="icon-button small" data-action="ops-feature-close" aria-label="Fechar detalhe">${icon('close')}</button></div>`+reviewHTML(f);
 });
}
/* SQUAD STUDIO: every squad has a chain of command — 1 COMANDANTE, 2 RECONHECEDORES (1 ADR + 1 PRD) and N OPERADORES.
   Operations use one whole squad and mirror its members in p.agentIds / p.commanderId (applySquad), so the runner and the map keep reading the project. */
const SQUAD_SLOTS={commander:{label:'COMANDANTE',short:'CMD',role:'commander'},adr:{label:'RECONHECEDOR ADR',short:'ADR',role:'architect'},prd:{label:'RECONHECEDOR PRD',short:'PRD',role:'po'},op:{label:'OPERADOR',short:'OPS',role:'backend'}};
const slotFits=(slot,a)=>!!a&&(slot==='op'?a.role!=='commander':a.role===SQUAD_SLOTS[slot].role);
const squadById=id=>state.squads.find(q=>q.id===id);
const projectsOfSquad=q=>state.projects.filter(p=>p.squadId===q.id);
const squadMembers=q=>[...new Set([q.commanderId,q.adrId,q.prdId,...(q.operatorIds||[])].filter(x=>x&&agentById(x)))];
const squadCommanderOk=q=>!!q&&agentById(q.commanderId)?.role==='commander';
function squadMissing(q,withName=true){const m=[];if(withName&&!String(q.name||'').trim())m.push('nome');if(!slotFits('commander',agentById(q.commanderId)))m.push('comandante');if(!slotFits('adr',agentById(q.adrId)))m.push('agente de ADR');if(!slotFits('prd',agentById(q.prdId)))m.push('agente de PRD');if(!(q.operatorIds||[]).some(x=>slotFits('op',agentById(x))))m.push('ao menos 1 operador');return m;}
const squadComplete=q=>!squadMissing(q).length;
function squadSlotsOf(agentId){const out=[];for(const q of state.squads){if(q.commanderId===agentId)out.push({squad:q,slot:'commander'});if(q.adrId===agentId)out.push({squad:q,slot:'adr'});if(q.prdId===agentId)out.push({squad:q,slot:'prd'});if((q.operatorIds||[]).includes(agentId))out.push({squad:q,slot:'op'});}return out.map(h=>({...h,label:SQUAD_SLOTS[h.slot].label}));}
// A new agent created on the map joins its squad: operator, or the ADR/PRD seat when it is free; a second commander has no seat (null).
function squadJoinSlot(q,a){if(a.role==='commander')return squadCommanderOk(q)?null:'commander';if(a.role==='architect'&&!slotFits('adr',agentById(q.adrId)))return 'adr';if(a.role==='po'&&!slotFits('prd',agentById(q.prdId)))return 'prd';return 'op';}
function squadJoin(q,slot,agentId){if(slot==='op'){q.operatorIds=(q.operatorIds||[]).filter(x=>x!==agentId).concat(agentId);}else if(SQUAD_SLOTS[slot])q[slot+'Id']=agentId;}
function applySquad(p,q){q.agentIds=squadMembers(q);const next=q.agentIds;p.agentIds.filter(a=>!next.includes(a)).forEach(a=>invalidateAgentRoutes(p,a));p.squadId=q.id;p.agentIds=[...next];p.commanderId=squadCommanderOk(q)?q.commanderId:'';}
function syncSquad(q){q.agentIds=squadMembers(q);projectsOfSquad(q).forEach(p=>applySquad(p,q));}

/* Ready-made agents for each position; picking one reuses the workspace agent with that codename or creates it. */
const AGENT_PRESETS={
 commander:[
  {name:'VANGUARD',role:'commander',icon:'crown',model:'opus',description:'Líder metódico. Decompõe o briefing em um plano claro, respeita dependências e delega cada feature ao operador certo.',style:'Lidere com planejamento calmo e metódico. Prefira incrementos pequenos e verificáveis e critérios de aceitação explícitos.'},
  {name:'ABELHA-RAINHA',role:'commander',icon:'bee',model:'opus',description:'Coordena a colmeia em paralelo: distribui várias frentes ao mesmo tempo e mantém todos sincronizados.',style:'Coordene como uma colmeia: maximize o trabalho paralelo seguro entre os operadores e mantenha cada handoff sincronizado.'},
  {name:'PROFETA',role:'commander',icon:'compass',model:'opus',description:'Explorador pragmático. Abre caminho em projetos novos, testa hipóteses rápido e ajusta a rota no campo.',style:'Aja como um desbravador pragmático: valide as premissas cedo, corte escopo sem medo e ajuste a rota conforme aprende.'},
  {name:'ZERO',role:'commander',icon:'zero',model:'opus',description:'Estrategista de inteligência. Comanda pelo rádio: define objetivos, riscos e prioridades antes de qualquer execução.',style:'Comande como um oficial de inteligência: defina objetivos, riscos e prioridades primeiro e depois passe a cada operador um briefing preciso.'}
 ],
 adr:[
  {name:'ATLAS',role:'architect',icon:'layers',description:'Registra decisões de arquitetura (ADR): módulos, contratos de API, modelo de dados e trade-offs.'},
  {name:'BLUEPRINT',role:'architect',icon:'flow',description:'Arquiteto de integrações. Documenta ADRs de fluxo, eventos e fronteiras entre serviços.'},
  {name:'LEDGER',role:'architect',specialty:'Arquitetura de dados',icon:'database',conv:{template:'adr-tyree',subsets:['data-quality','lgpd']},description:'Arquiteto de dados. Registra em ADR onde e como os dados vivem: escolha do banco (SQLite, Postgres, Supabase), modelagem, consistência, multi-tenant, retenção e backup.',style:'Decida pelo dado: volume, padrão de acesso, consistência exigida e quem pode ver o quê. Compare ao menos duas opções de armazenamento e registre premissas, restrições e o plano de migração de cada decisão.'},
  {name:'KEYSTONE',role:'architect',specialty:'Domínio (DDD)',icon:'puzzle',conv:{template:'adr-madr',subsets:['hexagonal']},description:'Arquiteto de domínio (DDD). Desenha bounded contexts, agregados e o context map, e registra cada fronteira em ADR com a linguagem do negócio.',style:'Comece pela linguagem do negócio: nomeie contextos e agregados com os termos do glossário, mantenha cada invariante dentro de um agregado e registre cada integração entre contextos com o padrão escolhido (camada anticorrupção, eventos ou shared kernel).'},
  {name:'SKYLINE',role:'architect',specialty:'Plataforma e qualidade',icon:'cloud',conv:{template:'adr-business',subsets:['observability','resilience']},description:'Arquiteto de plataforma. Decide nuvem, custos e atributos de qualidade (performance, disponibilidade, escalabilidade) e registra cada escolha em ADR com critérios pesados.',style:'Transforme requisitos não funcionais em metas mensuráveis (latência p95, disponibilidade, custo mensal) antes de escolher tecnologia, compare os candidatos numa matriz com pesos e registre custos e riscos de cada opção.'},
  {name:'BASTION',role:'architect',specialty:'Segurança',icon:'guard',conv:{template:'adr-merson',subsets:['security-owasp','secrets','lgpd']},description:'Arquiteto de segurança. Modela ameaças (STRIDE), define autenticação, autorização, segredos e LGPD, e registra cada controle em ADR com justificativa.',style:'Para cada fluxo sensível, modele as ameaças com STRIDE antes de decidir. Prefira controles seguros por padrão, menor privilégio e defesa em profundidade, e registre a justificativa e o risco residual de cada controle.'}
 ],
 prd:[
  {name:'ECHO',role:'po',icon:'file',description:'Escreve o PRD: histórias de usuário, escopo e critérios de aceitação verificáveis.'},
  {name:'SCOUT',role:'po',icon:'search',description:'Reconhecimento de produto. Investiga usuários e requisitos e transforma tudo em um PRD objetivo.'}
 ],
 op:[
  {name:'FORGE',role:'backend',icon:'code'},{name:'PIXEL',role:'frontend',icon:'screen'},{name:'SENTINEL',role:'qa',icon:'shield'},
  {name:'VAULT',role:'dba',icon:'database'},{name:'SHARPSHOOTER',role:'dotnet',icon:'csharp'},{name:'ESPRESSO',role:'java',icon:'java'},
  {name:'NODE RUNNER',role:'node',icon:'node'},{name:'ATOMIC',role:'react',icon:'react'},{name:'AEGIS',role:'angular',icon:'angular'},
  {name:'DEPLOYER',role:'devops',icon:'server'}
 ]
};
/* Operators are picked in two steps: category -> sub-specialist. The first preset of every category is its generalist. */
const OP_CATEGORIES=[
 {key:'backend',label:'Backend',icon:'code',roles:['backend','node','java','dotnet'],description:'APIs, regras de negócio, integrações, persistência e BaaS.',presets:[
  {name:'FORGE',role:'backend',icon:'code'},
  {name:'NODE RUNNER',role:'node',icon:'node'},
  {name:'ESPRESSO',role:'java',icon:'java'},
  {name:'SHARPSHOOTER',role:'dotnet',icon:'csharp'},
  {name:'VIPER',role:'backend',specialty:'Python / FastAPI',icon:'python',description:'Serviços e APIs em Python (FastAPI, Django) com tipagem, testes e boas práticas.'},
  {name:'RAPTOR',role:'backend',specialty:'Go',icon:'go',description:'Serviços concorrentes e performáticos em Go, com testes e observabilidade.'},
  {name:'PHANTOM',role:'backend',specialty:'PHP / Laravel',icon:'php',description:'Aplicações e APIs em PHP moderno (Laravel), com testes e padrões PSR.'},
  {name:'VOLT',role:'backend',specialty:'Supabase',icon:'supabase',description:'Especialista em Supabase: Postgres, RLS, Auth, Storage, Edge Functions e Realtime com migrações versionadas.',style:'Trate o Postgres como fonte da verdade: toda mudança de schema é uma migração, a RLS fica ativa em toda tabela exposta, as policies são testadas e a chave service_role nunca chega ao cliente.'},
  {name:'BLAZE',role:'backend',specialty:'Firebase',icon:'firebase',description:'Especialista em Firebase: Firestore, Auth, Security Rules, Cloud Functions e Emulator Suite.',style:'As Security Rules são o backend de verdade: negue por padrão, valide toda escrita nas regras, teste regras e functions no Emulator Suite e nunca confie no cliente.'}]},
 {key:'frontend',label:'Frontend',icon:'screen',roles:['frontend','react','angular'],description:'Interfaces, componentes, estados e acessibilidade.',presets:[
  {name:'PIXEL',role:'frontend',icon:'screen'},
  {name:'VANILLA',role:'frontend',specialty:'HTML + CSS + JS',icon:'js',description:'Interfaces sem framework: HTML semântico, CSS moderno e JavaScript vanilla.'},
  {name:'ATOMIC',role:'react',icon:'react'},
  {name:'AEGIS',role:'angular',icon:'angular'},
  {name:'VERTEX',role:'frontend',specialty:'Vue.js',icon:'vue',description:'Aplicações em Vue 3 com Composition API, Pinia e componentes acessíveis.'},
  {name:'NEXUS',role:'frontend',specialty:'Next.js',icon:'nextjs',description:'Aplicações Next.js com SSR/SSG, rotas, performance e SEO.'}]},
 {key:'dba',label:'Banco de Dados',icon:'database',roles:['dba'],description:'Modelagem, migrações, consultas e performance de dados, do SQLite embutido ao Supabase.',presets:[
  {name:'VAULT',role:'dba',icon:'database'},
  {name:'TUSK',role:'dba',specialty:'PostgreSQL',icon:'postgres',description:'Especialista em PostgreSQL: schemas, índices, planos de execução e migrações seguras.'},
  {name:'MARLIN',role:'dba',specialty:'MySQL',icon:'mysql',description:'Especialista em MySQL/MariaDB: modelagem, replicação e otimização de consultas.'},
  {name:'MONGOOSE',role:'dba',specialty:'MongoDB',icon:'mongodb',description:'Especialista em MongoDB: modelagem de documentos, índices e agregações.'},
  {name:'REDLINE',role:'dba',specialty:'Redis',icon:'redis',description:'Especialista em Redis: cache, filas, locks e estruturas de dados em memória.'},
  {name:'FEATHER',role:'dba',specialty:'SQLite',icon:'sqlite',conv:{template:'db-sqlite',subsets:['migrations']},description:'Especialista em SQLite: schema enxuto, WAL, PRAGMAs, FTS5 e JSON, migrações versionadas e backups para apps com banco embutido e servidores pequenos.',style:'Trate o arquivo SQLite como produção: modo WAL, foreign_keys ligado em toda conexão, um escritor por vez, transações explícitas, migrações controladas por user_version e backup pela API de backup, nunca copiando o arquivo aberto.'},
  {name:'QUILL',role:'dba',specialty:'SQLite na borda (Turso / libSQL / D1)',icon:'globe',conv:{template:'db-sqlite',subsets:['migrations']},description:'SQLite distribuído na borda com Turso/libSQL e Cloudflare D1: réplicas embutidas, latência baixa, migrações por ambiente e os limites de cada plataforma.',style:'Conheça os limites da plataforma (tamanho do banco, transações, consistência das réplicas) antes de modelar. Leituras perto do usuário, escritas no primário, e migrações aplicadas pelo CLI em cada ambiente, nunca à mão.'},
  {name:'PEBBLE',role:'dba',specialty:'SQLite offline-first (apps e sync)',icon:'phone',conv:{template:'db-sqlite',subsets:['migrations']},description:'SQLite no dispositivo e no navegador (Expo SQLite, Room, GRDB, wa-sqlite com OPFS): esquema local, migrações no app, fila de sincronização e resolução de conflitos.',style:'O app funciona sem rede: grave local primeiro e sincronize depois com uma fila idempotente, defina a regra de conflito por entidade, versione o esquema do dispositivo e nunca perca dado do usuário numa migração.'},
  {name:'KEEL',role:'dba',specialty:'Supabase Postgres e migrações',icon:'supabase',conv:{template:'sb-db',subsets:['migrations']},description:'Schema do Supabase pelo CLI: migrações versionadas, funções RPC atômicas, índices, pooler e tipos gerados para o app.',style:'Nenhuma mudança pelo dashboard: todo schema nasce em supabase/migrations, é testado com db reset local e chega aos ambientes pelo CI. Consulta lenta só ganha índice com um EXPLAIN que o justifique.'},
  {name:'GATEKEEPER',role:'dba',specialty:'Supabase RLS e Auth',icon:'lock',conv:{template:'sb-rls',subsets:['supabase-rls']},description:'Segurança de dados no Supabase: RLS em toda tabela exposta, policies por operação, Auth (provedores, MFA e claims) e testes de policy com pgTAP.',style:'Negue por padrão: RLS ligada antes da primeira linha, uma policy por operação usando auth.uid(), claims customizadas pelo hook de Auth e cada policy coberta por teste de dono, de outro usuário e de anônimo.'},
  {name:'SURGE',role:'dba',specialty:'Supabase Edge Functions e Realtime',icon:'lightning',conv:{template:'sb-edge'},description:'Edge Functions em Deno, webhooks do banco, filas (pgmq), agendamentos (pg_cron), Realtime e Storage com policies.',style:'Cada função valida o JWT e roda como o usuário sempre que possível. Trabalho pesado vai para a fila, agendamentos ficam versionados em migração e canais Realtime só transmitem o que a RLS permite.'},
  {name:'ORBIT',role:'dba',specialty:'Supabase Vector (pgvector)',icon:'satellite',conv:{template:'sb-db'},description:'Busca semântica no Supabase com pgvector: embeddings, índices HNSW, busca híbrida com texto e RPC de similaridade protegida por RLS.',style:'Fixe o modelo e a dimensão dos embeddings numa migração, indexe com HNSW, combine com busca textual quando fizer sentido e meça a qualidade dos resultados antes de ajustar parâmetros.'}]},
 {key:'devops',label:'DevOps / Cloud',icon:'server',roles:['devops'],description:'Build, CI/CD, containers, infraestrutura e observabilidade.',presets:[
  {name:'DEPLOYER',role:'devops',icon:'server'},
  {name:'KRAKEN',role:'devops',specialty:'Docker / Kubernetes',icon:'kubernetes',description:'Containers, Kubernetes, Helm e operação de clusters.'},
  {name:'STRATUS',role:'devops',specialty:'AWS',icon:'aws',description:'Infraestrutura na AWS: redes, computação, IAM e custos.'},
  {name:'CERULEAN',role:'devops',specialty:'Azure',icon:'azure',description:'Infraestrutura na Azure: App Services, AKS, identidade e redes.'},
  {name:'BEDROCK',role:'devops',specialty:'Terraform / IaC',icon:'terraform',description:'Infraestrutura como código com Terraform, módulos e ambientes versionados.'},
  {name:'PIPELINE',role:'devops',specialty:'CI/CD',icon:'git',description:'Pipelines de build, testes e deploy contínuo com qualidade e segurança.'}]},
 {key:'qa',label:'QA / Testes',icon:'shield',roles:['qa'],description:'Revisão, testes e critérios de aceitação.',presets:[
  {name:'SENTINEL',role:'qa',icon:'shield'},
  {name:'SNIPER',role:'qa',specialty:'Testes E2E',icon:'target',description:'Testes ponta a ponta (Playwright, Cypress) cobrindo os fluxos críticos.'},
  {name:'SCALPEL',role:'qa',specialty:'Testes unitários e integração',icon:'flask',description:'Cobertura de testes unitários e de integração, com casos de borda.'},
  {name:'TEMPO',role:'qa',specialty:'Performance e carga',icon:'lightning',description:'Testes de performance e carga, gargalos e metas de latência.'},
  {name:'BEACON',role:'qa',specialty:'Acessibilidade',icon:'eye',conv:{subsets:['a11y']},description:'Auditoria de acessibilidade (WCAG), leitores de tela e navegação por teclado.'}]},
 {key:'mobile',label:'Mobile',icon:'phone',roles:['mobile'],description:'Apps iOS e Android, offline e performance em dispositivos.',presets:[
  {name:'VALETE',role:'mobile',icon:'phone'},
  {name:'HUMMINGBIRD',role:'mobile',specialty:'Flutter',icon:'flutter',description:'Apps multiplataforma em Flutter/Dart com estado previsível e testes.'},
  {name:'RIPTIDE',role:'mobile',specialty:'React Native',icon:'react',description:'Apps em React Native com navegação, estado e integração nativa.'},
  {name:'SWIFTWING',role:'mobile',specialty:'iOS / Swift',icon:'swift',description:'Apps iOS nativos em Swift/SwiftUI.'},
  {name:'KESTREL',role:'mobile',specialty:'Android / Kotlin',icon:'kotlin',description:'Apps Android nativos em Kotlin/Jetpack Compose.'}]},
 {key:'security',label:'Segurança',icon:'lock',roles:['security'],description:'Ameaças, vulnerabilidades, autenticação e segredos.',presets:[
  {name:'MOTHER WOLF',role:'security',icon:'lock'},
  {name:'INFILTRATOR',role:'security',specialty:'Pentest',icon:'skull',description:'Testes de invasão autorizados: superfície de ataque e exploração controlada.'},
  {name:'WARDEN',role:'security',specialty:'Code review AppSec',icon:'bug',description:'Revisão de código com foco em OWASP, injeções e dependências vulneráveis.'},
  {name:'KEYMASTER',role:'security',specialty:'IAM / Autenticação',icon:'key',description:'Autenticação, autorização, OAuth/OIDC e gestão de segredos.'}]},
 {key:'data',label:'Dados',icon:'chart',roles:['data'],description:'Pipelines, streaming e análise de dados.',presets:[
  {name:'DATABIRD',role:'data',icon:'database'},
  {name:'CONDUIT',role:'data',specialty:'Pipelines / ETL',icon:'flow',description:'Pipelines de ingestão e transformação (ETL/ELT) confiáveis.'},
  {name:'TORRENT',role:'data',specialty:'Kafka / Streaming',icon:'kafka',description:'Streaming de eventos com Kafka: tópicos, consumidores e garantias de entrega.'},
  {name:'INSIGHT',role:'data',specialty:'Analytics / BI',icon:'chart',description:'Métricas, dashboards e modelos analíticos para decisões de produto.'}]},
 {key:'design',label:'Design',icon:'palette',roles:['designer'],description:'Fluxos, wireframes e interfaces acessíveis.',presets:[
  {name:'PRISM',role:'designer',icon:'palette'},
  {name:'CANVAS',role:'designer',specialty:'Figma / UI',icon:'figma',description:'Telas e protótipos no Figma com handoff claro para o frontend.'},
  {name:'MOSAIC',role:'designer',specialty:'Design system',icon:'layers',description:'Tokens, componentes e documentação do design system.'}]},
 {key:'docs',label:'Documentação',icon:'book',roles:['docs'],description:'README, guias, docs de API e changelogs.',presets:[
  {name:'SCRIBE',role:'docs',icon:'book'},
  {name:'LEXICON',role:'docs',specialty:'Docs de API',icon:'braces',description:'Referência de API (OpenAPI), exemplos de requisição e erros.'},
  {name:'GUIDE',role:'docs',specialty:'Tutoriais / Onboarding',icon:'compass',description:'Tutoriais passo a passo e guias de onboarding do projeto.'}]},
 {key:'outros',label:'Outros',icon:'sparkle',roles:['architect','po','pm','custom'],description:'Outros agentes do workspace que também podem operar.',presets:[]}
];
/* Plugins: presets go into their seat (commander/adr/prd) or operator category (plugin categories go before `before`, 'outros' by
   default, or at the end). pluginPresets already refused names of the catalog; checked again against the real lists here. */
function mergePluginPresets(){
 const P=readPlugins();if(!P.plugins.length)return;
 for(const pk of P.plugins)for(const c of pk.categories){
  if(OP_CATEGORIES.some(x=>x.key===c.key))continue; // an existing category (built-in or of another plugin) just receives the agents
  const at=OP_CATEGORIES.findIndex(x=>x.key===(c.before||'outros'));
  OP_CATEGORIES.splice(at<0?OP_CATEGORIES.length:at,0,{key:c.key,label:c.label||c.key,icon:c.icon||'sparkle',roles:[],description:c.description,presets:[],plugin:pk.id});
 }
 const taken=new Set([...AGENT_PRESETS.commander,...AGENT_PRESETS.adr,...AGENT_PRESETS.prd,...OP_CATEGORIES.flatMap(c=>c.presets)].map(x=>x.name));
 for(const p of pluginPresets()){
  if(taken.has(p.name)){pluginWarn(`Agente ${p.name} do plugin ignorado: já existe no catálogo.`);continue;}taken.add(p.name);
  const preset={name:p.name,role:p.role,icon:AGENT_ICONS.includes(p.icon)?p.icon:'',plugin:p.plugin};
  if(p.specialty)preset.specialty=p.specialty;if(p.description)preset.description=p.description;if(p.style)preset.style=p.style;
  if(/^[A-Za-z0-9._\-\[\]]{1,80}$/.test(p.model))preset.model=p.model;if(p.effort&&EFFORTS.includes(p.effort))preset.effort=p.effort;if(p.tools)preset.tools=[...p.tools];
  if(p.conv)preset.conv={...(p.conv.template?{template:p.conv.template}:{}),subsets:[...p.conv.subsets]};
  if(p.slot!=='operator'){AGENT_PRESETS[p.slot].push(preset);continue;}
  let cat=p.category&&OP_CATEGORIES.find(c=>c.key===p.category);
  if(!cat){if(p.category)pluginWarn(`Agente ${p.name}: categoria "${p.category}" não existe; entrou na categoria da especialidade.`);cat=OP_CATEGORIES.find(c=>c.roles.includes(p.role))||OP_CATEGORIES.find(c=>c.key==='outros')||OP_CATEGORIES.at(-1);}
  cat.presets.push(preset);
 }
}
mergePluginPresets();
AGENT_PRESETS.op=OP_CATEGORIES.flatMap(c=>c.presets);
const opCategoryOf=role=>OP_CATEGORIES.find(c=>c.roles.includes(role))?.key||'outros';
// Operator category of an agent: the one holding its template preset (kept across renames in `template`) while the role still matches it,
// so an agent recruited from a plugin category stays there; otherwise the category of its role.
const agentCategory=a=>{if(!a)return'';const p=agentTemplateOf(a),c=p&&p.role===a.role&&OP_CATEGORIES.find(x=>x.presets.includes(p));return c?c.key:opCategoryOf(a.role);};
// Declared (hoisted): migrateCatalogAgents uses it right after the catalog. The coding style lives in the DIRETRIZES (style-* subsets), never here.
function presetPrompt(p){return ROLES[p.role].prompt+(p.style?' '+p.style:'')+(p.specialty?` Especialização: ${p.specialty}. Prefira os padrões, as ferramentas e as boas práticas dessa stack.`:'');}
// SOUL of an agent: its template's soul (catalog codename), or the generic one. Declared (hoisted): used by normalizeWorkspace at load.
function soulKey(a){const n=retiredPresetName(a?.name)||a?.name;return AGENT_SOULS[a?.template]?a.template:AGENT_SOULS[n]?n:'';}
function defaultSoul(a){const s=AGENT_SOULS[soulKey(a)];return s?{soul:s.soul,hellos:[...s.hellos]}:{soul:GENERIC_SOUL.soul,hellos:genericHellos(a?.role,a?.specialty)};}
// Greeting lists still equal to an earlier catalog version (fingerprints in SOUL_HELLOS_PREV) move to the current one; edited lists are kept.
function helloPrint(list){return list.map(h=>String(h).trim().toLowerCase().slice(0,24)).join('|');}
function normalizeHellos(a){const d=defaultSoul(a).hellos,prev=SOUL_HELLOS_PREV[soulKey(a)||'__generic']||[];
 if(Array.isArray(a.hellos)){const l=a.hellos.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,300)).filter(Boolean).slice(0,8);return l.length&&prev.includes(helloPrint(l))?d:l;}
 if(typeof a.hello==='string'){const h=a.hello.trim();if(!h)return[];return d.includes(h)||prev.some(x=>helloPrint([h])===x.split('|')[0])?d:[h.slice(0,300)];}
 return d;}
// A soul still equal to an earlier catalog version (SOUL_PREV) moves to the current one; edited or cleared souls are kept.
function normalizeSoul(a,s){const k=soulKey(a);return k&&(SOUL_PREV[k]||[]).includes(soulHash(s))?AGENT_SOULS[k].soul:s;}
function retiredPresetName(n,role){const r=({NOMAD:['PROFETA','commander'],'ORÁCULO':['ECHO','po']})[n];return r&&(!role||r[1]===role)?r[0]:'';}
/* Template agents: the preset is found by the agent's `template` (kept across renames) or by its codename.
   Catalog presets first, then each specialty's default agent (e.g. PROPHET, the default architect). */
function presetByName(n){
 if(!n)return null;n=retiredPresetName(n)||n; // renamed presets keep their old agents linked
 const p=[...AGENT_PRESETS.commander,...AGENT_PRESETS.adr,...AGENT_PRESETS.prd,...AGENT_PRESETS.op].find(x=>x.name===n);if(p)return p;
 const e=Object.entries(ROLES).find(([,r])=>r.name===n);return e?{name:n,role:e[0]}:null;
}
function agentTemplateOf(a){return presetByName(a?.template)||presetByName(a?.name);}
function presetDefaults(p){
 const r=ROLES[p.role],d={name:p.name,role:p.role,specialty:p.specialty||'',icon:p.icon||'',model:p.model||r.model,effort:p.effort||'',profileId:'',description:p.description||r.description,prompt:presetPrompt(p),tools:p.tools?[...p.tools]:['Read','Glob','Grep',...(['commander','architect','po','qa'].includes(p.role)?[]:['Edit','Write'])],image:'',template:p.name,...defaultSoul({name:p.name})};
 d.conventions=defaultConventions(d,p.conv);return d;
}
// "Restaurar default": refills the studio form with the template values; saving applies them, cancelling discards them.
function restoreAgentDefaults(){
 const d=ui.draft;if(d?.kind!=='agent'||d.isNew)return;const p=agentTemplateOf(d.agent);if(!p)return;
 const def=presetDefaults(p),tab=$('.editor-tab.active')?.dataset.tab||'general';if(codenameTaken(def.name,d.agent.id))def.name=d.agent.name;
 openAgentEditor(d.agent.id,{draft:{...d.agent,...def,profileId:d.agent.profileId||''}});editorTab(tab);
 toast(`Padrões do template ${p.name} restaurados no formulário. Salve para aplicar ou cancele para descartar.`);
}
function createPresetAgent(p){
 if(state.agents.length>=80){toast('Limite de 80 agentes atingido.','error');return null;}
 const r=ROLES[p.role],a={id:id('agent'),...presetDefaults(p),nextId:'',productionStage:'ready',hex:null,linkId:'',desk:''};
 a.hex=nearestFreeHex(validHex(r.hex)?r.hex:{q:0,r:0},takenHexes(),0)||{q:0,r:0};a.desk=firstFreeDesk(takenDesks(),p.role);
 state.agents.push(a);log(`Agente ${a.name} recrutado do catálogo do Squad Studio.`,'agent',a.id);save();return a;
}
/* Catalog migration. Prompts still equal to an earlier catalog version (PROMPT_PREV: soulHash of the prompt -> role:<role> or
   preset:<NAME>; v1 = the English prompts) take the current one; edited prompts are kept. When a catalog prompt changes, add the
   previous fingerprints here (like SOUL_PREV). Once per workspace (settings.catalogVersion < 2), unedited DIRETRIZES (catalog base
   guide, only the preset's own subsets) get the coding style of their stack. Runs here, after the catalog exists (normalizeWorkspace
   runs before AGENT_PRESETS is defined), at load and on import. */
const PROMPT_PREV={"o1wlnx":"role:commander","1pkcuel":"role:po","e8imzs":"role:architect","fd249p":"role:backend","3qow2h":"role:frontend","1pnln5c":"role:qa","1an03j0":"role:pm","pb1tl3":"role:designer","9b6env":"role:mobile","nm2kvn":"role:devops","1k8cq17":"role:security","o3n84l":"role:data","1qlg14d":"role:docs","15i35jf":"role:dba","1ephhds":"role:dotnet","1dek3f6":"role:java","e9xxf5":"role:node","y87tv3":"role:react","136l1wn":"role:angular","co9wyy":"role:custom","dnnx9a":"preset:VANGUARD","nkh1cz":"preset:ABELHA-RAINHA","13xl9dd":"preset:PROFETA","6p6f7z":"preset:ZERO","1inta0d":"preset:VIPER","1cuajam":"preset:RAPTOR","iculh0":"preset:PHANTOM","1b0rv1d":"preset:VOLT","s0sgba":"preset:BLAZE","1iocx15":"preset:VANILLA","x6aq2p":"preset:VERTEX","10xj01q":"preset:NEXUS","1qbt11g":"preset:TUSK","14myodw":"preset:MARLIN","6hkkbs":"preset:MONGOOSE","1yuzkwl":"preset:REDLINE","de395l":"preset:KRAKEN","1ot0cyz":"preset:STRATUS","1atqskh":"preset:CERULEAN","691kmc":"preset:BEDROCK","1frsci8":"preset:PIPELINE","1am8x2h":"preset:SNIPER","15ydpqh":"preset:SCALPEL","wgvpte":"preset:TEMPO","19blymd":"preset:BEACON","1bcm2yo":"preset:HUMMINGBIRD","va3teg":"preset:RIPTIDE","catmc5":"preset:SWIFTWING","qq13b9":"preset:KESTREL","87m21t":"preset:INFILTRATOR","7m763r":"preset:WARDEN","1u2ijeb":"preset:KEYMASTER","15enmzl":"preset:CONDUIT","594jtv":"preset:TORRENT","128m4v6":"preset:INSIGHT","9nh2d7":"preset:CANVAS","1vpxkil":"preset:MOSAIC","sxnjai":"preset:LEXICON","1gm5nh8":"preset:GUIDE"};
function migrateCatalogAgents(ws){
 let changed=false;
 for(const a of ws.agents){
  const k=PROMPT_PREV[soulHash(a.prompt)];if(!k)continue;const cut=k.indexOf(':'),kind=k.slice(0,cut),name=k.slice(cut+1);
  const p=kind==='preset'?presetByName(name):null,next=p?presetPrompt(p):ROLES[name]?.prompt;if(next&&next!==a.prompt){a.prompt=next;changed=true;}
 }
 if((ws.settings.catalogVersion||1)<2){
  for(const a of ws.agents){
   const c=a.conventions;if(!c||(c.subsets||[]).some(s=>String(s.source).startsWith('builtin:style-')))continue;
   const allowed=agentTemplateOf(a)?.conv?.subsets||[],untouched=convTemplateOf(c.family,c.template)?.content===c.base&&(c.subsets||[]).every(s=>{const key=String(s.source).replace(/^builtin:/,'');return String(s.source).startsWith('builtin:')&&allowed.includes(key)&&convSubsetOf(key)?.content===s.content;});
   const add=untouched?codeStyleKeys(a).map(convSubsetOf).filter(Boolean):[];if(!add.length)continue;
   c.subsets=[...add.map(s=>({id:id('conv'),name:s.name,content:s.content,source:'builtin:'+s.key})),...(c.subsets||[])];changed=true;
  }
  ws.settings.catalogVersion=2;changed=true;
 }
 return changed;
}
if(migrateCatalogAgents(state))save();

/* ---------- draft + selection state ---------- */
const blankSquad=()=>({id:id('squad'),name:'',commanderId:'',adrId:'',prdId:'',operatorIds:[],agentIds:[],createdAt:nowISO(),isNew:true});
function squadDraft(){
 const d=ui.squadDraft;if(d&&(d.isNew||(d.id===ui.squadSel&&squadById(d.id))))return d;
 const q=squadById(ui.squadSel)||state.squads[0];ui.squadSel=q?.id||null;ui.squadDraft=q?{...clone(q),isNew:false}:null;return ui.squadDraft;
}
const squadDirty=d=>{if(!d)return false;if(d.isNew)return true;const q=squadById(d.id);return !q||JSON.stringify([q.name,q.commanderId,q.adrId,q.prdId,q.operatorIds])!==JSON.stringify([d.name.trim().toUpperCase(),d.commanderId,d.adrId,d.prdId,d.operatorIds]);};
function openSquadStudio(squadId){
 if(ui.modal)closeModal();
 if(squadId&&squadById(squadId)&&ui.squadSel!==squadId){ui.squadSel=squadId;ui.squadDraft=null;ui.squadPick=null;ui.opPending=null;}
 if(!ui.squadDraft?.isNew&&!squadById(ui.squadSel))ui.squadSel=squadById(project().squadId)?.id||state.squads[0]?.id||null;
 ui.view='squads';render();
}
function newSquad(){
 if(!guardMutation())return;if(state.squads.length>=30)return toast('Limite de 30 squads por workspace.','error');
 ui.squadDraft=blankSquad();ui.squadPick=null;if(ui.modal)closeModal();ui.view='squads';render();$('#squadName')?.focus();
}
function selectSquad(squadId){if(!squadById(squadId))return;ui.squadSel=squadId;ui.squadDraft=null;ui.squadPick=null;ui.opPending=null;render();}
function assignSlot(d,slot,index,agentId){
 if(slot==='commander')d.commanderId=agentId;else if(slot==='adr')d.adrId=agentId;else if(slot==='prd')d.prdId=agentId;
 else{d.operatorIds=d.operatorIds.filter(x=>x!==agentId);if(index>=0&&index<d.operatorIds.length)d.operatorIds[index]=agentId;else d.operatorIds.push(agentId);}
 if(slot!=='op')d.operatorIds=d.operatorIds.filter(x=>x!==agentId);
 ui.squadFlash=slot+':'+(slot==='op'?Math.max(0,index>=0?index:d.operatorIds.length-1):0);
}

/* ---------- selector options (MGS-style item strip) ---------- */
function pickOptions(slot,index){
 const d=squadDraft(),current=slot==='commander'?d.commanderId:slot==='adr'?d.adrId:slot==='prd'?d.prdId:d.operatorIds[index]||'';
 const taken=new Set(squadMembers(d).filter(x=>x!==current)),items=[],names=new Set();
 const cat=slot==='op'?OP_CATEGORIES.find(c=>c.key===ui.squadPick?.cat):null;
 if(slot==='op'&&!cat){
  const free=a=>slotFits('op',a)&&!taken.has(a.id);
  for(const c of OP_CATEGORIES){const extra=state.agents.filter(a=>agentCategory(a)===c.key&&free(a)&&!c.presets.some(p=>p.name===a.name));if(!c.presets.length&&!extra.length)continue;
   const subs=c.presets.map((p,i)=>i===0?'Generalista':p.specialty||ROLES[p.role].label);
   items.push({kind:'category',cat:c.key,name:c.label.toUpperCase(),icon:c.icon,photo:'',role:`${c.presets.length+extra.length} ${c.presets.length+extra.length===1?'AGENTE':'AGENTES'} NESTA CATEGORIA`,description:c.description+(subs.length?` Opções: ${subs.join(', ')}.`:''),tag:'CATEGORIA',prompt:''});}
  const cursor=Math.max(0,items.findIndex(it=>it.cat===agentCategory(agentById(current))));
  return{items,cursor,current};
 }
 for(const [pi,p] of (cat?cat.presets:AGENT_PRESETS[slot]).entries()){const a=state.agents.find(x=>x.name===p.name);names.add(p.name);if(a&&!slotFits(slot,a))continue;if(a&&taken.has(a.id)){if(cat&&pi===0)items.push({kind:'taken',agentId:a.id,name:p.name,photo:portrait(a),icon:agentIcon(a),role:'GENERALISTA / '+ROLES[p.role].label,description:a.description,tag:'GENERALISTA · JÁ NESTA SQUAD',prompt:a.prompt});continue;}items.push({kind:a?'agent':'preset',preset:p,agentId:a?.id||'',name:p.name,photo:a?portrait(a):autoPortrait({name:p.name,role:p.role}),icon:a?agentIcon(a):p.icon,role:cat&&pi===0?'GENERALISTA / '+ROLES[p.role].label:p.specialty?ROLES[p.role].label+' / '+p.specialty:ROLES[p.role].label,description:a?.description||p.description||ROLES[p.role].description,tag:(cat&&pi===0?'GENERALISTA · ':'')+(a?'NO WORKSPACE':'PRÉ-PRONTO'),prompt:a?a.prompt:presetPrompt(p),conv:conventionLabel(a||{conventions:defaultConventions({role:p.role,specialty:p.specialty,icon:p.icon,name:p.name},p.conv)})});}
 for(const a of state.agents)if(!names.has(a.name)&&slotFits(slot,a)&&!taken.has(a.id)&&(!cat||agentCategory(a)===cat.key)&&!(retiredPresetName(a.name,a.role)&&a.id!==current))items.push({kind:'agent',agentId:a.id,name:a.name,photo:portrait(a),icon:agentIcon(a),role:roleLabel(a),description:a.description,tag:'NO WORKSPACE',prompt:a.prompt,conv:conventionLabel(a)});
 items.push({kind:'custom',name:'CUSTOMIZADO',icon:'sparkle',role:cat?cat.label+' / novo agente':SQUAD_SLOTS[slot].label,description:'Crie um agente do zero no estúdio: codinome, especialidade, instruções e ferramentas. Ele entra direto nesta posição.',tag:'NOVO AGENTE'});
 const cursor=Math.max(0,items.findIndex(it=>it.agentId&&it.agentId===current));
 return{items,cursor,current};
}
function openPick(slot,index){
 const d0=squadDraft();if(!d0)return;const i=Number(index),idx=Number.isFinite(i)?i:-1,cur=slot==='op'&&idx>=0?agentById(d0.operatorIds[idx]):null;ui.squadPick={slot,index:idx,cursor:0,cat:null};
 const o=pickOptions(slot,ui.squadPick.index);ui.squadPick.cursor=o.cursor;render();
 requestAnimationFrame(()=>{updateDock(true);($('#sqDock .sq-strip')||$('#sqDock'))?.focus({preventScroll:true});});
}
const reducedMotionOn=()=>!state.settings.motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
let dockTyping=null,dockMoving=null;
function updateDock(instant){
 const pick=ui.squadPick,dock=$('#sqDock');if(!pick||!dock)return;
 const {items}=pickOptions(pick.slot,pick.index);if(!items.length)return;
 pick.cursor=Math.max(0,Math.min(items.length-1,pick.cursor));const it=items[pick.cursor],wrap=dock.querySelector('.sq-strip'),track=dock.querySelector('.sq-strip-track');
 if(wrap&&track){const cards=pick.slot==='op'&&!pick.cat,step=cards?180:102,off=wrap.clientWidth/2-(pick.cursor*step+(cards?85:46));track.style.transition=instant||reducedMotionOn()?'none':'';track.style.transform=`translateX(${off.toFixed(1)}px)`;
  track.querySelectorAll('.sq-item').forEach((el,i)=>{const dist=Math.abs(i-pick.cursor);el.classList.toggle('active',dist===0);el.classList.toggle('near',dist===1);el.classList.toggle('far',dist>1);});
  if(!instant&&!reducedMotionOn()){wrap.classList.add('moving');clearTimeout(dockMoving);dockMoving=setTimeout(()=>wrap.classList.remove('moving'),260);}}
 const title=dock.querySelector('.sq-type'),ico=dock.querySelector('.sq-detail-icon'),tag=dock.querySelector('.sq-detail-tag'),role=dock.querySelector('.sq-detail-role'),desc=dock.querySelector('.sq-detail-desc'),count=dock.querySelector('.sq-count');
 if(ico){ico.innerHTML=it.photo?`<img src="${it.photo}" alt="">`:icon(it.icon);ico.classList.remove('swap');void ico.offsetWidth;ico.classList.add('swap');}
 if(tag)tag.textContent=it.tag;if(role)role.textContent=it.role;if(desc)desc.textContent=it.description||'';if(count)count.textContent=`${pad(pick.cursor+1)} / ${pad(items.length)}`;
 const confirm=dock.querySelector('[data-action="sq-confirm"]');if(confirm)confirm.disabled=it.kind==='taken';confirm.innerHTML=it.kind==='category'?`${icon('chevron')}Ver agentes`:it.kind==='taken'?`${icon('check')}Já na squad`:`${icon(it.kind==='custom'?'plus':'check')}${it.kind==='custom'?'Criar customizado':it.agentId&&it.agentId===pickOptions(pick.slot,pick.index).current?'Manter':'Escolher'}`;
 const pr=dock.querySelector('.sq-detail-prompt');if(pr){const pe=pr.querySelector('.eyebrow');if(pe)pe.textContent='INSTRUÇÕES DO AGENTE'+(it.conv?' · CONVENÇÕES: '+it.conv.toUpperCase():'');pr.hidden=!it.prompt;const t=pr.querySelector('.sq-prompt-text');if(t)t.textContent=it.prompt||'';}
 if(title){clearInterval(dockTyping);if(reducedMotionOn()||instant){title.textContent=it.name;}else{let n=0;title.textContent='';dockTyping=setInterval(()=>{n++;title.textContent=it.name.slice(0,n)+(n<it.name.length?'▌':'');if(n>=it.name.length)clearInterval(dockTyping);},22);}}
}
function moveCursor(dir){const pick=ui.squadPick;if(!pick)return;const n=pickOptions(pick.slot,pick.index).items.length;pick.cursor=(pick.cursor+dir+n)%n;updateDock();}
function confirmPick(){
 const pick=ui.squadPick,d=squadDraft();if(!pick||!d)return;const {items}=pickOptions(pick.slot,pick.index),it=items[pick.cursor];if(!it)return;
 if(it.kind==='taken')return toast(`${it.name} já faz parte desta squad. Escolha outra especialidade ou crie um novo agente.`,'error');
 if(it.kind==='category'){toggleOpCategory(it.cat);return;}
 if(it.kind==='custom'){ui.squadSlotPending={slot:pick.slot,index:pick.index};const cr=OP_CATEGORIES.find(c=>c.key===pick.cat)?.roles[0],target=pick.slot==='op'?(cr&&cr!=='architect'?cr:'backend'):SQUAD_SLOTS[pick.slot].role;openAgentEditor(undefined,{role:target});return;}
 let a=it.agentId?agentById(it.agentId):null;if(!a&&it.preset){if(!guardMutation())return;a=state.agents.find(x=>x.name===it.preset.name)||createPresetAgent(it.preset);}
 if(!a)return;if(!slotFits(pick.slot,a))return toast(`${a.name} não pode ocupar a posição de ${SQUAD_SLOTS[pick.slot].label}.`,'error');
 assignSlot(d,pick.slot,pick.index,a.id);ui.squadPick=null;render();
}
// "Ver mais": opens the full agent studio on the Instruções tab (a preset is recruited into the workspace first).
function pickMore(){
 const pick=ui.squadPick;if(!pick)return;const it=pickOptions(pick.slot,pick.index).items[pick.cursor];if(!it||it.kind==='custom')return;
 let a=it.agentId?agentById(it.agentId):null;if(!a&&it.preset){if(!guardMutation())return;a=state.agents.find(x=>x.name===it.preset.name)||createPresetAgent(it.preset);if(a)render();}
 if(!a)return;openAgentEditor(a.id);editorTab('prompt');
}
// Click centers an item; a double click picks it. The slide waits for the double-click window so the second click hits the same item.
let sqClick=null;
function clickPickItem(i){
 if(!ui.squadPick)return;
 if(sqClick&&sqClick.i===i&&performance.now()-sqClick.t<400){clearTimeout(sqClick.timer);sqClick=null;ui.squadPick.cursor=i;confirmPick();return;}
 clearTimeout(sqClick?.timer);sqClick={i,t:performance.now(),timer:setTimeout(()=>{sqClick=null;if(ui.squadPick){ui.squadPick.cursor=i;updateDock();}},230)};
}
// Specialty card inside the sliding strip (step 1 of the operator pop-up).
function opCategoryItemHTML(it,i){
 const def=OP_CATEGORIES.find(c=>c.key===it.cat),chips=(def?.presets||[]).map((p,k)=>k===0?'Generalista':p.specialty||ROLES[p.role].label),cur=agentById(ui.squadPick?.index>=0?squadDraft()?.operatorIds[ui.squadPick.index]:''),isCur=cur&&agentCategory(cur)===it.cat;
 return`<button type="button" class="sq-item category" data-action="sq-cursor" data-i="${i}" aria-label="${E(it.name)}">${isCur?'<em class="sq-cat-now">ATUAL</em>':''}<span class="sq-cat-medal">${icon(it.icon)}</span><strong>${E(it.name)}</strong><small>${E(it.role)}</small><span class="sq-cat-chips">${chips.slice(0,4).map(t=>`<i>${E(t)}</i>`).join('')}${chips.length>4?`<i>+${chips.length-4}</i>`:''}</span></button>`;
}
function toggleOpCategory(key){
 const pick=ui.squadPick;if(!pick||pick.slot!=='op'||pick.cat===key)return;
 pick.cat=key;const o=pickOptions('op',pick.index);pick.cursor=o.items.findIndex(it=>it.agentId&&it.agentId===o.current);if(pick.cursor<0)pick.cursor=0;
 render();requestAnimationFrame(()=>{updateDock(true);$('#sqDock .sq-strip')?.focus({preventScroll:true});});
}
function pickBack(){const pick=ui.squadPick;if(!pick||pick.slot!=='op'||!pick.cat)return;const key=pick.cat;pick.cat=null;pick.cursor=Math.max(0,pickOptions('op',pick.index).items.findIndex(i=>i.cat===key));render();requestAnimationFrame(()=>{updateDock(true);$('#sqDock .sq-strip')?.focus({preventScroll:true});});}
function removeOperator(){const pick=ui.squadPick,d=squadDraft();if(!pick||!d||pick.slot!=='op'||pick.index<0)return;d.operatorIds.splice(pick.index,1);ui.squadPick=null;render();}

/* ---------- page ---------- */
function sqNode(d,slot,index=-1){
 const agentId=slot==='commander'?d.commanderId:slot==='adr'?d.adrId:slot==='prd'?d.prdId:d.operatorIds[index],a=agentById(agentId),pick=ui.squadPick,picking=pick&&pick.slot===slot&&(slot!=='op'||pick.index===index),flash=ui.squadFlash===slot+':'+(slot==='op'?index:0);
 const add=slot==='op'&&index<0,ok=a&&slotFits(slot,a);
 return`<button type="button" class="sq-node sq-${slot} ${ok?'filled':'empty'} ${add?'add':''} ${picking?'picking':''} ${flash?'flash':''}" data-action="sq-pick" data-slot="${slot}" data-index="${index}" aria-label="${add?'Adicionar operador':E(SQUAD_SLOTS[slot].label+(a?': '+a.name:': vazio'))}"><span class="sq-ring ${ok&&state.settings.squadNodes==='photo'?'photo':''}">${ok?(state.settings.squadNodes==='photo'?`<img src="${portrait(a)}" alt="">`:icon(agentIcon(a))):icon(add?'plus':'lock')}</span><span class="sq-node-label"><strong>${ok?E(a.name):add?'ADICIONAR':'VAZIO'}</strong><small>${ok?E(slot==='commander'?'COMANDANTE':roleShort(a)+' / '+(slot==='op'?roleLabel(a):SQUAD_SLOTS[slot].short)):E(add?'OPERADOR':SQUAD_SLOTS[slot].label)}</small></span></button>`;
}
function squadTreeHTML(d){
 const ops=d.operatorIds.map((_,i)=>sqNode(d,'op',i)).join('');
 const photo=state.settings.squadNodes==='photo';
 return`<button type="button" class="sq-view-toggle ${photo?'on':''}" data-action="sq-node-view" data-view="${photo?'icon':'photo'}" aria-pressed="${photo}" aria-label="${photo?'Mostrar ícones dos agentes':'Mostrar fotos dos agentes'}" title="${photo?'Mostrar ícones':'Mostrar fotos'}">${icon(photo?'layers':'eye')}</button><div class="sq-tree"><div class="sq-band sq-band-cmd"><div class="sq-band-label"><span>01 / COMANDO</span><small>RECEBE O BRIEFING, TOMA DECISÕES E DELEGA</small></div><div class="sq-row">${sqNode(d,'commander')}</div></div><div class="sq-band"><div class="sq-band-label"><span>02 / INTELIGÊNCIA</span><small>TRANSFORMA REQUISITOS E CONTEXTO EM PLANO DE MISSÃO</small></div><div class="sq-row"><div class="sq-bus">${sqNode(d,'adr')}${sqNode(d,'prd')}</div></div></div><div class="sq-band"><div class="sq-band-label"><span>03 / OPERADORES</span><small>EXECUTA TECNICAMENTE A MISSÃO · ${pad(d.operatorIds.length)} OPERADOR(ES)</small></div><div class="sq-row"><div class="sq-bus">${ops}${sqNode(d,'op')}</div></div></div></div>`;
}
// Build-in of the command tree when the studio opens or shows another squad: the commander lights up, the trunk runs down
// (with a spark on its tip) and, as it reaches each band, the band line, its label and bus draw out and the nodes pop in after
// their stubs. The timeline goes into CSS custom properties, synced to the real layout; .sq-build is dropped at the end so the
// ambient pulses take over again.
function sqBuild(){
 // Dropped first: a replay on the same element (or reduced motion mid-build) must not inherit the running build.
 clearTimeout(ui.sqBuildTimer);const tree=$('#sqTree .sq-tree');if(!tree)return;tree.classList.remove('sq-build');if(feReduced())return;
 const TOP=70,T0=380,TRUNK=900,span=Math.max(1,tree.offsetHeight-90-TOP),at=y=>T0+Math.min(1,Math.max(0,(y-TOP)/span))*TRUNK,tb=tree.getBoundingClientRect();let end=0;
 const set=(el,k,v,unit='ms')=>{el.style.setProperty(k,Math.round(v)+unit);if(unit==='ms')end=Math.max(end,v);};
 set(tree,'--sq-trunk-d',T0);set(tree,'--sq-trunk-t',TRUNK);set(tree,'--sq-span',span,'px');
 tree.querySelectorAll('.sq-band').forEach((band,i)=>{
  const hit=i?at(band.offsetTop):0,label=band.querySelector('.sq-band-label'),bus=band.querySelector('.sq-bus');
  set(band,'--sq-line',hit);if(label)set(label,'--sq-d',i?hit+60:60);
  if(!bus){const n=band.querySelector('.sq-node');if(n)set(n,'--sq-pop',120);return;}
  const r=bus.getBoundingClientRect(),cx=r.left+r.width/2,half=Math.max(1,r.width/2-48),dur=Math.min(700,Math.max(260,half*2.2)),t=at(r.top-tb.top);
  set(bus,'--sq-d',t);set(bus,'--sq-bus-t',dur);
  bus.querySelectorAll(':scope>.sq-node').forEach(n=>{const nr=n.getBoundingClientRect(),stub=t+Math.min(1,Math.abs(nr.left+nr.width/2-cx)/half)*dur;set(n,'--sq-stub',stub);set(n,'--sq-pop',stub+140);});
 });
 void tree.offsetWidth;tree.classList.add('sq-build');ui.sqBuildTimer=setTimeout(()=>tree.classList.remove('sq-build'),end+1100);
}
function squadDockHTML(){
 const pick=ui.squadPick;if(!pick)return'';const {items}=pickOptions(pick.slot,pick.index),editing=pick.slot==='op'&&pick.index>=0;
 return`<div class="sq-pop-backdrop" data-action="sq-close"></div><section class="sq-dock sq-pop" id="sqDock" role="dialog" aria-modal="true" aria-label="Selecionar agente"><div class="sq-dock-head">${pick.slot==='op'&&pick.cat?`<button type="button" class="sq-back" data-action="sq-back" aria-label="Voltar para as especialidades">${icon('back')}Especialidades</button>`:''}<span class="eyebrow">SELECIONAR / ${E(pick.slot==='op'?(pick.index<0?'NOVO OPERADOR':'OPERADOR')+' / '+(pick.cat?(OP_CATEGORIES.find(c=>c.key===pick.cat)?.label||'').toUpperCase():'ESPECIALIDADE'):SQUAD_SLOTS[pick.slot].label)}</span><span class="sq-count"></span><button type="button" class="icon-button small" data-action="sq-close" aria-label="Fechar seletor">${icon('close')}</button></div><div class="sq-strip-wrap"><button type="button" class="sq-arrow" data-action="sq-move" data-dir="-1" aria-label="Anterior">${icon('back')}</button><div class="sq-strip${pick.slot==='op'&&!pick.cat?' cats':''}" tabindex="0" role="listbox" aria-label="Opções para a posição"><div class="sq-strip-track">${items.map((it,i)=>it.kind==='category'?opCategoryItemHTML(it,i):`<button type="button" class="sq-item ${it.kind}" data-action="sq-cursor" data-i="${i}" aria-label="${E(it.name)}"><span class="sq-item-photo">${it.photo?`<img src="${it.photo}" alt="">`:icon(it.icon)}</span><small>${E(it.name)}</small></button>`).join('')}</div></div><button type="button" class="sq-arrow" data-action="sq-move" data-dir="1" aria-label="Próximo">${icon('arrow')}</button></div><div class="sq-detail"><div class="sq-detail-icon"></div><div class="sq-detail-text"><span class="sq-detail-tag eyebrow"></span><h3 class="sq-type"></h3><span class="sq-detail-role"></span><p class="sq-detail-desc"></p><div class="sq-detail-prompt"><span class="eyebrow">INSTRUÇÕES DO AGENTE</span><p class="sq-prompt-text"></p><button type="button" class="link-button" data-action="sq-more">VER MAIS ${icon('chevron')}</button></div></div><div class="sq-detail-actions"><button type="button" class="btn primary" data-action="sq-confirm"></button>${editing?`<button type="button" class="btn danger" data-action="sq-remove">${icon('trash')}Remover</button>`:''}</div></div><p class="hint">Use ← → para navegar, Enter para escolher e Esc para fechar.</p></section>`;
}
function renderSquadsPage(){
 const root=$('#squadsView');if(!root)return;
 if(!root.querySelector('#sqList')){['sqList','sqHead','sqStatus','sqTree','sqPopRoot'].forEach(k=>delete opsSig[k]);root.innerHTML=`<div class="home-inner ops-inner"><header class="home-head"><div><div class="eyebrow">SQUAD CODE / CADEIA DE COMANDO</div><h1>SQUAD <span>STUDIO.</span></h1><p>Toda squad tem 1 comandante, 2 reconhecedores (ADR e PRD) e operadores especialistas. Clique em uma posição da árvore para escolher o agente.</p></div><div class="flex wrap home-actions"><button class="btn primary" data-action="squad-new">${icon('squad')}Nova squad</button></div></header><div class="ops-layout"><aside class="ops-list" id="sqList" aria-label="Squads"></aside><div class="ops-main"><div id="sqHead"></div><div id="sqStatus"></div><section class="ops-section sq-stage" id="sqTree" aria-label="Hierarquia da squad"></section></div></div></div>`;}
 const d=squadDraft();
 opsBlock('sqList',JSON.stringify([ui.squadSel,!!d?.isNew,state.squads.map(q=>[q.id,q.name,squadMembers(q),projectsOfSquad(q).length]),state.agents.map(a=>[a.id,a.name,a.icon,a.role])]),()=>`<div class="ops-list-head"><span>SQUADS</span><span>${pad(state.squads.length)}</span></div>${state.squads.map(q=>`<button class="ops-item squad-card ${!d?.isNew&&q.id===ui.squadSel?'active':''}" data-action="squad-select" data-id="${E(q.id)}" aria-pressed="${!d?.isNew&&q.id===ui.squadSel}">${squadCardInner(q)}</button>`).join('')}<button class="ops-item new ${d?.isNew?'active':''}" data-action="squad-new">${icon('plus')}<strong>NOVA SQUAD</strong></button>`);
 if(!d){['sqHead','sqStatus','sqTree','sqPopRoot'].forEach(k=>opsBlock(k,'none',()=>k==='sqTree'?`<div class="mission-empty">Nenhuma squad ainda. Crie a primeira: nome, comandante, ADR, PRD e operadores.</div>`:''));return;}
 opsBlock('sqHead',JSON.stringify([d.id,d.isNew]),()=>`<form id="squadForm" class="sq-name-form" novalidate><label for="squadName" class="eyebrow">${d.isNew?'NOVA SQUAD / NOME OBRIGATÓRIO':'NOME DA SQUAD'}</label><input id="squadName" name="name" value="${E(d.name)}" maxlength="60" placeholder="Ex.: SQUAD ALPHA" autocomplete="off"></form>`);
 renderSquadStatus(d);
 opsBlock('sqTree',JSON.stringify([state.settings.squadNodes,d.id,d.commanderId,d.adrId,d.prdId,d.operatorIds,ui.squadPick&&[ui.squadPick.slot,ui.squadPick.index],ui.squadFlash,state.agents.map(a=>[a.id,a.name,a.icon,a.role,a.image.length])]),()=>squadTreeHTML(d));
 ui.squadFlash=null;
 // Opening the studio or showing another squad (a new draft included) plays the tree's build-in once.
 if(ui.sqShown!==d.id){ui.sqShown=d.id;sqBuild();}
 const pick=ui.squadPick,had=opsSig.sqPopRoot;
 opsBlock('sqPopRoot',pick?JSON.stringify([d.id,pick.slot,pick.index,pick.cat,pickOptions(pick.slot,pick.index).items.map(i=>[i.kind,i.name,i.agentId,i.icon,i.photo?.length])]):'',squadDockHTML);
 if(pick)requestAnimationFrame(()=>updateDock(true));
}
function renderSquadStatus(d){
 const miss=squadMissing(d),ops=d.isNew?[]:projectsOfSquad(d),dirty=squadDirty(d),forOp=d.isNew?ui.opPending?.name||'':'';
 opsBlock('sqStatus',JSON.stringify([d.id,d.isNew,miss,ops.map(p=>p.code),dirty,forOp]),()=>`<div class="sq-status"><div class="ops-badges">${forOp?`<span class="tag accent">${icon('project')}PARA A OPERAÇÃO ${E(forOp.toUpperCase())}</span>`:''}${miss.length?`<span class="tag sq-warn">${icon('info')}FALTA: ${E(miss.join(', ').toUpperCase())}</span>`:'<span class="tag accent">SQUAD COMPLETA</span>'}${dirty&&!d.isNew?'<span class="tag sq-dirty">ALTERAÇÕES NÃO SALVAS</span>':''}${ops.map(p=>`<span class="tag">${E(p.code)} / ${E(p.name)}</span>`).join('')}</div><div class="flex wrap">${d.isNew?`<button class="btn" type="button" data-action="squad-cancel-new">Cancelar</button>`:`${dirty?`<button class="btn" type="button" data-action="squad-discard">Descartar</button>`:''}<button class="btn danger" type="button" data-action="squad-delete" data-id="${E(d.id)}">${icon('trash')}Excluir</button>`}<button class="btn primary" type="submit" form="squadForm">${icon('check')}${d.isNew?forOp?'Criar squad e operação':'Criar squad':'Salvar squad'}</button></div></div>`);
}
function saveSquad(){
 if(!guardMutation())return;const d=squadDraft();if(!d)return;
 const name=String($('#squadName')?.value??d.name).trim().replace(/\s+/g,' ').toUpperCase();d.name=name;
 const miss=squadMissing(d);if(miss.length){if(miss.includes('nome'))$('#squadName')?.focus();return toast(`Squad incompleta. Falta: ${miss.join(', ')}.`,'error');}
 if(state.squads.some(x=>x.id!==d.id&&x.name.toUpperCase()===name)){$('#squadName')?.focus();return toast(`Já existe uma squad chamada ${name}.`,'error');}
 const isNew=d.isNew,q=isNew?{id:d.id,createdAt:d.createdAt}:squadById(d.id);if(!q)return;
 Object.assign(q,{name,commanderId:d.commanderId,adrId:d.adrId,prdId:d.prdId,operatorIds:[...new Set(d.operatorIds.filter(x=>slotFits('op',agentById(x))))]});q.agentIds=squadMembers(q);
 if(isNew)state.squads.push(q);ui.squadSel=q.id;ui.squadDraft=null;ui.squadPick=null;syncSquad(q);
 log(`Squad ${q.name} ${isNew?'criada':'atualizada'}.`,'system');if(isNew&&ui.opPending)return createOperation(ui.opPending.name,q,`Squad ${q.name} e operação ${ui.opPending.name} criadas. Escreva o briefing ou abra o Agent Teams para co-escrever com a squad.`);save();render();toast(isNew?'Squad criada. Associe-a a uma operação em Projetos.':projectsOfSquad(q).length?'Squad salva. As operações que usam esta squad foram atualizadas.':'Squad salva.');
}
function deleteSquad(squadId){
 if(!guardMutation())return;const q=squadById(squadId);if(!q)return;const ops=projectsOfSquad(q);
 if(ops.length)return toast(`A squad ${q.name} está em uso por ${ops.map(p=>p.name).join(', ')}. Associe outra squad a essas operações antes de excluir.`,'error');
 confirmAction('EXCLUIR SQUAD',`Excluir a squad ${q.name}? Os agentes continuam no workspace.`,()=>{state.squads=state.squads.filter(x=>x.id!==q.id);if(ui.squadSel===q.id)ui.squadSel=state.squads[0]?.id||null;ui.squadDraft=null;ui.squadPick=null;log(`Squad ${q.name} excluída.`,'system');save();render();toast('Squad excluída.');},'Excluir squad',true);
}
/* Compact card used on the home page, the Studio list and the operation squad picker: the chain of command as icons. */
function squadCardInner(q){
 const c=agentById(q.commanderId),adr=agentById(q.adrId),prd=agentById(q.prdId),ops=(q.operatorIds||[]).map(agentById).filter(Boolean),n=projectsOfSquad(q).length,miss=squadMissing(q);
 const chip=(a,slot)=>a?`<i class="sq-chip ${slot}" title="${E(a.name)} / ${E(SQUAD_SLOTS[slot].label)}">${icon(agentIcon(a))}</i>`:`<i class="sq-chip empty" title="${E(SQUAD_SLOTS[slot].label)}: vazio">${icon('lock')}</i>`;
 return`<span class="squad-card-top"><i class="sq-chip lead ${c?'':'empty'}">${icon(c?agentIcon(c):'lock')}</i><span class="grow"><strong>${E(q.name)}</strong><small>${c?`${icon('crown')} ${E(c.name)}`:'SEM COMANDANTE'}</small></span></span><span class="sq-chain">${chip(adr,'adr')}${chip(prd,'prd')}<span class="sq-chain-sep"></span>${ops.slice(0,6).map(a=>chip(a,'op')).join('')}${ops.length>6?`<em>+${ops.length-6}</em>`:''}${ops.length?'':'<em>SEM OPERADORES</em>'}</span><span class="squad-card-meta">${miss.length?`<b class="sq-inc">INCOMPLETA</b> · `:''}1 CMD · 2 REC · ${ops.length} OPS · ${n} ${n===1?'OPERAÇÃO':'OPERAÇÕES'}</span>`;
}
function homeSquadsHTML(){return state.squads.map(q=>`<button class="home-squad squad-card" data-action="squad-open" data-id="${E(q.id)}">${squadCardInner(q)}</button>`).join('')+`<button class="home-squad new" data-action="squad-new">${icon('plus')}<strong>Nova squad</strong><small>Comandante, ADR, PRD e operadores.</small></button>`;}
function squadPickerHTML(p){return`<div class="field full"><span class="label">SQUAD DA OPERAÇÃO</span><div class="squad-pick-grid">${state.squads.map(q=>{const miss=squadMissing(q,false);return`<label class="squad-pick ${miss.length?'incomplete':''}" ${miss.length?`title="Squad incompleta: falta ${E(miss.join(', '))}"`:''}><input type="radio" name="squadId" value="${E(q.id)}" ${p.squadId===q.id?'checked':''} ${miss.length?'disabled':''}><span class="squad-card">${squadCardInner(q)}</span></label>`;}).join('')}</div><span class="hint">Obrigatório. A operação usa a squad inteira: comandante, reconhecedores e operadores. Squads incompletas não podem ser escolhidas; complete-as no Squad Studio.</span></div>`;}
function homeSwitch(projectId){
 if(projectId===state.projectId)return true;
 if(runner){toast('Encerre a operação antes de trocar de projeto.','error');return false;}
 if(!state.projects.some(p=>p.id===projectId))return false;
 state.projectId=projectId;ui.selectedId=project().commanderId||project().agentIds[0];save();return true;
}
function homeOpenProject(projectId){if(!homeSwitch(projectId))return;goView('projects');}
function homeOpenTeams(projectId){if(!liveMode())return openAgentTeams();if(!homeSwitch(projectId))return;goView('projects');openAgentTeams();}
function homeOpenReview(projectId,featureId){if(!homeSwitch(projectId))return;render();openReview(featureId);}
function homeAgent(agentId){
 if(!project().agentIds.includes(agentId)){const p=state.projects.find(p=>p.agentIds.includes(agentId));if(!p)return openAgentEditor(agentId);if(!homeSwitch(p.id))return;}
 ui.selectedId=agentId;goView('network');
}

// Delegated events keep dynamically rendered controls fully operational.

let lastSelected={id:null,at:0}; // double click on an agent (Squad view) opens the chat
document.addEventListener('click',event=>{
 const control=event.target.closest('[data-action]');if(!control||control.disabled)return;
 const action=control.dataset.action,agentId=control.dataset.id;
 switch(action){
  case 'home':goView('home');MapNetwork.home();break;
  case 'view':control.dataset.view==='network'?openSquadView():goView(control.dataset.view);break;case 'squad-view-op':squadViewOp(agentId);break;
  case 'nav-prev':nextView(-1);break;case 'nav-next':nextView(1);break;
  case 'select-agent':{if(MapNetwork.isMoving())MapNetwork.cancelMove();const double=lastSelected.id===agentId&&performance.now()-lastSelected.at<380;lastSelected={id:double?null:agentId,at:performance.now()};ui.actionsFor=agentId;if(double&&ui.view==='network')openAgentChat(agentId);else selectAgent(agentId);break;}
  case 'agent-new':openAgentEditor();break;case 'agent-edit':openAgentEditor(agentId);break;case 'agent-chat':openAgentChat(agentId);break;case 'agent-move':if(MapNetwork.isMoving()===agentId)MapNetwork.cancelMove();else MapNetwork.startMove(agentId);break;case 'agent-pipeline':case 'squad-studio':openSquadStudio();break;
  case 'agent-duplicate':duplicateAgent(agentId);break;case 'agent-restore':restoreAgentDefaults();break;case 'hello-add':{const list=$('#helloList');if(list&&list.children.length<8){list.insertAdjacentHTML('beforeend',helloRowHTML('',list.children.length));renumberHellos();list.lastElementChild.querySelector('input').focus();}break;}case 'hello-remove':control.closest('.hello-row')?.remove();renumberHellos();break;case 'agent-delete':deleteAgent(agentId);break;case 'agent-export':exportAgent(agentId);break;
  case 'conv-undo':convUndo();break;case 'conv-save-template':convSaveTemplate();break;case 'conv-add-toggle':toggleConvPicker();break;case 'conv-theme':convTheme=convTheme===control.dataset.group?'':control.dataset.group;convCursor=0;renderConvResults();$('#convSearch')?.focus();break;case 'conv-add-subset':convAddSubset(control.dataset.src||'custom');break;case 'conv-sub-remove':control.closest('.conv-subset')?.remove();refreshConvPicker();updateConvPreview();break;case 'conv-sub-save':convSaveSubset(control);break;case 'conv-lib-del-template':convDeleteLibrary('template',control.dataset.id);break;case 'conv-lib-del-subset':convDeleteLibrary('subset',control.dataset.id);break;
  case 'editor-tab':editorTab(control.dataset.tab);break;
  case 'codename-roll':rollCodename(control);break;
  case 'icon-pick':pickAgentIcon(control.dataset.iconKey||'');closeLookPicker();break;
  case 'look-open':openLookPicker(control.dataset.kind);break;case 'look-close':closeLookPicker();break;
  case 'portrait-pick':if(ui.draft?.kind==='agent'){ui.draft.agent.image=PORTRAITS[control.dataset.preset]||'';refreshPortraitPicker();closeLookPicker();}break;
  
  case 'prompt-reset':if(ui.draft?.kind==='agent')$('#agentPrompt').value=ROLES[$('#agentRole').value].prompt;break;
  case 'projects':openProjects();break;case 'squad-select':selectSquad(agentId);break;case 'squad-open':openSquadStudio(agentId);break;case 'squad-new':newSquad();break;case 'squad-cancel-new':ui.squadDraft=null;ui.squadPick=null;ui.opPending=null;render();break;case 'squad-discard':ui.squadDraft=null;ui.squadPick=null;render();break;case 'squad-delete':deleteSquad(agentId);break;case 'project-export':exportProject(agentId);break;case 'fe-send':if(chatNow()?.kind==='agent')sendAgentChat();else sendFeatureChat();break;case 'fe-quick':sendFeatureChat(control.dataset.text);break;case 'fe-stop':{const k=chatNow()?.kind;if(k==='agent')agentChatStop();else if(k==='doc')docChatStop();else featureChatStop();break;}case 'agent-teams':event.preventDefault();openAgentTeams();break;case 'teams-mention':teamsMentionInsert(control.dataset.name);break;case 'teams-mention-pick':teamsMentionPick(control.dataset.name);break;case 'teams-tab':teamsTab(control.dataset.tab);break;case 'teams-agenda':teamsAgendaOpen(control.dataset.field);break;case 'teams-unshare':if(ui.docChat){ui.docChat.sharing=null;teamsSync();}break;case 'teams-leave':teamsLeave();break;case 'teams-leave-now':closeModal();break;case 'teams-stay':{const b=$('#atConfirm');if(b)b.hidden=true;$('#feChatInput')?.focus();break;}case 'teams-save-leave':$('#docForm')?.requestSubmit();break;case 'fe-undo':undoCoWrite(control.dataset.mid);break;case 'fe-jump':feScroll($('#feMsgs'),true);break;case 'fe-retry':retryCoWrite(control.dataset.mid);break;case 'ac-opt':agentChatChoose(control.dataset.mid,control.dataset.opt,control.dataset.arg||'');break;case 'fe-field':{if(ui.modal==='teams')teamsTab('docs');const el=document.getElementById(FE_FIELD_ID[control.dataset.field]),t=el?.closest('.fe-md')||el;if(t){t.classList.remove('collapsed');t.scrollIntoView({block:'nearest',behavior:'smooth'});t.classList.remove('fe-updated');void t.offsetWidth;t.classList.add('fe-updated');setTimeout(()=>t.classList.remove('fe-updated'),1400);}break;}case 'fe-collapse':{const sec=control.closest('.fe-md'),closed=sec.classList.toggle('collapsed');control.setAttribute('aria-expanded',String(!closed));break;}case 'fe-md-mode':feMdMode(control.closest('.fe-md'),control.dataset.mode);break;case 'fe-md-open':feMdMode(control.closest('.fe-md'),'edit');break;case 'fe-md-tool':feMdTool(control.closest('.fe-md')?.querySelector('.fe-area'),control.dataset.tool);break;case 'adr-add':{const list=control.closest('form')?.querySelector('.adr-list')||$('#adrList');if(list){list.insertAdjacentHTML('beforeend',adrBlockHTML({id:id('adr'),title:'',status:'Proposto',content:ADR_SKELETON},list.children.length));renumberAdrs(list);list.lastElementChild.querySelector('[name=adrTitle]').focus();}teamsSync();break;}case 'adr-remove':{const list=control.closest('.adr-list');control.closest('.adr-block')?.remove();renumberAdrs(list);teamsSync();break;}case 'sq-pick':openPick(control.dataset.slot,control.dataset.index);break;case 'sq-move':moveCursor(Number(control.dataset.dir)||1);break;case 'sq-cursor':clickPickItem(Number(control.dataset.i)||0);break;case 'sq-confirm':confirmPick();break;case 'sq-remove':removeOperator();break;case 'sq-more':pickMore();break;case 'sq-back':pickBack();break;case 'sq-node-view':state.settings.squadNodes=control.dataset.view==='photo'?'photo':'icon';save();render();break;case 'sq-close':ui.squadPick=null;render();break;case 'ops-feature-close':ui.opsFeature=null;ui.opsFeatureDraft=null;render();break;case 'ops-feat-view':ui.opsFeatView=control.dataset.view==='board'?'board':'list';render();break;case 'ops-plan-discard':ui.opsPlan=null;render();break;case 'ops-select':ui.opsFeature=null;ui.opsFeatureDraft=null;ui.opsPlan=null;switchProject(agentId,true);break;case 'ops-cancel-new':ui.opsNew=null;render();break;case 'ops-open-squad':goView('network');MapNetwork.home();break;case 'project-new':openProjectEditor();break;case 'op-new-existing':opNewPickStep();break;case 'op-new-squad':opNewNewSquad();break;case 'op-new-back':openOpNew(ui.opNew?.name);break;case 'op-new-back-squad':opNewSquadStep();break;case 'project-edit':openProjectEditor(agentId);break;case 'project-switch':switchProject(agentId);break;case 'project-delete':deleteProject(agentId);break;case 'briefing':openBriefing();break;
  case 'features':openFeatures();break;case 'feature-new':openFeatureEditor(null,control.dataset.sprint);break;case 'feature-run':startRun({featureId:agentId});break;case 'sprint-run':startRun({sprintId:agentId});break;case 'sprint-new':openSprintEditor();break;case 'sprint-edit':openSprintEditor(agentId);break;case 'sprint-delete':deleteSprint(agentId);break;case 'sprint-toggle':{const s=sprintById(agentId);if(s){const open=control.getAttribute('aria-expanded')==='true';setSprintOpen(s.id,!open);render();}break;}case 'feature-open':openFeature(agentId);break;case 'feature-delete':deleteFeature(agentId);break;
  case 'feature-approve':approveFeature(agentId,true);break;case 'feature-rework':approveFeature(agentId,false);break;
  case 'distribute':openDistribution();break;case 'plan-apply':applyPlan(control.dataset.run==='1');break;
  case 'run':startRun();break;case 'stop':stopRun();break;case 'room':openOpsChat();break;case 'ops-chat-min':opsChatMin(true);break;case 'ops-chat-restore':opsChatMin(false);break;case 'ops-chat-close':opsChatClose();break;case 'room-approve':roomApprove();break;case 'room-cancel':stopRun();break;case 'spawn':openSpawn(agentId);break;
  case 'handoff-new':openHandoffForm();break;case 'handoff-history':openHandoffHistory();break;
  case 'logs':if(runner&&liveMode()&&control.id==='transmissionStrip')openConsole();else openLogs();break;case 'log-filter':ui.logFilter=control.dataset.filter;openLogs();break;
  case 'logs-export':download('squad-code-transmissions.json',JSON.stringify(project().logs,null,2));break;
  case 'settings':openSettings();break;case 'settings-claude':openSettings('claude');break;
  case 'settings-tab':openSettings(control.dataset.tab);break;
  case 'bridge-test':{const form=$('#runtimeForm');if(form){const path=form.claudePath.value.trim();runtime().claudePath=path;}checkBridge(true).then(()=>{if(ui.modal==='settings')openSettings('claude');});break;}
  case 'prof-new':ui.profForm={id:'',name:'',adapter:'claude',concurrency:2,threshold:90,ignoreUserConfig:true,telemetry:{}};profFormRefresh();$('#pfName')?.focus();break;
  case 'prof-edit':{const p=profileById(agentId);if(p){ui.profForm={...p,telemetry:{...p.telemetry}};profFormRefresh();$('#profFormBox')?.scrollIntoView({block:'nearest'});$('#pfName')?.focus();}break;}
  case 'prof-cancel':ui.profForm=null;profFormRefresh();break;
  case 'prof-test':profAction('test',agentId);break;case 'prof-refresh':profAction('refresh',agentId);break;case 'prof-default':profAction('default',agentId);break;
  case 'prof-delete':ui.profConfirm=agentId;profilesChanged();break;case 'prof-delete-no':ui.profConfirm=null;profilesChanged();break;case 'prof-delete-yes':profAction('delete',agentId);break;
  case 'tel-hdr-add':$('#telHeaders')?.insertAdjacentHTML('beforeend',telHeaderRowHTML());$('#telHeaders .tel-row:last-child input')?.focus();break;
  case 'tel-hdr-remove':control.closest('.tel-row')?.remove();break;
  case 'usage-by':ui.usageBy=ui.usageBy===control.dataset.by?'':control.dataset.by;renderHomeUsage();break;
  case 'usage-refresh':loadProfiles().then(()=>loadUsage(true));break;
  case 'settings-load':loadClaudeSettings();break;case 'settings-validate':validateSettingsText();break;case 'settings-save':saveClaudeSettings();break;
  case 'cmd-copy':{const text=$('#cmdPreview')?.textContent||'';navigator.clipboard?.writeText(text).then(()=>toast('Comando copiado.'),()=>toast('Não foi possível copiar. Selecione o texto manualmente.','error'));break;}
  case 'home-open-project':homeOpenProject(agentId);break;case 'home-open-teams':homeOpenTeams(agentId);break;case 'home-open-review':homeOpenReview(control.dataset.project,agentId);break;case 'home-agent':homeAgent(agentId);break;
  case 'city-shape':if(state.settings.squadView!=='office'){state.settings.cityShape=state.settings.cityShape==='planet'?'flat':'planet';save();render();}break;
  case 'squad-view':state.settings.squadView=['city','office'].includes(control.dataset.mode)?control.dataset.mode:state.settings.squadView==='office'?'city':'office';save();render();break;
  case 'console':openConsole();break;case 'console-pick':ui.consoleId=agentId;ui.consoleHistory=null;refreshConsole();break;case 'console-history':openConsoleHistory();break;case 'console-history-close':ui.consoleHistory=null;refreshConsole();break;case 'console-replay':replayRun(agentId);break;
  case 'setting-toggle':if(control.dataset.setting==='motion'){state.settings[control.dataset.setting]=!state.settings[control.dataset.setting];control.setAttribute('aria-checked',state.settings[control.dataset.setting]);save();render();}else if(control.dataset.setting==='cityShape'){state.settings.cityShape=state.settings.cityShape==='planet'?'flat':'planet';control.setAttribute('aria-checked',state.settings.cityShape==='planet');save();render();}else if(control.dataset.setting==='mapQuality'){state.settings.mapQuality=state.settings.mapQuality==='low'?'high':'low';control.setAttribute('aria-checked',state.settings.mapQuality!=='low');save();render();}break;
  case 'export':download('squad-code-network-workspace.json',JSON.stringify(state,null,2));toast('Backup exportado.');break;
  case 'import':if(guardMutation())$('#importInput').click();break;case 'db-setup-demo':dbSetupCreate(seedWorkspace(),'demo');break;case 'db-setup-import':$('#dbSetupImport')?.click();break;case 'db-setup-local':{const copy=dbSetupLocal();if(copy)dbSetupCreate(diskSync.localCopy,'local');break;}case 'ws-restore':restoreVersion(agentId);break;
  case 'reset':if(guardMutation())confirmAction('REINICIAR WORKSPACE','Remover as alterações desta demonstracao e restaurar o projeto de exemplo? Esta ação não altera o HTML original anterior.',()=>{state=seedWorkspace();ui.selectedId=project().commanderId;ui.view='network';save();render();MapNetwork.home();toast('Demonstracao restaurada.');},'Reiniciar',true);break;
  case 'zoom-in':MapNetwork.zoom(1.18);break;case 'map-rotate':MapNetwork.rotate(Number(control.dataset.dir)||1);break;case 'zoom-out':MapNetwork.zoom(1/1.18);break;case 'map-reset':MapNetwork.home();break;
  case 'focus':toggleFocus();break;case 'help':openHelp();break;
  case 'modal-close':closeModal();break;
  case 'confirm':{const callback=ui.confirm;closeModal();callback?.();break;}
 }
});
document.addEventListener('input',event=>{if(event.target.id!=='squadName'||!ui.squadDraft)return;ui.squadDraft.name=event.target.value;renderSquadStatus(ui.squadDraft);});
// Squad Studio selector: ← → move through the item strip, Enter picks, Esc closes (MGS-style menu).
document.addEventListener('keydown',event=>{if(ui.view!=='squads'||!ui.squadPick||ui.modal||event.target.closest?.('input,textarea,select'))return;const k=event.key;if(k==='ArrowLeft'||k==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();moveCursor(k==='ArrowLeft'?-1:1);}else if(k==='Enter'&&!event.target.closest?.('button:not(.sq-item)')){event.preventDefault();event.stopImmediatePropagation();confirmPick();}else if(k==='Backspace'&&ui.squadPick.slot==='op'&&ui.squadPick.cat){event.preventDefault();event.stopImmediatePropagation();pickBack();}else if(k==='Escape'){event.preventDefault();event.stopImmediatePropagation();ui.squadPick=null;render();}},true);
// AVANÇADO tab: live preview while typing; the catalog select only changes which templates are offered.
document.addEventListener('input',event=>{if(event.target.id==='convSearch'){convCursor=0;renderConvResults();return;}if(event.target.closest?.('[data-pane="advanced"]')){updateConvPreview();if(event.target.id==='convBase')refreshConvTemplates();}});
document.addEventListener('change',event=>{if(event.target.id==='convTemplateSelect')convApplyValue(event.target.value);else if(event.target.id==='agentSpecialty'&&ui.draft?.kind==='agent')syncConvFamily();});
// Subset search menu keyboard: arrows move, Enter adds, Esc closes only the menu (not the agent studio).
// Feature editor: textareas grow with the content, Enter sends to the co-writer (Shift+Enter breaks the line), dependency summary.
document.addEventListener('input',event=>{const t=event.target;if(t.classList?.contains('fe-area')||t.id==='feChatInput')autoGrow(t);if(t.id==='feChatInput')feSendState();if(ui.modal==='teams'&&(t.id==='feChatInput'||t.closest?.('#docForm')))teamsSync();if(ui.modal==='teams'&&t.id==='feChatInput')teamsMentionMenu();const sec=t.closest?.('.fe-md');if(sec&&t.classList.contains('fe-area'))sec.querySelector('.fe-md-count').textContent=feCount(sec.dataset.field,t.value);});
document.addEventListener('focusout',event=>{const t=event.target;if(!t.classList?.contains('fe-area'))return;const sec=t.closest('.fe-md');if(!sec||sec.contains(event.relatedTarget))return;if(t.value.trim())feMdMode(sec,'view');});
document.addEventListener('mousedown',event=>{if(event.target.closest?.('.fe-md-tools button'))event.preventDefault();});
document.addEventListener('change',event=>{if(ui.draft?.kind==='agent'&&(event.target.id==='agentModel'||event.target.name==='effort'))syncEffortField();if(ui.draft?.kind==='agent'&&event.target.id==='agentProfile')syncProfileField();});
document.addEventListener('change',event=>{if(['agentRole','agentSpecialty'].includes(event.target.id)&&ui.draft?.kind==='agent')syncGenericHellos();});
document.addEventListener('scroll',event=>{if(event.target.id==='feMsgs'&&feNearBottom(event.target))$('#feJump')?.setAttribute('hidden','');},true);
window.addEventListener('keydown',event=>{const t=event.target;if(!t.classList?.contains('fe-area')||!t.closest('.fe-md'))return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();feMdMode(t.closest('.fe-md'),'view');t.closest('.fe-md').querySelector('.fe-md-view')?.focus();}else if((event.ctrlKey||event.metaKey)&&!event.altKey&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();feMdTool(t,event.key.toLowerCase()==='b'?'bold':'italic');}},true);
document.addEventListener('keydown',event=>{if(event.target.id==='feChatInput'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(chatNow()?.kind==='agent')sendAgentChat();else sendFeatureChat();}});
// Agent Teams: while the @ list is open its keys come first (Enter/Tab pick instead of sending, Esc closes it instead of leaving).
window.addEventListener('keydown',event=>{
 const box=$('#atMention');if(event.target.id!=='feChatInput'||!box||box.hidden||event.isComposing)return;const items=[...box.querySelectorAll('.at-mention-item')],k=event.key;if(!items.length)return;let i=Math.max(0,items.findIndex(x=>x.classList.contains('on')));
 if(k==='ArrowDown'||k==='ArrowUp'){i=(i+(k==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((x,j)=>{x.classList.toggle('on',j===i);x.setAttribute('aria-selected',String(j===i));});}
 else if(k==='Enter'||k==='Tab')teamsMentionPick(items[i].dataset.name);else if(k==='Escape')teamsMentionClose();else return;
 event.preventDefault();event.stopImmediatePropagation();
},true);
document.addEventListener('mousedown',event=>{if(event.target.closest?.('.at-mention-item'))event.preventDefault();});
document.addEventListener('focusout',event=>{if(event.target.id==='feChatInput')setTimeout(()=>{if(document.activeElement?.id!=='feChatInput')teamsMentionClose();},120);});
document.addEventListener('pointerdown',teamsSplitDrag);document.addEventListener('pointerdown',opsChatSplitDrag);addEventListener('resize',()=>{if(ui.opsChat.open)renderOpsChat();});
document.addEventListener('dblclick',event=>{if(event.target.closest?.('#atSplit'))teamsSideSet(0,true);else if(event.target.closest?.('#ocSplit'))opsChatSideSet(0,true);});
document.addEventListener('keydown',event=>{if(event.target.id==='atSplit')teamsSplitKey(event);else if(event.target.id==='ocSplit')opsChatSplitKey(event);});
document.addEventListener('change',event=>{if(event.target.name==='dependencies'&&event.target.closest('#featureForm.fe-form')){const keys=[...document.querySelectorAll('#featureForm [name=dependencies]:checked')].map(x=>featureById(x.value)?.key).filter(Boolean),el=$('#feDepSummary');if(el)el.textContent=keys.join(', ')||'nenhuma';}});
document.addEventListener('change',event=>{if(event.target.name==='squadId'&&event.target.closest('#projectForm'))refreshDocAgents();});
document.addEventListener('keydown',event=>{if(event.target.id!=='convSearch')return;const k=event.key;
 if(k==='ArrowDown'||k==='ArrowUp'){event.preventDefault();convCursor=Math.max(0,Math.min(convFlat.length-1,convCursor+(k==='ArrowDown'?1:-1)));markConvCursor();}
 else if(k==='Enter'){event.preventDefault();const src=convFlat[convCursor];if(src)convAddSubset(src);}
 else if(k==='Escape'){event.preventDefault();event.stopImmediatePropagation();toggleConvPicker(false);$('#convAddBtn')?.focus();}},true);
document.addEventListener('submit',event=>{if(!event.target.matches('#agentForm,#projectForm,#featureForm,#docForm,#sprintForm,#spawnForm,#handoffForm,#runtimeForm,#squadForm,#opNewForm,#opNewSquadForm,#dbSetupForm,#profileForm,#telemetryForm'))return;event.preventDefault();const form=event.target;({dbSetupForm:dbSetupFresh,agentForm:saveAgent,projectForm:saveProject,featureForm:saveFeature,docForm:saveProjectDoc,sprintForm:saveSprint,spawnForm:spawnAgent,handoffForm:saveHandoff,runtimeForm:saveRuntime,squadForm:()=>saveSquad(),opNewForm:opNewNext,opNewSquadForm:opNewCreate,profileForm:saveProfile,telemetryForm:saveTelemetry})[form.id](form);});
// Dragging a feature row onto another sprint accordion moves it there, keeping its route and status.
let dragFeatureId=null;
function dragEnd(){dragFeatureId=null;$$('#opsFeatureList .dragging,#opsFeatureList .drop').forEach(x=>x.classList.remove('dragging','drop'));}
document.addEventListener('dragstart',event=>{const row=event.target.closest?.('#opsFeatureList .ops-feature[data-feature]');if(!row||runner)return;dragFeatureId=row.dataset.feature;row.classList.add('dragging');event.dataTransfer.effectAllowed='move';try{event.dataTransfer.setData('text/plain',row.dataset.feature);}catch{}});
document.addEventListener('dragover',event=>{if(!dragFeatureId)return;const sec=event.target.closest?.('#opsFeatureList .sprint');$$('#opsFeatureList .sprint.drop').forEach(x=>{if(x!==sec)x.classList.remove('drop');});if(!sec)return;event.preventDefault();event.dataTransfer.dropEffect='move';sec.classList.add('drop');});
document.addEventListener('dragleave',event=>{if(!dragFeatureId)return;const sec=event.target.closest?.('#opsFeatureList .sprint');if(sec&&!sec.contains(event.relatedTarget))sec.classList.remove('drop');});
document.addEventListener('drop',event=>{if(!dragFeatureId)return;const sec=event.target.closest?.('#opsFeatureList .sprint'),fid=dragFeatureId;dragEnd();if(!sec)return;event.preventDefault();moveFeatureToSprint(fid,sec.dataset.sprint);});
document.addEventListener('dragend',dragEnd);
document.addEventListener('input',event=>{
 if(event.target.id==='featureSearch'){ui.featureQuery=event.target.value;refreshFeatureModal();}
 if(event.target.closest?.('#runtimeForm'))refreshCommandPreview();
});
document.addEventListener('change',event=>{
 if(event.target.id==='importInput')importWorkspace(event.target.files?.[0]);
 if(event.target.id==='dbSetupImport'){const file=event.target.files?.[0];event.target.value='';dbSetupImport(file);}
 if(event.target.id==='themeSelect')setTheme(event.target.value);
 if(event.target.id==='demoSpeed'){const n=Number(event.target.value);if([600,1000,1800,3200].includes(n)){state.settings.stepMs=n;save();}}
 if(event.target.id==='agentRole'&&ui.draft?.kind==='agent'){
  const old=ROLES[ui.draft.roleShown||ui.draft.agent.role],role=ROLES[event.target.value];
  if($('#agentDescription').value===old.description)$('#agentDescription').value=role.description;
  if($('#agentPrompt').value===old.prompt)$('#agentPrompt').value=role.prompt;
  {const sel=$('#agentModel');if([...sel.options].some(o=>o.value===role.model))sel.value=role.model;}syncEffortField();
  syncConvFamily();
  $('#agentSpecialty').placeholder=role.label;
  const nameEl=$('#agentName'),current=nameEl.value.trim().toUpperCase();
  if(!current||current===old.name)nameEl.value=codenameTaken(role.name,ui.draft.agent.id)?'':role.name;
  nameEl.placeholder='Ex.: '+role.name;ui.draft.roleShown=event.target.value;
  if(!$('#agentIcon').value)$('#lookIcon').innerHTML=icon(role.icon);
  refreshPortraitPicker();
 }
 if(event.target.id==='agentStage'&&ui.draft?.kind==='agent')refreshPortraitPicker();
 if(event.target.id==='sjScope'){ui.settingsScope=event.target.value;const pf=$('#sjProfileField');if(pf)pf.hidden=!(ui.settingsScope==='user'&&profilesOn());loadClaudeSettings();}
 if(event.target.id==='sjProfile'){ui.settingsProfile=event.target.value;loadClaudeSettings();}
 if(event.target.id==='pfForce')setForcedProfile(event.target.value);
 if(event.target.id==='pfAdapter'){const form=$('#profileForm');if(form){ui.profForm=profFormValues(form);profFormRefresh();}}
 if(event.target.closest?.('#runtimeForm'))refreshCommandPreview();
});
document.addEventListener('keydown',event=>{
 const typing=event.target.matches('input,textarea,select,[contenteditable=true]');
 if(event.key==='Escape'&&$('#lookPicker')&&!$('#lookPicker').hidden){event.preventDefault();closeLookPicker();return;}
 if(event.key==='Escape'){if(ui.modal==='teams'){event.preventDefault();const box=$('#atConfirm');if(box&&!box.hidden){box.hidden=true;$('#feChatInput')?.focus();}else teamsLeave();}else if(ui.modal){event.preventDefault();closeModal();}else if(MapNetwork.isMoving())MapNetwork.cancelMove();else if(ui.focus)toggleFocus();return;}
 if(ui.modal){
  if(event.key==='Tab'){
   const focusable=$$('button:not(:disabled),input:not([type=hidden]),select,textarea,[tabindex="0"]',$('#modalRoot')).filter(el=>el.offsetParent!==null);
   const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  return;
 }
 if(typing||event.ctrlKey||event.metaKey||event.altKey)return;
 switch(event.key.toLowerCase()){
  case 'a':event.preventDefault();openAgentEditor();break;case 'b':openBriefing();break;case 'f':openFeatures();break;
  case 'g':openSquadStudio();break;case 'v':if(['network','handoffs'].includes(ui.view)){state.settings.squadView=state.settings.squadView==='office'?'city':'office';save();render();}break;case 'p':if(['network','handoffs'].includes(ui.view)&&state.settings.squadView!=='office'&&!$('#mapViewport').classList.contains('no-webgl')){state.settings.cityShape=state.settings.cityShape==='planet'?'flat':'planet';save();render();}break;case 'l':openLogs();break;case 'c':openConsole();break;case 'h':toggleFocus();break;case '?':openHelp();break;
  case 'q':nextView(-1);break;case 'e':nextView(1);break;
  case '0':MapNetwork.home();break;case '+':case '=':MapNetwork.zoom(1.15);break;case '-':MapNetwork.zoom(1/1.15);break;case '[':MapNetwork.rotate(-1);break;case ']':MapNetwork.rotate(1);break;
  case ' ':if(!event.target.closest('button')){event.preventDefault();startRun();}break;
 }
});
MapNetwork.onCreateAt(target=>{if(ui.modal||['home','projects','squads'].includes(ui.view))return;if(target.desk){if(!validDesk(target.desk)||takenDesks().has(target.desk))return;openAgentEditor(null,{desk:target.desk,squadId:project().squadId});return;}const hex=target.hex;if(!validHex(hex)||takenHexes().has(hexKey(hex)))return;openAgentEditor(null,{hex,squadId:project().squadId});});
MapNetwork.onEmptyClick(()=>{if(profileDismissed()||!ui.selectedId)return;ui.dismissedId=ui.selectedId;render();});
// Office: the War Room opens the operation room (the plan, the squad's talk and the calls of the current run).
MapNetwork.onRoomClick(code=>{if(code==='WAR')openOpsChat();});
MapNetwork.onPosition((agentId,target)=>{const a=agentById(agentId);if(!a)return render();
 if(target.desk){if(validDesk(target.desk)&&!takenDesks(a.id).has(target.desk)){a.desk=target.desk;log(`${a.name} mudou para a mesa ${target.desk} (${deskRoomName(target.desk)}).`,'agent',a.id);save();}return render();}
 const hex=target.hex;if(validHex(hex)&&!takenHexes(a.id).has(hexKey(hex))){a.hex={q:hex.q,r:hex.r};log(`${a.name} movido para o hexágono ${hex.q},${hex.r}.`,'agent',a.id);save();}render();});
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
// In handoff mode, put explicit transfer controls in the same contextual inspector.
const renderRightBase=renderRight;
renderRight=function(a,p){renderRightBase(a,p);if(ui.view==='handoffs'&&a){const primary=$('#rightHud .primary-action');if(primary)primary.insertAdjacentHTML('beforebegin',`<button class="secondary-action" data-action="handoff-new" ${runner?'disabled':''}>CONFIGURAR HANDOFF ${icon('flow')}</button><button class="secondary-action" data-action="handoff-history">HISTÓRICO / ${pad(p.handoffs.length)} ${icon('clock')}</button>`);}};
// Loaded from disk: that version (with the boot migrations) counts as saved, so opening a tab does not rewrite the file.
if(diskSync.fromDisk&&!diskSync.migrated){diskSync.last=JSON.stringify(state);diskMeta(false);}
render();MapNetwork.home();save();checkBridge();
if(diskSync.setup)openDbSetup();
if(loadNotice)setTimeout(()=>toast(loadNotice,'error'),250);
// Read-only export for debugging and integration planning; returns an isolated copy.
window.SquadCode={getSnapshot:()=>clone(state),version:'2.1-bridge',get runtime(){return liveMode()?'claude-code':'local-simulation';},bridge:()=>({...ui.bridge})};
