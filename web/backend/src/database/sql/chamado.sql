-- Table: public.chamado

-- DROP TABLE IF EXISTS public.chamado;

CREATE TABLE IF NOT EXISTS public.chamado
(
    id integer NOT NULL DEFAULT nextval('chamado_id_seq'::regclass),
    usuario_id integer NOT NULL,
    titulo text COLLATE pg_catalog."default" NOT NULL,
    descricao text COLLATE pg_catalog."default",
    categoria text COLLATE pg_catalog."default",
    prioridade text COLLATE pg_catalog."default" NOT NULL,
    status text COLLATE pg_catalog."default" NOT NULL,
    usuario_atribuido_id integer,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone,
    fechado_em timestamp with time zone,
    CONSTRAINT chamado_pkey PRIMARY KEY (id),
    CONSTRAINT chamado_usuario_atribuido_id_fkey FOREIGN KEY (usuario_atribuido_id)
        REFERENCES public.usuarios (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT chamado_usuario_id_fkey FOREIGN KEY (usuario_id)
        REFERENCES public.usuarios (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT chk_chamado_prioridade CHECK (prioridade = ANY (ARRAY['baixa'::text, 'normal'::text, 'alta'::text, 'urgente'::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.chamado
    OWNER to postgres;

GRANT ALL ON TABLE public.chamado TO anon;

GRANT ALL ON TABLE public.chamado TO authenticated;

GRANT ALL ON TABLE public.chamado TO postgres;

GRANT ALL ON TABLE public.chamado TO service_role;
-- Index: idx_chamado_atribuido

-- DROP INDEX IF EXISTS public.idx_chamado_atribuido;

CREATE INDEX IF NOT EXISTS idx_chamado_atribuido
    ON public.chamado USING btree
    (usuario_atribuido_id ASC NULLS LAST)
    TABLESPACE pg_default
    WHERE usuario_atribuido_id IS NOT NULL;
-- Index: idx_chamado_status

-- DROP INDEX IF EXISTS public.idx_chamado_status;

CREATE INDEX IF NOT EXISTS idx_chamado_status
    ON public.chamado USING btree
    (status COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_chamado_usuario

-- DROP INDEX IF EXISTS public.idx_chamado_usuario;

CREATE INDEX IF NOT EXISTS idx_chamado_usuario
    ON public.chamado USING btree
    (usuario_id ASC NULLS LAST, status COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;