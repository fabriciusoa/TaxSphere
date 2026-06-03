import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { recarregarAgendamentoAutomacao, executarAutomacao } from '../services/perdcompAutomacaoScheduler';
import { automacaoControl } from '../services/perdcompAutomacaoControl';

/**
 * Configuração de automações do e-CAC por empresa.
 *
 * Fluxos cobertos:
 *   • sync_documentos  → consulta lista de PER/DCOMPs no e-CAC (extração)
 *   • baixar_recibos   → baixa PDFs dos recibos via Playwright
 *   • baixar_documentos → baixa PDF completo de cada PER/DCOMP
 *   • sync_saldos      → recalcula saldos a partir dos recibos parseados
 *
 * O agendador cron lê esta tabela e roda os fluxos ativos no horário configurado.
 */

// Cache curtíssimo (300ms) compartilhado entre requests concorrentes.
// O endpoint é polled pelo frontend (a cada 1.5s) E pelo monitor QA (a cada 2s).
// Sob carga, isso multiplica queries idênticas; um cache de 300ms colapsa todas
// as concorrentes em uma única ida ao banco sem afetar a experiência do usuário.
let configCache: { at: number; payload: any } | null = null;
const CONFIG_CACHE_TTL_MS = 300;
function readCache(): any | null {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_TTL_MS) return configCache.payload;
  return null;
}
function writeCache(payload: any): void { configCache = { at: Date.now(), payload }; }
function invalidateCache(): void { configCache = null; }

export const perdcompAutomacaoController = {
  /**
   * Retorna a configuração geral + linha por empresa.
   * Empresas sem registro recebem flags=false (default).
   */
  obterConfig: async (req: AuthRequest, res: Response) => {
    try {
      const cached = readCache();
      if (cached) return res.json(cached);

      // Três queries PARALELAS. Substituímos o LEFT JOIN LATERAL por uma agregação
      // simples (DISTINCT ON) para evitar contenção de lock com o UPSERT que o runner
      // executa em `ecac_automacao_config` sob carga concorrente (causava 40P01).
      const [global, empresasRaw, certsAtivosRaw] = await Promise.all([
        getOne<any>(
          `SELECT id, ativo, horario_diario, atualizado_em
             FROM ecac_automacao_config_global WHERE id = 1`
        ),
        getAll<any>(
          `SELECT
              e.id, e.cnpj, e.razao_social, e.nome_fantasia,
              COALESCE(c.sync_documentos_ativo, false)   AS sync_documentos_ativo,
              COALESCE(c.baixar_recibos_ativo, false)    AS baixar_recibos_ativo,
              COALESCE(c.baixar_documentos_ativo, false) AS baixar_documentos_ativo,
              COALESCE(c.sync_saldos_ativo, false)       AS sync_saldos_ativo,
              c.ultima_execucao, c.ultima_execucao_status, c.ultima_execucao_msg
            FROM adm_empresas e
            LEFT JOIN ecac_automacao_config c ON c.id_empresa = e.id
            ORDER BY e.razao_social`
        ),
        getAll<{ id_empresa: number; tem_sessao: boolean }>(
          `SELECT DISTINCT ON (id_empresa) id_empresa, (sessao_cookies IS NOT NULL) AS tem_sessao
             FROM certificados_digitais
            WHERE ativo = 1
            ORDER BY id_empresa, criado_em DESC`
        ),
      ]);

      const certPorEmpresa = new Map(certsAtivosRaw.map(c => [c.id_empresa, c.tem_sessao]));
      const empresas = empresasRaw.map(e => ({
        ...e,
        tem_certificado_ativo: certPorEmpresa.has(e.id),
        tem_sessao_ecac: !!certPorEmpresa.get(e.id),
      }));

      const payload = { global, empresas };
      writeCache(payload);
      res.json(payload);
    } catch (error: any) {
      log.error(`Erro ao obter config automação: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Atualiza a configuração GLOBAL (ativo + horário).
   * Body: { ativo: boolean, horario_diario: 'HH:MM' }
   */
  atualizarGlobal: async (req: AuthRequest, res: Response) => {
    try {
      const { ativo, horario_diario } = req.body;
      if (typeof ativo !== 'boolean') return res.status(400).json({ error: 'ativo é obrigatório (boolean)' });
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario_diario || '')) {
        return res.status(400).json({ error: 'horario_diario inválido — use HH:MM (24h)' });
      }

      await runQuery(
        `UPDATE ecac_automacao_config_global
         SET ativo = $1, horario_diario = $2, atualizado_em = NOW(), atualizado_por_id = $3
         WHERE id = 1`,
        [ativo, horario_diario, req.user!.id]
      );
      invalidateCache();

      // Notifica o scheduler para reler a config
      try {
        await recarregarAgendamentoAutomacao();
      } catch (e: any) {
        log.warn(`[automacao] Falha ao recarregar scheduler: ${e.message}`);
      }

      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro ao atualizar config global: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Atualiza as flags de UMA empresa. Cria a linha se não existir.
   * Body: { sync_documentos_ativo, baixar_recibos_ativo, baixar_documentos_ativo, sync_saldos_ativo }
   */
  atualizarEmpresa: async (req: AuthRequest, res: Response) => {
    try {
      const idEmpresa = Number(req.params.id);
      if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });

      const body = req.body || {};
      const flags = ['sync_documentos_ativo', 'baixar_recibos_ativo', 'baixar_documentos_ativo', 'sync_saldos_ativo'];
      for (const f of flags) {
        if (typeof body[f] !== 'boolean') return res.status(400).json({ error: `${f} é obrigatório (boolean)` });
      }

      await runQuery(
        `INSERT INTO ecac_automacao_config
           (id_empresa, sync_documentos_ativo, baixar_recibos_ativo, baixar_documentos_ativo, sync_saldos_ativo, atualizado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id_empresa) DO UPDATE SET
           sync_documentos_ativo   = EXCLUDED.sync_documentos_ativo,
           baixar_recibos_ativo    = EXCLUDED.baixar_recibos_ativo,
           baixar_documentos_ativo = EXCLUDED.baixar_documentos_ativo,
           sync_saldos_ativo       = EXCLUDED.sync_saldos_ativo,
           atualizado_em           = NOW(),
           atualizado_por_id       = EXCLUDED.atualizado_por_id`,
        [idEmpresa, body.sync_documentos_ativo, body.baixar_recibos_ativo, body.baixar_documentos_ativo, body.sync_saldos_ativo, req.user!.id]
      );
      invalidateCache();

      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro ao atualizar config empresa: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Executa a automação AGORA para uma empresa específica (ou todas ativas se id_empresa = null).
   * Não bloqueia: dispara em background e retorna 202.
   */
  /** Sinaliza pausa para o pipeline em andamento daquela empresa. */
  pausar: async (req: AuthRequest, res: Response) => {
    const idEmpresa = Number(req.params.id);
    if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
    automacaoControl.pause(idEmpresa);
    res.json({ ok: true });
  },

  /** Retoma execução pausada. */
  retomar: async (req: AuthRequest, res: Response) => {
    const idEmpresa = Number(req.params.id);
    if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
    automacaoControl.resume(idEmpresa);
    res.json({ ok: true });
  },

  /** Cancela o pipeline em andamento — runner aborta na próxima etapa. */
  cancelar: async (req: AuthRequest, res: Response) => {
    const idEmpresa = Number(req.params.id);
    if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
    automacaoControl.cancel(idEmpresa);
    res.json({ ok: true });
  },

  executarAgora: async (req: AuthRequest, res: Response) => {
    try {
      const idEmpresa = req.params.id ? Number(req.params.id) : null;

      // Dispara em background sem aguardar
      executarAutomacao(idEmpresa, req.user!.id).catch((err: any) => {
        log.error(`[automacao] Execução manual falhou: ${err.message}`);
      });

      res.status(202).json({
        ok: true,
        message: idEmpresa
          ? `Execução manual disparada para empresa ${idEmpresa}`
          : 'Execução manual disparada para todas as empresas ativas',
      });
    } catch (error: any) {
      log.error(`Erro ao executar automação: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};
