# Planos arquivados

Os cinco planos abaixo guiaram as correções de estrutura do sistema. Todos foram
conferidos contra o código em 29/09/2026 e estão concluídos. Onde a solução
final ficou diferente do plano, a coluna "Observação" explica. Ficam aqui
apenas como histórico: o que está em aberto vive em [`docs/BACKLOG.md`](../../BACKLOG.md).

| Ordem | Plano | Situação | Observação |
|---|---|---|---|
| 1 | [Test harness + CI](test-harness-and-ci.md) | Concluído | Vitest com testes de domínio; CI com lint, typecheck, testes, build, `npm audit`, matriz de 4 fusos, testes SQL e E2E. |
| 2 | [Domain correctness](domain-correctness.md) | Concluído | Data local, penalidade de atraso única, arquivados fora das telas (mas nas exportações CSV/XLSX), limites de taxa compartilhados. A regra da taxa de corrosão foi depois substituída pela decisão D1 (mesmo ponto, ≥ 90 dias). |
| 3 | [ItemModal data integrity](item-modal-data-integrity.md) | Concluído | IA só preenche campos vazios; leitura da IA só grava no Salvar; aviso de evidência não salva; nome obrigatório; botão Arquivar. O aviso ao cancelar virou a proteção geral de fechamento do modal. |
| 4 | [PDF export integrity](pdf-export-integrity.md) | Concluído | Zonas quebram entre páginas; fotos que falham são contadas e informadas; download compartilhado. A busca do histórico para o XLSX passou a ser paginada (com limite de tempo). |
| 5 | [Security hardening consolidation](security-hardening-consolidation.md) | Concluído | O antigo `supabase-setup.sql` foi substituído pela migração `20260928000000_baseline.sql`, já no estado final (rodadas 1–5); `supabase/upgrades/` guarda o caminho de atualização. Validação de JSON, mensagens genéricas, saída da IA validada no servidor. |

Os testes de regressão que ainda faltam para alguns critérios desses planos
estão no item F3 do backlog.
