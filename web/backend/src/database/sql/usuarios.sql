CREATE TABLE usuarios (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT,
	cpf TEXT,
	nome TEXT,
	senha TEXT,
	perfil INTEGER,
	status TEXT,
	criado DATETIME,
	dt_inativacao DATETIME,
	dt_nascimento DATETIME,
	dt_ativacao DATETIME,
	ultimo_login DATETIME,
	tentativas_login INTEGER DEFAULT 0,
	dt_bloqueio DATETIME
);