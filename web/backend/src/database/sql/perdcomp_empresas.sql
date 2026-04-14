CREATE TABLE IF NOT EXISTS perdcomp_empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario_responsavel INTEGER NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  regime_tributario TEXT NOT NULL DEFAULT 'Lucro Real' CHECK(regime_tributario IN ('Simples Nacional', 'Lucro Presumido', 'Lucro Real')),
  uf TEXT,
  municipio TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_usuario_responsavel) REFERENCES usuarios(id)
);
