import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';

interface SelicTaxa {
  id: number;
  mes_referencia: string;
  taxa_mensal: number;
  taxa_acumulada_ano: number | null;
  criado_em: string;
}

interface BCBSelicData {
  data: string;
  valor: string;
}

export const selicService = {
  async atualizarTaxas(): Promise<number> {
    try {
      const response = await fetch(
        'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json'
      );
      if (!response.ok) throw new Error(`BCB API retornou ${response.status}`);

      const dados = (await response.json()) as BCBSelicData[];
      let inseridos = 0;

      for (const item of dados) {
        const [dia, mes, ano] = item.data.split('/');
        const mesRef = `${ano}-${mes}`;
        const taxa = parseFloat(item.valor);

        const existe = await getOne<SelicTaxa>(
          'SELECT id FROM perdcomp_selic_taxas WHERE mes_referencia = ?',
          [mesRef]
        );

        if (!existe) {
          await runQuery(
            'INSERT INTO perdcomp_selic_taxas (mes_referencia, taxa_mensal) VALUES (?, ?)',
            [mesRef, taxa]
          );
          inseridos++;
        }
      }

      log.info(`SELIC: ${inseridos} novas taxas inseridas de ${dados.length} registros do BCB`);
      return inseridos;
    } catch (error: any) {
      log.error(`Erro ao atualizar taxas SELIC: ${error.message}`);
      throw error;
    }
  },

  async calcularAtualizacao(
    valorOriginal: number,
    dataOrigem: string,
    dataFim?: string
  ): Promise<{ valorAtualizado: number; selicAcumulada: number }> {
    const dtOrigem = new Date(dataOrigem);
    const dtFim = dataFim ? new Date(dataFim) : new Date();

    const mesInicio = `${dtOrigem.getFullYear()}-${String(dtOrigem.getMonth() + 2).padStart(2, '0')}`;
    const mesFim = `${dtFim.getFullYear()}-${String(dtFim.getMonth() + 1).padStart(2, '0')}`;

    const taxas = await getAll<SelicTaxa>(
      'SELECT taxa_mensal FROM perdcomp_selic_taxas WHERE mes_referencia >= ? AND mes_referencia <= ? ORDER BY mes_referencia',
      [mesInicio, mesFim]
    );

    let fatorAcumulado = 1;
    for (const t of taxas) {
      fatorAcumulado *= (1 + t.taxa_mensal / 100);
    }

    const selicAcumulada = (fatorAcumulado - 1) * 100;
    const valorAtualizado = valorOriginal * fatorAcumulado;

    return {
      valorAtualizado: Math.round(valorAtualizado * 100) / 100,
      selicAcumulada: Math.round(selicAcumulada * 10000) / 10000,
    };
  },

  async atualizarCreditosSelic(idEmpresa?: number): Promise<number> {
    let sql = `SELECT id, valor_original, dt_pagamento_original FROM perdcomp_creditos WHERE status IN ('Disponível', 'Parcialmente Utilizado')`;
    const params: any[] = [];
    if (idEmpresa) {
      sql += ' AND id_empresa = ?';
      params.push(idEmpresa);
    }

    const creditos = await getAll<{ id: number; valor_original: number; dt_pagamento_original: string }>(sql, params);
    let atualizados = 0;

    for (const c of creditos) {
      try {
        const { valorAtualizado, selicAcumulada } = await this.calcularAtualizacao(
          c.valor_original,
          c.dt_pagamento_original
        );
        const selicValor = valorAtualizado - c.valor_original;

        await runQuery(
          `UPDATE perdcomp_creditos SET valor_atualizado = ?, valor_selic_acumulado = ?, saldo_disponivel = saldo_disponivel + (? - valor_selic_acumulado), atualizado_em = datetime('now') WHERE id = ?`,
          [valorAtualizado, selicValor, selicValor, c.id]
        );
        atualizados++;
      } catch (err: any) {
        log.error(`Erro ao atualizar SELIC do crédito ${c.id}: ${err.message}`);
      }
    }

    return atualizados;
  },

  async obterTaxas(limite: number = 24): Promise<SelicTaxa[]> {
    return getAll<SelicTaxa>(
      'SELECT * FROM perdcomp_selic_taxas ORDER BY mes_referencia DESC LIMIT ?',
      [limite]
    );
  },
};
