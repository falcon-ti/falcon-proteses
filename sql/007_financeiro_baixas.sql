-- ============================================================
-- 007 — Financeiro: baixa (recebimento) de contas a receber + origem
-- dos lançamentos de caixa. Tudo POR EMPRESA.
--
-- Baixa: cada recebimento de uma parcela vira uma linha em
-- conta_receber_baixa (aceita baixa PARCIAL — várias por parcela) e uma
-- ENTRADA no caixa com o total recebido (valor + juros - desconto).
-- conta_receber.valor_pago = soma das baixas ativas (valor abatido);
-- situacao 'P' quando quitada. Estorno cancela a baixa e o lançamento de
-- caixa dela e recalcula a parcela.
-- ============================================================

CREATE TABLE conta_receber_baixa (
  id              serial        PRIMARY KEY,
  empresa         integer       NOT NULL REFERENCES empresa (id),
  conta_receber   integer       NOT NULL REFERENCES conta_receber (id),
  data_pagamento  date          NOT NULL,
  valor           numeric(14,2) NOT NULL CHECK (valor > 0),       -- quanto abate da parcela
  juros           numeric(14,2) NOT NULL DEFAULT 0 CHECK (juros >= 0),     -- juros/multa
  desconto        numeric(14,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  valor_recebido  numeric(14,2) NOT NULL CHECK (valor_recebido >= 0),      -- valor + juros - desconto
  meio_pagamento  varchar(20),
  observacao      varchar(200),
  situacao        char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'C')),  -- ativa / estornada
  user_insert     varchar(30),
  date_insert     timestamp     NOT NULL DEFAULT now(),
  user_update     varchar(30),
  date_update     timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX conta_receber_baixa_conta_idx ON conta_receber_baixa (conta_receber);
CREATE INDEX conta_receber_baixa_empresa_data_idx ON conta_receber_baixa (empresa, data_pagamento);

-- Origem do lançamento de caixa: 'OS' (OS concluída à vista) ou
-- 'RECEBIMENTO' (baixa de conta a receber).
ALTER TABLE caixa_movimento ADD COLUMN origem varchar(20) NOT NULL DEFAULT 'OS';
ALTER TABLE caixa_movimento ADD COLUMN conta_receber_baixa integer REFERENCES conta_receber_baixa (id);
CREATE INDEX caixa_movimento_baixa_idx ON caixa_movimento (conta_receber_baixa);

-- Administradores já existentes: Caixa e Contas a Receber completos.
INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert)
SELECT u.id, p.tela, p.acao, 'SISTEMA'
FROM usuario u
CROSS JOIN (VALUES ('caixa', 'ver'), ('contas-receber', 'ver'), ('contas-receber', 'baixar'),
                   ('contas-receber', 'estornar')) AS p (tela, acao)
WHERE u.admin
ON CONFLICT DO NOTHING;
