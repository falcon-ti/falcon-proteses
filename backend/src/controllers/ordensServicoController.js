// Ordens de Serviço.
//
// POR EMPRESA: rotas com "exigirEmpresa" (ordensServicoRoutes.js); toda
// consulta/gravação usa req.empresaId, inclusive a validação de cliente,
// responsável e serviço (precisam ser DA MESMA empresa).
//
// Situação: 'A' aberta (editável), 'C' concluída, 'X' cancelada.
//
// Concluir (POST /:id/concluir) grava a forma de pagamento:
//   À vista ('V') -> 1 entrada em caixa_movimento (valor total da OS)
//   A prazo ('P') -> parcelas em conta_receber (soma = valor total)
// Tudo numa transação só, com a OS travada (FOR UPDATE).
//
// Paciente e data de entrega são opcionais (sql/006).
//
// Prova: com "enviar_prova" marcado, a OS só conclui com a prova marcada
// como realizada (o diálogo de concluir pergunta e manda provaRealizada).
const pool = require('../config/db');
const { texto } = require('../utils/endereco');

const LIMITE_LISTAGEM = 500;
const MAX_PARCELAS = 60;
const MEIOS_PAGAMENTO = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TRANSFERENCIA', 'CHEQUE'];
// Chave do lock de numeração (pg_advisory_xact_lock(chave, empresa)).
const LOCK_NUMERACAO_OS = 5001;

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Aceita "YYYY-MM-DD HH:mm[:ss]" ou "YYYY-MM-DDTHH:mm" -> "YYYY-MM-DD HH:mm:ss" (ou null).
function dataHora(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(valor || ''));
  if (!m) return null;
  const [, a, mes, d, h, min, s = '00'] = m;
  const data = new Date(Number(a), Number(mes) - 1, Number(d), Number(h), Number(min));
  if (data.getFullYear() !== Number(a) || data.getMonth() !== Number(mes) - 1 || data.getDate() !== Number(d)) return null;
  if (Number(h) > 23 || Number(min) > 59) return null;
  return `${a}-${mes}-${d} ${h}:${min}:${s}`;
}

function data(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor || '').slice(0, 10));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? m[0] : null;
}

const centavos = (v) => Math.round(Number(v) * 100);

// ------------------------------------------------------------------
// Validação do corpo (cabeçalho + itens). Confere na base que cliente,
// responsáveis e serviços são da empresa da sessão.
// ------------------------------------------------------------------
async function prepararOrdem(client, empresaId, body) {
  const erros = [];
  const cliente = idValido(body.cliente);
  const paciente = texto(body.paciente, 150);
  const dataEntrada = dataHora(body.dataEntrada);
  const dataEntrega = dataHora(body.dataEntrega);
  const itensBody = Array.isArray(body.itens) ? body.itens : [];

  if (!cliente) erros.push('Selecione o cliente.');
  if (!dataEntrada) erros.push('Informe a data/hora de entrada.');
  // Paciente e entrega são opcionais; se a entrega vier preenchida, precisa ser válida.
  if (body.dataEntrega && !dataEntrega) erros.push('Data/hora de entrega inválida.');
  if (dataEntrada && dataEntrega && dataEntrega < dataEntrada) erros.push('A entrega não pode ser antes da entrada.');
  if (!itensBody.length) erros.push('Inclua pelo menos um serviço.');
  if (itensBody.length > 200) erros.push('Máximo de 200 itens por ordem.');

  if (cliente) {
    const { rows } = await client.query('SELECT cliente FROM pessoa WHERE id = $1 AND empresa = $2', [cliente, empresaId]);
    if (!rows[0]) erros.push('Cliente não encontrado nesta empresa.');
    else if (!rows[0].cliente) erros.push('A pessoa selecionada não está cadastrada como cliente.');
  }

  // Serviços e responsáveis citados nos itens, conferidos de uma vez.
  const idsServico = [...new Set(itensBody.map((i) => idValido(i.servico)).filter(Boolean))];
  const idsResp = [...new Set(itensBody.map((i) => idValido(i.responsavel)).filter(Boolean))];
  const servicos = new Map();
  const responsaveis = new Set();
  if (idsServico.length) {
    const { rows } = await client.query('SELECT id, descricao FROM servico WHERE empresa = $1 AND id = ANY($2)', [empresaId, idsServico]);
    rows.forEach((r) => servicos.set(r.id, r.descricao));
  }
  if (idsResp.length) {
    const { rows } = await client.query(
      'SELECT id FROM pessoa WHERE empresa = $1 AND funcionario AND id = ANY($2)',
      [empresaId, idsResp]
    );
    rows.forEach((r) => responsaveis.add(r.id));
  }

  const itens = [];
  itensBody.forEach((item, indice) => {
    const n = indice + 1;
    const servico = idValido(item.servico);
    const responsavel = idValido(item.responsavel);
    const quantidade = Number(item.quantidade ?? 1);
    const valorUnitario = Number(item.valorUnitario);
    if (!servico || !servicos.has(servico)) erros.push(`Item ${n}: serviço inválido.`);
    if (!responsavel) erros.push(`Item ${n}: informe o responsável.`);
    else if (!responsaveis.has(responsavel)) erros.push(`Item ${n}: o responsável precisa ser um funcionário desta empresa.`);
    if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > 9999) erros.push(`Item ${n}: quantidade inválida.`);
    if (!Number.isFinite(valorUnitario) || valorUnitario < 0 || valorUnitario >= 1e10) erros.push(`Item ${n}: valor inválido.`);
    const unit = Math.round(valorUnitario * 100) / 100;
    itens.push({
      servico,
      descricao: servicos.get(servico),
      detalhamento: texto(item.detalhamento),
      responsavel,
      quantidade,
      valorUnitario: unit,
      valorTotal: Math.round(unit * quantidade * 100) / 100,
    });
  });

  const valorTotal = itens.reduce((t, i) => t + centavos(i.valorTotal), 0) / 100;

  return {
    erros,
    dados: {
      cliente,
      paciente,
      dataEntrada,
      dataEntrega,
      enviarProva: !!body.enviarProva,
      provaRealizada: !!body.enviarProva && !!body.provaRealizada,
      observacao: texto(body.observacao),
      itens,
      valorTotal,
    },
  };
}

// Grava os itens e calcula a comissão de cada um pela tabela
// funcionario_comissao (responsável x serviço, da empresa):
//   'V' -> valor fixo por unidade x quantidade
//   'P' -> percentual sobre o total do item
// A regra usada fica gravada no item (comissao_tipo/comissao_base).
async function gravarItens(client, idOrdem, itens, empresaId) {
  await client.query('DELETE FROM ordem_servico_item WHERE ordem_servico = $1', [idOrdem]);
  const regras = new Map();
  if (itens.length) {
    const { rows } = await client.query(
      `SELECT funcionario, servico, tipo, valor FROM funcionario_comissao
       WHERE empresa = $1 AND funcionario = ANY($2) AND servico = ANY($3)`,
      [empresaId, [...new Set(itens.map((i) => i.responsavel))], [...new Set(itens.map((i) => i.servico))]]
    );
    rows.forEach((r) => regras.set(`${r.funcionario}:${r.servico}`, { tipo: r.tipo, valor: Number(r.valor) }));
  }
  let sequencia = 0;
  for (const i of itens) {
    sequencia += 1;
    const regra = regras.get(`${i.responsavel}:${i.servico}`);
    let valorComissao = 0;
    if (regra) {
      valorComissao = regra.tipo === 'P'
        ? Math.round(i.valorTotal * regra.valor) / 100
        : Math.round(regra.valor * i.quantidade * 100) / 100;
    }
    await client.query(
      `INSERT INTO ordem_servico_item
         (ordem_servico, sequencia, servico, descricao, detalhamento, responsavel, quantidade, valor_unitario, valor_total,
          comissao_tipo, comissao_base, valor_comissao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [idOrdem, sequencia, i.servico, i.descricao, i.detalhamento, i.responsavel, i.quantidade, i.valorUnitario, i.valorTotal,
        regra ? regra.tipo : null, regra ? regra.valor : null, valorComissao]
    );
  }
}

// ------------------------------------------------------------------
// Leitura
// ------------------------------------------------------------------
function ordemParaApi(r) {
  return {
    id: r.id,
    numero: r.numero,
    cliente: r.cliente,
    clienteNome: r.cliente_nome,
    paciente: r.paciente,
    dataEntrada: r.data_entrada,
    dataEntrega: r.data_entrega,
    enviarProva: r.enviar_prova,
    provaRealizada: r.prova_realizada,
    observacao: r.observacao,
    valorTotal: Number(r.valor_total),
    situacao: r.situacao,
    dataConclusao: r.data_conclusao,
    formaPagamento: r.forma_pagamento,
    userConclusao: r.user_conclusao,
    userInsert: r.user_insert,
    dateInsert: r.date_insert,
    quantidadeItens: r.quantidade_itens !== undefined ? Number(r.quantidade_itens) : undefined,
  };
}

const SELECT_ORDEM = `
  SELECT o.*, p.nome AS cliente_nome
  FROM ordem_servico o
  JOIN pessoa p ON p.id = o.cliente`;

async function carregarOrdemCompleta(executor, id, empresaId) {
  const { rows } = await executor.query(`${SELECT_ORDEM} WHERE o.id = $1 AND o.empresa = $2`, [id, empresaId]);
  if (!rows[0]) return null;
  const ordem = ordemParaApi(rows[0]);

  const itens = await executor.query(
    `SELECT i.*, r.nome AS responsavel_nome
     FROM ordem_servico_item i JOIN pessoa r ON r.id = i.responsavel
     WHERE i.ordem_servico = $1 ORDER BY i.sequencia`,
    [id]
  );
  ordem.itens = itens.rows.map((i) => ({
    id: i.id,
    sequencia: i.sequencia,
    servico: i.servico,
    descricao: i.descricao,
    detalhamento: i.detalhamento,
    responsavel: i.responsavel,
    responsavelNome: i.responsavel_nome,
    quantidade: i.quantidade,
    valorUnitario: Number(i.valor_unitario),
    valorTotal: Number(i.valor_total),
  }));

  // Pagamento gerado pela conclusão (só os lançamentos não cancelados).
  const [caixa, contas] = await Promise.all([
    executor.query(
      `SELECT id, data_movimento, valor, meio_pagamento FROM caixa_movimento
       WHERE ordem_servico = $1 AND empresa = $2 AND situacao = 'A' AND origem = 'OS' ORDER BY id`,
      [id, empresaId]
    ),
    executor.query(
      `SELECT id, parcela, total_parcelas, vencimento, valor, valor_pago, situacao FROM conta_receber
       WHERE ordem_servico = $1 AND empresa = $2 AND situacao <> 'C' ORDER BY parcela`,
      [id, empresaId]
    ),
  ]);
  ordem.caixa = caixa.rows.map((c) => ({
    id: c.id,
    dataMovimento: c.data_movimento,
    valor: Number(c.valor),
    meioPagamento: c.meio_pagamento,
  }));
  ordem.contasReceber = contas.rows.map((c) => ({
    id: c.id,
    parcela: c.parcela,
    totalParcelas: c.total_parcelas,
    vencimento: c.vencimento,
    valor: Number(c.valor),
    valorPago: Number(c.valor_pago),
    situacao: c.situacao,
  }));
  return ordem;
}

// GET /api/ordens-servico?situacao=A|C|X&busca=&atrasadas=true
async function listar(req, res) {
  const filtros = ['o.empresa = $1'];
  const valores = [req.empresaId];

  const situacao = String(req.query.situacao || '');
  if (['A', 'C', 'X'].includes(situacao)) {
    valores.push(situacao);
    filtros.push(`o.situacao = $${valores.length}`);
  }
  if (req.query.atrasadas === 'true') filtros.push(`o.situacao = 'A' AND o.data_entrega < now()`);

  const busca = String(req.query.busca || '').trim();
  if (busca) {
    valores.push(`%${busca}%`);
    const i = valores.length;
    const partes = [
      `unaccent_simples(o.paciente) ILIKE unaccent_simples($${i})`,
      `unaccent_simples(p.nome) ILIKE unaccent_simples($${i})`,
    ];
    if (/^\d+$/.test(busca)) {
      valores.push(Number(busca));
      partes.push(`o.numero = $${valores.length}`);
    }
    filtros.push(`(${partes.join(' OR ')})`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT o.*, p.nome AS cliente_nome,
              (SELECT count(*) FROM ordem_servico_item i WHERE i.ordem_servico = o.id) AS quantidade_itens
       FROM ordem_servico o JOIN pessoa p ON p.id = o.cliente
       WHERE ${filtros.join(' AND ')}
       ORDER BY o.data_entrada DESC, o.numero DESC
       LIMIT ${LIMITE_LISTAGEM + 1}`,
      valores
    );
    res.json({ itens: rows.slice(0, LIMITE_LISTAGEM).map(ordemParaApi), limitado: rows.length > LIMITE_LISTAGEM });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as ordens de serviço.' });
  }
}

// GET /api/ordens-servico/:id
async function obter(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Ordem inválida.' });
  try {
    const ordem = await carregarOrdemCompleta(pool, id, req.empresaId);
    if (!ordem) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
    res.json(ordem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar a ordem de serviço.' });
  }
}

// GET /api/ordens-servico/opcoes — listas para os selects do formulário
// (clientes, funcionários e serviços ATIVOS da empresa). Fica aqui, e não
// em /pessoas, pra quem só tem acesso a OS conseguir montar a tela.
async function opcoes(req, res) {
  try {
    const [clientes, funcionarios, servicos] = await Promise.all([
      pool.query(
        `SELECT id, nome, cnpj_cpf, registro_profissional FROM pessoa
         WHERE empresa = $1 AND cliente AND situacao = 'A' ORDER BY nome LIMIT 5000`,
        [req.empresaId]
      ),
      pool.query(
        `SELECT id, nome FROM pessoa WHERE empresa = $1 AND funcionario AND situacao = 'A' ORDER BY nome`,
        [req.empresaId]
      ),
      pool.query(`SELECT id, descricao, valor FROM servico WHERE empresa = $1 AND situacao = 'A' ORDER BY descricao`, [
        req.empresaId,
      ]),
    ]);
    res.json({
      clientes: clientes.rows.map((r) => ({ id: r.id, nome: r.nome, cnpjCpf: r.cnpj_cpf, registro: r.registro_profissional })),
      funcionarios: funcionarios.rows.map((r) => ({ id: r.id, nome: r.nome })),
      servicos: servicos.rows.map((r) => ({ id: r.id, descricao: r.descricao, valor: Number(r.valor) })),
      meiosPagamento: MEIOS_PAGAMENTO,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar as opções.' });
  }
}

// ------------------------------------------------------------------
// Gravação
// ------------------------------------------------------------------

// POST /api/ordens-servico
async function criar(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { erros, dados: d } = await prepararOrdem(client, req.empresaId, req.body || {});
    if (erros.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: erros.join(' ') });
    }

    // Numeração sequencial POR empresa, sem corrida entre dois usuários.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [LOCK_NUMERACAO_OS, req.empresaId]);
    const { rows: seq } = await client.query(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM ordem_servico WHERE empresa = $1',
      [req.empresaId]
    );

    const { rows } = await client.query(
      `INSERT INTO ordem_servico
         (empresa, numero, cliente, paciente, data_entrada, data_entrega, enviar_prova, prova_realizada,
          observacao, valor_total, user_insert, user_update)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
      [
        req.empresaId, seq[0].proximo, d.cliente, d.paciente, d.dataEntrada, d.dataEntrega, d.enviarProva,
        d.provaRealizada, d.observacao, d.valorTotal, req.usuario.login,
      ]
    );
    await gravarItens(client, rows[0].id, d.itens, req.empresaId);
    await client.query('COMMIT');
    res.status(201).json(await carregarOrdemCompleta(pool, rows[0].id, req.empresaId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar a ordem de serviço.' });
  } finally {
    client.release();
  }
}

// Trava a OS (FOR UPDATE) e confere que é da empresa. Devolve a linha ou null.
async function travarOrdem(client, id, empresaId) {
  const { rows } = await client.query('SELECT * FROM ordem_servico WHERE id = $1 AND empresa = $2 FOR UPDATE', [
    id,
    empresaId,
  ]);
  return rows[0] || null;
}

// PUT /api/ordens-servico/:id — só enquanto aberta.
async function atualizar(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Ordem inválida.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await travarOrdem(client, id, req.empresaId);
    if (!atual) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
    }
    if (atual.situacao !== 'A') {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Só é possível alterar ordens abertas.' });
    }
    const { erros, dados: d } = await prepararOrdem(client, req.empresaId, req.body || {});
    if (erros.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: erros.join(' ') });
    }
    await client.query(
      `UPDATE ordem_servico SET cliente = $1, paciente = $2, data_entrada = $3, data_entrega = $4,
         enviar_prova = $5, prova_realizada = $6, observacao = $7, valor_total = $8,
         user_update = $9, date_update = now()
       WHERE id = $10`,
      [d.cliente, d.paciente, d.dataEntrada, d.dataEntrega, d.enviarProva, d.provaRealizada, d.observacao, d.valorTotal,
        req.usuario.login, id]
    );
    await gravarItens(client, id, d.itens, req.empresaId);
    await client.query('COMMIT');
    res.json(await carregarOrdemCompleta(pool, id, req.empresaId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar a ordem de serviço.' });
  } finally {
    client.release();
  }
}

// POST /api/ordens-servico/:id/concluir
// { formaPagamento: 'V'|'P', meioPagamento, parcelas: [{ vencimento, valor }], provaRealizada }
async function concluir(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Ordem inválida.' });
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const os = await travarOrdem(client, id, req.empresaId);
    const falhar = async (status, erro, extra = {}) => {
      await client.query('ROLLBACK');
      return res.status(status).json({ erro, ...extra });
    };
    if (!os) return falhar(404, 'Ordem de serviço não encontrada.');
    if (os.situacao !== 'A') return falhar(409, 'Esta ordem não está aberta.');

    const { rows: qtd } = await client.query('SELECT count(*)::int AS n FROM ordem_servico_item WHERE ordem_servico = $1', [id]);
    if (!qtd[0].n) return falhar(400, 'A ordem não tem serviços.');

    if (os.enviar_prova && !os.prova_realizada && !body.provaRealizada) {
      return falhar(409, 'Esta ordem deve ir para prova antes de ser concluída.', { codigo: 'PROVA_PENDENTE' });
    }

    const total = centavos(os.valor_total);
    const historico = (os.paciente ? `OS nº ${os.numero} - ${os.paciente}` : `OS nº ${os.numero}`).slice(0, 200);
    let forma = null;

    if (total > 0) {
      forma = body.formaPagamento;
      if (forma === 'V') {
        const meio = String(body.meioPagamento || '');
        if (!MEIOS_PAGAMENTO.includes(meio)) return falhar(400, 'Selecione o meio de pagamento.');
        await client.query(
          `INSERT INTO caixa_movimento
             (empresa, data_movimento, tipo, valor, meio_pagamento, historico, pessoa, ordem_servico, origem,
              user_insert, user_update)
           VALUES ($1, now(), 'E', $2, $3, $4, $5, $6, 'OS', $7, $7)`,
          [req.empresaId, os.valor_total, meio, historico, os.cliente, id, req.usuario.login]
        );
      } else if (forma === 'P') {
        const parcelas = Array.isArray(body.parcelas) ? body.parcelas : [];
        if (!parcelas.length || parcelas.length > MAX_PARCELAS) return falhar(400, `Informe de 1 a ${MAX_PARCELAS} parcelas.`);
        const normalizadas = parcelas.map((p) => ({ vencimento: data(p.vencimento), valor: centavos(p.valor) }));
        if (normalizadas.some((p) => !p.vencimento)) return falhar(400, 'Há parcela com vencimento inválido.');
        if (normalizadas.some((p) => !(p.valor > 0))) return falhar(400, 'Todas as parcelas precisam ter valor maior que zero.');
        const soma = normalizadas.reduce((t, p) => t + p.valor, 0);
        if (soma !== total) {
          return falhar(400, `A soma das parcelas (R$ ${(soma / 100).toFixed(2)}) é diferente do total da OS (R$ ${(total / 100).toFixed(2)}).`);
        }
        let n = 0;
        for (const p of normalizadas) {
          n += 1;
          await client.query(
            `INSERT INTO conta_receber
               (empresa, pessoa, ordem_servico, parcela, total_parcelas, data_emissao, vencimento, valor, historico,
                user_insert, user_update)
             VALUES ($1, $2, $3, $4, $5, current_date, $6, $7, $8, $9, $9)`,
            [req.empresaId, os.cliente, id, n, normalizadas.length, p.vencimento, p.valor / 100,
              `${historico} - parc. ${n}/${normalizadas.length}`.slice(0, 200), req.usuario.login]
          );
        }
      } else {
        return falhar(400, 'Selecione a forma de pagamento (à vista ou a prazo).');
      }
    }

    await client.query(
      `UPDATE ordem_servico SET situacao = 'C', data_conclusao = now(), forma_pagamento = $1, user_conclusao = $2,
         prova_realizada = (prova_realizada OR enviar_prova), user_update = $2, date_update = now()
       WHERE id = $3`,
      [forma, req.usuario.login, id]
    );
    await client.query('COMMIT');
    res.json(await carregarOrdemCompleta(pool, id, req.empresaId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao concluir a ordem de serviço.' });
  } finally {
    client.release();
  }
}

// POST /api/ordens-servico/:id/reabrir — desfaz a conclusão: cancela o
// lançamento de caixa / as parcelas geradas. Bloqueia se alguma parcela já
// tiver recebimento.
async function reabrir(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Ordem inválida.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const os = await travarOrdem(client, id, req.empresaId);
    if (!os) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
    }
    if (os.situacao !== 'C') {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Só é possível reabrir ordens concluídas.' });
    }
    const { rowCount: pagas } = await client.query(
      `SELECT 1 FROM conta_receber WHERE ordem_servico = $1 AND situacao <> 'C' AND (valor_pago > 0 OR situacao = 'P')`,
      [id]
    );
    if (pagas) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Esta ordem tem parcela já recebida. Estorne o recebimento antes de reabrir.' });
    }
    await client.query(
      `UPDATE caixa_movimento SET situacao = 'C', user_update = $1, date_update = now()
       WHERE ordem_servico = $2 AND empresa = $3 AND situacao = 'A' AND origem = 'OS'`,
      [req.usuario.login, id, req.empresaId]
    );
    await client.query(
      `UPDATE conta_receber SET situacao = 'C', user_update = $1, date_update = now()
       WHERE ordem_servico = $2 AND empresa = $3 AND situacao = 'A'`,
      [req.usuario.login, id, req.empresaId]
    );
    await client.query(
      `UPDATE ordem_servico SET situacao = 'A', data_conclusao = NULL, forma_pagamento = NULL, user_conclusao = NULL,
         user_update = $1, date_update = now()
       WHERE id = $2`,
      [req.usuario.login, id]
    );
    await client.query('COMMIT');
    res.json(await carregarOrdemCompleta(pool, id, req.empresaId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao reabrir a ordem de serviço.' });
  } finally {
    client.release();
  }
}

// POST /api/ordens-servico/:id/cancelar — só aberta.
async function cancelar(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Ordem inválida.' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE ordem_servico SET situacao = 'X', user_update = $1, date_update = now()
       WHERE id = $2 AND empresa = $3 AND situacao = 'A'`,
      [req.usuario.login, id, req.empresaId]
    );
    if (!rowCount) return res.status(409).json({ erro: 'Só é possível cancelar ordens abertas.' });
    res.json(await carregarOrdemCompleta(pool, id, req.empresaId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar a ordem de serviço.' });
  }
}

// ------------------------------------------------------------------
// Impressão
// ------------------------------------------------------------------

function tipoImagem(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// GET /api/ordens-servico/:id/impressao — tudo que a folha impressa precisa:
// a OS completa + dados da EMPRESA DA SESSÃO (com a logo em data URL, pra
// não depender de outra requisição autenticada) + dados do cliente.
// Só exige "ordens-servico.ver" (não precisa acesso ao cadastro de empresas).
async function impressao(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Ordem inválida.' });
  try {
    const ordem = await carregarOrdemCompleta(pool, id, req.empresaId);
    if (!ordem) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });

    const [empresaRes, clienteRes] = await Promise.all([
      pool.query(
        `SELECT e.*, c.nome AS cidade_nome FROM empresa e LEFT JOIN cidade c ON c.codigo_ibge = e.cidade WHERE e.id = $1`,
        [req.empresaId]
      ),
      pool.query(
        `SELECT p.*, c.nome AS cidade_nome FROM pessoa p LEFT JOIN cidade c ON c.codigo_ibge = p.cidade
         WHERE p.id = $1 AND p.empresa = $2`,
        [ordem.cliente, req.empresaId]
      ),
    ]);
    const e = empresaRes.rows[0];
    const c = clienteRes.rows[0] || {};
    let logo = null;
    if (e.logo) {
      const tipo = tipoImagem(e.logo);
      if (tipo) logo = `data:${tipo};base64,${e.logo.toString('base64')}`;
    }

    res.json({
      ordem,
      empresa: {
        razaoSocial: e.razao_social,
        nomeFantasia: e.nome_fantasia,
        tipoPessoa: e.tipo_pessoa,
        cnpjCpf: e.cnpj_cpf,
        inscricaoEstadual: e.inscricao_estadual,
        rua: e.rua,
        numero: e.numero,
        complemento: e.complemento,
        bairro: e.bairro,
        cidadeNome: e.cidade_nome,
        uf: e.uf,
        cep: e.cep,
        telefone: e.telefone,
        celular: e.celular,
        email: e.email,
        site: e.site,
        responsavelTecnico: e.responsavel_tecnico,
        croResponsavel: e.cro_responsavel,
        croUf: e.cro_uf,
        logo,
      },
      cliente: {
        nome: c.nome,
        tipoPessoa: c.tipo_pessoa,
        cnpjCpf: c.cnpj_cpf,
        registroProfissional: c.registro_profissional,
        telefone: c.telefone,
        celular: c.celular,
        email: c.email,
        rua: c.rua,
        numero: c.numero,
        complemento: c.complemento,
        bairro: c.bairro,
        cidadeNome: c.cidade_nome,
        uf: c.uf,
      },
      emitidoPor: req.usuario.login,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao montar a impressão da ordem.' });
  }
}

module.exports = { listar, obter, opcoes, criar, atualizar, concluir, reabrir, cancelar, impressao };
