import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { selicService } from '../services/selicService';
import { perdcompRegraService } from '../services/perdcompRegraService';
import {
  creditoCreateSchema, creditoUpdateSchema,
  debitoCreateSchema, debitoUpdateSchema,
} from '../validators/perdcompSchemas';

function calcularPrescricao(dtPagamento: string): string {
  const dt = new Date(dtPagamento);
  dt.setFullYear(dt.getFullYear() + 5);
  return dt.toISOString().substring(0, 10);
}

async function registrarHistorico(params: {
  id_pedido?: number; id_credito?: number; id_debito?: number;
  id_usuario: number; acao: string; campo_alterado?: string;
  valor_anterior?: string; valor_novo?: string; detalhes?: string;
}) {
  await runQuery(
    `INSERT INTO perdcomp_historico (id_pedido, id_credito, id_debito, id_usuario, acao, campo_alterado, valor_anterior, valor_novo, detalhes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [params.id_pedido || null, params.id_credito || null, params.id_debito || null,
      params.id_usuario, params.acao, params.campo_alterado || null,
      params.valor_anterior || null, params.valor_novo || null, params.detalhes || null]
  );
}


// ============ CRÉDITOS ============

export const perdcompCreditosController = {
  /**
   * Lista créditos disponíveis lendo de `saldos_credito` (tabela alimentada pela
   * sincronização e-CAC), seguindo o modelo da planilha "Controle de Créditos":
   * - PER/DCOMP Inicial, Empresa, CNPJ, Período, Tipo
   * - Valor Inicial, Utilizado, Saldo, SELIC, Saldo Atualizado
   * - Data Prescrição + Status Atenção (cor) baseado em dias restantes
   *
   * Mantém retrocompatibilidade com o fluxo manual via `perdcomp_creditos`
   * (que referencia perdcomp_empresas, não adm_empresas).
   */
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo_credito, status, busca, page = 1, limit = 20 } = req.query;

      const where = ['1=1'];
      const params: any[] = [];
      if (id_empresa) { params.push(id_empresa); where.push(`sc.id_empresa = $${params.length}`); }
      if (tipo_credito) { params.push(tipo_credito); where.push(`sc.tipo_credito = $${params.length}`); }
      if (status === 'Disponível') where.push(`sc.saldo_disponivel > 0`);
      else if (status === 'Esgotado') where.push(`sc.saldo_disponivel <= 0`);
      if (busca) {
        const b = `%${busca}%`;
        params.push(b); params.push(b); params.push(b);
        where.push(`(e.razao_social ILIKE $${params.length-2} OR e.cnpj ILIKE $${params.length-1} OR sc.numero_perdcomp_origem ILIKE $${params.length})`);
      }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM saldos_credito sc
         JOIN adm_empresas e ON e.id = sc.id_empresa
         WHERE ${where.join(' AND ')}`,
        params
      );

      const listParams = [...params];
      listParams.push(Number(limit)); const limitIdx = listParams.length;
      listParams.push(offset); const offsetIdx = listParams.length;

      // Tradução para o formato esperado pelo frontend (campos compatíveis com perdcomp_creditos)
      const creditos = await getAll<any>(
        `SELECT
            sc.id, sc.id_empresa,
            sc.numero_perdcomp_origem,
            sc.tipo_credito,
            sc.exercicio,
            sc.periodo_apuracao,
            sc.valor_saldo_negativo as valor_original,
            sc.selic_acumulada,
            sc.credito_atualizado as valor_atualizado,
            sc.total_utilizado,
            sc.saldo_disponivel,
            sc.data_entrega_pedido as dt_pagamento_original,
            sc.data_prescricao as dt_vencimento_prescricao,
            sc.status_normalizado as status,
            sc.observacoes,
            sc.criado_em,
            sc.atualizado_em,
            sc.origem,
            e.razao_social as empresa_razao_social,
            e.cnpj as empresa_cnpj,
            (sc.data_prescricao::date - CURRENT_DATE)::INTEGER as dias_para_prescricao,
            -- "Status Atenção" igual à coluna H da planilha (cores)
            CASE
              WHEN sc.data_prescricao < CURRENT_DATE THEN 'PRESCRITO'
              WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '6 months' THEN 'URGENTE_6M'
              WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '12 months' THEN 'ATENCAO_1A'
              WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '24 months' THEN 'AVISO_2A'
              ELSE 'OK'
            END as status_atencao,
            -- Quantidade de PER/DCOMPs vinculados a este crédito (igual coluna "Nº PER/DCOMPs" da planilha)
            (SELECT COUNT(*) FROM ecac_perdcomp_documentos d
             WHERE d.id_empresa = sc.id_empresa
               AND (d.numero_perdcomp_inicial = sc.numero_perdcomp_origem OR d.numero = sc.numero_perdcomp_origem)) as qtd_perdcomps
         FROM saldos_credito sc
         JOIN adm_empresas e ON e.id = sc.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY sc.data_prescricao ASC NULLS LAST
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        listParams
      );

      res.json({
        data: creditos,
        pagination: { page: Number(page), limit: Number(limit), total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / Number(limit)) }
      });
    } catch (error: any) {
      log.error(`Erro ao listar créditos: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      // A listagem usa saldos_credito (alimentada pela sincronização e-CAC).
      // Tenta primeiro essa fonte; só cai pro modelo manual perdcomp_creditos como fallback.
      const credito = await getOne<any>(
        `SELECT sc.*,
                sc.valor_saldo_negativo  AS valor_original,
                sc.credito_atualizado    AS valor_atualizado,
                sc.data_entrega_pedido   AS dt_pagamento_original,
                sc.data_prescricao       AS dt_vencimento_prescricao,
                sc.status_normalizado    AS status,
                e.razao_social AS empresa_razao_social,
                e.cnpj         AS empresa_cnpj
           FROM saldos_credito sc
           JOIN adm_empresas e ON e.id = sc.id_empresa
          WHERE sc.id = $1`,
        [req.params.id]
      );
      if (credito) return res.json(credito);

      const manual = await getOne<any>(
        `SELECT c.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj
           FROM perdcomp_creditos c
           JOIN perdcomp_empresas e ON e.id = c.id_empresa
          WHERE c.id = $1`,
        [req.params.id]
      );
      if (!manual) return res.status(404).json({ error: 'Crédito não encontrado' });
      res.json(manual);
    } catch (error: any) {
      log.error(`Erro ao buscar crédito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = creditoCreateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const data = resultado.data;
      const validacao = perdcompRegraService.validarCredito(data);
      if (!validacao.valido) return res.status(400).json({ errors: validacao.erros });

      const prescricao = calcularPrescricao(data.dt_pagamento_original);
      let valorAtualizado = data.valor_original;
      let selicAcumulado = 0;

      try {
        const selic = await selicService.calcularAtualizacao(data.valor_original, data.dt_pagamento_original);
        valorAtualizado = selic.valorAtualizado;
        selicAcumulado = valorAtualizado - data.valor_original;
      } catch { /* SELIC indisponível, usa valor original */ }

      const { id: lastID } = await runQuery(
        `INSERT INTO perdcomp_creditos (id_empresa, tipo_credito, origem_credito, periodo_apuracao, codigo_receita, valor_original, valor_selic_acumulado, valor_atualizado, dt_pagamento_original, dt_vencimento_prescricao, saldo_disponivel, observacoes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [data.id_empresa, data.tipo_credito, data.origem_credito, data.periodo_apuracao, data.codigo_receita || null,
          data.valor_original, selicAcumulado, valorAtualizado, data.dt_pagamento_original, prescricao, valorAtualizado, data.observacoes || null]
      );

      await registrarHistorico({ id_credito: lastID, id_usuario: req.user!.id, acao: 'Criação', detalhes: `Crédito ${data.tipo_credito} - R$ ${data.valor_original}` });

      const credito = await getOne<any>('SELECT * FROM perdcomp_creditos WHERE id = $1', [lastID]);
      res.status(201).json(credito);
    } catch (error: any) {
      log.error(`Erro ao criar crédito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = creditoUpdateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const credito = await getOne<any>('SELECT * FROM perdcomp_creditos WHERE id = $1', [req.params.id]);
      if (!credito) return res.status(404).json({ error: 'Crédito não encontrado' });

      const campos = resultado.data;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(campos)) {
        if (value !== undefined) { vals.push(value); sets.push(`${key} = $${vals.length}`); }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

      if (campos.valor_original && campos.valor_original !== credito.valor_original) {
        const prescricao = calcularPrescricao(campos.dt_pagamento_original || credito.dt_pagamento_original);
        vals.push(prescricao); sets.push(`dt_vencimento_prescricao = $${vals.length}`);
        vals.push(campos.valor_original); sets.push(`valor_atualizado = $${vals.length}`);
        vals.push(campos.valor_original); sets.push(`saldo_disponivel = $${vals.length}`);
      }

      sets.push("atualizado_em = NOW()");
      vals.push(req.params.id);
      await runQuery(`UPDATE perdcomp_creditos SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      await registrarHistorico({ id_credito: Number(req.params.id), id_usuario: req.user!.id, acao: 'Atualização' });

      const atualizado = await getOne<any>('SELECT * FROM perdcomp_creditos WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar crédito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      // TODO(IDOR): validar que req.user tem acesso à id_empresa do crédito
      // antes de deletar (escopo de tenant). Hoje qualquer usuário autenticado
      // pode deletar crédito de qualquer empresa via /perdcomp/creditos/:id.
      const credito = await getOne<any>('SELECT id FROM perdcomp_creditos WHERE id = $1', [req.params.id]);
      if (!credito) return res.status(404).json({ error: 'Crédito não encontrado' });

      await runQuery('DELETE FROM perdcomp_creditos WHERE id = $1', [req.params.id]);
      res.json({ message: 'Crédito excluído com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir crédito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizarSelic: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.body;
      await selicService.atualizarTaxas();
      const atualizados = await selicService.atualizarCreditosSelic(id_empresa);
      res.json({ message: `${atualizados} créditos atualizados com SELIC` });
    } catch (error: any) {
      log.error(`Erro ao atualizar SELIC: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar taxas SELIC' });
    }
  },
};

// ============ DÉBITOS ============

export const perdcompDebitosController = {
  /**
   * Lista os DÉBITOS COMPENSADOS provenientes da sincronização e-CAC.
   *
   * Cada linha = 1 débito compensado por 1 DCOMP. O status do débito reflete o
   * status do PER/DCOMP onde ele foi compensado (status_normalizado).
   * Aplicação no simulador: considerar PENDENTES apenas os débitos cujo
   * PER/DCOMP está EM_ANALISE/PENDENTE_DECISAO (ainda não confirmados).
   */
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo_tributo, status, page = 1, limit = 20 } = req.query;
      const where = ['1=1'];
      const params: any[] = [];

      if (id_empresa) { params.push(id_empresa); where.push(`d.id_empresa = $${params.length}`); }
      if (tipo_tributo) {
        params.push(`%${tipo_tributo}%`);
        where.push(`(deb.denominacao_receita ILIKE $${params.length} OR deb.codigo_receita ILIKE $${params.length})`);
      }
      // Status: Pendente = DCOMP em análise; Compensado = deferido/homologado
      if (status === 'Pendente') {
        where.push(`COALESCE(d.status_normalizado, 'EM_ANALISE') IN ('EM_ANALISE','PENDENTE_DECISAO')`);
      } else if (status === 'Compensado') {
        where.push(`d.status_normalizado IN ('DEFERIDO','PARCIALMENTE_DEFERIDO','HOMOLOGADO','PARCIALMENTE_HOMOLOGADO')`);
      }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total
         FROM ecac_perdcomp_debitos_compensados deb
         JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE ${where.join(' AND ')}`,
        params
      );

      const listParams = [...params];
      listParams.push(Number(limit)); const limitIdx2 = listParams.length;
      listParams.push(offset); const offsetIdx2 = listParams.length;

      const debitos = await getAll<any>(
        `SELECT
            deb.id,
            d.id_empresa,
            -- Classifica tributo igual à planilha (colunas IRPJ/CSLL/COFINS/PIS/INSS/Restituição)
            CASE
              WHEN deb.denominacao_receita ILIKE '%IRPJ%' OR deb.codigo_receita ILIKE '%IRPJ%' THEN 'IRPJ'
              WHEN deb.denominacao_receita ILIKE '%CSLL%' OR deb.codigo_receita ILIKE '%CSLL%' THEN 'CSLL'
              WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN 'COFINS'
              WHEN deb.denominacao_receita ILIKE '%PIS%' OR deb.denominacao_receita ILIKE '%PASEP%' THEN 'PIS/PASEP'
              WHEN deb.denominacao_receita ILIKE '%INSS%' OR deb.denominacao_receita ILIKE '%Previdenc%' THEN 'INSS'
              WHEN deb.denominacao_receita ILIKE '%IRRF%' THEN 'IRRF'
              ELSE COALESCE(deb.denominacao_receita, 'OUTROS')
            END as tipo_tributo,
            deb.codigo_receita,
            deb.denominacao_receita,
            deb.grupo_tributo,
            deb.periodo_apuracao,
            deb.principal as valor_principal,
            deb.multa as valor_multa,
            deb.juros as valor_juros,
            deb.total as valor_total,
            deb.data_vencimento as dt_vencimento,
            deb.total as saldo_devedor,  -- compatibilidade
            CASE
              WHEN d.status_normalizado IN ('DEFERIDO','PARCIALMENTE_DEFERIDO','HOMOLOGADO','PARCIALMENTE_HOMOLOGADO') THEN 'Compensado'
              WHEN d.status_normalizado IN ('INDEFERIDO','NAO_HOMOLOGADO') THEN 'Não Compensado'
              ELSE 'Pendente'
            END as status,
            d.status_normalizado,
            d.numero as numero_perdcomp,
            d.numero_perdcomp_inicial,
            d.data_entrega as data_compensacao,
            deb.criado_em,
            e.razao_social as empresa_razao_social,
            e.cnpj as empresa_cnpj
         FROM ecac_perdcomp_debitos_compensados deb
         JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
         JOIN adm_empresas e ON e.id = d.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY d.data_entrega DESC NULLS LAST, deb.id DESC
         LIMIT $${limitIdx2} OFFSET $${offsetIdx2}`,
        listParams
      );

      res.json({
        data: debitos,
        pagination: { page: Number(page), limit: Number(limit), total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / Number(limit)) }
      });
    } catch (error: any) {
      log.error(`Erro ao listar débitos: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const debito = await getOne<any>(
        `SELECT d.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj FROM perdcomp_debitos d JOIN perdcomp_empresas e ON e.id = d.id_empresa WHERE d.id = $1`,
        [req.params.id]
      );
      if (!debito) return res.status(404).json({ error: 'Débito não encontrado' });
      res.json(debito);
    } catch (error: any) {
      log.error(`Erro ao buscar débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = debitoCreateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const d = resultado.data;
      const valorTotal = d.valor_principal + d.valor_multa + d.valor_juros;

      const { id: lastID } = await runQuery(
        `INSERT INTO perdcomp_debitos (id_empresa, tipo_tributo, codigo_receita, periodo_apuracao, valor_principal, valor_multa, valor_juros, valor_total, dt_vencimento, saldo_devedor, observacoes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [d.id_empresa, d.tipo_tributo, d.codigo_receita || null, d.periodo_apuracao, d.valor_principal, d.valor_multa, d.valor_juros, valorTotal, d.dt_vencimento, valorTotal, d.observacoes || null]
      );

      await registrarHistorico({ id_debito: lastID, id_usuario: req.user!.id, acao: 'Criação', detalhes: `Débito ${d.tipo_tributo} - R$ ${valorTotal}` });

      const debito = await getOne<any>('SELECT * FROM perdcomp_debitos WHERE id = $1', [lastID]);
      res.status(201).json(debito);
    } catch (error: any) {
      log.error(`Erro ao criar débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = debitoUpdateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const debito = await getOne<any>('SELECT * FROM perdcomp_debitos WHERE id = $1', [req.params.id]);
      if (!debito) return res.status(404).json({ error: 'Débito não encontrado' });

      const campos = resultado.data;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(campos)) {
        if (value !== undefined) { vals.push(value); sets.push(`${key} = $${vals.length}`); }
      }

      if (campos.valor_principal !== undefined || campos.valor_multa !== undefined || campos.valor_juros !== undefined) {
        const vp = campos.valor_principal ?? debito.valor_principal;
        const vm = campos.valor_multa ?? debito.valor_multa;
        const vj = campos.valor_juros ?? debito.valor_juros;
        vals.push(vp + vm + vj); sets.push(`valor_total = $${vals.length}`);
        vals.push(vp + vm + vj); sets.push(`saldo_devedor = $${vals.length}`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      sets.push("atualizado_em = NOW()");
      vals.push(req.params.id);
      await runQuery(`UPDATE perdcomp_debitos SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      const atualizado = await getOne<any>('SELECT * FROM perdcomp_debitos WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const debito = await getOne<any>('SELECT id FROM perdcomp_debitos WHERE id = $1', [req.params.id]);
      if (!debito) return res.status(404).json({ error: 'Débito não encontrado' });

      await runQuery('DELETE FROM perdcomp_debitos WHERE id = $1', [req.params.id]);
      res.json({ message: 'Débito excluído com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};


// ============ DASHBOARD ============

export const perdcompDashboardController = {
  obter: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      // id_empresa vem do frontend e refere-se a adm_empresas.id (mesmo ID usado
      // por saldos_credito.id_empresa e ecac_perdcomp_documentos.id_empresa).
      // A tabela perdcomp_creditos referencia perdcomp_empresas.id (diferente),
      // por isso é necessário consultar as duas fontes separadamente quando essa
      // tabela tiver dados; hoje a fonte oficial pós-sincronização e-CAC é
      // `saldos_credito` (que reproduz o modelo da planilha "Controle de Créditos").

      const empFilter = id_empresa ? `AND id_empresa = $1` : '';
      const empWhereEcac = id_empresa ? `AND id_empresa = $1` : '';
      const empParams: any[] = id_empresa ? [id_empresa] : [];

      // Queries do dashboard executadas SERIAL.
      // Tentei Promise.all mas piorou sob carga: 9 queries × 20 conn = 180 queries
      // simultâneas em pool de 30 conexões → connectionTimeoutMillis estoura.
      // Serial é auto-regulado (cada request ocupa 1 conn por vez).
      const creds = await getOne<any>(
        `SELECT COUNT(*) as total, COALESCE(SUM(saldo_disponivel), 0) as valor
         FROM saldos_credito WHERE saldo_disponivel > 0 ${empFilter}`,
        empParams
      );
      const debs = await getOne<any>(
        `SELECT COUNT(deb.id) as total, COALESCE(SUM(deb.total), 0) as valor
         FROM ecac_perdcomp_debitos_compensados deb
         JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
         WHERE COALESCE(d.status_normalizado, 'EM_ANALISE') IN ('EM_ANALISE','PENDENTE_DECISAO')
         ${id_empresa ? `AND d.id_empresa = $1` : ''}`,
        empParams
      );
      const statusCounts = await getAll<any>(
        `SELECT COALESCE(status_normalizado, 'DESCONHECIDO') as status, COUNT(*) as total
         FROM ecac_perdcomp_documentos WHERE 1=1 ${empWhereEcac}
         GROUP BY status_normalizado`,
        empParams
      );
      const prescricao = await getOne<any>(
        `SELECT
            COUNT(*) FILTER (WHERE data_prescricao < CURRENT_DATE) as prescritos,
            COALESCE(SUM(saldo_disponivel) FILTER (WHERE data_prescricao < CURRENT_DATE), 0) as valor_prescritos,
            COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE AND data_prescricao < CURRENT_DATE + INTERVAL '6 months') as urgente_6m,
            COALESCE(SUM(saldo_disponivel) FILTER (WHERE data_prescricao >= CURRENT_DATE AND data_prescricao < CURRENT_DATE + INTERVAL '6 months'), 0) as valor_urgente_6m,
            COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE + INTERVAL '6 months' AND data_prescricao < CURRENT_DATE + INTERVAL '12 months') as atencao_1a,
            COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE + INTERVAL '12 months' AND data_prescricao < CURRENT_DATE + INTERVAL '24 months') as aviso_2a,
            COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE + INTERVAL '24 months') as ok
         FROM saldos_credito WHERE saldo_disponivel > 0 ${empFilter}`,
        empParams
      );
      const creditosPorTipo = await getAll<any>(
        `SELECT tipo_credito as tipo, COUNT(*) as total,
                COALESCE(SUM(saldo_disponivel), 0) as valor,
                COALESCE(SUM(credito_atualizado), 0) as valor_atualizado,
                COALESCE(SUM(total_utilizado), 0) as valor_utilizado
         FROM saldos_credito WHERE saldo_disponivel > 0 ${empFilter}
         GROUP BY tipo_credito ORDER BY valor DESC`,
        empParams
      );
      const debitosPorTributo = await getAll<any>(
        `SELECT
            CASE
              WHEN deb.denominacao_receita ILIKE '%IRPJ%' OR deb.codigo_receita ILIKE '%IRPJ%' THEN 'IRPJ'
              WHEN deb.denominacao_receita ILIKE '%CSLL%' OR deb.codigo_receita ILIKE '%CSLL%' THEN 'CSLL'
              WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN 'COFINS'
              WHEN deb.denominacao_receita ILIKE '%PIS%' OR deb.denominacao_receita ILIKE '%PASEP%' THEN 'PIS/PASEP'
              WHEN deb.denominacao_receita ILIKE '%INSS%' OR deb.denominacao_receita ILIKE '%Previdenc%' THEN 'INSS'
              WHEN deb.denominacao_receita ILIKE '%IRRF%' THEN 'IRRF'
              ELSE COALESCE(deb.denominacao_receita, 'OUTROS')
            END as tributo,
            COUNT(*) as qtd, COALESCE(SUM(deb.total), 0) as valor
         FROM ecac_perdcomp_debitos_compensados deb
         JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
         WHERE 1=1 ${id_empresa ? 'AND d.id_empresa = $1' : ''}
         GROUP BY tributo ORDER BY valor DESC`,
        empParams
      );
      const ultMovimentos = await getAll<any>(
        `SELECT
            d.id, d.numero,
            COALESCE(d.tipo_documento, 'PER/DCOMP') AS acao,
            d.numero || COALESCE(' · ' || d.status_ecac, '') AS detalhes,
            d.responsavel_nome, d.responsavel_cpf,
            COALESCE(d.data_transmissao, d.data_entrega, d.criado_em) AS criado_em
         FROM ecac_perdcomp_documentos d
         WHERE 1=1 ${id_empresa ? 'AND d.id_empresa = $1' : ''}
         ORDER BY COALESCE(d.data_transmissao, d.data_entrega, d.criado_em) DESC, d.id DESC
         LIMIT 10`,
        empParams
      );
      const ecacDocs = await getOne<{ total: number; com_recibo: number; sem_recibo: number }>(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE recibo_pdf IS NOT NULL) as com_recibo,
                COUNT(*) FILTER (WHERE recibo_pdf IS NULL)     as sem_recibo
         FROM ecac_perdcomp_documentos WHERE 1=1 ${empWhereEcac}`,
        empParams
      );
      const byStatus = (s: string) => Number(statusCounts.find(r => r.status === s)?.total || 0);
      const pedidosEmAnalise = byStatus('EM_ANALISE') + byStatus('PENDENTE_DECISAO');
      const pedidosDeferidos = byStatus('DEFERIDO') + byStatus('PARCIALMENTE_DEFERIDO') + byStatus('HOMOLOGADO') + byStatus('PARCIALMENTE_HOMOLOGADO');
      const pedidosIndeferidos = byStatus('INDEFERIDO') + byStatus('NAO_HOMOLOGADO');
      const totalDecididos = pedidosDeferidos + pedidosIndeferidos;
      const taxaDeferimento = totalDecididos > 0 ? (pedidosDeferidos / totalDecididos * 100) : 0;

      const STATUS_LABEL: Record<string, string> = {
        EM_ANALISE: 'Em Análise', PENDENTE_DECISAO: 'Pendente Decisão',
        DEFERIDO: 'Deferido', PARCIALMENTE_DEFERIDO: 'Parc. Deferido',
        HOMOLOGADO: 'Homologado', PARCIALMENTE_HOMOLOGADO: 'Parc. Homologado',
        INDEFERIDO: 'Indeferido', NAO_HOMOLOGADO: 'Não Homologado',
        CANCELADO: 'Cancelado', RETIFICADO: 'Retificado', DESCONHECIDO: 'Sem Status',
      };
      const pedidosPorStatus = statusCounts.map(r => ({
        status: STATUS_LABEL[r.status as string] || r.status,
        total: Number(r.total),
      }));

      res.json({
        total_creditos_disponiveis: Number(creds?.total) || 0,
        valor_creditos_disponiveis: Number(creds?.valor) || 0,
        total_debitos_pendentes: Number(debs?.total) || 0,
        valor_debitos_pendentes: Number(debs?.valor) || 0,
        pedidos_em_analise: pedidosEmAnalise,
        pedidos_deferidos: pedidosDeferidos,
        pedidos_indeferidos: pedidosIndeferidos,
        taxa_deferimento: Math.round(taxaDeferimento * 100) / 100,
        creditos_proximos_prescricao: Number(prescricao?.urgente_6m) || 0,
        valor_creditos_prescricao: Number(prescricao?.valor_urgente_6m) || 0,
        prescricao_detalhe: {
          prescritos: Number(prescricao?.prescritos) || 0,
          valor_prescritos: Number(prescricao?.valor_prescritos) || 0,
          urgente_6m: Number(prescricao?.urgente_6m) || 0,
          valor_urgente_6m: Number(prescricao?.valor_urgente_6m) || 0,
          atencao_1a: Number(prescricao?.atencao_1a) || 0,
          aviso_2a: Number(prescricao?.aviso_2a) || 0,
          ok: Number(prescricao?.ok) || 0,
        },
        documentos_ecac: Number(ecacDocs?.total) || 0,
        documentos_ecac_com_recibo: Number(ecacDocs?.com_recibo) || 0,
        documentos_ecac_sem_recibo: Number(ecacDocs?.sem_recibo) || 0,
        creditos_por_tipo: creditosPorTipo.map(c => ({
          tipo: c.tipo,
          total: Number(c.total),
          valor: Number(c.valor),
          valor_atualizado: Number(c.valor_atualizado),
          valor_utilizado: Number(c.valor_utilizado),
        })),
        debitos_por_tributo: debitosPorTributo.map(d => ({
          tributo: d.tributo,
          qtd: Number(d.qtd),
          valor: Number(d.valor),
        })),
        pedidos_por_status: pedidosPorStatus,
        ultimos_movimentos: ultMovimentos.map(m => ({
          id: Number(m.id),
          numero: m.numero,
          acao: m.acao,
          detalhes: m.detalhes,
          id_usuario: 0,
          usuario_nome: m.responsavel_nome || null,
          responsavel_nome: m.responsavel_nome || null,
          responsavel_cpf: m.responsavel_cpf || null,
          criado_em: m.criado_em,
        })),
      });
    } catch (error: any) {
      // Stack completa no log para facilitar diagnóstico de 5xx em load test.
      log.error(`Erro ao obter dashboard: ${error.message}\n${error.stack || ''}`);
      const body: any = { error: 'Erro interno do servidor' };
      if (process.env.NODE_ENV !== 'production') {
        body.message = error.message;
        body.code = error.code;
      }
      res.status(500).json(body);
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════
// SIMULADOR PER/DCOMP — modos Manual e Automático
// ────────────────────────────────────────────────────────────────────────────
// Manual: usuário escolhe créditos (saldos_credito) e digita valor por
// tributo (agregado).
// Automático: 4 métodos de entrada (tributo+valor, histórico, período+tipo,
// texto-livre) × 3 estratégias de alocação (FIFO prescrição, FIFO+compatibili-
// dade, maximizar SELIC).
// ════════════════════════════════════════════════════════════════════════════

type EstrategiaAlocacao = 'FIFO_PRESCRICAO' | 'FIFO_COMPATIBILIDADE' | 'MAXIMIZAR_SELIC';
type DebitoEntrada = { tributo: string; valor: number };

const TRIBUTOS_PREVIDENCIARIOS = new Set(['INSS']);
const NORMALIZAR_TRIBUTO = (t: string) =>
  t.toUpperCase().replace('PASEP', 'PIS/PASEP').replace(/\s+/g, '').replace('PIS/PASEP', 'PIS/PASEP');

// Verifica se um crédito pode compensar um débito (regra IN RFB 2055/2021 simplificada)
function podeCompensar(tipoCredito: string, tributoDebito: string): boolean {
  const cred = (tipoCredito || '').toUpperCase();
  const deb = (tributoDebito || '').toUpperCase();
  const credPrev = TRIBUTOS_PREVIDENCIARIOS.has(cred) || cred.includes('INSS');
  const debPrev = TRIBUTOS_PREVIDENCIARIOS.has(deb) || deb.includes('INSS') || deb.includes('PREVIDENC');
  // Previdenciário só compensa previdenciário (e vice-versa)
  return credPrev === debPrev;
}

// Parser regex simples para texto-livre (fallback se não houver LLM)
// Reconhece padrões como: "20000 cofins", "PIS 5.000,00", "compensar IRPJ R$ 12.500"
function parseTextoLivre(texto: string): DebitoEntrada[] {
  const resultado: DebitoEntrada[] = [];
  const tributosKnown = ['PIS/PASEP', 'PIS', 'PASEP', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'IRRF', 'INSS', 'IOF', 'CIDE'];
  // Quebra por linhas/vírgulas/" e "
  const partes = texto.split(/[\n,;]| e /gi).map(s => s.trim()).filter(Boolean);
  for (const parte of partes) {
    // procura tributo
    const tributoMatch = tributosKnown.find(t => parte.toUpperCase().includes(t));
    if (!tributoMatch) continue;
    // procura número (suporta 1.234,56 / 1234.56 / 1234)
    const numMatch = parte.match(/[\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+/);
    if (!numMatch) continue;
    let valorStr = numMatch[0];
    // se tem "," no final, é decimal pt-BR; se só ".", trata como decimal en-US
    if (valorStr.includes(',')) valorStr = valorStr.replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(valorStr);
    if (isNaN(valor) || valor <= 0) continue;
    resultado.push({ tributo: tributoMatch === 'PASEP' ? 'PIS/PASEP' : tributoMatch, valor });
  }
  return resultado;
}

// Núcleo de alocação: distribui débitos sobre créditos disponíveis
// Retorna créditos selecionados, débitos compensados, alertas.
function alocarCreditos(
  debitos: DebitoEntrada[],
  creditos: any[],
  estrategia: EstrategiaAlocacao
) {
  // Ordena créditos conforme estratégia
  const creditosOrdenados = [...creditos].filter(c => Number(c.saldo_disponivel) > 0);
  if (estrategia === 'FIFO_PRESCRICAO' || estrategia === 'FIFO_COMPATIBILIDADE') {
    creditosOrdenados.sort((a, b) => {
      const da = a.data_prescricao ? new Date(a.data_prescricao).getTime() : Infinity;
      const db = b.data_prescricao ? new Date(b.data_prescricao).getTime() : Infinity;
      return da - db;
    });
  } else if (estrategia === 'MAXIMIZAR_SELIC') {
    creditosOrdenados.sort((a, b) => Number(b.selic_acumulada || 0) - Number(a.selic_acumulada || 0));
  }

  const saldoPorCredito = new Map<number, number>();
  creditosOrdenados.forEach(c => saldoPorCredito.set(c.id, Number(c.saldo_disponivel)));

  const creditosSelecionados: any[] = [];
  const debitosCompensados: any[] = [];
  const alertas: string[] = [];
  let totalCreditoUtilizado = 0;
  let totalDebitoCompensado = 0;

  for (const deb of debitos) {
    let restante = deb.valor;
    let compensadoNesteDeb = 0;
    const fontesUsadas: { id_credito: number; tipo_credito: string; valor: number }[] = [];

    for (const cred of creditosOrdenados) {
      if (restante <= 0) break;
      const saldoCred = saldoPorCredito.get(cred.id) || 0;
      if (saldoCred <= 0) continue;

      // Verifica compatibilidade (se estratégia exigir)
      if (estrategia === 'FIFO_COMPATIBILIDADE' && !podeCompensar(cred.tipo_credito, deb.tributo)) {
        continue;
      }

      const valorUsar = Math.min(saldoCred, restante);
      fontesUsadas.push({ id_credito: cred.id, tipo_credito: cred.tipo_credito, valor: valorUsar });
      saldoPorCredito.set(cred.id, saldoCred - valorUsar);
      restante -= valorUsar;
      compensadoNesteDeb += valorUsar;
      totalCreditoUtilizado += valorUsar;
    }

    totalDebitoCompensado += compensadoNesteDeb;
    debitosCompensados.push({
      tributo: deb.tributo,
      valor_solicitado: deb.valor,
      valor_compensado: compensadoNesteDeb,
      saldo_restante: restante,
      fontes: fontesUsadas,
    });
    if (restante > 0) {
      alertas.push(`Crédito insuficiente para ${deb.tributo}: faltam R$ ${restante.toFixed(2)}`);
    }
  }

  // Monta lista de créditos usados (com totais agregados)
  const usadoPorCredito = new Map<number, number>();
  for (const d of debitosCompensados) {
    for (const f of d.fontes) {
      usadoPorCredito.set(f.id_credito, (usadoPorCredito.get(f.id_credito) || 0) + f.valor);
    }
  }
  for (const cred of creditosOrdenados) {
    const usado = usadoPorCredito.get(cred.id) || 0;
    if (usado === 0) continue;
    creditosSelecionados.push({
      id: cred.id,
      tipo: cred.tipo_credito,
      numero_perdcomp_origem: cred.numero_perdcomp_origem,
      valor_utilizado: usado,
      saldo_anterior: Number(cred.saldo_disponivel),
      saldo_restante: Number(cred.saldo_disponivel) - usado,
      data_prescricao: cred.data_prescricao,
    });

    // Alertas de prescrição (< 90 dias)
    if (cred.data_prescricao) {
      const diasAteVenc = Math.ceil(
        (new Date(cred.data_prescricao).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (diasAteVenc < 90 && diasAteVenc > 0) {
        alertas.push(`Crédito #${cred.id} (${cred.tipo_credito}) prescreve em ${diasAteVenc} dias`);
      } else if (diasAteVenc <= 0) {
        alertas.push(`⚠ Crédito #${cred.id} (${cred.tipo_credito}) já está prescrito`);
      }
    }
  }

  return {
    creditos_selecionados: creditosSelecionados,
    debitos_compensados: debitosCompensados,
    total_credito_utilizado: totalCreditoUtilizado,
    total_debito_compensado: totalDebitoCompensado,
    economia_estimada: totalDebitoCompensado,
    alertas,
  };
}

export const perdcompSimuladorController = {
  /**
   * MANUAL: usuário escolhe créditos específicos (de saldos_credito) e digita
   * valor agregado por tributo. Sistema valida e calcula o resultado.
   */
  simular: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, creditos: credsInput, debitos: debsInput } = req.body;
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });
      if (!Array.isArray(credsInput) || credsInput.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um crédito' });
      }
      if (!Array.isArray(debsInput) || debsInput.length === 0) {
        return res.status(400).json({ error: 'Informe ao menos um débito a compensar' });
      }

      const creditosSelecionados: any[] = [];
      let totalCreditoUtilizado = 0;
      const alertas: string[] = [];

      for (const ci of credsInput) {
        const credito = await getOne<any>(
          'SELECT * FROM saldos_credito WHERE id = $1 AND id_empresa = $2', [ci.id, id_empresa]
        );
        if (!credito) continue;
        const valorUsar = Math.min(Number(ci.valor_utilizar), Number(credito.saldo_disponivel));
        creditosSelecionados.push({
          id: credito.id, tipo: credito.tipo_credito,
          numero_perdcomp_origem: credito.numero_perdcomp_origem,
          valor_utilizado: valorUsar,
          saldo_anterior: Number(credito.saldo_disponivel),
          saldo_restante: Number(credito.saldo_disponivel) - valorUsar,
          data_prescricao: credito.data_prescricao,
        });
        totalCreditoUtilizado += valorUsar;
        if (credito.data_prescricao) {
          const dias = Math.ceil((new Date(credito.data_prescricao).getTime() - Date.now()) / 86400000);
          if (dias < 90 && dias > 0) alertas.push(`Crédito #${credito.id} prescreve em ${dias} dias`);
        }
      }

      let totalDebitoCompensado = 0;
      const debitosCompensados: any[] = [];
      for (const di of debsInput) {
        const v = Number(di.valor_compensar);
        if (v > 0) {
          debitosCompensados.push({
            tributo: di.tributo, valor_solicitado: v, valor_compensado: v, saldo_restante: 0,
          });
          totalDebitoCompensado += v;
        }
      }

      if (totalCreditoUtilizado < totalDebitoCompensado) {
        alertas.push(`Créditos insuficientes: faltam R$ ${(totalDebitoCompensado - totalCreditoUtilizado).toFixed(2)}`);
      }

      res.json({
        modo: 'manual',
        creditos_selecionados: creditosSelecionados,
        debitos_compensados: debitosCompensados,
        total_credito_utilizado: totalCreditoUtilizado,
        total_debito_compensado: totalDebitoCompensado,
        economia_estimada: totalDebitoCompensado,
        alertas,
      });
    } catch (error: any) {
      log.error(`Erro ao simular (manual): ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * AUTOMÁTICO: recebe um método de input e uma estratégia de alocação,
   * resolve os débitos, busca créditos disponíveis e aloca conforme estratégia.
   *
   * Body:
   *   id_empresa: number
   *   estrategia: 'FIFO_PRESCRICAO' | 'FIFO_COMPATIBILIDADE' | 'MAXIMIZAR_SELIC'
   *   metodo: 'tributo_valor' | 'historico' | 'periodo_tipo' | 'texto_livre'
   *   debitos?:   [{tributo, valor}]            (tributo_valor)
   *   texto?:     string                         (texto_livre)
   *   tipo_credito?: string                      (periodo_tipo)
   */
  automatico: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, estrategia = 'FIFO_PRESCRICAO', metodo, debitos, texto, tipo_credito } = req.body;
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });
      const estrategiasValidas: EstrategiaAlocacao[] = ['FIFO_PRESCRICAO', 'FIFO_COMPATIBILIDADE', 'MAXIMIZAR_SELIC'];
      if (!estrategiasValidas.includes(estrategia)) {
        return res.status(400).json({ error: `Estratégia inválida. Use uma de: ${estrategiasValidas.join(', ')}` });
      }

      // Resolve débitos conforme método de input
      let debitosResolvidos: DebitoEntrada[] = [];
      if (metodo === 'tributo_valor') {
        if (!Array.isArray(debitos)) return res.status(400).json({ error: 'debitos[] é obrigatório para método tributo_valor' });
        debitosResolvidos = debitos.map((d: any) => ({ tributo: NORMALIZAR_TRIBUTO(d.tributo), valor: Number(d.valor) })).filter(d => d.valor > 0);
      } else if (metodo === 'historico') {
        // Pega tributos compensados nos últimos 12 meses e usa média mensal como sugestão
        const hist = await getAll<any>(
          `SELECT
              CASE
                WHEN deb.denominacao_receita ILIKE '%IRPJ%' OR deb.codigo_receita ILIKE '%IRPJ%' THEN 'IRPJ'
                WHEN deb.denominacao_receita ILIKE '%CSLL%' OR deb.codigo_receita ILIKE '%CSLL%' THEN 'CSLL'
                WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN 'COFINS'
                WHEN deb.denominacao_receita ILIKE '%PIS%' OR deb.denominacao_receita ILIKE '%PASEP%' THEN 'PIS/PASEP'
                WHEN deb.denominacao_receita ILIKE '%INSS%' OR deb.denominacao_receita ILIKE '%Previdenc%' THEN 'INSS'
                WHEN deb.denominacao_receita ILIKE '%IRRF%' THEN 'IRRF'
                ELSE COALESCE(deb.denominacao_receita, 'OUTROS')
              END as tributo,
              COUNT(*) as ocorrencias, AVG(deb.total) as media, SUM(deb.total) as total
           FROM ecac_perdcomp_debitos_compensados deb
           JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
           WHERE d.id_empresa = $1
             AND d.data_entrega >= CURRENT_DATE - INTERVAL '12 months'
           GROUP BY tributo
           ORDER BY total DESC LIMIT 10`, [id_empresa]
        );
        debitosResolvidos = hist.map(h => ({ tributo: h.tributo, valor: Math.round(Number(h.media) * 100) / 100 }));
      } else if (metodo === 'periodo_tipo') {
        // Para período+tipo, pega o tributo dominante do tipo de crédito (heurística)
        const map: Record<string, string[]> = {
          'Saldo Negativo de IRPJ': ['IRPJ', 'CSLL'],
          'Saldo Negativo de CSLL': ['CSLL'],
          'Pagamento Indevido': ['IRPJ', 'CSLL', 'PIS/PASEP', 'COFINS'],
          'Crédito Presumido IPI': ['IPI'],
        };
        const tributos = map[tipo_credito as string] || ['IRPJ', 'CSLL'];
        // Sem valor exato — sugere 1.000 por tributo (placeholder, usuário ajusta)
        debitosResolvidos = tributos.map(t => ({ tributo: t, valor: 1000 }));
      } else if (metodo === 'texto_livre') {
        if (!texto || typeof texto !== 'string') return res.status(400).json({ error: 'texto é obrigatório' });
        debitosResolvidos = parseTextoLivre(texto);
        if (debitosResolvidos.length === 0) {
          return res.status(400).json({
            error: 'Não consegui interpretar o texto. Exemplos: "PIS 5.000,00 e COFINS 25.000" ou "20000 cofins"'
          });
        }
      } else {
        return res.status(400).json({ error: 'Método inválido. Use: tributo_valor | historico | periodo_tipo | texto_livre' });
      }

      // Busca créditos disponíveis da empresa
      const creditos = await getAll<any>(
        `SELECT id, tipo_credito, numero_perdcomp_origem, saldo_disponivel, selic_acumulada, data_prescricao
         FROM saldos_credito
         WHERE id_empresa = $1 AND saldo_disponivel > 0
         ORDER BY data_prescricao ASC NULLS LAST`,
        [id_empresa]
      );
      if (creditos.length === 0) {
        return res.json({
          modo: 'automatico', metodo, estrategia,
          creditos_selecionados: [], debitos_compensados: [],
          total_credito_utilizado: 0, total_debito_compensado: 0, economia_estimada: 0,
          alertas: ['Nenhum crédito disponível para esta empresa'],
          debitos_propostos: debitosResolvidos,
        });
      }

      const resultado = alocarCreditos(debitosResolvidos, creditos, estrategia as EstrategiaAlocacao);
      res.json({
        modo: 'automatico',
        metodo, estrategia,
        debitos_propostos: debitosResolvidos,
        ...resultado,
      });
    } catch (error: any) {
      log.error(`Erro ao simular (automático): ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Sugere tributos típicos com base nos últimos 12 meses de DCOMPs da empresa.
   * Para alimentar o seletor do modo automático "histórico".
   */
  sugerirHistorico: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });

      const sugestoes = await getAll<any>(
        `SELECT
            CASE
              WHEN deb.denominacao_receita ILIKE '%IRPJ%' OR deb.codigo_receita ILIKE '%IRPJ%' THEN 'IRPJ'
              WHEN deb.denominacao_receita ILIKE '%CSLL%' OR deb.codigo_receita ILIKE '%CSLL%' THEN 'CSLL'
              WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN 'COFINS'
              WHEN deb.denominacao_receita ILIKE '%PIS%' OR deb.denominacao_receita ILIKE '%PASEP%' THEN 'PIS/PASEP'
              WHEN deb.denominacao_receita ILIKE '%INSS%' OR deb.denominacao_receita ILIKE '%Previdenc%' THEN 'INSS'
              WHEN deb.denominacao_receita ILIKE '%IRRF%' THEN 'IRRF'
              ELSE COALESCE(deb.denominacao_receita, 'OUTROS')
            END as tributo,
            COUNT(*) as ocorrencias,
            ROUND(AVG(deb.total)::numeric, 2) as valor_medio,
            ROUND(SUM(deb.total)::numeric, 2) as valor_total,
            ROUND((SUM(deb.total) / 12.0)::numeric, 2) as media_mensal
         FROM ecac_perdcomp_debitos_compensados deb
         JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
         WHERE d.id_empresa = $1
           AND d.data_entrega >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY tributo
         ORDER BY valor_total DESC
         LIMIT 10`,
        [id_empresa]
      );

      res.json({ sugestoes });
    } catch (error: any) {
      log.error(`Erro ao sugerir histórico: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Parser de texto-livre (regex). Retorna {debitos_extraidos: [{tributo,valor}]}.
   * Para upgrade futuro: integrar com LLM (Anthropic/OpenAI) via env var
   * LLM_PROVIDER + ANTHROPIC_API_KEY/OPENAI_API_KEY.
   */
  parseTexto: async (req: AuthRequest, res: Response) => {
    try {
      const { texto } = req.body;
      if (!texto || typeof texto !== 'string') return res.status(400).json({ error: 'texto é obrigatório' });
      const debitos = parseTextoLivre(texto);
      res.json({
        debitos_extraidos: debitos,
        avisos: debitos.length === 0
          ? ['Não foi possível extrair nenhum tributo/valor do texto. Tente formato: "PIS 5.000,00 e COFINS 25.000"']
          : [],
      });
    } catch (error: any) {
      log.error(`Erro ao parsear texto: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

