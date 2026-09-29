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

## B. Decisões tomadas (29/09/2026)

| # | Decisão | O que muda |
|---|---------|------------|
| B1 | Manter a regra do admin inicial (`hyassuo@gmail.com`) como está | Com A1 (confirmação de e-mail) ninguém consegue assumir o e-mail. Trocar por configuração só ao abrir uma segunda unidade. |
| B2 | Análise por IA só para **admin e inspector** | Rota `app/api/ai/analyze-photo` passa a recusar viewer; o botão some para viewer. |
| B3 | Filtro de departamento vale em todo o app | Risk Matrix e Schedule respeitam o filtro; o Export ganha a escolha "só este departamento / todos" e o PDF traz o departamento no cabeçalho. |
| D1 | Metodologia principal = **fotos + análise por IA**; leituras de profundidade são opcionais | Ver D1 abaixo. Espessura por UT (tubulações) vira item futuro (D3). |

## C. Segurança

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| C1 | P1 | Reset de senha provavelmente não funciona | `app/api/users/reset/route.ts:48` manda o link para `/login`, e não existe tela de nova senha nem tratamento do evento `PASSWORD_RECOVERY`. Criar rota de callback + tela "definir nova senha". |
| C2 | P1 | Desativar usuário não encerra as sessões dele | `app/api/users/update/route.ts`: além de `active = false`, revogar as sessões (ban temporário ou sign-out pelo Admin API). Hoje o token segue válido até expirar. |
| C3 | P2 | CSP permissivo | `next.config.mjs:12-16`: `'unsafe-eval'` e `'unsafe-inline'` em `script-src`, `https://*.supabase.co` genérico e Gemini no `connect-src` (só o servidor chama o Gemini). Usar nonce, a URL exata do projeto, e remover o Gemini. |
| C4 | P2 | Rate limit em memória | `lib/utils/rateLimit.ts` conta por instância — na Vercel (serverless) não limita de verdade. Mover para Postgres/KV e criar cota diária de IA. |
| C5 | P2 | Senhas fracas | Sem MFA e sem troca obrigatória no primeiro acesso. |
| C6 | P3 | Usuário inativo lê tabelas de referência | Policies `units`, `zones`, `ifs_objects` usam `USING (true)`. Trocar por "usuário ativo". |
| C7 | P3 | Links assinados de fotos valem 1 h | `components/items/EvidencePanel.tsx:101` (`3600`). Reduzir (ex.: 10 min) e renovar sob demanda. |
| C8 | P3 | Logout de usuário inativo é global | `app/(app)/layout.tsx:26` chama `signOut()` sem `{ scope: "local" }`. |

## D. Dados e lógica

| # | P | Item | Onde / sugestão |
|---|---|------|-----------------|
| D1 | P2 | Taxa de corrosão só com medição real e comparável | `lib/domain/calcRate.ts:21`: calcular apenas com ≥ 2 medições reais **no mesmo ponto** e ≥ 90 dias entre elas; senão, "dados insuficientes" (sem alerta). Estimativas da IA seguem fora da taxa. Status/prioridade continuam guiados pela avaliação visual (P×C). |
| D2 | P3 | Auditoria não registra inclusão de leituras e evidências | Exclusões e mudanças no item são auditadas; inserções de leituras/evidências não. |
| D3 | P3 | Módulo de espessura (UT) para tubulações | Futuro: espessura remanescente por ponto, espessura mínima por linha, taxa curto/longo prazo (a maior vale) e vida remanescente — padrão API 570. |

## E. UI/UX

| # | P | Item | Sugestão |
|---|---|------|----------|
| E1 | P2 | Busca de item | Não existe busca global (só a busca IFS dentro do modal). |
| E2 | P2 | Matriz de risco depende só da cor | Os badges têm texto, mas as células da matriz não. Adicionar letra/ícone por nível (daltonismo, sol forte). |
| E3 | P3 | Câmera: uma foto por vez | Permitir várias fotos (`multiple` na galeria). |
| E4 | P3 | Tema escuro | Útil à noite e em ambientes escuros. |
| E5 | P3 | Padronização visual | Ainda há três sistemas de estilo (inline, CSS próprio, Tailwind configurado e não usado) e muitos tamanhos de fonte. Continuar migrando para os componentes base em `components/ui/`. |

## F. Engenharia e operação

| # | P | Item | Sugestão |
|---|---|------|----------|
| F1 | P2 | Monitoramento de erros | Sentry ou similar (precisa de conta). |
| F2 | P2 | Tipos do banco escritos à mão | `lib/types/database.types.ts` → gerar com `supabase gen types typescript --linked` e checar no CI. |
| F3 | P3 | Lacunas dos testes E2E | Login e Storage são simulados; página de Usuários, câmera real, IA e Realtime não são cobertos. |
| F4 | P3 | Planos antigos em `docs/plans/` | Os 5 planos parecem já executados (amostras conferidas: data local, penalidade única, PDF sem corte de zona, IA sem sobrescrever, rate limit nas rotas de usuários). Revisar os critérios de aceite e arquivar. |
| F5 | P3 | Migração de versões major | Next 15 → 16, React 18 → 19, Vitest 4 → 5: o Dependabot passou a ignorar majors; fazer como projeto próprio, com os testes E2E como rede de segurança. |
