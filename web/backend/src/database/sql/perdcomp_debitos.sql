CREATE TABLE IF NOT EXISTS perdcomp_debitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa INTEGER NOT NULL,
  tipo_tributo TEXT NOT NULL,
  codigo_receita TEXT,
  periodo_apuracao TEXT NOT NULL,
  valor_principal REAL NOT NULL,
  valor_multa REAL NOT NULL DEFAULT 0,
  valor_juros REAL NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL,
  dt_vencimento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente', 'Parcialmente Compensado', 'Compensado', 'Pago')),
  saldo_devedor REAL NOT NULL,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_empresa) REFERENCES perdcomp_empresas(id)
);
