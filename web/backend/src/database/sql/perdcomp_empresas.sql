CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_responsavel_id INTEGER NOT NULL,
  cliente_id  INTEGER NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  matriz char(1) NOT NULL DEFAULT 'S' CHECK(matriz IN ('S', 'N')),
  regime_tributario TEXT NOT NULL DEFAULT 'Lucro Real' CHECK(regime_tributario IN ('Simples Nacional', 'Lucro Presumido', 'Lucro Real')),
    endereco        TEXT,
    numero          TEXT,
    complemento     TEXT,
    bairro          TEXT,
    municipio       TEXT,
    uf              CHAR(2),
    cep             TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (1,0)),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  FOREIGN KEY (usuario_responsavel_id) REFERENCES usuarios(id)
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
