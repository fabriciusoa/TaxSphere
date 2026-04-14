-- Table: public.chamados_anexos

-- DROP TABLE IF EXISTS public.chamados_anexos;

CREATE TABLE IF NOT EXISTS public.chamados_anexos
(
    id integer NOT NULL DEFAULT nextval('chamados_anexos_id_seq'::regclass),
    chamado_comentario_id integer NOT NULL,
    anexo bytea,
    anexo_thumbnail bytea,
    nome_arquivo text COLLATE pg_catalog."default" NOT NULL,
    tipo_arquivo text COLLATE pg_catalog."default",
    tamanho_bytes integer,
    CONSTRAINT chamados_anexos_pkey PRIMARY KEY (id),
    CONSTRAINT chamados_anexos_chamado_comentario_id_fkey FOREIGN KEY (chamado_comentario_id)
        REFERENCES public.chamado_comentario (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT chamados_anexos_tamanho_bytes_check CHECK (tamanho_bytes > 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.chamados_anexos
    OWNER to postgres;

GRANT ALL ON TABLE public.chamados_anexos TO anon;

GRANT ALL ON TABLE public.chamados_anexos TO authenticated;

GRANT ALL ON TABLE public.chamados_anexos TO postgres;

GRANT ALL ON TABLE public.chamados_anexos TO service_role;
-- Index: idx_chamados_anexos_comentario

-- DROP INDEX IF EXISTS public.idx_chamados_anexos_comentario;

CREATE INDEX IF NOT EXISTS idx_chamados_anexos_comentario
    ON public.chamados_anexos USING btree
    (chamado_comentario_id ASC NULLS LAST)
    TABLESPACE pg_default;