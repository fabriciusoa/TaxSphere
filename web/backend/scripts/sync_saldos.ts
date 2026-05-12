import { sincronizarSaldosFromEcac } from '../src/services/ecacCreditoService';
import { getOne } from '../src/database/connection';

(async () => {
  // Acha a empresa que tem os 116 docs
  const emp = await getOne<{ id: number; razao_social: string }>(
    `SELECT id, razao_social FROM adm_empresas WHERE id IN (SELECT DISTINCT id_empresa FROM ecac_perdcomp_documentos) LIMIT 1`
  );
  if (!emp) { console.log('Nenhuma empresa com docs e-CAC'); process.exit(0); }
  console.log(`Sincronizando saldos da empresa: ${emp.razao_social} (id=${emp.id})\n`);
  const r = await sincronizarSaldosFromEcac(emp.id);
  console.log('Resultado:');
  console.log('  documentos_processados:', r.documentos_processados);
  console.log('  documentos_sem_recibo:', r.documentos_sem_recibo);
  console.log('  retificadores_aplicados:', r.retificadores_aplicados);
  console.log('  saldos_criados:', r.saldos_criados);
  console.log('  saldos_atualizados:', r.saldos_atualizados);
  console.log('  movimentacoes_geradas:', r.movimentacoes_geradas);
  console.log('  vinculacoes_sistema:', r.vinculacoes_sistema);
  console.log('  alertas:', r.alertas.length);
  if (r.alertas.length) for (const a of r.alertas.slice(0, 5)) console.log('   →', a);
  process.exit(0);
})();
