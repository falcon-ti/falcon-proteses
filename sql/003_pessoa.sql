-- ============================================================
-- 003 — Cadastro de Pessoas (clientes, fornecedores, funcionários)
--
-- POR EMPRESA: cada pessoa pertence a uma empresa (coluna "empresa").
-- O backend sempre filtra/grava com a empresa da sessão (req.empresaId).
--
-- Uma mesma pessoa pode ter mais de um tipo (ex.: dentista que é cliente
-- e também fornecedor) — por isso são 3 booleanos, com pelo menos um
-- marcado, em vez de uma coluna "tipo" única.
-- ============================================================

CREATE TABLE pessoa (
  id                     serial        PRIMARY KEY,
  empresa                integer       NOT NULL REFERENCES empresa (id),

  cliente                boolean       NOT NULL DEFAULT false,
  fornecedor             boolean       NOT NULL DEFAULT false,
  funcionario            boolean       NOT NULL DEFAULT false,

  tipo_pessoa            char(1)       NOT NULL DEFAULT 'F' CHECK (tipo_pessoa IN ('F', 'J')),
  nome                   varchar(150)  NOT NULL,   -- nome (PF) ou razão social (PJ)
  -- CPF (11) ou CNPJ (14, pode ser alfanumérico), sem máscara. Opcional,
  -- mas quando preenchido não repete entre as pessoas ativas da empresa.
  cnpj_cpf               varchar(14),
  rg_ie                  varchar(20),              -- RG (PF) ou inscrição estadual (PJ)
  -- Registro profissional: CRO (cirurgião-dentista) ou TPD (técnico em
  -- prótese dentária), texto livre, ex.: "CRO-SP 12345".
  registro_profissional  varchar(30),
  limite_credito         numeric(14,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),

  -- Endereço (mesmo formato de empresa)
  cep                    char(8),
  rua                    varchar(150),
  numero                 varchar(20),
  complemento            varchar(80),
  bairro                 varchar(80),
  cidade                 integer       REFERENCES cidade (codigo_ibge),
  uf                     char(2)       REFERENCES uf (sigla),

  -- Contato
  telefone               varchar(20),
  celular                varchar(20),
  email                  varchar(150),

  situacao               char(1)       NOT NULL DEFAULT 'A' CHECK (situacao IN ('A', 'I')),
  user_insert            varchar(30),
  date_insert            timestamp     NOT NULL DEFAULT now(),
  user_update            varchar(30),
  date_update            timestamp     NOT NULL DEFAULT now(),

  CONSTRAINT pessoa_tipo_ck CHECK (cliente OR fornecedor OR funcionario)
);

CREATE INDEX pessoa_empresa_nome_idx ON pessoa (empresa, nome);
CREATE UNIQUE INDEX pessoa_empresa_cnpj_cpf_ativo_uk
  ON pessoa (empresa, cnpj_cpf) WHERE situacao = 'A' AND cnpj_cpf IS NOT NULL;

-- Remove acentos pra busca ("joao" encontra "João") sem depender da
-- extensão unaccent (que exige superusuário pra instalar).
CREATE OR REPLACE FUNCTION unaccent_simples(texto text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(texto,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')
$$;

-- Padroniza o nome da coluna de endereço com a de pessoa ("rua").
ALTER TABLE empresa RENAME COLUMN logradouro TO rua;

-- Administradores já existentes recebem o cadastro de Pessoas completo
-- (usuários novos: definir na aba Privilégios).
INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert)
SELECT u.id, 'pessoas', a.acao, 'SISTEMA'
FROM usuario u
CROSS JOIN (VALUES ('ver'), ('incluir'), ('editar'), ('inativar')) AS a (acao)
WHERE u.admin
ON CONFLICT DO NOTHING;
