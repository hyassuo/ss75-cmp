# Backlog — SS-75 CMP

Estado em 28/09/2026, após a v1.17.0 (PR #4). Reúne o que ficou em aberto
da revisão completa (segurança + UI/UX) e das auditorias das etapas 1–4.
Cada item foi conferido no código desta versão.

Prioridade: **P1** = fazer já · **P2** = próximo ciclo · **P3** = quando der.

## A. Ações de configuração (fora do código)

| # | P | Item | Como |
|---|---|------|------|
| A1 | P1 | Desativar o cadastro público e exigir confirmação de e-mail | Supabase → Authentication → Sign In / Providers. Hoje qualquer pessoa pode criar conta (fica inativa, mas lê as tabelas de referência — ver C6). |
| A2 | P1 | Ativar os backups automáticos | GitHub → Settings → Secrets: `SUPABASE_DB_URL` (Session pooler), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_AGE_RECIPIENT`. Guardar a chave privada do `age` fora do GitHub. Rodar o workflow **Backup** manualmente uma vez e baixar o artefato. |
| A3 | P2 | Ensaiar um restore real | Seguir README → "Backups" num projeto Supabase descartável. |
| A4 | P2 | Adotar o histórico de migrações | `supabase link` → `supabase migration repair --status applied 20260928000000 20260928000100` → `supabase db diff --linked` (deve vir vazio). |
| A5 | P3 | PITR (point-in-time recovery) | Se o plano do Supabase permitir. |
| A6 | P1 | SMTP próprio para os e-mails de autenticação | Sem SMTP próprio o Supabase **só entrega e-mail para membros da equipe do projeto** (2 por hora, sem garantia) — reset de senha e confirmação de cadastro não chegam aos usuários. Supabase → Authentication → Emails → SMTP Settings (ex.: Resend, SendGrid, Amazon SES). |
| A7 | P1 | Liberar a URL de redefinição de senha | Supabase → Authentication → URL Configuration: *Site URL* = endereço do app; em *Redirect URLs* incluir `https://<endereço do app>/auth/reset`. |
| A8 | P1 | Aplicar as migrations novas no Supabase | SQL Editor, na ordem: `supabase/migrations/20260929000000_rate_limits.sql` (C4) e `supabase/migrations/20260929000100_active_reads_insert_audit.sql` (C6 + D2). Sem elas o app funciona, mas o limite de requisições fica só por instância, usuários inativos ainda leem as tabelas de referência e inclusões de leituras/evidências não são auditadas. |
| A9 | P2 | Variáveis do Supabase no ambiente *Preview* da Vercel | Os deploys de preview (um por PR) não têm `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`: só `/login` abre, as outras páginas dão erro 500 (já era assim antes do Next 16). Vercel → Settings → Environment Variables → marcar *Preview* — de preferência apontando para um projeto Supabase de teste, não o de produção. |
| A10 | P3 | Alinhar a versão do Node na Vercel | Vercel → Settings → Build and Deployment → Node.js Version: está 24.x, mas o app declara 22.x (`engines`, que prevalece). Mudar para 22.x só evita confusão. |

## B. Decisões tomadas (29/09/2026)

| # | Decisão | O que muda |
|---|---------|------------|
| B1 | Manter a regra do admin inicial (`hyassuo@gmail.com`) como está | Com A1 (confirmação de e-mail) ninguém consegue assumir o e-mail. Trocar por configuração só ao abrir uma segunda unidade. |
| B2 | Análise por IA só para **admin e inspector** | ✅ Implementado: a rota `app/api/ai/analyze-photo` recusa viewer (o botão já não aparecia para ele). |
| B3 | Filtro de departamento vale em todo o app | ✅ Implementado: Risk Matrix e Schedule respeitam o filtro; o Export pergunta "só este departamento / todos", o nome do arquivo e o cabeçalho do PDF dizem o recorte. |
| D1 | Metodologia principal = **fotos + análise por IA**; leituras de profundidade são opcionais | ✅ Implementado (ver "Concluídos"). Espessura por UT (tubulações) vira item futuro (D3). |

## C. Segurança

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| C5 | P2 | Senhas fracas | Sem MFA e sem troca obrigatória no primeiro acesso. |
| C7 | P3 | Links assinados de fotos valem 1 h | `components/items/EvidencePanel.tsx:101` (`3600`). Reduzir (ex.: 10 min) e renovar sob demanda. |

## D. Dados e lógica

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| D3 | P3 | Módulo de espessura (UT) para tubulações | Futuro: espessura remanescente por ponto, espessura mínima por linha, taxa curto/longo prazo (a maior vale) e vida remanescente — padrão API 570. |

## E. UI/UX

_(nenhum item aberto)_

## F. Engenharia e operação

| # | P | Item | Sugestão |
|---|---|------|----------|
| F1 | P2 | Monitoramento de erros | Sentry ou similar (precisa de conta). |
| F2 | P2 | Tipos do banco escritos à mão | `lib/types/database.types.ts` → gerar com `supabase gen types typescript --linked` e checar no CI. |

## Concluídos

| # | Item | Como ficou |
|---|------|-----------|
| C1 | Reset de senha | O e-mail do "Reset PW" leva a `/auth/reset`, onde o usuário define a nova senha (mín. 8 caracteres). Login ganhou "Esqueci minha senha". Depende de A6 e A7 para os e-mails chegarem. |
| C2 | Sessões de usuário desativado | Desativar bloqueia a conta de autenticação (sem renovar sessão nem entrar de novo); reativar libera. |
| D1 | Taxa de corrosão | Só com ≥ 2 medições reais no mesmo ponto e ≥ 90 dias entre elas; por ponto vale a pior entre longo e curto prazo, e o item assume o pior ponto. Sem isso aparece "dados insuficientes", sem alerta. |
| C8 | ~~Logout de usuário inativo é global~~ | Descartado: para uma conta desativada, encerrar as sessões em todos os aparelhos é o comportamento certo. |
| C3 | CSP com nonce | Páginas com CSP por requisição (nonce + `'strict-dynamic'`, sem `unsafe-inline`/`unsafe-eval` para scripts, Supabase exato, sem Gemini); demais respostas com CSP bloqueado; página offline e service worker com políticas próprias. E2E roda com o CSP real. |
| C4 | Limite de requisições compartilhado | Contadores no Postgres (`rate_limit_hit`), com reserva em memória se a função não existir; cotas diárias de IA (60 por usuário, 500 no total, por dia UTC). |
| C6 | Tabelas de referência só para ativos | `units`, `zones` e `ifs_objects` só são lidas por usuário ativo (qualquer policy antiga aberta é removida). |
| D2 | Auditoria de inclusões | Adicionar leitura ou evidência gera evento (`reading_added` / `evidence_added`) com autor; rascunho de "Novo item" continua cancelável com fotos/leituras. |
| E1 | Busca de item | Campo na barra superior (atalho `/`): nome, código IFS, OS, local funcional, zona, mecanismo ou notas; ignora acentos, maiúsculas e pontuação dos códigos; arquivados por último; funciona offline. |
| E2 | Matriz de risco sem depender de cor | Cada nível tem forma própria (○ baixo, ◇ médio, △ alto, ▲ crítico) e nome lido por leitor de tela ("Risco alto"…), distinto dos nomes de prioridade. |
| E3 | Várias fotos de uma vez | A galeria aceita até 10 arquivos por seleção; cada um vira um registro de evidência (mesma data e descrição), salvos em sequência com progresso. A IA analisa a primeira foto da fila. Se um envio falhar, os já salvos são informados e o restante fica na fila para tentar de novo, sem duplicar. |
| F4 | Planos antigos | Os 5 planos de `docs/plans/` foram conferidos critério a critério contra o código: todos concluídos (alguns por soluções mais novas). Arquivados em `docs/plans/archive/` com um índice; o único resto no código (limites de taxa repetidos no painel de leituras) foi corrigido; os testes que faltavam foram para o F3. |
| E4 | Tema escuro | Botão na barra superior alterna dispositivo → claro → escuro (lembrado em cookie, já aplicado na primeira pintura, sem script inline). Contraste AA em todas as telas nos dois temas (mín. 4,52:1 claro / 5,34:1 escuro, verificado em teste); impressão e PDF sempre claros. |
| F3 | Testes E2E ampliados | 6 cenários novos: item arquivado (fora das telas e do PDF, dentro do CSV/XLSX; Arquivar/Desarquivar), IA no item (só campos vazios, "Aplicar" sobrescreve, leitura estimada só no Salvar e fora da taxa), SECE sobe a prioridade, conteúdo do PDF (uma linha por item, nota de fotos), página de Usuários e higiene das rotas (JSON inválido, 429, mensagens genéricas), prefetch sem sessão. Mais testes unitários do filtro da saída da IA e checagem SQL entre unidades. Continuam sem teste automático: câmera real, IA real (Gemini) e Realtime. |
| E5 | Padronização visual | Tailwind removido (o reset base dele foi copiado para o `globals.css`, sem mudança visual); uma escala de fontes em `DS.fs`, sem texto abaixo de 10 px; botões e caixas de mensagem feitos à mão viraram os componentes `Button` e `Notice` em `components/ui/`. |
| F5 | Migração de versões major | Next 15 → 16 (build com Turbopack; `middleware.ts` virou `proxy.ts`, mesmo CSP com nonce), React 18 → 19, Vitest 4 → 5, ESLint 8 → 9 com config flat (`eslint .`, mesmas regras de antes). Sem mudança de comportamento; unitários, SQL e os 57 cenários E2E passando. |
