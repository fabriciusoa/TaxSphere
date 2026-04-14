import { getAll, getOne } from '../database/connection';
import { log } from '../utils/logger';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callOpenAI(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return 'Serviço de IA não configurado. Configure a variável OPENAI_API_KEY no arquivo .env para habilitar o assistente inteligente.';
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      log.error(`OpenAI API error: ${err}`);
      return 'Erro ao consultar o assistente de IA. Tente novamente.';
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || 'Sem resposta do assistente.';
  } catch (error: any) {
    log.error(`Erro OpenAI: ${error.message}`);
    return 'Erro de comunicação com o serviço de IA.';
  }
}

const SYSTEM_PROMPT = `Você é um assistente fiscal especialista em PER/DComp (Pedido Eletrônico de Restituição, Ressarcimento ou Reembolso e Declaração de Compensação) da Receita Federal do Brasil.

Sua base de conhecimento inclui:
- IN RFB nº 2055/2021 e atualizações
- Legislação tributária federal brasileira (PIS, COFINS, IRPJ, CSLL, IPI, etc.)
- Regras de compensação tributária
- Cálculo de atualização monetária pela SELIC
- Prazos prescricionais (5 anos)
- Procedimentos de manifestação de inconformidade

Responda sempre em português do Brasil, de forma clara, objetiva e com referências à legislação quando aplicável. Use formatação com marcadores quando listar itens.`;

export const perdcompIAService = {
  async analisarOportunidades(idEmpresa: number): Promise<string> {
    const creditos = await getAll<any>(
      `SELECT tipo_credito, origem_credito, SUM(saldo_disponivel) as saldo, COUNT(*) as qtde, MIN(dt_vencimento_prescricao) as proxima_prescricao FROM perdcomp_creditos WHERE id_empresa = ? AND status IN ('Disponível','Parcialmente Utilizado') GROUP BY tipo_credito, origem_credito`,
      [idEmpresa]
    );
    const debitos = await getAll<any>(
      `SELECT tipo_tributo, SUM(saldo_devedor) as saldo, COUNT(*) as qtde FROM perdcomp_debitos WHERE id_empresa = ? AND status IN ('Pendente','Parcialmente Compensado') GROUP BY tipo_tributo`,
      [idEmpresa]
    );
    const empresa = await getOne<any>('SELECT razao_social, regime_tributario FROM perdcomp_empresas WHERE id = ?', [idEmpresa]);

    const contexto = `
Empresa: ${empresa?.razao_social || 'N/A'} (Regime: ${empresa?.regime_tributario || 'N/A'})

CRÉDITOS DISPONÍVEIS:
${creditos.map((c: any) => `- ${c.tipo_credito} (${c.origem_credito}): ${c.qtde} créditos, saldo total R$ ${c.saldo.toFixed(2)}, próxima prescrição: ${c.proxima_prescricao}`).join('\n') || 'Nenhum crédito disponível'}

DÉBITOS PENDENTES:
${debitos.map((d: any) => `- ${d.tipo_tributo}: ${d.qtde} débitos, saldo total R$ ${d.saldo.toFixed(2)}`).join('\n') || 'Nenhum débito pendente'}`;

    return callOpenAI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Analise a posição fiscal desta empresa e identifique oportunidades de compensação, restituição ou ressarcimento. Inclua recomendações de prioridade e riscos.\n\n${contexto}` },
    ]);
  },

  async sugerirEstrategia(idEmpresa: number): Promise<string> {
    const creditos = await getAll<any>(
      `SELECT * FROM perdcomp_creditos WHERE id_empresa = ? AND status IN ('Disponível','Parcialmente Utilizado') ORDER BY dt_vencimento_prescricao`,
      [idEmpresa]
    );
    const debitos = await getAll<any>(
      `SELECT * FROM perdcomp_debitos WHERE id_empresa = ? AND status IN ('Pendente','Parcialmente Compensado') ORDER BY dt_vencimento`,
      [idEmpresa]
    );
    const empresa = await getOne<any>('SELECT * FROM perdcomp_empresas WHERE id = ?', [idEmpresa]);

    const contexto = `
Empresa: ${empresa?.razao_social} (${empresa?.regime_tributario})

CRÉDITOS (${creditos.length} total):
${creditos.slice(0, 20).map((c: any) => `- #${c.id} ${c.tipo_credito} ${c.periodo_apuracao}: R$ ${c.saldo_disponivel.toFixed(2)} (prescrição: ${c.dt_vencimento_prescricao})`).join('\n')}

DÉBITOS (${debitos.length} total):
${debitos.slice(0, 20).map((d: any) => `- #${d.id} ${d.tipo_tributo} ${d.periodo_apuracao}: R$ ${d.saldo_devedor.toFixed(2)} (venc: ${d.dt_vencimento})`).join('\n')}`;

    return callOpenAI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Sugira a melhor estratégia de compensação para esta empresa. Considere prazos de prescrição, regras de compatibilidade entre tributos (IN RFB 2055/2021) e otimização de valores. Forneça um plano passo-a-passo.\n\n${contexto}` },
    ]);
  },

  async avaliarRisco(idPedido: number): Promise<string> {
    const pedido = await getOne<any>(
      `SELECT p.*, e.razao_social, e.regime_tributario FROM perdcomp_pedidos p JOIN perdcomp_empresas e ON e.id = p.id_empresa WHERE p.id = ?`,
      [idPedido]
    );
    if (!pedido) return 'Pedido não encontrado.';

    const itens = await getAll<any>(
      `SELECT pi.*, c.tipo_credito, c.origem_credito, c.valor_original, c.dt_pagamento_original, c.dt_vencimento_prescricao, d.tipo_tributo FROM perdcomp_pedido_itens pi LEFT JOIN perdcomp_creditos c ON c.id = pi.id_credito LEFT JOIN perdcomp_debitos d ON d.id = pi.id_debito WHERE pi.id_pedido = ?`,
      [idPedido]
    );

    const contexto = `
PEDIDO #${pedido.id}
Empresa: ${pedido.razao_social} (${pedido.regime_tributario})
Tipo: ${pedido.tipo_pedido}
Status: ${pedido.status}
Valor Crédito: R$ ${pedido.valor_total_credito.toFixed(2)}
Valor Débito: R$ ${pedido.valor_total_debito.toFixed(2)}

ITENS:
${itens.map((i: any) => {
  if (i.tipo_item === 'credito') return `- CRÉDITO: ${i.tipo_credito} (${i.origem_credito}), valor utilizado: R$ ${i.valor_utilizado.toFixed(2)}, pagamento original: ${i.dt_pagamento_original}, prescrição: ${i.dt_vencimento_prescricao}`;
  return `- DÉBITO: ${i.tipo_tributo}, valor compensado: R$ ${i.valor_utilizado.toFixed(2)}`;
}).join('\n')}`;

    return callOpenAI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Avalie o risco de indeferimento/não homologação deste pedido PER/DComp. Classifique como Baixo, Médio ou Alto e liste os fatores de risco e recomendações.\n\n${contexto}` },
    ]);
  },

  async chat(idEmpresa: number, mensagem: string, historico: { role: string; content: string }[]): Promise<string> {
    const empresa = await getOne<any>('SELECT razao_social, regime_tributario, cnpj FROM perdcomp_empresas WHERE id = ?', [idEmpresa]);

    const messages: ChatMessage[] = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nContexto: Você está auxiliando a empresa ${empresa?.razao_social || 'N/A'} (CNPJ: ${empresa?.cnpj || 'N/A'}, Regime: ${empresa?.regime_tributario || 'N/A'}).` },
      ...historico.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: mensagem },
    ];

    return callOpenAI(messages);
  },
};
