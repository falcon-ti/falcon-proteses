-- ============================================================
-- 008 — Comissão por funcionário x serviço (POR EMPRESA)
--
-- Cada funcionário (pessoa com funcionario = true) pode ter uma comissão
-- para cada serviço:
--   tipo 'V' -> valor fixo em R$ por unidade do serviço
--   tipo 'P' -> percentual sobre o valor total do item da OS
-- Sem linha = sem comissão naquele serviço.
--
-- A tela é separada (Cadastros › Comissões), com privilégio próprio
-- ("comissoes"), pra controlar quem pode alterar.
--
-- A comissão CALCULADA é gravada em cada item da OS (valor_comissao), com a
-- regra usada (comissao_tipo/comissao_base) — assim uma mudança na tabela de
-- comissões não altera o que já foi lançado em OS concluída. OS aberta é
-- recalculada ao ser salva de novo.
-- ============================================================

CREATE TABLE funcionario_comissao (
  id           serial        PRIMARY KEY,
  empresa      integer       NOT NULL REFERENCES empresa (id),
  funcionario  integer       NOT NULL REFERENCES pessoa (id),
  servico      integer       NOT NULL REFERENCES servico (id),
  tipo         char(1)       NOT NULL DEFAULT 'V' CHECK (tipo IN ('V', 'P')),
  valor        numeric(14,2) NOT NULL CHECK (valor >= 0),
  user_insert  varchar(30),
  date_insert  timestamp     NOT NULL DEFAULT now(),
  user_update  varchar(30),
  date_update  timestamp     NOT NULL DEFAULT now(),
  UNIQUE (funcionario, servico),
  CONSTRAINT funcionario_comissao_percentual_ck CHECK (tipo <> 'P' OR valor <= 100)
);
CREATE INDEX funcionario_comissao_empresa_idx ON funcionario_comissao (empresa, funcionario);

ALTER TABLE ordem_servico_item ADD COLUMN comissao_tipo char(1) CHECK (comissao_tipo IN ('V', 'P'));
ALTER TABLE ordem_servico_item ADD COLUMN comissao_base numeric(14,2);
ALTER TABLE ordem_servico_item ADD COLUMN valor_comissao numeric(14,2) NOT NULL DEFAULT 0;

-- Administradores já existentes: tela de Comissões completa.
INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert)
SELECT u.id, 'comissoes', a.acao, 'SISTEMA'
FROM usuario u
CROSS JOIN (VALUES ('ver'), ('editar')) AS a (acao)
WHERE u.admin
ON CONFLICT DO NOTHING;
