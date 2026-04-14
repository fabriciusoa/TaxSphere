-- Table: public.cron_execucoes

-- DROP TABLE IF EXISTS public.cron_execucoes;

CREATE TABLE IF NOT EXISTS public.cron_execucoes
(
    id integer NOT NULL DEFAULT nextval('cron_execucoes_id_seq'::regclass),
    nome_job text COLLATE pg_catalog."default" NOT NULL,
    executado_em timestamp with time zone NOT NULL DEFAULT now(),
    status text COLLATE pg_catalog."default" NOT NULL,
    registros_processados integer DEFAULT 0,
    erro text COLLATE pg_catalog."default",
    duracao_ms integer,
    sucesso boolean NOT NULL,
    CONSTRAINT cron_execucoes_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.cron_execucoes
    OWNER to postgres;

GRANT ALL ON TABLE public.cron_execucoes TO anon;

GRANT ALL ON TABLE public.cron_execucoes TO authenticated;

GRANT ALL ON TABLE public.cron_execucoes TO postgres;

GRANT ALL ON TABLE public.cron_execucoes TO service_role;
-- Index: idx_cron_execucoes_data

-- DROP INDEX IF EXISTS public.idx_cron_execucoes_data;

CREATE INDEX IF NOT EXISTS idx_cron_execucoes_data
    ON public.cron_execucoes USING btree
    (executado_em DESC NULLS FIRST)
    TABLESPACE pg_default;
-- Index: idx_cron_execucoes_job

-- DROP INDEX IF EXISTS public.idx_cron_execucoes_job;

CREATE INDEX IF NOT EXISTS idx_cron_execucoes_job
    ON public.cron_execucoes USING btree
    (nome_job COLLATE pg_catalog."default" ASC NULLS LAST, executado_em DESC NULLS FIRST)
    TABLESPACE pg_default;