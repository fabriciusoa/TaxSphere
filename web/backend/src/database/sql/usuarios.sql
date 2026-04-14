-- Table: public.usuarios

-- DROP TABLE IF EXISTS public.usuarios;

CREATE TABLE IF NOT EXISTS public.usuarios
(
    id integer NOT NULL DEFAULT nextval('usuarios_id_seq'::regclass),
    email text COLLATE pg_catalog."default" NOT NULL,
    cpf text COLLATE pg_catalog."default",
    nome text COLLATE pg_catalog."default" NOT NULL,
    senha text COLLATE pg_catalog."default" NOT NULL,
    perfil integer,
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'Ativo'::text,
    criado timestamp with time zone NOT NULL DEFAULT now(),
    dt_inativacao timestamp with time zone,
    dt_nascimento date,
    dt_ativacao timestamp with time zone,
    ultimo_login timestamp with time zone,
    tentativas_login smallint NOT NULL DEFAULT 0,
    dt_bloqueio timestamp with time zone,
    cliente_id integer NOT NULL,
    CONSTRAINT usuarios_pkey PRIMARY KEY (id),
    CONSTRAINT usuarios_cpf_key UNIQUE (cpf),
    CONSTRAINT usuarios_email_key UNIQUE (email),
    CONSTRAINT usuarios_clientes_fkey FOREIGN KEY (cliente_id)
        REFERENCES public.clientes (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT usuarios_perfil_fkey FOREIGN KEY (perfil)
        REFERENCES public.perfil (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT chk_usuarios_status CHECK (status = ANY (ARRAY['Ativo'::text, 'Inativo'::text, 'Bloqueado'::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.usuarios
    OWNER to postgres;

GRANT ALL ON TABLE public.usuarios TO anon;

GRANT ALL ON TABLE public.usuarios TO authenticated;

GRANT ALL ON TABLE public.usuarios TO postgres;

GRANT ALL ON TABLE public.usuarios TO service_role;
-- Index: fki_usuarios_clientes_fkey

-- DROP INDEX IF EXISTS public.fki_usuarios_clientes_fkey;

CREATE INDEX IF NOT EXISTS fki_usuarios_clientes_fkey
    ON public.usuarios USING btree
    (cliente_id ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_usuarios_email

-- DROP INDEX IF EXISTS public.idx_usuarios_email;

CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON public.usuarios USING btree
    (email COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_usuarios_status

-- DROP INDEX IF EXISTS public.idx_usuarios_status;

CREATE INDEX IF NOT EXISTS idx_usuarios_status
    ON public.usuarios USING btree
    (status COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;