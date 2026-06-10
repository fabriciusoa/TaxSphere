/**
 * Lista de arquivos baixados do DCTFweb (Recibos PDF, DARFs PDF, Espelhos XML).
 * Origem: tabela dctfweb_arquivos. Download via /dctfweb/arquivos/:id/download.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Chip, Select, MenuItem, FormControl, InputLabel,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, IconButton,
  Tooltip, TextField, Alert, Grid,
} from '@mui/material';
import {
  Download as DownloadIcon, Receipt as ReceiptIcon, RequestQuote as DarfIcon,
  Code as XmlIcon, FilterAlt as FilterIcon, Storage as StorageIcon,
} from '@mui/icons-material';
import { dctfwebService, type ArquivoDctfweb } from '../../services/dctfwebService';
import { empresasService } from '../../services/empresasService';

const T = {
  navy: '#0f1d4a', cyan: '#1c98c5', emerald: '#10b981', amber: '#f59e0b',
  red: '#dc2626', textSecond: '#64748b',
};

const TIPO_LABEL: Record<string, { label: string; cor: string; icon: any }> = {
  RECIBO_PDF: { label: 'Recibo', cor: T.cyan, icon: ReceiptIcon },
  DARF_PDF: { label: 'DARF', cor: T.amber, icon: DarfIcon },
  ESPELHO_XML: { label: 'Espelho XML', cor: T.emerald, icon: XmlIcon },
  COMPROVANTE_PDF: { label: 'Comprovante', cor: T.navy, icon: ReceiptIcon },
};

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(2)} MB`;
}

export default function ArquivosPage() {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [idEmpresa, setIdEmpresa] = useState<number | ''>('');
  const [tipo, setTipo] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [arquivos, setArquivos] = useState<ArquivoDctfweb[]>([]);
  const [backend, setBackend] = useState<'fs' | 'supabase'>('fs');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    empresasService.listar().then((d: any) => {
      const lista = Array.isArray(d) ? d : ((d as any).data || []);
      setEmpresas(lista);
      if (lista.length > 0) setIdEmpresa(lista[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!idEmpresa) return;
    setLoading(true);
    setErro('');
    dctfwebService.listarArquivos(idEmpresa as number, tipo ? { tipo: tipo as any } : undefined)
      .then(r => {
        setArquivos(r.data || []);
        setBackend(r.storage_backend);
      })
      .catch(e => setErro(e?.response?.data?.error || 'Falha ao listar arquivos'))
      .finally(() => setLoading(false));
  }, [idEmpresa, tipo]);

  const filtrados = useMemo(() => {
    if (!busca) return arquivos;
    const b = busca.toLowerCase();
    return arquivos.filter(a =>
      (a.numero_recibo || '').toLowerCase().includes(b) ||
      (a.numero_documento || '').toLowerCase().includes(b) ||
      (a.periodo_apuracao || '').includes(b)
    );
  }, [arquivos, busca]);

  const totalPorTipo = useMemo(() => {
    const t: Record<string, number> = {};
    arquivos.forEach(a => { t[a.tipo] = (t[a.tipo] || 0) + 1; });
    return t;
  }, [arquivos]);

  const handleDownload = (a: ArquivoDctfweb) => {
    window.open(dctfwebService.urlDownloadArquivo(a.id), '_blank');
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: T.navy }}>Arquivos DCTFweb</Typography>
          <Typography variant="body2" sx={{ color: T.textSecond }}>
            Recibos de entrega (PDF), DARFs (PDF) e Espelhos (XML) baixados do e-CAC.
          </Typography>
        </Box>
        <Chip
          icon={<StorageIcon />}
          label={`Storage: ${backend === 'supabase' ? 'Supabase' : 'Filesystem local'}`}
          sx={{ bgcolor: '#f1f5f9', color: T.navy }}
        />
      </Stack>

      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Empresa</InputLabel>
              <Select label="Empresa" value={idEmpresa} onChange={e => setIdEmpresa(e.target.value as number)}>
                {empresas.map(e => (
                  <MenuItem key={e.id} value={e.id}>{e.razao_social}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Tipo</InputLabel>
              <Select label="Tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="RECIBO_PDF">Recibo (PDF)</MenuItem>
                <MenuItem value="DARF_PDF">DARF (PDF)</MenuItem>
                <MenuItem value="ESPELHO_XML">Espelho (XML)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              size="small" fullWidth label="Buscar por nº recibo, documento ou período"
              value={busca} onChange={e => setBusca(e.target.value)}
              InputProps={{ startAdornment: <FilterIcon fontSize="small" sx={{ mr: 1, color: T.textSecond }} /> }}
            />
          </Grid>
        </Grid>
        <Stack direction="row" gap={1} mt={2} flexWrap="wrap">
          {Object.entries(totalPorTipo).map(([t, n]) => {
            const meta = TIPO_LABEL[t];
            return meta ? (
              <Chip key={t} size="small" label={`${meta.label}: ${n}`}
                sx={{ bgcolor: `${meta.cor}22`, color: meta.cor, fontWeight: 700 }} />
            ) : null;
          })}
        </Stack>
      </Paper>

      {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                {['Tipo', 'Identificador', 'Período', 'Tamanho', 'Fonte', 'Baixado em', ''].map(h =>
                  <TableCell key={h} sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtrados.length === 0 && !loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" sx={{ color: T.textSecond }}>
                    {arquivos.length === 0
                      ? 'Nenhum arquivo baixado ainda. Dispare uma atualização DCTFweb para baixar Recibos/DARFs/Espelhos.'
                      : 'Nenhum arquivo corresponde ao filtro.'}
                  </Typography>
                </TableCell></TableRow>
              )}
              {filtrados.map(a => {
                const meta = TIPO_LABEL[a.tipo] || { label: a.tipo, cor: T.textSecond, icon: ReceiptIcon };
                const Icon = meta.icon;
                return (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      <Chip size="small" icon={<Icon sx={{ fontSize: 14 }} />}
                        label={meta.label}
                        sx={{ bgcolor: `${meta.cor}22`, color: meta.cor, fontWeight: 700 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
                        {a.numero_documento || a.numero_recibo || `#${a.id}`}
                      </Typography>
                      {a.sha256 && <Typography variant="caption" sx={{ color: T.textSecond }}>sha256: {a.sha256.slice(0, 12)}…</Typography>}
                    </TableCell>
                    <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{a.periodo_apuracao || '—'}</Typography></TableCell>
                    <TableCell>{formatBytes(a.tamanho_bytes)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={a.fonte}
                        sx={{ bgcolor: a.fonte === 'SERPRO_API' ? `${T.emerald}22` : '#e2e8f0', color: T.navy, fontWeight: 700, fontSize: 9 }} />
                    </TableCell>
                    <TableCell>{new Date(a.baixado_em).toLocaleString('pt-BR')}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Baixar / Visualizar">
                        <IconButton size="small" onClick={() => handleDownload(a)} sx={{ color: T.cyan }}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
