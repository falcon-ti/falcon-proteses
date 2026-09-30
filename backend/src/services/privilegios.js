// Leitura dos privilégios de um usuário (tabela "usuario_privilegio").
//
// NÃO vão no token: são lidos do banco a cada requisição protegida, com
// cache curto em memória — salvar a aba "Privilégios" vale na hora
// (o cache do usuário é invalidado).
const pool = require('../config/db');

const TTL_MS = 30 * 1000;

// Regra fixa: usuario.admin = true sempre tem os cadastros de Usuários e
// Empresas completos, marcados ou não na aba Privilégios (senão uma base
// nova — sem empresa nenhuma — não teria como ser configurada). O resto
// continua dependendo dos privilégios. "admin" é lido do BANCO, então
// tirar o admin de alguém vale na hora.
const PRIVILEGIOS_FIXOS_ADMIN = [
  'usuarios.ver', 'usuarios.incluir', 'usuarios.editar', 'usuarios.inativar',
  'empresas.ver', 'empresas.incluir', 'empresas.editar', 'empresas.inativar',
];

const cache = new Map(); // usuario -> { expira, chaves: Set<"tela.acao"> }

async function carregarPrivilegios(idUsuario) {
  const agora = Date.now();
  const emCache = cache.get(idUsuario);
  if (emCache && emCache.expira > agora) return emCache.chaves;

  const [privilegios, usuario] = await Promise.all([
    pool.query('SELECT tela, acao FROM usuario_privilegio WHERE usuario = $1', [idUsuario]),
    pool.query('SELECT admin FROM usuario WHERE id = $1', [idUsuario]),
  ]);
  const chaves = new Set(privilegios.rows.map((r) => `${r.tela}.${r.acao}`));
  if (usuario.rows[0]?.admin) {
    for (const chave of PRIVILEGIOS_FIXOS_ADMIN) chaves.add(chave);
  }
  cache.set(idUsuario, { expira: agora + TTL_MS, chaves });
  return chaves;
}

function invalidarPrivilegios(idUsuario) {
  if (idUsuario === undefined) cache.clear();
  else cache.delete(Number(idUsuario));
}

// Lista ordenada ["tela.acao", ...] — formato devolvido pro frontend.
async function listarPrivilegios(idUsuario) {
  return [...(await carregarPrivilegios(idUsuario))].sort();
}

module.exports = { carregarPrivilegios, invalidarPrivilegios, listarPrivilegios, PRIVILEGIOS_FIXOS_ADMIN };
