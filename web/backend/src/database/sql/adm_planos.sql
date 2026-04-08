CREATE TABLE adm_planos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	descricao TEXT,
	valor REAL,
	dt_inclusao DATETIME,
	dt_alteracao DATETIME,
	ativo TEXT,
	id_product_stripe TEXT,
	id_price_stripe TEXT
);