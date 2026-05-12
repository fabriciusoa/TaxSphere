import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';

// ════════════════════════════════════════════════════════════════════════════
// STATUS VÁLIDOS
// ════════════════════════════════════════════════════════════════════════════

const STATUS_EDITAVEIS = ['RASCUNHO', 'VALIDADO', 'ERRO_ENVIO'];
const STATUS_EXCLUIVEIS = ['RASCUNHO'];

async function registrarHistoricoStatus(params: {
  id_perdcomp: number;
  status_anterior: string;
  status_novo: string;
  observacao?: string;
  origem?: string;
  id_usuario?: number;
}) {
  await runQuery(
    `INSERT INTO historico_status_perdcomp
       (id_perdcomp, status_anterior, status_novo, observacao, origem_atualizacao, id_usuario)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.id_perdcomp,
      params.status_anterior,
      params.status_novo,
      params.observacao || null,
      params.origem || 'SISTEMA',
      params.id_usuario || null,
    ]
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PERDCOMPS (documentos)
// ════════════════════════════════════════════════════════════════════════════

export const perdcompDocumentosController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo_documento, tipo_credito, status, numero, page = 1, limit = 20 } = req.query;
      const where = ['1=1'];
      const params: any[] = [];

      if (id_empresa) { params.push(id_empresa); where.push(`p.id_empresa = $${params.length}`); }
      if (tipo_documento) { params.push(tipo_documento); where.push(`p.tipo_documento = $${params.length}`); }
      if (tipo_credito) { params.push(tipo_credito); where.push(`p.tipo_credito = $${params.length}`); }
      if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
      if (numero) { params.push(`%${numero}%`); where.push(`p.numero ILIKE $${params.length}`); }

      const offset = (Number(page) - 1) * Number(limit);
      const countResult = await getOne<{ total: string }>(
        `SELECT COUNT(*) as total FROM perdcomps p WHERE ${where.join(' AND ')}`, params
      );

      const listParams = [...params];
      listParams.push(Number(limit));
      const limitIdx = listParams.length;
      listParams.push(offset);
      const offsetIdx = listParams.length;

      const docs = await getAll<any>(
        `SELECT p.*,
          e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj,
          u.nome as usuario_nome,
          c.cn as cert_cn, c.validade_ate as cert_validade,
          ct.valor_principal as credito_valor_principal,
          ct.credito_atualizado as credito_atualizado,
          (SELECT COUNT(*) FROM debitos_perdcomp d WHERE d.id_perdcomp = p.id) as total_debitos
        FROM perdcomps p
        JOIN perdcomp_empresas e ON e.id = p.id_empresa
        LEFT JOIN adm_usuarios u ON u.id = p.id_usuario_criador
        LEFT JOIN certificados_digitais c ON c.id = p.id_certificado
        LEFT JOIN creditos_tributarios ct ON ct.id_perdcomp = p.id
        WHERE ${where.join(' AND ')}
        ORDER BY p.criado_em DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        listParams
      );

      res.json({
        data: docs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(countResult?.total || 0),
          totalPages: Math.ceil(Number(countResult?.total || 0) / Number(limit)),
        },
      });
    } catch (error: any) {
      log.error(`Erro ao listar documentos PER/DCOMP: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const doc = await getOne<any>(
        `SELECT p.*,
          e.razao_social as empresa_razao_social, e.cnpj as empresa_cnpj,
          u.nome as usuario_nome,
          c.cn as cert_cn, c.validade_ate as cert_validade, c.ativo as cert_ativo
        FROM perdcomps p
        JOIN perdcomp_empresas e ON e.id = p.id_empresa
        LEFT JOIN adm_usuarios u ON u.id = p.id_usuario_criador
        LEFT JOIN certificados_digitais c ON c.id = p.id_certificado
        WHERE p.id = $1`,
        [req.params.id]
      );

      if (!doc) return res.status(404).json({ error: 'Documento PER/DCOMP não encontrado' });

      doc.credito = await getOne<any>('SELECT * FROM creditos_tributarios WHERE id_perdcomp = $1', [doc.id]);
      doc.debitos = await getAll<any>('SELECT * FROM debitos_perdcomp WHERE id_perdcomp = $1 ORDER BY ordem ASC', [doc.id]);
      doc.responsavel = await getOne<any>('SELECT * FROM responsaveis_preenchimento WHERE id_perdcomp = $1', [doc.id]);
      doc.historico = await getAll<any>(
        `SELECT h.*, u.nome as usuario_nome FROM historico_status_perdcomp h
         LEFT JOIN adm_usuarios u ON u.id = h.id_usuario
         WHERE h.id_perdcomp = $1 ORDER BY h.criado_em DESC LIMIT 20`,
        [doc.id]
      );
      doc.recibos = await getAll<any>('SELECT * FROM recibos WHERE id_perdcomp = $1 ORDER BY criado_em DESC', [doc.id]);

      res.json(doc);
    } catch (error: any) {
      log.error(`Erro ao buscar documento PER/DCOMP: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const {
        id_empresa, id_certificado, tipo_documento, tipo_credito, titularidade,
        observacoes, credito, debitos, responsavel,
      } = req.body;

      if (!id_empresa || !tipo_documento || !tipo_credito) {
        return res.status(400).json({ error: 'id_empresa, tipo_documento e tipo_credito são obrigatórios' });
      }

      const empresa = await getOne<any>('SELECT id FROM perdcomp_empresas WHERE id = $1', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const { id: perdcompId } = await runQuery(
        `INSERT INTO perdcomps
           (id_empresa, id_certificado, id_usuario_criador, tipo_documento, tipo_credito, titularidade, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          id_empresa,
          id_certificado || null,
          req.user!.id,
          tipo_documento,
          tipo_credito,
          titularidade || 'PROPRIO_CONTRIBUINTE',
          observacoes || null,
        ]
      );

      if (credito) {
        await runQuery(
          `INSERT INTO creditos_tributarios
             (id_perdcomp, cnpj_detentor, codigo_receita, denominacao_receita, periodo_apuracao,
              data_arrecadacao, data_vencimento, valor_original_inicial, valor_principal,
              valor_utilizado, selic_acumulada, credito_atualizado, total_debitos_documento,
              total_credito_utilizado, saldo_credito_original)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            perdcompId,
            credito.cnpj_detentor || '',
            credito.codigo_receita || '',
            credito.denominacao_receita || null,
            credito.periodo_apuracao || '',
            credito.data_arrecadacao || null,
            credito.data_vencimento || null,
            credito.valor_original_inicial || credito.valor_principal || 0,
            credito.valor_principal || 0,
            credito.valor_utilizado || 0,
            credito.selic_acumulada || 0,
            credito.credito_atualizado || credito.valor_principal || 0,
            credito.total_debitos_documento || 0,
            credito.total_credito_utilizado || 0,
            credito.saldo_credito_original || credito.valor_principal || 0,
          ]
        );
      }

      if (debitos && Array.isArray(debitos)) {
        for (const d of debitos) {
          await runQuery(
            `INSERT INTO debitos_perdcomp
               (id_perdcomp, ordem, grupo_tributo, tipo_debito, cnpj_detentor, codigo_receita,
                denominacao_receita, periodicidade, periodo_apuracao, data_vencimento,
                valor_principal, multa, juros, valor_total, controlado_em_processo, numero_processo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              perdcompId, d.ordem || 1, d.grupo_tributo || '', d.tipo_debito || 'PROPRIO_CONTRIBUINTE',
              d.cnpj_detentor || '', d.codigo_receita || '', d.denominacao_receita || null,
              d.periodicidade || null, d.periodo_apuracao || '', d.data_vencimento || null,
              d.valor_principal || 0, d.multa || 0, d.juros || 0,
              (d.valor_principal || 0) + (d.multa || 0) + (d.juros || 0),
              d.controlado_em_processo || false, d.numero_processo || null,
            ]
          );
        }
      }

      if (responsavel) {
        await runQuery(
          `INSERT INTO responsaveis_preenchimento
             (id_perdcomp, cpf, nome, telefone_fixo, telefone_celular, email, crc, uf_crc)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            perdcompId,
            responsavel.cpf || '',
            responsavel.nome || '',
            responsavel.telefone_fixo || null,
            responsavel.telefone_celular || null,
            responsavel.email || null,
            responsavel.crc || null,
            responsavel.uf_crc || null,
          ]
        );
      }

      await registrarHistoricoStatus({
        id_perdcomp: perdcompId,
        status_anterior: 'NOVO',
        status_novo: 'RASCUNHO',
        observacao: 'Documento criado',
        origem: 'MANUAL',
        id_usuario: req.user!.id,
      });

      const doc = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [perdcompId]);
      res.status(201).json(doc);
    } catch (error: any) {
      log.error(`Erro ao criar documento PER/DCOMP: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const doc = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [req.params.id]);
      if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

      if (!STATUS_EDITAVEIS.includes(doc.status)) {
        return res.status(400).json({ error: `Documento com status '${doc.status}' não pode ser editado` });
      }

      const { tipo_documento, tipo_credito, titularidade, observacoes, id_certificado } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];

      if (tipo_documento !== undefined) { vals.push(tipo_documento); sets.push(`tipo_documento = $${vals.length}`); }
      if (tipo_credito !== undefined) { vals.push(tipo_credito); sets.push(`tipo_credito = $${vals.length}`); }
      if (titularidade !== undefined) { vals.push(titularidade); sets.push(`titularidade = $${vals.length}`); }
      if (observacoes !== undefined) { vals.push(observacoes); sets.push(`observacoes = $${vals.length}`); }
      if (id_certificado !== undefined) { vals.push(id_certificado); sets.push(`id_certificado = $${vals.length}`); }

      if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

      sets.push(`status = 'RASCUNHO'`);
      sets.push(`atualizado_em = NOW()`);
      vals.push(req.params.id);
      await runQuery(`UPDATE perdcomps SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      const atualizado = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar documento PER/DCOMP: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizarStatus: async (req: AuthRequest, res: Response) => {
    try {
      const { status, observacao, numero, protocolo_transmissao } = req.body;
      const doc = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [req.params.id]);
      if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

      const sets = [`status = $1`, `atualizado_em = NOW()`];
      const vals: any[] = [status];

      if (numero !== undefined) { vals.push(numero); sets.push(`numero = $${vals.length}`); }
      if (protocolo_transmissao !== undefined) { vals.push(protocolo_transmissao); sets.push(`protocolo_transmissao = $${vals.length}`); }
      if (status === 'TRANSMITIDO' || status === 'AGUARDANDO_ENVIO') {
        sets.push(`data_transmissao = NOW()`);
      }

      vals.push(req.params.id);
      await runQuery(`UPDATE perdcomps SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      await registrarHistoricoStatus({
        id_perdcomp: Number(req.params.id),
        status_anterior: doc.status,
        status_novo: status,
        observacao: observacao || undefined,
        origem: 'MANUAL',
        id_usuario: req.user!.id,
      });

      const atualizado = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar status PER/DCOMP: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const doc = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [req.params.id]);
      if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

      if (!STATUS_EXCLUIVEIS.includes(doc.status)) {
        return res.status(400).json({ error: 'Apenas rascunhos podem ser excluídos' });
      }

      await runQuery('DELETE FROM perdcomps WHERE id = $1', [req.params.id]);
      res.json({ message: 'Documento PER/DCOMP excluído com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir documento PER/DCOMP: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  historico: async (req: AuthRequest, res: Response) => {
    try {
      const historico = await getAll<any>(
        `SELECT h.*, u.nome as usuario_nome
         FROM historico_status_perdcomp h
         LEFT JOIN adm_usuarios u ON u.id = h.id_usuario
         WHERE h.id_perdcomp = $1
         ORDER BY h.criado_em DESC`,
        [req.params.id]
      );
      res.json(historico);
    } catch (error: any) {
      log.error(`Erro ao buscar histórico: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CRÉDITO TRIBUTÁRIO
// ════════════════════════════════════════════════════════════════════════════

export const creditoTributarioController = {
  salvar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const doc = await getOne<any>('SELECT * FROM perdcomps WHERE id = $1', [id]);
      if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

      const existente = await getOne<any>('SELECT id FROM creditos_tributarios WHERE id_perdcomp = $1', [id]);
      const data = req.body;

      if (existente) {
        await runQuery(
          `UPDATE creditos_tributarios SET
            cnpj_detentor=$1, codigo_receita=$2, denominacao_receita=$3, periodo_apuracao=$4,
            data_arrecadacao=$5, data_vencimento=$6, valor_original_inicial=$7, valor_principal=$8,
            valor_utilizado=$9, selic_acumulada=$10, credito_atualizado=$11,
            total_debitos_documento=$12, total_credito_utilizado=$13, saldo_credito_original=$14,
            atualizado_em=NOW()
          WHERE id_perdcomp = $15`,
          [
            data.cnpj_detentor, data.codigo_receita, data.denominacao_receita || null,
            data.periodo_apuracao, data.data_arrecadacao || null, data.data_vencimento || null,
            data.valor_original_inicial || data.valor_principal,
            data.valor_principal, data.valor_utilizado || 0,
            data.selic_acumulada || 0, data.credito_atualizado || data.valor_principal,
            data.total_debitos_documento || 0, data.total_credito_utilizado || 0,
            data.saldo_credito_original || data.valor_principal, id,
          ]
        );
      } else {
        await runQuery(
          `INSERT INTO creditos_tributarios
             (id_perdcomp, cnpj_detentor, codigo_receita, denominacao_receita, periodo_apuracao,
              data_arrecadacao, data_vencimento, valor_original_inicial, valor_principal,
              valor_utilizado, selic_acumulada, credito_atualizado,
              total_debitos_documento, total_credito_utilizado, saldo_credito_original)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            id, data.cnpj_detentor, data.codigo_receita, data.denominacao_receita || null,
            data.periodo_apuracao, data.data_arrecadacao || null, data.data_vencimento || null,
            data.valor_original_inicial || data.valor_principal,
            data.valor_principal, data.valor_utilizado || 0,
            data.selic_acumulada || 0, data.credito_atualizado || data.valor_principal,
            data.total_debitos_documento || 0, data.total_credito_utilizado || 0,
            data.saldo_credito_original || data.valor_principal,
          ]
        );
      }

      const credito = await getOne<any>('SELECT * FROM creditos_tributarios WHERE id_perdcomp = $1', [id]);
      res.json(credito);
    } catch (error: any) {
      log.error(`Erro ao salvar crédito tributário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════
// DÉBITOS DO DOCUMENTO
// ════════════════════════════════════════════════════════════════════════════

export const debitoDocumentoController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const debitos = await getAll<any>(
        'SELECT * FROM debitos_perdcomp WHERE id_perdcomp = $1 ORDER BY ordem ASC',
        [req.params.id]
      );
      res.json(debitos);
    } catch (error: any) {
      log.error(`Erro ao listar débitos do documento: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const d = req.body;
      const valorTotal = (d.valor_principal || 0) + (d.multa || 0) + (d.juros || 0);

      const { id: debitoId } = await runQuery(
        `INSERT INTO debitos_perdcomp
           (id_perdcomp, ordem, grupo_tributo, tipo_debito, cnpj_detentor, codigo_receita,
            denominacao_receita, periodicidade, periodo_apuracao, data_vencimento,
            valor_principal, multa, juros, valor_total, controlado_em_processo, numero_processo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          req.params.id, d.ordem || 1, d.grupo_tributo, d.tipo_debito || 'PROPRIO_CONTRIBUINTE',
          d.cnpj_detentor || '', d.codigo_receita || '', d.denominacao_receita || null,
          d.periodicidade || null, d.periodo_apuracao, d.data_vencimento || null,
          d.valor_principal || 0, d.multa || 0, d.juros || 0, valorTotal,
          d.controlado_em_processo || false, d.numero_processo || null,
        ]
      );

      const debito = await getOne<any>('SELECT * FROM debitos_perdcomp WHERE id = $1', [debitoId]);
      res.status(201).json(debito);
    } catch (error: any) {
      log.error(`Erro ao criar débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const d = req.body;
      const valorTotal = (d.valor_principal || 0) + (d.multa || 0) + (d.juros || 0);

      await runQuery(
        `UPDATE debitos_perdcomp SET
           grupo_tributo=COALESCE($1, grupo_tributo), tipo_debito=COALESCE($2, tipo_debito),
           cnpj_detentor=COALESCE($3, cnpj_detentor), codigo_receita=COALESCE($4, codigo_receita),
           periodo_apuracao=COALESCE($5, periodo_apuracao), data_vencimento=COALESCE($6, data_vencimento),
           valor_principal=COALESCE($7, valor_principal), multa=COALESCE($8, multa),
           juros=COALESCE($9, juros), valor_total=$10, atualizado_em=NOW()
         WHERE id = $11`,
        [
          d.grupo_tributo || null, d.tipo_debito || null,
          d.cnpj_detentor || null, d.codigo_receita || null,
          d.periodo_apuracao || null, d.data_vencimento || null,
          d.valor_principal || null, d.multa ?? null, d.juros ?? null,
          valorTotal > 0 ? valorTotal : null, req.params.debitoId,
        ]
      );

      const atualizado = await getOne<any>('SELECT * FROM debitos_perdcomp WHERE id = $1', [req.params.debitoId]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      await runQuery('DELETE FROM debitos_perdcomp WHERE id = $1', [req.params.debitoId]);
      res.json({ message: 'Débito excluído' });
    } catch (error: any) {
      log.error(`Erro ao excluir débito: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════
// RESPONSÁVEL PREENCHIMENTO
// ════════════════════════════════════════════════════════════════════════════

export const responsavelPreenchimentoController = {
  salvar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const r = req.body;
      const existente = await getOne<any>('SELECT id FROM responsaveis_preenchimento WHERE id_perdcomp = $1', [id]);

      if (existente) {
        await runQuery(
          `UPDATE responsaveis_preenchimento SET
             cpf=$1, nome=$2, telefone_fixo=$3, telefone_celular=$4,
             email=$5, crc=$6, uf_crc=$7, atualizado_em=NOW()
           WHERE id_perdcomp = $8`,
          [r.cpf, r.nome, r.telefone_fixo || null, r.telefone_celular || null,
           r.email || null, r.crc || null, r.uf_crc || null, id]
        );
      } else {
        await runQuery(
          `INSERT INTO responsaveis_preenchimento
             (id_perdcomp, cpf, nome, telefone_fixo, telefone_celular, email, crc, uf_crc)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, r.cpf, r.nome, r.telefone_fixo || null, r.telefone_celular || null,
           r.email || null, r.crc || null, r.uf_crc || null]
        );
      }

      const responsavel = await getOne<any>('SELECT * FROM responsaveis_preenchimento WHERE id_perdcomp = $1', [id]);
      res.json(responsavel);
    } catch (error: any) {
      log.error(`Erro ao salvar responsável: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════
// RECIBOS
// ════════════════════════════════════════════════════════════════════════════

export const recibosController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const where = ['1=1'];
      const params: any[] = [];

      if (req.params.id) { params.push(req.params.id); where.push(`r.id_perdcomp = $${params.length}`); }
      if (id_empresa) { params.push(id_empresa); where.push(`p.id_empresa = $${params.length}`); }

      const recibos = await getAll<any>(
        `SELECT r.*, p.numero as perdcomp_numero, p.tipo_documento, p.tipo_credito,
          e.razao_social, e.cnpj
         FROM recibos r
         JOIN perdcomps p ON p.id = r.id_perdcomp
         JOIN perdcomp_empresas e ON e.id = p.id_empresa
         WHERE ${where.join(' AND ')}
         ORDER BY r.data_transmissao DESC`,
        params
      );
      res.json(recibos);
    } catch (error: any) {
      log.error(`Erro ao listar recibos: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const r = req.body;
      const { id: reciboId } = await runQuery(
        `INSERT INTO recibos
           (id_perdcomp, numero_controle, numero_perdcomp, data_transmissao,
            tipo_documento, tipo_credito, valor_pedido, versao,
            nome_representante, cpf_representante, telefone, email, observacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          req.params.id, r.numero_controle || null, r.numero_perdcomp || null,
          r.data_transmissao || null, r.tipo_documento || null, r.tipo_credito || null,
          r.valor_pedido || null, r.versao || null, r.nome_representante || null,
          r.cpf_representante || null, r.telefone || null, r.email || null, r.observacoes || null,
        ]
      );

      if (r.numero_perdcomp) {
        await runQuery(
          `UPDATE perdcomps SET numero = $1, atualizado_em = NOW() WHERE id = $2 AND numero IS NULL`,
          [r.numero_perdcomp, req.params.id]
        );
      }

      const recibo = await getOne<any>('SELECT * FROM recibos WHERE id = $1', [reciboId]);
      res.status(201).json(recibo);
    } catch (error: any) {
      log.error(`Erro ao criar recibo: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      await runQuery('DELETE FROM recibos WHERE id = $1', [req.params.reciboId]);
      res.json({ message: 'Recibo excluído' });
    } catch (error: any) {
      log.error(`Erro ao excluir recibo: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};
