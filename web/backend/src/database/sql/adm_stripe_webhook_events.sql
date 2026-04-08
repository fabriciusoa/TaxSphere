CREATE TABLE adm_stripe_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  processado_em TEXT NOT NULL,
  resultado TEXT NOT NULL, -- 'success', 'error', 'ignored', 'not_found', etc
  erro TEXT,
  CONSTRAINT chk_processado_em CHECK (processado_em IS datetime(processado_em))
);

CREATE INDEX idx_adm_stripe_webhook_events_stripe_event_id ON adm_stripe_webhook_events(stripe_event_id);
CREATE INDEX idx_adm_stripe_webhook_events_tipo ON adm_stripe_webhook_events(tipo);
CREATE INDEX idx_adm_stripe_webhook_events_processado_em ON adm_stripe_webhook_events(processado_em DESC);
