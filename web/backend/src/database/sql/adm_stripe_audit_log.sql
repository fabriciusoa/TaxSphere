CREATE TABLE adm_stripe_audit_log (
    id                  SERIAL      PRIMARY KEY,
    dt_criacao          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id_assinatura       INTEGER     REFERENCES adm_assinatura(id),
    evento_tipo         TEXT        NOT NULL,
    stripe_objeto_tipo  TEXT,
    stripe_objeto_id    TEXT,
    acao                TEXT        NOT NULL,
    status              TEXT,
    dados_request       JSONB,
    dados_response      JSONB,
    erro_mensagem       TEXT,
    usuario_id          INTEGER,
    ip_origem           INET,
    metadata            JSONB,

    CONSTRAINT chk_audit_status CHECK (status IN ('success', 'failed', 'pending'))
);

CREATE INDEX idx_audit_assinatura     ON adm_stripe_audit_log(id_assinatura);
CREATE INDEX idx_audit_dt_criacao     ON adm_stripe_audit_log(dt_criacao DESC);
CREATE INDEX idx_audit_evento_tipo    ON adm_stripe_audit_log(evento_tipo);
CREATE INDEX idx_audit_stripe_objeto  ON adm_stripe_audit_log(stripe_objeto_id);
CREATE INDEX idx_audit_status         ON adm_stripe_audit_log(status);