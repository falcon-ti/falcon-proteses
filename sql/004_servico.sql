-- ============================================================
-- 004 — Cadastro de Serviços (descrição + valor), POR EMPRESA.
-- Cada laboratório tem a sua própria lista/preços. O backend filtra e
-- grava sempre com a empresa da sessão (req.empresaId).
-- ============================================================

CREATE TABLE servico (
  id           serial        PRIMARY KEY,
  empresa      integer       NOT NULL REFERENCES empresa (id),
  descricao    varchar(150)  NOT NULL,
  valor        numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  situacao     char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'I')),
  user_insert  varchar(30),
  date_insert  timestamp     NOT NULL DEFAULT now(),
  user_update  varchar(30),
  date_update  timestamp     NOT NULL DEFAULT now()
);

CREATE INDEX servico_empresa_descricao_idx ON servico (empresa, descricao);
-- Mesma descrição não repete entre os serviços ATIVOS da empresa
-- (sem diferenciar maiúsculas/acentos).
CREATE UNIQUE INDEX servico_empresa_descricao_ativo_uk
  ON servico (empresa, upper(unaccent_simples(descricao))) WHERE situacao = 'A';

-- Administradores já existentes recebem o cadastro de Serviços completo.
INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert)
SELECT u.id, 'servicos', a.acao, 'SISTEMA'
FROM usuario u
CROSS JOIN (VALUES ('ver'), ('incluir'), ('editar'), ('inativar')) AS a (acao)
WHERE u.admin
ON CONFLICT DO NOTHING;
