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
};
