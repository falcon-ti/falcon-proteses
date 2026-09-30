// Tema claro/escuro (pedido do usuário: "daria pra adicionar um modo
// dark no template?"). Decisões do usuário:
// - Só dois modos: "claro" (padrão) e "escuro" — o botão do cabeçalho
//   (App.vue) alterna entre eles. Não segue o tema do sistema (pedido do
//   usuário: "podemos deixar somente claro(default) e escuro").
// - A escolha fica salva só no navegador (localStorage), sem mexer no
//   banco — vale por computador/navegador.
//
// Quem pinta os componentes é o plugin Dark do Quasar (registrado em
// main.js): ele põe "body--dark"/"body--light" no <body>. As cores
// próprias do app são variáveis CSS (--app-*) definidas em css/app.css
// para os dois modos — em telas novas, usar essas variáveis em vez de
// cores fixas (#fff, rgba(0,0,0,…)).
import { ref } from 'vue';
import { Dark } from 'quasar';

const CHAVE_STORAGE = 'falcon_proteses_tema';
const MODOS = ['claro', 'escuro'];

function lerSalvo() {
  try {
    const valor = localStorage.getItem(CHAVE_STORAGE);
    return MODOS.includes(valor) ? valor : 'claro';
  } catch {
    return 'claro';
  }
}

const modo = ref(lerSalvo());

function aplicar() {
  Dark.set(modo.value === 'escuro');
}

function definir(novoModo) {
  if (!MODOS.includes(novoModo)) return;
  modo.value = novoModo;
  try {
    localStorage.setItem(CHAVE_STORAGE, novoModo);
  } catch {
    // Sem localStorage (janela privada etc.): o tema vale só nesta aba.
  }
  aplicar();
}

function alternar() {
  definir(modo.value === 'escuro' ? 'claro' : 'escuro');
}

export const tema = { modo, definir, alternar, aplicar };
