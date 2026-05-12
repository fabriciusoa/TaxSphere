/**
 * Relatórios consolidados do PER/DCOMP usando dados do e-CAC + sistema.
 *
 * Endpoints:
 *   GET /api/perdcomp/relatorios/saldos-disponiveis
 *   GET /api/perdcomp/relatorios/prescricao            — créditos próximos do limite de 5 anos
 *   GET /api/perdcomp/relatorios/retrabalho            — índice de retificação por empresa
 *   GET /api/perdcomp/relatorios/compensacoes-em-risco — DComps com status indeferido/cancelado
 *   GET /api/perdcomp/relatorios/dashboard             — visão geral consolidada
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne } from '../database/connection';
import { log } from '../utils/logger';
import { STATUS_LABELS, STATUS_CREDITO_PERDIDO } from '../services/ecacStatusNormalizer';

const STATUS_PERDIDOS_SQL = `('${STATUS_CREDITO_PERDIDO.join("', '")}')`;

export const perdcompRelatoriosController = {
  /**
   * Saldos disponíveis: créditos com saldo > 0 ainda não totalmente utilizados.
   */
  saldosDisponiveis: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      const where = ['s.saldo_disponivel > 0.01'];
      if (id_empresa) { params.push(id_empresa); where.push(`s.id_empresa = $${params.length}`); }

      const saldos = await getAll<any>(
        `SELECT s.id, s.id_empresa, s.numero_perdcomp_origem, s.tipo_credito,
                s.exercicio, s.periodo_apuracao,
                s.valor_saldo_negativo, s.selic_acumulada, s.credito_atualizado,
                s.total_utilizado, s.saldo_disponivel,
                s.data_entrega_pedido, s.data_prescricao, s.status_normalizado,
                s.origem,
                CASE WHEN s.data_prescricao IS NOT NULL
                  THEN (s.data_prescricao - CURRENT_DATE)
                  ELSE NULL END as dias_para_prescricao,
                CASE WHEN s.credito_atualizado > 0
                  THEN ROUND((s.total_utilizado * 100.0 / s.credito_atualizado)::numeric, 2)
                  ELSE 0 END as percentual_utilizado,
                e.razao_social, e.cnpj
         FROM saldos_credito s
         JOIN adm_empresas e ON e.id = s.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY s.data_prescricao ASC NULLS LAST, s.saldo_disponivel DESC`,
        params
      );

      const totalDisponivel = saldos.reduce((a, s) => a + Number(s.saldo_disponivel || 0), 0);
      const totalAtualizado = saldos.reduce((a, s) => a + Number(s.credito_atualizado || 0), 0);

      res.json({
        saldos,
        totais: {
          quantidade: saldos.length,
          credito_atualizado: totalAtualizado,
          saldo_disponivel: totalDisponivel,
          total_utilizado: totalAtualizado - totalDisponivel,
        },
      });
    } catch (error: any) {
      log.error(`[Relatorios.saldosDisponiveis] ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar relatório de saldos' });
    }
  },

  /**
   * Créditos próximos da prescrição (5 anos).
   */
  prescricao: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, dias_limite = 365 } = req.query;
      const params: any[] = [Number(dias_limite)];
      const where = ['s.data_prescricao IS NOT NULL', 's.saldo_disponivel > 0.01', '(s.data_prescricao - CURRENT_DATE) <= $1'];
      if (id_empresa) { params.push(id_empresa); where.push(`s.id_empresa = $${params.length}`); }

      const itens = await getAll<any>(
        `SELECT s.id, s.numero_perdcomp_origem, s.tipo_credito, s.exercicio,
                s.credito_atualizado, s.saldo_disponivel,
                s.data_entrega_pedido, s.data_prescricao, s.status_normalizado,
                (s.data_prescricao - CURRENT_DATE) as dias_para_prescricao,
                e.razao_social, e.cnpj
         FROM saldos_credito s
         JOIN adm_empresas e ON e.id = s.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY s.data_prescricao ASC`,
        params
      );

      // Buckets de risco
      const buckets = {
        prescritos: itens.filter(i => Number(i.dias_para_prescricao) <= 0),
        critico_30: itens.filter(i => Number(i.dias_para_prescricao) > 0 && Number(i.dias_para_prescricao) <= 30),
        urgente_90: itens.filter(i => Number(i.dias_para_prescricao) > 30 && Number(i.dias_para_prescricao) <= 90),
        atencao_180: itens.filter(i => Number(i.dias_para_prescricao) > 90 && Number(i.dias_para_prescricao) <= 180),
        proximo_365: itens.filter(i => Number(i.dias_para_prescricao) > 180),
      };

      const valorTotal = itens.reduce((a, i) => a + Number(i.saldo_disponivel || 0), 0);

      res.json({
        itens,
        buckets: {
          prescritos: { quantidade: buckets.prescritos.length, valor: buckets.prescritos.reduce((a, i) => a + Number(i.saldo_disponivel || 0), 0) },
          critico_30: { quantidade: buckets.critico_30.length, valor: buckets.critico_30.reduce((a, i) => a + Number(i.saldo_disponivel || 0), 0) },
          urgente_90: { quantidade: buckets.urgente_90.length, valor: buckets.urgente_90.reduce((a, i) => a + Number(i.saldo_disponivel || 0), 0) },
          atencao_180: { quantidade: buckets.atencao_180.length, valor: buckets.atencao_180.reduce((a, i) => a + Number(i.saldo_disponivel || 0), 0) },
          proximo_365: { quantidade: buckets.proximo_365.length, valor: buckets.proximo_365.reduce((a, i) => a + Number(i.saldo_disponivel || 0), 0) },
        },
        totais: { quantidade: itens.length, valor: valorTotal },
      });
    } catch (error: any) {
      log.error(`[Relatorios.prescricao] ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar relatório de prescrição' });
    }
  },

  /**
   * Índice de retrabalho: % de PER/DCOMPs que precisaram ser retificados.
   */
  retrabalho: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      const where = ['1=1'];
      if (id_empresa) { params.push(id_empresa); where.push(`d.id_empresa = $${params.length}`); }

      const stats = await getOne<any>(
        `SELECT
            COUNT(*)::int as total_documentos,
            COUNT(*) FILTER (WHERE d.tipo_documento ILIKE '%retificador%')::int as total_retificadores,
            COUNT(*) FILTER (WHERE d.retificado_por_id IS NOT NULL)::int as total_retificados,
            COUNT(DISTINCT d.numero_perdcomp_inicial) FILTER (WHERE d.tipo_documento ILIKE '%retificador%')::int as documentos_originais_retificados
         FROM ecac_perdcomp_documentos d
         WHERE ${where.join(' AND ')}`,
        params
      );

      const retificadoresPorEmpresa = await getAll<any>(
        `SELECT e.id, e.razao_social, e.cnpj,
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE d.tipo_documento ILIKE '%retificador%')::int as retificadores,
                CASE WHEN COUNT(*) > 0
                  THEN ROUND((COUNT(*) FILTER (WHERE d.tipo_documento ILIKE '%retificador%') * 100.0 / COUNT(*))::numeric, 2)
                  ELSE 0 END as indice_retrabalho_pct
         FROM ecac_perdcomp_documentos d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE ${where.join(' AND ')}
         GROUP BY e.id, e.razao_social, e.cnpj
         ORDER BY indice_retrabalho_pct DESC`,
        params
      );

      const detalhamento = await getAll<any>(
        `SELECT d.id, d.numero, d.numero_perdcomp_inicial, d.tipo_documento,
                d.tipo_credito, d.data_entrega, d.status_ecac, d.status_normalizado,
                e.razao_social, e.cnpj,
                orig.numero as numero_original,
                orig.data_entrega as data_entrega_original
         FROM ecac_perdcomp_documentos d
         JOIN adm_empresas e ON e.id = d.id_empresa
         LEFT JOIN ecac_perdcomp_documentos orig ON orig.id = d.id_documento_retificado
         WHERE d.tipo_documento ILIKE '%retificador%' AND ${where.join(' AND ')}
         ORDER BY d.data_entrega DESC NULLS LAST
         LIMIT 200`,
        params
      );

      const totalDocumentos = Number(stats?.total_documentos) || 0;
      const totalRetificadores = Number(stats?.total_retificadores) || 0;
      const indiceGeral = totalDocumentos > 0
        ? Math.round((totalRetificadores / totalDocumentos) * 100 * 100) / 100
        : 0;

      res.json({
        resumo: {
          total_documentos: totalDocumentos,
          total_retificadores: totalRetificadores,
          total_retificados: Number(stats?.total_retificados) || 0,
          documentos_originais_retificados: Number(stats?.documentos_originais_retificados) || 0,
          indice_retrabalho_pct: indiceGeral,
        },
        por_empresa: retificadoresPorEmpresa,
        detalhamento,
      });
    } catch (error: any) {
      log.error(`[Relatorios.retrabalho] ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar relatório de retrabalho' });
    }
  },

  /**
   * Compensações em risco: DComps com status indeferido / não homologado / cancelado.
   * Mesmo após indeferimento, o crédito já foi consumido na transmissão (regra do cliente).
   */
  compensacoesEmRisco: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      const where = [`d.status_normalizado IN ${STATUS_PERDIDOS_SQL}`, `d.credito_original_utilizado > 0`];
      if (id_empresa) { params.push(id_empresa); where.push(`d.id_empresa = $${params.length}`); }

      const itens = await getAll<any>(
        `SELECT d.id, d.numero, d.numero_perdcomp_inicial, d.tipo_documento,
                d.tipo_credito, d.data_entrega, d.status_ecac, d.status_normalizado,
                d.credito_original_utilizado, d.total_debitos_dcomp, d.credito_atualizado,
                e.razao_social, e.cnpj
         FROM ecac_perdcomp_documentos d
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY d.data_entrega DESC NULLS LAST`,
        params
      );

      const totalRisco = itens.reduce((a, i) => a + Number(i.credito_original_utilizado || 0), 0);

      res.json({
        itens,
        totais: {
          quantidade: itens.length,
          valor_em_risco: totalRisco,
        },
      });
    } catch (error: any) {
      log.error(`[Relatorios.compensacoesEmRisco] ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar relatório de compensações em risco' });
    }
  },

  /**
   * Dashboard consolidado.
   */
  dashboard: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      const empWhere = id_empresa ? `WHERE id_empresa = $1` : '';
      if (id_empresa) params.push(id_empresa);

      // Saldos
      const saldos = await getOne<any>(
        `SELECT
          COUNT(*)::int as quantidade,
          COALESCE(SUM(credito_atualizado), 0)::float as total_atualizado,
          COALESCE(SUM(total_utilizado), 0)::float as total_utilizado,
          COALESCE(SUM(saldo_disponivel), 0)::float as total_disponivel,
          COUNT(*) FILTER (WHERE saldo_disponivel > 0.01)::int as ativos
         FROM saldos_credito
         ${empWhere}`,
        params
      );

      // Documentos por status
      const documentosPorStatus = await getAll<any>(
        `SELECT
          COALESCE(status_normalizado, 'DESCONHECIDO') as status,
          COUNT(*)::int as quantidade,
          COALESCE(SUM(credito_atualizado), 0)::float as valor
         FROM ecac_perdcomp_documentos
         ${empWhere}
         GROUP BY status_normalizado
         ORDER BY quantidade DESC`,
        params
      );

      // Prescrição
      const prescricao = await getOne<any>(
        `SELECT
          COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 0 AND 30)::int as criticos_30d,
          COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 31 AND 90)::int as urgentes_90d,
          COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 91 AND 365)::int as proximos_365d,
          COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) < 0)::int as prescritos,
          COALESCE(SUM(saldo_disponivel) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 0 AND 90), 0)::float as valor_critico_90d
         FROM saldos_credito
         WHERE saldo_disponivel > 0.01 ${id_empresa ? `AND id_empresa = $1` : ''}`,
        params
      );

      // Retrabalho
      const retrabalho = await getOne<any>(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE tipo_documento ILIKE '%retificador%')::int as retificadores,
          CASE WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE tipo_documento ILIKE '%retificador%') * 100.0 / COUNT(*))::numeric, 2)
            ELSE 0 END as indice_pct
         FROM ecac_perdcomp_documentos ${empWhere}`,
        params
      );

      // Em risco
      const emRisco = await getOne<any>(
        `SELECT
          COUNT(*)::int as quantidade,
          COALESCE(SUM(credito_original_utilizado), 0)::float as valor
         FROM ecac_perdcomp_documentos
         WHERE status_normalizado IN ${STATUS_PERDIDOS_SQL} AND credito_original_utilizado > 0
         ${id_empresa ? `AND id_empresa = $1` : ''}`,
        params
      );

      res.json({
        saldos,
        documentos_por_status: documentosPorStatus.map(d => ({
          ...d,
          label: STATUS_LABELS[d.status as keyof typeof STATUS_LABELS] || d.status,
        })),
        prescricao,
        retrabalho,
        em_risco: emRisco,
      });
    } catch (error: any) {
      log.error(`[Relatorios.dashboard] ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
  },

  /**
   * Controle Consolidado de Créditos & Compensações.
   *
   * Reproduz a "Tabela1" (aba Créditos) da planilha que a área usuária utiliza,
   * com 24 colunas analíticas: PER/DCOMP Inicial, Empresa, CNPJ, Ano Base,
   * Competência, Data Prescrição, Status Atenção (cores), Tipo Crédito,
   * Valores (Inicial/Utilizado/Saldo/SELIC/Saldo Atualizado),
   * Débitos por tributo (IRPJ/CSLL/COFINS/PIS/INSS/Restituição),
   * Total Débitos, Qtd PER/DCOMPs vinculados.
   *
   * Cada linha = 1 crédito (identificado pelo PER/DCOMP Inicial).
   */
  controleConsolidado: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, status_atencao } = req.query;
      const params: any[] = [];
      const where = ['1=1'];
      if (id_empresa) { params.push(id_empresa); where.push(`sc.id_empresa = $${params.length}`); }

      const data = await getAll<any>(
        `WITH debitos_por_credito AS (
           SELECT
             COALESCE(d.numero_perdcomp_inicial, d.numero) as chave_credito,
             d.id_empresa,
             SUM(CASE WHEN deb.denominacao_receita ILIKE '%IRPJ%' OR deb.codigo_receita ILIKE '%IRPJ%' THEN deb.total ELSE 0 END) as deb_irpj,
             SUM(CASE WHEN deb.denominacao_receita ILIKE '%CSLL%' OR deb.codigo_receita ILIKE '%CSLL%' THEN deb.total ELSE 0 END) as deb_csll,
             SUM(CASE WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN deb.total ELSE 0 END) as deb_cofins,
             SUM(CASE WHEN deb.denominacao_receita ILIKE '%PIS%' OR deb.denominacao_receita ILIKE '%PASEP%' THEN deb.total ELSE 0 END) as deb_pis,
             SUM(CASE WHEN deb.denominacao_receita ILIKE '%INSS%' OR deb.denominacao_receita ILIKE '%Previdenc%' THEN deb.total ELSE 0 END) as deb_inss,
             SUM(CASE WHEN deb.denominacao_receita ILIKE '%IRRF%' THEN deb.total ELSE 0 END) as deb_irrf,
             SUM(deb.total) as deb_total
           FROM ecac_perdcomp_debitos_compensados deb
           JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
           GROUP BY chave_credito, d.id_empresa
         ),
         perdcomps_por_credito AS (
           SELECT
             COALESCE(numero_perdcomp_inicial, numero) as chave_credito,
             id_empresa,
             COUNT(*) as qtd_perdcomps,
             COUNT(*) FILTER (WHERE retificado_por_id IS NOT NULL) as qtd_retificados
           FROM ecac_perdcomp_documentos
           GROUP BY chave_credito, id_empresa
         )
         SELECT
           sc.numero_perdcomp_origem as perdcomp_inicial,
           e.razao_social as empresa,
           e.cnpj,
           sc.exercicio as ano_base,
           sc.data_entrega_pedido as competencia,
           sc.data_prescricao,
           (sc.data_prescricao - CURRENT_DATE)::INTEGER as dias_para_prescricao,
           -- Status Atenção (cores) igual planilha (coluna H)
           CASE
             WHEN sc.data_prescricao < CURRENT_DATE THEN 'PRESCRITO'
             WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '6 months' THEN 'URGENTE_6M'
             WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '12 months' THEN 'ATENCAO_1A'
             WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '24 months' THEN 'AVISO_2A'
             ELSE 'OK'
           END as status_atencao,
           sc.tipo_credito,
           sc.valor_saldo_negativo as valor_credito_inicial,
           sc.total_utilizado as valor_credito_utilizado,
           sc.saldo_disponivel as saldo_credito,
           sc.selic_acumulada as selic_acumulada_pct,
           sc.credito_atualizado as saldo_credito_atualizado,
           COALESCE(dpc.deb_irpj, 0) as deb_irpj,
           COALESCE(dpc.deb_csll, 0) as deb_csll,
           COALESCE(dpc.deb_cofins, 0) as deb_cofins,
           COALESCE(dpc.deb_pis, 0) as deb_pis,
           COALESCE(dpc.deb_inss, 0) as deb_inss,
           COALESCE(dpc.deb_irrf, 0) as deb_irrf,
           COALESCE(dpc.deb_total, 0) as total_debitos,
           COALESCE(ppc.qtd_perdcomps, 0) as qtd_perdcomps,
           COALESCE(ppc.qtd_retificados, 0) as qtd_retificados,
           sc.status_normalizado
         FROM saldos_credito sc
         JOIN adm_empresas e ON e.id = sc.id_empresa
         LEFT JOIN debitos_por_credito dpc ON dpc.chave_credito = sc.numero_perdcomp_origem AND dpc.id_empresa = sc.id_empresa
         LEFT JOIN perdcomps_por_credito ppc ON ppc.chave_credito = sc.numero_perdcomp_origem AND ppc.id_empresa = sc.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY sc.data_prescricao ASC NULLS LAST`,
        params
      );

      // Filtragem opcional por status_atencao (aplicada após a query)
      const filtered = status_atencao
        ? data.filter(r => r.status_atencao === status_atencao)
        : data;

      // Totalizadores
      const totais = {
        qtd_creditos: filtered.length,
        valor_credito_inicial: filtered.reduce((a, r) => a + Number(r.valor_credito_inicial || 0), 0),
        valor_credito_utilizado: filtered.reduce((a, r) => a + Number(r.valor_credito_utilizado || 0), 0),
        saldo_credito: filtered.reduce((a, r) => a + Number(r.saldo_credito || 0), 0),
        saldo_credito_atualizado: filtered.reduce((a, r) => a + Number(r.saldo_credito_atualizado || 0), 0),
        deb_irpj: filtered.reduce((a, r) => a + Number(r.deb_irpj || 0), 0),
        deb_csll: filtered.reduce((a, r) => a + Number(r.deb_csll || 0), 0),
        deb_cofins: filtered.reduce((a, r) => a + Number(r.deb_cofins || 0), 0),
        deb_pis: filtered.reduce((a, r) => a + Number(r.deb_pis || 0), 0),
        deb_inss: filtered.reduce((a, r) => a + Number(r.deb_inss || 0), 0),
        deb_irrf: filtered.reduce((a, r) => a + Number(r.deb_irrf || 0), 0),
        total_debitos: filtered.reduce((a, r) => a + Number(r.total_debitos || 0), 0),
        qtd_perdcomps: filtered.reduce((a, r) => a + Number(r.qtd_perdcomps || 0), 0),
      };

      // Distribuição por Status Atenção (para gráfico/resumo)
      const porAtencao: Record<string, number> = { PRESCRITO: 0, URGENTE_6M: 0, ATENCAO_1A: 0, AVISO_2A: 0, OK: 0 };
      for (const r of data) porAtencao[r.status_atencao as string] = (porAtencao[r.status_atencao as string] || 0) + 1;

      res.json({ creditos: filtered, totais, distribuicao_atencao: porAtencao });
    } catch (error: any) {
      log.error(`[Relatorios.controleConsolidado] ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar relatório consolidado' });
    }
  },
};
