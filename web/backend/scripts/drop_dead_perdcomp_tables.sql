-- ════════════════════════════════════════════════════════════════════════════
-- Saneamento PER/DCOMP — Drop de tabelas órfãs após remoção de features mortas
-- Data: 2026-05-12
-- ════════════════════════════════════════════════════════════════════════════
-- Contexto: O código que escrevia/lia destas tabelas foi removido. Elas eram
-- usadas pelos fluxos descontinuados: Pedidos, Simulador, Assistente IA,
-- Alertas, Jobs RPA. O fluxo ativo agora é apenas Dashboard + Documentos e-CAC
-- + Créditos/Débitos + Relatórios.
--
-- ⚠️  AVISO: Esta migration é DESTRUTIVA. Faça backup antes de executar:
--     pg_dump -t perdcomp_pedidos -t perdcomp_pedido_itens -t perdcomp_documentos \
--             -t perdcomp_alertas -t jobs_execucao -t comprovantes \
--             $DATABASE_URL > backup_perdcomp_legacy_$(date +%Y%m%d).sql
--
-- ⚠️  Antes de rodar: verifique que NENHUMA das tabelas tem dados que você
--     precise guardar. Para checar:
--     SELECT 'perdcomp_pedidos' AS t, COUNT(*) FROM perdcomp_pedidos
--     UNION ALL SELECT 'perdcomp_pedido_itens', COUNT(*) FROM perdcomp_pedido_itens
--     UNION ALL SELECT 'perdcomp_documentos',   COUNT(*) FROM perdcomp_documentos
--     UNION ALL SELECT 'perdcomp_alertas',      COUNT(*) FROM perdcomp_alertas
--     UNION ALL SELECT 'jobs_execucao',         COUNT(*) FROM jobs_execucao
--     UNION ALL SELECT 'comprovantes',          COUNT(*) FROM comprovantes;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Remove FK constraints que apontam para perdcomp_pedidos ───────────────
-- (necessário antes de dropar perdcomp_pedidos)
ALTER TABLE IF EXISTS perdcomp_pedido_itens
  DROP CONSTRAINT IF EXISTS perdcomp_pedido_itens_id_pedido_fkey;
ALTER TABLE IF EXISTS perdcomp_historico
  DROP CONSTRAINT IF EXISTS perdcomp_historico_id_pedido_fkey;
ALTER TABLE IF EXISTS perdcomp_documentos
  DROP CONSTRAINT IF EXISTS perdcomp_documentos_id_pedido_fkey;
ALTER TABLE IF EXISTS perdcomp_alertas
  DROP CONSTRAINT IF EXISTS perdcomp_alertas_id_pedido_fkey;

-- ─── 2. Remove coluna id_pedido órfã em perdcomp_historico ────────────────────
-- (tabela mantida — helper registrarHistorico ainda audita Créditos e Débitos)
ALTER TABLE IF EXISTS perdcomp_historico
  DROP COLUMN IF EXISTS id_pedido;

-- ─── 3. Drop tabelas mortas ───────────────────────────────────────────────────
-- Pedidos antigos (substituído por Documentos PER/DCOMP em perdcomps)
DROP TABLE IF EXISTS perdcomp_pedido_itens;  -- depende de pedidos
DROP TABLE IF EXISTS perdcomp_pedidos;

-- Documentos do fluxo antigo (anexos a pedidos) — NÃO confundir com:
--   • ecac_perdcomp_documentos (importados do e-CAC, ATIVO)
--   • perdcomps                (documento oficial PER/DCOMP, ATIVO)
DROP TABLE IF EXISTS perdcomp_documentos;

-- Alertas (feature removida)
DROP TABLE IF EXISTS perdcomp_alertas;

-- Jobs RPA / e-CAC (feature removida — sync agora é direto via ecacController)
DROP TABLE IF EXISTS jobs_execucao;

-- Comprovantes antigos (substituído por `recibos` ligado a `perdcomps`)
DROP TABLE IF EXISTS comprovantes;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Pós-migration: tabelas que PERMANECEM e seguem em uso
-- ════════════════════════════════════════════════════════════════════════════
--   ATIVO (fluxo principal e-CAC):
--     • adm_empresas, adm_usuarios          — usuários e empresas
--     • certificados_digitais               — certificados A1/A3
--     • ecac_sincronizacoes                 — log de sincronizações e-CAC
--     • ecac_perdcomp_documentos            — documentos importados do e-CAC
--     • ecac_perdcomp_debitos_compensados   — débitos compensados via DCOMP
--     • saldos_credito                      — saldos consolidados (planilha)
--     • movimentacoes_saldo                 — movimentos dos saldos
--     • perdcomps                           — documentos oficiais (sistema)
--     • creditos_tributarios                — créditos vinculados aos perdcomps
--     • debitos_perdcomp                    — débitos compensados nos perdcomps
--     • responsaveis_preenchimento          — responsável pelo PER/DCOMP
--     • historico_status_perdcomp           — histórico de status
--     • recibos                             — recibos SERPRO
--     • perdcomp_creditos                   — créditos (gestão manual)
--     • perdcomp_debitos                    — débitos (gestão manual)
--     • perdcomp_historico                  — auditoria de Créditos/Débitos
--     • perdcomp_selic_taxas                — taxa SELIC mensal
--     • perdcomp_empresas                   — empresas vinculadas ao módulo
