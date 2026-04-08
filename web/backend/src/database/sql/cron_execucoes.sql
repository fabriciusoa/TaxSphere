CREATE TABLE cron_execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_job TEXT,
  executado_em DATETIME,
  status TEXT,
  registros_processados INTEGER,
  erro TEXT,
  duracao_ms INTEGER,
  sucesso INTEGER
);