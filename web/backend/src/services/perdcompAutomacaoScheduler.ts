import cron, { ScheduledTask } from 'node-cron';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { runAutomacaoEmpresa } from './perdcompAutomacaoRunner';

/**
 * Agendador de automações do e-CAC.
 *
 * Comportamento:
 *   • Ao bootar, lê a config global e agenda um cron diário no horário configurado.
 *   • Quando o usuário muda o horário/ativa-desativa via UI, chama
 *     `recarregarAgendamentoAutomacao()` para refazer o agendamento.
 *   • A tarefa cron itera as empresas com `ativo=true` no global E pelo menos
 *     uma flag ativada na config_empresa, e dispara os fluxos selecionados
 *     sequencialmente (para não saturar o e-CAC).
 *
 * O agendamento usa node-cron (in-memory). Em caso de restart do backend,
 * o próximo gatilho será o próximo horário diário configurado.
 */

let tarefaAtual: ScheduledTask | null = null;
let configHoraAtual: string | null = null;

interface ConfigEmpresa {
  id_empresa: number;
  cnpj: string;
  razao_social: string;
  sync_documentos_ativo: boolean;
  baixar_recibos_ativo: boolean;
  baixar_documentos_ativo: boolean;
  sync_saldos_ativo: boolean;
}

interface ConfigGlobal {
  ativo: boolean;
  horario_diario: string;
}

/**
 * Lê a config global e (re)agenda a tarefa cron.
 * Idempotente — chamado no boot e a cada update do usuário.
 */
export async function recarregarAgendamentoAutomacao(): Promise<void> {
  // Limpa execuções órfãs (em_andamento que sobreviveram a um restart do backend).
  // Sem o processo Playwright em background, essas rows ficariam "em_andamento" pra sempre.
  try {
    const limpeza = await getOne<{ count: number }>(
      `WITH x AS (
         UPDATE ecac_automacao_config
         SET ultima_execucao_status = 'erro',
             ultima_execucao_msg = 'Backend reiniciado durante execução. Tente novamente.'
         WHERE ultima_execucao_status = 'em_andamento'
         RETURNING id_empresa
       ) SELECT COUNT(*)::int AS count FROM x`
    );
    if (limpeza && limpeza.count > 0) {
      log.warn(`[automacao] Limpeza de boot: ${limpeza.count} execução(ões) órfã(s) marcada(s) como erro`);
    }
  } catch (e: any) {
    log.warn(`[automacao] Falha na limpeza de boot: ${e.message}`);
  }

  const cfg = await getOne<ConfigGlobal>(
    `SELECT ativo, horario_diario FROM ecac_automacao_config_global WHERE id = 1`
  );

  // Cancela tarefa anterior
  if (tarefaAtual) {
    tarefaAtual.stop();
    tarefaAtual = null;
    configHoraAtual = null;
  }

  if (!cfg || !cfg.ativo) {
    log.info('[automacao] Scheduler DESATIVADO (config.ativo = false)');
    return;
  }

  const [h, m] = (cfg.horario_diario || '02:00').split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    log.error(`[automacao] horario_diario inválido: ${cfg.horario_diario}`);
    return;
  }

  const cronExpr = `${m} ${h} * * *`; // todo dia HH:MM
  log.info(`[automacao] Scheduler ATIVO — cron="${cronExpr}" (executa diariamente às ${cfg.horario_diario})`);

  tarefaAtual = cron.schedule(cronExpr, () => {
    log.info('[automacao] === Disparo cron — iniciando varredura de empresas ===');
    // isBatch=true: cron noturno, sujeito à janela 18h-24h do e-CAC
    executarAutomacao(null, 0, true).catch(err => log.error(`[automacao] Falha cron: ${err.message}`));
  }, { timezone: 'America/Sao_Paulo' });

  configHoraAtual = cfg.horario_diario;
}

/**
 * Executa o pipeline de automação.
 * @param idEmpresa Se fornecido, roda só essa empresa; se null, roda TODAS com pelo menos
 *                  uma flag ativa.
 * @param idUsuario Usuário responsável (0 = sistema/cron).
 * @param isBatch true quando disparado pelo cron (impõe janela 18h-24h do e-CAC).
 *                false quando disparado pelo usuário via "Executar agora" (qualquer horário).
 */
export async function executarAutomacao(idEmpresa: number | null, idUsuario: number, isBatch = false): Promise<void> {
  const where = idEmpresa
    ? `c.id_empresa = $1`
    : `(c.sync_documentos_ativo OR c.baixar_recibos_ativo OR c.baixar_documentos_ativo OR c.sync_saldos_ativo)`;
  const params = idEmpresa ? [idEmpresa] : [];

  const empresas = await getAll<ConfigEmpresa>(
    `SELECT
        e.id AS id_empresa, e.cnpj, e.razao_social,
        c.sync_documentos_ativo, c.baixar_recibos_ativo,
        c.baixar_documentos_ativo, c.sync_saldos_ativo
     FROM ecac_automacao_config c
     JOIN adm_empresas e ON e.id = c.id_empresa
     WHERE ${where}`,
    params
  );

  if (empresas.length === 0) {
    log.warn('[automacao] Nenhuma empresa com flags ativas para executar');
    return;
  }

  log.info(`[automacao] Iniciando para ${empresas.length} empresa(s)`);

  for (const emp of empresas) {
    try {
      await executarParaEmpresa(emp, idUsuario, isBatch);
    } catch (err: any) {
      log.error(`[automacao] Empresa ${emp.id_empresa} (${emp.razao_social}) falhou: ${err.message}`);
      await runQuery(
        `INSERT INTO ecac_automacao_config (id_empresa, ultima_execucao, ultima_execucao_status, ultima_execucao_msg)
         VALUES ($1, NOW(), 'erro', $2)
         ON CONFLICT (id_empresa) DO UPDATE SET
           ultima_execucao = NOW(),
           ultima_execucao_status = 'erro',
           ultima_execucao_msg = $2`,
        [emp.id_empresa, err.message.substring(0, 1000)]
      ).catch(() => {});
    }
  }

  log.info('[automacao] === Pipeline concluído ===');
}

/**
 * Executa os fluxos ativos para UMA empresa (sequencialmente, para não saturar o e-CAC).
 * Reaproveita os endpoints já existentes via chamada interna ao controller.
 */
async function executarParaEmpresa(emp: ConfigEmpresa, _idUsuario: number, isBatch: boolean): Promise<void> {
  log.info(`[automacao] Processando ${emp.razao_social} (${emp.id_empresa})`);

  // Marca início
  await runQuery(
    `INSERT INTO ecac_automacao_config (id_empresa, ultima_execucao, ultima_execucao_status, ultima_execucao_msg)
     VALUES ($1, NOW(), 'em_andamento', 'Iniciando pipeline')
     ON CONFLICT (id_empresa) DO UPDATE SET
       ultima_execucao = NOW(),
       ultima_execucao_status = 'em_andamento',
       ultima_execucao_msg = 'Iniciando pipeline'`,
    [emp.id_empresa]
  );

  const etapas: string[] = [];

  const resultado = await runAutomacaoEmpresa({
    id_empresa: emp.id_empresa,
    sync_documentos: emp.sync_documentos_ativo,
    baixar_recibos: emp.baixar_recibos_ativo,
    baixar_documentos: emp.baixar_documentos_ativo,
    sync_saldos: emp.sync_saldos_ativo,
    is_batch: isBatch,
  });

  etapas.push(...resultado.etapas);

  await runQuery(
    `UPDATE ecac_automacao_config
     SET ultima_execucao = NOW(),
         ultima_execucao_status = $1,
         ultima_execucao_msg = $2
     WHERE id_empresa = $3`,
    [
      resultado.sucesso ? 'concluido' : 'erro',
      etapas.join(' | ').substring(0, 1000),
      emp.id_empresa,
    ]
  );

  log.info(`[automacao] ${emp.razao_social} → ${resultado.sucesso ? 'OK' : 'ERRO'}`);
}

// Expõe o horário atual (pra debug)
export function getHorarioAtual(): string | null {
  return configHoraAtual;
}
