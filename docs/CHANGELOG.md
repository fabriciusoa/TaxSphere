# Histórico de alterações — TaxSphere / MindTax

Todas as mudanças relevantes do monorepo são registradas aqui. O formato segue ideias do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), com datas e descrições em português para facilitar auditoria e onboarding.

---

## [Unreleased] — 2026-05-12

Publicação das alterações acumuladas no branch `main` para o repositório remoto: [github.com/tmarocki/taxsphere](https://github.com/tmarocki/taxsphere).

### Visão geral

Este conjunto de mudanças aprofunda o módulo **PER/DCOMP** (documentos oficiais, recibos, relatórios analíticos), expande a integração **eCAC** (certificados, sincronização, importação de documentos e saldos) e melhora a experiência do **simulador** e do **dashboard**. Há também infraestrutura de **contexto de empresa** na UI, página dedicada de **certificados** e diversos serviços auxiliares no backend (parser de recibos, cookies Edge, normalização de status e créditos eCAC).

### Backend (`web/backend`)

#### Rotas e controladores

- **PER/DCOMP — documentos oficiais** (`perdcompDocumentosController`): listagem, CRUD, atualização de status, histórico do documento; vínculo com **crédito tributário** e **débitos** por documento; **responsável pelo preenchimento**; **recibos** (listagem geral e por documento, criação e exclusão).
- **PER/DCOMP — relatórios** (`perdcompRelatoriosController`): endpoints agregados para `dashboard`, `saldos-disponiveis`, `prescricao`, `retrabalho`, `compensacoes-em-risco` e `controle-consolidado`.
- **PER/DCOMP — núcleo** (`perdcompController`, `perdcompRegraService`, validadores): refatoração e alinhamento com o novo modelo de documentos e regras; ajustes em schemas Zod onde aplicável.
- **eCAC** (`ecacController`, `ecacService`): ampliação de fluxos de certificado (upload, validação, autenticação, sessão, instalação, captura de sessão Edge); sincronização (manual, automática, pausar/retomar/cancelar, histórico e status); listagem de documentos PER/DCOMP importados; download de recibo em PDF; débitos compensados por documento; ações de baixa de recibos e sincronização de saldos.

#### Serviços e utilitários novos ou relevantes

- `ecacCreditoService` — lógica de créditos no contexto eCAC.
- `ecacStatusNormalizer` — normalização de status retornados pelas integrações.
- `edgeCookieService` — suporte a fluxos que dependem de cookies/sessão via Edge.
- `perdcompReciboParser` — interpretação estruturada de dados de recibos para conciliação e relatórios.
- `ensurePerdcompSchema` — garantia/alinhamento de schema de banco para entidades PER/DCOMP.

#### Banco e servidor

- `database/connection.ts` — ajustes de conexão/configuração conforme ambiente.
- `server.ts` — integração de novos recursos (middlewares, jobs ou rotas conforme implementação atual).

#### Scripts (`web/backend/scripts`)

Scripts de manutenção e diagnóstico (não contêm credenciais versionadas; **não** versionamos `set_user_password.mjs` nem SQLs de reset de senha na raiz — ver `.gitignore`):

- SQL: `drop_dead_perdcomp_tables.sql`
- Node/TS: testes de dashboard, relatórios, consolidado, parser, sync de saldos, reparse de recibos, cancelamento de syncs órfãs, checagens de PDF/recibos, etc.

### Frontend (`web/frontend`)

#### Páginas e fluxos

- **Documentos PER/DCOMP** (`DocumentosPage.tsx`) — gestão central de documentos oficiais alinhada às novas APIs.
- **Relatórios** (`RelatoriosPage.tsx`) — consumo dos endpoints `/perdcomp/relatorios/*` com exportação auxiliar (`reportExport.ts`).
- **Assistente / wizard** (`PerdcompWizardPage.tsx`) — fluxo guiado quando aplicável ao negócio.
- **Simulador** (`SimuladorPage.tsx`) — melhorias de UX, parsing e histórico sugerido.
- **Dashboard PER/DCOMP** (`PerdcompDashboardPage.tsx`) — métricas e visão consolidada atualizadas.
- **Integração eCAC** (`EcacIntegracaoPage.tsx`) — telas alinhadas aos novos endpoints (certificados, sync, documentos importados).
- **Créditos / débitos** — pequenos ajustes de consistência com o modelo por documento.
- **Certificados** (`CertificadosPage.tsx`) — área dedicada à gestão de certificados digitais.
- **Perfis** (`PerfisPage.tsx`) — ajustes de permissões ou UI conforme backend.

#### Componentes e contexto

- `EmpresaContext.tsx` — estado global da empresa selecionada para filtros e chamadas à API.
- `EmpresaAutocomplete.tsx` — seleção de empresa reutilizável.

#### Serviços e tipos

- `perdcompDocumentosService.ts`, `perdcompRelatoriosService.ts` — clientes HTTP para os novos módulos.
- Atualizações em `perdcompService.ts`, `ecacService.ts`, `types/perdcomp.ts`.

#### Navegação e identidade visual

- `App.tsx`, `MainLayout.tsx` — novas rotas e ajustes de menu; integração com logos (`public/logo_ts.png`, `imagens/TS_Sphere.png`, `TaxSphere_clean.png`).
- `theme.ts` — refinamento visual (TaxSphere).

### Monorepo raiz

- `package-lock.json` — lockfile atualizado para workspaces `backend` e `frontend`.
- Dependências em `web/backend/package.json` e `web/frontend/package.json` alinhadas às features (ex.: geração de relatórios, PDFs, calendário, etc., conforme `package.json` de cada workspace).

### Documentação e repositório

- `README.md` — link explícito para este changelog e para o GitHub.
- Pasta **`PERDCOMP/`** na raiz do repositório no disco local (~1,3 GB de material de referência) **não é versionada**. No `.gitignore` a entrada é **`/PERDCOMP/`** (âncora na raiz) para **não** confundir com o código em `web/frontend/src/pages/perdcomp/` em sistemas de ficheiros **case-insensitive** (por exemplo Windows).

### O que não entra no Git (política de segurança)

Arquivos ignorados propositalmente:

- Variáveis `.env*` (já na política existente).
- `.claude/`, `temp_img/`, `web/backend/temp/`, `web/frontend/.next/`, `web/logs/`.
- SQLs de desenvolvimento na raiz e script `set_user_password.mjs` com credenciais de exemplo.

### Migração / operação

1. Instalar dependências na raiz: `npm install`.
2. Configurar `.env` no backend e frontend conforme `README.md`.
3. Executar migrações ou scripts de schema exigidos pelo ambiente (PostgreSQL/SQLite conforme `connection.ts` e documentação de banco do projeto).
4. Subir `npm run dev:backend` e `npm run dev:frontend` (ou `npm run dev` em ambientes que suportem o script composto).

### Referência de API (resumo)

| Área | Prefixo principal | Observação |
|------|-------------------|------------|
| PER/DCOMP créditos/débitos/dashboard/simulador | `/perdcomp/...` | Endpoints existentes mantidos ou ajustados |
| PER/DCOMP documentos | `/perdcomp/documentos`, `/perdcomp/recibos` | Novo módulo |
| PER/DCOMP relatórios | `/perdcomp/relatorios/*` | Agregações analíticas |
| eCAC | `/ecac/certificados`, `/ecac/sincronizar`, `/ecac/perdcomp-documentos`, etc. | Fluxo completo de certificado e sync |

Para a lista exata de rotas, consulte `web/backend/src/routes/index.ts`.

---

## Legenda de tipos de mudança

- **Adicionado** — funcionalidade nova.
- **Alterado** — mudança em comportamento ou API compatível.
- **Corrigido** — correção de bug.
- **Removido** — funcionalidade retirada.
- **Segurança** — correções ou políticas relacionadas a vulnerabilidades ou dados sensíveis.

---

## Versões anteriores

Alterações publicadas antes deste arquivo passarem a ser mantidas aqui podem ser consultadas no histórico do Git:

```bash
git log --oneline --decorate
```

Repositório remoto: [https://github.com/tmarocki/taxsphere](https://github.com/tmarocki/taxsphere).
