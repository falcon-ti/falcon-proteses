-- 006 — Nome do paciente e data/hora de entrega passam a ser OPCIONAIS
-- na ordem de serviço (pedido do usuário).
ALTER TABLE ordem_servico ALTER COLUMN paciente DROP NOT NULL;
ALTER TABLE ordem_servico ALTER COLUMN data_entrega DROP NOT NULL;
