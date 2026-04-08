CREATE TABLE chamado (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	id_usuario INTEGER,
	titulo TEXT,
	descricao TEXT,
	categoria TEXT,
	prioridade TEXT,
	status TEXT,
	id_usuario_atribuido INTEGER,
	criado_em DATETIME,
	atualizado_em DATETIME,
	fechado_em DATETIME
);