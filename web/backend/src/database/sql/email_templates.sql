-- Table: public.email_templates

-- DROP TABLE IF EXISTS public.email_templates;

CREATE TABLE IF NOT EXISTS public.email_templates
(
    id integer NOT NULL DEFAULT nextval('email_templates_id_seq'::regclass),
    id_usuario integer,
    assunto_confirmacao text COLLATE pg_catalog."default",
    template_texto_confirmacao text COLLATE pg_catalog."default",
    assunto_lembrete text COLLATE pg_catalog."default",
    template_texto_lembrete text COLLATE pg_catalog."default",
    assinatura text COLLATE pg_catalog."default",
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone,
    CONSTRAINT email_templates_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.email_templates
    OWNER to postgres;

GRANT ALL ON TABLE public.email_templates TO anon;

GRANT ALL ON TABLE public.email_templates TO authenticated;

GRANT ALL ON TABLE public.email_templates TO postgres;

GRANT ALL ON TABLE public.email_templates TO service_role;