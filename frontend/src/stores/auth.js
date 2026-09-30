// "Store" simples de autenticação (objeto reativo compartilhado), mesmo
// padrão do falcon-web — sem Pinia.
//
// Usa axios "cru" (não services/api.js) porque o api.js lê o token DESTA
// store — importar de volta criaria import circular.
//
// EMPRESA DA SESSÃO: state.usuario.empresa = { id, nome } | null. Vem do
// token (escolhida no login) e muda com "trocarEmpresa", que pede um token
// novo ao backend. Todo lançamento do sistema é gravado nessa empresa.
import { reactive, computed } from 'vue';
import axios from 'axios';
import { primeiraRota } from '../utils/menu';

const CHAVE_STORAGE = 'falcon_proteses_token';

function lerToken() {
  try {
    return localStorage.getItem(CHAVE_STORAGE);
  } catch {
    return null;
  }
}

function gravarToken(token) {
  try {
    if (token) localStorage.setItem(CHAVE_STORAGE, token);
    else localStorage.removeItem(CHAVE_STORAGE);
  } catch {
    // Sem localStorage (janela privada etc.): a sessão vale só nesta aba.
  }
}

const state = reactive({
  token: lerToken(),
  // { id, login, nome, email, papel, empresa: { id, nome } | null, privilegios: ["tela.acao"] }
  usuario: null,
});

const estaAutenticado = computed(() => !!state.token && !!state.usuario);
const ehAdmin = computed(() => state.usuario?.papel === 'admin');
const empresa = computed(() => state.usuario?.empresa || null);
const privilegios = computed(() => new Set(state.usuario?.privilegios || []));

// auth.pode('empresas') / auth.pode('empresas', 'incluir').
function pode(tela, acao = 'ver') {
  return privilegios.value.has(`${tela}.${acao}`);
}

// Primeira tela liberada (destino depois do login / de rota bloqueada).
const rotaInicial = computed(() => primeiraRota(pode) || '/sem-acesso');

function aplicarSessao({ token, usuario }) {
  state.token = token;
  state.usuario = usuario;
  gravarToken(token);
}

// "empresa" só é obrigatória quando o usuário tem mais de uma (LoginPage.vue
// só mostra o select nesse caso).
async function login(usuario, senha, empresaId) {
  const { data } = await axios.post('/api/auth/login', { usuario, senha, empresa: empresaId });
  aplicarSessao(data);
}

// Troca a empresa da sessão sem sair do sistema (token novo).
async function trocarEmpresa(empresaId) {
  const { data } = await axios.post(
    '/api/auth/trocar-empresa',
    { empresa: empresaId },
    { headers: { Authorization: `Bearer ${state.token}` } }
  );
  aplicarSessao(data);
}

function logout() {
  state.token = null;
  state.usuario = null;
  gravarToken(null);
}

// Ao recarregar a página só temos o token — busca os dados do usuário (e
// confirma que o token ainda vale) em /api/auth/me.
async function restaurarSessao() {
  if (!state.token) return;
  try {
    const { data } = await axios.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    state.usuario = data;
  } catch (err) {
    logout();
  }
}

// Dispara já no carregamento do módulo: o guard do router e o main.js
// esperam essa Promise antes de decidir qualquer coisa.
const pronta = restaurarSessao();

// IMPORTANTE: objeto COMUM (não reactive()) — os computed são acessados
// com ".value" (ex.: auth.ehAdmin.value), mesmo padrão do falcon-web.
export const auth = {
  state,
  estaAutenticado,
  ehAdmin,
  empresa,
  privilegios,
  pode,
  rotaInicial,
  pronta,
  login,
  trocarEmpresa,
  aplicarSessao,
  logout,
  restaurarSessao,
};
