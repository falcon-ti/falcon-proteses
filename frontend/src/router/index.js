import { createRouter, createWebHistory } from 'vue-router';
import { auth } from '../stores/auth';
import LoginPage from '../pages/LoginPage.vue';
import InicioPage from '../pages/InicioPage.vue';
import SemAcessoPage from '../pages/SemAcessoPage.vue';
import EmpresasPage from '../pages/EmpresasPage.vue';
import EmpresaFormPage from '../pages/EmpresaFormPage.vue';
import UsuariosPage from '../pages/UsuariosPage.vue';
import UsuarioFormPage from '../pages/UsuarioFormPage.vue';
import PessoasPage from '../pages/PessoasPage.vue';
import PessoaFormPage from '../pages/PessoaFormPage.vue';
import ServicosPage from '../pages/ServicosPage.vue';
import ComissoesPage from '../pages/ComissoesPage.vue';
import OrdensServicoPage from '../pages/OrdensServicoPage.vue';
import OrdemServicoFormPage from '../pages/OrdemServicoFormPage.vue';
import OrdemServicoImpressaoPage from '../pages/OrdemServicoImpressaoPage.vue';
import CaixaPage from '../pages/CaixaPage.vue';
import ContasReceberPage from '../pages/ContasReceberPage.vue';

// Toda rota exige login, menos as com "meta.public". "meta.privilegio:
// [tela, acao]" exige o privilégio (catálogo em
// backend/src/config/privilegios.js): listagens e ":id" pedem "ver",
// "/nova"/"/novo" pedem "incluir". O backend confere o mesmo em cada
// endpoint.
//
// "meta.exigeEmpresa: true" — telas de LANÇAMENTO (por empresa) que só
// fazem sentido com uma empresa na sessão. Sem empresa, o usuário é
// mandado pro Painel, que explica o que fazer (escolher/cadastrar).
const routes = [
  { path: '/', redirect: '/inicio' },
  { path: '/login', name: 'login', component: LoginPage, meta: { public: true } },
  { path: '/sem-acesso', name: 'sem-acesso', component: SemAcessoPage },
  { path: '/inicio', name: 'inicio', component: InicioPage, meta: { privilegio: ['dashboard', 'ver'] } },

  // Lançamentos e cadastros POR EMPRESA (meta.exigeEmpresa).
  { path: '/ordens-servico', name: 'ordens-servico', component: OrdensServicoPage, meta: { privilegio: ['ordens-servico', 'ver'], exigeEmpresa: true } },
  { path: '/ordens-servico/nova', name: 'ordem-nova', component: OrdemServicoFormPage, meta: { privilegio: ['ordens-servico', 'incluir'], exigeEmpresa: true } },
  { path: '/ordens-servico/:id', name: 'ordem-editar', component: OrdemServicoFormPage, meta: { privilegio: ['ordens-servico', 'ver'], exigeEmpresa: true } },
  // Folha de impressão (fora do layout: meta.impressao, ver App.vue).
  { path: '/ordens-servico/:id/imprimir', name: 'ordem-imprimir', component: OrdemServicoImpressaoPage, meta: { privilegio: ['ordens-servico', 'ver'], exigeEmpresa: true, impressao: true } },
  { path: '/financeiro/caixa', name: 'caixa', component: CaixaPage, meta: { privilegio: ['caixa', 'ver'], exigeEmpresa: true } },
  { path: '/financeiro/contas-receber', name: 'contas-receber', component: ContasReceberPage, meta: { privilegio: ['contas-receber', 'ver'], exigeEmpresa: true } },

  { path: '/pessoas', name: 'pessoas', component: PessoasPage, meta: { privilegio: ['pessoas', 'ver'], exigeEmpresa: true } },
  { path: '/pessoas/nova', name: 'pessoa-nova', component: PessoaFormPage, meta: { privilegio: ['pessoas', 'incluir'], exigeEmpresa: true } },
  { path: '/pessoas/:id', name: 'pessoa-editar', component: PessoaFormPage, meta: { privilegio: ['pessoas', 'ver'], exigeEmpresa: true } },
  { path: '/servicos', name: 'servicos', component: ServicosPage, meta: { privilegio: ['servicos', 'ver'], exigeEmpresa: true } },
  { path: '/comissoes', name: 'comissoes', component: ComissoesPage, meta: { privilegio: ['comissoes', 'ver'], exigeEmpresa: true } },

  { path: '/empresas', name: 'empresas', component: EmpresasPage, meta: { privilegio: ['empresas', 'ver'] } },
  { path: '/empresas/nova', name: 'empresa-nova', component: EmpresaFormPage, meta: { privilegio: ['empresas', 'incluir'] } },
  { path: '/empresas/:id', name: 'empresa-editar', component: EmpresaFormPage, meta: { privilegio: ['empresas', 'ver'] } },

  { path: '/usuarios', name: 'usuarios', component: UsuariosPage, meta: { privilegio: ['usuarios', 'ver'] } },
  { path: '/usuarios/novo', name: 'usuario-novo', component: UsuarioFormPage, meta: { privilegio: ['usuarios', 'incluir'] } },
  { path: '/usuarios/:id', name: 'usuario-editar', component: UsuarioFormPage, meta: { privilegio: ['usuarios', 'ver'] } },

  { path: '/:caminho(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  // Espera a sessão salva ser conferida (ver "pronta" em stores/auth.js).
  await auth.pronta;

  if (to.meta.public) {
    if (to.name === 'login' && auth.estaAutenticado.value) {
      return { path: auth.rotaInicial.value };
    }
    return true;
  }

  if (!auth.estaAutenticado.value) {
    return { path: '/login' };
  }

  if (to.meta.privilegio) {
    const [tela, acao] = to.meta.privilegio;
    if (!auth.pode(tela, acao)) {
      const destino = auth.rotaInicial.value;
      return destino === to.path ? { path: '/sem-acesso' } : { path: destino };
    }
  }

  if (to.meta.exigeEmpresa && !auth.empresa.value && to.path !== '/inicio') {
    return { path: auth.pode('dashboard') ? '/inicio' : '/sem-acesso' };
  }

  return true;
});

export default router;
