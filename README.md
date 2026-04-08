# Sistema de Gestão Fiscal Tributário

Sistema web full stack completo para gestão fiscal/tributário, desenvolvido com Node.js, React, TypeScript, Vite e SQLite.

---

## 📋 Visão Geral

É uma aplicação profissional para gerenciamento completo de funcionalidades Fiscais e Tributárias:

- ✅ PERD/Comp
- ✅ Recuperação de Pis e Cofins
- ✅ MIT
- ✅ DCTF Web
- ✅ Gestão de CND's
- ✅ Sistema de assinaturas com Stripe
- ✅ Caixa Postal eCac
- ✅ Reclassificação de NCM de Produtos
- ✅ Relatórios e dashboards
- ✅ Sistema de chamados/suporte

---

## 🏗️ Arquitetura do Sistema

### Estrutura do Projeto

```
system/
├── package.json              # Configuração do monorepo (NPM Workspaces)
├── web/
│   ├── backend/              # API Node.js + TypeScript + Express + SQLite
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── frontend/             # React + TypeScript + Vite + Material-UI
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
├── data/                     # Banco de dados SQLite
├── docs/                     # Documentação técnica e manuais
└── logs/                     # Logs de aplicação
└── package.json          
```

---

## 🔧 Backend - API REST

### Stack Tecnológico

| Tecnologia | Versão | Finalidade |
|------------|--------|------------|
| Node.js | 18+ | Runtime JavaScript |
| TypeScript | 5.3+ | Tipagem estática |
| Express | 4.18 | Framework web |
| SQLite3 | 6.0 | Banco de dados |
| JWT | 9.0 | Autenticação |
| Bcrypt | 5.1 | Hash de senhas |
| Zod | 3.22 | Validação de schemas |
| Helmet | 8.1 | Segurança HTTP |
| Stripe | 20.4 | Pagamentos e assinaturas |
| Nodemailer | 7.0 | Envio de emails |
| Puppeteer | 24.34 | Geração de PDFs |
| node-cron | 4.2 | Jobs agendados |
| Winston | 3.19 | Logging estruturado |

### Arquitetura em Camadas

```
backend/src/
├── server.ts                    # Entry point + configuração de middlewares
├── routes/
│   └── index.ts                 # Centralizador de rotas (~50+ endpoints)
├── controllers/                 # Camada de requisição/resposta (30+ controllers)
│   ├── authController.ts
│   ├── stripePaymentController.ts
│   └── ...
├── services/                    # Lógica de negócio e integração com DB
├── middleware/
│   ├── auth.ts                  # Validação JWT
│   ├── authorization.ts         # Controle de acesso (roles)
│   └── adaptiveRateLimit.ts     # Proteção anti-brute force
├── database/
│   ├── connection.ts            # Conexão SQLite + helpers
│   └── sql/                     # Migrations SQL versionadas
├── validators/                  # Schemas Zod para validação de entrada
├── jobs/                        # Cron jobs (sincronização Stripe, trials, etc)
│   ├── stripeCustomerSyncJob.ts
│   ├── abandonedSubscriptionsJob.ts
│   ├── trialExpirationJob.ts
│   └── stripeReconciliationJob.ts
├── utils/                       # Funções auxiliares
├── types/                       # TypeScript interfaces globais
└── config/                      # Configurações (Stripe, etc)
```

### Principais Recursos

**Funcionalidades:**
- RESTful API com ~50+ endpoints
- Autenticação segura via JWT em cookies httpOnly
- Rate limiting adaptativo por IP e token
- Validação robusta com Zod em todas as entradas
- Logs estruturados com Winston
- Jobs automatizados: sincronização Stripe, expiração trials, reconciliação financeira
- Upload de arquivos (PDF, DOC, imagens) via Multer
- Geração de PDFs dinâmicos com Puppeteer

**Segurança:**
- JWT em cookies httpOnly (proteção contra XSS)
- Rate limiting adaptativo por IP e token
- Sanitização XSS com sanitize-html
- Helmet para headers de segurança
- HTTPS redirect automático em produção
- CORS configurado por ambiente
- Validação Zod em todos os endpoints
- Upload de arquivos validado (tipo, tamanho)

---

## 🎨 Frontend - SPA React

### Stack Tecnológico

| Tecnologia | Versão | Finalidade |
|------------|--------|------------|
| React | 19.2 | Biblioteca UI |
| TypeScript | 5.9 | Tipagem estática |
| Vite | 7.2 | Build tool + dev server |
| React Router | 6.21 | Roteamento SPA |
| Material-UI (MUI) | 7.3 | Componentes UI |
| MUI X Data Grid | 8.27 | Tabelas avançadas |
| FullCalendar | 6.1 | Agenda interativa |
| Axios | 1.6 | Cliente HTTP |
| Zod | 3.22 | Validação de formulários |
| date-fns | 2.30 | Manipulação de datas |
| Stripe React | 5.6/8.9 | Componentes de pagamento |
| Recharts | 3.7 | Gráficos e dashboards |

### Arquitetura de Componentes

```
frontend/src/
├── main.tsx                     # Entry point + providers globais (Theme, Auth, etc)
├── App.tsx                      # Rotas + lazy loading de páginas
├── pages/                       # 35+ páginas (code splitting automático)
│   ├── LoginPage.tsx            # Autenticação
│   ├── DashboardPage.tsx        # Visão geral e métricas
│   └── ...
├── components/                  # Componentes reutilizáveis
│   ├── Layout/                  # AppBar, Sidebar, Footer
│   ├── PrivateRoute.tsx         # Proteção de rotas autenticadas
│   ├── PaymentForm.tsx          # Formulário Stripe
│   ├── AnexosUpload.tsx
│   └── ...
├── contexts/
│   ├── AuthContext.tsx          # Estado de autenticação + controle de sessão
├── services/                    # 30+ API clients (Axios)
│   ├── api.ts                   # Configuração base do Axios
│   ├── authService.ts
│   └── ...
├── validators/                  # Schemas Zod compartilhados
├── types/                       # TypeScript interfaces
├── utils/                       # Funções auxiliares (formatação, etc)
└── theme.ts                     # Tema customizado Material-UI
```

### Principais Recursos

**Funcionalidades:**
- SPA otimizado com lazy loading de rotas (code splitting)
- Autenticação persistente via JWT em cookies
- Controle de acesso baseado em roles (admin, etc)
- Sistema de assinaturas integrado com Stripe
- Upload de anexos (fotos, documentos)
- Notificações em tempo real

**Performance:**
- Lazy loading de todas as páginas (code splitting)
- Assets com hash para cache imutável
- Componentes MUI tree-shakeable
- Build otimizado com Vite
- Cache de requisições HTTP

---

###  Fluxo de Comunicação

```
Frontend (React)  ←→  Backend (Express)  ←→  Database (SQLite)
    :5173              :3000                   data/database.db
    
• HTTP/HTTPS + JSON
• JWT em cookies httpOnly
• CORS configurado por ambiente
```
**Autenticação:**

1. Login: POST /api/auth/login → retorna JWT em cookie httpOnly
2. Requisições autenticadas: cookie enviado automaticamente
3. Middleware authenticateToken valida JWT
4. Logout: cookie é limpo

**Ambiente de Desenvolvimento**

- Frontend: http://localhost:5173 (Vite dev server)
- Backend: http://localhost:3000 (Express)
- CORS habilitado entre 5173 ↔ 3000

**Ambiente de Produção**

- Backend serve frontend compilado (dist/)
- Mesma origem → CORS desabilitado
- HTTPS obrigatório (redirect automático)
- Assets com cache de 1 ano

---
## 💾 Banco de Dados

### SQLite3 (`data/mentis_db.db`)

**Principais Tabelas (30+):**

| Categoria | Tabelas |
|-----------|---------|
| **Usuários** | `usuarios`, `perfis`, `login_logs` |
| **Assinaturas** | `assinaturas_planos`, `assinaturas` |
| **Sistema** | `parametros` |
| **Suporte** | `chamados` |
| **Logs** | `cron_execucoes`|

### Sistema de Migrations

- Migrations versionadas em `backend/src/database/sql/`

---

## ⚙️ Jobs Automatizados (Cron)

Executados via `node-cron` no backend:

| Job | Agendamento | Função |
|-----|-------------|--------|
| **Stripe Customer Sync** | Diário às 2h | Sincroniza dados de clientes com Stripe |
| **Abandoned Subscriptions** | Diário às 3h | Detecta assinaturas incompletas |
| **Trial Expiration** | Diário às 4h | Notifica usuários sobre fim de trial |
| **Stripe Reconciliation** | Diário às 5h | Reconcilia pagamentos e assinaturas |

Logs salvos em `cron_execucoes` com status e mensagens de erro.

---

## 🔐 Segurança

### Backend
- ✅ Helmet (security headers)
- ✅ Rate limiting adaptativo anti-brute force
- ✅ Sanitização XSS em todos os inputs
- ✅ Validação Zod em todos os endpoints
- ✅ JWT com expiração configurável
- ✅ Cookies httpOnly (anti-XSS)
- ✅ HTTPS obrigatório em produção
- ✅ Upload de arquivos validado (tipo + tamanho)
- ✅ CORS configurado por ambiente

### Frontend
- ✅ Validação client-side com Zod
- ✅ Sanitização de inputs antes do envio
- ✅ Rotas protegidas (PrivateRoute + roles)
- ✅ CSP headers via meta tag
- ✅ Timeout automático de sessão

---

## 📂 Repositório

Repositório: https://github.com/tmarocki/fmt_system.git

### 🌿 Branches

| Branch | Propósito |
|---|---|
| `main` | Produção — deploy automático |
| `qa` | Homologação — deploy automático  |
| `desenv` | Correção de bugs e Novas funcionalidades |

### Fluxo de trabalho

```bash
# Criar nova feature a partir da desenv
git checkout desenv
git checkout -b feature/nome-da-feature

# Após concluir, abrir PR: feature/* → desenv
# Quando pronto para homologação, abrir PR: desenv → qa
# Quando pronto para produção, abrir PR: qa → main
```

---

## 🔄 CI/CD

O pipeline roda via **GitHub Actions**:

| Evento | O que acontece |
|---|---|
| Push em qualquer branch | Lint + Build do frontend e backend |
| Push na `main` | Lint + Build + Deploy automático no servidor |

---

## 🚀 Setup e Desenvolvimento

### Pré-requisitos

- Node.js 18+ 
- npm 9+
- SQLite3 (incluído)

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/tmarocki/fmf_system.git
cd fmt_system
```

2. Instale as dependências (NPM Workspaces gerencia backend + frontend):
```bash
npm install
```

3. Configure variáveis de ambiente:
```bash
cd web/backend
cp .env.example .env
# Edite .env com suas configurações (JWT_SECRET, STRIPE_KEY, etc)
```

### Desenvolvimento

**Iniciar ambos os servidores:**
```bash
npm run dev
```

**Ou individualmente:**
```bash
# Backend (porta 3000)
npm run dev:backend

# Frontend (porta 5173)
npm run dev:frontend
```

**Acessos:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Banco de dados: `data/database.db`

### Build para Produção

```bash
# Build completo (backend + frontend)
npm run build

# Ou separadamente
npm run build:backend
npm run build:frontend
```

**Resultado:**
- Backend: `web/backend/dist/`
- Frontend: `web/frontend/dist/`

---

## 📚 Documentação Adicional

- [WEBSITE-STRUCTURE.md](WEBSITE-STRUCTURE.md) - Estrutura do site institucional
- [docs/sistema.md](docs/sistema.md) - Documentação técnica do sistema
- [docs/SEGURANCA_XSS.md](docs/SEGURANCA_XSS.md) - Práticas de segurança
- [docs/MONITORAMENTO.md](docs/MONITORAMENTO.md) - Monitoramento e logs

---

## 🛠️ Scripts Disponíveis

### Raiz do Projeto (monorepo)
```bash
npm run dev              # Inicia backend + frontend
npm run dev:backend      # Apenas backend
npm run dev:frontend     # Apenas frontend
npm run build            # Build completo
npm run build:backend    # Build apenas backend
npm run build:frontend   # Build apenas frontend
```

### Backend
```bash
npm run dev              # Dev com hot-reload (tsx watch)
npm run build            # Compilar TypeScript
npm start                # Iniciar produção
npm run seed             # Popular banco com dados iniciais
```

### Frontend
```bash
npm run dev              # Dev server Vite
npm run build            # Build otimizado
npm run preview          # Preview do build
npm run lint             # ESLint
```

---

## 🌐 Variáveis de Ambiente

### Backend (.env)

```env
# Servidor
NODE_ENV=development
PORT=3000
SERVER_NAME=localhost

# Logs
LOGS_PATH=

# Banco de dados
DATABASE_PATH=./data/database.db

# JWT
JWT_SECRET=seu-secret-super-seguro-aqui
```

### Frontend (.env)
```env
#Nome do servidor (opcional)
VITE_API_URL=http://localhost:3000

#Endereco do WebSite
VITE_API_URL_WEB=http://localhost:8080
```
---

## 📝 Licença

Proprietary - Todos os direitos reservados

---
