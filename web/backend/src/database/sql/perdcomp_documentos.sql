CREATE TABLE IF NOT EXISTS perdcomp_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pedido INTEGER,
  id_credito INTEGER,
  tipo_documento TEXT NOT NULL CHECK(tipo_documento IN ('DARF', 'GPS', 'DCTF', 'EFD', 'Contrato', 'Outros')),
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  dados_arquivo BLOB,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_pedido) REFERENCES perdcomp_pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (id_credito) REFERENCES perdcomp_creditos(id)
);
