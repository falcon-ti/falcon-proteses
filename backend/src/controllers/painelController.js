// Painel (tela inicial) — resumo da EMPRESA DA SESSÃO.
//
// Cada bloco só é calculado/devolvido se o usuário tiver o privilégio da
// tela de origem (quem não vê o financeiro não recebe números do caixa):
//   ordens     -> ordens-servico.ver  (contadores, próximas entregas,
//                                      faturamento 6 meses, serviços do mês)
//   caixa      -> caixa.ver           (recebido hoje / no mês)
//   receber    -> contas-receber.ver  (em aberto, vencido, lista de vencidas)
const pool = require('../config/db');
const { carregarPrivilegios } = require('../services/privilegios');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function blocoOrdens(empresa) {
  const [contadores, entregas, faturamento, servicos] = await Promise.all([
    pool.query(
      `SELECT
         count(*) FILTER (WHERE situacao = 'A') AS abertas,
         count(*) FILTER (WHERE situacao = 'A' AND data_entrega < now()) AS atrasadas,
         count(*) FILTER (WHERE situacao = 'A' AND data_entrega::date = current_date) AS entregas_hoje,
         count(*) FILTER (WHERE situacao = 'A' AND data_entrega::date = current_date + 1) AS entregas_amanha,
         count(*) FILTER (WHERE situacao = 'A' AND enviar_prova AND NOT prova_realizada) AS aguardando_prova,
         count(*) FILTER (WHERE situacao = 'C' AND data_conclusao >= date_trunc('month', current_date)) AS concluidas_mes,
         COALESCE(SUM(valor_total) FILTER (WHERE situacao = 'A'), 0) AS valor_aberto
       FROM ordem_servico WHERE empresa = $1`,
      [empresa]
    ),
    // Próximas entregas: abertas com entrega definida (atrasadas primeiro).
    pool.query(
      `SELECT o.id, o.numero, o.paciente, o.data_entrega, o.enviar_prova, o.prova_realizada, o.valor_total,
              p.nome AS cliente
       FROM ordem_servico o JOIN pessoa p ON p.id = o.cliente
       WHERE o.empresa = $1 AND o.situacao = 'A' AND o.data_entrega IS NOT NULL
       ORDER BY o.data_entrega
       LIMIT 8`,
      [empresa]
    ),
    // Faturamento: valor das OS concluídas por mês (últimos 6 meses, inclusive o atual).
    pool.query(
      `SELECT to_char(m.mes, 'YYYY-MM') AS mes, COALESCE(SUM(o.valor_total), 0) AS valor, count(o.id) AS qtd
       FROM generate_series(date_trunc('month', current_date) - interval '5 months',
                            date_trunc('month', current_date), interval '1 month') AS m(mes)
       LEFT JOIN ordem_servico o
         ON o.empresa = $1 AND o.situacao = 'C'
        AND o.data_conclusao >= m.mes AND o.data_conclusao < m.mes + interval '1 month'
       GROUP BY m.mes ORDER BY m.mes`,
      [empresa]
    ),
    // Serviços mais feitos no mês (OS não canceladas com entrada no mês).
    pool.query(
      `SELECT i.descricao, SUM(i.quantidade) AS qtd, SUM(i.valor_total) AS valor
       FROM ordem_servico_item i JOIN ordem_servico o ON o.id = i.ordem_servico
       WHERE o.empresa = $1 AND o.situacao <> 'X' AND o.data_entrada >= date_trunc('month', current_date)
       GROUP BY i.descricao
       ORDER BY 2 DESC, 3 DESC
       LIMIT 5`,
      [empresa]
    ),
  ]);
  const c = contadores.rows[0];
  return {
    abertas: Number(c.abertas),
    atrasadas: Number(c.atrasadas),
    entregasHoje: Number(c.entregas_hoje),
    entregasAmanha: Number(c.entregas_amanha),
    aguardandoProva: Number(c.aguardando_prova),
    concluidasMes: Number(c.concluidas_mes),
    valorAberto: Number(c.valor_aberto),
    proximasEntregas: entregas.rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      paciente: r.paciente,
      cliente: r.cliente,
      dataEntrega: r.data_entrega,
      provaPendente: r.enviar_prova && !r.prova_realizada,
      valorTotal: Number(r.valor_total),
    })),
    faturamento: faturamento.rows.map((r) => {
      const [ano, mes] = r.mes.split('-');
      return { mes: r.mes, rotulo: `${MESES[Number(mes) - 1]}/${ano.slice(2)}`, valor: Number(r.valor), qtd: Number(r.qtd) };
    }),
    servicosMes: servicos.rows.map((r) => ({ descricao: r.descricao, qtd: Number(r.qtd), valor: Number(r.valor) })),
  };
}

async function blocoCaixa(empresa) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'E' THEN valor ELSE -valor END)
                FILTER (WHERE data_movimento >= current_date), 0) AS hoje,
       COALESCE(SUM(CASE WHEN tipo = 'E' THEN valor ELSE -valor END)
                FILTER (WHERE data_movimento >= date_trunc('month', current_date)), 0) AS mes
     FROM caixa_movimento
     WHERE empresa = $1 AND situacao = 'A' AND data_movimento >= date_trunc('month', current_date)`,
    [empresa]
  );
  return { recebidoHoje: Number(rows[0].hoje), recebidoMes: Number(rows[0].mes) };
}

async function blocoReceber(empresa) {
  const [totais, lista] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor - valor_pago), 0) AS aberto,
              COALESCE(SUM(valor - valor_pago) FILTER (WHERE vencimento < current_date), 0) AS vencido,
              count(*) FILTER (WHERE vencimento < current_date) AS qtd_vencidas,
              COALESCE(SUM(valor - valor_pago) FILTER (WHERE vencimento BETWEEN current_date AND current_date + 7), 0) AS proximos_7
       FROM conta_receber WHERE empresa = $1 AND situacao = 'A'`,
      [empresa]
    ),
    // Vencidas e as que vencem nos próximos 7 dias.
    pool.query(
      `SELECT c.id, c.vencimento, c.valor - c.valor_pago AS saldo, c.parcela, c.total_parcelas,
              p.nome AS cliente, o.numero AS ordem_numero
       FROM conta_receber c
       JOIN pessoa p ON p.id = c.pessoa
       LEFT JOIN ordem_servico o ON o.id = c.ordem_servico
       WHERE c.empresa = $1 AND c.situacao = 'A' AND c.vencimento <= current_date + 7
       ORDER BY c.vencimento
       LIMIT 6`,
      [empresa]
    ),
  ]);
  const t = totais.rows[0];
  return {
    emAberto: Number(t.aberto),
    vencido: Number(t.vencido),
    qtdVencidas: Number(t.qtd_vencidas),
    proximos7Dias: Number(t.proximos_7),
    contas: lista.rows.map((r) => ({
      id: r.id,
      vencimento: r.vencimento,
      saldo: Number(r.saldo),
      parcela: r.parcela,
      totalParcelas: r.total_parcelas,
      cliente: r.cliente,
      ordemNumero: r.ordem_numero,
    })),
  };
}

// GET /api/painel
async function resumo(req, res) {
  try {
    const privilegios = await carregarPrivilegios(Number(req.usuario.id));
    const [ordens, caixa, receber] = await Promise.all([
      privilegios.has('ordens-servico.ver') ? blocoOrdens(req.empresaId) : null,
      privilegios.has('caixa.ver') ? blocoCaixa(req.empresaId) : null,
      privilegios.has('contas-receber.ver') ? blocoReceber(req.empresaId) : null,
    ]);
    res.json({ ordens, caixa, receber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao montar o painel.' });
  }
}

module.exports = { resumo };
