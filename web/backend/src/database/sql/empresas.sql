-- Table: public.empresas

-- DROP TABLE IF EXISTS public.empresas;

CREATE TABLE IF NOT EXISTS public.empresas
(
    id integer NOT NULL DEFAULT nextval('empresas_id_seq'::regclass),
    usuario_responsavel_id integer NOT NULL,
    cliente_id integer NOT NULL,
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
    CONSTRAINT empresas_pkey PRIMARY KEY (id),
    CONSTRAINT empresas_cnpj_key UNIQUE (cnpj),
    CONSTRAINT empresas_cliente_id_fkey FOREIGN KEY (cliente_id)
        REFERENCES public.clientes (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT empresas_usuario_responsavel_id_fkey FOREIGN KEY (usuario_responsavel_id)
        REFERENCES public.usuarios (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT empresas_ativo_check CHECK (ativo = ANY (ARRAY[1, 0])),
    CONSTRAINT empresas_matriz_check CHECK (matriz = ANY (ARRAY['S'::bpchar, 'N'::bpchar])),
    CONSTRAINT empresas_regime_tributario_check CHECK (regime_tributario = ANY (ARRAY['Simples Nacional'::text, 'Lucro Presumido'::text, 'Lucro Real'::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.empresas
    OWNER to postgres;

GRANT ALL ON TABLE public.empresas TO anon;

GRANT ALL ON TABLE public.empresas TO authenticated;

GRANT ALL ON TABLE public.empresas TO postgres;

GRANT ALL ON TABLE public.empresas TO service_role;