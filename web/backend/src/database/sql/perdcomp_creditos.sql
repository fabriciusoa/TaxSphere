CREATE TABLE IF NOT EXISTS perdcomp_creditos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa INTEGER NOT NULL,
  tipo_credito TEXT NOT NULL CHECK(tipo_credito IN ('PIS', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'INSS', 'IOF', 'IRRF', 'CIDE', 'OUTROS')),
  origem_credito TEXT NOT NULL CHECK(origem_credito IN ('Pagamento Indevido', 'Pagamento a Maior', 'Crédito Presumido', 'Saldo Negativo IRPJ/CSLL', 'Retenção na Fonte', 'Exportação')),
  periodo_apuracao TEXT NOT NULL,
  codigo_receita TEXT,
  valor_original REAL NOT NULL,
  valor_selic_acumulado REAL NOT NULL DEFAULT 0,
  valor_atualizado REAL NOT NULL,
  dt_pagamento_original TEXT NOT NULL,
  dt_vencimento_prescricao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Disponível' CHECK(status IN ('Disponível', 'Parcialmente Utilizado', 'Esgotado', 'Prescrito', 'Suspenso')),
  saldo_disponivel REAL NOT NULL,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_empresa) REFERENCES perdcomp_empresas(id)
);
