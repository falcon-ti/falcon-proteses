<template>
  <q-layout view="lHh Lpr lFf">
    <!-- Na tela de login (meta.public) não há cabeçalho nem menu. -->
    <template v-if="mostrarLayout">
      <!-- Layout estilo "Mantis" herdado do falcon-web: cabeçalho claro com
           borda fina, marca no topo do menu lateral, módulos agrupados por
           área, ícones "outlined" e grupos recolhíveis. -->
      <q-header bordered class="text-grey-9 app-header">
        <q-toolbar class="app-toolbar">
          <q-btn
            v-if="mostrarDrawer"
            flat
            dense
            round
            color="grey-8"
            :icon="menuRecolhido ? 'format_indent_increase' : 'format_indent_decrease'"
            class="q-mr-sm app-toolbar-btn"
            @click="alternarMenu"
          >
            <q-tooltip>{{ menuRecolhido ? 'Expandir menu' : 'Recolher menu' }}</q-tooltip>
          </q-btn>
          <div v-if="!mostrarDrawer" class="row items-center no-wrap q-mr-md">
            <img :src="logoFalcon" alt="Falcon Próteses" class="brand-logo q-mr-sm" />
            <div class="brand-nome">Falcon Próteses</div>
          </div>

          <!-- EMPRESA DA SESSÃO — todo lançamento é gravado nela. Clique
               lista as empresas que o usuário acessa e troca sem sair do
               sistema (POST /auth/trocar-empresa, token novo). -->
          <q-btn flat no-caps dense class="app-empresa-btn q-ml-xs">
            <q-icon name="o_apartment" size="20px" :color="auth.empresa.value ? 'grey-8' : 'negative'" />
            <div class="q-ml-sm text-left ellipsis empresa-nome">
              {{ auth.empresa.value?.nome || 'Nenhuma empresa selecionada' }}
            </div>
            <q-icon name="expand_more" size="18px" class="q-ml-xs text-grey-7" />
            <q-menu anchor="bottom left" self="top left" @show="carregarEmpresas">
              <q-list style="min-width: 280px">
                <q-item-label header class="q-pb-xs">Trocar de empresa</q-item-label>
                <q-item v-if="carregandoEmpresas">
                  <q-item-section class="text-center"><q-spinner color="primary" size="22px" /></q-item-section>
                </q-item>
                <q-item v-else-if="!minhasEmpresas.length">
                  <q-item-section class="text-caption text-grey-7">
                    Você não está vinculado a nenhuma empresa ativa.
                  </q-item-section>
                </q-item>
                <template v-else>
                <q-item
                  v-for="e in minhasEmpresas"
                  :key="e.id"
                  v-close-popup
                  clickable
                  :active="e.id === auth.empresa.value?.id"
                  active-class="menu-item--ativo"
                  @click="trocarEmpresa(e)"
                >
                  <q-item-section avatar><q-icon name="o_apartment" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ e.nome }}</q-item-label>
                    <q-item-label caption>{{ formatarCnpjCpf(e.cnpjCpf) }}</q-item-label>
                  </q-item-section>
                  <q-item-section v-if="e.id === auth.empresa.value?.id" side>
                    <q-icon name="check" color="positive" />
                  </q-item-section>
                </q-item>
                </template>
              </q-list>
            </q-menu>
          </q-btn>

          <q-space />

          <q-btn
            flat
            dense
            round
            color="grey-8"
            :icon="tema.modo.value === 'escuro' ? 'o_light_mode' : 'o_dark_mode'"
            class="q-mr-sm app-toolbar-btn"
            @click="tema.alternar()"
          >
            <q-tooltip>{{ tema.modo.value === 'escuro' ? 'Tema claro' : 'Tema escuro' }}</q-tooltip>
          </q-btn>

          <q-btn flat no-caps dense class="app-user-btn">
            <q-avatar size="32px" class="avatar-usuario">{{ iniciaisUsuario }}</q-avatar>
            <div class="q-ml-sm gt-xs text-left">
              <div class="text-body2 text-weight-medium text-grey-9 ellipsis">{{ auth.state.usuario?.nome }}</div>
            </div>
            <q-icon name="expand_more" size="18px" class="q-ml-xs text-grey-7" />
            <q-menu anchor="bottom right" self="top right">
              <q-list style="min-width: 220px">
                <q-item>
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{ auth.state.usuario?.nome }}</q-item-label>
                    <q-item-label caption>
                      {{ auth.state.usuario?.login }} · {{ auth.ehAdmin.value ? 'Administrador' : 'Usuário' }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
                <q-separator />
                <q-item v-close-popup clickable @click="abrirPerfil">
                  <q-item-section avatar><q-icon name="o_manage_accounts" /></q-item-section>
                  <q-item-section>Meu perfil</q-item-section>
                </q-item>
                <q-separator />
                <q-item v-close-popup clickable @click="sair">
                  <q-item-section avatar><q-icon name="logout" /></q-item-section>
                  <q-item-section>Sair</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </q-toolbar>
      </q-header>

      <!-- Menu lateral — só aparece com mais de um destino liberado. -->
      <q-drawer
        v-if="mostrarDrawer"
        v-model="drawerAberto"
        show-if-above
        bordered
        :width="260"
        :mini="menuRecolhido"
        :mini-width="72"
        class="app-drawer"
      >
        <div class="column no-wrap full-height">
          <div class="drawer-brand row items-center no-wrap" :class="{ 'justify-center': menuRecolhido }">
            <img :src="logoFalcon" alt="Falcon Próteses" class="brand-logo" />
            <div v-if="!menuRecolhido" class="brand-nome q-ml-sm">Falcon Próteses</div>
          </div>

          <q-scroll-area
            class="col"
            :thumb-style="{ width: '4px', right: '2px', borderRadius: '4px', opacity: '0.35' }"
            :bar-style="{ width: '0' }"
            :horizontal-thumb-style="{ opacity: '0' }"
          >
            <q-list class="q-px-sm q-pb-md">
              <template v-for="secao in secoesMenu" :key="secao.titulo">
                <div class="menu-secao-titulo" :class="{ 'menu-secao-titulo--mini': menuRecolhido }">
                  <span v-if="!menuRecolhido">{{ secao.titulo }}</span>
                  <q-separator v-else />
                </div>

                <template v-for="item in secao.itens" :key="item.label">
                  <q-expansion-item
                    v-if="item.filhos && !menuRecolhido"
                    v-model="gruposAbertos[item.label]"
                    expand-icon="expand_more"
                    expand-icon-class="text-grey-7"
                    header-class="menu-item"
                    class="menu-grupo"
                  >
                    <template #header>
                      <q-item-section avatar class="menu-item-icone">
                        <q-icon :name="item.icon" size="20px" />
                      </q-item-section>
                      <q-item-section>{{ item.label }}</q-item-section>
                    </template>
                    <q-item
                      v-for="filho in item.filhos"
                      :key="filho.label"
                      clickable
                      :to="filho.to"
                      active-class="menu-item--ativo"
                      class="menu-item menu-item--filho"
                      @click="filho.acao && filho.acao()"
                    >
                      <q-item-section>{{ filho.label }}</q-item-section>
                    </q-item>
                  </q-expansion-item>
                  <template v-else>
                    <q-item
                      v-for="folha in item.filhos || [item]"
                      :key="folha.label"
                      clickable
                      :to="folha.to"
                      :exact="folha.exact"
                      active-class="menu-item--ativo"
                      class="menu-item"
                      @click="folha.acao && folha.acao()"
                    >
                      <q-item-section avatar class="menu-item-icone">
                        <q-icon :name="folha.icon" size="20px" />
                        <q-tooltip v-if="menuRecolhido" anchor="center right" self="center left">{{ folha.label }}</q-tooltip>
                      </q-item-section>
                      <q-item-section v-if="!menuRecolhido">{{ folha.label }}</q-item-section>
                    </q-item>
                  </template>
                </template>
              </template>
            </q-list>
          </q-scroll-area>

          <!-- Rodapé do menu: base/servidor do backend (GET /api/sistema/info). -->
          <div class="drawer-servidor row items-center no-wrap" :class="{ 'justify-center': menuRecolhido }">
            <div class="servidor-icone"><q-icon name="o_dns" size="18px" /></div>
            <div v-if="!menuRecolhido" class="q-ml-sm servidor-texto column no-wrap">
              <div class="servidor-banco ellipsis">{{ infoSistema.banco || '—' }}</div>
              <div class="servidor-host ellipsis">{{ infoSistema.servidor || '—' }}</div>
            </div>
            <q-tooltip anchor="center right" self="center left">
              Servidor {{ infoSistema.servidor || '—' }}:{{ infoSistema.porta || '—' }} · Base {{ infoSistema.banco || '—' }}
            </q-tooltip>
          </div>
        </div>
      </q-drawer>

      <q-footer v-if="!mostrarDrawer" bordered class="text-grey-7 app-footer">
        <q-toolbar class="q-py-xs justify-end" style="min-height: 28px">
          <q-icon name="dns" size="14px" class="q-mr-xs" />
          <div class="text-caption">
            {{ infoSistema.servidor || '—' }}:{{ infoSistema.porta || '—' }}:{{ infoSistema.banco || '—' }}
          </div>
        </q-toolbar>
      </q-footer>
    </template>

    <q-page-container>
      <!-- ":key" pela empresa da sessão: ao trocar de empresa, a tela atual
           é recriada e recarrega os dados já da empresa nova. -->
      <router-view :key="`${auth.empresa.value?.id ?? 0}`" />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { auth } from './stores/auth';
import { tema } from './stores/tema';
import { filtrarMenu } from './utils/menu';
import { formatarCnpjCpf } from './utils/documento';
import MinhaContaDialog from './components/MinhaContaDialog.vue';
import api from './services/api';
import logoFalcon from './assets/logo-falcon.png';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const drawerAberto = ref(true);
const menuRecolhido = ref(false);
const mostrarLayout = computed(() => !route.meta.public);

// Itens com "acao" (modais) — nenhum por enquanto.
const ACOES_MENU = {};

function resolverAcao(item) {
  const resolvido = { ...item, acao: item.acao ? ACOES_MENU[item.acao] : undefined };
  if (item.filhos) resolvido.filhos = item.filhos.map((f) => resolverAcao(f));
  return resolvido;
}

const secoesMenu = computed(() =>
  filtrarMenu(auth.pode).map((secao) => ({ ...secao, itens: secao.itens.map((item) => resolverAcao(item)) }))
);

const totalItensMenu = computed(() =>
  secoesMenu.value.reduce((total, s) => total + s.itens.reduce((t, i) => t + (i.filhos ? i.filhos.length : 1), 0), 0)
);
const mostrarDrawer = computed(() => totalItensMenu.value > 1);

// Grupos recolhíveis abrem sozinhos quando a rota atual é de um dos filhos.
const gruposAbertos = ref({});
watch(
  () => [route.path, secoesMenu.value],
  () => {
    for (const secao of secoesMenu.value) {
      for (const item of secao.itens) {
        if (item.filhos?.some((f) => f.to && route.path.startsWith(f.to))) {
          gruposAbertos.value[item.label] = true;
        }
      }
    }
  },
  { immediate: true }
);

function alternarMenu() {
  if ($q.screen.lt.md) drawerAberto.value = !drawerAberto.value;
  else menuRecolhido.value = !menuRecolhido.value;
}

// Iniciais do avatar: "Maria Silva" -> "MS"; "ADMIN" -> "A".
const iniciaisUsuario = computed(() => {
  const partes = (auth.state.usuario?.nome || '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!partes.length) return '?';
  return partes
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
});

// --- Empresa da sessão -------------------------------------------------
const minhasEmpresas = ref([]);
const carregandoEmpresas = ref(false);

async function carregarEmpresas() {
  carregandoEmpresas.value = true;
  try {
    const { data } = await api.get('/auth/minhas-empresas');
    minhasEmpresas.value = data;
  } catch (err) {
    console.error(err);
  } finally {
    carregandoEmpresas.value = false;
  }
}

async function trocarEmpresa(empresa) {
  if (empresa.id === auth.empresa.value?.id) return;
  try {
    await auth.trocarEmpresa(empresa.id);
    $q.notify({ type: 'positive', message: `Empresa alterada para ${empresa.nome}.` });
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível trocar de empresa.' });
  }
}

function abrirPerfil() {
  $q.dialog({ component: MinhaContaDialog });
}

function sair() {
  auth.logout();
  router.push('/login');
}

// Servidor/base do backend (rodapé do menu).
const infoSistema = ref({ servidor: null, porta: null, banco: null });
watch(
  () => auth.estaAutenticado.value,
  async (autenticado) => {
    if (!autenticado) return;
    try {
      const { data } = await api.get('/sistema/info');
      infoSistema.value = data;
    } catch (err) {
      console.error(err);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.app-header,
.app-footer {
  background: var(--app-superficie);
  border-color: var(--app-borda);
}
.app-header {
  border-bottom: 1px solid var(--app-borda);
}
.app-toolbar {
  min-height: 60px;
  padding: 0 16px;
}
.app-toolbar-btn {
  background: var(--app-superficie-suave);
  border-radius: 8px;
}
.app-user-btn,
.app-empresa-btn {
  border-radius: 10px;
  padding: 4px 8px;
}
.app-empresa-btn {
  background: var(--app-superficie-suave);
  max-width: 340px;
}
.empresa-nome {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--app-texto-2);
  max-width: 260px;
}
.avatar-usuario {
  background: rgba(174, 213, 129, 0.35);
  color: var(--app-verde-texto);
  font-size: 14px;
  font-weight: 700;
}
.brand-logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
  display: block;
}
.brand-nome {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--app-texto);
  white-space: nowrap;
}
.drawer-brand {
  height: 60px;
  padding: 0 20px;
  border-bottom: 1px solid var(--app-borda);
}
.menu-secao-titulo {
  height: 34px;
  padding: 14px 12px 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--app-texto-apagado);
}
.menu-secao-titulo--mini {
  padding: 16px 12px 0;
}
.drawer-servidor {
  border-top: 1px solid var(--app-borda);
  padding: 12px 16px;
  min-height: 60px;
}
.servidor-icone {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 9px;
  background: var(--app-superficie-suave);
  color: var(--app-texto-suave);
  display: flex;
  align-items: center;
  justify-content: center;
}
.servidor-texto {
  min-width: 0;
  line-height: 1.25;
}
.servidor-banco {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--app-texto-2);
}
.servidor-host {
  font-size: 0.7rem;
  color: var(--app-texto-apagado);
}
</style>

<style>
/* Itens do menu lateral (não-scoped: q-expansion-item renderiza o
   cabeçalho num componente filho). */
.app-drawer .menu-item {
  min-height: 42px;
  margin: 2px 0;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--app-texto-2);
  font-size: 0.9rem;
}
.app-drawer .menu-item .q-item__section--avatar,
.app-drawer .menu-item-icone {
  min-width: 34px;
  color: var(--app-texto-suave);
}
.app-drawer .menu-item:hover {
  background: var(--app-superficie-suave);
}
.menu-item--ativo,
.app-drawer .menu-item--ativo,
.app-drawer .menu-item--ativo:hover {
  background: rgba(174, 213, 129, 0.25);
  color: var(--app-verde-texto);
  font-weight: 600;
}
.app-drawer .menu-item--ativo .q-item__section--avatar,
.app-drawer .menu-item--ativo .q-icon {
  color: var(--app-verde-icone);
}
.app-drawer .menu-item--filho {
  padding-left: 52px;
  min-height: 38px;
  font-size: 0.86rem;
}
.app-drawer .menu-grupo .q-expansion-item__content {
  padding-bottom: 2px;
}
.app-drawer .q-scrollarea__content {
  width: 100%;
}
.app-drawer.q-drawer--mini .menu-item {
  justify-content: center;
  padding: 0;
  margin: 2px 4px;
}
.app-drawer.q-drawer--mini .menu-item .q-item__section--avatar {
  min-width: 0;
  padding-right: 0;
}
</style>
