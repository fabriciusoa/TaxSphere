import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { parseReciboPdf } from '../src/services/perdcompReciboParser';

dotenv.config();
const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: url,
  ssl: process.env.DATABASE_ENV === 'local' ? false : { rejectUnauthorized: false },
});

(async () => {
  try {
    const docs = await pool.query<{ id: number; numero: string; recibo_pdf: Buffer }>(
      `SELECT id, numero, recibo_pdf FROM ecac_perdcomp_documentos WHERE recibo_pdf IS NOT NULL ORDER BY id`
    );
    console.log(`Reprocessando ${docs.rows.length} recibo(s)...\n`);

    let totalDebitos = 0;
    let dcompsComDebitos = 0;
    let erros = 0;

    for (const doc of docs.rows) {
      try {
        const parsed = await parseReciboPdf(doc.recibo_pdf);

        // Atualiza campos do documento
        // NÃO atualiza tipo_documento (mantém o do e-CAC: "Decl. Compensação", "Pedido Restituição", etc.)
        // O parser retorna "Original"/"Retificador" que é um subtipo diferente.
        await pool.query(
          `UPDATE ecac_perdcomp_documentos SET
             tipo_credito = COALESCE($1, tipo_credito),
             numero_recibo = COALESCE($2, numero_recibo),
             numero_perdcomp_inicial = COALESCE($3, numero_perdcomp_inicial),
             data_transmissao = COALESCE($4::date, data_transmissao),
             valor_pedido = COALESCE($5, valor_pedido),
             valor_saldo_negativo = COALESCE($6, valor_saldo_negativo),
             selic_acumulada = COALESCE($7, selic_acumulada),
             credito_atualizado = COALESCE($8, credito_atualizado),
             credito_original_utilizado = COALESCE($9, credito_original_utilizado),
             saldo_credito_original = COALESCE($10, saldo_credito_original),
             total_debitos_dcomp = COALESCE($11, total_debitos_dcomp),
             responsavel_nome = COALESCE($12, responsavel_nome),
             responsavel_cpf = COALESCE($13, responsavel_cpf),
             recibo_parse_status = 'OK',
             recibo_parse_erro = NULL,
             atualizado_em = NOW()
           WHERE id = $14`,
          [
            parsed.tipo_credito,
            parsed.numero_recibo, parsed.numero_perdcomp_inicial,
            parsed.data_transmissao, parsed.valor_pedido,
            parsed.valor_saldo_negativo, parsed.selic_acumulada,
            parsed.credito_atualizado, parsed.credito_original_utilizado,
            parsed.saldo_credito_original, parsed.total_debitos_dcomp,
            parsed.responsavel_nome, parsed.responsavel_cpf,
            doc.id,
          ]
        );

        // Apaga débitos antigos e insere os novos
        await pool.query(`DELETE FROM ecac_perdcomp_debitos_compensados WHERE id_documento = $1`, [doc.id]);
        for (const d of parsed.debitos) {
          await pool.query(
            `INSERT INTO ecac_perdcomp_debitos_compensados (
              id_documento, ordem, cnpj_detentor, codigo_receita, denominacao_receita,
              grupo_tributo, periodicidade, periodo_apuracao, data_vencimento,
              principal, multa, juros, total, controlado_em_processo
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13,$14)`,
            [
              doc.id, d.ordem, d.cnpj_detentor, d.codigo_receita, d.denominacao_receita,
              d.grupo_tributo, d.periodicidade, d.periodo_apuracao, d.data_vencimento,
              d.principal, d.multa, d.juros, d.total, d.controlado_em_processo,
            ]
          );
        }

        if (parsed.debitos.length > 0) {
          dcompsComDebitos++;
          totalDebitos += parsed.debitos.length;
        }
      } catch (e: any) {
        erros++;
        console.error(`  ✗ ${doc.numero}: ${e.message}`);
      }
    }

    console.log(`\n✓ ${docs.rows.length} reciboi(s) reprocessado(s)`);
    console.log(`✓ ${dcompsComDebitos} DCOMPs com débitos`);
    console.log(`✓ ${totalDebitos} débito(s) total importado(s)`);
    if (erros > 0) console.log(`✗ ${erros} erro(s)`);
  } catch (e: any) {
    console.error('ERRO:', e.message);
  } finally {
    await pool.end();
  }
})();
