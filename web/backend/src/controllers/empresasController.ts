import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { empresaCreateSchema, empresaUpdateSchema } from '../validators/schemas';

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

export const empresasController = {
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
        `SELECT COUNT(*) as total FROM adm_empresas e WHERE ${where.join(' AND ')}`, params
      );

      const listParams = [...params];
      listParams.push(Number(limit)); const limitIdx = listParams.length;
      listParams.push(offset); const offsetIdx = listParams.length;

      const empresas = await getAll<any>(
        `SELECT e.*
        FROM adm_empresas e WHERE ${where.join(' AND ')}
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
        `SELECT e.*
        FROM adm_empresas e WHERE e.id = $1`,
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
      const existe = await getOne<any>('SELECT id FROM adm_empresas WHERE cnpj = $1', [cnpj]);
      if (existe) return res.status(409).json({ error: 'CNPJ já cadastrado' });

      const { id: lastID } = await runQuery(
        `INSERT INTO adm_empresas
           (usuario_responsavel_id, cnpj, razao_social, nome_fantasia, inscricao_estadual,
            regime_tributario, uf, municipio)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [req.user!.id, cnpj, razao_social, nome_fantasia || null, inscricao_estadual || null,
         regime_tributario, uf || null, municipio || null]
      );

      const empresa = await getOne<any>('SELECT * FROM adm_empresas WHERE id = $1', [lastID]);
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

      const empresa = await getOne<any>('SELECT * FROM adm_empresas WHERE id = $1', [req.params.id]);
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
      await runQuery(`UPDATE adm_empresas SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      const atualizada = await getOne<any>('SELECT * FROM adm_empresas WHERE id = $1', [req.params.id]);
      res.json(atualizada);
    } catch (error: any) {
      log.error(`Erro ao atualizar empresa: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const empresa = await getOne<any>('SELECT id FROM adm_empresas WHERE id = $1', [req.params.id]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      await runQuery('DELETE FROM adm_empresas WHERE id = $1', [req.params.id]);
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
