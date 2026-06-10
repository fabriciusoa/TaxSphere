# TaxSphere

Plataforma fiscal (PER/DCOMP, DCTFWeb, e-CAC) — monorepo npm workspaces.

## Estrutura

- `web/backend` — Express + TypeScript, rodado com **`tsx watch`**. Porta **3000**, rotas sob **`/api`**.
- `web/frontend` — Vite + React + **MUI v7**. Porta **5173**, faz proxy de `/api` → `http://localhost:3000`.
- Workspaces: `backend` e `frontend` (a partir da raiz).

## Como rodar (Mac/Linux)

```bash
nvm use            # Node v24 (via nvm)
npm run dev        # sobe backend (3000) + frontend (5173) juntos
# ou separados:
npm run dev:backend
npm run dev:frontend
```

- O backend precisa de `web/backend/.env` com **`DATABASE_ENV=supabase`** (Postgres local não roda nesta máquina). `DATABASE_URL` = Supabase; `DATABASE_URL_LOCAL` = local.
- Login de dev: `fabriciusoa@gmail.com` / `admin`. Auth = cookie httpOnly JWT `token`.
- **`tsx watch` às vezes falha em recarregar** e serve código antigo silenciosamente — se uma mudança no backend "não pegar", reinicie `npm run dev:backend`.

## Banco

Supabase PostgreSQL. Acesso via `web/backend/src/database/connection.ts` (`getOne`, `getAll`, `runQuery`). Schema garantido em runtime por `ensureDctfwebSchema.ts` / `ensurePerdcompSchema.ts` + `src/database/sql/`.

- **Sempre placeholders PostgreSQL `$1, $2`** (nunca `?` do SQLite) e `CURRENT_DATE`/`NOW()`.
- Tabelas-chave: `adm_empresas` (empresas — NÃO `perdcomp_empresas`, que é legado/vazio), `adm_usuarios`, `certificados_digitais`, `dctfweb_darfs`, `ecac_perdcomp_documentos`.

## Convenções

- **MUI v7 Grid**: use `<Grid size={{ xs: 12, md: 6 }}>`. A sintaxe v5 (`<Grid item xs={12} md={6}>`) **quebra em todos os browsers** — não use.
- O app precisa rodar em **Mac e Windows**, em Edge/Chrome/Safari. Não introduza dependências de um SO só sem branch por plataforma.

## RPA e-CAC (Playwright)

`web/backend/src/services/ecacService.ts` automatiza o portal e-CAC da Receita via Playwright. Pontos críticos:

- **Login com certificado é específico por SO** (escolhido pelo SO do *servidor*, exposto em `GET /api/health` → `platform`):
  - **Windows**: PFX → Windows Cert Store (PowerShell) + Edge real (2 passos: `instalar-certificado` → `capturar-sessao-edge`).
  - **macOS**: PFX → Keychain temporária + **Google Chrome real** (`channel:'chrome'`), 1 passo (`autenticar`, captura automática). Precisa do Chrome em `/Applications`.
- **NUNCA use Playwright `clientCertificates` contra gov.br/e-CAC**: o WAF (F5) derruba o proxy TLS interno do Playwright (`ERR_CONNECTION_CLOSED`) em todos os domínios. Só o store do SO + navegador real passa.
- PEM de PKCS#12 ICP-Brasil: extraia com **node-forge** (cifra legada RC2/3DES; BoringSSL/LibreSSL rejeitam).
- Instalação dos browsers do Playwright neste Mac: o instalador padrão trava na extração — baixe o zip com `curl` e extraia com `unzip` nativo. Precisa do Chromium completo (headed) **e** do headless shell.

## Verificação

Login real para testes E2E: POST `/api/auth/login` `{email, senha}` → cookie. Frontend: campos `#login-email`/`#login-senha`, submit `button[type=submit]`; página de certificados em `/configuracoes/certificados`.
