-- ============================================================
-- falcon-proteses — estrutura inicial
--
-- Laboratório de prótese odontológica (Brasil). Base NOVA, sem
-- migração de dados do legado.
--
-- Conteúdo:
--   uf, cidade            -> tabelas de apoio (IBGE); municípios em 002
--   empresa               -> cada empresa/laboratório (multiempresa)
--   usuario               -> login (senha bcrypt)
--   usuario_empresa       -> quais empresas cada usuário acessa
--   usuario_privilegio    -> privilégios por tela/ação
--   log_acesso            -> registro de logins
--
-- MULTIEMPRESA — REGRA PARA OS PRÓXIMOS CADASTROS/LANÇAMENTOS
-- ------------------------------------------------------------
-- Todo lançamento (ordem de serviço, financeiro, estoque, etc.) e todo
-- cadastro que pertence a uma empresa (clientes/dentistas, tabela de
-- preços, serviços, etc.) leva a coluna:
--
--     empresa integer NOT NULL REFERENCES empresa (id)
--
-- + um índice começando por "empresa" (ex.: (empresa, data)). O backend
-- NUNCA aceita "empresa" vindo do corpo da requisição: usa sempre a
-- empresa da sessão (req.empresaId, preenchido pelo middleware
-- "exigirEmpresa", ver backend/src/middleware/auth.js), e todo SELECT/
-- UPDATE/DELETE filtra "WHERE empresa = $1". Modelo comentado no fim
-- deste arquivo.
--
-- Convenções (mesmas do falcon-web):
--   situacao char(1)  'A' ativo / 'I' inativo (soft delete, nada é apagado)
--   user_insert/date_insert/user_update/date_update em toda tabela de cadastro
--   datas "timestamp without time zone" gravadas no fuso do negócio
--   (APP_TZ, padrão America/Sao_Paulo — ver backend/src/config/db.js)
-- ============================================================

-- ------------------------------------------------------------
-- UF (27 unidades federativas) — código IBGE de 2 dígitos
-- ------------------------------------------------------------
CREATE TABLE uf (
  sigla        char(2)      PRIMARY KEY,
  nome         varchar(40)  NOT NULL,
  codigo_ibge  smallint     NOT NULL UNIQUE
);

INSERT INTO uf (sigla, nome, codigo_ibge) VALUES
  ('RO', 'Rondônia', 11), ('AC', 'Acre', 12), ('AM', 'Amazonas', 13), ('RR', 'Roraima', 14),
  ('PA', 'Pará', 15), ('AP', 'Amapá', 16), ('TO', 'Tocantins', 17),
  ('MA', 'Maranhão', 21), ('PI', 'Piauí', 22), ('CE', 'Ceará', 23), ('RN', 'Rio Grande do Norte', 24),
  ('PB', 'Paraíba', 25), ('PE', 'Pernambuco', 26), ('AL', 'Alagoas', 27), ('SE', 'Sergipe', 28),
  ('BA', 'Bahia', 29),
  ('MG', 'Minas Gerais', 31), ('ES', 'Espírito Santo', 32), ('RJ', 'Rio de Janeiro', 33), ('SP', 'São Paulo', 35),
  ('PR', 'Paraná', 41), ('SC', 'Santa Catarina', 42), ('RS', 'Rio Grande do Sul', 43),
  ('MS', 'Mato Grosso do Sul', 50), ('MT', 'Mato Grosso', 51), ('GO', 'Goiás', 52), ('DF', 'Distrito Federal', 53);

-- ------------------------------------------------------------
-- Cidade (municípios IBGE) — PK é o próprio código IBGE de 7 dígitos
-- (é o que NF-e/NFS-e pedem e o que o ViaCEP devolve no campo "ibge").
-- Carga dos 5.571 municípios em 002_cidades_ibge.sql.
-- ------------------------------------------------------------
CREATE TABLE cidade (
  codigo_ibge  integer      PRIMARY KEY,
  nome         varchar(80)  NOT NULL,
  uf           char(2)      NOT NULL REFERENCES uf (sigla)
);
CREATE INDEX cidade_uf_nome_idx ON cidade (uf, nome);

-- ------------------------------------------------------------
-- Empresa
-- ------------------------------------------------------------
CREATE TABLE empresa (
  id                     serial        PRIMARY KEY,
  tipo_pessoa            char(1)       NOT NULL DEFAULT 'J' CHECK (tipo_pessoa IN ('J', 'F')),
  -- Só dígitos/letras, sem máscara. CPF = 11 dígitos; CNPJ = 14
  -- caracteres (numérico ou alfanumérico — o CNPJ alfanumérico da
  -- Receita vale desde jul/2026, por isso não é numeric/bigint).
  cnpj_cpf               varchar(14)   NOT NULL,
  razao_social           varchar(150)  NOT NULL,
  nome_fantasia          varchar(150),
  inscricao_estadual     varchar(20),   -- 'ISENTO' quando for o caso
  inscricao_municipal    varchar(20),
  -- CRT (Código de Regime Tributário, mesmo da NF-e):
  -- 1 Simples Nacional, 2 Simples Nacional - excesso de sublimite,
  -- 3 Regime Normal, 4 Simples Nacional - MEI
  regime_tributario      smallint      CHECK (regime_tributario IN (1, 2, 3, 4)),

  -- Endereço
  cep                    char(8),
  logradouro             varchar(150),
  numero                 varchar(20),
  complemento            varchar(80),
  bairro                 varchar(80),
  cidade                 integer       REFERENCES cidade (codigo_ibge),
  uf                     char(2)       REFERENCES uf (sigla),

  -- Contato
  telefone               varchar(20),
  celular                varchar(20),   -- WhatsApp
  email                  varchar(150),
  site                   varchar(150),

  -- Responsável técnico do laboratório (TPD ou cirurgião-dentista)
  -- e a inscrição dele no CRO.
  responsavel_tecnico    varchar(150),
  cro_responsavel        varchar(20),
  cro_uf                 char(2)       REFERENCES uf (sigla),

  observacao             text,
  logo                   bytea,

  situacao               char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'I')),
  user_insert            varchar(30),
  date_insert            timestamp     NOT NULL DEFAULT now(),
  user_update            varchar(30),
  date_update            timestamp     NOT NULL DEFAULT now()
);
-- Mesmo CNPJ/CPF não pode estar ATIVO duas vezes (inativo pode, pra
-- permitir recadastrar sem apagar o histórico).
CREATE UNIQUE INDEX empresa_cnpj_cpf_ativo_uk ON empresa (cnpj_cpf) WHERE situacao = 'A';

-- ------------------------------------------------------------
-- Usuário
-- ------------------------------------------------------------
CREATE TABLE usuario (
  id             serial        PRIMARY KEY,
  nome_usuario   varchar(30)   NOT NULL,   -- login, gravado em CAIXA ALTA
  nome           varchar(120),              -- nome completo (exibição)
  email          varchar(150),
  senha          varchar(100)  NOT NULL,   -- hash bcrypt
  -- "admin" não libera tudo sozinho: só garante acesso fixo aos
  -- cadastros de Usuários e Empresas (ver services/privilegios.js). O
  -- resto vem da aba Privilégios.
  admin          boolean       NOT NULL DEFAULT false,
  situacao       char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'I')),
  user_insert    varchar(30),
  date_insert    timestamp     NOT NULL DEFAULT now(),
  user_update    varchar(30),
  date_update    timestamp     NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_nome_usuario_ativo_uk ON usuario (upper(nome_usuario)) WHERE situacao = 'A';

-- ------------------------------------------------------------
-- Usuário x Empresa — a quais empresas cada usuário tem acesso.
-- No login o usuário escolhe uma delas (se tiver mais de uma), e ela
-- vira a "empresa da sessão" (vai no token).
-- ------------------------------------------------------------
CREATE TABLE usuario_empresa (
  usuario      integer      NOT NULL REFERENCES usuario (id),
  empresa      integer      NOT NULL REFERENCES empresa (id),
  user_insert  varchar(30),
  date_insert  timestamp    NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario, empresa)
);
CREATE INDEX usuario_empresa_empresa_idx ON usuario_empresa (empresa);

-- ------------------------------------------------------------
-- Privilégios (tela x ação) — catálogo em backend/src/config/privilegios.js
-- ------------------------------------------------------------
CREATE TABLE usuario_privilegio (
  usuario      integer      NOT NULL REFERENCES usuario (id),
  tela         varchar(60)  NOT NULL,
  acao         varchar(40)  NOT NULL,
  user_insert  varchar(30),
  date_insert  timestamp    NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario, tela, acao)
);

-- ------------------------------------------------------------
-- Log de acesso (um registro por login bem-sucedido)
-- ------------------------------------------------------------
CREATE TABLE log_acesso (
  id           bigserial    PRIMARY KEY,
  data_acesso  timestamp    NOT NULL DEFAULT now(),
  usuario      integer      NOT NULL REFERENCES usuario (id),
  empresa      integer      REFERENCES empresa (id),
  ip           varchar(45),
  user_agent   varchar(255)
);
CREATE INDEX log_acesso_usuario_data_idx ON log_acesso (usuario, data_acesso DESC);

-- ============================================================
-- MODELO para as próximas tabelas por empresa (NÃO executar — só
-- referência):
--
-- CREATE TABLE ordem_servico (
--   id           serial       PRIMARY KEY,
--   empresa      integer      NOT NULL REFERENCES empresa (id),
--   numero       integer      NOT NULL,          -- sequência POR empresa
--   data_entrada date         NOT NULL,
--   ...
--   situacao     char(1)      NOT NULL DEFAULT 'A',
--   user_insert  varchar(30), date_insert timestamp NOT NULL DEFAULT now(),
--   user_update  varchar(30), date_update timestamp NOT NULL DEFAULT now(),
--   UNIQUE (empresa, numero)
-- );
-- CREATE INDEX ordem_servico_empresa_data_idx ON ordem_servico (empresa, data_entrada);
-- ============================================================
