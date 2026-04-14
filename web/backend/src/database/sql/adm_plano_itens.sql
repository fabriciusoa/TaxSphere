-- Table: public.adm_plano_itens

-- DROP TABLE IF EXISTS public.adm_plano_itens;

CREATE TABLE IF NOT EXISTS public.adm_plano_itens
(
    id integer NOT NULL DEFAULT nextval('adm_plano_itens_id_seq'::regclass),
    id_adm_plano integer NOT NULL,
    descricao text COLLATE pg_catalog."default" NOT NULL,
    ativo boolean NOT NULL DEFAULT true,
    dt_inclusao timestamp with time zone NOT NULL DEFAULT now(),
    dt_exclusao timestamp with time zone,
    CONSTRAINT adm_plano_itens_pkey PRIMARY KEY (id),
    CONSTRAINT adm_plano_itens_id_adm_plano_fkey FOREIGN KEY (id_adm_plano)
        REFERENCES public.adm_planos (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.adm_plano_itens
    OWNER to postgres;

GRANT ALL ON TABLE public.adm_plano_itens TO anon;

GRANT ALL ON TABLE public.adm_plano_itens TO authenticated;

GRANT ALL ON TABLE public.adm_plano_itens TO postgres;

GRANT ALL ON TABLE public.adm_plano_itens TO service_role;
-- Index: idx_adm_plano_itens_plano

-- DROP INDEX IF EXISTS public.idx_adm_plano_itens_plano;

CREATE INDEX IF NOT EXISTS idx_adm_plano_itens_plano
    ON public.adm_plano_itens USING btree
    (id_adm_plano ASC NULLS LAST)
    TABLESPACE pg_default;