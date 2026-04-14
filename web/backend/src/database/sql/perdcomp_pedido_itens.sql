CREATE TABLE IF NOT EXISTS perdcomp_pedido_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pedido INTEGER NOT NULL,
  id_credito INTEGER,
  id_debito INTEGER,
  tipo_item TEXT NOT NULL CHECK(tipo_item IN ('credito', 'debito')),
  valor_utilizado REAL NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_pedido) REFERENCES perdcomp_pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (id_credito) REFERENCES perdcomp_creditos(id),
  FOREIGN KEY (id_debito) REFERENCES perdcomp_debitos(id)
);
