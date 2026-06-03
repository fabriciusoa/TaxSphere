import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, Stack, Chip, Alert, CircularProgress, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TextField, InputAdornment, MenuItem, Select, FormControl, InputLabel, Pagination, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText,
} from '@mui/material';
import {
  Search as SearchIcon, Refresh as RefreshIcon, Warning as WarningIcon, Description as DescIcon,
  UploadFile as UploadIcon, CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { dctfwebService, type DctfwebDeclaracao, type SituacaoNormalizada,
         CATEGORIA_LABELS, SITUACAO_LABELS,
         type CategoriaDctfweb, type TipoDctfweb } from '../../services/dctfwebService';
import { useEmpresa } from '../../contexts/EmpresaContext';

const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b', emerald: '#22c55e', amber: '#d29922', red: '#ef4444' };

// Cores oficiais por situação (manual cap. 8.4)
const SIT_COLORS: Record<string, string> = {
  EM_ANDAMENTO: T.amber, ATIVA: T.emerald, RETIFICADA: '#a855f7',
  EXCLUIDA: '#94a3b8', INDEVIDA: T.red, FASEAMENTO: '#cbd5e1',
  // compat antigos
  EM_EDICAO: T.amber, TRANSMITIDA: T.cyan, ACEITA: T.emerald,
  REJEITADA: T.red, SEM_MOVIMENTO: '#94a3b8', DESCONHECIDA: '#64748b',
};
const SIT_LABELS = SITUACAO_LABELS;

function brl(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DeclaracoesPage() {
  const { empresaId } = useEmpresa();
  const [items, setItems] = useState<DctfwebDeclaracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<SituacaoNormalizada | ''>('');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [categoria, setCategoria] = useState<CategoriaDctfweb | ''>('');
  const [tipo, setTipo] = useState<TipoDctfweb | ''>('');
  const [modoPadrao, setModoPadrao] = useState(true); // cap. 7 — default ON
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Import XML
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<null | Awaited<ReturnType<typeof dctfwebService.importarXml>>>(null);
  const [importDialog, setImportDialog] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const r = await dctfwebService.listarDeclaracoes({
        id_empresa: empresaId ? Number(empresaId) : undefined,
        situacao: modoPadrao ? undefined : (situacao || undefined),
        periodo_inicio: periodoInicio || undefined,
        periodo_fim: periodoFim || undefined,
        categoria: categoria || undefined,
        tipo: tipo || undefined,
        modo_padrao: modoPadrao || undefined,
        busca: busca || undefined,
        page,
        limit: 20,
      } as any);
      setItems(r.data);
      setTotalPages(r.pagination.totalPages);
      setTotal(r.pagination.total);
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao carregar declarações');
    } finally { setLoading(false); }
  }, [empresaId, situacao, periodoInicio, periodoFim, categoria, tipo, modoPadrao, busca, page]);
  useEffect(() => { carregar(); }, [carregar]);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!empresaId) {
      setErro('Selecione uma empresa no seletor do topo antes de importar.');
      return;
    }
    setImportando(true);
    try {
      const r = await dctfwebService.importarXml(Number(empresaId), Array.from(files));
      setImportResult(r);
      setImportDialog(true);
      carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao importar XML');
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Box>
      <Box mb={3} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 280 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>DCTF Web · Declarações</Typography>
          <Typography variant="body2" sx={{ color: T.textSecond }}>
            {total} declaração(ões) {empresaId ? 'desta empresa' : 'no sistema'}. Filtre por situação, período ou texto livre.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Tooltip title={empresaId ? 'Importar XML do eSocial S-1299, EFD-Reinf R-9000 ou recibo DCTFWeb' : 'Selecione uma empresa para importar'}>
            <span>
              <Button
                variant="contained"
                startIcon={importando ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <CloudUploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={!empresaId || importando}
                sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: '#00b0d8' }, textTransform: 'none', fontWeight: 600, borderRadius: '10px' }}
              >
                {importando ? 'Importando…' : 'Importar XML'}
              </Button>
            </span>
          </Tooltip>
        </Stack>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.zip"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleImportFiles(e.target.files)}
        />
      </Box>

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
        {/* Filtros oficiais conforme manual cap. 7.1 */}
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ xs: 'stretch', md: 'center' }} flexWrap="wrap">
          <Chip
            label={modoPadrao ? '📋 Visualização padrão (manual cap. 7)' : 'Exibindo todas conforme filtros'}
            onClick={() => { setModoPadrao(!modoPadrao); setPage(1); }}
            sx={{
              bgcolor: modoPadrao ? `${T.cyan}22` : '#e2e8f0',
              color: modoPadrao ? T.cyan : T.textSecond,
              fontWeight: 700, cursor: 'pointer',
            }}
          />
          <TextField
            size="small" value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(1); }}
            placeholder="Buscar empresa, CNPJ ou recibo"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 260, flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }} disabled={modoPadrao}>
            <InputLabel>Situação</InputLabel>
            <Select label="Situação" value={situacao} onChange={(e) => { setSituacao(e.target.value as SituacaoNormalizada); setPage(1); }}>
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(SIT_LABELS).filter(([k]) => ['EM_ANDAMENTO', 'ATIVA', 'RETIFICADA', 'EXCLUIDA', 'INDEVIDA'].includes(k))
                .map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Categoria</InputLabel>
            <Select label="Categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value as CategoriaDctfweb); setPage(1); }}>
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Tipo</InputLabel>
            <Select label="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoDctfweb); setPage(1); }}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="ORIGINAL">Original</MenuItem>
              <MenuItem value="RETIFICADORA">Retificadora</MenuItem>
              <MenuItem value="EXCLUSAO">Exclusão</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small" label="PA início" placeholder="01/2025"
            value={periodoInicio}
            onChange={(e) => { setPeriodoInicio(e.target.value); setPage(1); }}
            sx={{ minWidth: 130 }}
          />
          <TextField
            size="small" label="PA fim" placeholder="12/2025"
            value={periodoFim}
            onChange={(e) => { setPeriodoFim(e.target.value); setPage(1); }}
            sx={{ minWidth: 130 }}
          />
          <Tooltip title="Recarregar">
            <IconButton onClick={carregar} sx={{ color: T.cyan }}><RefreshIcon /></IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: T.cyan }} /></Box>
        ) : erro ? (
          <Alert severity="error" sx={{ m: 2 }}>{erro}</Alert>
        ) : items.length === 0 ? (
          <Box textAlign="center" py={6}>
            <DescIcon sx={{ fontSize: 48, color: T.cyan, opacity: 0.4, mb: 1 }} />
            <Typography variant="body1" sx={{ color: T.textSecond }}>Nenhuma declaração encontrada.</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Período</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Categoria</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Situação</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }} align="right">Débito</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }} align="right">Crédito</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }} align="right">Saldo a pagar</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Recibo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{d.razao_social}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{d.cnpj}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{d.periodo_apuracao}</Typography></TableCell>
                      <TableCell>
                        <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap">
                          <Typography variant="body2">{(CATEGORIA_LABELS as any)[d.categoria] || d.categoria}</Typography>
                          {d.tipo !== 'ORIGINAL' && (
                            <Chip size="small" label={d.tipo === 'RETIFICADORA' ? 'Retif.' : d.tipo}
                              sx={{ bgcolor: '#a855f722', color: '#a855f7', fontSize: 9, height: 18, fontWeight: 700 }} />
                          )}
                          {(d as any).subtipo === 'SEM_MOVIMENTO' && (
                            <Chip size="small" label="S/Mov" sx={{ bgcolor: '#94a3b822', color: '#64748b', fontSize: 9, height: 18, fontWeight: 700 }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap">
                          <Chip size="small" label={SIT_LABELS[d.situacao_normalizada]} sx={{
                            bgcolor: `${SIT_COLORS[d.situacao_normalizada]}22`,
                            color: SIT_COLORS[d.situacao_normalizada],
                            fontWeight: 700, fontSize: 10,
                          }} />
                          {/* Badge "Impede CND" — manual cap. 17.1.1 */}
                          {(d as any).impede_cnd && (
                            <Tooltip title={(d as any).impede_cnd_motivo || 'Retificadora pendente impede emissão de CND'}>
                              <Chip size="small" label="CND" icon={<WarningIcon sx={{ fontSize: 12 }} />}
                                sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700, fontSize: 10, height: 20 }} />
                            </Tooltip>
                          )}
                          {/* Badge "Atraso" + MAED — manual cap. 5 */}
                          {(d as any).entregue_em_atraso && (
                            <Tooltip title={`Entregue ${(d as any).dias_atraso} dia(s) em atraso — MAED ${brl((d as any).maed_valor || 0)}`}>
                              <Chip size="small" label={`Atraso ${(d as any).dias_atraso}d`}
                                sx={{ bgcolor: `${T.amber}22`, color: T.amber, fontWeight: 700, fontSize: 10, height: 20 }} />
                            </Tooltip>
                          )}
                          {!(d as any).entregue_em_atraso && (d as any).dias_atraso > 0 && d.situacao_normalizada === 'EM_ANDAMENTO' && (
                            <Tooltip title={`Prazo legal venceu há ${(d as any).dias_atraso} dia(s). Transmitir agora gera MAED.`}>
                              <Chip size="small" label={`Prazo -${(d as any).dias_atraso}d`}
                                sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700, fontSize: 10, height: 20 }} />
                            </Tooltip>
                          )}
                          {d.divergencia && (
                            <Tooltip title={d.divergencia_motivo || 'Valor diverge do eSocial/Reinf'}>
                              <WarningIcon sx={{ color: T.amber, fontSize: 14, verticalAlign: 'middle' }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right"><Typography variant="body2">{brl(d.debito_apurado)}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" sx={{ color: T.emerald }}>{brl(d.credito_vinculado)}</Typography></TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700, color: d.saldo_pagar > 0 ? T.red : T.textSecond }}>
                          {brl(d.saldo_pagar)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {d.numero_recibo ? (
                          <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, monospace' }}>{d.numero_recibo}</Typography>
                        ) : (
                          <Typography variant="caption" sx={{ color: T.textSecond }}>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Pagination page={page} count={totalPages} onChange={(_, p) => setPage(p)} color="primary" />
              </Box>
            )}
          </>
        )}
      </Paper>

      <Dialog open={importDialog} onClose={() => setImportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadIcon sx={{ color: T.cyan }} /> Resultado da importação
        </DialogTitle>
        <DialogContent>
          {importResult && (
            <Stack gap={2} mt={1}>
              <Stack direction="row" gap={2} flexWrap="wrap">
                <Chip label={`${importResult.processados} processados`} sx={{ bgcolor: `${T.emerald}22`, color: T.emerald, fontWeight: 700 }} />
                <Chip label={`${importResult.declaracoes_upsert} declarações atualizadas`} sx={{ bgcolor: `${T.cyan}22`, color: T.cyan, fontWeight: 700 }} />
                {importResult.divergencias_detectadas > 0 && (
                  <Chip label={`${importResult.divergencias_detectadas} divergência(s)`} sx={{ bgcolor: `${T.amber}22`, color: T.amber, fontWeight: 700 }} />
                )}
                {importResult.ignorados > 0 && (
                  <Chip label={`${importResult.ignorados} ignorados`} sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700 }} />
                )}
              </Stack>
              {importResult.erros.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ color: T.red, fontWeight: 700 }}>Arquivos com erro:</Typography>
                  <List dense>
                    {importResult.erros.slice(0, 10).map((er, i) => (
                      <ListItem key={i} sx={{ pl: 0 }}>
                        <ListItemText
                          primary={er.arquivo}
                          secondary={er.motivo}
                          primaryTypographyProps={{ variant: 'caption', sx: { fontFamily: 'ui-monospace, monospace' } }}
                          secondaryTypographyProps={{ variant: 'caption', sx: { color: T.red } }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              {importResult.divergencias_detectadas > 0 && (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  Foram encontradas divergências entre os valores do XML e o que já estava no banco (vindo do RPA do e-CAC).
                  As declarações afetadas foram marcadas com o ícone ⚠ na coluna "Situação".
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialog(false)} variant="contained" sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: '#00b0d8' } }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
