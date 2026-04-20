import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery, beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
import { log } from '../utils/logger';
import { selicService } from '../services/selicService';
import { perdcompRegraService } from '../services/perdcompRegraService';
import {
  empresaCreateSchema, empresaUpdateSchema,
  creditoCreateSchema, creditoUpdateSchema,
  debitoCreateSchema, debitoUpdateSchema,
  pedidoCreateSchema, pedidoStatusSchema,
  simuladorSchema,
} from '../validators/perdcompSchemas';

function getCurrentTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

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

// ============ BUSCA CNPJ (APIs externas) ============

async function tentarCNPJA(cnpj: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://open.cnpja.com/office/${cnpj}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json() as any;

    let regime = 'Lucro Real';
    if (data.company?.simples?.optant) regime = 'Simples Nacional';

    return {
      cnpj,
      razao_social: data.company?.name || '',
      nome_fantasia: data.alias || '',
      uf: data.address?.state || '',
      municipio: data.address?.city || '',
      inscricao_estadual: '',
      regime_tributario: regime,
      endereco: data.address
        ? `${data.address.street || ''}, ${data.address.number || 'S/N'} - ${data.address.district || ''}, ${data.address.city || ''}/${data.address.state || ''} - CEP: ${data.address.zip || ''}`
        : '',
      atividade_principal: data.mainActivity?.text || '',
      situacao: data.status?.text || '',
      natureza_juridica: data.company?.nature?.text || '',
      capital_social: data.company?.equity || null,
      email: data.emails?.[0]?.address || '',
      telefone: data.phones?.[0] ? `(${data.phones[0].area}) ${data.phones[0].number}` : '',
    };
  } catch (err: any) {
    log.warn(`CNPJA falhou para ${cnpj}: ${err.message}`);
    return null;
  }
}

async function tentarOpenCNPJ(cnpj: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://api.opencnpj.org/${cnpj}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json() as any;

    let regime = 'Lucro Real';
    if (data.opcao_simples === 'Sim' || data.opcao_mei === 'Sim') regime = 'Simples Nacional';

    return {
      cnpj,
      razao_social: data.razao_social || '',
      nome_fantasia: data.nome_fantasia || '',
      uf: data.uf || '',
      municipio: data.municipio || '',
      inscricao_estadual: '',
      regime_tributario: regime,
      endereco: [data.logradouro, data.numero, data.complemento, data.bairro, data.municipio, data.uf, data.cep ? `CEP: ${data.cep}` : '']
        .filter(Boolean).join(', '),
      atividade_principal: data.cnae_principal || '',
      situacao: data.situacao_cadastral || '',
      natureza_juridica: '',
      capital_social: data.capital_social ? parseFloat(data.capital_social.replace(',', '.')) : null,
      email: data.email || '',
      telefone: data.telefones?.[0] ? `(${data.telefones[0].ddd}) ${data.telefones[0].numero}` : '',
    };
  } catch (err: any) {
    log.warn(`OpenCNPJ falhou para ${cnpj}: ${err.message}`);
    return null;
  }
}

// ============ EMPRESAS ============

export const perdcompEmpresasController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { busca, regime, uf, ativo, page = 1, limit = 20 } = req.query;
      let where = ['1=1'];
      const params: any[] = [];

      if (busca) {
        const b = `%${busca}%`;
        params.push(b); where.push(`e.razao_social LIKE $${params.length}`);
        params.push(b); where.push(`e.cnpj LIKE $${params.length}`);
        params.push(b); where.push(`e.nome_fantasia LIKE $${params.length}`);
        // agrupando as 3 condições como OR (substituir as 3 últimas por 1 OR)
        const last3 = where.splice(-3);
        where.push(`(${last3.join(' OR ')})`);
      }
      if (regime) { params.push(regime); where.push(`e.regime_tributario = $${params.length}`); }
      if (uf) { params.push(uf); where.push(`e.uf = $${params.length}`); }
      if (ativo !== undefined) { params.push(ativo === 'true' ? 1 : 0); where.push(`e.ativo = $${params.length}`); }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_empresas e WHERE ${where.join(' AND ')}`, params
      );

      const listParams = [...params];
      listParams.push(Number(limit)); const limitIdx = listParams.length;
      listParams.push(offset); const offsetIdx = listParams.length;

      const empresas = await getAll<any>(
        `SELECT e.*,
          (SELECT COUNT(*) FROM perdcomp_creditos c WHERE c.id_empresa = e.id AND c.status IN ('Disponível','Parcialmente Utilizado')) as total_creditos,
          (SELECT COALESCE(SUM(c.saldo_disponivel), 0) FROM perdcomp_creditos c WHERE c.id_empresa = e.id AND c.status IN ('Disponível','Parcialmente Utilizado')) as saldo_creditos,
          (SELECT COUNT(*) FROM perdcomp_debitos d WHERE d.id_empresa = e.id AND d.status IN ('Pendente','Parcialmente Compensado')) as total_debitos,
          (SELECT COUNT(*) FROM perdcomp_pedidos p WHERE p.id_empresa = e.id) as total_pedidos
        FROM perdcomp_empresas e WHERE ${where.join(' AND ')}
        ORDER BY e.razao_social LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        listParams
      );

      res.json({
        data: empresas,
        pagination: { page: Number(page), limit: Number(limit), total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / Number(limit)) }
      });
    } catch (error: any) {
      log.error(`Erro ao listar empresas: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const empresa = await getOne<any>(
        `SELECT e.*,
          (SELECT COALESCE(SUM(c.saldo_disponivel), 0) FROM perdcomp_creditos c WHERE c.id_empresa = e.id AND c.status IN ('Disponível','Parcialmente Utilizado')) as saldo_creditos,
          (SELECT COUNT(*) FROM perdcomp_creditos c WHERE c.id_empresa = e.id) as total_creditos,
          (SELECT COUNT(*) FROM perdcomp_debitos d WHERE d.id_empresa = e.id) as total_debitos,
          (SELECT COUNT(*) FROM perdcomp_pedidos p WHERE p.id_empresa = e.id) as total_pedidos
        FROM perdcomp_empresas e WHERE e.id = $1`,
        [req.params.id]
      );
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });
      res.json(empresa);
    } catch (error: any) {
      log.error(`Erro ao buscar empresa: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = empresaCreateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const { cnpj, razao_social, nome_fantasia, inscricao_estadual, regime_tributario, uf, municipio } = resultado.data;
      const existe = await getOne<any>('SELECT id FROM perdcomp_empresas WHERE cnpj = $1', [cnpj]);
      if (existe) return res.status(409).json({ error: 'CNPJ já cadastrado' });

      const { id: lastID } = await runQuery(
        `INSERT INTO perdcomp_empresas (id_usuario_responsavel, cnpj, razao_social, nome_fantasia, inscricao_estadual, regime_tributario, uf, municipio) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [req.user!.id, cnpj, razao_social, nome_fantasia || null, inscricao_estadual || null, regime_tributario, uf || null, municipio || null]
      );

      const empresa = await getOne<any>('SELECT * FROM perdcomp_empresas WHERE id = $1', [lastID]);
      res.status(201).json(empresa);
    } catch (error: any) {
      log.error(`Erro ao criar empresa: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = empresaUpdateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const empresa = await getOne<any>('SELECT * FROM perdcomp_empresas WHERE id = $1', [req.params.id]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const campos = resultado.data;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(campos)) {
        if (value !== undefined) { vals.push(value); sets.push(`${key} = $${vals.length}`); }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

      sets.push("atualizado_em = NOW()");
      vals.push(req.params.id);
      await runQuery(`UPDATE perdcomp_empresas SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      const atualizada = await getOne<any>('SELECT * FROM perdcomp_empresas WHERE id = $1', [req.params.id]);
      res.json(atualizada);
    } catch (error: any) {
      log.error(`Erro ao atualizar empresa: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const empresa = await getOne<any>('SELECT id FROM perdcomp_empresas WHERE id = $1', [req.params.id]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const temPedidos = await getOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM perdcomp_pedidos WHERE id_empresa = $1', [req.params.id]);
      if (temPedidos && temPedidos.cnt > 0) {
        return res.status(409).json({ error: 'Empresa possui pedidos vinculados. Inative ao invés de excluir.' });
      }

      await runQuery('DELETE FROM perdcomp_creditos WHERE id_empresa = $1', [req.params.id]);
      await runQuery('DELETE FROM perdcomp_debitos WHERE id_empresa = $1', [req.params.id]);
      await runQuery('DELETE FROM perdcomp_empresas WHERE id = $1', [req.params.id]);
      res.json({ message: 'Empresa excluída com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir empresa: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarCNPJ: async (req: AuthRequest, res: Response) => {
    try {
      const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
      if (cnpj.length !== 14) return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });

      // API 1: CNPJA Open (resposta mais rica)
      let resultado = await tentarCNPJA(cnpj);

      // API 2: OpenCNPJ (fallback, estrutura diferente)
      if (!resultado) {
        resultado = await tentarOpenCNPJ(cnpj);
      }

      if (!resultado) {
        return res.status(404).json({ error: 'CNPJ não encontrado em nenhuma base de dados' });
      }

      res.json(resultado);
    } catch (error: any) {
      log.error(`Erro ao buscar CNPJ: ${error.message}`);
      res.status(500).json({ error: 'Erro ao consultar dados do CNPJ' });
    }
  },
};

// ============ CRÉDITOS ============

export const perdcompCreditosController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo_credito, status, periodo, busca, page = 1, limit = 20 } = req.query;
      let where = ['1=1'];
      const params: any[] = [];

      if (id_empresa) { params.push(id_empresa); where.push(`c.id_empresa = $${params.length}`); }
      if (tipo_credito) { params.push(tipo_credito); where.push(`c.tipo_credito = $${params.length}`); }
      if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
      if (periodo) { params.push(periodo); where.push(`c.periodo_apuracao = $${params.length}`); }
      if (busca) {
        const b = `%${busca}%`;
        params.push(b); where.push(`e.razao_social LIKE $${params.length}`);
        params.push(b); where.push(`e.cnpj LIKE $${params.length}`);
        params.push(b); where.push(`c.codigo_receita LIKE $${params.length}`);
        const last3 = where.splice(-3);
        where.push(`(${last3.join(' OR ')})`);
      }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_creditos c JOIN perdcomp_empresas e ON e.id = c.id_empresa WHERE ${where.join(' AND ')}`, params
      );

      const listParams = [...params];
      listParams.push(Number(limit)); const limitIdx = listParams.length;
      listParams.push(offset); const offsetIdx = listParams.length;

      const creditos = await getAll<any>(
        `SELECT c.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj,
          CAST(EXTRACT(EPOCH FROM (c.dt_vencimento_prescricao::date - CURRENT_DATE)) / 86400 AS INTEGER) as dias_para_prescricao
        FROM perdcomp_creditos c
        JOIN perdcomp_empresas e ON e.id = c.id_empresa
        WHERE ${where.join(' AND ')}
        ORDER BY c.dt_vencimento_prescricao ASC
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
      const credito = await getOne<any>(
        `SELECT c.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj FROM perdcomp_creditos c JOIN perdcomp_empresas e ON e.id = c.id_empresa WHERE c.id = $1`,
        [req.params.id]
      );
      if (!credito) return res.status(404).json({ error: 'Crédito não encontrado' });
      res.json(credito);
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
      const credito = await getOne<any>('SELECT id FROM perdcomp_creditos WHERE id = $1', [req.params.id]);
      if (!credito) return res.status(404).json({ error: 'Crédito não encontrado' });

      const emUso = await getOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM perdcomp_pedido_itens WHERE id_credito = $1', [req.params.id]);
      if (emUso && emUso.cnt > 0) return res.status(409).json({ error: 'Crédito vinculado a pedidos. Não pode ser excluído.' });

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
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo_tributo, status, periodo, page = 1, limit = 20 } = req.query;
      let where = ['1=1'];
      const params: any[] = [];

      if (id_empresa) { params.push(id_empresa); where.push(`d.id_empresa = $${params.length}`); }
      if (tipo_tributo) { params.push(tipo_tributo); where.push(`d.tipo_tributo = $${params.length}`); }
      if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
      if (periodo) { params.push(periodo); where.push(`d.periodo_apuracao = $${params.length}`); }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_debitos d WHERE ${where.join(' AND ')}`, params
      );

      const listParams = [...params];
      listParams.push(Number(limit)); const limitIdx2 = listParams.length;
      listParams.push(offset); const offsetIdx2 = listParams.length;

      const debitos = await getAll<any>(
        `SELECT d.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj
        FROM perdcomp_debitos d JOIN perdcomp_empresas e ON e.id = d.id_empresa
        WHERE ${where.join(' AND ')} ORDER BY d.dt_vencimento ASC LIMIT $${limitIdx2} OFFSET $${offsetIdx2}`,
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

      const emUso = await getOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM perdcomp_pedido_itens WHERE id_debito = $1', [req.params.id]);
      if (emUso && emUso.cnt > 0) return res.status(409).json({ error: 'Débito vinculado a pedidos.' });

      await runQuery('DELETE FROM perdcomp_debitos WHERE id = ?', [req.params.id]);
      res.json({ message: 'Débito excluído com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ============ PEDIDOS ============

export const perdcompPedidosController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo_pedido, status, page = 1, limit = 20 } = req.query;
      let where = ['1=1'];
      const params: any[] = [];

      if (id_empresa) { params.push(id_empresa); where.push(`p.id_empresa = $${params.length}`); }
      if (tipo_pedido) { params.push(tipo_pedido); where.push(`p.tipo_pedido = $${params.length}`); }
      if (status) { params.push(status); where.push(`p.status = $${params.length}`); }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_pedidos p WHERE ${where.join(' AND ')}`, params
      );

      const listParams3 = [...params];
      listParams3.push(Number(limit)); const limitIdx3 = listParams3.length;
      listParams3.push(offset); const offsetIdx3 = listParams3.length;

      const pedidos = await getAll<any>(
        `SELECT p.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj, u.nome as usuario_nome
        FROM perdcomp_pedidos p
        JOIN perdcomp_empresas e ON e.id = p.id_empresa
        JOIN usuarios u ON u.id = p.id_usuario_criador
        WHERE ${where.join(' AND ')}
        ORDER BY p.criado_em DESC LIMIT $${limitIdx3} OFFSET $${offsetIdx3}`,
        listParams3
      );

      res.json({
        data: pedidos,
        pagination: { page: Number(page), limit: Number(limit), total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / Number(limit)) }
      });
    } catch (error: any) {
      log.error(`Erro ao listar pedidos: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const pedido = await getOne<any>(
        `SELECT p.*, e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj, u.nome as usuario_nome
        FROM perdcomp_pedidos p
        JOIN perdcomp_empresas e ON e.id = p.id_empresa
        JOIN usuarios u ON u.id = p.id_usuario_criador
        WHERE p.id = $1`,
        [req.params.id]
      );
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

      pedido.itens = await getAll<any>(
        `SELECT pi.*, c.tipo_credito as credito_tipo, c.periodo_apuracao as credito_periodo, d.tipo_tributo as debito_tipo, d.periodo_apuracao as debito_periodo
        FROM perdcomp_pedido_itens pi
        LEFT JOIN perdcomp_creditos c ON c.id = pi.id_credito
        LEFT JOIN perdcomp_debitos d ON d.id = pi.id_debito
        WHERE pi.id_pedido = $1`,
        [req.params.id]
      );

      pedido.historico = await getAll<any>(
        `SELECT h.*, u.nome as usuario_nome FROM perdcomp_historico h JOIN usuarios u ON u.id = h.id_usuario WHERE h.id_pedido = $1 ORDER BY h.criado_em DESC`,
        [req.params.id]
      );

      pedido.documentos = await getAll<any>(
        `SELECT id, id_pedido, tipo_documento, nome_arquivo, tipo_arquivo, tamanho_bytes, observacoes, criado_em FROM perdcomp_documentos WHERE id_pedido = $1`,
        [req.params.id]
      );

      res.json(pedido);
    } catch (error: any) {
      log.error(`Erro ao buscar pedido: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = pedidoCreateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const data = resultado.data;

      const creditosTipo = data.itens.filter(i => i.tipo_item === 'credito').map(i => '');
      const debitosTipo = data.itens.filter(i => i.tipo_item === 'debito').map(i => '');

      let totalCredito = 0;
      let totalDebito = 0;

      for (const item of data.itens) {
        if (item.tipo_item === 'credito' && item.id_credito) {
          const credito = await getOne<any>('SELECT * FROM perdcomp_creditos WHERE id = $1', [item.id_credito]);
          if (!credito) return res.status(400).json({ error: `Crédito ${item.id_credito} não encontrado` });
          if (item.valor_utilizado > credito.saldo_disponivel) {
            return res.status(400).json({ error: `Valor excede o saldo disponível do crédito ${item.id_credito} (saldo: R$ ${credito.saldo_disponivel.toFixed(2)})` });
          }
          totalCredito += item.valor_utilizado;
        }
        if (item.tipo_item === 'debito' && item.id_debito) {
          const debito = await getOne<any>('SELECT * FROM perdcomp_debitos WHERE id = $1', [item.id_debito]);
          if (!debito) return res.status(400).json({ error: `Débito ${item.id_debito} não encontrado` });
          if (item.valor_utilizado > debito.saldo_devedor) {
            return res.status(400).json({ error: `Valor excede o saldo devedor do débito ${item.id_debito}` });
          }
          totalDebito += item.valor_utilizado;
        }
      }

      const { id: lastID } = await runQuery(
        `INSERT INTO perdcomp_pedidos (id_empresa, id_usuario_criador, tipo_pedido, valor_total_credito, valor_total_debito, observacoes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [data.id_empresa, req.user!.id, data.tipo_pedido, totalCredito, totalDebito, data.observacoes || null]
      );

      for (const item of data.itens) {
        await runQuery(
          'INSERT INTO perdcomp_pedido_itens (id_pedido, id_credito, id_debito, tipo_item, valor_utilizado) VALUES ($1, $2, $3, $4, $5)',
          [lastID, item.id_credito || null, item.id_debito || null, item.tipo_item, item.valor_utilizado]
        );
      }

      await registrarHistorico({ id_pedido: lastID, id_usuario: req.user!.id, acao: 'Criação', detalhes: `Pedido ${data.tipo_pedido} - Crédito: R$ ${totalCredito} / Débito: R$ ${totalDebito}` });

      const pedido = await getOne<any>('SELECT * FROM perdcomp_pedidos WHERE id = $1', [lastID]);
      res.status(201).json(pedido);
    } catch (error: any) {
      log.error(`Erro ao criar pedido: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizarStatus: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = pedidoStatusSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const pedido = await getOne<any>('SELECT * FROM perdcomp_pedidos WHERE id = $1', [req.params.id]);
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

      const { status, motivo_indeferimento, dt_ciencia } = resultado.data;
      const sets: string[] = [];
      const vals: any[] = [];
      vals.push(status); sets.push(`status = $${vals.length}`);
      sets.push("atualizado_em = NOW()");

      if (motivo_indeferimento) { vals.push(motivo_indeferimento); sets.push(`motivo_indeferimento = $${vals.length}`); }
      if (dt_ciencia) {
        vals.push(dt_ciencia); sets.push(`dt_ciencia = $${vals.length}`);
        const prazo = new Date(dt_ciencia);
        prazo.setDate(prazo.getDate() + 30);
        vals.push(prazo.toISOString().substring(0, 10)); sets.push(`dt_prazo_manifestacao = $${vals.length}`);
      }
      if (status === 'Deferido' || status === 'Indeferido' || status === 'Homologado' || status === 'Não Homologado') {
        sets.push("dt_decisao = NOW()");
      }

      vals.push(req.params.id);
      await runQuery(`UPDATE perdcomp_pedidos SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      await registrarHistorico({
        id_pedido: Number(req.params.id), id_usuario: req.user!.id, acao: 'Mudança Status',
        campo_alterado: 'status', valor_anterior: pedido.status, valor_novo: status
      });

      if (status === 'Transmitido') {
        const txClient = await beginTransaction();
        try {
          await runQuery(`UPDATE perdcomp_pedidos SET dt_transmissao = NOW() WHERE id = $1`, [req.params.id], txClient);
          const itens = await getAll<any>('SELECT * FROM perdcomp_pedido_itens WHERE id_pedido = $1', [req.params.id]);
          for (const item of itens) {
            if (item.tipo_item === 'credito' && item.id_credito) {
              await runQuery(
                `UPDATE perdcomp_creditos SET saldo_disponivel = saldo_disponivel - $1, status = CASE WHEN saldo_disponivel - $2 <= 0 THEN 'Esgotado' ELSE 'Parcialmente Utilizado' END, atualizado_em = NOW() WHERE id = $3`,
                [item.valor_utilizado, item.valor_utilizado, item.id_credito],
                txClient
              );
            }
            if (item.tipo_item === 'debito' && item.id_debito) {
              await runQuery(
                `UPDATE perdcomp_debitos SET saldo_devedor = saldo_devedor - $1, status = CASE WHEN saldo_devedor - $2 <= 0 THEN 'Compensado' ELSE 'Parcialmente Compensado' END, atualizado_em = NOW() WHERE id = $3`,
                [item.valor_utilizado, item.valor_utilizado, item.id_debito],
                txClient
              );
            }
          }
          await commitTransaction(txClient);
        } catch (txErr) {
          await rollbackTransaction(txClient);
          throw txErr;
        }
      }

      const atualizado = await getOne<any>('SELECT * FROM perdcomp_pedidos WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar status: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const pedido = await getOne<any>('SELECT * FROM perdcomp_pedidos WHERE id = $1', [req.params.id]);
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (pedido.status !== 'Rascunho') return res.status(400).json({ error: 'Apenas pedidos em rascunho podem ser excluídos' });

      await runQuery('DELETE FROM perdcomp_pedido_itens WHERE id_pedido = $1', [req.params.id]);
      await runQuery('DELETE FROM perdcomp_documentos WHERE id_pedido = $1', [req.params.id]);
      await runQuery('DELETE FROM perdcomp_pedidos WHERE id = $1', [req.params.id]);
      res.json({ message: 'Pedido excluído com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir pedido: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ============ DASHBOARD ============

export const perdcompDashboardController = {
  obter: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      let empWhere = '';
      const empParams: any[] = [];
      if (id_empresa) { empParams.push(id_empresa); empWhere = `AND id_empresa = $${empParams.length}`; }

      const creds = await getOne<any>(
        `SELECT COUNT(*) as total, COALESCE(SUM(saldo_disponivel), 0) as valor FROM perdcomp_creditos WHERE status IN ('Disponível','Parcialmente Utilizado') ${empWhere}`, empParams
      );
      const debs = await getOne<any>(
        `SELECT COUNT(*) as total, COALESCE(SUM(saldo_devedor), 0) as valor FROM perdcomp_debitos WHERE status IN ('Pendente','Parcialmente Compensado') ${empWhere}`, empParams
      );
      const pedAnalise = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_pedidos WHERE status = 'Em Análise' ${empWhere}`, empParams
      );
      const pedDeferidos = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_pedidos WHERE status IN ('Deferido','Deferido Parcialmente','Homologado') ${empWhere}`, empParams
      );
      const pedIndeferidos = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_pedidos WHERE status IN ('Indeferido','Não Homologado') ${empWhere}`, empParams
      );
      const totalDecididos = (pedDeferidos?.total || 0) + (pedIndeferidos?.total || 0);
      const taxaDeferimento = totalDecididos > 0 ? ((pedDeferidos?.total || 0) / totalDecididos * 100) : 0;

      const prescricao = await getOne<any>(
        `SELECT COUNT(*) as total, COALESCE(SUM(saldo_disponivel), 0) as valor FROM perdcomp_creditos WHERE status IN ('Disponível','Parcialmente Utilizado') AND dt_vencimento_prescricao <= CURRENT_DATE + INTERVAL '6 months' ${empWhere}`, empParams
      );

      const alertasNaoLidos = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_alertas WHERE lido = 0 AND id_usuario = $1`, [req.user!.id]
      );

      const creditosPorTipo = await getAll<any>(
        `SELECT tipo_credito as tipo, COUNT(*) as total, COALESCE(SUM(saldo_disponivel), 0) as valor FROM perdcomp_creditos WHERE status IN ('Disponível','Parcialmente Utilizado') ${empWhere} GROUP BY tipo_credito`, empParams
      );

      const pedidosPorStatus = await getAll<any>(
        `SELECT status, COUNT(*) as total FROM perdcomp_pedidos WHERE 1=1 ${empWhere} GROUP BY status`, empParams
      );

      const ultMovimentos = await getAll<any>(
        `SELECT h.*, u.nome as usuario_nome FROM perdcomp_historico h JOIN usuarios u ON u.id = h.id_usuario ORDER BY h.criado_em DESC LIMIT 10`
      );

      res.json({
        total_creditos_disponiveis: creds?.total || 0,
        valor_creditos_disponiveis: creds?.valor || 0,
        total_debitos_pendentes: debs?.total || 0,
        valor_debitos_pendentes: debs?.valor || 0,
        pedidos_em_analise: pedAnalise?.total || 0,
        pedidos_deferidos: pedDeferidos?.total || 0,
        pedidos_indeferidos: pedIndeferidos?.total || 0,
        taxa_deferimento: Math.round(taxaDeferimento * 100) / 100,
        creditos_proximos_prescricao: prescricao?.total || 0,
        valor_creditos_prescricao: prescricao?.valor || 0,
        alertas_nao_lidos: alertasNaoLidos?.total || 0,
        creditos_por_tipo: creditosPorTipo,
        pedidos_por_status: pedidosPorStatus,
        ultimos_movimentos: ultMovimentos,
      });
    } catch (error: any) {
      log.error(`Erro ao obter dashboard: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ============ SIMULADOR ============

export const perdcompSimuladorController = {
  simular: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = simuladorSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const { creditos: credsInput, debitos: debsInput } = resultado.data;

      const creditosSelecionados: any[] = [];
      let totalCreditoUtilizado = 0;

      for (const ci of credsInput) {
        const credito = await getOne<any>('SELECT * FROM perdcomp_creditos WHERE id = $1', [ci.id]);
        if (!credito) continue;
        const valorUsar = Math.min(ci.valor_utilizar, credito.saldo_disponivel);
        creditosSelecionados.push({
          id: credito.id, tipo: credito.tipo_credito, valor_utilizado: valorUsar,
          saldo_restante: credito.saldo_disponivel - valorUsar,
        });
        totalCreditoUtilizado += valorUsar;
      }

      const debitosCompensados: any[] = [];
      let totalDebitoCompensado = 0;

      if (debsInput) {
        for (const di of debsInput) {
          const debito = await getOne<any>('SELECT * FROM perdcomp_debitos WHERE id = $1', [di.id]);
          if (!debito) continue;
          const valorCompensar = Math.min(di.valor_compensar, debito.saldo_devedor);
          debitosCompensados.push({
            id: debito.id, tipo: debito.tipo_tributo, valor_compensado: valorCompensar,
            saldo_restante: debito.saldo_devedor - valorCompensar,
          });
          totalDebitoCompensado += valorCompensar;
        }
      }

      const alertas: string[] = [];
      if (totalCreditoUtilizado < totalDebitoCompensado) {
        alertas.push(`Créditos insuficientes: faltam R$ ${(totalDebitoCompensado - totalCreditoUtilizado).toFixed(2)}`);
      }

      for (const cs of creditosSelecionados) {
        const credito = await getOne<any>('SELECT dt_vencimento_prescricao FROM perdcomp_creditos WHERE id = $1', [cs.id]);
        if (credito) {
          const dias = Math.ceil((new Date(credito.dt_vencimento_prescricao).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (dias < 90) alertas.push(`Crédito #${cs.id} (${cs.tipo}) prescreve em ${dias} dias`);
        }
      }

      res.json({
        creditos_selecionados: creditosSelecionados,
        debitos_compensados: debitosCompensados,
        total_credito_utilizado: totalCreditoUtilizado,
        total_debito_compensado: totalDebitoCompensado,
        economia_estimada: totalDebitoCompensado,
        alertas,
      });
    } catch (error: any) {
      log.error(`Erro ao simular: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ============ ALERTAS ============

export const perdcompAlertasController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { lido, tipo, id_empresa, page = 1, limit = 20 } = req.query;
      const where = ['a.id_usuario = $1'];
      const params: any[] = [req.user!.id];

      if (lido !== undefined) { params.push(lido === 'true' ? 1 : 0); where.push(`a.lido = $${params.length}`); }
      if (tipo) { params.push(tipo); where.push(`a.tipo_alerta = $${params.length}`); }
      if (id_empresa) { params.push(id_empresa); where.push(`a.id_empresa = $${params.length}`); }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM perdcomp_alertas a WHERE ${where.join(' AND ')}`, params
      );

      const listParamsA = [...params];
      listParamsA.push(Number(limit)); const limitIdxA = listParamsA.length;
      listParamsA.push(offset); const offsetIdxA = listParamsA.length;

      const alertas = await getAll<any>(
        `SELECT a.*, e.razao_social as empresa_razao_social FROM perdcomp_alertas a LEFT JOIN perdcomp_empresas e ON e.id = a.id_empresa WHERE ${where.join(' AND ')} ORDER BY a.criado_em DESC LIMIT $${limitIdxA} OFFSET $${offsetIdxA}`,
        listParamsA
      );

      res.json({
        data: alertas,
        pagination: { page: Number(page), limit: Number(limit), total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / Number(limit)) }
      });
    } catch (error: any) {
      log.error(`Erro ao listar alertas: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  marcarLido: async (req: AuthRequest, res: Response) => {
    try {
      const result = await runQuery('UPDATE perdcomp_alertas SET lido = 1 WHERE id = $1 AND id_usuario = $2', [req.params.id, req.user!.id]);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Alerta não encontrado' });
      }
      res.json({ message: 'Alerta marcado como lido' });
    } catch (error: any) {
      log.error(`Erro ao marcar alerta: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  gerarAlertas: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.body;
      if (!id_empresa) return res.status(400).json({ error: 'Empresa é obrigatória' });
      const gerados = await perdcompRegraService.gerarAlertas(id_empresa, req.user!.id);
      res.json({ message: `${gerados} alertas gerados` });
    } catch (error: any) {
      log.error(`Erro ao gerar alertas: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};
