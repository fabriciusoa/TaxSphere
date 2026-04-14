-- Table: public.perfil

-- DROP TABLE IF EXISTS public.perfil;

CREATE TABLE IF NOT EXISTS public.perfil
(
    id integer NOT NULL DEFAULT nextval('perfil_id_seq'::regclass),
    perfil text COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT perfil_pkey PRIMARY KEY (id),
    CONSTRAINT perfil_perfil_key UNIQUE (perfil)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.perfil
    OWNER to postgres;

GRANT ALL ON TABLE public.perfil TO anon;

GRANT ALL ON TABLE public.perfil TO authenticated;

GRANT ALL ON TABLE public.perfil TO postgres;

GRANT ALL ON TABLE public.perfil TO service_role;