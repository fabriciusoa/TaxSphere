import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { log, flushLogsAndExit } from '../utils/logger';
  
dotenv.config();

// Caminho do banco lido do .env (DATABASE_PATH); fallback para o caminho padrão
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(path.resolve(__dirname, '../../../..'), 'data', 'mentis_db.db');

// Validar se o banco de dados existe antes de conectar
if (!fs.existsSync(dbPath)) {
  log.error(`Banco de dados não encontrado: ${dbPath}`);
  log.error('Execute as migrations ou verifique o caminho no arquivo .env (DATABASE_PATH)');
  flushLogsAndExit(1);
}

export const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    log.error(`Verifique o caminho do banco de dados: ${dbPath}`);
    log.error(`Erro ao conectar ao banco de dados: ${err.message}`);
    flushLogsAndExit(1);
  }
  log.info(`Conectado ao banco de dados SQLite: ${dbPath}`);

  db.run('PRAGMA foreign_keys = ON', (fkErr) => {
    if (fkErr) log.warn(`Falha ao ativar foreign_keys: ${fkErr.message}`);
    else log.info('SQLite: PRAGMA foreign_keys = ON');
  });
});

// Função helper para executar queries com Promise
export function runQuery(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Função helper para buscar um único registro
export function getOne<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
}

// Função helper para buscar múltiplos registros
export function getAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

// Fechar conexão ao encerrar processo
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      log.error(`Erro ao fechar banco de dados: ${err.message}`);
      flushLogsAndExit(1);
    } else {
      log.info('Conexão com banco de dados fechada.');
      flushLogsAndExit(0);
    }
  });
});
