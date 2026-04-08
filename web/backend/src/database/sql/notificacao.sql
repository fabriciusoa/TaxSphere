CREATE TABLE notificacao
(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario INTEGER,  
  tipo_notificacao TEXT,
  status TEXT DEFAULT 'Pendente',
  destinatario TEXT,
  assunto TEXT,
  mensagem TEXT,
  enviado_em DATETIME,
  entregue_em DATETIME,
  erro_falha TEXT,
  id_externo TEXT,
  contador_tentativas INTEGER DEFAULT 0,
  maximo_tentativas INTEGER DEFAULT 3,
  criado_em DATETIME,
  atualizado_em DATETIME,
  id_agendamento INTEGER,
  tipo TEXT,
  id_paciente INTEGER
);

CREATE INDEX idx_notificacao_status ON notificacao(status, contador_tentativas);
CREATE INDEX idx_notificacao_usuario ON notificacao(id_usuario);
CREATE INDEX idx_notificacao_fila ON notificacao(status, contador_tentativas, enviado_em);
CREATE INDEX idx_notificacao_agendamento ON notificacao(id_agendamento);