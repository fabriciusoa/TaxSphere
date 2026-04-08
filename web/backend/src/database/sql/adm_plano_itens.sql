CREATE TABLE adm_plano_itens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	id_adm_plano INTEGER,
	descricao TEXT,
	ativo TEXT,
	dt_inclusao DATETIME,
	dt_exclusao DATETIME
);
