// Cadastro de empresas (laboratórios). Rotas protegidas por privilégio
// "empresas.*" (ver empresasRoutes.js).
//
// - "excluir" INATIVA (situacao = 'I'): os lançamentos vão ter FK pra
//   empresa.id, então nunca apagamos a linha.
// - Quem cadastra uma empresa já fica vinculado a ela (usuario_empresa) —
//   numa base nova é assim que o admin passa a ter uma empresa pra
//   trabalhar. Outros usuários são vinculados no cadastro de Usuários.
// - Logo: o formulário manda base64 ("logoBase64"); a API nunca devolve os
//   bytes na listagem, só "temLogo". A imagem é servida por
//   GET /api/empresas/:id/logo.
const pool = require('../config/db');
const { limparDocumento, somenteDigitos, documentoValido, cepValido } = require('../utils/documento');
const { invalidarEmpresaSessao } = require('../services/empresaSessao');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MAX_LOGO = 1024 * 1024; // 1 MB

const COLUNAS = `e.id, e.tipo_pessoa, e.cnpj_cpf, e.razao_social, e.nome_fantasia, e.inscricao_estadual,
  e.inscricao_municipal, e.regime_tributario, e.cep, e.logradouro, e.numero, e.complemento, e.bairro,
  e.cidade, c.nome AS cidade_nome, e.uf, e.telefone, e.celular, e.email, e.site, e.responsavel_tecnico,
  e.cro_responsavel, e.cro_uf, e.observacao, e.situacao, (e.logo IS NOT NULL) AS tem_logo`;

const SELECT_BASE = `SELECT ${COLUNAS} FROM empresa e LEFT JOIN cidade c ON c.codigo_ibge = e.cidade`;

function paraApi(r) {
  return {
    id: r.id,
    tipoPessoa: r.tipo_pessoa,
    cnpjCpf: r.cnpj_cpf,
    razaoSocial: r.razao_social,
    nomeFantasia: r.nome_fantasia,
    inscricaoEstadual: r.inscricao_estadual,
    inscricaoMunicipal: r.inscricao_municipal,
    regimeTributario: r.regime_tributario,
    cep: r.cep,
    logradouro: r.logradouro,
    numero: r.numero,
    complemento: r.complemento,
    bairro: r.bairro,
    cidade: r.cidade,
    cidadeNome: r.cidade_nome,
    uf: r.uf,
    telefone: r.telefone,
    celular: r.celular,
    email: r.email,
    site: r.site,
    responsavelTecnico: r.responsavel_tecnico,
    croResponsavel: r.cro_responsavel,
    croUf: r.cro_uf,
    observacao: r.observacao,
    ativo: r.situacao === 'A',
    temLogo: !!r.tem_logo,
  };
}

// '' / undefined / só espaços -> null; senão o texto aparado.
function texto(valor, tamanhoMax) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  if (!t) return null;
  return tamanhoMax ? t.slice(0, tamanhoMax) : t;
}

// Normaliza + valida o corpo. Devolve { erros, dados }.
async function prepararEmpresa(body) {
  const erros = [];
  const tipoPessoa = body.tipoPessoa === 'F' ? 'F' : 'J';
  const cnpjCpf = tipoPessoa === 'F' ? somenteDigitos(body.cnpjCpf) : limparDocumento(body.cnpjCpf);
  const razaoSocial = texto(body.razaoSocial, 150);
  const regime = body.regimeTributario === null || body.regimeTributario === undefined || body.regimeTributario === ''
    ? null
    : Number(body.regimeTributario);
  const cep = body.cep ? somenteDigitos(body.cep) : null;
  const uf = texto(body.uf)?.toUpperCase() || null;
  const cidade = body.cidade ? Number(body.cidade) : null;
  const croUf = texto(body.croUf)?.toUpperCase() || null;
  const email = texto(body.email, 150);
  let inscricaoEstadual = texto(body.inscricaoEstadual, 20);
  if (inscricaoEstadual) {
    inscricaoEstadual = /^isent[oa]$/i.test(inscricaoEstadual) ? 'ISENTO' : inscricaoEstadual.replace(/[^\dA-Za-z]/g, '');
  }

  if (!razaoSocial) erros.push(tipoPessoa === 'F' ? 'Informe o nome.' : 'Informe a razão social.');
  if (!cnpjCpf) {
    erros.push(tipoPessoa === 'F' ? 'Informe o CPF.' : 'Informe o CNPJ.');
  } else if (!documentoValido(tipoPessoa, cnpjCpf)) {
    erros.push(tipoPessoa === 'F' ? 'CPF inválido.' : 'CNPJ inválido.');
  }
  if (regime !== null && ![1, 2, 3, 4].includes(regime)) erros.push('Regime tributário inválido.');
  if (cep && !cepValido(cep)) erros.push('CEP inválido (8 dígitos).');
  if (email && !EMAIL_REGEX.test(email)) erros.push('Informe um email válido.');
  if (cidade && !uf) erros.push('Informe a UF da cidade.');

  // Cidade tem que existir e ser da UF informada; UFs têm que existir.
  if (cidade && uf) {
    const { rows } = await pool.query('SELECT uf FROM cidade WHERE codigo_ibge = $1', [cidade]);
    if (!rows[0]) erros.push('Cidade não encontrada.');
    else if (rows[0].uf !== uf) erros.push('A cidade informada não pertence à UF selecionada.');
  }
  for (const [rotulo, sigla] of [['UF', uf], ['UF do CRO', croUf]]) {
    if (sigla) {
      const { rowCount } = await pool.query('SELECT 1 FROM uf WHERE sigla = $1', [sigla]);
      if (!rowCount) erros.push(`${rotulo} inválida.`);
    }
  }

  return {
    erros,
    dados: {
      tipoPessoa,
      cnpjCpf,
      razaoSocial,
      nomeFantasia: texto(body.nomeFantasia, 150),
      inscricaoEstadual,
      inscricaoMunicipal: texto(body.inscricaoMunicipal, 20),
      regime,
      cep,
      logradouro: texto(body.logradouro, 150),
      numero: texto(body.numero, 20),
      complemento: texto(body.complemento, 80),
      bairro: texto(body.bairro, 80),
      cidade,
      uf,
      telefone: body.telefone ? somenteDigitos(body.telefone).slice(0, 20) || null : null,
      celular: body.celular ? somenteDigitos(body.celular).slice(0, 20) || null : null,
      email,
      site: texto(body.site, 150),
      responsavelTecnico: texto(body.responsavelTecnico, 150),
      croResponsavel: texto(body.croResponsavel, 20),
      croUf,
      observacao: texto(body.observacao),
      situacao: body.ativo === false ? 'I' : 'A',
    },
  };
}

// "data:image/png;base64,AAAA" ou "AAAA" -> Buffer. { erro } se inválido.
function decodificarLogo(valor) {
  if (valor === null || valor === '') return { buffer: null };
  if (typeof valor !== 'string') return { erro: 'Logo inválido.' };
  const buffer = Buffer.from(valor.replace(/^data:[\w/+.-]+;base64,/, ''), 'base64');
  if (!buffer.length) return { erro: 'Logo inválido.' };
  if (buffer.length > TAMANHO_MAX_LOGO) return { erro: 'O logo pode ter no máximo 1 MB.' };
  if (!tipoImagem(buffer)) return { erro: 'O logo precisa ser uma imagem PNG, JPG ou WEBP.' };
  return { buffer };
}

function tipoImagem(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

function tratarErroBanco(err, res, mensagemPadrao) {
  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Já existe uma empresa ativa com este CNPJ/CPF.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ erro: 'Cidade ou UF informada não existe.' });
  }
  console.error(err);
  return res.status(500).json({ erro: mensagemPadrao });
}

// GET /api/empresas
async function listar(req, res) {
  try {
    const { rows } = await pool.query(`${SELECT_BASE} ORDER BY e.razao_social`);
    res.json(rows.map(paraApi));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar empresas.' });
  }
}

// GET /api/empresas/:id
async function obter(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Empresa inválida.' });
  try {
    const { rows } = await pool.query(`${SELECT_BASE} WHERE e.id = $1`, [id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    res.json(paraApi(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar a empresa.' });
  }
}

// POST /api/empresas
async function criar(req, res) {
  const { erros, dados: d } = await prepararEmpresa(req.body || {});
  let logo = null;
  if (req.body?.logoBase64 !== undefined) {
    const r = decodificarLogo(req.body.logoBase64);
    if (r.erro) erros.push(r.erro);
    logo = r.buffer;
  }
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO empresa
         (tipo_pessoa, cnpj_cpf, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal,
          regime_tributario, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, celular,
          email, site, responsavel_tecnico, cro_responsavel, cro_uf, observacao, logo, situacao,
          user_insert, user_update)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20, $21, $22, $23, $24, $25, $25)
       RETURNING id`,
      [
        d.tipoPessoa, d.cnpjCpf, d.razaoSocial, d.nomeFantasia, d.inscricaoEstadual, d.inscricaoMunicipal,
        d.regime, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.telefone, d.celular,
        d.email, d.site, d.responsavelTecnico, d.croResponsavel, d.croUf, d.observacao, logo, d.situacao,
        req.usuario.login,
      ]
    );
    const id = rows[0].id;
    await client.query(
      'INSERT INTO usuario_empresa (usuario, empresa, user_insert) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.usuario.id, id, req.usuario.login]
    );
    await client.query('COMMIT');
    invalidarEmpresaSessao();

    const criada = await pool.query(`${SELECT_BASE} WHERE e.id = $1`, [id]);
    res.status(201).json(paraApi(criada.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    tratarErroBanco(err, res, 'Erro ao cadastrar a empresa.');
  } finally {
    client.release();
  }
}

// PUT /api/empresas/:id — "logoBase64" só é alterado quando a CHAVE vem no
// corpo (valor novo troca; null/'' remove; ausente mantém o atual).
async function atualizar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Empresa inválida.' });

  const { erros, dados: d } = await prepararEmpresa(req.body || {});
  const mexeuNoLogo = Object.prototype.hasOwnProperty.call(req.body || {}, 'logoBase64');
  let logo;
  if (mexeuNoLogo) {
    const r = decodificarLogo(req.body.logoBase64);
    if (r.erro) erros.push(r.erro);
    logo = r.buffer;
  }
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

  const valores = [
    d.tipoPessoa, d.cnpjCpf, d.razaoSocial, d.nomeFantasia, d.inscricaoEstadual, d.inscricaoMunicipal,
    d.regime, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.telefone, d.celular,
    d.email, d.site, d.responsavelTecnico, d.croResponsavel, d.croUf, d.observacao, d.situacao,
    req.usuario.login,
  ];
  let clausulaLogo = '';
  if (mexeuNoLogo) {
    valores.push(logo);
    clausulaLogo = `, logo = $${valores.length}`;
  }
  valores.push(id);

  try {
    const { rowCount } = await pool.query(
      `UPDATE empresa SET
         tipo_pessoa = $1, cnpj_cpf = $2, razao_social = $3, nome_fantasia = $4, inscricao_estadual = $5,
         inscricao_municipal = $6, regime_tributario = $7, cep = $8, logradouro = $9, numero = $10,
         complemento = $11, bairro = $12, cidade = $13, uf = $14, telefone = $15, celular = $16, email = $17,
         site = $18, responsavel_tecnico = $19, cro_responsavel = $20, cro_uf = $21, observacao = $22,
         situacao = $23, user_update = $24, date_update = now()${clausulaLogo}
       WHERE id = $${valores.length}`,
      valores
    );
    if (!rowCount) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    invalidarEmpresaSessao();
    const { rows } = await pool.query(`${SELECT_BASE} WHERE e.id = $1`, [id]);
    res.json(paraApi(rows[0]));
  } catch (err) {
    tratarErroBanco(err, res, 'Erro ao atualizar a empresa.');
  }
}

// DELETE /api/empresas/:id — inativa.
async function excluir(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Empresa inválida.' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE empresa SET situacao = 'I', user_update = $1, date_update = now() WHERE id = $2`,
      [req.usuario.login, id]
    );
    if (!rowCount) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    invalidarEmpresaSessao();
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao inativar a empresa.' });
  }
}

// GET /api/empresas/:id/logo — a imagem em si (não JSON).
async function logo(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Empresa inválida.' });
  try {
    const { rows } = await pool.query('SELECT logo FROM empresa WHERE id = $1', [id]);
    const bytes = rows[0]?.logo;
    if (!bytes) return res.status(404).json({ erro: 'Esta empresa não tem logo cadastrado.' });
    res.setHeader('Content-Type', tipoImagem(bytes) || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o logo.' });
  }
}

module.exports = { listar, obter, criar, atualizar, excluir, logo };
