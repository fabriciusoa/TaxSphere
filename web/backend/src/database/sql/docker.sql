begin;

-- Habilita geração de UUIDs caso queira migrar PKs futuramente
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--
-- PostgreSQL database dump
--



-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3

-- Started on 2026-04-25 19:59:22 UTC

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16657)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 3730 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 233 (class 1259 OID 16795)
-- Name: adm_clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_clientes (
    id integer NOT NULL,
    cnpj text NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    inscricao_estadual text,
    matriz character(1) DEFAULT 'S'::bpchar NOT NULL,
    regime_tributario text DEFAULT 'Lucro Real'::text NOT NULL,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    municipio text,
    uf character(2),
    cep text,
    ativo integer DEFAULT 1 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clientes_ativo_check CHECK ((ativo = ANY (ARRAY[1, 0]))),
    CONSTRAINT clientes_matriz_check CHECK ((matriz = ANY (ARRAY['S'::bpchar, 'N'::bpchar]))),
    CONSTRAINT clientes_regime_tributario_check CHECK ((regime_tributario = ANY (ARRAY['Simples Nacional'::text, 'Lucro Presumido'::text, 'Lucro Real'::text])))
);


--
-- TOC entry 232 (class 1259 OID 16794)
-- Name: adm_clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3731 (class 0 OID 0)
-- Dependencies: 232
-- Name: adm_clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_clientes_id_seq OWNED BY public.adm_clientes.id;


--
-- TOC entry 235 (class 1259 OID 16822)
-- Name: adm_contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_contrato (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone,
    excluido_em timestamp with time zone,
    dt_emissao timestamp with time zone,
    dt_assinatura timestamp with time zone,
    contrato_assinado bytea
);


--
-- TOC entry 234 (class 1259 OID 16821)
-- Name: adm_contrato_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_contrato_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3732 (class 0 OID 0)
-- Dependencies: 234
-- Name: adm_contrato_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_contrato_id_seq OWNED BY public.adm_contrato.id;


--
-- TOC entry 245 (class 1259 OID 16960)
-- Name: adm_empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_empresas (
    id integer NOT NULL,
    usuario_responsavel_id integer NOT NULL,
    cliente_id integer NOT NULL,
    cnpj text NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    inscricao_estadual text,
    matriz character(1) DEFAULT 'S'::bpchar NOT NULL,
    regime_tributario text DEFAULT 'Lucro Real'::text NOT NULL,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    municipio text,
    uf character(2),
    cep text,
    ativo integer DEFAULT 1 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    cnae integer,
    inscricao_municipal text,
    certificado_id integer,
    CONSTRAINT empresas_ativo_check CHECK ((ativo = ANY (ARRAY[1, 0]))),
    CONSTRAINT empresas_matriz_check CHECK ((matriz = ANY (ARRAY['S'::bpchar, 'N'::bpchar]))),
    CONSTRAINT empresas_regime_tributario_check CHECK ((regime_tributario = ANY (ARRAY['Simples Nacional'::text, 'Lucro Presumido'::text, 'Lucro Real'::text])))
);


--
-- TOC entry 244 (class 1259 OID 16959)
-- Name: adm_empresas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_empresas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3733 (class 0 OID 0)
-- Dependencies: 244
-- Name: adm_empresas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_empresas_id_seq OWNED BY public.adm_empresas.id;


--
-- TOC entry 225 (class 1259 OID 16736)
-- Name: adm_formas_recebimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_formas_recebimento (
    id integer NOT NULL,
    descricao text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone
);


--
-- TOC entry 224 (class 1259 OID 16735)
-- Name: adm_formas_recebimento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_formas_recebimento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3734 (class 0 OID 0)
-- Dependencies: 224
-- Name: adm_formas_recebimento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_formas_recebimento_id_seq OWNED BY public.adm_formas_recebimento.id;


--
-- TOC entry 237 (class 1259 OID 16841)
-- Name: adm_perfil; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_perfil (
    id integer NOT NULL,
    perfil text NOT NULL,
    adm_system boolean DEFAULT false,
    cliente_id integer,
    created_at timestamp with time zone DEFAULT now(),
    excluded_at timestamp with time zone
);


--
-- TOC entry 236 (class 1259 OID 16840)
-- Name: adm_perfil_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_perfil_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3735 (class 0 OID 0)
-- Dependencies: 236
-- Name: adm_perfil_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_perfil_id_seq OWNED BY public.adm_perfil.id;


--
-- TOC entry 239 (class 1259 OID 16861)
-- Name: adm_perfil_permissao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_perfil_permissao (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    perfil_id integer NOT NULL,
    inserir boolean DEFAULT true NOT NULL,
    excluir boolean DEFAULT true NOT NULL,
    consultar boolean DEFAULT true NOT NULL,
    alterar boolean DEFAULT true NOT NULL,
    excluded_at timestamp with time zone,
    funcionalidade_id bigint NOT NULL
);


--
-- TOC entry 238 (class 1259 OID 16860)
-- Name: adm_perfil_permissao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.adm_perfil_permissao ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.adm_perfil_permissao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 221 (class 1259 OID 16696)
-- Name: adm_planos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_planos (
    id integer NOT NULL,
    descricao text NOT NULL,
    valor_mes numeric(10,2) NOT NULL,
    valor_ano numeric(10,2) NOT NULL,
    vl_desconto numeric(10,2) NOT NULL,
    dt_inclusao timestamp with time zone DEFAULT now() NOT NULL,
    dt_alteracao timestamp with time zone,
    ativo boolean DEFAULT true NOT NULL,
    id_product_stripe text,
    id_price_stripe text,
    CONSTRAINT adm_planos_valor_ano_check CHECK ((valor_ano >= (0)::numeric)),
    CONSTRAINT adm_planos_valor_mes_check CHECK ((valor_mes >= (0)::numeric)),
    CONSTRAINT adm_planos_vl_desconto_check CHECK ((vl_desconto >= (0)::numeric))
);


--
-- TOC entry 220 (class 1259 OID 16695)
-- Name: adm_planos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_planos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3736 (class 0 OID 0)
-- Dependencies: 220
-- Name: adm_planos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_planos_id_seq OWNED BY public.adm_planos.id;


--
-- TOC entry 241 (class 1259 OID 16890)
-- Name: adm_usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_usuarios (
    id integer NOT NULL,
    email text NOT NULL,
    cpf text,
    nome text NOT NULL,
    senha text NOT NULL,
    criado timestamp with time zone DEFAULT now() NOT NULL,
    dt_inativacao timestamp with time zone,
    dt_nascimento date,
    dt_ativacao timestamp with time zone,
    ultimo_login timestamp with time zone,
    tentativas_login smallint DEFAULT 0 NOT NULL,
    dt_bloqueio timestamp with time zone,
    cliente_id integer,
    status boolean DEFAULT true NOT NULL
);


--
-- TOC entry 240 (class 1259 OID 16889)
-- Name: adm_usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adm_usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3737 (class 0 OID 0)
-- Dependencies: 240
-- Name: adm_usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adm_usuarios_id_seq OWNED BY public.adm_usuarios.id;


--
-- TOC entry 243 (class 1259 OID 16920)
-- Name: adm_usuarios_perfil; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adm_usuarios_perfil (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id integer NOT NULL,
    perfil_id integer NOT NULL,
    created_by integer NOT NULL,
    dt_inativacao timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer NOT NULL
);


--
-- TOC entry 242 (class 1259 OID 16919)
-- Name: adm_usuarios_perfil_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.adm_usuarios_perfil ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.adm_usuarios_perfil_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 247 (class 1259 OID 16999)
-- Name: sys_chamado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_chamado (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    titulo text NOT NULL,
    descricao text,
    categoria text,
    prioridade text NOT NULL,
    status text NOT NULL,
    usuario_atribuido_id integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone,
    fechado_em timestamp with time zone
);


--
-- TOC entry 249 (class 1259 OID 17029)
-- Name: sys_chamado_comentario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_chamado_comentario (
    id integer NOT NULL,
    chamado_id integer NOT NULL,
    usuario_id integer NOT NULL,
    comentario text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 248 (class 1259 OID 17028)
-- Name: sys_chamado_comentario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_chamado_comentario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3738 (class 0 OID 0)
-- Dependencies: 248
-- Name: sys_chamado_comentario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_chamado_comentario_id_seq OWNED BY public.sys_chamado_comentario.id;


--
-- TOC entry 246 (class 1259 OID 16998)
-- Name: sys_chamado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_chamado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3739 (class 0 OID 0)
-- Dependencies: 246
-- Name: sys_chamado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_chamado_id_seq OWNED BY public.sys_chamado.id;


--
-- TOC entry 251 (class 1259 OID 17055)
-- Name: sys_chamados_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_chamados_anexos (
    id integer NOT NULL,
    chamado_comentario_id integer NOT NULL,
    anexo bytea,
    anexo_thumbnail bytea,
    nome_arquivo text NOT NULL,
    tipo_arquivo text,
    tamanho_bytes integer,
    CONSTRAINT chamados_anexos_tamanho_bytes_check CHECK ((tamanho_bytes > 0))
);


--
-- TOC entry 250 (class 1259 OID 17054)
-- Name: sys_chamados_anexos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_chamados_anexos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3740 (class 0 OID 0)
-- Dependencies: 250
-- Name: sys_chamados_anexos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_chamados_anexos_id_seq OWNED BY public.sys_chamados_anexos.id;


--
-- TOC entry 231 (class 1259 OID 16777)
-- Name: sys_cron_execucoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_cron_execucoes (
    id integer NOT NULL,
    nome_job text NOT NULL,
    executado_em timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    registros_processados integer DEFAULT 0,
    erro text,
    duracao_ms integer,
    sucesso boolean NOT NULL
);


--
-- TOC entry 230 (class 1259 OID 16776)
-- Name: sys_cron_execucoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_cron_execucoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3741 (class 0 OID 0)
-- Dependencies: 230
-- Name: sys_cron_execucoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_cron_execucoes_id_seq OWNED BY public.sys_cron_execucoes.id;


--
-- TOC entry 253 (class 1259 OID 17074)
-- Name: sys_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_email_templates (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    assunto_confirmacao text NOT NULL,
    template_texto_confirmacao text NOT NULL,
    assunto_lembrete text NOT NULL,
    template_texto_lembrete text NOT NULL,
    assinatura text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 252 (class 1259 OID 17073)
-- Name: sys_email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3742 (class 0 OID 0)
-- Dependencies: 252
-- Name: sys_email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_email_templates_id_seq OWNED BY public.sys_email_templates.id;


--
-- TOC entry 229 (class 1259 OID 16760)
-- Name: sys_funcionalidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_funcionalidade (
    id bigint NOT NULL,
    modulo_id bigint NOT NULL,
    funcionalidade text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 228 (class 1259 OID 16759)
-- Name: sys_funcionalidade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sys_funcionalidade ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sys_funcionalidade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 255 (class 1259 OID 17099)
-- Name: sys_login_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_login_log (
    id integer NOT NULL,
    usuario_id integer,
    email_tentativa text NOT NULL,
    sucesso boolean NOT NULL,
    ip_address inet,
    user_agent text,
    motivo_falha text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 254 (class 1259 OID 17098)
-- Name: sys_login_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_login_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3743 (class 0 OID 0)
-- Dependencies: 254
-- Name: sys_login_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_login_log_id_seq OWNED BY public.sys_login_log.id;


--
-- TOC entry 257 (class 1259 OID 17121)
-- Name: sys_manutencao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_manutencao (
    id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    descricao text NOT NULL,
    dt_inicio timestamp without time zone NOT NULL,
    dt_fim timestamp without time zone,
    status text DEFAULT 'planejada'::text NOT NULL,
    excluded_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now(),
    usuario_id integer
);


--
-- TOC entry 256 (class 1259 OID 17120)
-- Name: sys_manutencao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sys_manutencao ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sys_manutencao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 227 (class 1259 OID 16749)
-- Name: sys_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_modulo (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modulo text
);


--
-- TOC entry 226 (class 1259 OID 16748)
-- Name: sys_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sys_modulo ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sys_modulo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 259 (class 1259 OID 17147)
-- Name: sys_notificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_notificacao (
    id bigint NOT NULL,
    usuario_id integer NOT NULL,
    tipo_notificacao text NOT NULL,
    status text DEFAULT 'Pendente'::text,
    destinatario text NOT NULL,
    assunto text NOT NULL,
    mensagem text NOT NULL,
    enviado_em timestamp without time zone,
    erro_falha text,
    contador_tentativas integer DEFAULT 0,
    maximo_tentativas integer DEFAULT 3,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- TOC entry 258 (class 1259 OID 17146)
-- Name: sys_notificacao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sys_notificacao ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sys_notificacao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 223 (class 1259 OID 16717)
-- Name: sys_parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_parametros (
    id integer NOT NULL,
    chave text NOT NULL,
    valor text NOT NULL,
    descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 222 (class 1259 OID 16716)
-- Name: sys_parametros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_parametros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3744 (class 0 OID 0)
-- Dependencies: 222
-- Name: sys_parametros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_parametros_id_seq OWNED BY public.sys_parametros.id;


--
-- TOC entry 3435 (class 2604 OID 16798)
-- Name: adm_clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_clientes ALTER COLUMN id SET DEFAULT nextval('public.adm_clientes_id_seq'::regclass);


--
-- TOC entry 3441 (class 2604 OID 16825)
-- Name: adm_contrato id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_contrato ALTER COLUMN id SET DEFAULT nextval('public.adm_contrato_id_seq'::regclass);


--
-- TOC entry 3457 (class 2604 OID 16963)
-- Name: adm_empresas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_empresas ALTER COLUMN id SET DEFAULT nextval('public.adm_empresas_id_seq'::regclass);


--
-- TOC entry 3428 (class 2604 OID 16739)
-- Name: adm_formas_recebimento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_formas_recebimento ALTER COLUMN id SET DEFAULT nextval('public.adm_formas_recebimento_id_seq'::regclass);


--
-- TOC entry 3443 (class 2604 OID 16844)
-- Name: adm_perfil id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_perfil ALTER COLUMN id SET DEFAULT nextval('public.adm_perfil_id_seq'::regclass);


--
-- TOC entry 3422 (class 2604 OID 16699)
-- Name: adm_planos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_planos ALTER COLUMN id SET DEFAULT nextval('public.adm_planos_id_seq'::regclass);


--
-- TOC entry 3451 (class 2604 OID 16893)
-- Name: adm_usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios ALTER COLUMN id SET DEFAULT nextval('public.adm_usuarios_id_seq'::regclass);


--
-- TOC entry 3463 (class 2604 OID 17002)
-- Name: sys_chamado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado ALTER COLUMN id SET DEFAULT nextval('public.sys_chamado_id_seq'::regclass);


--
-- TOC entry 3465 (class 2604 OID 17032)
-- Name: sys_chamado_comentario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado_comentario ALTER COLUMN id SET DEFAULT nextval('public.sys_chamado_comentario_id_seq'::regclass);


--
-- TOC entry 3467 (class 2604 OID 17058)
-- Name: sys_chamados_anexos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamados_anexos ALTER COLUMN id SET DEFAULT nextval('public.sys_chamados_anexos_id_seq'::regclass);


--
-- TOC entry 3432 (class 2604 OID 16780)
-- Name: sys_cron_execucoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_cron_execucoes ALTER COLUMN id SET DEFAULT nextval('public.sys_cron_execucoes_id_seq'::regclass);


--
-- TOC entry 3468 (class 2604 OID 17077)
-- Name: sys_email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_email_templates ALTER COLUMN id SET DEFAULT nextval('public.sys_email_templates_id_seq'::regclass);


--
-- TOC entry 3471 (class 2604 OID 17102)
-- Name: sys_login_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_login_log ALTER COLUMN id SET DEFAULT nextval('public.sys_login_log_id_seq'::regclass);


--
-- TOC entry 3425 (class 2604 OID 16720)
-- Name: sys_parametros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_parametros ALTER COLUMN id SET DEFAULT nextval('public.sys_parametros_id_seq'::regclass);


--
-- TOC entry 3516 (class 2606 OID 16878)
-- Name: adm_perfil_permissao adm_perfil_permissao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_perfil_permissao
    ADD CONSTRAINT adm_perfil_permissao_pkey PRIMARY KEY (id);


--
-- TOC entry 3490 (class 2606 OID 16715)
-- Name: adm_planos adm_planos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_planos
    ADD CONSTRAINT adm_planos_pkey PRIMARY KEY (id);


--
-- TOC entry 3526 (class 2606 OID 16933)
-- Name: adm_usuarios_perfil adm_usuario_perfil_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios_perfil
    ADD CONSTRAINT adm_usuario_perfil_pkey PRIMARY KEY (id);


--
-- TOC entry 3537 (class 2606 OID 17042)
-- Name: sys_chamado_comentario chamado_comentario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado_comentario
    ADD CONSTRAINT chamado_comentario_pkey PRIMARY KEY (id);


--
-- TOC entry 3532 (class 2606 OID 17014)
-- Name: sys_chamado chamado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado
    ADD CONSTRAINT chamado_pkey PRIMARY KEY (id);


--
-- TOC entry 3540 (class 2606 OID 17066)
-- Name: sys_chamados_anexos chamados_anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamados_anexos
    ADD CONSTRAINT chamados_anexos_pkey PRIMARY KEY (id);


--
-- TOC entry 3507 (class 2606 OID 16820)
-- Name: adm_clientes clientes_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_clientes
    ADD CONSTRAINT clientes_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 3509 (class 2606 OID 16818)
-- Name: adm_clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- TOC entry 3511 (class 2606 OID 16833)
-- Name: adm_contrato contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_contrato
    ADD CONSTRAINT contrato_pkey PRIMARY KEY (id);


--
-- TOC entry 3503 (class 2606 OID 16791)
-- Name: sys_cron_execucoes cron_execucoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_cron_execucoes
    ADD CONSTRAINT cron_execucoes_pkey PRIMARY KEY (id);


--
-- TOC entry 3543 (class 2606 OID 17092)
-- Name: sys_email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 3528 (class 2606 OID 16987)
-- Name: adm_empresas empresas_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_empresas
    ADD CONSTRAINT empresas_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 3530 (class 2606 OID 16985)
-- Name: adm_empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- TOC entry 3497 (class 2606 OID 16747)
-- Name: adm_formas_recebimento formas_recebimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_formas_recebimento
    ADD CONSTRAINT formas_recebimento_pkey PRIMARY KEY (id);


--
-- TOC entry 3548 (class 2606 OID 17111)
-- Name: sys_login_log login_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_login_log
    ADD CONSTRAINT login_log_pkey PRIMARY KEY (id);


--
-- TOC entry 3493 (class 2606 OID 16733)
-- Name: sys_parametros parametros_chave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_parametros
    ADD CONSTRAINT parametros_chave_key UNIQUE (chave);


--
-- TOC entry 3495 (class 2606 OID 16731)
-- Name: sys_parametros parametros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_parametros
    ADD CONSTRAINT parametros_pkey PRIMARY KEY (id);


--
-- TOC entry 3514 (class 2606 OID 16852)
-- Name: adm_perfil perfil_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_perfil
    ADD CONSTRAINT perfil_pkey PRIMARY KEY (id);


--
-- TOC entry 3499 (class 2606 OID 16758)
-- Name: sys_modulo sys_funcionalidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_modulo
    ADD CONSTRAINT sys_funcionalidade_pkey PRIMARY KEY (id);


--
-- TOC entry 3501 (class 2606 OID 16770)
-- Name: sys_funcionalidade sys_funcionalidade_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_funcionalidade
    ADD CONSTRAINT sys_funcionalidade_pkey1 PRIMARY KEY (id);


--
-- TOC entry 3550 (class 2606 OID 17135)
-- Name: sys_manutencao sys_manutencao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_manutencao
    ADD CONSTRAINT sys_manutencao_pkey PRIMARY KEY (id);


--
-- TOC entry 3555 (class 2606 OID 17162)
-- Name: sys_notificacao sys_notificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_notificacao
    ADD CONSTRAINT sys_notificacao_pkey PRIMARY KEY (id);


--
-- TOC entry 3520 (class 2606 OID 16909)
-- Name: adm_usuarios usuarios_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios
    ADD CONSTRAINT usuarios_cpf_key UNIQUE (cpf);


--
-- TOC entry 3522 (class 2606 OID 16911)
-- Name: adm_usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 3524 (class 2606 OID 16907)
-- Name: adm_usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 3517 (class 1259 OID 16918)
-- Name: fki_usuarios_clientes_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fki_usuarios_clientes_fkey ON public.adm_usuarios USING btree (cliente_id);


--
-- TOC entry 3533 (class 1259 OID 17026)
-- Name: idx_chamado_atribuido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamado_atribuido ON public.sys_chamado USING btree (usuario_atribuido_id) WHERE (usuario_atribuido_id IS NOT NULL);


--
-- TOC entry 3538 (class 1259 OID 17053)
-- Name: idx_chamado_comentario_chamado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamado_comentario_chamado ON public.sys_chamado_comentario USING btree (chamado_id);


--
-- TOC entry 3534 (class 1259 OID 17027)
-- Name: idx_chamado_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamado_status ON public.sys_chamado USING btree (status);


--
-- TOC entry 3535 (class 1259 OID 17025)
-- Name: idx_chamado_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamado_usuario ON public.sys_chamado USING btree (usuario_id, status);


--
-- TOC entry 3541 (class 1259 OID 17072)
-- Name: idx_chamados_anexos_comentario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamados_anexos_comentario ON public.sys_chamados_anexos USING btree (chamado_comentario_id);


--
-- TOC entry 3512 (class 1259 OID 16839)
-- Name: idx_contrato_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contrato_usuario ON public.adm_contrato USING btree (cliente_id);


--
-- TOC entry 3504 (class 1259 OID 16793)
-- Name: idx_cron_execucoes_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_execucoes_data ON public.sys_cron_execucoes USING btree (executado_em DESC);


--
-- TOC entry 3505 (class 1259 OID 16792)
-- Name: idx_cron_execucoes_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_execucoes_job ON public.sys_cron_execucoes USING btree (nome_job, executado_em DESC);


--
-- TOC entry 3544 (class 1259 OID 17119)
-- Name: idx_login_log_sucesso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_log_sucesso ON public.sys_login_log USING btree (sucesso);


--
-- TOC entry 3545 (class 1259 OID 17117)
-- Name: idx_login_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_log_timestamp ON public.sys_login_log USING btree ("timestamp" DESC);


--
-- TOC entry 3546 (class 1259 OID 17118)
-- Name: idx_login_log_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_log_usuario_id ON public.sys_login_log USING btree (usuario_id);


--
-- TOC entry 3551 (class 1259 OID 17170)
-- Name: idx_notificacao_fila; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacao_fila ON public.sys_notificacao USING btree (status, contador_tentativas, enviado_em);


--
-- TOC entry 3552 (class 1259 OID 17168)
-- Name: idx_notificacao_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacao_status ON public.sys_notificacao USING btree (status, contador_tentativas);


--
-- TOC entry 3553 (class 1259 OID 17169)
-- Name: idx_notificacao_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacao_usuario ON public.sys_notificacao USING btree (usuario_id);


--
-- TOC entry 3491 (class 1259 OID 16734)
-- Name: idx_parametros_chave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parametros_chave ON public.sys_parametros USING btree (chave);


--
-- TOC entry 3518 (class 1259 OID 16917)
-- Name: idx_usuarios_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_email ON public.adm_usuarios USING btree (email);


--
-- TOC entry 3558 (class 2606 OID 16855)
-- Name: adm_perfil adm_perfil_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_perfil
    ADD CONSTRAINT adm_perfil_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.adm_clientes(id);


--
-- TOC entry 3559 (class 2606 OID 16879)
-- Name: adm_perfil_permissao adm_perfil_permissao_funcionalidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_perfil_permissao
    ADD CONSTRAINT adm_perfil_permissao_funcionalidade_id_fkey FOREIGN KEY (funcionalidade_id) REFERENCES public.sys_funcionalidade(id);


--
-- TOC entry 3560 (class 2606 OID 16884)
-- Name: adm_perfil_permissao adm_perfil_permissao_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_perfil_permissao
    ADD CONSTRAINT adm_perfil_permissao_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.adm_perfil(id);


--
-- TOC entry 3562 (class 2606 OID 16934)
-- Name: adm_usuarios_perfil adm_usuario_perfil_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios_perfil
    ADD CONSTRAINT adm_usuario_perfil_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3563 (class 2606 OID 16939)
-- Name: adm_usuarios_perfil adm_usuario_perfil_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios_perfil
    ADD CONSTRAINT adm_usuario_perfil_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.adm_perfil(id);


--
-- TOC entry 3564 (class 2606 OID 16944)
-- Name: adm_usuarios_perfil adm_usuario_perfil_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios_perfil
    ADD CONSTRAINT adm_usuario_perfil_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3565 (class 2606 OID 16949)
-- Name: adm_usuarios_perfil adm_usuario_perfil_updated_by_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios_perfil
    ADD CONSTRAINT adm_usuario_perfil_updated_by_fkey1 FOREIGN KEY (updated_by) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3566 (class 2606 OID 16954)
-- Name: adm_usuarios_perfil adm_usuario_perfil_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios_perfil
    ADD CONSTRAINT adm_usuario_perfil_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3571 (class 2606 OID 17043)
-- Name: sys_chamado_comentario chamado_comentario_id_chamado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado_comentario
    ADD CONSTRAINT chamado_comentario_id_chamado_fkey FOREIGN KEY (chamado_id) REFERENCES public.sys_chamado(id);


--
-- TOC entry 3572 (class 2606 OID 17048)
-- Name: sys_chamado_comentario chamado_comentario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado_comentario
    ADD CONSTRAINT chamado_comentario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3569 (class 2606 OID 17015)
-- Name: sys_chamado chamado_usuario_atribuido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado
    ADD CONSTRAINT chamado_usuario_atribuido_id_fkey FOREIGN KEY (usuario_atribuido_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3570 (class 2606 OID 17020)
-- Name: sys_chamado chamado_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamado
    ADD CONSTRAINT chamado_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3573 (class 2606 OID 17067)
-- Name: sys_chamados_anexos chamados_anexos_chamado_comentario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_chamados_anexos
    ADD CONSTRAINT chamados_anexos_chamado_comentario_id_fkey FOREIGN KEY (chamado_comentario_id) REFERENCES public.sys_chamado_comentario(id);


--
-- TOC entry 3557 (class 2606 OID 16834)
-- Name: adm_contrato contrato_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_contrato
    ADD CONSTRAINT contrato_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.adm_clientes(id);


--
-- TOC entry 3567 (class 2606 OID 16993)
-- Name: adm_empresas empresas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_empresas
    ADD CONSTRAINT empresas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.adm_clientes(id);


--
-- TOC entry 3568 (class 2606 OID 16988)
-- Name: adm_empresas empresas_usuario_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_empresas
    ADD CONSTRAINT empresas_usuario_responsavel_id_fkey FOREIGN KEY (usuario_responsavel_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3575 (class 2606 OID 17112)
-- Name: sys_login_log login_log_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_login_log
    ADD CONSTRAINT login_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3574 (class 2606 OID 17093)
-- Name: sys_email_templates sys_email_templates_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_email_templates
    ADD CONSTRAINT sys_email_templates_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3556 (class 2606 OID 16771)
-- Name: sys_funcionalidade sys_funcionalidade_modulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_funcionalidade
    ADD CONSTRAINT sys_funcionalidade_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES public.sys_modulo(id);


--
-- TOC entry 3576 (class 2606 OID 17136)
-- Name: sys_manutencao sys_manutencao_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_manutencao
    ADD CONSTRAINT sys_manutencao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3577 (class 2606 OID 17163)
-- Name: sys_notificacao sys_notificacao_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_notificacao
    ADD CONSTRAINT sys_notificacao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.adm_usuarios(id);


--
-- TOC entry 3561 (class 2606 OID 16912)
-- Name: adm_usuarios usuarios_clientes_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adm_usuarios
    ADD CONSTRAINT usuarios_clientes_fkey FOREIGN KEY (cliente_id) REFERENCES public.adm_clientes(id);


-- Completed on 2026-04-25 19:59:23 UTC

--
-- PostgreSQL database dump complete
--

INSERT INTO "public"."sys_parametros" ("id", "chave", "valor", "descricao", "created_at", "updated_at") 
VALUES (1, 'limite_tentativas_login', '5', 'Número máximo de tentativas de login antes do bloqueio', '2026-04-15 00:47:56.409738+00', '2026-04-15 00:47:56.409738+00'), (2, 'tempo_bloqueio_minutos', '30', 'Tempo de bloqueio da conta após exceder tentativas de login (em minutos)', '2026-04-15 00:48:09.17172+00', '2026-04-15 00:48:09.17172+00'), (3, 'tempo_sessao_horas', '4', 'Duração da sessão JWT em horas', '2026-04-15 00:48:20.421445+00', '2026-04-15 00:48:20.421445+00'), (4, 'BASE_URL', 'http://localhost:5173', 'Url da aplicação do sistema', '2026-04-15 00:48:48.32516+00', '2026-04-15 00:48:48.32516+00'), (5, 'NODE_ENV', 'dev', 'Modo do Ambiente', '2026-04-15 00:48:59.598689+00', '2026-04-15 00:48:59.598689+00'), (6, 'RATE_LIMIT_WINDOW_MS', '3600000', 'Quantidade máxima de tempo para limite de requisição', '2026-04-15 00:49:15.346934+00', '2026-04-15 00:49:15.346934+00'), (7, 'RATE_LIMIT_MAX_REQUESTS', '10', 'Quantidade Maxima de requisições', '2026-04-15 00:49:28.414957+00', '2026-04-15 00:49:28.414957+00'), (8, 'RATE_LIMIT_TOKEN_MAX', '3', 'Quantidade máxima de tokens', '2026-04-15 00:49:39.265217+00', '2026-04-15 00:49:39.265217+00'), (9, 'NOTIFICACAO_CRON', 'false', 'Ativar/desativar sistema de notificações automáticas (cron jobs)', '2026-04-15 00:49:50.180806+00', '2026-04-15 00:49:50.180806+00');

INSERT INTO "public"."sys_modulo" ("id", "created_at", "modulo", "ordenacao") VALUES (1, '2026-04-14 19:34:19+00', 'Classificação NCM', 8), (2, '2026-04-14 19:34:51.759299+00', 'PERD/Comp', 2), (3, '2026-04-14 19:35:01.030177+00', 'Recuperação PIS/COFINS', 3), (4, '2026-04-25 18:35:04.690095+00', 'Dashboard', 1), (5, '2026-04-25 18:35:22.612524+00', 'MIT', 4), (6, '2026-04-25 18:35:33.268965+00', 'DCTF Web', 5), (7, '2026-04-25 18:35:44.781631+00', 'Gestão de CNDs', 6), (8, '2026-04-25 18:35:54.429304+00', 'Caixa Postal eCac', 7), (9, '2026-04-25 18:36:07.873177+00', 'Suporte', 9), (10, '2026-04-25 18:36:19.044225+00', 'Configurações', 10);
-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
commit;