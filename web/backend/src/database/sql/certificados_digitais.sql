CREATE TABLE IF NOT EXISTS certificados_digitais (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa    INTEGER NOT NULL,
  nome_arquivo  TEXT    NOT NULL,
  tipo          TEXT    NOT NULL DEFAULT 'A1' CHECK(tipo IN ('A1','A3')),
  pfx_encrypted BLOB   NOT NULL,
  iv            TEXT    NOT NULL,
  cn            TEXT,
  emissor       TEXT,
  serial_number TEXT,
  validade_de   TEXT,
  validade_ate  TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_empresa) REFERENCES perdcomp_empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ecac_sincronizacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa    INTEGER NOT NULL,
  id_certificado INTEGER NOT NULL,
  id_usuario    INTEGER NOT NULL,
  tipo          TEXT    NOT NULL CHECK(tipo IN ('dctfweb','situacao_fiscal','perdcomp','completa')),
  status        TEXT    NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','em_andamento','concluido','erro','cancelado')),
  creditos_importados   INTEGER DEFAULT 0,
  debitos_importados    INTEGER DEFAULT 0,
  registros_ignorados   INTEGER DEFAULT 0,
  erro_mensagem TEXT,
  detalhes      TEXT,
  iniciado_em   TEXT,
  concluido_em  TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_empresa)    REFERENCES perdcomp_empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (id_certificado) REFERENCES certificados_digitais(id),
  FOREIGN KEY (id_usuario)     REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON certificados_digitais(id_empresa);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_empresa ON ecac_sincronizacoes(id_empresa);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_status ON ecac_sincronizacoes(status);
