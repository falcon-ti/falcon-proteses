-- ============================================================
-- 005 — Ordem de serviço + financeiro básico (caixa e contas a receber)
--
-- Tudo POR EMPRESA (coluna "empresa"; o backend usa req.empresaId).
--
-- Fluxo:
--   1. OS aberta (situacao 'A'): cliente, paciente, entrada, entrega,
--      prova, observações e itens (serviço + responsável + detalhamento).
--   2. Concluir: informa a forma de pagamento.
--        À vista -> 1 lançamento de ENTRADA em caixa_movimento
--        A prazo -> N parcelas em conta_receber (a baixa fica pra depois)
--   3. Reabrir (se nenhuma parcela tiver sido paga): cancela o que o
--      concluir gerou (situacao 'C') e volta a OS para aberta.
--   4. Cancelar (só aberta): situacao 'X'.
-- ============================================================

CREATE TABLE ordem_servico (
  id               serial        PRIMARY KEY,
  empresa          integer       NOT NULL REFERENCES empresa (id),
  numero           integer       NOT NULL,           -- sequência POR empresa
  cliente          integer       NOT NULL REFERENCES pessoa (id),
  paciente         varchar(150)  NOT NULL,
  data_entrada     timestamp     NOT NULL,
  data_entrega     timestamp     NOT NULL,           -- previsão de entrega
  -- Trabalho que precisa ir para PROVA (no paciente) antes de finalizar.
  -- Com enviar_prova = true, a OS só conclui depois de marcar a prova
  -- como realizada.
  enviar_prova     boolean       NOT NULL DEFAULT false,
  prova_realizada  boolean       NOT NULL DEFAULT false,
  observacao       text,
  valor_total      numeric(14,2) NOT NULL DEFAULT 0,

  -- 'A' aberta, 'C' concluída, 'X' cancelada
  situacao         char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'C', 'X')),
  data_conclusao   timestamp,
  -- 'V' à vista (caixa), 'P' a prazo (contas a receber); null = sem valor
  forma_pagamento  char(1)       CHECK (forma_pagamento IN ('V', 'P')),
  user_conclusao   varchar(30),

  user_insert      varchar(30),
  date_insert      timestamp     NOT NULL DEFAULT now(),
  user_update      varchar(30),
  date_update      timestamp     NOT NULL DEFAULT now(),

  UNIQUE (empresa, numero)
);
CREATE INDEX ordem_servico_empresa_situacao_idx ON ordem_servico (empresa, situacao, data_entrega);
CREATE INDEX ordem_servico_empresa_entrada_idx ON ordem_servico (empresa, data_entrada DESC);
CREATE INDEX ordem_servico_cliente_idx ON ordem_servico (cliente);

CREATE TABLE ordem_servico_item (
  id              serial        PRIMARY KEY,
  ordem_servico   integer       NOT NULL REFERENCES ordem_servico (id) ON DELETE CASCADE,
  sequencia       smallint      NOT NULL,
  servico         integer       NOT NULL REFERENCES servico (id),
  descricao       varchar(150)  NOT NULL,   -- cópia da descrição do serviço no momento
  detalhamento    text,                     -- cor, dentes, material, etc.
  responsavel     integer       NOT NULL REFERENCES pessoa (id),   -- pessoa do tipo funcionário
  quantidade      integer       NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario  numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total     numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (ordem_servico, sequencia)
);
CREATE INDEX ordem_servico_item_responsavel_idx ON ordem_servico_item (responsavel);

-- ------------------------------------------------------------
-- Caixa (movimentos de entrada/saída). Por enquanto só recebe as
-- entradas das OS à vista.
-- ------------------------------------------------------------
CREATE TABLE caixa_movimento (
  id              serial        PRIMARY KEY,
  empresa         integer       NOT NULL REFERENCES empresa (id),
  data_movimento  timestamp     NOT NULL DEFAULT now(),
  tipo            char(1)       NOT NULL CHECK (tipo IN ('E', 'S')),   -- entrada / saída
  valor           numeric(14,2) NOT NULL CHECK (valor > 0),
  meio_pagamento  varchar(20),  -- DINHEIRO, PIX, CARTAO_DEBITO, CARTAO_CREDITO, TRANSFERENCIA, CHEQUE
  historico       varchar(200)  NOT NULL,
  pessoa          integer       REFERENCES pessoa (id),
  ordem_servico   integer       REFERENCES ordem_servico (id),
  situacao        char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'C')),  -- ativo / cancelado
  user_insert     varchar(30),
  date_insert     timestamp     NOT NULL DEFAULT now(),
  user_update     varchar(30),
  date_update     timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX caixa_movimento_empresa_data_idx ON caixa_movimento (empresa, data_movimento);
CREATE INDEX caixa_movimento_ordem_idx ON caixa_movimento (ordem_servico);

-- ------------------------------------------------------------
-- Contas a receber (parcelas). Baixa (pagamento) será feita depois;
-- valor_pago/data_pagamento já ficam previstos.
-- ------------------------------------------------------------
CREATE TABLE conta_receber (
  id              serial        PRIMARY KEY,
  empresa         integer       NOT NULL REFERENCES empresa (id),
  pessoa          integer       NOT NULL REFERENCES pessoa (id),
  ordem_servico   integer       REFERENCES ordem_servico (id),
  parcela         smallint      NOT NULL DEFAULT 1,
  total_parcelas  smallint      NOT NULL DEFAULT 1,
  data_emissao    date          NOT NULL DEFAULT current_date,
  vencimento      date          NOT NULL,
  valor           numeric(14,2) NOT NULL CHECK (valor > 0),
  valor_pago      numeric(14,2) NOT NULL DEFAULT 0,
  data_pagamento  date,
  historico       varchar(200),
  -- 'A' aberta, 'P' paga, 'C' cancelada
  situacao        char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'P', 'C')),
  user_insert     varchar(30),
  date_insert     timestamp     NOT NULL DEFAULT now(),
  user_update     varchar(30),
  date_update     timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX conta_receber_empresa_venc_idx ON conta_receber (empresa, situacao, vencimento);
CREATE INDEX conta_receber_pessoa_idx ON conta_receber (pessoa);
CREATE INDEX conta_receber_ordem_idx ON conta_receber (ordem_servico);

-- Administradores já existentes recebem Ordens de Serviço completo.
INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert)
SELECT u.id, 'ordens-servico', a.acao, 'SISTEMA'
FROM usuario u
CROSS JOIN (VALUES ('ver'), ('incluir'), ('editar'), ('inativar'), ('concluir'), ('reabrir')) AS a (acao)
WHERE u.admin
ON CONFLICT DO NOTHING;
