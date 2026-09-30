// Cadastro de Pessoas (clientes, fornecedores, funcionários).
//
// POR EMPRESA: todas as rotas passam por "exigirEmpresa" (pessoasRoutes.js)
// e TODA consulta filtra por req.empresaId — uma empresa nunca enxerga
// nem altera pessoa de outra. "empresa" do corpo da requisição é ignorada.
//
// - Tipos: cliente / fornecedor / funcionário (um ou mais).
// - CPF/CNPJ opcional; quando vem, é validado e não pode repetir entre as
//   pessoas ATIVAS da mesma empresa (índice parcial no banco).
// - "excluir" INATIVA (situacao = 'I').
const pool = require('../config/db');
const { limparDocumento, somenteDigitos, documentoValido } = require('../utils/documento');
const { prepararEndereco, texto } = require('../utils/endereco');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPOS = ['cliente', 'fornecedor', 'funcionario'];
const LIMITE_LISTAGEM = 500;

const COLUNAS = `p.id, p.cliente, p.fornecedor, p.funcionario, p.tipo_pessoa, p.nome, p.cnpj_cpf, p.rg_ie,
  p.registro_profissional, p.limite_credito, p.cep, p.rua, p.numero, p.complemento, p.bairro, p.cidade,
  c.nome AS cidade_nome, p.uf, p.telefone, p.celular, p.email, p.situacao,
  p.user_insert, p.date_insert, p.user_update, p.date_update`;

const SELECT_BASE = `SELECT ${COLUNAS} FROM pessoa p LEFT JOIN cidade c ON c.codigo_ibge = p.cidade`;

function paraApi(r) {
  return {
    id: r.id,
    tipos: TIPOS.filter((t) => r[t]),
    tipoPessoa: r.tipo_pessoa,
    nome: r.nome,
    cnpjCpf: r.cnpj_cpf,
    rgIe: r.rg_ie,
    registroProfissional: r.registro_profissional,
    limiteCredito: Number(r.limite_credito),
    cep: r.cep,
    rua: r.rua,
    numero: r.numero,
    complemento: r.complemento,
    bairro: r.bairro,
    cidade: r.cidade,
    cidadeNome: r.cidade_nome,
    uf: r.uf,
    telefone: r.telefone,
    celular: r.celular,
    email: r.email,
    ativo: r.situacao === 'A',
  };
}

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function prepararPessoa(body) {
  const erros = [];
  const tipoPessoa = body.tipoPessoa === 'J' ? 'J' : 'F';
  const tipos = Array.isArray(body.tipos) ? TIPOS.filter((t) => body.tipos.includes(t)) : [];
  const nome = texto(body.nome, 150);
  const docBruto = tipoPessoa === 'F' ? somenteDigitos(body.cnpjCpf) : limparDocumento(body.cnpjCpf);
  const cnpjCpf = docBruto || null;
  const email = texto(body.email, 150);
  const limite = body.limiteCredito === null || body.limiteCredito === undefined || body.limiteCredito === ''
    ? 0
    : Number(body.limiteCredito);

  if (!tipos.length) erros.push('Marque pelo menos um tipo (cliente, fornecedor ou funcionário).');
  if (!nome) erros.push(tipoPessoa === 'F' ? 'Informe o nome.' : 'Informe a razão social.');
  if (cnpjCpf && !documentoValido(tipoPessoa, cnpjCpf)) erros.push(tipoPessoa === 'F' ? 'CPF inválido.' : 'CNPJ inválido.');
  if (!Number.isFinite(limite) || limite < 0) erros.push('Limite de crédito inválido.');
  if (email && !EMAIL_REGEX.test(email)) erros.push('Informe um email válido.');

  const { erros: errosEndereco, endereco } = await prepararEndereco(body);
  erros.push(...errosEndereco);

  return {
    erros,
    dados: {
      tipos,
      tipoPessoa,
      nome,
      cnpjCpf,
      rgIe: texto(body.rgIe, 20),
      registroProfissional: texto(body.registroProfissional, 30),
      limite: Math.round(limite * 100) / 100,
      ...endereco,
      telefone: body.telefone ? somenteDigitos(body.telefone).slice(0, 20) || null : null,
      celular: body.celular ? somenteDigitos(body.celular).slice(0, 20) || null : null,
      email,
      situacao: body.ativo === false ? 'I' : 'A',
    },
  };
}

function valoresPessoa(d) {
  return [
    d.tipos.includes('cliente'), d.tipos.includes('fornecedor'), d.tipos.includes('funcionario'),
    d.tipoPessoa, d.nome, d.cnpjCpf, d.rgIe, d.registroProfissional, d.limite,
    d.cep, d.rua, d.numero, d.complemento, d.bairro, d.cidade, d.uf,
    d.telefone, d.celular, d.email, d.situacao,
  ];
}

function tratarErroBanco(err, res, mensagemPadrao) {
  if (err.code === '23505') return res.status(409).json({ erro: 'Já existe uma pessoa ativa com este CPF/CNPJ nesta empresa.' });
  if (err.code === '23503') return res.status(400).json({ erro: 'Cidade ou UF informada não existe.' });
  console.error(err);
  return res.status(500).json({ erro: mensagemPadrao });
}

// GET /api/pessoas?busca=&tipo=cliente&ativo=true|false
// Filtros no servidor (a lista cresce com o tempo); no máximo 500 linhas,
// ordenadas por nome. "busca" procura em nome, CPF/CNPJ, código, cidade,
// email e registro profissional.
async function listar(req, res) {
  const filtros = ['p.empresa = $1'];
  const valores = [req.empresaId];

  const tipo = String(req.query.tipo || '');
  if (TIPOS.includes(tipo)) filtros.push(`p.${tipo}`);

  if (req.query.ativo === 'true') filtros.push(`p.situacao = 'A'`);
  else if (req.query.ativo === 'false') filtros.push(`p.situacao = 'I'`);

  const busca = String(req.query.busca || '').trim();
  if (busca) {
    valores.push(`%${busca}%`);
    const i = valores.length;
    const partes = [
      `unaccent_simples(p.nome) ILIKE unaccent_simples($${i})`,
      `unaccent_simples(c.nome) ILIKE unaccent_simples($${i})`,
      `p.email ILIKE $${i}`,
      `p.registro_profissional ILIKE $${i}`,
    ];
    const doc = limparDocumento(busca);
    if (doc) {
      valores.push(`%${doc}%`);
      partes.push(`p.cnpj_cpf LIKE $${valores.length}`);
    }
    if (/^\d+$/.test(busca)) {
      valores.push(Number(busca));
      partes.push(`p.id = $${valores.length}`);
    }
    filtros.push(`(${partes.join(' OR ')})`);
  }

  try {
    const { rows } = await pool.query(
      `${SELECT_BASE} WHERE ${filtros.join(' AND ')} ORDER BY p.nome LIMIT ${LIMITE_LISTAGEM + 1}`,
      valores
    );
    res.json({
      itens: rows.slice(0, LIMITE_LISTAGEM).map(paraApi),
      limitado: rows.length > LIMITE_LISTAGEM,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar pessoas.' });
  }
}

// GET /api/pessoas/:id
async function obter(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Pessoa inválida.' });
  try {
    const { rows } = await pool.query(`${SELECT_BASE} WHERE p.id = $1 AND p.empresa = $2`, [id, req.empresaId]);
    if (!rows[0]) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    res.json(paraApi(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar a pessoa.' });
  }
}

// POST /api/pessoas
async function criar(req, res) {
  const { erros, dados } = await prepararPessoa(req.body || {});
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });
  try {
    const { rows } = await pool.query(
      `INSERT INTO pessoa
         (cliente, fornecedor, funcionario, tipo_pessoa, nome, cnpj_cpf, rg_ie, registro_profissional,
          limite_credito, cep, rua, numero, complemento, bairro, cidade, uf, telefone, celular, email,
          situacao, empresa, user_insert, user_update)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
               $20, $21, $22, $22)
       RETURNING id`,
      [...valoresPessoa(dados), req.empresaId, req.usuario.login]
    );
    const criada = await pool.query(`${SELECT_BASE} WHERE p.id = $1`, [rows[0].id]);
    res.status(201).json(paraApi(criada.rows[0]));
  } catch (err) {
    tratarErroBanco(err, res, 'Erro ao cadastrar a pessoa.');
  }
}

// PUT /api/pessoas/:id
async function atualizar(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Pessoa inválida.' });
  const { erros, dados } = await prepararPessoa(req.body || {});
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });
  try {
    const { rowCount } = await pool.query(
      `UPDATE pessoa SET
         cliente = $1, fornecedor = $2, funcionario = $3, tipo_pessoa = $4, nome = $5, cnpj_cpf = $6,
         rg_ie = $7, registro_profissional = $8, limite_credito = $9, cep = $10, rua = $11, numero = $12,
         complemento = $13, bairro = $14, cidade = $15, uf = $16, telefone = $17, celular = $18, email = $19,
         situacao = $20, user_update = $21, date_update = now()
       WHERE id = $22 AND empresa = $23`,
      [...valoresPessoa(dados), req.usuario.login, id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    const { rows } = await pool.query(`${SELECT_BASE} WHERE p.id = $1`, [id]);
    res.json(paraApi(rows[0]));
  } catch (err) {
    tratarErroBanco(err, res, 'Erro ao atualizar a pessoa.');
  }
}

// DELETE /api/pessoas/:id — inativa.
async function excluir(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Pessoa inválida.' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE pessoa SET situacao = 'I', user_update = $1, date_update = now() WHERE id = $2 AND empresa = $3`,
      [req.usuario.login, id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao inativar a pessoa.' });
  }
}

module.exports = { listar, obter, criar, atualizar, excluir };
