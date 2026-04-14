-- Table: public.chamado_comentario

-- DROP TABLE IF EXISTS public.chamado_comentario;

CREATE TABLE IF NOT EXISTS public.chamado_comentario
(
    id integer NOT NULL DEFAULT nextval('chamado_comentario_id_seq'::regclass),
    id_chamado integer NOT NULL,
    usuario_id integer NOT NULL,
    comentario text COLLATE pg_catalog."default" NOT NULL,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chamado_comentario_pkey PRIMARY KEY (id),
    CONSTRAINT chamado_comentario_id_chamado_fkey FOREIGN KEY (id_chamado)
        REFERENCES public.chamado (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT chamado_comentario_usuario_id_fkey FOREIGN KEY (usuario_id)
        REFERENCES public.usuarios (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.chamado_comentario
    OWNER to postgres;

GRANT ALL ON TABLE public.chamado_comentario TO anon;

GRANT ALL ON TABLE public.chamado_comentario TO authenticated;

GRANT ALL ON TABLE public.chamado_comentario TO postgres;

GRANT ALL ON TABLE public.chamado_comentario TO service_role;
-- Index: idx_chamado_comentario_chamado

-- DROP INDEX IF EXISTS public.idx_chamado_comentario_chamado;

CREATE INDEX IF NOT EXISTS idx_chamado_comentario_chamado
    ON public.chamado_comentario USING btree
    (id_chamado ASC NULLS LAST)
    TABLESPACE pg_default;