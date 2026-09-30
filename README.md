# Falcon Próteses

Sistema para laboratório de prótese odontológica (Brasil), com a mesma stack e padrões do **falcon-web**: backend Node.js/Express/PostgreSQL (SQL explícito, sem ORM) e frontend Vue 3 + Quasar. Tudo em português do Brasil.

**Estado atual (etapa 1):** login, **multiempresa**, cadastro de **Empresas** e de **Usuários** (com vínculo a empresas e privilégios por tela). Base nova — sem migração de dados.

## Estrutura

```
falcon-proteses/
├── backend/            # API REST (Express)
│   ├── scripts/        # migrar.js (aplica sql/), criar-admin.js (primeiro acesso)
│   └── src/            # config, controllers, middleware, routes, services, utils
├── frontend/           # SPA (Vue 3 + Vite + Quasar)
├── sql/                # estrutura do banco, numerada (001_, 002_, ...)
└── deploy.sh           # atualização no servidor (multi-cliente, PM2)
```

## Multiempresa — regra para os próximos cadastros

Cada usuário acessa uma ou mais empresas (`usuario_empresa`). No login ele escolhe a empresa (o select só aparece se tiver mais de uma), e ela vai **dentro do token** como a *empresa da sessão*. Dá pra trocar sem sair pelo seletor no cabeçalho (`POST /api/auth/trocar-empresa`, que gera um token novo).

Todo lançamento/cadastro que pertence a uma empresa (ordens de serviço, clientes/dentistas, financeiro, tabela de preços…) segue o mesmo modelo:

1. **Banco:** coluna `empresa integer NOT NULL REFERENCES empresa (id)` + índice começando por `empresa`. Numeração sequencial é por empresa (`UNIQUE (empresa, numero)`). Modelo comentado no fim de `sql/001_estrutura_inicial.sql`.
2. **Rotas:** `router.use(autenticar, exigirEmpresa)` — o middleware coloca a empresa da sessão em `req.empresaId` (e reconfere, com cache de 30s, se o vínculo e a empresa continuam ativos).
3. **Controllers:** todo `SELECT/UPDATE/DELETE` filtra `WHERE empresa = $1` com `req.empresaId`, e todo `INSERT` grava `req.empresaId`. **Nunca** ler `empresa` do corpo/query da requisição.
4. **Frontend:** rotas de lançamento com `meta: { exigeEmpresa: true }`. A `<router-view>` é recriada quando a empresa muda, então as telas recarregam os dados sozinhas.

Sem empresa na sessão, rotas com `exigirEmpresa` devolvem **409**.

## Pré-requisitos

- Node.js 18+
- PostgreSQL 13+ com um banco vazio (ex.: `createdb falcon_proteses`)

## Backend

```bash
cd backend
npm install
cp .env.example .env          # ajuste PG*, JWT_SECRET (openssl rand -hex 32)
npm run db:migrar             # cria as tabelas + UFs + 5.571 municípios IBGE
npm run db:criar-admin -- ADMIN minhaSenha "Seu Nome"
npm run dev                   # http://localhost:3000  (teste: /api/health)
```

`db:migrar` pode ser rodado sempre: só aplica os arquivos de `sql/` que ainda não rodaram (controle na tabela `schema_migracao`). Mudança de estrutura = arquivo novo com o próximo número; arquivo já aplicado nunca é editado.

## Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:9000 (proxy /api -> :3000)
```

**Primeiro acesso:** entre com o admin criado acima → o Painel avisa que não há empresa → *Cadastrar empresa*. Quem cadastra a empresa já fica vinculado a ela e ela é selecionada na hora. Depois cadastre os usuários em Administração › Sistema › Usuários (aba Empresas + aba Privilégios).

## Endpoints

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| GET | /api/health | API de pé | Público |
| GET | /api/auth/empresas?usuario= | Empresas do usuário (select do login) | Público |
| POST | /api/auth/login | `{ usuario, senha, empresa? }` | Público |
| GET | /api/auth/me | Sessão + privilégios atuais | Logado |
| GET | /api/auth/minhas-empresas | Empresas que o usuário pode selecionar | Logado |
| POST | /api/auth/trocar-empresa | `{ empresa }` → token novo | Logado |
| PUT | /api/auth/perfil · /api/auth/senha | Próprio nome/email · própria senha | Logado |
| GET/POST/PUT/DELETE | /api/empresas[/:id] | Cadastro de empresas (DELETE inativa) | `empresas.*` |
| GET | /api/empresas/:id/logo | Logo (imagem) | `empresas.ver` |
| GET/POST/PUT/DELETE | /api/usuarios[/:id] | Cadastro de usuários (DELETE inativa) | `usuarios.*` |
| GET | /api/usuarios/privilegios/catalogo · /:id/privilegios | Matriz de privilégios | `usuarios.ver` |
| GET | /api/localidades/ufs · /cidades?uf= | UFs e municípios IBGE | Logado |
| GET | /api/sistema/info | Servidor/base em uso (rodapé) | Logado |

## Decisões (diferenças em relação ao falcon-web)

- **Senha só em bcrypt** — não há sistema legado Delphi pra manter compatível (no falcon-web existe o fCrypt).
- **Empresa no lugar de sucursal** na sessão (no falcon-web a sessão é por sucursal).
- **Admin** tem acesso fixo a Usuários **e** Empresas (senão uma base nova não teria como ser configurada); o resto vem da aba Privilégios.
- **Documentos brasileiros:** CPF/CNPJ validados (dígito verificador) no front e no back, já aceitando o **CNPJ alfanumérico** (vigente desde jul/2026). Gravados sem máscara em `empresa.cnpj_cpf`.
- **Endereço:** CEP preenche logradouro/bairro/UF/cidade pelo ViaCEP (consulta direto do navegador); `cidade` é o código IBGE de 7 dígitos (o mesmo da NF-e/NFS-e).
- **Regime tributário** = CRT da NF-e (1 Simples, 2 Simples excesso, 3 Normal, 4 MEI).
- **Responsável técnico** do laboratório com nº e UF do CRO.
- Fuso padrão `America/Sao_Paulo` (`APP_TZ` no .env).
- Tabelas novas usam `id serial` (o falcon-web usa `codigo` por herdar o banco legado).

## Adicionando uma tela nova

1. `sql/00N_....sql` com a tabela (coluna `empresa` se for por empresa) e `npm run db:migrar`.
2. Privilégio em `backend/src/config/privilegios.js`.
3. Controller + rotas (`autenticar`, `exigirEmpresa` quando for por empresa, `exigirPrivilegio`) montadas em `src/app.js`.
4. Frontend: página em `src/pages/`, rota em `src/router/index.js` (`meta.privilegio`, `meta.exigeEmpresa`) e item em `src/utils/menu.js`.
