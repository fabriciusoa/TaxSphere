# TODO - Segurança: Proteção contra XSS e Headers HTTP

## Legenda
- ⏳ Não iniciado
- 🔄 Em progresso
- ✅ Concluído
- ⚠️ Bloqueado/Aguardando

---

## 🔴 Críticos

### SEC-01 — Instalar e configurar `helmet.js` ✅
- [x] Instalar dependência: `npm install helmet` em `web/backend`
- [x] Adicionar `import helmet from 'helmet'` em `web/backend/src/server.ts`
- [x] Aplicar `app.use(helmet())` logo no topo dos middlewares, antes do `cors`
- [x] Validar que os headers `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` e `Referrer-Policy` estão sendo enviados nas respostas

---

### SEC-02 — Helper de escape HTML para templates Puppeteer (Stored XSS em PDFs) ✅
- [x] Criar utilitário `web/backend/src/utils/htmlHelpers.ts` com função `escapeHtml(str)`
  - Substituir: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`
- [x] Aplicar `escapeHtml()` em todos os campos de texto livre interpolados nos templates PDF:
  - [x] `anamnesesController.ts` — campos: `queixa_principal`, `queixa_secundaria`, `sintoma`, `inicio_patologia`, `tratamentos_anteriores`, `medicamentos`, `hp_*`, `hf_*`, `ex_psi_*`, `hipotese_diag`
  - [x] `atestadosController.ts` — campos de texto livre do template
  - [x] `laudoPsicologicoController.ts` — campos de texto livre do template
  - [x] `contratoController.ts` — campos de texto livre do template
  - [x] `pacientesController.ts` — geração de autorização de menores (`nome`, `responsavel.nome`, `enderecoCompleto`)
  - [x] `declaracoesController.ts` — campos de texto livre do template
  - [x] `lancamentosFinanceirosController.ts` — campos do recibo

---

### SEC-03 — Schema Zod de validação no `manutencaoController` ✅
- [x] Criar schema Zod em `web/backend/src/validators/schemas.ts`:
  - `descricao`: string, mínimo 3, máximo 500 chars
  - `dt_inicio`: string no formato ISO datetime
  - `dt_fim`: string ISO datetime, opcional
  - `status`: enum `['planejada', 'em_execucao', 'terminado']`
- [x] Aplicar schema nas actions `criar` e `atualizar` do `manutencaoController.ts`

---

### SEC-04 — Migração JWT: `localStorage` → `httpOnly cookies` ✅
> **Impacto alto** — refatoração significativa de todo o fluxo de autenticação.
> Depende de SEC-01 e SEC-02 estarem concluídos para reduzir a janela de risco enquanto não é implementado.

- [x] **Backend** (`authController.ts`):
  - [x] No `login`, substituir retorno do token no body por `res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: sessaoHoras * 3600000 })`
  - [x] No `refresh`, idem
  - [x] Criar endpoint `POST /auth/logout` que limpa o cookie com `res.clearCookie('token')`
- [x] **Backend** (`middleware/auth.ts`):
  - [x] Ler token de `req.cookies.token` em vez de `req.headers.authorization`
  - [x] Instalar `cookie-parser`: `npm install cookie-parser` e registrar no `server.ts`
- [x] **Frontend** (`authService.ts`):
  - [x] Remover `localStorage.setItem('token', ...)` — o cookie é gerenciado pelo browser
  - [x] Manter `localStorage.setItem('user', ...)` apenas para dados não-sensíveis (nome, perfil)
- [x] **Frontend** (`api.ts`):
  - [x] Remover interceptor que adiciona `Authorization: Bearer` no header
  - [x] Adicionar `withCredentials: true` na instância axios
- [x] **Frontend** (`PrivateRoute.tsx`):
  - [x] Verificação pode permanecer por `user` no localStorage; o backend valida o cookie em toda requisição
- [x] Validar CORS — `credentials: true` já está configurado no `server.ts`

---

## 🟠 Altos

### SEC-05 — Proteger endpoints `/health` com autenticação ✅
- [x] Em `web/backend/src/routes/index.ts`, adicionar `authenticateToken, requireAdmin` nas rotas:
  - [x] `GET /health/full`
  - [x] `GET /health/dashboard`
- [x] Manter `GET /health` (simples) sem autenticação — usado para monitoramento externo

---

### SEC-06 — Sanitizar HTML em templates de email ✅
- [x] Instalar dependência: `npm install sanitize-html` em `web/backend`
- [x] Instalar tipos: `npm install --save-dev @types/sanitize-html`
- [x] Criar configuração de tags permitidas (whitelist mínima): `<b>`, `<i>`, `<em>`, `<strong>`, `<br>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<span>`
- [x] Aplicar sanitização nos campos `template_texto_confirmacao`, `template_texto_lembrete` e `assinatura` antes de persistir no banco — em `emailTemplatesController.ts`

---

## 🟡 Médios

### SEC-07 — Content Security Policy (CSP) no frontend ✅
- [x] Adicionar meta tag `Content-Security-Policy` em `web/frontend/index.html`
  - `default-src 'self'` — fallback restritivo
  - `script-src 'self'` — sem inline scripts
  - `style-src 'self' 'unsafe-inline'` — necessário para MUI inline styles
  - `img-src 'self' data: blob:` — SVG favicon (data:) + blobs de PDF
  - `font-src 'self' data:` — fontes embutidas
  - `connect-src 'self' ws: wss:` — API relativa + Vite HMR WebSocket
  - `object-src 'none'` — bloqueia plugins (Flash, etc.)
  - `base-uri 'self'` — previne injeção de tag `<base>`
  - `form-action 'self'` — submissão de formulários apenas para mesma origem
- [x] Adicionar `server.headers` em `web/frontend/vite.config.ts` reforçando a mesma política em dev (com `ws://localhost:5173` específico para HMR)
- [x] Em `web/frontend/index.html`, adicionar `<meta http-equiv="Content-Security-Policy">` com política mínima para SPA React:
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  frame-src 'none';
  object-src 'none';
  ```
- [x] Em `web/frontend/vite.config.ts`, adicionar bloco `server.headers` com o mesmo CSP para ambiente de desenvolvimento
- [x] Testar se a aplicação funciona sem erros de CSP no console (Material UI usa estilos inline — pode requerer `'unsafe-inline'` em `style-src`)

---

## ✅ Já Conformes (sem ação necessária)

- **SQL Injection** — todas as queries usam placeholders parametrizados (`?`) em todos os controllers
- **`dangerouslySetInnerHTML`** — zero ocorrências em todos os arquivos `.tsx`
- **URL params refletidos** — `searchParams` nunca são renderizados diretamente (sempre comparados com `=== 'valor'`)
- **CORS origem restrita** — configurado para origem única via variável de ambiente
