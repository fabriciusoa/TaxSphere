import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';

interface CreditoBase {
  id: number;
  id_empresa: number;
  tipo_credito: string;
  valor_original: number;
  valor_atualizado: number;
  saldo_disponivel: number;
  dt_pagamento_original: string;
  dt_vencimento_prescricao: string;
  status: string;
}

interface DebitoBase {
  id: number;
  id_empresa: number;
  tipo_tributo: string;
  valor_total: number;
  saldo_devedor: number;
  dt_vencimento: string;
  status: string;
}

export const perdcompRegraService = {
  validarCredito(credito: { dt_pagamento_original: string; valor_original: number; tipo_credito: string }): { valido: boolean; erros: string[] } {
    const erros: string[] = [];
    const dtPagamento = new Date(credito.dt_pagamento_original);
    const agora = new Date();
    const cincoAnos = new Date(dtPagamento);
    cincoAnos.setFullYear(cincoAnos.getFullYear() + 5);

    if (agora > cincoAnos) {
      erros.push('Crédito prescrito: ultrapassou o prazo de 5 anos desde o pagamento original');
    }

    if (credito.valor_original <= 0) {
      erros.push('Valor original deve ser positivo');
    }

    return { valido: erros.length === 0, erros };
  },

  validarCompensacao(
    creditosTipo: string[],
    debitosTipo: string[],
    tipoPedido: string
  ): { valido: boolean; erros: string[]; avisos: string[] } {
    const erros: string[] = [];
    const avisos: string[] = [];

    if (tipoPedido === 'Compensação' && debitosTipo.length === 0) {
      erros.push('Compensação exige ao menos um débito para vincular');
    }

    const tributosFederais = ['PIS', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'INSS', 'IOF', 'IRRF', 'CIDE'];
    for (const t of [...creditosTipo, ...debitosTipo]) {
      if (!tributosFederais.includes(t) && t !== 'OUTROS') {
        avisos.push(`Tributo "${t}" não está na lista padrão de tributos federais`);
      }
    }

    const temPrevidenciario = creditosTipo.some(t => t === 'INSS');
    const temNaoPrevidenciario = debitosTipo.some(t => t !== 'INSS');
    if (temPrevidenciario && temNaoPrevidenciario) {
      erros.push('Créditos previdenciários (INSS) só podem compensar débitos previdenciários (IN RFB 2055/2021)');
    }

    return { valido: erros.length === 0, erros, avisos };
  },

  otimizarCompensacao(
    creditos: CreditoBase[],
    debitos: DebitoBase[]
  ): { sugestoes: { id_credito: number; id_debito: number; valor: number }[]; economia: number } {
    const creditosOrdenados = [...creditos]
      .filter(c => c.saldo_disponivel > 0 && c.status !== 'Prescrito' && c.status !== 'Esgotado')
      .sort((a, b) => new Date(a.dt_vencimento_prescricao).getTime() - new Date(b.dt_vencimento_prescricao).getTime());

    const debitosOrdenados = [...debitos]
      .filter(d => d.saldo_devedor > 0 && d.status !== 'Compensado' && d.status !== 'Pago')
      .sort((a, b) => new Date(a.dt_vencimento).getTime() - new Date(b.dt_vencimento).getTime());

    const sugestoes: { id_credito: number; id_debito: number; valor: number }[] = [];
    let economia = 0;

    const saldoCreditos = new Map(creditosOrdenados.map(c => [c.id, c.saldo_disponivel]));
    const saldoDebitos = new Map(debitosOrdenados.map(d => [d.id, d.saldo_devedor]));

    for (const credito of creditosOrdenados) {
      let saldoCred = saldoCreditos.get(credito.id) || 0;
      if (saldoCred <= 0) continue;

      for (const debito of debitosOrdenados) {
        let saldoDeb = saldoDebitos.get(debito.id) || 0;
        if (saldoDeb <= 0) continue;

        if (credito.tipo_credito === 'INSS' && debito.tipo_tributo !== 'INSS') continue;
        if (credito.tipo_credito !== 'INSS' && debito.tipo_tributo === 'INSS') continue;

        const valor = Math.min(saldoCred, saldoDeb);
        sugestoes.push({ id_credito: credito.id, id_debito: debito.id, valor });
        economia += valor;

        saldoCred -= valor;
        saldoDeb -= valor;
        saldoCreditos.set(credito.id, saldoCred);
        saldoDebitos.set(debito.id, saldoDeb);

        if (saldoCred <= 0) break;
      }
    }

    return { sugestoes, economia };
  },

  async gerarAlertas(idEmpresa: number, idUsuario: number): Promise<number> {
    let alertasGerados = 0;
    const agora = new Date();
    const seisM = new Date();
    seisM.setMonth(seisM.getMonth() + 6);

    const creditosProximos = await getAll<CreditoBase>(
      `SELECT * FROM perdcomp_creditos WHERE id_empresa = $1 AND status IN ('Disponível', 'Parcialmente Utilizado') AND dt_vencimento_prescricao <= $2 AND dt_vencimento_prescricao > $3`,
      [idEmpresa, seisM.toISOString(), agora.toISOString()]
    );

    for (const c of creditosProximos) {
      const diasRestantes = Math.ceil(
        (new Date(c.dt_vencimento_prescricao).getTime() - agora.getTime()) / (1000 * 60 * 60 * 24)
      );
      const jaExiste = await getOne<{ id: number }>(
        `SELECT id FROM perdcomp_alertas WHERE id_credito = $1 AND tipo_alerta = 'Prescrição Próxima' AND criado_em > NOW() - INTERVAL '7 days'`,
        [c.id]
      );
      if (!jaExiste) {
        const prioridade = diasRestantes < 30 ? 'Crítica' : diasRestantes < 90 ? 'Alta' : 'Média';
        await runQuery(
          `INSERT INTO perdcomp_alertas (id_empresa, id_credito, id_usuario, tipo_alerta, titulo, mensagem, prioridade) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [idEmpresa, c.id, idUsuario, 'Prescrição Próxima',
            `Crédito ${c.tipo_credito} próximo de prescrever`,
            `O crédito de ${c.tipo_credito} (R$ ${c.saldo_disponivel.toFixed(2)}) prescreve em ${diasRestantes} dias. Considere utilizá-lo em uma compensação.`,
            prioridade]
        );
        alertasGerados++;
      }
    }

    const pedidosPrazo = await getAll<{ id: number; dt_prazo_manifestacao: string; tipo_pedido: string }>(
      `SELECT id, dt_prazo_manifestacao, tipo_pedido FROM perdcomp_pedidos WHERE id_empresa = $1 AND dt_prazo_manifestacao IS NOT NULL AND status IN ('Indeferido', 'Não Homologado')`,
      [idEmpresa]
    );

    for (const p of pedidosPrazo) {
      const dtPrazo = new Date(p.dt_prazo_manifestacao);
      const diasRestantes = Math.ceil((dtPrazo.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes > 0 && diasRestantes <= 10) {
        const jaExiste = await getOne<{ id: number }>(
          `SELECT id FROM perdcomp_alertas WHERE id_pedido = $1 AND tipo_alerta = 'Prazo Manifestação' AND criado_em > NOW() - INTERVAL '3 days'`,
          [p.id]
        );
        if (!jaExiste) {
          await runQuery(
            `INSERT INTO perdcomp_alertas (id_empresa, id_pedido, id_usuario, tipo_alerta, titulo, mensagem, prioridade) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [idEmpresa, p.id, idUsuario, 'Prazo Manifestação',
              `Prazo de manifestação vencendo`,
              `O pedido #${p.id} (${p.tipo_pedido}) tem prazo de manifestação de inconformidade em ${diasRestantes} dias.`,
              diasRestantes <= 5 ? 'Crítica' : 'Alta']
          );
          alertasGerados++;
        }
      }
    }

    return alertasGerados;
  },
};
