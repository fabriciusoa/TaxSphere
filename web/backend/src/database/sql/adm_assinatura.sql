CREATE TABLE adm_assinatura (
    id                          SERIAL      PRIMARY KEY,
    nome                        TEXT        NOT NULL,
    email                       TEXT        NOT NULL UNIQUE,
    cpf                         TEXT        UNIQUE,
    id_adm_plano                INTEGER     REFERENCES adm_planos(id),
    dt_criacao                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dt_excluido                 TIMESTAMPTZ,
    status                      TEXT        NOT NULL DEFAULT 'ativo',
    dt_nascimento               DATE,
    dt_demonstracao             TIMESTAMPTZ,
    dt_bloqueio                 TIMESTAMPTZ,
    cep                         TEXT,
    telefone                    TEXT,
    endereco                    TEXT,
    numero                      TEXT,
    complemento                 TEXT,
    bairro                      TEXT,
    cidade                      TEXT,
    uf                          CHAR(2),
    stripe_customer_id          TEXT        UNIQUE,
    stripe_subscription_id      TEXT        UNIQUE,
    stripe_payment_method_id    TEXT,

    CONSTRAINT chk_adm_assinatura_status
        CHECK (status IN ('ativo', 'inativo', 'demonstracao', 'bloqueado', 'cancelado'))
);


CREATE INDEX idx_adm_assinatura_plano  ON adm_assinatura(id_adm_plano);
CREATE INDEX idx_adm_assinatura_status ON adm_assinatura(status);