CREATE TABLE IF NOT EXISTS perdcomp_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pedido INTEGER,
  id_credito INTEGER,
  id_debito INTEGER,
  id_usuario INTEGER NOT NULL,
  acao TEXT NOT NULL CHECK(acao IN ('Criação', 'Atualização', 'Transmissão', 'Exclusão', 'Mudança Status')),
  campo_alterado TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  detalhes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_pedido) REFERENCES perdcomp_pedidos(id),
  FOREIGN KEY (id_credito) REFERENCES perdcomp_creditos(id),
  FOREIGN KEY (id_debito) REFERENCES perdcomp_debitos(id),
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id)
);
