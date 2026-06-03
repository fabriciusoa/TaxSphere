/**
 * Controller do módulo DCTFWeb.
 *
 * Funcionalidades:
 *   ─ Dashboard com KPIs (a vencer, em atraso, total a pagar, taxa de transmissão)
 *   ─ Listar declarações com filtros e paginação
 *   ─ CRUD básico (criar / atualizar / excluir / buscar por id)
 *   ─ DARFs: gerar (stub), marcar como pago, listar pendentes/vencidos
 *   ─ Relatórios: vencimentos próximos, atrasos, projeção de caixa
 *   ─ Configuração de automação por empresa (flags) + global (horário)
 *   ─ Executar agora (uma empresa ou todas com flags ativas)
 *
 * Todas as queries tratam `42P01` (tabela ainda não criada) como "módulo não
 * provisionado" para não derrubar a UI em ambientes recém-instalados.
 */
import { Response } from 'express';
import { getOne, getAll, runQuery } from '../database/connection';
import { AuthRequest } from '../types';
import { log } from '../utils/logger';
import { runDctfwebEmpresa } from '../services/dctfwebAutomacaoRunner';
import { dctfwebControl } from '../services/dctfwebAutomacaoControl';
import { importarXmlDctfweb } from '../services/dctfwebImportService';
import {
  CATEGORIAS_DCTFWEB, SITUACOES_DCTFWEB, ORIGENS_DEBITOS,
  calcularMaed, filtroPadraoTelaInicial,
} from '../services/dctfwebRegrasService';

// Labels oficiais conforme manual cap. 8.4
const SITUACAO_BUCKETS: Record<string, string> = Object.fromEntries(
  Object.entries(SITUACOES_DCTFWEB).map(([k, v]) => [k, v.label])
);

// Normalizador local mantido para compat; em rotas novas usar normalizarSituacao do regrasService
function normalizarSituacao(s: string | null | undefined): string {
  if (!s) return 'EM_ANDAMENTO';
  const v = s.toLowerCase();
  if (v.includes('andam') || v.includes('edi'))     return 'EM_ANDAMENTO';
  if (v.includes('ativ'))                            return 'ATIVA';
  if (v.includes('retif'))                           return 'RETIFICADA';
  if (v.includes('exclu') && !v.includes('inde'))    return 'EXCLUIDA';
  if (v.includes('inde'))                            return 'INDEVIDA';
  if (v.includes('fasea'))                           return 'FASEAMENTO';
  return 'EM_ANDAMENTO';
}

const EMPTY_DASHBOARD = {
  kpis: {
    total_declaracoes: 0, taxa_transmissao: 0, total_a_pagar: 0,
    darfs_vencidos: 0, valor_vencidos: 0,
    darfs_a_vencer_7d: 0, valor_a_vencer_7d: 0,
    darfs_a_vencer_15d: 0, valor_a_vencer_15d: 0,
    darfs_a_vencer_30d: 0, valor_a_vencer_30d: 0,
    declaracoes_com_divergencia: 0,
    declaracoes_em_andamento: 0,
    declaracoes_impedem_cnd: 0,
    valor_maed_pendente: 0,
  },
  por_situacao: [], por_categoria: [], por_origem: [],
  evolucao: [], top_empresas_a_pagar: [], proximos_vencimentos: [],
  alertas_cnd: [], proximos_prazos_legais: [],
  warning: 'módulo DCTFweb ainda não provisionado',
};

// Cache curtíssimo (300ms) compartilhado entre requests concorrentes — mesma
// estratégia do perdcompAutomacaoController.
let dctfwebConfigCache: { at: number; payload: any } | null = null;
const DCTFWEB_CONFIG_CACHE_TTL_MS = 300;
function readDctfwebConfigCache(): any | null {
  if (dctfwebConfigCache && Date.now() - dctfwebConfigCache.at < DCTFWEB_CONFIG_CACHE_TTL_MS) return dctfwebConfigCache.payload;
  return null;
}
function writeDctfwebConfigCache(p: any): void { dctfwebConfigCache = { at: Date.now(), payload: p }; }
function invalidateDctfwebConfigCache(): void { dctfwebConfigCache = null; }

export const dctfwebController = {
  // ────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ────────────────────────────────────────────────────────────────────────────
  dashboard: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query as Record<string, string | undefined>;
      const params: any[] = id_empresa ? [Number(id_empresa)] : [];
      const filtroEmpresa = id_empresa ? 'AND d.id_empresa = $1' : '';

      // KPIs principais agregados (uma query só) — alinhados com manual cap. 7-8
      const kpis = await getOne<any>(
        `SELECT
            COUNT(*)::int AS total_declaracoes,
            COUNT(*) FILTER (WHERE d.situacao_normalizada = 'ATIVA')::int AS ativas,
            COUNT(*) FILTER (WHERE d.situacao_normalizada = 'EM_ANDAMENTO')::int AS em_andamento,
            COUNT(*) FILTER (WHERE d.situacao_normalizada IN ('ATIVA','RETIFICADA','EXCLUIDA','INDEVIDA'))::int AS transmitidas,
            COALESCE(SUM(d.saldo_pagar), 0)::float AS total_a_pagar,
            COUNT(*) FILTER (WHERE d.divergencia = TRUE)::int AS com_divergencia,
            COUNT(*) FILTER (WHERE d.impede_cnd = TRUE)::int AS impedem_cnd,
            COALESCE(SUM(d.maed_valor) FILTER (WHERE d.maed_paga = FALSE), 0)::float AS valor_maed_pendente,
            COALESCE(SUM(d.valor_esocial), 0)::float AS total_esocial,
            COALESCE(SUM(d.valor_reinf_cp), 0)::float AS total_reinf_cp,
            COALESCE(SUM(d.valor_reinf_ret), 0)::float AS total_reinf_ret,
            COALESCE(SUM(d.valor_mit), 0)::float AS total_mit,
            COALESCE(SUM(d.valor_sero), 0)::float AS total_sero
         FROM dctfweb_declaracoes d
         WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}`,
        params
      );

      // ─── Distribuição por CATEGORIA (manual cap. 8.1) ─────────────────────
      const porCategoria = await getAll<any>(
        `SELECT COALESCE(d.categoria, 'GERAL') AS chave,
                COUNT(*)::int AS total,
                COALESCE(SUM(d.saldo_pagar), 0)::float AS valor
         FROM dctfweb_declaracoes d
         WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}
         GROUP BY d.categoria
         ORDER BY total DESC`,
        params
      );

      // ─── Distribuição por ORIGEM dos débitos (manual cap. 8.2) ────────────
      // Calculada a partir dos valor_* colunados — soma valores não-zero por origem.
      const porOrigem = await getAll<any>(
        `WITH origens AS (
           SELECT 'ESOCIAL'    AS chave, SUM(d.valor_esocial)::float    AS valor, COUNT(*) FILTER (WHERE d.valor_esocial > 0)::int AS total FROM dctfweb_declaracoes d WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}
           UNION ALL SELECT 'REINF_CP',  SUM(d.valor_reinf_cp)::float,  COUNT(*) FILTER (WHERE d.valor_reinf_cp > 0)::int FROM dctfweb_declaracoes d WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}
           UNION ALL SELECT 'REINF_RET', SUM(d.valor_reinf_ret)::float, COUNT(*) FILTER (WHERE d.valor_reinf_ret > 0)::int FROM dctfweb_declaracoes d WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}
           UNION ALL SELECT 'MIT',       SUM(d.valor_mit)::float,       COUNT(*) FILTER (WHERE d.valor_mit > 0)::int FROM dctfweb_declaracoes d WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}
           UNION ALL SELECT 'SERO',      SUM(d.valor_sero)::float,      COUNT(*) FILTER (WHERE d.valor_sero > 0)::int FROM dctfweb_declaracoes d WHERE d.situacao_normalizada != 'FASEAMENTO' ${filtroEmpresa}
         ) SELECT chave, COALESCE(valor,0) AS valor, COALESCE(total,0) AS total FROM origens WHERE COALESCE(valor,0) > 0 ORDER BY valor DESC`,
        params.length ? Array(5).fill(params[0]).map((p) => p) : []
      );

      // ─── Alertas de CND impedida (manual cap. 17.1.1) ─────────────────────
      const alertasCnd = await getAll<any>(
        `SELECT d.id, d.id_empresa, e.razao_social, e.cnpj,
                d.periodo_apuracao, d.categoria, d.tipo,
                d.impede_cnd_motivo,
                (CURRENT_DATE - d.criado_em::date)::int AS dias_pendente
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE d.impede_cnd = TRUE
           ${id_empresa ? 'AND d.id_empresa = $1' : ''}
         ORDER BY d.criado_em ASC
         LIMIT 20`,
        params
      );

      // ─── Próximos prazos LEGAIS (cap. 4.2) — diferente de DARF que é pagamento ─
      const proximosPrazos = await getAll<any>(
        `SELECT d.id, d.id_empresa, e.razao_social, e.cnpj,
                d.periodo_apuracao, d.categoria, d.tipo, d.situacao_normalizada,
                d.prazo_legal, d.debito_apurado,
                (d.prazo_legal::date - CURRENT_DATE)::int AS dias_para_prazo
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE d.situacao_normalizada = 'EM_ANDAMENTO'
           AND d.prazo_legal IS NOT NULL
           AND d.prazo_legal <= CURRENT_DATE + INTERVAL '15 days'
           ${id_empresa ? 'AND d.id_empresa = $1' : ''}
         ORDER BY d.prazo_legal ASC
         LIMIT 10`,
        params
      );

      // DARFs por faixa de vencimento (vencidos / 7d / 15d / 30d)
      const darfsAgrupados = await getOne<any>(
        `SELECT
            COUNT(*) FILTER (WHERE dr.vencimento < CURRENT_DATE)::int AS vencidos,
            COALESCE(SUM(dr.total) FILTER (WHERE dr.vencimento < CURRENT_DATE), 0)::float AS valor_vencidos,
            COUNT(*) FILTER (WHERE dr.vencimento >= CURRENT_DATE AND dr.vencimento < CURRENT_DATE + 7)::int AS d7,
            COALESCE(SUM(dr.total) FILTER (WHERE dr.vencimento >= CURRENT_DATE AND dr.vencimento < CURRENT_DATE + 7), 0)::float AS valor_d7,
            COUNT(*) FILTER (WHERE dr.vencimento >= CURRENT_DATE + 7 AND dr.vencimento < CURRENT_DATE + 15)::int AS d15,
            COALESCE(SUM(dr.total) FILTER (WHERE dr.vencimento >= CURRENT_DATE + 7 AND dr.vencimento < CURRENT_DATE + 15), 0)::float AS valor_d15,
            COUNT(*) FILTER (WHERE dr.vencimento >= CURRENT_DATE + 15 AND dr.vencimento < CURRENT_DATE + 30)::int AS d30,
            COALESCE(SUM(dr.total) FILTER (WHERE dr.vencimento >= CURRENT_DATE + 15 AND dr.vencimento < CURRENT_DATE + 30), 0)::float AS valor_d30
         FROM dctfweb_darfs dr
         WHERE dr.pago = FALSE ${id_empresa ? 'AND dr.id_empresa = $1' : ''}`,
        params
      );

      // Distribuição por situação (para gráfico pizza/donut)
      const porSituacao = await getAll<any>(
        `SELECT COALESCE(d.situacao_normalizada, 'DESCONHECIDA') AS chave,
                COUNT(*)::int AS total,
                COALESCE(SUM(d.saldo_pagar), 0)::float AS valor
         FROM dctfweb_declaracoes d
         WHERE 1=1 ${filtroEmpresa}
         GROUP BY d.situacao_normalizada
         ORDER BY total DESC`,
        params
      );

      // Evolução temporal (últimos 12 meses, por período de apuração)
      const evolucao = await getAll<any>(
        `SELECT d.periodo_apuracao AS mes,
                COUNT(*)::int AS total,
                COALESCE(SUM(d.saldo_pagar), 0)::float AS valor
         FROM dctfweb_declaracoes d
         WHERE 1=1 ${filtroEmpresa}
         GROUP BY d.periodo_apuracao
         ORDER BY d.periodo_apuracao DESC
         LIMIT 12`,
        params
      );

      // Top empresas com saldo a pagar
      const topEmpresas = id_empresa ? [] : await getAll<any>(
        `SELECT e.id, e.razao_social, e.cnpj,
                COUNT(d.id)::int AS qtd_declaracoes,
                COALESCE(SUM(d.saldo_pagar), 0)::float AS total_a_pagar
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE d.saldo_pagar > 0
         GROUP BY e.id, e.razao_social, e.cnpj
         ORDER BY total_a_pagar DESC
         LIMIT 10`
      );

      // Próximos 10 vencimentos (DARFs pendentes mais próximos)
      const proximosVencimentos = await getAll<any>(
        `SELECT dr.id, dr.id_empresa, e.razao_social, e.cnpj,
                dr.codigo_receita, dr.denominacao, dr.periodo_apuracao,
                dr.vencimento, dr.total,
                (dr.vencimento::date - CURRENT_DATE)::int AS dias_para_vencer
         FROM dctfweb_darfs dr
         JOIN adm_empresas e ON e.id = dr.id_empresa
         WHERE dr.pago = FALSE
           ${id_empresa ? 'AND dr.id_empresa = $1' : ''}
         ORDER BY dr.vencimento ASC
         LIMIT 10`,
        params
      );

      const transmitidas = kpis?.transmitidas ?? 0;
      const taxa = kpis?.total_declaracoes
        ? Math.round((transmitidas / kpis.total_declaracoes) * 10000) / 100
        : 0;

      res.json({
        kpis: {
          total_declaracoes: kpis?.total_declaracoes ?? 0,
          taxa_transmissao: taxa,
          total_a_pagar: kpis?.total_a_pagar ?? 0,
          darfs_vencidos: darfsAgrupados?.vencidos ?? 0,
          valor_vencidos: darfsAgrupados?.valor_vencidos ?? 0,
          darfs_a_vencer_7d: darfsAgrupados?.d7 ?? 0,
          valor_a_vencer_7d: darfsAgrupados?.valor_d7 ?? 0,
          darfs_a_vencer_15d: darfsAgrupados?.d15 ?? 0,
          valor_a_vencer_15d: darfsAgrupados?.valor_d15 ?? 0,
          darfs_a_vencer_30d: darfsAgrupados?.d30 ?? 0,
          valor_a_vencer_30d: darfsAgrupados?.valor_d30 ?? 0,
          declaracoes_com_divergencia: kpis?.com_divergencia ?? 0,
          // Novos KPIs alinhados ao manual oficial
          declaracoes_em_andamento: kpis?.em_andamento ?? 0,
          declaracoes_impedem_cnd: kpis?.impedem_cnd ?? 0,
          valor_maed_pendente: kpis?.valor_maed_pendente ?? 0,
          // Por origem dos débitos (cap. 8.2)
          total_esocial: kpis?.total_esocial ?? 0,
          total_reinf_cp: kpis?.total_reinf_cp ?? 0,
          total_reinf_ret: kpis?.total_reinf_ret ?? 0,
          total_mit: kpis?.total_mit ?? 0,
          total_sero: kpis?.total_sero ?? 0,
        },
        por_situacao: porSituacao.map((r: any) => ({
          chave: r.chave,
          label: SITUACAO_BUCKETS[r.chave] ?? r.chave,
          total: r.total,
          valor: r.valor,
        })),
        por_categoria: porCategoria.map((r: any) => ({
          chave: r.chave,
          label: (CATEGORIAS_DCTFWEB as any)[r.chave]?.label ?? r.chave,
          total: r.total,
          valor: r.valor,
        })),
        por_origem: porOrigem.map((r: any) => ({
          chave: r.chave,
          label: (ORIGENS_DEBITOS as any)[r.chave]?.label ?? r.chave,
          descricao: (ORIGENS_DEBITOS as any)[r.chave]?.descricao ?? '',
          total: Number(r.total) || 0,
          valor: Number(r.valor) || 0,
        })),
        evolucao,
        top_empresas_a_pagar: topEmpresas,
        proximos_vencimentos: proximosVencimentos,
        // Novos painéis (manual)
        alertas_cnd: alertasCnd,
        proximos_prazos_legais: proximosPrazos,
      });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json(EMPTY_DASHBOARD);
      log.error(`Erro dashboard DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // LISTAR DECLARAÇÕES (com filtros e paginação)
  // ────────────────────────────────────────────────────────────────────────────
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const {
        id_empresa, situacao, periodo_inicio, periodo_fim,
        data_transmissao_inicio, data_transmissao_fim,
        categoria, tipo, numero_recibo, busca,
        modo_padrao,                  // 'true' = filtro padrão da tela inicial (cap. 7)
        incluir_faseamento,           // por padrão omitido (manual cap. 7.1)
        page = '1', limit = '20',
      } = req.query as Record<string, string | undefined>;
      const where: string[] = [];
      const params: any[] = [];

      if (id_empresa)   { params.push(Number(id_empresa)); where.push(`d.id_empresa = $${params.length}`); }

      // Filtro padrão da tela inicial (manual cap. 7):
      //   "Em andamento" + "Ativas com saldo a pagar transmitidas nos últimos 30 dias"
      if (modo_padrao === 'true') {
        where.push(`${filtroPadraoTelaInicial()}`);
      } else {
        if (situacao) { params.push(situacao); where.push(`d.situacao_normalizada = $${params.length}`); }
        // Por padrão, oculta "Faseamento" (manual cap. 7.1)
        if (incluir_faseamento !== 'true') {
          where.push(`d.situacao_normalizada != 'FASEAMENTO'`);
        }
      }

      // Filtros oficiais do manual cap. 7.1
      if (periodo_inicio) { params.push(periodo_inicio); where.push(`d.periodo_apuracao >= $${params.length}`); }
      if (periodo_fim)    { params.push(periodo_fim);    where.push(`d.periodo_apuracao <= $${params.length}`); }
      if (data_transmissao_inicio) { params.push(data_transmissao_inicio); where.push(`d.data_transmissao >= $${params.length}::timestamp`); }
      if (data_transmissao_fim)    { params.push(data_transmissao_fim);    where.push(`d.data_transmissao <= $${params.length}::timestamp + INTERVAL '1 day'`); }
      if (categoria)      { params.push(categoria); where.push(`d.categoria = $${params.length}`); }
      if (tipo)           { params.push(tipo); where.push(`d.tipo = $${params.length}`); }
      if (numero_recibo)  { params.push(numero_recibo); where.push(`d.numero_recibo = $${params.length}`); }
      if (busca) {
        const b = `%${busca}%`;
        params.push(b, b, b);
        where.push(`(e.razao_social ILIKE $${params.length - 2} OR e.cnpj ILIKE $${params.length - 1} OR d.numero_recibo ILIKE $${params.length})`);
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const offset = (Number(page) - 1) * Number(limit);

      const countRow = await getOne<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         ${whereClause}`,
        params
      );

      const listParams = [...params, Number(limit), offset];
      const declaracoes = await getAll<any>(
        `SELECT d.id, d.id_empresa, e.razao_social, e.cnpj,
                d.periodo_apuracao, d.categoria, d.tipo, d.subtipo,
                d.situacao, d.situacao_normalizada, d.numero_recibo,
                d.data_transmissao, d.data_recepcao,
                d.prazo_legal, d.entregue_em_atraso, d.dias_atraso,
                d.debito_apurado, d.credito_vinculado, d.saldo_pagar,
                d.valor_esocial, d.valor_reinf_cp, d.valor_reinf_ret, d.valor_mit, d.valor_sero,
                d.salario_familia, d.salario_maternidade, d.retencao_lei_9711,
                d.compensacoes, d.parcelamentos, d.suspensoes,
                d.maed_valor, d.maed_emitida_em, d.maed_paga,
                d.divergencia, d.divergencia_motivo,
                d.impede_cnd, d.impede_cnd_motivo,
                (d.recibo_pdf IS NOT NULL) AS tem_recibo,
                d.criado_em, d.atualizado_em
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         ${whereClause}
         ORDER BY d.periodo_apuracao DESC, e.razao_social
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams
      );

      res.json({
        data: declaracoes,
        pagination: {
          total: Number(countRow?.total ?? 0),
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(Number(countRow?.total ?? 0) / Number(limit)),
        },
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return res.json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }, warning: 'módulo DCTFweb ainda não provisionado' });
      }
      log.error(`Erro listar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar declarações' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const decl = await getOne<any>(
        `SELECT d.*, e.razao_social, e.cnpj
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE d.id = $1`,
        [req.params.id]
      );
      if (!decl) return res.status(404).json({ error: 'Declaração não encontrada' });

      const darfs = await getAll<any>(
        `SELECT * FROM dctfweb_darfs WHERE id_declaracao = $1 ORDER BY vencimento`,
        [req.params.id]
      );

      res.json({ ...decl, darfs });
    } catch (error: any) {
      log.error(`Erro buscar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao buscar declaração' });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // CRUD DECLARAÇÕES
  // ────────────────────────────────────────────────────────────────────────────
  criar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, periodo_apuracao, categoria, tipo, situacao,
              debito_apurado, credito_vinculado, saldo_pagar,
              data_transmissao, numero_recibo, observacoes } = req.body;
      if (!id_empresa || !periodo_apuracao || !categoria) {
        return res.status(400).json({ error: 'id_empresa, periodo_apuracao e categoria são obrigatórios' });
      }
      const { id } = await runQuery(
        `INSERT INTO dctfweb_declaracoes
          (id_empresa, periodo_apuracao, categoria, tipo, situacao, situacao_normalizada,
           debito_apurado, credito_vinculado, saldo_pagar,
           data_transmissao, numero_recibo, observacoes)
         VALUES ($1, $2, $3, COALESCE($4, 'ORIGINAL'), $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id_empresa, periodo_apuracao, categoria, tipo)
         DO UPDATE SET
           situacao = EXCLUDED.situacao,
           situacao_normalizada = EXCLUDED.situacao_normalizada,
           debito_apurado = EXCLUDED.debito_apurado,
           credito_vinculado = EXCLUDED.credito_vinculado,
           saldo_pagar = EXCLUDED.saldo_pagar,
           data_transmissao = COALESCE(EXCLUDED.data_transmissao, dctfweb_declaracoes.data_transmissao),
           numero_recibo = COALESCE(EXCLUDED.numero_recibo, dctfweb_declaracoes.numero_recibo),
           observacoes = COALESCE(EXCLUDED.observacoes, dctfweb_declaracoes.observacoes),
           atualizado_em = NOW()
         RETURNING id`,
        [id_empresa, periodo_apuracao, categoria, tipo || null, situacao || null, normalizarSituacao(situacao),
         debito_apurado || 0, credito_vinculado || 0, saldo_pagar || 0,
         data_transmissao || null, numero_recibo || null, observacoes || null]
      );
      res.status(201).json({ id });
    } catch (error: any) {
      log.error(`Erro criar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao criar declaração' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const { situacao, debito_apurado, credito_vinculado, saldo_pagar,
              data_transmissao, numero_recibo, observacoes } = req.body;
      await runQuery(
        `UPDATE dctfweb_declaracoes SET
            situacao = COALESCE($1, situacao),
            situacao_normalizada = COALESCE($2, situacao_normalizada),
            debito_apurado = COALESCE($3, debito_apurado),
            credito_vinculado = COALESCE($4, credito_vinculado),
            saldo_pagar = COALESCE($5, saldo_pagar),
            data_transmissao = COALESCE($6, data_transmissao),
            numero_recibo = COALESCE($7, numero_recibo),
            observacoes = COALESCE($8, observacoes),
            atualizado_em = NOW()
          WHERE id = $9`,
        [situacao ?? null, situacao ? normalizarSituacao(situacao) : null,
         debito_apurado ?? null, credito_vinculado ?? null, saldo_pagar ?? null,
         data_transmissao ?? null, numero_recibo ?? null, observacoes ?? null,
         req.params.id]
      );
      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro atualizar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar declaração' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      await runQuery(`DELETE FROM dctfweb_declaracoes WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro excluir DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao excluir declaração' });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // DARFs
  // ────────────────────────────────────────────────────────────────────────────
  listarDarfs: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, status, page = '1', limit = '20' } = req.query as Record<string, string | undefined>;
      const where: string[] = [];
      const params: any[] = [];
      if (id_empresa) { params.push(Number(id_empresa)); where.push(`dr.id_empresa = $${params.length}`); }
      if (status === 'pago')     where.push(`dr.pago = TRUE`);
      if (status === 'pendente') where.push(`dr.pago = FALSE AND dr.vencimento >= CURRENT_DATE`);
      if (status === 'vencido')  where.push(`dr.pago = FALSE AND dr.vencimento < CURRENT_DATE`);
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const offset = (Number(page) - 1) * Number(limit);

      const countRow = await getOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM dctfweb_darfs dr JOIN adm_empresas e ON e.id = dr.id_empresa ${whereSql}`,
        params
      );
      const listParams = [...params, Number(limit), offset];
      const darfs = await getAll<any>(
        `SELECT dr.*, e.razao_social, e.cnpj,
                (dr.vencimento::date - CURRENT_DATE)::int AS dias_para_vencer,
                CASE WHEN dr.pago THEN 'PAGO'
                     WHEN dr.vencimento < CURRENT_DATE THEN 'VENCIDO'
                     ELSE 'PENDENTE' END AS status
         FROM dctfweb_darfs dr
         JOIN adm_empresas e ON e.id = dr.id_empresa
         ${whereSql}
         ORDER BY dr.vencimento ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams
      );

      res.json({
        data: darfs,
        pagination: {
          total: Number(countRow?.total ?? 0),
          page: Number(page), limit: Number(limit),
          totalPages: Math.ceil(Number(countRow?.total ?? 0) / Number(limit)),
        },
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return res.json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      }
      log.error(`Erro listar DARFs: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar DARFs' });
    }
  },

  gerarDarf: async (req: AuthRequest, res: Response) => {
    try {
      // Marca o DARF como "gerado". Em produção, aqui chamaríamos o webservice
      // da Receita ou o endpoint de impressão DCTFWeb para baixar o PDF real.
      const r = await runQuery(
        `UPDATE dctfweb_darfs
            SET gerado = TRUE, gerado_em = NOW(), atualizado_em = NOW()
          WHERE id = $1 AND pago = FALSE
        RETURNING id`,
        [req.params.id]
      );
      if (r.changes === 0) return res.status(404).json({ error: 'DARF não encontrado ou já pago' });
      res.json({ ok: true, message: 'DARF marcado como gerado' });
    } catch (error: any) {
      log.error(`Erro gerar DARF: ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar DARF' });
    }
  },

  marcarPago: async (req: AuthRequest, res: Response) => {
    try {
      const { valor_pago, pago_em } = req.body;
      await runQuery(
        `UPDATE dctfweb_darfs
            SET pago = TRUE,
                pago_em = COALESCE($1::timestamp, NOW()),
                valor_pago = COALESCE($2, total),
                atualizado_em = NOW()
          WHERE id = $3`,
        [pago_em || null, valor_pago || null, req.params.id]
      );
      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro marcar DARF pago: ${error.message}`);
      res.status(500).json({ error: 'Erro ao marcar pago' });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // RELATÓRIOS
  // ────────────────────────────────────────────────────────────────────────────
  relatorioVencimentos: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, dias_horizonte = '60' } = req.query as Record<string, string | undefined>;
      const params: any[] = [Number(dias_horizonte)];
      const filtro = id_empresa ? 'AND dr.id_empresa = $2' : '';
      if (id_empresa) params.push(Number(id_empresa));

      const rows = await getAll<any>(
        `SELECT dr.id, dr.id_empresa, e.razao_social, e.cnpj,
                dr.codigo_receita, dr.denominacao, dr.periodo_apuracao,
                dr.vencimento, dr.total,
                (dr.vencimento::date - CURRENT_DATE)::int AS dias_para_vencer,
                CASE WHEN dr.vencimento < CURRENT_DATE THEN 'VENCIDO'
                     WHEN dr.vencimento < CURRENT_DATE + 3  THEN 'URGENTE_3D'
                     WHEN dr.vencimento < CURRENT_DATE + 7  THEN 'ALERTA_7D'
                     WHEN dr.vencimento < CURRENT_DATE + 15 THEN 'AVISO_15D'
                     ELSE 'NORMAL' END AS urgencia
         FROM dctfweb_darfs dr
         JOIN adm_empresas e ON e.id = dr.id_empresa
         WHERE dr.pago = FALSE
           AND dr.vencimento <= CURRENT_DATE + $1::int
           ${filtro}
         ORDER BY dr.vencimento ASC, dr.total DESC`,
        params
      );
      res.json({ data: rows });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ data: [] });
      log.error(`Erro relatório vencimentos: ${error.message}`);
      res.status(500).json({ error: 'Erro no relatório' });
    }
  },

  relatorioAtrasos: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query as Record<string, string | undefined>;
      const params: any[] = id_empresa ? [Number(id_empresa)] : [];
      const filtro = id_empresa ? 'AND dr.id_empresa = $1' : '';

      const rows = await getAll<any>(
        `SELECT dr.id, dr.id_empresa, e.razao_social, e.cnpj,
                dr.codigo_receita, dr.denominacao, dr.periodo_apuracao,
                dr.vencimento, dr.total,
                (CURRENT_DATE - dr.vencimento::date)::int AS dias_em_atraso,
                -- Multa de mora SELIC + 20% (estimativa simples, real depende da receita)
                ROUND((dr.principal * 0.0033 * (CURRENT_DATE - dr.vencimento::date))::numeric, 2) AS multa_estimada,
                ROUND((dr.principal * 0.01 * GREATEST(1, ((CURRENT_DATE - dr.vencimento::date)/30))::int)::numeric, 2) AS juros_estimado
         FROM dctfweb_darfs dr
         JOIN adm_empresas e ON e.id = dr.id_empresa
         WHERE dr.pago = FALSE AND dr.vencimento < CURRENT_DATE ${filtro}
         ORDER BY dr.vencimento ASC`,
        params
      );
      res.json({ data: rows });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ data: [] });
      log.error(`Erro relatório atrasos: ${error.message}`);
      res.status(500).json({ error: 'Erro no relatório' });
    }
  },

  /**
   * Projeção de caixa: agrupa DARFs pendentes em buckets de 30/60/90 dias.
   * Útil pro gestor planejar capital de giro.
   */
  projecaoCaixa: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query as Record<string, string | undefined>;
      const params: any[] = id_empresa ? [Number(id_empresa)] : [];
      const filtro = id_empresa ? 'AND id_empresa = $1' : '';

      const row = await getOne<any>(
        `SELECT
            COALESCE(SUM(total) FILTER (WHERE vencimento < CURRENT_DATE), 0)::float AS vencidos,
            COALESCE(SUM(total) FILTER (WHERE vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30), 0)::float AS proximos_30d,
            COALESCE(SUM(total) FILTER (WHERE vencimento BETWEEN CURRENT_DATE + 31 AND CURRENT_DATE + 60), 0)::float AS proximos_60d,
            COALESCE(SUM(total) FILTER (WHERE vencimento BETWEEN CURRENT_DATE + 61 AND CURRENT_DATE + 90), 0)::float AS proximos_90d,
            COALESCE(SUM(total) FILTER (WHERE vencimento > CURRENT_DATE + 90), 0)::float AS apos_90d
         FROM dctfweb_darfs
         WHERE pago = FALSE ${filtro}`,
        params
      );
      res.json(row || { vencidos: 0, proximos_30d: 0, proximos_60d: 0, proximos_90d: 0, apos_90d: 0 });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ vencidos: 0, proximos_30d: 0, proximos_60d: 0, proximos_90d: 0, apos_90d: 0 });
      log.error(`Erro projeção caixa: ${error.message}`);
      res.status(500).json({ error: 'Erro na projeção' });
    }
  },

  /**
   * Relatório de MAED — Multa por Atraso na Entrega (manual cap. 5).
   * Lista declarações ORIGINAL entregues em atraso ou ainda não entregues
   * cujo prazo legal já venceu, com cálculo de multa pendente.
   */
  relatorioMaed: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query as Record<string, string | undefined>;
      const params: any[] = id_empresa ? [Number(id_empresa)] : [];
      const filtro = id_empresa ? 'AND d.id_empresa = $1' : '';

      const declaracoes = await getAll<any>(
        `SELECT d.id, d.id_empresa, e.razao_social, e.cnpj,
                d.periodo_apuracao, d.categoria, d.tipo, d.subtipo,
                d.situacao_normalizada,
                d.prazo_legal, d.data_transmissao,
                d.debito_apurado,
                d.maed_valor, d.maed_emitida_em, d.maed_paga,
                CASE
                  WHEN d.data_transmissao IS NOT NULL AND d.prazo_legal IS NOT NULL
                  THEN GREATEST(0, (d.data_transmissao::date - d.prazo_legal::date)::int)
                  WHEN d.data_transmissao IS NULL AND d.prazo_legal IS NOT NULL
                  THEN GREATEST(0, (CURRENT_DATE - d.prazo_legal::date)::int)
                  ELSE 0
                END AS dias_atraso_calculado
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE d.tipo = 'ORIGINAL'
           AND (d.entregue_em_atraso = TRUE OR (d.situacao_normalizada = 'EM_ANDAMENTO' AND d.prazo_legal < CURRENT_DATE))
           ${filtro}
         ORDER BY d.prazo_legal ASC NULLS LAST`,
        params
      );

      // Calcula MAED para cada linha que ainda não tem
      const enriched = declaracoes.map((d: any) => {
        if (d.maed_valor && d.maed_valor > 0) return d;
        const calc = calcularMaed({
          debito_apurado: Number(d.debito_apurado || 0),
          dias_atraso: Number(d.dias_atraso_calculado || 0),
          sem_movimento: d.subtipo === 'SEM_MOVIMENTO',
          regime: 'NORMAL',
        });
        return { ...d, maed_calculada: calc.com_reducao.multa_final, maed_detalhe: calc };
      });

      const total_pendente = enriched
        .filter((d: any) => !d.maed_paga)
        .reduce((acc: number, d: any) => acc + Number(d.maed_valor || d.maed_calculada || 0), 0);

      res.json({ data: enriched, total_pendente });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ data: [], total_pendente: 0 });
      log.error(`Erro relatório MAED: ${error.message}`);
      res.status(500).json({ error: 'Erro no relatório MAED' });
    }
  },

  /**
   * Resumo consolidado por ORIGEM (manual cap. 8.2): eSocial, Reinf CP/RET, MIT, Sero.
   * Útil para conciliação do que veio de cada fonte.
   */
  relatorioPorOrigem: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, periodo } = req.query as Record<string, string | undefined>;
      const params: any[] = [];
      const filtros: string[] = [`d.situacao_normalizada != 'FASEAMENTO'`];
      if (id_empresa) { params.push(Number(id_empresa)); filtros.push(`d.id_empresa = $${params.length}`); }
      if (periodo)    { params.push(periodo); filtros.push(`d.periodo_apuracao = $${params.length}`); }
      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

      const row = await getOne<any>(
        `SELECT
            COALESCE(SUM(d.valor_esocial), 0)::float    AS esocial,
            COALESCE(SUM(d.valor_reinf_cp), 0)::float   AS reinf_cp,
            COALESCE(SUM(d.valor_reinf_ret), 0)::float  AS reinf_ret,
            COALESCE(SUM(d.valor_mit), 0)::float        AS mit,
            COALESCE(SUM(d.valor_sero), 0)::float       AS sero,
            COALESCE(SUM(d.debito_apurado), 0)::float   AS debito_total,
            COALESCE(SUM(d.saldo_pagar), 0)::float      AS saldo_pagar
         FROM dctfweb_declaracoes d ${where}`,
        params
      );

      res.json({
        resumo: row || {},
        origens: [
          { chave: 'ESOCIAL',   label: ORIGENS_DEBITOS.ESOCIAL.label,   valor: row?.esocial   || 0 },
          { chave: 'REINF_CP',  label: ORIGENS_DEBITOS.REINF_CP.label,  valor: row?.reinf_cp  || 0 },
          { chave: 'REINF_RET', label: ORIGENS_DEBITOS.REINF_RET.label, valor: row?.reinf_ret || 0 },
          { chave: 'MIT',       label: ORIGENS_DEBITOS.MIT.label,       valor: row?.mit       || 0 },
          { chave: 'SERO',      label: ORIGENS_DEBITOS.SERO.label,      valor: row?.sero      || 0 },
        ],
      });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ resumo: {}, origens: [] });
      log.error(`Erro relatório por origem: ${error.message}`);
      res.status(500).json({ error: 'Erro no relatório' });
    }
  },

  /**
   * Prazos legais próximos (manual cap. 4.2) — declarações "Em andamento" que
   * vencem nos próximos N dias. Difere de DARFs (que são vencimentos de pagamento).
   */
  relatorioPrazos: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, dias_horizonte = '30' } = req.query as Record<string, string | undefined>;
      const params: any[] = [Number(dias_horizonte)];
      const filtro = id_empresa ? 'AND d.id_empresa = $2' : '';
      if (id_empresa) params.push(Number(id_empresa));

      const rows = await getAll<any>(
        `SELECT d.id, d.id_empresa, e.razao_social, e.cnpj,
                d.periodo_apuracao, d.categoria, d.tipo, d.subtipo,
                d.situacao_normalizada,
                d.prazo_legal, d.debito_apurado,
                (d.prazo_legal::date - CURRENT_DATE)::int AS dias_para_prazo,
                CASE
                  WHEN d.prazo_legal < CURRENT_DATE THEN 'VENCIDO'
                  WHEN d.prazo_legal < CURRENT_DATE + 3  THEN 'URGENTE_3D'
                  WHEN d.prazo_legal < CURRENT_DATE + 7  THEN 'ALERTA_7D'
                  WHEN d.prazo_legal < CURRENT_DATE + 15 THEN 'AVISO_15D'
                  ELSE 'NORMAL' END AS urgencia
         FROM dctfweb_declaracoes d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE d.situacao_normalizada = 'EM_ANDAMENTO'
           AND d.prazo_legal IS NOT NULL
           AND d.prazo_legal <= CURRENT_DATE + $1::int
           ${filtro}
         ORDER BY d.prazo_legal ASC`,
        params
      );
      res.json({ data: rows });
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ data: [] });
      log.error(`Erro relatório prazos: ${error.message}`);
      res.status(500).json({ error: 'Erro no relatório' });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // AGENDAMENTO (configuração por empresa + global)
  // ────────────────────────────────────────────────────────────────────────────
  obterConfig: async (_req: AuthRequest, res: Response) => {
    try {
      const cached = readDctfwebConfigCache();
      if (cached) return res.json(cached);

      // 3 queries paralelas com DISTINCT ON em vez de LATERAL JOIN (que causava
      // deadlock sob escrita concorrente na tabela dctfweb_automacao_config).
      const [global, empresasRaw, certsAtivosRaw] = await Promise.all([
        getOne<any>(
          `SELECT id, ativo, horario_diario, dias_antes_vencimento_alertar, atualizado_em
             FROM dctfweb_automacao_config_global WHERE id = 1`
        ),
        getAll<any>(
          `SELECT
              e.id, e.cnpj, e.razao_social, e.nome_fantasia,
              COALESCE(c.sync_declaracoes_ativo, false)   AS sync_declaracoes_ativo,
              COALESCE(c.baixar_recibos_ativo, false)     AS baixar_recibos_ativo,
              COALESCE(c.gerar_darf_ativo, false)         AS gerar_darf_ativo,
              COALESCE(c.alertar_vencimento_ativo, false) AS alertar_vencimento_ativo,
              c.ultima_execucao, c.ultima_execucao_status, c.ultima_execucao_msg
            FROM adm_empresas e
            LEFT JOIN dctfweb_automacao_config c ON c.id_empresa = e.id
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
      writeDctfwebConfigCache(payload);
      res.json(payload);
    } catch (error: any) {
      if (error?.code === '42P01') return res.json({ global: null, empresas: [], warning: 'módulo DCTFweb ainda não provisionado' });
      log.error(`Erro obter config dctfweb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao obter configurações' });
    }
  },

  atualizarGlobal: async (req: AuthRequest, res: Response) => {
    try {
      const { ativo, horario_diario, dias_antes_vencimento_alertar } = req.body;
      if (typeof ativo !== 'boolean') return res.status(400).json({ error: 'ativo é obrigatório (boolean)' });
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario_diario || '')) {
        return res.status(400).json({ error: 'horario_diario inválido — use HH:MM (24h)' });
      }
      const dias = Number(dias_antes_vencimento_alertar ?? 3);
      if (!Number.isInteger(dias) || dias < 0 || dias > 60) {
        return res.status(400).json({ error: 'dias_antes_vencimento_alertar deve ser inteiro 0..60' });
      }
      await runQuery(
        `UPDATE dctfweb_automacao_config_global
            SET ativo = $1, horario_diario = $2, dias_antes_vencimento_alertar = $3,
                atualizado_em = NOW(), atualizado_por_id = $4
          WHERE id = 1`,
        [ativo, horario_diario, dias, req.user!.id]
      );
      invalidateDctfwebConfigCache();
      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro atualizar config global dctfweb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar configuração global' });
    }
  },

  atualizarEmpresa: async (req: AuthRequest, res: Response) => {
    try {
      const idEmpresa = Number(req.params.id);
      if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
      const body = req.body || {};
      const flags = ['sync_declaracoes_ativo', 'baixar_recibos_ativo', 'gerar_darf_ativo', 'alertar_vencimento_ativo'];
      for (const f of flags) {
        if (typeof body[f] !== 'boolean') return res.status(400).json({ error: `${f} é obrigatório (boolean)` });
      }
      await runQuery(
        `INSERT INTO dctfweb_automacao_config
            (id_empresa, sync_declaracoes_ativo, baixar_recibos_ativo, gerar_darf_ativo, alertar_vencimento_ativo, atualizado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id_empresa) DO UPDATE SET
            sync_declaracoes_ativo   = EXCLUDED.sync_declaracoes_ativo,
            baixar_recibos_ativo     = EXCLUDED.baixar_recibos_ativo,
            gerar_darf_ativo         = EXCLUDED.gerar_darf_ativo,
            alertar_vencimento_ativo = EXCLUDED.alertar_vencimento_ativo,
            atualizado_em            = NOW(),
            atualizado_por_id        = EXCLUDED.atualizado_por_id`,
        [idEmpresa, body.sync_declaracoes_ativo, body.baixar_recibos_ativo,
         body.gerar_darf_ativo, body.alertar_vencimento_ativo, req.user!.id]
      );
      invalidateDctfwebConfigCache();
      res.json({ ok: true });
    } catch (error: any) {
      log.error(`Erro atualizar config empresa dctfweb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar configuração' });
    }
  },

  /** Sinaliza pausa para o pipeline em andamento da empresa. */
  pausar: async (req: AuthRequest, res: Response) => {
    const idEmpresa = Number(req.params.id);
    if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
    dctfwebControl.pause(idEmpresa);
    res.json({ ok: true });
  },

  /** Retoma execução pausada. */
  retomar: async (req: AuthRequest, res: Response) => {
    const idEmpresa = Number(req.params.id);
    if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
    dctfwebControl.resume(idEmpresa);
    res.json({ ok: true });
  },

  /** Cancela o pipeline em andamento — runner aborta na próxima etapa. */
  cancelar: async (req: AuthRequest, res: Response) => {
    const idEmpresa = Number(req.params.id);
    if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
    dctfwebControl.cancel(idEmpresa);
    res.json({ ok: true });
  },

  /**
   * Destrava (força status='erro') um pipeline DCTFweb que ficou preso em
   * 'em_andamento' por crash/restart do backend. NÃO interrompe execução
   * real em curso — só corrige o registro no banco.
   */
  destravar: async (req: AuthRequest, res: Response) => {
    try {
      const idEmpresa = Number(req.params.id);
      if (!idEmpresa) return res.status(400).json({ error: 'id da empresa inválido' });
      const r = await runQuery(
        `UPDATE dctfweb_automacao_config
            SET ultima_execucao_status = 'erro',
                ultima_execucao_msg    = 'Pipeline destravado manualmente pelo usuário',
                atualizado_em          = NOW()
          WHERE id_empresa = $1 AND ultima_execucao_status = 'em_andamento'`,
        [idEmpresa]
      );
      invalidateDctfwebConfigCache();
      res.json({ ok: true, destravado: r.changes > 0 });
    } catch (error: any) {
      log.error(`Erro destravar pipeline dctfweb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao destravar' });
    }
  },

  /**
   * Dispara o pipeline DCTFWeb sob demanda. Quando idEmpresa é null, processa
   * TODAS as empresas com pelo menos uma flag ativa.
   */
  executarAgora: async (req: AuthRequest, res: Response) => {
    try {
      const idEmpresa = req.params.id ? Number(req.params.id) : null;
      const filtro = idEmpresa
        ? 'AND c.id_empresa = $1'
        : `AND (c.sync_declaracoes_ativo OR c.baixar_recibos_ativo OR c.gerar_darf_ativo OR c.alertar_vencimento_ativo)`;
      const params = idEmpresa ? [idEmpresa] : [];
      const empresas = await getAll<{ id_empresa: number; razao_social: string;
        sync_declaracoes_ativo: boolean; baixar_recibos_ativo: boolean;
        gerar_darf_ativo: boolean; alertar_vencimento_ativo: boolean;
      }>(
        `SELECT e.id AS id_empresa, e.razao_social,
                c.sync_declaracoes_ativo, c.baixar_recibos_ativo,
                c.gerar_darf_ativo, c.alertar_vencimento_ativo
         FROM dctfweb_automacao_config c
         JOIN adm_empresas e ON e.id = c.id_empresa
         WHERE 1=1 ${filtro}`,
        params
      );

      // Background — dispara o runner real (não bloqueia o response)
      (async () => {
        for (const emp of empresas) {
          try {
            await runDctfwebEmpresa({
              id_empresa: emp.id_empresa,
              sync_declaracoes:   emp.sync_declaracoes_ativo,
              baixar_recibos:     emp.baixar_recibos_ativo,
              consultar_darfs:    emp.gerar_darf_ativo,
              alertar_vencimento: emp.alertar_vencimento_ativo,
              is_batch: false,
            });
          } catch (e: any) {
            log.error(`[dctfweb-executar] Empresa ${emp.id_empresa} falhou: ${e.message}`);
          }
        }
      })();

      res.status(202).json({
        ok: true,
        message: idEmpresa
          ? `Execução DCTFweb disparada para empresa ${idEmpresa}`
          : `Execução DCTFweb disparada para ${empresas.length} empresa(s) ativas`,
      });
    } catch (error: any) {
      log.error(`Erro executar DCTFweb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao disparar execução' });
    }
  },

  /**
   * Importa um XML (eSocial S-1299 ou EFD-Reinf R-9000 ou recibo DCTFWeb).
   * Aceita upload via multer/multipart. Para cada arquivo, parseia → faz upsert.
   * Em seguida roda a reconciliação com declarações vindas do RPA.
   */
  importarXml: async (req: AuthRequest, res: Response) => {
    try {
      const arquivos = (req.files as Express.Multer.File[] | undefined) || [];
      if (arquivos.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo recebido. Envie XML ou ZIP via campo "arquivos[]".' });
      }
      const idEmpresa = req.body?.id_empresa ? Number(req.body.id_empresa) : null;
      if (!idEmpresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });

      const resultado = await importarXmlDctfweb(idEmpresa, arquivos);
      res.json(resultado);
    } catch (error: any) {
      log.error(`Erro importarXml DCTFweb: ${error.message}`);
      res.status(500).json({ error: `Erro ao importar: ${error.message}` });
    }
  },
};
