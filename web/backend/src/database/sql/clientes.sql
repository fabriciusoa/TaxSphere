-- Table: public.clientes

-- DROP TABLE IF EXISTS public.clientes;

CREATE TABLE IF NOT EXISTS public.clientes
(
    id integer NOT NULL DEFAULT nextval('clientes_id_seq'::regclass),
    cnpj text COLLATE pg_catalog."default" NOT NULL,
    razao_social text COLLATE pg_catalog."default" NOT NULL,
    nome_fantasia text COLLATE pg_catalog."default",
    inscricao_estadual text COLLATE pg_catalog."default",
    matriz character(1) COLLATE pg_catalog."default" NOT NULL DEFAULT 'S'::bpchar,
    regime_tributario text COLLATE pg_catalog."default" NOT NULL DEFAULT 'Lucro Real'::text,
    endereco text COLLATE pg_catalog."default",
    numero text COLLATE pg_catalog."default",
    complemento text COLLATE pg_catalog."default",
    bairro text COLLATE pg_catalog."default",
    municipio text COLLATE pg_catalog."default",
    uf character(2) COLLATE pg_catalog."default",
    cep text COLLATE pg_catalog."default",
    ativo integer NOT NULL DEFAULT 1,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT clientes_pkey PRIMARY KEY (id),
    CONSTRAINT clientes_cnpj_key UNIQUE (cnpj),
    CONSTRAINT clientes_ativo_check CHECK (ativo = ANY (ARRAY[1, 0])),
    CONSTRAINT clientes_matriz_check CHECK (matriz = ANY (ARRAY['S'::bpchar, 'N'::bpchar])),
    CONSTRAINT clientes_regime_tributario_check CHECK (regime_tributario = ANY (ARRAY['Simples Nacional'::text, 'Lucro Presumido'::text, 'Lucro Real'::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.clientes
    OWNER to postgres;

GRANT ALL ON TABLE public.clientes TO anon;

GRANT ALL ON TABLE public.clientes TO authenticated;

GRANT ALL ON TABLE public.clientes TO postgres;

GRANT ALL ON TABLE public.clientes TO service_role;