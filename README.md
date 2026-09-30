# Falcon Próteses

Sistema para laboratório de prótese odontológica (Brasil), com a mesma stack e padrões do **falcon-web**: backend Node.js/Express/PostgreSQL (SQL explícito, sem ORM) e frontend Vue 3 + Quasar. Tudo em português do Brasil.

**Estado atual (etapa 2):** login, **multiempresa**, cadastro de **Empresas**, **Usuários** (com vínculo a empresas e privilégios por tela) **Pessoas** (clientes, fornecedores e funcionários), **Serviços** (descrição + valor) **Ordens de Serviço** (com conclusão gerando caixa à vista ou contas a receber a prazo) e **Financeiro** (Caixa e Contas a Receber com baixa e estorno) — tudo por empresa. Base nova — sem migração de dados.

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
| GET/POST/PUT/DELETE | /api/pessoas[/:id] | Pessoas **da empresa da sessão** (`?busca=&tipo=&ativo=`; DELETE inativa) | `pessoas.*` + empresa |
| GET/POST/PUT/DELETE | /api/servicos[/:id] | Serviços **da empresa da sessão** (`?ativo=`; DELETE inativa) | `servicos.*` + empresa |
| GET | /api/ordens-servico · /:id · /opcoes | OS da empresa (`?situacao=A|C|X&busca=&atrasadas=true`); opções = clientes, funcionários e serviços ativos | `ordens-servico.ver` + empresa |
| POST/PUT | /api/ordens-servico[/:id] | Cria / altera (só aberta) | `ordens-servico.incluir/editar` |
| POST | /api/ordens-servico/:id/concluir | `{ formaPagamento: 'V'|'P', meioPagamento, parcelas: [{vencimento, valor}], provaRealizada }` → caixa ou contas a receber | `ordens-servico.concluir` |
| GET | /api/ordens-servico/:id/impressao | Dados da folha de impressão: OS + empresa da sessão (logo em data URL) + cliente | `ordens-servico.ver` + empresa |
| POST | /api/ordens-servico/:id/reabrir · /cancelar | Reabrir (cancela caixa/parcelas; bloqueia se houver parcela recebida) · cancelar OS aberta | `reabrir` · `inativar` |
| GET | /api/financeiro/contas-receber[/:id] | Parcelas da empresa (`?situacao=A|P|C&vencDe=&vencAte=&busca=&vencidas=true`) + totais; `/:id` traz as baixas | `contas-receber.ver` + empresa |
| POST | /api/financeiro/contas-receber/:id/baixar | `{ dataPagamento, valor, juros, desconto, meioPagamento, observacao }` (aceita baixa parcial) → entrada no caixa | `contas-receber.baixar` |
| POST | /api/financeiro/contas-receber/baixas/:id/estornar | Estorna a baixa e cancela o lançamento de caixa dela | `contas-receber.estornar` |
| GET | /api/financeiro/caixa | Lançamentos do período (`?de=&ate=&meio=&origem=OS|RECEBIMENTO&cancelados=true`) + totais por meio | `caixa.ver` + empresa |
| GET | /api/comissoes/funcionarios[/:id] | Funcionários ativos · tabela de comissão de um funcionário (todos os serviços ativos) | `comissoes.ver` + empresa |
| PUT | /api/comissoes/funcionarios/:id | `{ itens: [{ servico, tipo: 'V'|'P', valor }] }` — valor vazio remove a comissão | `comissoes.editar` |
| GET | /api/painel | Resumo da empresa para o Painel: blocos `ordens`, `caixa` e `receber`, cada um só se o usuário tiver o privilégio da tela de origem | `dashboard.ver` + empresa |
| GET | /api/localidades/ufs · /cidades?uf= | UFs e municípios IBGE | Logado |
| GET | /api/sistema/info | Servidor/base em uso (rodapé) | Logado |

## Decisões (diferenças em relação ao falcon-web)

- **Senha só em bcrypt** — não há sistema legado Delphi pra manter compatível (no falcon-web existe o fCrypt).
- **Empresa no lugar de sucursal** na sessão (no falcon-web a sessão é por sucursal).
- **Admin** tem acesso fixo a Usuários **e** Empresas (senão uma base nova não teria como ser configurada); o resto vem da aba Privilégios.
- **Documentos brasileiros:** CPF/CNPJ validados (dígito verificador) no front e no back, já aceitando o **CNPJ alfanumérico** (vigente desde jul/2026). Gravados sem máscara em `empresa.cnpj_cpf`.
- **Endereço:** componente único `frontend/src/components/CampoEndereco.vue` (+ `backend/src/utils/endereco.js`) usado em Empresa e Pessoa — reaproveitar nos próximos cadastros. CEP preenche rua/bairro/UF/cidade pelo ViaCEP (ao digitar ou pela lupa) e "Não sei o CEP" busca o CEP pelo endereço. `cidade` é o código IBGE de 7 dígitos (o mesmo da NF-e/NFS-e).
- **Pessoas:** uma pessoa pode ter mais de um tipo (cliente/fornecedor/funcionário). CPF/CNPJ opcional, mas validado e único entre as ativas da mesma empresa. "Nº registro" guarda CRO ou TPD. Busca no servidor (até 500 linhas), sem acento (função `unaccent_simples`).
- **Regime tributário** = CRT da NF-e (1 Simples, 2 Simples excesso, 3 Normal, 4 MEI).
- **Responsável técnico** do laboratório com nº e UF do CRO.
- Fuso padrão `America/Sao_Paulo` (`APP_TZ` no .env).
- Tabelas novas usam `id serial` (o falcon-web usa `codigo` por herdar o banco legado).

## Ordem de serviço — regras

- Numeração sequencial **por empresa** (lock `pg_advisory_xact_lock` + `UNIQUE (empresa, numero)`).
- Cabeçalho: cliente (pessoa tipo cliente), paciente (opcional), entrada e entrega (data/hora; entrega opcional), "enviar para prova antes de finalizar" + "prova realizada", observações.
- Itens: serviço (valor sugerido da tabela, editável), quantidade, responsável (pessoa tipo **funcionário**) e detalhamento. A descrição do serviço é copiada para o item.
- Só OS **aberta** é editável. Com prova marcada, só conclui com a prova realizada (o diálogo de concluir pede a confirmação).
- Concluir: **à vista** → `caixa_movimento` (entrada, meio de pagamento); **a prazo** → `conta_receber` (parcelas; soma tem que bater com o total). Baixa: tela Financeiro › Contas a Receber.
- **Impressão**: botão "Imprimir" na OS abre `/ordens-servico/:id/imprimir` em outra aba — folha A4 com logo e dados da empresa, cliente, paciente, datas, prova, serviços com detalhamento e responsável, total, observações, pagamento (se concluída) e campos de assinatura. Chama a impressão do navegador automaticamente (dá pra salvar em PDF). Em OS aberta, grava o que está na tela antes de imprimir.
- Reabrir: marca como cancelados (`situacao = 'C'`) o caixa/parcelas gerados e volta a OS para aberta — bloqueado se alguma parcela já tiver recebimento.

## Comissões — regras

- Tela própria (**Cadastros › Comissões**) com privilégio `comissoes` (ver / editar), separada do cadastro de Pessoas para controlar quem altera. Atalho no cadastro da pessoa do tipo funcionário.
- Por funcionário × serviço: **R$** (valor fixo por unidade) ou **%** (sobre o total do item, até 100%). Em branco = sem comissão.
- Ao salvar a OS, cada item grava a comissão calculada (`valor_comissao`) e a regra usada (`comissao_tipo`, `comissao_base`), pelo **responsável** do item. Mudar a tabela não altera OS já concluída; OS aberta é recalculada quando for salva de novo.

## Financeiro — regras

- **Baixa** de parcela: `valor` (quanto abate da parcela, ≤ saldo — pode ser parcial), `juros` e `desconto`. Total recebido = valor + juros − desconto, lançado como **entrada no caixa** (origem `RECEBIMENTO`). Parcela vira **paga** quando o saldo zera. Data do pagamento não pode ser futura.
- **Estorno** de baixa: cancela a baixa e o lançamento de caixa dela e recalcula a parcela.
- **Caixa**: só visualização por enquanto (OS à vista + recebimentos), com totais por meio de pagamento. Lançamentos cancelados (OS reaberta, baixa estornada) aparecem só com "Mostrar cancelados".
- Reabrir OS continua bloqueado se alguma parcela tiver recebimento (estorne antes).

## Adicionando uma tela nova

1. `sql/00N_....sql` com a tabela (coluna `empresa` se for por empresa) e `npm run db:migrar`.
2. Privilégio em `backend/src/config/privilegios.js`.
3. Controller + rotas (`autenticar`, `exigirEmpresa` quando for por empresa, `exigirPrivilegio`) montadas em `src/app.js`.
4. Frontend: página em `src/pages/`, rota em `src/router/index.js` (`meta.privilegio`, `meta.exigeEmpresa`) e item em `src/utils/menu.js`.
