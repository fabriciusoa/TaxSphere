CREATE TABLE login_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    email_tentativa TEXT NOT NULL,
    sucesso TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    motivo_falha TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_login_log_timestamp ON login_log(timestamp);
CREATE INDEX idx_login_log_usuario_id ON login_log(usuario_id);
CREATE INDEX idx_login_log_sucesso ON login_log(sucesso);