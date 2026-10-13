--
-- PostgreSQL database dump
--

\restrict jaziz6OhHM3YFzJpuGIlfV5wnbXLRzVTZg6oLtZwB4USCyRIl4xxM2g8Km2s8Zu

-- Dumped from database version 15.18
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tb_financeiro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_financeiro (
    id_financeiro integer NOT NULL,
    contas_a_pagar character varying(255) NOT NULL,
    gestao_tributos character varying(255) NOT NULL,
    fluxo_caixa character varying(255) NOT NULL,
    planejamento character varying(255) NOT NULL,
    meta character varying(255) NOT NULL,
    carga_horaria integer NOT NULL
);


--
-- Name: tb_financeiro_id_financeiro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_financeiro_id_financeiro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_financeiro_id_financeiro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_financeiro_id_financeiro_seq OWNED BY public.tb_financeiro.id_financeiro;


--
-- Name: tb_funcionarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_funcionarios (
    id_funcionarios integer NOT NULL,
    jornada character varying(255) NOT NULL,
    informacoes character varying(255) NOT NULL,
    setor character varying(100) NOT NULL,
    carga_horaria integer NOT NULL
);


--
-- Name: tb_funcionarios_id_funcionarios_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_funcionarios_id_funcionarios_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_funcionarios_id_funcionarios_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_funcionarios_id_funcionarios_seq OWNED BY public.tb_funcionarios.id_funcionarios;


--
-- Name: tb_loja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_loja (
    id_loja integer NOT NULL,
    redes character varying(255) NOT NULL,
    comunicacao character varying(255) NOT NULL,
    controle_acesso character varying(255) NOT NULL,
    energia character varying(255) NOT NULL,
    energia_solar character varying(255) NOT NULL
);


--
-- Name: tb_loja_id_loja_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_loja_id_loja_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_loja_id_loja_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_loja_id_loja_seq OWNED BY public.tb_loja.id_loja;


--
-- Name: tb_monitoramento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_monitoramento (
    id_monitoramento integer NOT NULL,
    seguranca integer NOT NULL,
    dados integer NOT NULL,
    carga_horaria integer NOT NULL
);


--
-- Name: tb_monitoramento_id_monitoramento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_monitoramento_id_monitoramento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_monitoramento_id_monitoramento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_monitoramento_id_monitoramento_seq OWNED BY public.tb_monitoramento.id_monitoramento;


--
-- Name: tb_pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_pedidos (
    id_pedido integer NOT NULL,
    codigo character varying(20) NOT NULL,
    centro_custo character varying(100),
    finalidade character varying(150),
    observacoes text,
    itens jsonb NOT NULL,
    total numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    mp_payment_id character varying(50),
    criado_em timestamp without time zone DEFAULT now() NOT NULL,
    email_comprovante character varying(255)
);


--
-- Name: tb_pedidos_id_pedido_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_pedidos_id_pedido_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_pedidos_id_pedido_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_pedidos_id_pedido_seq OWNED BY public.tb_pedidos.id_pedido;


--
-- Name: tb_rh; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rh (
    id_rh integer NOT NULL,
    cargos_salarios character varying(50) NOT NULL,
    processo_seletivo integer NOT NULL,
    departamento_pessoal character varying(20) NOT NULL,
    desligamento character varying(255) NOT NULL,
    carga_horaria integer NOT NULL
);


--
-- Name: tb_rh_id_rh_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rh_id_rh_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rh_id_rh_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rh_id_rh_seq OWNED BY public.tb_rh.id_rh;


--
-- Name: tb_sac; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sac (
    id_sac integer NOT NULL,
    reuniao character varying(255) NOT NULL,
    feedback character varying(255) NOT NULL,
    devolucao integer NOT NULL,
    historico integer NOT NULL,
    carga_horaria integer NOT NULL
);


--
-- Name: tb_sac_id_sac_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sac_id_sac_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sac_id_sac_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sac_id_sac_seq OWNED BY public.tb_sac.id_sac;


--
-- Name: tb_ti; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_ti (
    id_ti integer NOT NULL,
    design character varying(255) NOT NULL,
    analise_dados character varying(255) NOT NULL,
    ciberseguranca character varying(255) NOT NULL,
    manutencao character varying(255) NOT NULL,
    suporte character varying(255) NOT NULL,
    programacao character varying(255) NOT NULL,
    carga_horaria integer NOT NULL
);


--
-- Name: tb_ti_id_ti_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_ti_id_ti_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_ti_id_ti_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_ti_id_ti_seq OWNED BY public.tb_ti.id_ti;


--
-- Name: tb_financeiro id_financeiro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_financeiro ALTER COLUMN id_financeiro SET DEFAULT nextval('public.tb_financeiro_id_financeiro_seq'::regclass);


--
-- Name: tb_funcionarios id_funcionarios; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_funcionarios ALTER COLUMN id_funcionarios SET DEFAULT nextval('public.tb_funcionarios_id_funcionarios_seq'::regclass);


--
-- Name: tb_loja id_loja; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_loja ALTER COLUMN id_loja SET DEFAULT nextval('public.tb_loja_id_loja_seq'::regclass);


--
-- Name: tb_monitoramento id_monitoramento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_monitoramento ALTER COLUMN id_monitoramento SET DEFAULT nextval('public.tb_monitoramento_id_monitoramento_seq'::regclass);


--
-- Name: tb_pedidos id_pedido; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pedidos ALTER COLUMN id_pedido SET DEFAULT nextval('public.tb_pedidos_id_pedido_seq'::regclass);


--
-- Name: tb_rh id_rh; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rh ALTER COLUMN id_rh SET DEFAULT nextval('public.tb_rh_id_rh_seq'::regclass);


--
-- Name: tb_sac id_sac; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sac ALTER COLUMN id_sac SET DEFAULT nextval('public.tb_sac_id_sac_seq'::regclass);


--
-- Name: tb_ti id_ti; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_ti ALTER COLUMN id_ti SET DEFAULT nextval('public.tb_ti_id_ti_seq'::regclass);


--
-- Name: tb_financeiro tb_financeiro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_financeiro
    ADD CONSTRAINT tb_financeiro_pkey PRIMARY KEY (id_financeiro);


--
-- Name: tb_funcionarios tb_funcionarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_funcionarios
    ADD CONSTRAINT tb_funcionarios_pkey PRIMARY KEY (id_funcionarios);


--
-- Name: tb_loja tb_loja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_loja
    ADD CONSTRAINT tb_loja_pkey PRIMARY KEY (id_loja);


--
-- Name: tb_monitoramento tb_monitoramento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_monitoramento
    ADD CONSTRAINT tb_monitoramento_pkey PRIMARY KEY (id_monitoramento);


--
-- Name: tb_pedidos tb_pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pedidos
    ADD CONSTRAINT tb_pedidos_pkey PRIMARY KEY (id_pedido);


--
-- Name: tb_rh tb_rh_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rh
    ADD CONSTRAINT tb_rh_pkey PRIMARY KEY (id_rh);


--
-- Name: tb_sac tb_sac_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sac
    ADD CONSTRAINT tb_sac_pkey PRIMARY KEY (id_sac);


--
-- Name: tb_ti tb_ti_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_ti
    ADD CONSTRAINT tb_ti_pkey PRIMARY KEY (id_ti);


--
-- PostgreSQL database dump complete
--

\unrestrict jaziz6OhHM3YFzJpuGIlfV5wnbXLRzVTZg6oLtZwB4USCyRIl4xxM2g8Km2s8Zu

