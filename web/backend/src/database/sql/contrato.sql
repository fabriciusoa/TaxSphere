-- Table: public.contrato

-- DROP TABLE IF EXISTS public.contrato;

CREATE TABLE IF NOT EXISTS public.contrato
(
    id integer NOT NULL DEFAULT nextval('contrato_id_seq'::regclass),
    cliente_id integer NOT NULL,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone,
    excluido_em timestamp with time zone,
    dt_emissao timestamp with time zone,
    dt_assinatura timestamp with time zone,
    contrato_assinado bytea,
    CONSTRAINT contrato_pkey PRIMARY KEY (id),
    CONSTRAINT contrato_cliente_id_fkey FOREIGN KEY (cliente_id)
        REFERENCES public.clientes (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.contrato
    OWNER to postgres;

GRANT ALL ON TABLE public.contrato TO anon;

GRANT ALL ON TABLE public.contrato TO authenticated;

GRANT ALL ON TABLE public.contrato TO postgres;

GRANT ALL ON TABLE public.contrato TO service_role;
-- Index: idx_contrato_usuario

-- DROP INDEX IF EXISTS public.idx_contrato_usuario;

CREATE INDEX IF NOT EXISTS idx_contrato_usuario
    ON public.contrato USING btree
    (cliente_id ASC NULLS LAST)
    TABLESPACE pg_default;