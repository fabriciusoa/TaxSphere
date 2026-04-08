CREATE TABLE email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario INTEGER,
  assunto_confirmacao TEXT,
  template_texto_confirmacao TEXT,
  assunto_lembrete TEXT,
  template_texto_lembrete TEXT,
  assinatura TEXT,
  criado_em DATETIME,
  atualizado_em DATETIME  
);