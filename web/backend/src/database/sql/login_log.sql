-- Table: public.login_log

-- DROP TABLE IF EXISTS public.login_log;

CREATE TABLE IF NOT EXISTS public.login_log
(
    id integer NOT NULL DEFAULT nextval('login_log_id_seq'::regclass),
    usuario_id integer,
    email_tentativa text COLLATE pg_catalog."default" NOT NULL,
    sucesso boolean NOT NULL,
    ip_address inet,
    user_agent text COLLATE pg_catalog."default",
    motivo_falha text COLLATE pg_catalog."default",
    "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT login_log_pkey PRIMARY KEY (id),
    CONSTRAINT login_log_usuario_id_fkey FOREIGN KEY (usuario_id)
        REFERENCES public.usuarios (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.login_log
    OWNER to postgres;

GRANT ALL ON TABLE public.login_log TO anon;

GRANT ALL ON TABLE public.login_log TO authenticated;

GRANT ALL ON TABLE public.login_log TO postgres;

GRANT ALL ON TABLE public.login_log TO service_role;
-- Index: idx_login_log_sucesso

-- DROP INDEX IF EXISTS public.idx_login_log_sucesso;

CREATE INDEX IF NOT EXISTS idx_login_log_sucesso
    ON public.login_log USING btree
    (sucesso ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_login_log_timestamp

-- DROP INDEX IF EXISTS public.idx_login_log_timestamp;

CREATE INDEX IF NOT EXISTS idx_login_log_timestamp
    ON public.login_log USING btree
    ("timestamp" DESC NULLS FIRST)
    TABLESPACE pg_default;
-- Index: idx_login_log_usuario_id

-- DROP INDEX IF EXISTS public.idx_login_log_usuario_id;

CREATE INDEX IF NOT EXISTS idx_login_log_usuario_id
    ON public.login_log USING btree
    (usuario_id ASC NULLS LAST)
    TABLESPACE pg_default;