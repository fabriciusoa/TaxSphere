# Banco de Dados — MindTax Backend

**Banco:** PostgreSQL (hospedado no [Supabase](https://supabase.com))  
**Driver:** `pg ^8.13.3` + `@types/pg ^8.11.10`  
**Arquivo de conexão:** `web/backend/src/database/connection.ts`  
**DDL das tabelas:** `web/backend/src/database/sql/`

---

## Índice

1. [Configuração e Variáveis de Ambiente](#1-configuração-e-variáveis-de-ambiente)
2. [Arquitetura da Conexão](#2-arquitetura-da-conexão)
3. [Helpers de Banco — API Completa](#3-helpers-de-banco--api-completa)
4. [Regras de Programação](#4-regras-de-programação)
5. [Transações](#5-transações)
6. [Tabelas do Sistema](#6-tabelas-do-sistema)
7. [Relacionamentos Principais](#7-relacionamentos-principais)
8. [Padrões de Query](#8-padrões-de-query)
9. [Datas e Funções PostgreSQL](#9-datas-e-funções-postgresql)
10. [Boas Práticas e Avisos](#10-boas-práticas-e-avisos)

---

## 1. Configuração e Variáveis de Ambiente

### `.env` (backend)

```env
DATABASE_URL=postgresql://postgres:[SENHA]@db.[PROJECT-REF].supabase.co:5432/postgres
```

A variável `DATABASE_URL` é a **única configuração de banco necessária**. O servidor falha imediatamente ao iniciar se ela não estiver definida.

> **Nunca** commite o `.env` com credenciais reais. Use `.env.example` para documentar as variáveis.

### Configuração do Pool

| Parâmetro               | Valor   | Descrição                                        |
|-------------------------|---------|--------------------------------------------------|
| `max`                   | `10`    | Máximo de conexões simultâneas no pool           |
| `idleTimeoutMillis`     | `30000` | Fecha conexão ociosa após 30 segundos            |
| `connectionTimeoutMillis` | `5000` | Erro se não conseguir conexão em 5 segundos     |
| `ssl.rejectUnauthorized` | `false` | Aceita o certificado autoassinado do Supabase   |

O SSL é **obrigatório** — o Supabase exige conexão criptografada.

---

## 2. Arquitetura da Conexão

```
connection.ts
│
├── pool (Pool)                  ← singleton compartilhado pela aplicação
│
├── runQuery(sql, params?, client?)    ← INSERT / UPDATE / DELETE
├── getOne<T>(sql, params?, client?)  ← SELECT que retorna 0 ou 1 linha
├── getAll<T>(sql, params?, client?)  ← SELECT que retorna N linhas
│
├── beginTransaction()          ← retorna PoolClient exclusivo
├── commitTransaction(client)   ← COMMIT + libera cliente ao pool
└── rollbackTransaction(client) ← ROLLBACK + libera cliente ao pool
```

Todos os helpers aceitam um `client?: PoolClient` opcional. Quando passado, a query é executada dentro da transação desse cliente. Quando omitido, a query usa o pool diretamente.

---

## 3. Helpers de Banco — API Completa

### `runQuery` — modificações (INSERT / UPDATE / DELETE)

```typescript
import { runQuery } from '../database/connection';

const result = await runQuery(sql, params?, client?);
// result.id       → valor de RETURNING id (0 se a query não incluir RETURNING id)
// result.lastID   → alias de result.id (retrocompatibilidade)
// result.changes  → número de linhas afetadas (rowCount)
```

**Exemplo — INSERT com ID gerado:**
```typescript
const { id } = await runQuery(
  `INSERT INTO chamado (titulo, status, criado_em)
   VALUES ($1, $2, $3)
   RETURNING id`,
  ['Título do chamado', 'Aberto', getCurrentTimestamp()]
);
// id contém o ID gerado pelo banco
```

**Exemplo — UPDATE simples:**
```typescript
await runQuery(
  'UPDATE usuarios SET ultimo_login = $1 WHERE id = $2',
  [getCurrentTimestamp(), userId]
);
```

---

### `getOne<T>` — busca um registro

```typescript
import { getOne } from '../database/connection';

const usuario = await getOne<Usuario>('SELECT * FROM usuarios WHERE id = $1', [id]);
// Retorna T | undefined
// Se não encontrar, retorna undefined (nunca lança exceção por "não encontrado")
```

**Exemplo — verificação de existência:**
```typescript
const existente = await getOne<{ id: number }>(
  'SELECT id FROM adm_planos WHERE LOWER(descricao) = LOWER($1)',
  [descricao.trim()]
);
if (existente) {
  return res.status(409).json({ error: 'Plano já existe' });
}
```

---

### `getAll<T>` — busca múltiplos registros

```typescript
import { getAll } from '../database/connection';

const planos = await getAll<Plano>(
  'SELECT * FROM adm_planos WHERE ativo = $1 ORDER BY valor ASC',
  ['S']
);
// Retorna T[] — array vazio se não encontrar nada (nunca undefined)
```

---

## 4. Regras de Programação

### ✅ Placeholder: sempre `$N` (nunca `?`)

O driver `pg` usa placeholders posicionais `$1`, `$2`, `$3`...  
O driver SQLite usava `?`. **Usar `?` no PostgreSQL causa erro de runtime.**

```typescript
// ✅ CORRETO
await getOne('SELECT * FROM usuarios WHERE email = $1', [email]);

// ❌ ERRADO — não funciona com pg
await getOne('SELECT * FROM usuarios WHERE email = ?', [email]);
```

---

### ✅ Queries dinâmicas: padrão push-then-`$N`

Para queries onde colunas/condições são opcionais, use o padrão de empurrar o valor para o array **antes** de montar o placeholder:

```typescript
const sets: string[] = [];
const vals: any[] = [];

if (titulo !== undefined) {
  vals.push(titulo);
  sets.push(`titulo = $${vals.length}`);
}
if (status !== undefined) {
  vals.push(status);
  sets.push(`status = $${vals.length}`);
}

vals.push(id);
await runQuery(
  `UPDATE chamado SET ${sets.join(', ')} WHERE id = $${vals.length}`,
  vals
);
```

O mesmo padrão para `WHERE` dinâmico:

```typescript
const whereConditions = ['1=1'];
const params: any[] = [];

if (userId) {
  params.push(userId);
  whereConditions.push(`c.id_usuario = $${params.length}`);
}
if (status) {
  params.push(status);
  whereConditions.push(`c.status = $${params.length}`);
}

// LIMIT e OFFSET também entram no array de params
params.push(limit);
const limitIdx = params.length;
params.push(offset);
const offsetIdx = params.length;

const sql = `
  SELECT * FROM chamado c
  WHERE ${whereConditions.join(' AND ')}
  ORDER BY criado_em DESC
  LIMIT $${limitIdx} OFFSET $${offsetIdx}
`;
```

---

### ✅ Cláusula `RETURNING id` para obter o ID gerado

O `pg` não expõe o `lastInsertRowid` do SQLite. Para obter o ID de um INSERT, adicione `RETURNING id` ao SQL:

```typescript
const { id: novoId } = await runQuery(
  `INSERT INTO perdcomp_creditos (id_empresa, tipo_credito, valor_original)
   VALUES ($1, $2, $3)
   RETURNING id`,
  [id_empresa, tipo_credito, valor_original]
);
```

---

### ✅ `IN` com lista dinâmica

```typescript
const ids = [1, 2, 3];
const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

const rows = await getAll<any>(
  `SELECT * FROM adm_planos WHERE id IN (${placeholders})`,
  ids
);
```

---

### ✅ Import correto

```typescript
// Importar apenas o que for usar
import { getOne, getAll, runQuery } from '../database/connection';
import { beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
```

**Não existe export `db`** — o objeto `db` era do SQLite e foi removido. Usar `db` causa erro de compilação.

---

## 5. Transações

Use transações quando **duas ou mais queries precisam ser atômicas** — ou seja, todas devem ter sucesso ou todas devem ser revertidas.

### Template padrão

```typescript
import {
  runQuery,
  beginTransaction,
  commitTransaction,
  rollbackTransaction
} from '../database/connection';

const client = await beginTransaction();
try {
  await runQuery('UPDATE tabela_a SET col = $1 WHERE id = $2', [val, id], client);
  await runQuery('INSERT INTO tabela_b (col) VALUES ($1)', [val], client);
  await commitTransaction(client);
} catch (err) {
  await rollbackTransaction(client);
  throw err; // relança para o catch do controller tratar
}
```

> **Importante:** o `client` deve ser passado como **terceiro argumento** para todas as queries que pertencem à transação. Queries executadas **sem** o `client` usam o pool diretamente e **não fazem parte** da transação.

### Onde transações são usadas no projeto

| Controller | Operação |
|---|---|
| `ecacController` — `upload` | `UPDATE ativo=0` nos certificados antigos + `INSERT` do novo |
| `dctfwebController` — `criar` | `INSERT` da declaração + loop de `INSERT` nos tributos |
| `admPlanosController` — `criar` | `INSERT` do plano + loop de `INSERT` nos itens |
| `admPlanosController` — `atualizar` | `UPDATE` do plano + `DELETE` dos itens + loop de `INSERT` nos novos itens |
| `perdcompController` — `atualizarStatus` ('Transmitido') | `UPDATE` do pedido + loop de `UPDATE` em créditos e débitos |
| `chamadosController` — `criarComentario` | `INSERT` do comentário + `UPDATE` do timestamp do chamado |
| `authController` — `login` (bloqueio) | `UPDATE` de tentativas/bloqueio + `INSERT` no `login_log` |
| `authController` — `login` (sucesso) | `UPDATE` de último login + `INSERT` no `login_log` |
| `emailTemplatesController` — `atualizar` | `SELECT` + `UPDATE` ou `INSERT` (upsert atômico) |

---

## 6. Tabelas do Sistema

### Núcleo de Autenticação e Usuários

| Tabela | Descrição | PK |
|---|---|---|
| `perfil` | Perfis de acesso (`ADMIN`, `USER`, etc.) | `id SERIAL` |
| `clientes` | Empresas/clientes do sistema | `id SERIAL` |
| `usuarios` | Usuários de acesso ao sistema | `id SERIAL` |
| `login_log` | Histórico de tentativas de login | `id SERIAL` |
| `parametros` | Configurações do sistema (chave-valor) | `id SERIAL` |
| `email_templates` | Templates de e-mail por usuário | `id SERIAL` |

### Assinaturas e Planos (Stripe)

| Tabela | Descrição | PK |
|---|---|---|
| `adm_planos` | Planos de assinatura disponíveis | `id SERIAL` |
| `adm_plano_itens` | Itens/features de cada plano | `id SERIAL` |
| `adm_assinatura` | Assinantes ativos | `id SERIAL` |
| `adm_stripe_webhook_events` | Eventos Webhook recebidos do Stripe (idempotência) | `id SERIAL` |
| `adm_stripe_audit_log` | Log de auditoria de todas as operações Stripe | `id SERIAL` |

### PERDComp (Compensação Tributária)

| Tabela | Descrição | PK |
|---|---|---|
| `perdcomp_empresas` | Empresas cadastradas no módulo PERDComp | `id SERIAL` |
| `perdcomp_creditos` | Créditos tributários disponíveis | `id SERIAL` |
| `perdcomp_debitos` | Débitos tributários a compensar | `id SERIAL` |
| `perdcomp_pedidos` | Pedidos de compensação/restituição | `id SERIAL` |
| `perdcomp_pedido_itens` | Itens (créditos/débitos) de cada pedido | `id SERIAL` |
| `perdcomp_historico` | Histórico de alterações nos pedidos | `id SERIAL` |
| `perdcomp_alertas` | Alertas de prescrição e vencimento | `id SERIAL` |
| `perdcomp_documentos` | Documentos anexados aos pedidos | `id SERIAL` |
| `perdcomp_selic_taxas` | Histórico das taxas SELIC mensais | `id SERIAL` |

### DCTFWeb

| Tabela | Descrição | PK |
|---|---|---|
| `dctfweb_declaracoes` | Declarações DCTFWeb | `id SERIAL` |
| `dctfweb_tributos` | Tributos detalhados de cada declaração | `id SERIAL` |

### eCAC e Certificados

| Tabela | Descrição | PK |
|---|---|---|
| `certificados_digitais` | Certificados A1/A3 (PFX criptografado) | `id SERIAL` |
| `ecac_sincronizacoes` | Histórico de sincronizações com o eCAC | `id SERIAL` |

### Suporte (Chamados)

| Tabela | Descrição | PK |
|---|---|---|
| `chamado` | Chamados de suporte | `id SERIAL` |
| `chamado_comentario` | Comentários nos chamados | `id SERIAL` |
| `chamados_anexos` | Anexos (imagens/PDFs) dos comentários | `id SERIAL` |

### Outros

| Tabela | Descrição | PK |
|---|---|---|
| `notificacao` | Fila e histórico de notificações enviadas | `id SERIAL` |
| `manutencoes` | Janelas de manutenção programada | `id SERIAL` |
| `cron_execucoes` | Log de execução dos jobs agendados | `id SERIAL` |
| `post` | Posts/artigos do sistema | `id SERIAL` |
| `empresas` | Empresas (módulo genérico) | `id SERIAL` |
| `contrato` | Contratos de clientes | `id SERIAL` |
| `formas_recebimento` | Formas de recebimento configuradas | `id SERIAL` |

---

## 7. Relacionamentos Principais

```
perfil ──────────────────────────── usuarios (perfil → perfil.id)
clientes ────────────────────────── usuarios (cliente_id → clientes.id)
usuarios ────────────────────────── login_log (usuario_id → usuarios.id)
usuarios ────────────────────────── email_templates (id_usuario → usuarios.id)
adm_planos ──────────────────────── adm_plano_itens (id_adm_plano → adm_planos.id)
adm_planos ──────────────────────── adm_assinatura (id_adm_plano → adm_planos.id)
adm_assinatura ──────────────────── adm_stripe_audit_log (id_assinatura → adm_assinatura.id)
perdcomp_empresas ───────────────── perdcomp_creditos (id_empresa → perdcomp_empresas.id)
perdcomp_empresas ───────────────── perdcomp_debitos (id_empresa → perdcomp_empresas.id)
perdcomp_empresas ───────────────── perdcomp_pedidos (id_empresa → perdcomp_empresas.id)
perdcomp_empresas ───────────────── certificados_digitais (id_empresa → perdcomp_empresas.id)
perdcomp_pedidos ────────────────── perdcomp_pedido_itens (id_pedido → perdcomp_pedidos.id)
perdcomp_pedidos ────────────────── perdcomp_historico (id_pedido → perdcomp_pedidos.id)
perdcomp_pedidos ────────────────── perdcomp_documentos (id_pedido → perdcomp_pedidos.id)
dctfweb_declaracoes ─────────────── dctfweb_tributos (id_declaracao → dctfweb_declaracoes.id)
chamado ─────────────────────────── chamado_comentario (id_chamado → chamado.id)
chamado_comentario ──────────────── chamados_anexos (id_chamado_comentario → chamado_comentario.id)
certificados_digitais ───────────── ecac_sincronizacoes (id_certificado → certificados_digitais.id)
```

---

## 8. Padrões de Query

### SELECT com JOIN e aliases

```typescript
const chamado = await getOne<any>(`
  SELECT
    c.*,
    u.nome   AS usuario_nome,
    u.email  AS usuario_email,
    ua.nome  AS atribuido_nome
  FROM chamado c
  INNER JOIN usuarios u  ON c.id_usuario = u.id
  LEFT  JOIN usuarios ua ON c.id_usuario_atribuido = ua.id
  WHERE c.id = $1
`, [id]);
```

### Paginação

```typescript
const offset = (page - 1) * limit;
const params: any[] = [...filtros];

params.push(limit);
const limitIdx = params.length;
params.push(offset);
const offsetIdx = params.length;

const rows = await getAll(`
  SELECT * FROM tabela
  WHERE ...
  ORDER BY criado_em DESC
  LIMIT $${limitIdx} OFFSET $${offsetIdx}
`, params);
```

### Contagem + dados na mesma paginação

```typescript
// Primeiro, conta com os mesmos filtros (sem LIMIT/OFFSET)
const countResult = await getOne<{ total: number }>(
  `SELECT COUNT(*) AS total FROM tabela WHERE ${whereClause}`,
  params
);
const total = countResult?.total || 0;

// Depois busca a página
params.push(limit);
params.push(offset);
const data = await getAll(`SELECT ... LIMIT $N OFFSET $N`, params);
```

### Upsert manual (SELECT + UPDATE ou INSERT)

```typescript
const existente = await getOne('SELECT id FROM tabela WHERE id_usuario = $1', [userId]);

const client = await beginTransaction();
try {
  if (existente) {
    await runQuery('UPDATE tabela SET col = $1 WHERE id_usuario = $2', [val, userId], client);
  } else {
    await runQuery('INSERT INTO tabela (id_usuario, col) VALUES ($1, $2)', [userId, val], client);
  }
  await commitTransaction(client);
} catch (err) {
  await rollbackTransaction(client);
  throw err;
}
```

### Soft delete

```typescript
// Marcar como inativo em vez de deletar fisicamente
await runQuery(
  `UPDATE adm_planos SET ativo = 'N', dt_alteracao = $1 WHERE id = $2`,
  [new Date().toISOString(), id]
);

// Soft delete com timestamp
await runQuery(
  `UPDATE adm_plano_itens SET dt_exclusao = $1 WHERE id_adm_plano = $2 AND dt_exclusao IS NULL`,
  [new Date().toISOString(), id]
);
```

---

## 9. Datas e Funções PostgreSQL

O PostgreSQL tem funções nativas diferentes do SQLite. Use as funções abaixo ao escrever SQL.

### Mapeamento SQLite → PostgreSQL

| SQLite | PostgreSQL |
|---|---|
| `datetime('now')` | `NOW()` |
| `date('now')` | `CURRENT_DATE` |
| `datetime('now', '+X days')` | `NOW() + INTERVAL 'X days'` |
| `datetime('now', '-X days')` | `NOW() - INTERVAL 'X days'` |
| `date('now', '+6 months')` | `CURRENT_DATE + INTERVAL '6 months'` |
| `julianday(b) - julianday(a)` | `EXTRACT(EPOCH FROM (b - a)) / 86400` |
| `(julianday(b) - julianday(a)) * 24` | `EXTRACT(EPOCH FROM (b - a)) / 3600` |
| `date(col)` | `col::date` |
| `AUTOINCREMENT` | `SERIAL` ou `GENERATED ALWAYS AS IDENTITY` |

### Exemplos de uso no código

```sql
-- Data atual
INSERT INTO tabela (criado_em) VALUES (NOW())

-- Intervalo relativo
WHERE dt_vencimento <= CURRENT_DATE + INTERVAL '6 months'
WHERE criado_em >= CURRENT_DATE - INTERVAL '30 days'
WHERE dt_bloqueio + INTERVAL '30 minutes' > NOW()

-- Comparar data de timestamp com data atual
WHERE criado_em::date = CURRENT_DATE

-- Calcular diferença em horas
EXTRACT(EPOCH FROM (fechado_em::timestamp - criado_em::timestamp)) / 3600 AS horas

-- Calcular diferença em dias
EXTRACT(EPOCH FROM (CURRENT_DATE::timestamp - dt_pagamento_original::timestamp)) / 86400 AS dias
```

### Timestamps no código TypeScript

O `getCurrentTimestamp()` (de `utils/dateHelpers.ts`) retorna uma string ISO 8601 compatível com os campos `TIMESTAMPTZ` do PostgreSQL:

```typescript
import { getCurrentTimestamp } from '../utils/dateHelpers';

await runQuery(
  'INSERT INTO tabela (criado_em, atualizado_em) VALUES ($1, $2)',
  [getCurrentTimestamp(), getCurrentTimestamp()]
);
```

Para campos somente-data:

```typescript
const hoje = new Date().toISOString().substring(0, 10); // '2026-04-14'
```

---

## 10. Boas Práticas e Avisos

### ✅ Checklist para novas queries

- [ ] Usar `$1`, `$2`... (nunca `?`)
- [ ] INSERTs que precisam do ID gerado têm `RETURNING id`
- [ ] Queries dinâmicas usam padrão push-then-`$N`
- [ ] Operações multi-tabela estão dentro de uma transação
- [ ] Datas no SQL usam `NOW()`, `CURRENT_DATE`, `INTERVAL` (nunca `datetime('now')`)
- [ ] Import do helper correto: `getOne` / `getAll` / `runQuery`
- [ ] `getOne` retorna `T | undefined` — sempre verificar antes de usar o resultado

### ✅ Convenções de nomenclatura

- Nomes de tabelas: `snake_case` (ex: `perdcomp_creditos`, `login_log`)
- PKs: sempre `id` com `SERIAL` ou `nextval(sequence)`
- FKs: padrão `id_<tabela_referenciada>` (ex: `id_empresa`, `id_usuario`)
- Timestamps de criação: `criado_em` — Timestamps de atualização: `atualizado_em`
- Flag de ativo: `ativo` (integer `1`/`0` em algumas tabelas, `text` `'S'`/`'N'` em outras)
- Soft delete: campo `dt_exclusao` ou `dt_excluido_em` (null = não excluído)

### ⚠️ Cuidados com tipos

O PostgreSQL é tipado de forma mais estrita que o SQLite. Atenção a:

- **`INTEGER` vs `TEXT`:** não misturar tipos nas comparações
- **`BOOLEAN`:** PostgreSQL aceita `true`/`false` — algumas tabelas legadas usam `1`/`0` como `integer`
- **`TIMESTAMPTZ`:** sempre armazena com fuso horário — retorna objetos `Date` quando lido pelo `pg`
- **`BYTEA`:** tipo para dados binários (substitui `BLOB` do SQLite) — o `pg` retorna como `Buffer`
- **`JSONB`:** tipo nativo para JSON (usado em `adm_stripe_audit_log`) — permite indexação e queries

### ⚠️ Pool de conexões

- **Nunca** chamar `pool.connect()` diretamente fora dos helpers de transação
- **Nunca** fazer `client.release()` manualmente — o `commitTransaction` e `rollbackTransaction` já fazem isso
- Se uma transação abrir e não fechar (sem commit ou rollback), o cliente ficará travado no pool

### ⚠️ Supabase — RLS (Row Level Security)

O Supabase tem RLS ativado por padrão. As tabelas do projeto concedem acesso às roles `anon`, `authenticated`, `postgres` e `service_role`. A conexão usa a role `postgres` via `DATABASE_URL` com a senha do projeto, o que concede acesso irrestrito. **Não expor a `DATABASE_URL` no frontend.**

### 📁 Localização dos arquivos DDL

Todos os scripts de criação de tabela estão em:

```
web/backend/src/database/sql/
├── usuarios.sql
├── clientes.sql
├── perfil.sql
├── parametros.sql
├── login_log.sql
├── email_templates.sql
├── adm_planos.sql
├── adm_plano_itens.sql
├── adm_assinatura.sql
├── adm_stripe_webhook_events.sql
├── adm_stripe_audit_log.sql
├── perdcomp_empresas.sql
├── perdcomp_creditos.sql
├── perdcomp_debitos.sql
├── perdcomp_pedidos.sql
├── perdcomp_pedido_itens.sql
├── perdcomp_historico.sql
├── perdcomp_alertas.sql
├── perdcomp_documentos.sql
├── perdcomp_selic_taxas.sql
├── dctfweb_declaracoes.sql     ← inclui dctfweb_tributos
├── certificados_digitais.sql   ← inclui ecac_sincronizacoes
├── chamado.sql
├── chamado_comentario.sql
├── chamados_anexo.sql
├── cron_execucoes.sql
├── post.sql
├── empresas.sql
├── contrato.sql
└── formas_recebimento.sql
```

Para aplicar o DDL em um banco novo, execute os arquivos na ordem respeitando as dependências de FK (ex: `perfil.sql` e `clientes.sql` antes de `usuarios.sql`).
