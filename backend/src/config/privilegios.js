// Catálogo de privilégios (tabela "usuario_privilegio") — mesmo modelo do
// falcon-web: cada privilégio gravado é o par (tela, acao). "tela" é a
// chave usada também no frontend (utils/menu.js, router/index.js,
// auth.pode).
//
// Tela nova: incluir aqui, proteger as rotas da API com
// exigirPrivilegio('<tela>', '<acao>') e usar meta.privilegio no router.
//
// "acoes": quais das 4 ações padrão fazem sentido na tela (as outras
// aparecem desabilitadas na matriz). "especiais": ações próprias da tela.
const ACOES_PADRAO = [
  { chave: 'ver', label: 'Ver' },
  { chave: 'incluir', label: 'Incluir' },
  { chave: 'editar', label: 'Editar' },
  { chave: 'inativar', label: 'Inativar' },
];

const TODAS = ['ver', 'incluir', 'editar', 'inativar'];

const SECOES = [
  {
    titulo: 'Início',
    telas: [{ chave: 'dashboard', label: 'Painel', acoes: ['ver'] }],
  },
  {
    titulo: 'Administração · Cadastros',
    telas: [{ chave: 'empresas', label: 'Empresas', acoes: TODAS }],
  },
  {
    titulo: 'Administração · Sistema',
    telas: [{ chave: 'usuarios', label: 'Usuários', acoes: TODAS }],
  },
];

const ACOES_POR_TELA = new Map();
for (const secao of SECOES) {
  for (const tela of secao.telas) {
    ACOES_POR_TELA.set(tela.chave, new Set([...tela.acoes, ...(tela.especiais || []).map((e) => e.chave)]));
  }
}

function privilegioValido(tela, acao) {
  return ACOES_POR_TELA.get(tela)?.has(acao) || false;
}

// Normaliza o que vem do frontend: aceita [{ tela, acao }] ou ["tela.acao"].
// Descarta duplicados e pares fora do catálogo. Qualquer ação numa tela
// implica "ver".
function normalizarPrivilegios(valor) {
  if (!Array.isArray(valor)) return [];
  const chaves = new Set();
  for (const item of valor) {
    let tela;
    let acao;
    if (typeof item === 'string') {
      const idx = item.lastIndexOf('.');
      tela = item.slice(0, idx);
      acao = item.slice(idx + 1);
    } else if (item && typeof item === 'object') {
      tela = item.tela;
      acao = item.acao;
    }
    if (typeof tela === 'string' && typeof acao === 'string' && privilegioValido(tela, acao)) {
      chaves.add(`${tela}.${acao}`);
      if (acao !== 'ver' && privilegioValido(tela, 'ver')) chaves.add(`${tela}.ver`);
    }
  }
  return [...chaves].map((chave) => {
    const idx = chave.lastIndexOf('.');
    return { tela: chave.slice(0, idx), acao: chave.slice(idx + 1) };
  });
}

module.exports = { ACOES_PADRAO, SECOES, privilegioValido, normalizarPrivilegios };
