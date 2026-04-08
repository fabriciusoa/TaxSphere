CREATE TABLE chamado_comentario (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	id_chamado INTEGER,
	id_usuario INTEGER,
	comentario TEXT,
	criado_em DATETIME
);