/**
 * Schema do módulo DCTFWeb.
 *
 * Tabelas:
 *   dctfweb_declaracoes        — 1 linha por declaração (período × empresa × categoria)
 *   dctfweb_darfs              — DARFs gerados por declaração (1:N)
 *   dctfweb_automacao_config        — flags por empresa (sync, gerar DARF, alertas)
 *   dctfweb_automacao_config_global — config geral do agendamento
 *
 * Idempotente: roda no boot do servidor.
 */
import { runQuery } from './connection';
import { log } from '../utils/logger';

export async function ensureDctfwebSchema(): Promise<void> {
  try {
    // ── Declarações DCTFweb ───────────────────────────────────────────────────
    // Campos alinhados com o manual oficial da DCTFWeb (Receita Federal, jan/2025):
    //   • categoria:  GERAL, GERAL_PF, DECIMO_TERCEIRO, DECIMO_TERCEIRO_PF,
    //                ESPETACULO_DESPORTIVO, AFERICAO, RECLAMATORIA_TRABALHISTA
    //   • tipo:       ORIGINAL, RETIFICADORA, EXCLUSAO
    //   • subtipo:    COM_DEBITOS, SEM_DEBITOS_ZERADA, SEM_MOVIMENTO
    //   • origem:     ESOCIAL, REINF_CP (R-2000), REINF_RET (R-4000), MIT, SERO
    //   • situacao_normalizada: EM_ANDAMENTO, ATIVA, RETIFICADA, EXCLUIDA,
    //                          INDEVIDA, FASEAMENTO
    await runQuery(`
      CREATE TABLE IF NOT EXISTS dctfweb_declaracoes (
        id                BIGSERIAL PRIMARY KEY,
        id_empresa        BIGINT NOT NULL REFERENCES adm_empresas(id) ON DELETE CASCADE,

        -- Identificação da declaração
        numero_recibo     VARCHAR(50),
        periodo_apuracao  VARCHAR(7)  NOT NULL, -- "MM/AAAA"
        categoria         VARCHAR(40) NOT NULL DEFAULT 'GERAL',
        tipo              VARCHAR(20) NOT NULL DEFAULT 'ORIGINAL',
        subtipo           VARCHAR(30),          -- COM_DEBITOS / SEM_DEBITOS_ZERADA / SEM_MOVIMENTO

        -- Situação oficial da Receita
        situacao          VARCHAR(40),                          -- texto bruto do e-CAC
        situacao_normalizada VARCHAR(40),                       -- EM_ANDAMENTO/ATIVA/RETIFICADA/EXCLUIDA/INDEVIDA/FASEAMENTO
        data_transmissao  TIMESTAMP,
        data_recepcao     TIMESTAMP,
        prazo_legal       DATE,                                 -- vencimento legal (calculado por categoria)
        entregue_em_atraso BOOLEAN NOT NULL DEFAULT FALSE,
        dias_atraso       INT DEFAULT 0,

        -- Valores agregados
        debito_apurado     NUMERIC(18,2) DEFAULT 0,
        credito_vinculado  NUMERIC(18,2) DEFAULT 0,
        saldo_pagar        NUMERIC(18,2) DEFAULT 0,

        -- Detalhamento por origem (vem em DCTFWeb consolidada)
        valor_esocial      NUMERIC(18,2) DEFAULT 0,             -- contribs previdenciárias + 3os + IRRF trab
        valor_reinf_cp     NUMERIC(18,2) DEFAULT 0,             -- série R-2000
        valor_reinf_ret    NUMERIC(18,2) DEFAULT 0,             -- série R-4000 (IRRF/CSLL/COFINS/PIS retidos)
        valor_mit          NUMERIC(18,2) DEFAULT 0,             -- IRPJ/CSLL/IPI/IOF/PIS/COFINS/CIDE/CPSS
        valor_sero         NUMERIC(18,2) DEFAULT 0,             -- aferição de obras

        -- Créditos vinculáveis (manual cap. 12)
        salario_familia    NUMERIC(18,2) DEFAULT 0,
        salario_maternidade NUMERIC(18,2) DEFAULT 0,
        retencao_lei_9711  NUMERIC(18,2) DEFAULT 0,             -- retenção 11% sobre NF de serviços
        compensacoes       NUMERIC(18,2) DEFAULT 0,
        parcelamentos      NUMERIC(18,2) DEFAULT 0,
        suspensoes         NUMERIC(18,2) DEFAULT 0,
        exclusoes          NUMERIC(18,2) DEFAULT 0,
        pagamentos_anteriores NUMERIC(18,2) DEFAULT 0,

        -- MAED (Multa por Atraso na Entrega da Declaração — manual cap. 5)
        maed_valor         NUMERIC(18,2) DEFAULT 0,
        maed_codigo_receita VARCHAR(10) DEFAULT '5440-01',
        maed_emitida_em    TIMESTAMP,
        maed_paga          BOOLEAN NOT NULL DEFAULT FALSE,

        -- Reconciliação com fontes (hashes para detecção de divergência)
        hash_esocial       VARCHAR(64),
        hash_reinf         VARCHAR(64),
        hash_mit           VARCHAR(64),
        divergencia        BOOLEAN NOT NULL DEFAULT FALSE,
        divergencia_motivo TEXT,

        -- Status de impedimento (cap. 17 — afeta CND)
        impede_cnd         BOOLEAN NOT NULL DEFAULT FALSE,      -- retificadora pendente / omissão
        impede_cnd_motivo  TEXT,

        -- Referência à declaração original (quando esta é retificadora/exclusão)
        id_declaracao_original BIGINT REFERENCES dctfweb_declaracoes(id) ON DELETE SET NULL,

        -- Arquivos
        recibo_pdf        BYTEA,
        comprovante_pdf   BYTEA,
        xml_recibo        TEXT,

        -- Metadados
        observacoes       TEXT,
        criado_em         TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em     TIMESTAMP NOT NULL DEFAULT NOW(),

        UNIQUE (id_empresa, periodo_apuracao, categoria, tipo)
      )
    `);

    // Colunas novas em bases já provisionadas (idempotente).
    // Roda mesmo se a tabela acabou de ser criada acima.
    const novasColunas = [
      `subtipo VARCHAR(30)`,
      `prazo_legal DATE`,
      `entregue_em_atraso BOOLEAN NOT NULL DEFAULT FALSE`,
      `dias_atraso INT DEFAULT 0`,
      `valor_esocial NUMERIC(18,2) DEFAULT 0`,
      `valor_reinf_cp NUMERIC(18,2) DEFAULT 0`,
      `valor_reinf_ret NUMERIC(18,2) DEFAULT 0`,
      `valor_mit NUMERIC(18,2) DEFAULT 0`,
      `valor_sero NUMERIC(18,2) DEFAULT 0`,
      `salario_familia NUMERIC(18,2) DEFAULT 0`,
      `salario_maternidade NUMERIC(18,2) DEFAULT 0`,
      `retencao_lei_9711 NUMERIC(18,2) DEFAULT 0`,
      `compensacoes NUMERIC(18,2) DEFAULT 0`,
      `parcelamentos NUMERIC(18,2) DEFAULT 0`,
      `suspensoes NUMERIC(18,2) DEFAULT 0`,
      `exclusoes NUMERIC(18,2) DEFAULT 0`,
      `pagamentos_anteriores NUMERIC(18,2) DEFAULT 0`,
      `maed_valor NUMERIC(18,2) DEFAULT 0`,
      `maed_codigo_receita VARCHAR(10) DEFAULT '5440-01'`,
      `maed_emitida_em TIMESTAMP`,
      `maed_paga BOOLEAN NOT NULL DEFAULT FALSE`,
      `hash_mit VARCHAR(64)`,
      `impede_cnd BOOLEAN NOT NULL DEFAULT FALSE`,
      `impede_cnd_motivo TEXT`,
      `id_declaracao_original BIGINT`,
      `xml_recibo TEXT`,
    ];
    for (const col of novasColunas) {
      const colName = col.split(' ')[0];
      await runQuery(`ALTER TABLE dctfweb_declaracoes ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
      void colName;
    }

    // ── DARFs gerados a partir de declarações ────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS dctfweb_darfs (
        id               BIGSERIAL PRIMARY KEY,
        id_declaracao    BIGINT NOT NULL REFERENCES dctfweb_declaracoes(id) ON DELETE CASCADE,
        id_empresa       BIGINT NOT NULL REFERENCES adm_empresas(id) ON DELETE CASCADE,

        codigo_receita   VARCHAR(10) NOT NULL,
        denominacao      VARCHAR(200),
        periodo_apuracao VARCHAR(7)  NOT NULL,
        vencimento       DATE        NOT NULL,
        principal        NUMERIC(18,2) NOT NULL DEFAULT 0,
        multa            NUMERIC(18,2) NOT NULL DEFAULT 0,
        juros            NUMERIC(18,2) NOT NULL DEFAULT 0,
        total            NUMERIC(18,2) NOT NULL DEFAULT 0,

        numero_documento VARCHAR(50),    -- número do DARF emitido
        codigo_barras    VARCHAR(200),

        gerado           BOOLEAN NOT NULL DEFAULT FALSE,
        gerado_em        TIMESTAMP,
        pago             BOOLEAN NOT NULL DEFAULT FALSE,
        pago_em          TIMESTAMP,
        valor_pago       NUMERIC(18,2),

        boleto_pdf       BYTEA,

        criado_em        TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_em    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ── Configuração de automação por empresa ────────────────────────────────
    // Espelha ecac_automacao_config (perdcomp) mas para fluxos DCTFweb.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS dctfweb_automacao_config (
        id_empresa            BIGINT PRIMARY KEY REFERENCES adm_empresas(id) ON DELETE CASCADE,
        sync_declaracoes_ativo BOOLEAN NOT NULL DEFAULT FALSE,
        baixar_recibos_ativo   BOOLEAN NOT NULL DEFAULT FALSE,
        gerar_darf_ativo       BOOLEAN NOT NULL DEFAULT FALSE,
        alertar_vencimento_ativo BOOLEAN NOT NULL DEFAULT FALSE,
        ultima_execucao        TIMESTAMP,
        ultima_execucao_status VARCHAR(20),
        ultima_execucao_msg    TEXT,
        atualizado_em          TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_por_id      BIGINT
      )
    `);

    // ── Config global do agendamento ─────────────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS dctfweb_automacao_config_global (
        id              INT PRIMARY KEY DEFAULT 1,
        ativo           BOOLEAN NOT NULL DEFAULT FALSE,
        horario_diario  VARCHAR(5) NOT NULL DEFAULT '03:00',
        dias_antes_vencimento_alertar INT NOT NULL DEFAULT 3,
        atualizado_em   TIMESTAMP NOT NULL DEFAULT NOW(),
        atualizado_por_id BIGINT,
        CONSTRAINT only_one_row CHECK (id = 1)
      )
    `);

    // Seed da linha única do global se ainda não existe
    await runQuery(
      `INSERT INTO dctfweb_automacao_config_global (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
    );

    // ── Arquivos baixados (Recibo PDF, DARF PDF, Espelho XML, Comprovante) ───
    // Mantém o path no storage (FS local ou Supabase) — não armazena bytea.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS dctfweb_arquivos (
        id              BIGSERIAL PRIMARY KEY,
        id_empresa      BIGINT NOT NULL REFERENCES adm_empresas(id) ON DELETE CASCADE,
        id_declaracao   BIGINT REFERENCES dctfweb_declaracoes(id) ON DELETE SET NULL,
        id_darf         BIGINT REFERENCES dctfweb_darfs(id) ON DELETE SET NULL,
        tipo            VARCHAR(32) NOT NULL,  -- RECIBO_PDF | DARF_PDF | ESPELHO_XML | COMPROVANTE_PDF
        numero_recibo   VARCHAR(64),
        numero_documento VARCHAR(64),
        periodo_apuracao VARCHAR(10),
        storage_backend VARCHAR(16) NOT NULL DEFAULT 'fs',  -- fs | supabase
        storage_path    TEXT NOT NULL,
        content_type    VARCHAR(64),
        tamanho_bytes   BIGINT,
        sha256          VARCHAR(64),
        fonte           VARCHAR(16) NOT NULL DEFAULT 'RPA',  -- RPA | SERPRO_API | UPLOAD
        baixado_em      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (id_empresa, tipo, numero_recibo, numero_documento)
      )
    `);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_dctfweb_arq_empresa_tipo ON dctfweb_arquivos(id_empresa, tipo)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_dctfweb_arq_recibo ON dctfweb_arquivos(numero_recibo)`);

    // ── Índices para queries do dashboard ────────────────────────────────────
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_dctfweb_decl_empresa_periodo ON dctfweb_declaracoes(id_empresa, periodo_apuracao)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_dctfweb_decl_situacao ON dctfweb_declaracoes(situacao_normalizada)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_dctfweb_darfs_venc ON dctfweb_darfs(vencimento) WHERE pago = FALSE`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_dctfweb_darfs_empresa ON dctfweb_darfs(id_empresa, vencimento)`);

    log.info('[DCTFweb] Schema garantido com sucesso');
  } catch (e: any) {
    log.error(`[DCTFweb] Falha ao garantir schema: ${e.message}`);
    throw e;
  }
}
