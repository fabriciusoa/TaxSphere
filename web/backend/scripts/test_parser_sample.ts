import fs from 'fs';
import { parseReciboPdf } from '../src/services/perdcompReciboParser';

(async () => {
  const pdf = fs.readFileSync('/tmp/dcomp_sample.pdf');
  const result = await parseReciboPdf(pdf);
  console.log('---- RESULTADO ----');
  console.log('numero_perdcomp:', result.numero_perdcomp);
  console.log('tipo_documento:', result.tipo_documento);
  console.log('tipo_credito:', result.tipo_credito);
  console.log('credito_original_utilizado:', result.credito_original_utilizado);
  console.log('total_debitos_dcomp:', result.total_debitos_dcomp);
  console.log('\nDÉBITOS:', result.debitos.length);
  for (const d of result.debitos) {
    console.log(`  ${d.ordem}. ${d.denominacao_receita}: ${d.principal} (total=${d.total})`);
  }
})();
