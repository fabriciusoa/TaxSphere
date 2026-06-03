/**
 * Storage de arquivos baixados (Recibos PDF, DARFs PDF, Espelhos XML, Comprovantes).
 *
 * Dois backends:
 *   • fs       — filesystem local em `data/dctfweb-arquivos/` (padrão)
 *   • supabase — Supabase Storage (ativa setando SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_BUCKET)
 *
 * A API é a mesma: upload retorna { backend, path, sha256, tamanho }.
 * Download retorna Buffer. Tudo o resto persistido na tabela dctfweb_arquivos.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { log } from '../utils/logger';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'dctfweb-arquivos';
const FS_ROOT = process.env.STORAGE_FS_ROOT || path.resolve(process.cwd(), 'data', 'dctfweb-arquivos');

export type StorageBackend = 'fs' | 'supabase';
export interface StorageUploadResult {
  backend: StorageBackend;
  path: string;
  sha256: string;
  tamanho: number;
}

function selectBackend(): StorageBackend {
  return SUPABASE_URL && SUPABASE_KEY ? 'supabase' : 'fs';
}

function sha256Of(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Monta uma key/path determinístico:
 *   <id_empresa>/<tipo>/<periodo>/<identificador>.<ext>
 * Exemplo: 3/RECIBO_PDF/2025-09/12345678901234.pdf
 */
export function buildStoragePath(p: {
  id_empresa: number;
  tipo: string;
  periodo_apuracao?: string | null;
  identificador: string;
  ext: string;
}): string {
  const periodo = (p.periodo_apuracao || 'sem-pa').replace(/[^0-9-]/g, '');
  const safeId = p.identificador.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  return `${p.id_empresa}/${p.tipo}/${periodo}/${safeId}.${p.ext}`;
}

// ──────────────────────────────────────────────────────────────────────────
// FILESYSTEM
// ──────────────────────────────────────────────────────────────────────────
async function fsUpload(relPath: string, data: Buffer): Promise<void> {
  const full = path.join(FS_ROOT, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}
async function fsDownload(relPath: string): Promise<Buffer> {
  const full = path.join(FS_ROOT, relPath);
  return fs.readFile(full);
}
async function fsDelete(relPath: string): Promise<void> {
  const full = path.join(FS_ROOT, relPath);
  await fs.unlink(full).catch(() => {});
}

// ──────────────────────────────────────────────────────────────────────────
// SUPABASE STORAGE (REST)
// ──────────────────────────────────────────────────────────────────────────
async function supabaseUpload(relPath: string, data: Buffer, contentType: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase Storage não configurado');
  const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(relPath)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(data),
  });
  if (!resp.ok) {
    throw new Error(`Supabase upload falhou: HTTP ${resp.status} ${await resp.text().catch(() => '')}`);
  }
}
async function supabaseDownload(relPath: string): Promise<Buffer> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase Storage não configurado');
  const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(relPath)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!resp.ok) throw new Error(`Supabase download falhou: HTTP ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}
async function supabaseDelete(relPath: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(relPath)}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${SUPABASE_KEY}` } }).catch(() => {});
}

// ──────────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ──────────────────────────────────────────────────────────────────────────
export const storageService = {
  backend: selectBackend(),

  async upload(relPath: string, data: Buffer, contentType = 'application/octet-stream'): Promise<StorageUploadResult> {
    const backend = selectBackend();
    if (backend === 'supabase') {
      await supabaseUpload(relPath, data, contentType);
    } else {
      await fsUpload(relPath, data);
    }
    return { backend, path: relPath, sha256: sha256Of(data), tamanho: data.length };
  },

  async download(backend: StorageBackend, relPath: string): Promise<Buffer> {
    return backend === 'supabase' ? supabaseDownload(relPath) : fsDownload(relPath);
  },

  async delete(backend: StorageBackend, relPath: string): Promise<void> {
    return backend === 'supabase' ? supabaseDelete(relPath) : fsDelete(relPath);
  },

  info(): string {
    return selectBackend() === 'supabase'
      ? `Supabase Storage bucket=${SUPABASE_BUCKET}`
      : `Filesystem em ${FS_ROOT}`;
  },
};

log.info(`[storage] backend ativo: ${storageService.info()}`);
