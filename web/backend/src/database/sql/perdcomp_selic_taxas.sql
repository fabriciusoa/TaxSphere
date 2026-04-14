CREATE TABLE IF NOT EXISTS perdcomp_selic_taxas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_referencia TEXT NOT NULL UNIQUE,
  taxa_mensal REAL NOT NULL,
  taxa_acumulada_ano REAL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
