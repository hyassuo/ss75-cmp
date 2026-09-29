# Backlog: SS-75 CMP

Estado em 29/09/2026, após a v1.21.3. Reúne o que ficou em aberto
da revisão completa (segurança + UI/UX) e das auditorias das etapas 1–4.
Cada item foi conferido no código desta versão.

## Ações pendentes do responsável (resumo)

Tudo o que hoje depende de você, em ordem de prioridade. Os detalhes de cada
item estão na seção indicada; ao concluir, marque aqui e avise para o item ir
para "Concluídos".

| # | P | O quê | Onde |
|---|---|-------|------|
| A6 | P1 | Configurar SMTP próprio no Supabase | Seção A |
| A2 | P1 | Secrets do GitHub + rodar o workflow **Backup** uma vez | Seção A |
| A3 | P2 | Ensaiar um restore | Seção A |
| A4 | P2 | `supabase migration repair` | Seção A |
| C5 | P2 | Ativar MFA no Supabase (depois eu faço a parte do app) | Seção C |
| F1 | P2 | Criar conta no Sentry e passar o DSN | Seção F |
| F2 | P2 | Gerar um token de acesso do Supabase para o CI | Seção F |
| A5 | P3 | PITR, se o plano permitir | Seção A |
| D3 | P3 | Definir os requisitos do módulo de espessura (UT) | Seção D |
| A13 | P3 | Avaliar mover o Supabase para São Paulo (`sa-east-1`) | Seção A |

Prioridade: **P1** = fazer já · **P2** = próximo ciclo · **P3** = quando der.

## A. Ações de configuração (fora do código)

| # | P | Item | Como |
|---|---|------|------|
| A2 | P1 | Ativar os backups automáticos | GitHub → Settings → Secrets: `SUPABASE_DB_URL` (Session pooler), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_AGE_RECIPIENT`. Guardar a chave privada do `age` fora do GitHub. O workflow só roda com a *variável* do repositório `BACKUP_ENABLED` = `true` (GitHub → Settings → Secrets and variables → Actions → aba *Variables*; sem ela o job é pulado, mesmo com os secrets). Rodar o workflow **Backup** manualmente uma vez e baixar o artefato. |
| A3 | P2 | Ensaiar um restore real | Seguir README → "Backups" num projeto Supabase descartável. |
| A4 | P2 | Adotar o histórico de migrações | `supabase link` → `supabase migration repair --status applied 20260928000000 20260928000100 20260929000000 20260929000100` → `supabase db diff --linked` (deve vir vazio). As duas de 29/09 entram na lista porque já foram aplicadas à mão no SQL Editor (A8). |
| A5 | P3 | PITR (point-in-time recovery) | Se o plano do Supabase permitir. |
| A6 | P1 | SMTP próprio para os e-mails de autenticação | Sem SMTP próprio o Supabase **só entrega e-mail para membros da equipe do projeto** (2 por hora, sem garantia): reset de senha e confirmação de cadastro não chegam aos usuários. Supabase → Authentication → Emails → SMTP Settings (ex.: Resend, SendGrid, Amazon SES). |
| A13 | P3 | Supabase mais perto dos usuários (São Paulo) | O banco está em `us-west-2` (Oregon) e os dados vão direto do navegador para ele: do Brasil/offshore cada ida e volta custa ≈ 150–200 ms. Com o projeto em `sa-east-1` (e as funções da Vercel em `gru1`) esse trajeto cai bastante. Exige criar um projeto novo, migrar banco (backup/restore: ver A2/A3), fotos do Storage, usuários e trocar as variáveis na Vercel; fazer como projeto à parte, com janela de manutenção. |

## B. Decisões tomadas (29/09/2026)

| # | Decisão | O que muda |
|---|---------|------------|
| B1 | Manter a regra do admin inicial (`hyassuo@gmail.com`) como está | Com A1 (confirmação de e-mail) ninguém consegue assumir o e-mail. Trocar por configuração só ao abrir uma segunda unidade. |
| B2 | Análise por IA só para **admin e inspector** | Implementado: a rota `app/api/ai/analyze-photo` recusa viewer (o botão já não aparecia para ele). |
| B3 | Filtro de departamento vale em todo o app | Implementado: Risk Matrix e Schedule respeitam o filtro; o Export pergunta "só este departamento / todos", o nome do arquivo e o cabeçalho do PDF dizem o recorte. |
| D1 | Metodologia principal = **fotos + análise por IA**; leituras de profundidade são opcionais | Implementado (ver "Concluídos"). Espessura por UT (tubulações) vira item futuro (D3). |

## C. Segurança

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| C5 | P2 | Senhas fracas | Sem MFA e sem troca obrigatória no primeiro acesso. **Sua ação:** Supabase → Authentication → Multi-Factor → habilitar TOTP. **Depois (minha parte):** tela de cadastro/validação do código no app e exigir MFA para admin. |

## D. Dados e lógica

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| D3 | P3 | Módulo de espessura (UT) para tubulações | Futuro: espessura remanescente por ponto, espessura mínima por linha, taxa curto/longo prazo (a maior vale) e vida remanescente, no padrão API 570. **Sua ação:** quando quiser começar, definir as linhas/pontos de medição, a espessura mínima de cada linha e quem registra as medições. |

## E. UI/UX

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| E6 | P3 | Revisar o tema escuro antes de religar | Desligado em 29/09/2026 porque ficou visualmente pesado. Antes de religar (`DARK_MODE_ENABLED` em `lib/theme/theme.ts`): clarear as superfícies e bordas da paleta escura em `app/globals.css`, rever o contraste do cabeçalho e dos cartões, validar com o responsável em tela real (tablet e celular) e trazer de volta o botão da barra superior (`ThemeToggle`, no histórico do git). |

## F. Engenharia e operação

| # | P | Item | Sugestão |
|---|---|------|----------|
| F1 | P2 | Monitoramento de erros | Sentry ou similar. **Sua ação:** criar a conta/projeto (Next.js) e me passar o DSN (ele pode ir direto nas variáveis da Vercel como `NEXT_PUBLIC_SENTRY_DSN`). **Depois (minha parte):** integrar e ajustar o CSP. |
| F2 | P2 | Tipos do banco escritos à mão | `lib/types/database.types.ts` → gerar com `supabase gen types typescript --linked` e checar no CI. **Sua ação:** criar um token em supabase.com → Account → Access Tokens e salvar como secret `SUPABASE_ACCESS_TOKEN` no GitHub (Settings → Secrets → Actions). **Depois (minha parte):** job no CI que gera e compara os tipos. |

## Concluídos

| # | Item | Como ficou |
|---|------|-----------|
| C1 | Reset de senha | O e-mail do "Reset PW" leva a `/auth/reset`, onde o usuário define a nova senha (mín. 8 caracteres). Login ganhou "Esqueci minha senha". Depende de A6 para os e-mails chegarem. |
| C2 | Sessões de usuário desativado | Desativar bloqueia a conta de autenticação (sem renovar sessão nem entrar de novo); reativar libera. |
| D1 | Taxa de corrosão | Só com ≥ 2 medições reais no mesmo ponto e ≥ 90 dias entre elas; por ponto vale a pior entre longo e curto prazo, e o item assume o pior ponto. Sem isso aparece "dados insuficientes", sem alerta. |
| C8 | ~~Logout de usuário inativo é global~~ | Descartado: para uma conta desativada, encerrar as sessões em todos os aparelhos é o comportamento certo. |
| C3 | CSP com nonce | Páginas com CSP por requisição (nonce + `'strict-dynamic'`, sem `unsafe-inline`/`unsafe-eval` para scripts, Supabase exato, sem Gemini); demais respostas com CSP bloqueado; página offline e service worker com políticas próprias. E2E roda com o CSP real. |
| C4 | Limite de requisições compartilhado | Contadores no Postgres (`rate_limit_hit`), com reserva em memória se a função não existir; cotas diárias de IA (60 por usuário, 500 no total, por dia UTC). |
| C6 | Tabelas de referência só para ativos | `units`, `zones` e `ifs_objects` só são lidas por usuário ativo (qualquer policy antiga aberta é removida). |
| D2 | Auditoria de inclusões | Adicionar leitura ou evidência gera evento (`reading_added` / `evidence_added`) com autor; rascunho de "Novo item" continua cancelável com fotos/leituras. |
| E1 | Busca de item | Campo na barra superior (atalho `/`): nome, código IFS, OS, local funcional, zona, mecanismo ou notas; ignora acentos, maiúsculas e pontuação dos códigos; arquivados por último; funciona offline. |
| E2 | Matriz de risco sem depender de cor | Cada nível tem forma própria (círculo = baixo, losango = médio, triângulo vazado = alto, triângulo cheio = crítico; desenhos SVG) e nome lido por leitor de tela ("Risco alto"…), distinto dos nomes de prioridade. |
| E3 | Várias fotos de uma vez | A galeria aceita até 10 arquivos por seleção; cada um vira um registro de evidência (mesma data e descrição), salvos em sequência com progresso. A IA analisa a primeira foto da fila. Se um envio falhar, os já salvos são informados e o restante fica na fila para tentar de novo, sem duplicar. |
| F4 | Planos antigos | Os 5 planos de `docs/plans/` foram conferidos critério a critério contra o código: todos concluídos (alguns por soluções mais novas). Arquivados em `docs/plans/archive/` com um índice; o único resto no código (limites de taxa repetidos no painel de leituras) foi corrigido; os testes que faltavam foram para o F3. |
| E4 | Tema escuro | Botão na barra superior alterna dispositivo → claro → escuro (lembrado em cookie, já aplicado na primeira pintura, sem script inline). Contraste AA em todas as telas nos dois temas (mín. 4,52:1 claro / 5,34:1 escuro, verificado em teste); impressão e PDF sempre claros. **Desativado por ora a pedido do responsável (29/09/2026); religar com `DARK_MODE_ENABLED`** (ver E6): o app fica sempre claro, mesmo com o aparelho em modo escuro ou um cookie antigo de tema. |
| F3 | Testes E2E ampliados | 6 cenários novos: item arquivado (fora das telas e do PDF, dentro do CSV/XLSX; Arquivar/Desarquivar), IA no item (só campos vazios, "Aplicar" sobrescreve, leitura estimada só no Salvar e fora da taxa), SECE sobe a prioridade, conteúdo do PDF (uma linha por item, nota de fotos), página de Usuários e higiene das rotas (JSON inválido, 429, mensagens genéricas), prefetch sem sessão. Mais testes unitários do filtro da saída da IA e checagem SQL entre unidades. Continuam sem teste automático: câmera real, IA real (Gemini) e Realtime. |
| E5 | Padronização visual | Tailwind removido (o reset base dele foi copiado para o `globals.css`, sem mudança visual); uma escala de fontes em `DS.fs`, sem texto abaixo de 10 px; botões e caixas de mensagem feitos à mão viraram os componentes `Button` e `Notice` em `components/ui/`. |
| F5 | Migração de versões major | Next 15 → 16 (build com Turbopack; `middleware.ts` virou `proxy.ts`, mesmo CSP com nonce), React 18 → 19, Vitest 4 → 5, ESLint 8 → 9 com config flat (`eslint .`, mesmas regras de antes). Sem mudança de comportamento; unitários, SQL e os 57 cenários E2E passando. |
| F6 | Carregamento mais rápido (login e primeira tela) | Medido com latência simulada de 150 ms por requisição ao Supabase (`PERF=1 GW_LATENCY_MS=150 bash tests/e2e/run.sh`): login → dados na tela de 2,25 s para 1,4 s (idas e voltas em série ao Supabase: 12 → 6; mesmo aparelho de novo: 1,6 s → 1,08 s, 8 → 5); abrir o app já logado de 1,55 s para 0,9 s (8 → 5). JS da tela de login 185 → 128 KB (brotli), sem o supabase-js (carregado ao focar o formulário); fontes 5 arquivos/87 KB → 2/57 KB. Como: layout confere o JWT e lê o perfil em paralelo (`getClaims()`, rápido de verdade com A11), sem a segunda renderização após o login, dados começam a carregar no instante do login, páginas de itens e limpeza de rascunhos em paralelo, app instalado abre direto em `/dashboard`. Teste E2E `f6perf` confere a estrutura; `f6switch` (sair e entrar com um usuário de outra unidade no mesmo navegador: nada do primeiro aparece) e `f6jwt` (sessões ES256: token forjado, vencido ou de algoritmo desconhecido barrado no proxy; usuário desativado cai no login sem loop de redirecionamento): 61 cenários. |
| A8 | Migrations de 29/09 aplicadas | `20260929000000_rate_limits.sql` (C4) e `20260929000100_active_reads_insert_audit.sql` (C6 + D2) rodadas no Supabase de produção em 29/09/2026: limite de requisições compartilhado, tabelas de referência só para ativos e auditoria de inclusões ativos. |
| A10 | Versão do Node na Vercel | Configuração do projeto alinhada em 22.x (a mesma declarada em `engines`, no `.nvmrc` e usada no CI). |
| A12 | Funções da Vercel perto do Supabase | Supabase em `us-west-2` (Oregon); funções movidas de `iad1` (Washington) para `pdx1` (Portland) em 29/09/2026: cada ida e volta entre o servidor e o Supabase caiu de ≈ 70 ms para poucos ms (2 por página; 1 com A11). |
| A1 | Cadastro público | Cadastro público desativado e confirmação de e-mail exigida no Supabase. |
| A7 | URL de redefinição de senha | Redirect URL `/auth/reset` liberada no Supabase. |
| C7 | Fotos só dentro da sessão | Sem links compartilháveis (nem assinados nem públicos): cada foto é baixada com a sessão do usuário e mostrada da memória da aba (`blob:`), descartada ao fechar o item; nada no cache do navegador (nem da exportação) nem no service worker; só imagens e PDF são exibidos: um arquivo gravado como SVG/HTML aparece como "tipo de arquivo não permitido"; download sem resposta desiste em 2 min, com "Tentar novamente"; o CSP não aceita imagem vinda do Supabase. Tirar fotos do app = exportar o PDF. |
| A11 | Chaves JWT assimétricas | Chave atual ECC (P-256); o segredo HS256 antigo fica como *previous key*: não revogar enquanto o app usar as chaves anon/service_role legadas. O servidor confere o login localmente (`getClaims()`). |
| E7 | Visual sóbrio: sem emojis e sem travessões longos | Emojis e símbolos usados como ícone trocados por um único conjunto de ícones monocromáticos em SVG (lucide-react, na cor do texto), iguais na barra lateral, na navegação do celular e nos botões; nenhum travessão longo nos textos EN/PT, comentários, testes e documentos. Nos SQL já aplicados em produção só mudaram comentários: os 14 que estão dentro de funções gravadas no banco ficaram, para o banco não divergir do repositório (verificado com `pg_dump` idêntico). Três deles são o separador das notas de histórico que os gatilhos gravam ao incluir ou excluir evidência (`history.note`, "Evidence added/removed: <data> <travessão longo> <descrição>", também nas linhas antigas): o app mostra essas notas com "-" no painel Histórico do item, no CSV da Auditoria e na aba "Change Log" do XLSX (`lib/utils/historyNote.ts`; a descrição digitada pelo usuário fica como está). Uma migração futura pode trocar o separador nas próprias funções (não é preciso agora). Testes: `tests/sober.test.ts` barra emoji e travessão longo em qualquer arquivo e no dicionário EN/PT; o E2E `e7sober` varre todas as telas em EN e PT. |
| A9 | ~~Variáveis do Supabase nos previews~~ | Descartado por ora: sem vaga para um projeto Supabase de teste no plano gratuito; os previews ficam só como verificação de build e o funcionamento é coberto pelos testes E2E do CI. Rever se o plano mudar (Pro permite branching). |
| E8 | Textos em português, datas no idioma certo e alvos de toque | Em PT não sobra texto em inglês: tudo o que estava fixo no código (carregando, "por", rótulos da Auditoria e de Usuários, placeholders como "ex.: 1,5", cartão da IA, avisos, erros das rotas da API, páginas de erro e 404, janela e conteúdo do PDF) foi para o dicionário EN/PT; o histórico (painel do item e Auditoria) mostra eventos, campos, valores e notas dos gatilhos no idioma da tela, sem mudar o que está gravado. Datas seguem o idioma: "9 de out. de 2026" em PT e "9 Oct 2026" em EN (também números: "0,608 mm/ano"); CSV e XLSX continuam com cabeçalhos fixos em inglês e datas ISO para uso em outras ferramentas, e o PDF sai no idioma de quem exporta. A página offline, sem script, segue bilíngue com a parte em inglês marcada. Barra lateral (recolhida e aberta), barra superior e navegação do celular: todo controle com pelo menos 32 px no mouse e 44 px na tela de toque; o botão Sair recolhido passou de 28 px para 44 px, igual aos outros ícones. Testes: unitários do formatador e do dicionário (toda chave com PT, erros da API traduzidos, nenhum texto solto em JSX); E2E `i18nsweep` (todas as telas, diálogos e o PDF em PT sem palavras em inglês; "Oct"/"out." no cartão do item) e medidas de toque em `n7` e `e5ui`. |
