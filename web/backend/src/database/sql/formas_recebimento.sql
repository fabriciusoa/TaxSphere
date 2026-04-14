-- Table: public.formas_recebimento

-- DROP TABLE IF EXISTS public.formas_recebimento;

CREATE TABLE IF NOT EXISTS public.formas_recebimento
(
    id integer NOT NULL DEFAULT nextval('formas_recebimento_id_seq'::regclass),
    descricao text COLLATE pg_catalog."default" NOT NULL,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone,
    CONSTRAINT formas_recebimento_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.formas_recebimento
    OWNER to postgres;

GRANT ALL ON TABLE public.formas_recebimento TO anon;

GRANT ALL ON TABLE public.formas_recebimento TO authenticated;

GRANT ALL ON TABLE public.formas_recebimento TO postgres;

GRANT ALL ON TABLE public.formas_recebimento TO service_role;