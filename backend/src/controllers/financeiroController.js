// Financeiro: Contas a Receber (listagem, baixa, estorno) e Caixa
// (lançamentos à vista das OS + recebimentos).
//
// POR EMPRESA: rotas com "exigirEmpresa" (financeiroRoutes.js); toda
// consulta/gravação filtra por req.empresaId.
//
// Baixa (POST /contas-receber/:id/baixar):
//   valor     = quanto abate da parcela (≤ saldo) — permite baixa PARCIAL
//   juros     = juros/multa recebidos a mais
//   desconto  = desconto concedido
//   recebido  = valor + juros - desconto  -> ENTRADA no caixa (se > 0)
// A parcela fica 'P' (paga) quando o saldo zera. Estorno cancela a baixa e
// o lançamento de caixa dela, e recalcula a parcela.
const pool = require('../config/db');
const { texto } = require('../utils/endereco');

const MEIOS_PAGAMENTO = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TRANSFERENCIA', 'CHEQUE'];
const LIMITE_LISTAGEM = 1000;

const centavos = (v) => Math.round(Number(v) * 100);

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function data(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor || '').slice(0, 10));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? m[0] : null;
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ==================================================================
// CONTAS A RECEBER
// ==================================================================

function contaParaApi(r) {
  const valor = Number(r.valor);
  const valorPago = Number(r.valor_pago);
  return {
    id: r.id,
    pessoa: r.pessoa,
    pessoaNome: r.pessoa_nome,
    ordemServico: r.ordem_servico,
    ordemNumero: r.ordem_numero,
    paciente: r.paciente,
    parcela: r.parcela,
    totalParcelas: r.total_parcelas,
    dataEmissao: r.data_emissao,
    vencimento: r.vencimento,
    valor,
    valorPago,
    saldo: Math.round((valor - valorPago) * 100) / 100,
    dataPagamento: r.data_pagamento,
    historico: r.historico,
    situacao: r.situacao,
  };
}

const SELECT_CONTA = `
  SELECT c.*, p.nome AS pessoa_nome, o.numero AS ordem_numero, o.paciente
  FROM conta_receber c
  JOIN pessoa p ON p.id = c.pessoa
  LEFT JOIN ordem_servico o ON o.id = c.ordem_servico`;

// GET /api/financeiro/contas-receber
//   ?situacao=A|P|C  &vencDe=YYYY-MM-DD &vencAte=  &busca=  &vencidas=true
async function listarContas(req, res) {
  const filtros = ['c.empresa = $1'];
  const valores = [req.empresaId];
  const add = (sql, valor) => {
    valores.push(valor);
    filtros.push(sql.replace('?', `$${valores.length}`));
  };

  const situacao = String(req.query.situacao || '');
  if (['A', 'P', 'C'].includes(situacao)) add('c.situacao = ?', situacao);
  const vencDe = data(req.query.vencDe);
  const vencAte = data(req.query.vencAte);
  if (vencDe) add('c.vencimento >= ?', vencDe);
  if (vencAte) add('c.vencimento <= ?', vencAte);
  if (req.query.vencidas === 'true') filtros.push(`c.situacao = 'A' AND c.vencimento < current_date`);

  const busca = String(req.query.busca || '').trim();
  if (busca) {
    valores.push(`%${busca}%`);
    const i = valores.length;
    const partes = [
      `unaccent_simples(p.nome) ILIKE unaccent_simples($${i})`,
      `unaccent_simples(o.paciente) ILIKE unaccent_simples($${i})`,
    ];
    if (/^\d+$/.test(busca)) {
      valores.push(Number(busca));
      partes.push(`o.numero = $${valores.length}`);
    }
    filtros.push(`(${partes.join(' OR ')})`);
  }

  const where = filtros.join(' AND ');
  try {
    const [lista, totais] = await Promise.all([
      pool.query(
        `${SELECT_CONTA} WHERE ${where} ORDER BY c.vencimento, p.nome, c.parcela LIMIT ${LIMITE_LISTAGEM + 1}`,
        valores
      ),
      // Totais sobre TODO o filtro (não só as linhas exibidas).
      pool.query(
        `SELECT COALESCE(SUM(c.valor), 0) AS valor,
                COALESCE(SUM(c.valor_pago), 0) AS pago,
                COALESCE(SUM(c.valor - c.valor_pago) FILTER (WHERE c.situacao = 'A'), 0) AS saldo,
                COALESCE(SUM(c.valor - c.valor_pago) FILTER (WHERE c.situacao = 'A' AND c.vencimento < current_date), 0) AS vencido
         FROM conta_receber c
         JOIN pessoa p ON p.id = c.pessoa
         LEFT JOIN ordem_servico o ON o.id = c.ordem_servico
         WHERE ${where}`,
        valores
      ),
    ]);
    const t = totais.rows[0];
    res.json({
      itens: lista.rows.slice(0, LIMITE_LISTAGEM).map(contaParaApi),
      limitado: lista.rows.length > LIMITE_LISTAGEM,
      totais: { valor: Number(t.valor), pago: Number(t.pago), saldo: Number(t.saldo), vencido: Number(t.vencido) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as contas a receber.' });
  }
}

async function carregarConta(executor, id, empresaId) {
  const { rows } = await executor.query(`${SELECT_CONTA} WHERE c.id = $1 AND c.empresa = $2`, [id, empresaId]);
  if (!rows[0]) return null;
  const conta = contaParaApi(rows[0]);
  const baixas = await executor.query(
    `SELECT * FROM conta_receber_baixa WHERE conta_receber = $1 AND empresa = $2 ORDER BY data_pagamento, id`,
    [id, empresaId]
  );
  conta.baixas = baixas.rows.map((b) => ({
    id: b.id,
    dataPagamento: b.data_pagamento,
    valor: Number(b.valor),
    juros: Number(b.juros),
    desconto: Number(b.desconto),
    valorRecebido: Number(b.valor_recebido),
    meioPagamento: b.meio_pagamento,
    observacao: b.observacao,
    situacao: b.situacao,
    usuario: b.user_insert,
    dataLancamento: b.date_insert,
    usuarioEstorno: b.situacao === 'C' ? b.user_update : null,
  }));
  return conta;
}

// GET /api/financeiro/contas-receber/:id  (com o histórico de baixas)
async function obterConta(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Conta inválida.' });
  try {
    const conta = await carregarConta(pool, id, req.empresaId);
    if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
    res.json(conta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar a conta.' });
  }
}

// Recalcula valor_pago / situacao / data_pagamento pela soma das baixas ativas.
async function recalcularConta(client, id, usuario) {
  await client.query(
    `UPDATE conta_receber c SET
       valor_pago = b.total,
       situacao = CASE WHEN b.total >= c.valor THEN 'P' ELSE 'A' END,
       data_pagamento = CASE WHEN b.total >= c.valor THEN b.ultima ELSE NULL END,
       user_update = $2, date_update = now()
     FROM (SELECT COALESCE(SUM(valor), 0) AS total, MAX(data_pagamento) AS ultima
           FROM conta_receber_baixa WHERE conta_receber = $1 AND situacao = 'A') b
     WHERE c.id = $1`,
    [id, usuario]
  );
}

// POST /api/financeiro/contas-receber/:id/baixar
// { dataPagamento, valor, juros, desconto, meioPagamento, observacao }
async function baixarConta(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Conta inválida.' });
  const body = req.body || {};
  const dataPagamento = data(body.dataPagamento);
  const valor = centavos(body.valor);
  const juros = centavos(body.juros || 0);
  const desconto = centavos(body.desconto || 0);
  const meio = String(body.meioPagamento || '');

  const erros = [];
  if (!dataPagamento) erros.push('Informe a data do pagamento.');
  else if (dataPagamento > hoje()) erros.push('A data do pagamento não pode ser futura.');
  if (!(valor > 0)) erros.push('Informe o valor a baixar.');
  if (!(juros >= 0)) erros.push('Juros inválidos.');
  if (!(desconto >= 0)) erros.push('Desconto inválido.');
  if (valor + juros - desconto < 0) erros.push('O desconto não pode ser maior que o valor + juros.');
  if (!MEIOS_PAGAMENTO.includes(meio)) erros.push('Selecione o meio de pagamento.');
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT c.*, o.numero AS ordem_numero, o.paciente
       FROM conta_receber c LEFT JOIN ordem_servico o ON o.id = c.ordem_servico
       WHERE c.id = $1 AND c.empresa = $2 FOR UPDATE OF c`,
      [id, req.empresaId]
    );
    const conta = rows[0];
    const falhar = async (status, erro) => {
      await client.query('ROLLBACK');
      return res.status(status).json({ erro });
    };
    if (!conta) return falhar(404, 'Conta não encontrada.');
    if (conta.situacao !== 'A') return falhar(409, conta.situacao === 'P' ? 'Esta parcela já está paga.' : 'Esta parcela está cancelada.');
    const saldo = centavos(conta.valor) - centavos(conta.valor_pago);
    if (valor > saldo) return falhar(400, `O valor a baixar não pode passar do saldo (R$ ${(saldo / 100).toFixed(2)}).`);

    const recebido = valor + juros - desconto;
    const { rows: baixa } = await client.query(
      `INSERT INTO conta_receber_baixa
         (empresa, conta_receber, data_pagamento, valor, juros, desconto, valor_recebido, meio_pagamento, observacao,
          user_insert, user_update)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
      [req.empresaId, id, dataPagamento, valor / 100, juros / 100, desconto / 100, recebido / 100, meio,
        texto(body.observacao, 200), req.usuario.login]
    );

    if (recebido > 0) {
      const origemTexto = conta.ordem_numero ? ` - OS nº ${conta.ordem_numero}` : '';
      const historico = `Recebimento parc. ${conta.parcela}/${conta.total_parcelas}${origemTexto}`.slice(0, 200);
      // Data do caixa = data do pagamento + hora atual.
      await client.query(
        `INSERT INTO caixa_movimento
           (empresa, data_movimento, tipo, valor, meio_pagamento, historico, pessoa, ordem_servico, origem,
            conta_receber_baixa, user_insert, user_update)
         VALUES ($1, $2::date + LOCALTIME(0), 'E', $3, $4, $5, $6, $7, 'RECEBIMENTO', $8, $9, $9)`,
        [req.empresaId, dataPagamento, recebido / 100, meio, historico, conta.pessoa, conta.ordem_servico,
          baixa[0].id, req.usuario.login]
      );
    }

    await recalcularConta(client, id, req.usuario.login);
    await client.query('COMMIT');
    res.json(await carregarConta(pool, id, req.empresaId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao dar baixa na conta.' });
  } finally {
    client.release();
  }
}

// POST /api/financeiro/contas-receber/baixas/:id/estornar
async function estornarBaixa(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Baixa inválida.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT b.*, c.situacao AS situacao_conta FROM conta_receber_baixa b
       JOIN conta_receber c ON c.id = b.conta_receber
       WHERE b.id = $1 AND b.empresa = $2 FOR UPDATE OF b, c`,
      [id, req.empresaId]
    );
    const baixa = rows[0];
    if (!baixa || baixa.situacao !== 'A' || baixa.situacao_conta === 'C') {
      await client.query('ROLLBACK');
      return res.status(baixa ? 409 : 404).json({ erro: baixa ? 'Esta baixa não pode ser estornada.' : 'Baixa não encontrada.' });
    }
    await client.query(
      `UPDATE conta_receber_baixa SET situacao = 'C', user_update = $1, date_update = now() WHERE id = $2`,
      [req.usuario.login, id]
    );
    await client.query(
      `UPDATE caixa_movimento SET situacao = 'C', user_update = $1, date_update = now()
       WHERE conta_receber_baixa = $2 AND empresa = $3 AND situacao = 'A'`,
      [req.usuario.login, id, req.empresaId]
    );
    await recalcularConta(client, baixa.conta_receber, req.usuario.login);
    await client.query('COMMIT');
    res.json(await carregarConta(pool, baixa.conta_receber, req.empresaId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao estornar a baixa.' });
  } finally {
    client.release();
  }
}

// ==================================================================
// CAIXA
// ==================================================================

// GET /api/financeiro/caixa?de=YYYY-MM-DD&ate=&meio=&origem=OS|RECEBIMENTO&cancelados=true
async function listarCaixa(req, res) {
  const de = data(req.query.de) || hoje();
  const ate = data(req.query.ate) || de;
  if (ate < de) return res.status(400).json({ erro: 'Período inválido.' });

  const filtros = ['m.empresa = $1', 'm.data_movimento >= $2::date', `m.data_movimento < $3::date + 1`];
  const valores = [req.empresaId, de, ate];
  if (req.query.cancelados !== 'true') filtros.push(`m.situacao = 'A'`);
  if (MEIOS_PAGAMENTO.includes(req.query.meio)) {
    valores.push(req.query.meio);
    filtros.push(`m.meio_pagamento = $${valores.length}`);
  }
  if (['OS', 'RECEBIMENTO'].includes(req.query.origem)) {
    valores.push(req.query.origem);
    filtros.push(`m.origem = $${valores.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT m.*, p.nome AS pessoa_nome, o.numero AS ordem_numero
       FROM caixa_movimento m
       LEFT JOIN pessoa p ON p.id = m.pessoa
       LEFT JOIN ordem_servico o ON o.id = m.ordem_servico
       WHERE ${filtros.join(' AND ')}
       ORDER BY m.data_movimento, m.id`,
      valores
    );
    const itens = rows.map((m) => ({
      id: m.id,
      dataMovimento: m.data_movimento,
      tipo: m.tipo,
      valor: Number(m.valor),
      meioPagamento: m.meio_pagamento,
      historico: m.historico,
      pessoaNome: m.pessoa_nome,
      ordemServico: m.ordem_servico,
      ordemNumero: m.ordem_numero,
      origem: m.origem,
      situacao: m.situacao,
      usuario: m.user_insert,
    }));

    // Totais só dos lançamentos ativos.
    let entradas = 0;
    let saidas = 0;
    const porMeio = {};
    for (const m of itens) {
      if (m.situacao !== 'A') continue;
      const c = centavos(m.valor);
      if (m.tipo === 'E') entradas += c;
      else saidas += c;
      const chave = m.meioPagamento || 'OUTROS';
      porMeio[chave] = (porMeio[chave] || 0) + (m.tipo === 'E' ? c : -c);
    }
    res.json({
      de,
      ate,
      itens,
      totais: {
        entradas: entradas / 100,
        saidas: saidas / 100,
        saldo: (entradas - saidas) / 100,
        porMeio: Object.entries(porMeio).map(([meio, valor]) => ({ meio, valor: valor / 100 })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o caixa.' });
  }
}

module.exports = { listarContas, obterConta, baixarConta, estornarBaixa, listarCaixa, MEIOS_PAGAMENTO };
