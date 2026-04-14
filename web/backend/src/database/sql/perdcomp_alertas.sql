CREATE TABLE IF NOT EXISTS perdcomp_alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa INTEGER,
  id_pedido INTEGER,
  id_credito INTEGER,
  id_usuario INTEGER NOT NULL,
  tipo_alerta TEXT NOT NULL CHECK(tipo_alerta IN ('Prescrição Próxima', 'Prazo Manifestação', 'Crédito Esgotado', 'Status Alterado', 'Oportunidade Compensação')),
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'Média' CHECK(prioridade IN ('Baixa', 'Média', 'Alta', 'Crítica')),
  lido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_empresa) REFERENCES perdcomp_empresas(id),
  FOREIGN KEY (id_pedido) REFERENCES perdcomp_pedidos(id),
  FOREIGN KEY (id_credito) REFERENCES perdcomp_creditos(id),
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id)
);
