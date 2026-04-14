-- Table: public.adm_planos

-- DROP TABLE IF EXISTS public.adm_planos;

CREATE TABLE IF NOT EXISTS public.adm_planos
(
    id integer NOT NULL DEFAULT nextval('adm_planos_id_seq'::regclass),
    descricao text COLLATE pg_catalog."default" NOT NULL,
    valor_mes numeric(10,2) NOT NULL,
    valor_ano numeric(10,2) NOT NULL,
    vl_desconto numeric(10,2) NOT NULL,
    dt_inclusao timestamp with time zone NOT NULL DEFAULT now(),
    dt_alteracao timestamp with time zone,
    ativo boolean NOT NULL DEFAULT true,
    id_product_stripe text COLLATE pg_catalog."default",
    id_price_stripe text COLLATE pg_catalog."default",
    CONSTRAINT adm_planos_pkey PRIMARY KEY (id),
    CONSTRAINT adm_planos_valor_ano_check CHECK (valor_ano >= 0::numeric),
    CONSTRAINT adm_planos_valor_mes_check CHECK (valor_mes >= 0::numeric),
    CONSTRAINT adm_planos_vl_desconto_check CHECK (vl_desconto >= 0::numeric)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.adm_planos
    OWNER to postgres;

GRANT ALL ON TABLE public.adm_planos TO anon;

GRANT ALL ON TABLE public.adm_planos TO authenticated;

GRANT ALL ON TABLE public.adm_planos TO postgres;

GRANT ALL ON TABLE public.adm_planos TO service_role;