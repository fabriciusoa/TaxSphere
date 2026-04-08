CREATE TABLE adm_stripe_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dt_criacao DATETIME DEFAULT (datetime('now')),
  id_assinatura INTEGER,
  evento_tipo TEXT NOT NULL,
  -- Tipos: 'setup_intent_created', 'setup_intent_confirmed', 'subscription_created', 
  --        'subscription_updated', 'subscription_deleted', 'payment_succeeded', 
  --        'payment_failed', 'customer_deleted', 'webhook_received', 'reconciliation'
  
  stripe_objeto_tipo TEXT,
  -- Ex: 'setup_intent', 'subscription', 'invoice', 'customer'
  
  stripe_objeto_id TEXT,
  -- Ex: 'seti_xxx', 'sub_xxx', 'in_xxx', 'cus_xxx'
  
  acao TEXT NOT NULL,
  -- Ex: 'create', 'update', 'delete', 'confirm', 'attach', 'cancel'
  
  status TEXT,
  -- 'success', 'failed', 'pending'
  
  dados_request TEXT,
  -- JSON com dados enviados ao Stripe
  
  dados_response TEXT,
  -- JSON com resposta do Stripe ou erro
  
  erro_mensagem TEXT,
  -- Mensagem de erro se status='failed'
  
  usuario_id INTEGER,
  -- ID do usuário que iniciou ação (NULL para webhooks/cron)
  
  ip_origem TEXT,
  -- IP de origem da requisição (NULL para backend jobs)
  
  metadata TEXT
  -- JSON com informações adicionais contextuais
);

CREATE INDEX idx_audit_assinatura ON adm_stripe_audit_log(id_assinatura);
CREATE INDEX idx_audit_dt_criacao ON adm_stripe_audit_log(dt_criacao);
CREATE INDEX idx_audit_evento_tipo ON adm_stripe_audit_log(evento_tipo);
CREATE INDEX idx_audit_stripe_objeto ON adm_stripe_audit_log(stripe_objeto_id);
CREATE INDEX idx_audit_status ON adm_stripe_audit_log(status);