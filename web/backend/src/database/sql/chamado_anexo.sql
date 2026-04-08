CREATE TABLE chamados_anexos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	id_chamado_comentario INTEGER,
	anexo BLOB,
	anexo_thumbnail BLOB,
	nome_arquivo TEXT,
	tipo_arquivo TEXT,
	tamanho_bytes INTEGER
);