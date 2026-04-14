-- Table: public.parametros

-- DROP TABLE IF EXISTS public.parametros;

CREATE TABLE IF NOT EXISTS public.parametros
(
    id integer NOT NULL DEFAULT nextval('parametros_id_seq'::regclass),
    chave text COLLATE pg_catalog."default" NOT NULL,
    valor text COLLATE pg_catalog."default" NOT NULL,
    descricao text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT parametros_pkey PRIMARY KEY (id),
    CONSTRAINT parametros_chave_key UNIQUE (chave)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.parametros
    OWNER to postgres;

GRANT ALL ON TABLE public.parametros TO anon;

GRANT ALL ON TABLE public.parametros TO authenticated;

GRANT ALL ON TABLE public.parametros TO postgres;

GRANT ALL ON TABLE public.parametros TO service_role;
-- Index: idx_parametros_chave

-- DROP INDEX IF EXISTS public.idx_parametros_chave;

CREATE INDEX IF NOT EXISTS idx_parametros_chave
    ON public.parametros USING btree
    (chave COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;