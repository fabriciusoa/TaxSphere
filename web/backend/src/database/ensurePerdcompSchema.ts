import { runQuery } from './connection';
import { log } from '../utils/logger';

export async function ensurePerdcompSchema(): Promise<void> {
  try {
    // ── Certificados Digitais ─────────────────────────────────────────────────
    // id_empresa aponta para adm_empresas (tabela principal do sistema)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS certificados_digitais (
        id            BIGSERIAL PRIMARY KEY,
        id_empresa    BIGINT NOT NULL REFERENCES adm_empresas(id) ON DELETE CASCADE,
        nome          VARCHAR(200),
        nome_arquivo  VARCHAR(300) NOT NULL,
        tipo          VARCHAR(5)  NOT NULL DEFAULT 'A1',
        pfx_encrypted BYTEA,
        iv            TEXT,
        cn            TEXT,
        emissor       TEXT,
        serial_number TEXT,
        validade_de   TEXT,
        validade_ate  TEXT,
        ativo         SMALLINT NOT NULL DEFAULT 1,
        status        VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
        senha_hash    VARCHAR(200),
        senha_cifrada VARCHAR(500),
        sessao_cookies TEXT,
        arquivo_path  VARCHAR(500),
        ultimo_uso    TIMESTAMP,
        criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migração: se a tabela já existia apontando para perdcomp_empresas, corrige o FK
    await runQuery(`
      DO $$ BEGIN
        ALTER TABLE certificados_digitais DROP CONSTRAINT IF EXISTS certificados_digitais_id_empresa_fkey;
        ALTER TABLE certificados_digitais
          ADD CONSTRAINT certificados_digitais_id_empresa_fkey
          FOREIGN KEY (id_empresa) REFERENCES adm_empresas(id) ON DELETE CASCADE;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);

    // ── Sincronizações eCAC ───────────────────────────────────────────────────
    // id_empresa aponta para adm_empresas (tabela principal do sistema)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS ecac_sincronizacoes (
        id                  BIGSERIAL PRIMARY KEY,
        id_empresa          BIGINT NOT NULL REFERENCES adm_empresas(id) ON DELETE CASCADE,
        id_certificado      BIGINT REFERENCES certificados_digitais(id),
        id_usuario          BIGINT NOT NULL REFERENCES adm_usuarios(id),
        tipo                VARCHAR(40) NOT NULL DEFAULT 'completa',
        status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
        creditos_importados INTEGER NOT NULL DEFAULT 0,
        debitos_importados  INTEGER NOT NULL DEFAULT 0,
        registros_ignorados INTEGER NOT NULL DEFAULT 0,
        erro_mensagem       TEXT,
        detalhes            TEXT,
        iniciado_em         TIMESTAMP,
        concluido_em        TIMESTAMP,
        criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migração: se a tabela já existia apontando para perdcomp_empresas, corrige o FK
    await runQuery(`
      DO $$ BEGIN
        ALTER TABLE ecac_sincronizacoes DROP CONSTRAINT IF EXISTS ecac_sincronizacoes_id_empresa_fkey;
        ALTER TABLE ecac_sincronizacoes
          ADD CONSTRAINT ecac_sincronizacoes_id_empresa_fkey
          FOREIGN KEY (id_empresa) REFERENCES adm_empresas(id) ON DELETE CASCADE;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);

    // ── Melhorias na tabela certificados_digitais (colunas adicionais) ────────
    // Seguro executar mesmo se a tabela acabou de ser criada acima
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS senha_hash VARCHAR(200)`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS senha_cifrada VARCHAR(500)`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS sessao_cookies TEXT`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS arquivo_path VARCHAR(500)`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS nome VARCHAR(200)`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ATIVO'`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS ultimo_uso TIMESTAMP`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()`);
    // Metadados de sessão (captura/uso/falha) para visualização e gestão proativa.
    // Sessão e-CAC tem validade limitada — quanto antes detectarmos uma sessão expirada
    // ou ausente, mais cedo orientamos o usuário a re-autenticar antes do batch noturno.
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS sessao_capturada_em TIMESTAMP`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS sessao_falha_em TIMESTAMP`);
    await runQuery(`ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS sessao_falha_motivo TEXT`);

    // ── Documentos PER/DCOMP importados do e-CAC ─────────────────────────────
    // Cada linha representa 1 documento PER/DCOMP entregue no e-CAC
    await runQuery(`
      CREATE TABLE IF NOT EXISTS ecac_perdcomp_documentos (
        id               BIGSERIAL PRIMARY KEY,
        id_empresa       BIGINT NOT NULL REFERENCES adm_empresas(id) ON DELETE CASCADE,
        id_sincronizacao BIGINT REFERENCES ecac_sincronizacoes(id) ON DELETE SET NULL,
        numero           VARCHAR(50) NOT NULL,
        tipo_documento   VARCHAR(80),
        tipo_credito     VARCHAR(120),
        periodo_apuracao VARCHAR(30),
        data_entrega     DATE,
        status_ecac      VARCHAR(80),
        orig_retif       VARCHAR(10),
        criado_em        TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em    TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(id_empresa, numero)
      )
    `);

    // Colunas adicionais derivadas do recibo PDF (Etapa A)
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS numero_perdcomp_inicial VARCHAR(50)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS numero_recibo VARCHAR(50)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS data_transmissao DATE`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS oriundo_acao_judicial BOOLEAN`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS valor_pedido NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS valor_saldo_negativo NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS selic_acumulada NUMERIC(10, 6)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS credito_atualizado NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS credito_original_data_entrega NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS saldo_credito_original NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS credito_original_utilizado NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS total_debitos_dcomp NUMERIC(18, 2)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS forma_apuracao VARCHAR(40)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS forma_tributacao VARCHAR(40)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS exercicio VARCHAR(10)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS periodo_inicial DATE`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS periodo_final DATE`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(200)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS responsavel_cpf VARCHAR(14)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS recibo_pdf BYTEA`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS recibo_baixado_em TIMESTAMP`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS recibo_parse_status VARCHAR(20)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS recibo_parse_erro TEXT`);
    // Documento PDF completo (capturado ao clicar no ícone "Imprimir" da coluna direita
    // da lista de Documentos Entregues do e-CAC — PDF de 5+ páginas com todos os dados).
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS documento_pdf BYTEA`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS documento_baixado_em TIMESTAMP`);

    // ── Configuração de Automações por Empresa ────────────────────────────────
    // Cada empresa decide quais sincronizações automáticas o agendador deve rodar.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS ecac_automacao_config (
        id_empresa             BIGINT PRIMARY KEY REFERENCES adm_empresas(id) ON DELETE CASCADE,
        sync_documentos_ativo  BOOLEAN NOT NULL DEFAULT FALSE,
        baixar_recibos_ativo   BOOLEAN NOT NULL DEFAULT FALSE,
        baixar_documentos_ativo BOOLEAN NOT NULL DEFAULT FALSE,
        sync_saldos_ativo      BOOLEAN NOT NULL DEFAULT FALSE,
        ultima_execucao        TIMESTAMP,
        ultima_execucao_status VARCHAR(20),
        ultima_execucao_msg    TEXT,
        criado_em              TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em          TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_por_id      BIGINT REFERENCES adm_usuarios(id)
      )
    `);

    // ── Configuração GLOBAL de agendamento ────────────────────────────────────
    // Tabela single-row: id sempre = 1.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS ecac_automacao_config_global (
        id                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        ativo             BOOLEAN NOT NULL DEFAULT FALSE,
        horario_diario    VARCHAR(5) NOT NULL DEFAULT '02:00',  -- HH:MM (24h)
        atualizado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_por_id BIGINT REFERENCES adm_usuarios(id)
      )
    `);
    // Garante existência da linha única
    await runQuery(`INSERT INTO ecac_automacao_config_global (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_ecac_perdcomp_inicial ON ecac_perdcomp_documentos(numero_perdcomp_inicial)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_ecac_perdcomp_status ON ecac_perdcomp_documentos(status_ecac)`);

    // Etapas B/C/D/E — Status normalizado, vínculos de retificação, fonte e match com sistema
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS status_normalizado VARCHAR(40)`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS id_documento_retificado BIGINT REFERENCES ecac_perdcomp_documentos(id) ON DELETE SET NULL`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS retificado_por_id BIGINT REFERENCES ecac_perdcomp_documentos(id) ON DELETE SET NULL`);
    await runQuery(`ALTER TABLE ecac_perdcomp_documentos ADD COLUMN IF NOT EXISTS id_perdcomp_sistema BIGINT REFERENCES perdcomps(id) ON DELETE SET NULL`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_ecac_perdcomp_retificado ON ecac_perdcomp_documentos(id_documento_retificado)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_ecac_perdcomp_status_norm ON ecac_perdcomp_documentos(status_normalizado)`);

    // Débitos compensados extraídos de cada PER/DCOMP (1-N)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS ecac_perdcomp_debitos_compensados (
        id                 BIGSERIAL PRIMARY KEY,
        id_documento       BIGINT NOT NULL REFERENCES ecac_perdcomp_documentos(id) ON DELETE CASCADE,
        ordem              INTEGER NOT NULL DEFAULT 1,
        cnpj_detentor      VARCHAR(18),
        codigo_receita     VARCHAR(20),
        denominacao_receita VARCHAR(200),
        grupo_tributo      VARCHAR(80),
        periodicidade      VARCHAR(20),
        periodo_apuracao   VARCHAR(40),
        data_vencimento    DATE,
        principal          NUMERIC(18, 2) NOT NULL DEFAULT 0,
        multa              NUMERIC(18, 2) NOT NULL DEFAULT 0,
        juros              NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total              NUMERIC(18, 2) NOT NULL DEFAULT 0,
        controlado_em_processo BOOLEAN NOT NULL DEFAULT false,
        criado_em          TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_ecac_debitos_documento ON ecac_perdcomp_debitos_compensados(id_documento)`);

    // ── adm_empresas: remover dependência de adm_clientes ────────────────────
    // O modelo multi-tenant (adm_clientes) não é usado nesta aplicação.
    // Removemos a FK e a restrição NOT NULL para permitir cadastro sem cliente.
    await runQuery(`ALTER TABLE adm_empresas DROP CONSTRAINT IF EXISTS empresas_cliente_id_fkey`);
    await runQuery(`ALTER TABLE adm_empresas ALTER COLUMN cliente_id DROP NOT NULL`);

    // ── Melhorias na tabela perdcomp_empresas ───────────────────────────────
    await runQuery(`ALTER TABLE perdcomp_empresas ADD COLUMN IF NOT EXISTS cep VARCHAR(10)`);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS perdcomp_empresas (
        id BIGSERIAL PRIMARY KEY,
        id_usuario_responsavel BIGINT NOT NULL REFERENCES adm_usuarios(id),
        cnpj VARCHAR(18) NOT NULL UNIQUE,
        razao_social VARCHAR(255) NOT NULL,
        nome_fantasia VARCHAR(255),
        inscricao_estadual VARCHAR(30),
        regime_tributario VARCHAR(50) NOT NULL DEFAULT 'Lucro Real',
        endereco TEXT,
        atividade_principal VARCHAR(255),
        situacao VARCHAR(80),
        natureza_juridica VARCHAR(120),
        capital_social NUMERIC(14, 2),
        email VARCHAR(255),
        telefone VARCHAR(40),
        municipio VARCHAR(120),
        uf CHAR(2),
        ativo SMALLINT NOT NULL DEFAULT 1,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS perdcomp_creditos (
        id BIGSERIAL PRIMARY KEY,
        id_empresa BIGINT NOT NULL REFERENCES perdcomp_empresas(id),
        tipo_credito VARCHAR(30) NOT NULL,
        origem_credito VARCHAR(80) NOT NULL,
        periodo_apuracao VARCHAR(20) NOT NULL,
        codigo_receita VARCHAR(30),
        valor_original NUMERIC(14, 2) NOT NULL,
        valor_selic_acumulado NUMERIC(14, 2) NOT NULL DEFAULT 0,
        valor_atualizado NUMERIC(14, 2) NOT NULL,
        dt_pagamento_original DATE NOT NULL,
        dt_vencimento_prescricao DATE NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'Disponível',
        saldo_disponivel NUMERIC(14, 2) NOT NULL,
        observacoes TEXT,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS perdcomp_debitos (
        id BIGSERIAL PRIMARY KEY,
        id_empresa BIGINT NOT NULL REFERENCES perdcomp_empresas(id),
        tipo_tributo VARCHAR(60) NOT NULL,
        codigo_receita VARCHAR(30),
        periodo_apuracao VARCHAR(20) NOT NULL,
        valor_principal NUMERIC(14, 2) NOT NULL,
        valor_multa NUMERIC(14, 2) NOT NULL DEFAULT 0,
        valor_juros NUMERIC(14, 2) NOT NULL DEFAULT 0,
        valor_total NUMERIC(14, 2) NOT NULL,
        dt_vencimento DATE NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'Pendente',
        saldo_devedor NUMERIC(14, 2) NOT NULL,
        observacoes TEXT,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // perdcomp_historico — apenas para o helper registrarHistorico (auditoria
    // de criações/edições de Créditos e Débitos). Não tem mais id_pedido.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS perdcomp_historico (
        id BIGSERIAL PRIMARY KEY,
        id_credito BIGINT REFERENCES perdcomp_creditos(id),
        id_debito BIGINT REFERENCES perdcomp_debitos(id),
        id_usuario BIGINT NOT NULL REFERENCES adm_usuarios(id),
        acao VARCHAR(40) NOT NULL,
        campo_alterado VARCHAR(80),
        valor_anterior TEXT,
        valor_novo TEXT,
        detalhes TEXT,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS perdcomp_selic_taxas (
        id BIGSERIAL PRIMARY KEY,
        mes_referencia VARCHAR(7) NOT NULL UNIQUE,
        taxa_mensal NUMERIC(10, 6) NOT NULL,
        taxa_acumulada_ano NUMERIC(10, 6),
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ════════════════════════════════════════════════════════════════════════
    // NOVAS TABELAS — Módulo PER/DCOMP completo (documento oficial)
    // ════════════════════════════════════════════════════════════════════════

    // Documento PER/DCOMP principal
    await runQuery(`
      CREATE TABLE IF NOT EXISTS perdcomps (
        id BIGSERIAL PRIMARY KEY,
        id_empresa BIGINT NOT NULL REFERENCES perdcomp_empresas(id),
        id_certificado BIGINT REFERENCES certificados_digitais(id),
        id_usuario_criador BIGINT REFERENCES adm_usuarios(id),
        numero VARCHAR(30) UNIQUE,
        tipo_documento VARCHAR(40) NOT NULL,
        tipo_credito VARCHAR(60) NOT NULL,
        titularidade VARCHAR(40) NOT NULL DEFAULT 'PROPRIO_CONTRIBUINTE',
        status VARCHAR(40) NOT NULL DEFAULT 'RASCUNHO',
        data_transmissao TIMESTAMP,
        protocolo_transmissao VARCHAR(50),
        observacoes TEXT,
        dar_numero VARCHAR(30),
        dar_data_arrecadacao DATE,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_perdcomps_empresa ON perdcomps(id_empresa)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_perdcomps_status ON perdcomps(status)`);

    // Crédito tributário vinculado ao documento PER/DCOMP
    await runQuery(`
      CREATE TABLE IF NOT EXISTS creditos_tributarios (
        id BIGSERIAL PRIMARY KEY,
        id_perdcomp BIGINT NOT NULL UNIQUE REFERENCES perdcomps(id) ON DELETE CASCADE,
        cnpj_detentor VARCHAR(18) NOT NULL,
        codigo_receita VARCHAR(10) NOT NULL,
        denominacao_receita VARCHAR(200),
        periodo_apuracao VARCHAR(7) NOT NULL,
        data_arrecadacao DATE,
        data_vencimento DATE,
        valor_original_inicial NUMERIC(18, 2) NOT NULL,
        valor_principal NUMERIC(18, 2) NOT NULL,
        valor_utilizado NUMERIC(18, 2) NOT NULL DEFAULT 0,
        selic_acumulada NUMERIC(10, 6) NOT NULL DEFAULT 0,
        credito_atualizado NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_debitos_documento NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_credito_utilizado NUMERIC(18, 2) NOT NULL DEFAULT 0,
        saldo_credito_original NUMERIC(18, 2) NOT NULL DEFAULT 0,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Débitos do documento PER/DCOMP (estrutura formal da Receita)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS debitos_perdcomp (
        id BIGSERIAL PRIMARY KEY,
        id_perdcomp BIGINT NOT NULL REFERENCES perdcomps(id) ON DELETE CASCADE,
        ordem INTEGER NOT NULL,
        grupo_tributo VARCHAR(40) NOT NULL,
        tipo_debito VARCHAR(40) NOT NULL DEFAULT 'PROPRIO_CONTRIBUINTE',
        cnpj_detentor VARCHAR(18) NOT NULL,
        codigo_receita VARCHAR(10) NOT NULL,
        denominacao_receita VARCHAR(200),
        periodicidade VARCHAR(20),
        periodo_apuracao VARCHAR(7) NOT NULL,
        data_vencimento DATE NOT NULL,
        valor_principal NUMERIC(18, 2) NOT NULL,
        multa NUMERIC(18, 2) NOT NULL DEFAULT 0,
        juros NUMERIC(18, 2) NOT NULL DEFAULT 0,
        valor_total NUMERIC(18, 2) NOT NULL,
        controlado_em_processo BOOLEAN NOT NULL DEFAULT false,
        numero_processo VARCHAR(30),
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_debitos_perdcomp_perdcomp ON debitos_perdcomp(id_perdcomp)`);

    // Responsável pelo preenchimento
    await runQuery(`
      CREATE TABLE IF NOT EXISTS responsaveis_preenchimento (
        id BIGSERIAL PRIMARY KEY,
        id_perdcomp BIGINT NOT NULL UNIQUE REFERENCES perdcomps(id) ON DELETE CASCADE,
        cpf VARCHAR(14) NOT NULL,
        nome VARCHAR(150) NOT NULL,
        telefone_fixo VARCHAR(15),
        telefone_celular VARCHAR(16),
        email VARCHAR(80),
        crc VARCHAR(15),
        uf_crc VARCHAR(2),
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Histórico de status do documento PER/DCOMP
    await runQuery(`
      CREATE TABLE IF NOT EXISTS historico_status_perdcomp (
        id BIGSERIAL PRIMARY KEY,
        id_perdcomp BIGINT NOT NULL REFERENCES perdcomps(id) ON DELETE CASCADE,
        status_anterior VARCHAR(40) NOT NULL,
        status_novo VARCHAR(40) NOT NULL,
        observacao TEXT,
        origem_atualizacao VARCHAR(20) NOT NULL DEFAULT 'SISTEMA',
        id_usuario BIGINT REFERENCES adm_usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_historico_status_perdcomp ON historico_status_perdcomp(id_perdcomp)`);

    // Recibos de entrega (SERPRO)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS recibos (
        id BIGSERIAL PRIMARY KEY,
        id_perdcomp BIGINT NOT NULL REFERENCES perdcomps(id) ON DELETE CASCADE,
        numero_controle VARCHAR(30),
        numero_perdcomp VARCHAR(30),
        data_transmissao TIMESTAMP,
        tipo_documento VARCHAR(100),
        tipo_credito VARCHAR(100),
        valor_pedido NUMERIC(18, 2),
        versao VARCHAR(10),
        nome_representante VARCHAR(200),
        cpf_representante VARCHAR(14),
        telefone VARCHAR(20),
        email VARCHAR(100),
        arquivo_pdf VARCHAR(500),
        observacoes TEXT,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_recibos_perdcomp ON recibos(id_perdcomp)`);

    // Saldos de crédito por empresa
    await runQuery(`
      CREATE TABLE IF NOT EXISTS saldos_credito (
        id BIGSERIAL PRIMARY KEY,
        id_empresa BIGINT NOT NULL REFERENCES perdcomp_empresas(id),
        numero_perdcomp_origem VARCHAR(50),
        id_perdcomp_origem BIGINT REFERENCES perdcomps(id) ON DELETE SET NULL,
        tipo_credito VARCHAR(100) NOT NULL,
        exercicio VARCHAR(20) NOT NULL,
        periodo_apuracao VARCHAR(20),
        valor_saldo_negativo NUMERIC(18, 2) NOT NULL,
        selic_acumulada NUMERIC(10, 6) NOT NULL DEFAULT 0,
        credito_atualizado NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_utilizado NUMERIC(18, 2) NOT NULL DEFAULT 0,
        saldo_disponivel NUMERIC(18, 2) NOT NULL DEFAULT 0,
        data_referencia TIMESTAMP NOT NULL DEFAULT NOW(),
        origem VARCHAR(30) NOT NULL DEFAULT 'IMPORTACAO_INICIAL',
        observacoes TEXT,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_saldos_credito_empresa ON saldos_credito(id_empresa)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_saldos_credito_tipo ON saldos_credito(tipo_credito)`);

    // Etapa B/E — Vínculo com documento e-CAC + datas de prescrição
    await runQuery(`ALTER TABLE saldos_credito ADD COLUMN IF NOT EXISTS id_documento_ecac BIGINT REFERENCES ecac_perdcomp_documentos(id) ON DELETE SET NULL`);
    await runQuery(`ALTER TABLE saldos_credito ADD COLUMN IF NOT EXISTS data_entrega_pedido DATE`);
    await runQuery(`ALTER TABLE saldos_credito ADD COLUMN IF NOT EXISTS data_prescricao DATE`);
    await runQuery(`ALTER TABLE saldos_credito ADD COLUMN IF NOT EXISTS status_normalizado VARCHAR(40)`);
    await runQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_saldos_credito_doc_ecac ON saldos_credito(id_documento_ecac) WHERE id_documento_ecac IS NOT NULL`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_saldos_credito_prescricao ON saldos_credito(data_prescricao)`);

    // Migração: saldos_credito.id_empresa apontava para perdcomp_empresas; migrar para adm_empresas (consistência multi-tenant)
    await runQuery(`
      DO $$
      BEGIN
        -- Apenas migrar se existir a FK antiga
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'saldos_credito_id_empresa_fkey'
            AND table_name = 'saldos_credito'
        ) THEN
          -- Atualizar id_empresa para o id de adm_empresas via CNPJ
          UPDATE saldos_credito s
          SET id_empresa = ae.id
          FROM perdcomp_empresas pe
          JOIN adm_empresas ae ON ae.cnpj = pe.cnpj
          WHERE s.id_empresa = pe.id;

          ALTER TABLE saldos_credito DROP CONSTRAINT saldos_credito_id_empresa_fkey;
          ALTER TABLE saldos_credito
            ADD CONSTRAINT saldos_credito_id_empresa_fkey
            FOREIGN KEY (id_empresa) REFERENCES adm_empresas(id) ON DELETE CASCADE;
        END IF;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);

    // Etapa B — Vínculo de movimentações com documento e-CAC
    await runQuery(`ALTER TABLE movimentacoes_saldo ADD COLUMN IF NOT EXISTS id_documento_ecac BIGINT REFERENCES ecac_perdcomp_documentos(id) ON DELETE SET NULL`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_doc_ecac ON movimentacoes_saldo(id_documento_ecac)`);

    // Movimentações de saldo
    await runQuery(`
      CREATE TABLE IF NOT EXISTS movimentacoes_saldo (
        id BIGSERIAL PRIMARY KEY,
        id_saldo_credito BIGINT NOT NULL REFERENCES saldos_credito(id) ON DELETE CASCADE,
        id_perdcomp BIGINT REFERENCES perdcomps(id) ON DELETE SET NULL,
        numero_perdcomp VARCHAR(50),
        tipo VARCHAR(20) NOT NULL,
        valor NUMERIC(18, 2) NOT NULL,
        saldo_apos NUMERIC(18, 2) NOT NULL,
        descricao TEXT,
        data_movimentacao TIMESTAMP NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_saldo_credito ON movimentacoes_saldo(id_saldo_credito)`);

  } catch (error: any) {
    log.error(`[ensurePerdcompSchema] Erro ao garantir schema PER/DComp: ${error.message}`);
    throw error;
  }
}
