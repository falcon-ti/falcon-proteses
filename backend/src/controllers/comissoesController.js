// Comissões por funcionário x serviço (tabela funcionario_comissao).
//
// POR EMPRESA (rotas com "exigirEmpresa"). Tela própria com privilégio
// "comissoes" (ver / editar) — separada do cadastro de Pessoas pra
// controlar quem pode alterar comissão.
//
// Tipos: 'V' valor fixo em R$ por unidade; 'P' percentual do total do item.
const pool = require('../config/db');

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/comissoes/funcionarios — funcionários ativos da empresa com a
// quantidade de serviços que já têm comissão definida.
async function listarFuncionarios(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.nome, p.registro_profissional,
              (SELECT count(*) FROM funcionario_comissao fc
               JOIN servico s ON s.id = fc.servico AND s.situacao = 'A'
               WHERE fc.funcionario = p.id) AS qtd
       FROM pessoa p
       WHERE p.empresa = $1 AND p.funcionario AND p.situacao = 'A'
       ORDER BY p.nome`,
      [req.empresaId]
    );
    res.json(rows.map((r) => ({ id: r.id, nome: r.nome, registro: r.registro_profissional, qtdComissoes: Number(r.qtd) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar os funcionários.' });
  }
}

async function carregarFuncionario(id, empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nome FROM pessoa WHERE id = $1 AND empresa = $2 AND funcionario`,
    [id, empresaId]
  );
  return rows[0] || null;
}

// GET /api/comissoes/funcionarios/:id — todos os serviços ATIVOS da empresa
// com a comissão desse funcionário (null = sem comissão).
async function obterFuncionario(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Funcionário inválido.' });
  try {
    const funcionario = await carregarFuncionario(id, req.empresaId);
    if (!funcionario) return res.status(404).json({ erro: 'Funcionário não encontrado nesta empresa.' });
    const { rows } = await pool.query(
      `SELECT s.id, s.descricao, s.valor, fc.tipo, fc.valor AS comissao
       FROM servico s
       LEFT JOIN funcionario_comissao fc ON fc.servico = s.id AND fc.funcionario = $1
       WHERE s.empresa = $2 AND s.situacao = 'A'
       ORDER BY s.descricao`,
      [id, req.empresaId]
    );
    res.json({
      funcionario: { id: funcionario.id, nome: funcionario.nome },
      itens: rows.map((r) => ({
        servico: r.id,
        descricao: r.descricao,
        valorServico: Number(r.valor),
        tipo: r.tipo || 'V',
        valor: r.comissao === null ? null : Number(r.comissao),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar as comissões.' });
  }
}

// PUT /api/comissoes/funcionarios/:id  { itens: [{ servico, tipo, valor }] }
// Grava a tabela inteira do funcionário: item com valor vazio/null = sem
// comissão (remove). Serviços que não vierem na lista não são alterados.
async function salvarFuncionario(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Funcionário inválido.' });
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];

  const erros = [];
  const normalizados = [];
  for (const item of itens) {
    const servico = idValido(item.servico);
    if (!servico) {
      erros.push('Serviço inválido na lista.');
      continue;
    }
    const vazio = item.valor === null || item.valor === undefined || item.valor === '';
    const tipo = item.tipo === 'P' ? 'P' : 'V';
    const valor = vazio ? null : Math.round(Number(item.valor) * 100) / 100;
    if (!vazio && (!Number.isFinite(valor) || valor < 0)) erros.push('Há comissão com valor inválido.');
    if (!vazio && tipo === 'P' && valor > 100) erros.push('Percentual de comissão não pode passar de 100%.');
    normalizados.push({ servico, tipo, valor });
  }
  if (erros.length) return res.status(400).json({ erro: [...new Set(erros)].join(' ') });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: func } = await client.query(
      'SELECT id FROM pessoa WHERE id = $1 AND empresa = $2 AND funcionario',
      [id, req.empresaId]
    );
    if (!func[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Funcionário não encontrado nesta empresa.' });
    }
    const idsServico = normalizados.map((n) => n.servico);
    const { rows: validos } = await client.query('SELECT id FROM servico WHERE empresa = $1 AND id = ANY($2)', [
      req.empresaId,
      idsServico,
    ]);
    const setValidos = new Set(validos.map((v) => v.id));
    if (idsServico.some((s) => !setValidos.has(s))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Há serviço que não pertence a esta empresa.' });
    }

    for (const n of normalizados) {
      if (n.valor === null) {
        await client.query('DELETE FROM funcionario_comissao WHERE funcionario = $1 AND servico = $2', [id, n.servico]);
      } else {
        await client.query(
          `INSERT INTO funcionario_comissao (empresa, funcionario, servico, tipo, valor, user_insert, user_update)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (funcionario, servico) DO UPDATE
             SET tipo = EXCLUDED.tipo, valor = EXCLUDED.valor, user_update = EXCLUDED.user_update, date_update = now()
           WHERE funcionario_comissao.tipo IS DISTINCT FROM EXCLUDED.tipo
              OR funcionario_comissao.valor IS DISTINCT FROM EXCLUDED.valor`,
          [req.empresaId, id, n.servico, n.tipo, n.valor, req.usuario.login]
        );
      }
    }
    await client.query('COMMIT');
    req.params.id = String(id);
    return obterFuncionario(req, res);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar as comissões.' });
  } finally {
    client.release();
  }
}

module.exports = { listarFuncionarios, obterFuncionario, salvarFuncionario };
