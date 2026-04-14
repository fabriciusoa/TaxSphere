
CREATE TABLE usuario_medico (
    id              SERIAL      PRIMARY KEY,
    id_usuario      INTEGER     NOT NULL UNIQUE REFERENCES usuarios(id),
    inscricao       TEXT,
    endereco        TEXT,
    numero          TEXT,
    complemento     TEXT,
    bairro          TEXT,
    cidade          TEXT,
    uf              CHAR(2),
    cep             TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ,
    nacionalidade   TEXT,
    estado_civil    TEXT,
    telefone        TEXT,
    logo            BYTEA,
    assinatura      BYTEA,
    especialidade   INTEGER     REFERENCES especialidade(id),
    tempo_sessao    SMALLINT
);

-- ============================================================
-- 9. NOTIFICAÇÕES
-- ============================================================

CREATE TABLE notificacao (
    id                      SERIAL      PRIMARY KEY,
    id_usuario              INTEGER     NOT NULL REFERENCES usuarios(id),
    tipo_notificacao        TEXT,
    status                  TEXT        NOT NULL DEFAULT 'Pendente',
    destinatario            TEXT,
    assunto                 TEXT,
    mensagem                TEXT,
    enviado_em              TIMESTAMPTZ,
    entregue_em             TIMESTAMPTZ,
    erro_falha              TEXT,
    id_externo              TEXT,
    contador_tentativas     SMALLINT    NOT NULL DEFAULT 0,
    maximo_tentativas       SMALLINT    NOT NULL DEFAULT 3,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ,
    id_agendamento          INTEGER     REFERENCES agendamento(id),
    tipo                    TEXT,
    id_paciente             INTEGER     REFERENCES paciente(id),

    CONSTRAINT chk_notificacao_tentativas
        CHECK (contador_tentativas <= maximo_tentativas)
);

CREATE INDEX idx_notificacao_fila        ON notificacao(status, contador_tentativas, enviado_em)
    WHERE status = 'Pendente';
CREATE INDEX idx_notificacao_usuario     ON notificacao(id_usuario);
CREATE INDEX idx_notificacao_agendamento ON notificacao(id_agendamento);


