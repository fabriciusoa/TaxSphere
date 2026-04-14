import { Response } from 'express';
import { getOne, getAll, runQuery } from '../database/connection';
import { AuthRequest } from '../types';
import { certificadoService } from '../services/certificadoService';
import { EcacService } from '../services/ecacService';
import { log } from '../utils/logger';

interface AuthRequestWithFile extends AuthRequest {
  file?: Express.Multer.File;
}

// ============ CERTIFICADOS ============

export const ecacCertificadoController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const certs = await getAll<any>(
        `SELECT c.id, c.id_empresa, c.nome_arquivo, c.tipo, c.cn, c.emissor,
                c.serial_number, c.validade_de, c.validade_ate, c.ativo, c.criado_em,
                e.razao_social, e.cnpj
         FROM certificados_digitais c
         JOIN perdcomp_empresas e ON e.id = c.id_empresa
         ORDER BY c.criado_em DESC`
      );
      res.json(certs);
    } catch (error: any) {
      log.error(`Erro ao listar certificados: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar certificados' });
    }
  },

  upload: async (req: AuthRequestWithFile, res: Response) => {
    try {
      const file = req.file;
      const { id_empresa, senha_certificado } = req.body;

      if (!file) return res.status(400).json({ error: 'Arquivo .pfx é obrigatório' });
      if (!id_empresa) return res.status(400).json({ error: 'Empresa é obrigatória' });
      if (!senha_certificado) return res.status(400).json({ error: 'Senha do certificado é obrigatória' });

      const empresa = await getOne<any>('SELECT id, cnpj, razao_social FROM perdcomp_empresas WHERE id = ?', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const validation = await certificadoService.validatePfx(file.buffer, senha_certificado);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { encrypted, iv } = certificadoService.encrypt(file.buffer);

      await runQuery(
        'UPDATE certificados_digitais SET ativo = 0 WHERE id_empresa = ?',
        [id_empresa]
      );

      const { lastID } = await runQuery(
        `INSERT INTO certificados_digitais
         (id_empresa, nome_arquivo, tipo, pfx_encrypted, iv, cn, emissor, serial_number, validade_de, validade_ate)
         VALUES (?, ?, 'A1', ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_empresa,
          file.originalname,
          encrypted,
          iv,
          validation.info?.cn || '',
          validation.info?.emissor || '',
          validation.info?.serialNumber || '',
          validation.info?.validadeDe || '',
          validation.info?.validadeAte || '',
        ]
      );

      const cert = await getOne<any>('SELECT id, id_empresa, nome_arquivo, tipo, cn, emissor, validade_de, validade_ate, ativo, criado_em FROM certificados_digitais WHERE id = ?', [lastID]);

      log.info(`Certificado ${file.originalname} cadastrado para empresa ${empresa.razao_social} (${empresa.cnpj})`);

      res.status(201).json({
        ...cert,
        info: validation.info,
        message: 'Certificado digital cadastrado com sucesso',
      });
    } catch (error: any) {
      log.error(`Erro ao fazer upload do certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao processar certificado digital' });
    }
  },

  validar: async (req: AuthRequestWithFile, res: Response) => {
    try {
      const file = req.file;
      const { senha_certificado } = req.body;

      if (!file) return res.status(400).json({ error: 'Arquivo .pfx é obrigatório' });
      if (!senha_certificado) return res.status(400).json({ error: 'Senha do certificado é obrigatória' });

      const validation = await certificadoService.validatePfx(file.buffer, senha_certificado);

      res.json({
        valid: validation.valid,
        info: validation.info,
        error: validation.error,
      });
    } catch (error: any) {
      log.error(`Erro ao validar certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao validar certificado' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>('SELECT id FROM certificados_digitais WHERE id = ?', [req.params.id]);
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });

      await runQuery('DELETE FROM certificados_digitais WHERE id = ?', [req.params.id]);
      res.json({ message: 'Certificado excluído' });
    } catch (error: any) {
      log.error(`Erro ao excluir certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao excluir certificado' });
    }
  },
};

// ============ SINCRONIZAÇÃO eCAC ============

const activeSyncs = new Map<number, { cancel: boolean }>();

export const ecacSincronizacaoController = {
  sincronizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, senha_certificado, tipo } = req.body;
      const tiposValidos = ['dctfweb', 'situacao_fiscal', 'perdcomp', 'completa'];

      if (!id_empresa || !senha_certificado) {
        return res.status(400).json({ error: 'Empresa e senha do certificado são obrigatórios' });
      }

      if (tipo && !tiposValidos.includes(tipo)) {
        return res.status(400).json({ error: `Tipo inválido. Use: ${tiposValidos.join(', ')}` });
      }

      const empresa = await getOne<any>('SELECT id, cnpj, razao_social FROM perdcomp_empresas WHERE id = ?', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const cert = await getOne<any>(
        'SELECT * FROM certificados_digitais WHERE id_empresa = ? AND ativo = 1',
        [id_empresa]
      );
      if (!cert) return res.status(404).json({ error: 'Nenhum certificado digital ativo para esta empresa. Faça o upload do certificado primeiro.' });

      if (activeSyncs.has(id_empresa)) {
        return res.status(409).json({ error: 'Sincronização já em andamento para esta empresa' });
      }

      const { lastID: syncId } = await runQuery(
        `INSERT INTO ecac_sincronizacoes (id_empresa, id_certificado, id_usuario, tipo, status, iniciado_em)
         VALUES (?, ?, ?, ?, 'em_andamento', datetime('now'))`,
        [id_empresa, cert.id, req.user!.id, tipo || 'completa']
      );

      res.json({ sync_id: syncId, message: 'Sincronização iniciada' });

      const control = { cancel: false };
      activeSyncs.set(id_empresa, control);

      setImmediate(async () => {
        try {
          const pfxBuffer = certificadoService.decrypt(cert.pfx_encrypted, cert.iv);

          const ecac = new EcacService((msg, pct) => {
            runQuery(
              `UPDATE ecac_sincronizacoes SET detalhes = ? WHERE id = ?`,
              [JSON.stringify({ progresso: pct, mensagem: msg }), syncId]
            ).catch(() => {});
          });

          const result = await ecac.executarExtracao(pfxBuffer, senha_certificado);

          if (!result.success) {
            await runQuery(
              `UPDATE ecac_sincronizacoes SET status = 'erro', erro_mensagem = ?, concluido_em = datetime('now') WHERE id = ?`,
              [result.errors.join('; '), syncId]
            );
            return;
          }

          let creditosImportados = 0;
          let debitosImportados = 0;
          let ignorados = 0;
          let declaracoesImportadas = 0;

          for (const decl of result.declaracoes) {
            try {
              const existe = await getOne<any>(
                `SELECT id FROM dctfweb_declaracoes
                 WHERE id_empresa = ? AND categoria = ? AND periodo_apuracao = ?`,
                [id_empresa, decl.categoria, decl.periodo_apuracao]
              );
              if (existe) {
                await runQuery(
                  `UPDATE dctfweb_declaracoes
                   SET situacao = ?, debito_apurado = ?, saldo_pagar = ?,
                       data_transmissao = ?, atualizado_em = datetime('now')
                   WHERE id = ?`,
                  [decl.situacao || 'Ativa', decl.debito_apurado, decl.saldo_pagar,
                   decl.data_transmissao || null, existe.id]
                );
              } else {
                await runQuery(
                  `INSERT INTO dctfweb_declaracoes
                   (id_empresa, categoria, periodo_apuracao, situacao, debito_apurado,
                    saldo_pagar, data_transmissao, origem, observacoes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'eCAC', ?)`,
                  [id_empresa, decl.categoria, decl.periodo_apuracao,
                   decl.situacao || 'Ativa', decl.debito_apurado, decl.saldo_pagar,
                   decl.data_transmissao || null,
                   `Importado eCAC - ${new Date().toISOString().substring(0, 10)}`]
                );
                declaracoesImportadas++;
              }
            } catch (err: any) {
              log.warn(`Erro ao importar declaração DCTFWeb: ${err.message}`);
            }
          }

          for (const credito of result.creditos) {
            try {
              const existe = await getOne<any>(
                `SELECT id FROM perdcomp_creditos
                 WHERE id_empresa = ? AND tipo_credito = ? AND periodo_apuracao = ? AND valor_original = ?`,
                [id_empresa, credito.tipo_credito, credito.periodo_apuracao, credito.valor_original]
              );
              if (existe) { ignorados++; continue; }

              await runQuery(
                `INSERT INTO perdcomp_creditos
                 (id_empresa, tipo_credito, origem_credito, periodo_apuracao, codigo_receita,
                  valor_original, valor_atualizado, saldo_disponivel, dt_pagamento_original, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id_empresa, credito.tipo_credito, credito.origem_credito,
                  credito.periodo_apuracao, credito.codigo_receita,
                  credito.valor_original, credito.valor_original, credito.valor_original,
                  credito.dt_pagamento_original, credito.observacoes,
                ]
              );
              creditosImportados++;
            } catch (err: any) {
              log.warn(`Erro ao importar crédito: ${err.message}`);
              ignorados++;
            }
          }

          for (const debito of result.debitos) {
            try {
              const existe = await getOne<any>(
                `SELECT id FROM perdcomp_debitos
                 WHERE id_empresa = ? AND tipo_tributo = ? AND periodo_apuracao = ? AND valor_principal = ?`,
                [id_empresa, debito.tipo_tributo, debito.periodo_apuracao, debito.valor_principal]
              );
              if (existe) { ignorados++; continue; }

              const valorTotal = debito.valor_principal + debito.valor_multa + debito.valor_juros;

              await runQuery(
                `INSERT INTO perdcomp_debitos
                 (id_empresa, tipo_tributo, codigo_receita, periodo_apuracao,
                  valor_principal, valor_multa, valor_juros, valor_total,
                  saldo_devedor, dt_vencimento, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id_empresa, debito.tipo_tributo, debito.codigo_receita,
                  debito.periodo_apuracao, debito.valor_principal,
                  debito.valor_multa, debito.valor_juros, valorTotal,
                  valorTotal, debito.dt_vencimento, debito.observacoes,
                ]
              );
              debitosImportados++;
            } catch (err: any) {
              log.warn(`Erro ao importar débito: ${err.message}`);
              ignorados++;
            }
          }

          await runQuery(
            `UPDATE ecac_sincronizacoes
             SET status = 'concluido', creditos_importados = ?, debitos_importados = ?,
                 registros_ignorados = ?, concluido_em = datetime('now'),
                 detalhes = ?
             WHERE id = ?`,
            [
              creditosImportados, debitosImportados, ignorados,
              JSON.stringify({
                progresso: 100,
                mensagem: 'Concluído',
                declaracoes_importadas: declaracoesImportadas,
                declaracoes_extraidas: result.declaracoes.length,
                creditos_extraidos: result.creditos.length,
                debitos_extraidos: result.debitos.length,
              }),
              syncId,
            ]
          );

          log.info(`[eCAC] Sync ${syncId} concluída: ${creditosImportados} créditos, ${debitosImportados} débitos, ${ignorados} ignorados`);
        } catch (err: any) {
          log.error(`[eCAC] Sync ${syncId} falhou: ${err.message}`);
          await runQuery(
            `UPDATE ecac_sincronizacoes SET status = 'erro', erro_mensagem = ?, concluido_em = datetime('now') WHERE id = ?`,
            [err.message, syncId]
          ).catch(() => {});
        } finally {
          activeSyncs.delete(id_empresa);
        }
      });
    } catch (error: any) {
      log.error(`Erro ao iniciar sincronização: ${error.message}`);
      res.status(500).json({ error: 'Erro ao iniciar sincronização' });
    }
  },

  status: async (req: AuthRequest, res: Response) => {
    try {
      const sync = await getOne<any>(
        `SELECT s.*, e.razao_social, e.cnpj
         FROM ecac_sincronizacoes s
         JOIN perdcomp_empresas e ON e.id = s.id_empresa
         WHERE s.id = ?`,
        [req.params.id]
      );
      if (!sync) return res.status(404).json({ error: 'Sincronização não encontrada' });

      let detalhes = null;
      try { detalhes = sync.detalhes ? JSON.parse(sync.detalhes) : null; } catch { /* ignore */ }

      res.json({ ...sync, detalhes });
    } catch (error: any) {
      log.error(`Erro ao consultar status: ${error.message}`);
      res.status(500).json({ error: 'Erro ao consultar status' });
    }
  },

  historico: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const where = id_empresa ? 'WHERE s.id_empresa = ?' : '';
      const params = id_empresa ? [id_empresa] : [];

      const syncs = await getAll<any>(
        `SELECT s.id, s.id_empresa, s.tipo, s.status,
                s.creditos_importados, s.debitos_importados, s.registros_ignorados,
                s.erro_mensagem, s.iniciado_em, s.concluido_em,
                e.razao_social, e.cnpj
         FROM ecac_sincronizacoes s
         JOIN perdcomp_empresas e ON e.id = s.id_empresa
         ${where}
         ORDER BY s.criado_em DESC
         LIMIT 50`,
        params
      );

      res.json(syncs);
    } catch (error: any) {
      log.error(`Erro ao listar histórico: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar histórico' });
    }
  },
};
