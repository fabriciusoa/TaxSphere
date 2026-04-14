CREATE TABLE IF NOT EXISTS dctfweb_declaracoes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa            INTEGER NOT NULL,
  categoria             TEXT    NOT NULL,
  periodo_apuracao      TEXT    NOT NULL,
  situacao              TEXT    NOT NULL DEFAULT 'Em Andamento' CHECK(situacao IN ('Em Andamento','Ativa','Retificada','Excluída','Inativa','Sem Movimento')),
  debito_apurado        REAL    NOT NULL DEFAULT 0,
  credito_vinculado     REAL    NOT NULL DEFAULT 0,
  saldo_pagar           REAL    NOT NULL DEFAULT 0,
  data_transmissao      TEXT,
  numero_recibo         TEXT,
  origem                TEXT    NOT NULL DEFAULT 'Manual' CHECK(origem IN ('Manual','eCAC','API Serpro')),
  darf_gerado           INTEGER NOT NULL DEFAULT 0,
  darf_codigo           TEXT,
  darf_vencimento       TEXT,
  darf_valor            REAL,
  darf_pago             INTEGER NOT NULL DEFAULT 0,
  observacoes           TEXT,
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_empresa) REFERENCES perdcomp_empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dctfweb_tributos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  id_declaracao         INTEGER NOT NULL,
  codigo_receita        TEXT    NOT NULL,
  descricao             TEXT,
  valor_principal       REAL    NOT NULL DEFAULT 0,
  valor_multa           REAL    NOT NULL DEFAULT 0,
  valor_juros           REAL    NOT NULL DEFAULT 0,
  valor_total           REAL    NOT NULL DEFAULT 0,
  compensado            REAL    NOT NULL DEFAULT 0,
  suspenso              REAL    NOT NULL DEFAULT 0,
  saldo                 REAL    NOT NULL DEFAULT 0,
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_declaracao) REFERENCES dctfweb_declaracoes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dctfweb_empresa ON dctfweb_declaracoes(id_empresa);
CREATE INDEX IF NOT EXISTS idx_dctfweb_periodo ON dctfweb_declaracoes(periodo_apuracao);
CREATE INDEX IF NOT EXISTS idx_dctfweb_situacao ON dctfweb_declaracoes(situacao);
CREATE INDEX IF NOT EXISTS idx_dctfweb_tributos_decl ON dctfweb_tributos(id_declaracao);
