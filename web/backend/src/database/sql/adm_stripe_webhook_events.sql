CREATE TABLE adm_stripe_webhook_events (
    id                  SERIAL      PRIMARY KEY,
    stripe_event_id     TEXT        NOT NULL UNIQUE,
    tipo                TEXT        NOT NULL,
    processado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resultado           TEXT        NOT NULL,
    erro                TEXT,

    CONSTRAINT chk_webhook_resultado
        CHECK (resultado IN ('success', 'error', 'ignored', 'not_found'))
);

CREATE INDEX idx_stripe_webhook_event_id   ON adm_stripe_webhook_events(stripe_event_id);
CREATE INDEX idx_stripe_webhook_tipo       ON adm_stripe_webhook_events(tipo);
CREATE INDEX idx_stripe_webhook_processado ON adm_stripe_webhook_events(processado_em DESC);