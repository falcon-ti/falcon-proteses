<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-h5">Usuários</div>
        <div class="text-caption text-grey-7">Acesso ao sistema, empresas e privilégios</div>
      </div>
      <q-btn
        v-show="auth.pode('usuarios', 'incluir')"
        color="primary"
        text-color="dark"
        icon="add"
        label="Novo"
        unelevated
        no-caps
        class="q-px-md text-weight-bold"
        :to="{ name: 'usuario-novo' }"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-md items-start">
      <div class="col-12 col-sm-5">
        <q-input v-model="filtroTexto" dense outlined clearable debounce="200" placeholder="Buscar por login, nome ou email...">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-6 col-sm-3">
        <q-select v-model="filtroPapel" dense outlined emit-value map-options label="Perfil" :options="opcoesFiltroPapel" />
      </div>
      <div class="col-6 col-sm-3">
        <q-select v-model="filtroAtivo" dense outlined emit-value map-options label="Situação" :options="opcoesFiltroAtivo" />
      </div>
      <div class="col-12 col-sm-1 flex items-center">
        <q-btn
          v-if="filtroTexto || filtroPapel !== null || filtroAtivo !== true"
          flat
          dense
          round
          color="grey-7"
          icon="filter_alt_off"
          @click="limparFiltros"
        >
          <q-tooltip>Limpar filtros</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-table
      :rows="usuariosFiltrados"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: 'login', rowsPerPage: 10 }"
      flat
      no-data-label="Nenhum usuário encontrado."
      class="shadow-2 rounded-borders"
    >
      <template #body-cell-papel="props">
        <q-td :props="props">
          <span class="tag-chip" :style="{ background: corPapel(props.row.papel).fundo, color: corPapel(props.row.papel).texto }">
            <span class="tag-dot" :style="{ background: corPapel(props.row.papel).ponto }" />
            {{ props.row.papel === 'admin' ? 'Administrador' : 'Usuário' }}
          </span>
        </q-td>
      </template>

      <template #body-cell-empresas="props">
        <q-td :props="props">
          <span v-if="!props.row.empresas.length" class="text-grey-6">—</span>
          <span v-else>{{ nomesEmpresas(props.row.empresas) }}</span>
        </q-td>
      </template>

      <template #body-cell-ativo="props">
        <q-td :props="props">
          <span class="tag-chip" :style="{ background: corSituacao(props.row.ativo).fundo, color: corSituacao(props.row.ativo).texto }">
            <span class="tag-dot" :style="{ background: corSituacao(props.row.ativo).ponto }" />
            {{ props.row.ativo ? 'Ativo' : 'Inativo' }}
          </span>
        </q-td>
      </template>

      <template #body-cell-acoes="props">
        <q-td :props="props" class="q-gutter-x-xs">
          <q-btn
            dense
            flat
            round
            color="primary"
            text-color="dark"
            :icon="auth.pode('usuarios', 'editar') ? 'edit' : 'visibility'"
            :to="{ name: 'usuario-editar', params: { id: props.row.id } }"
          >
            <q-tooltip>{{ auth.pode('usuarios', 'editar') ? 'Editar' : 'Visualizar' }}</q-tooltip>
          </q-btn>
          <q-btn
            v-show="auth.pode('usuarios', 'inativar') && props.row.ativo && props.row.id !== auth.state.usuario?.id"
            dense
            flat
            round
            color="negative"
            icon="delete"
            @click="confirmarInativacao(props.row)"
          >
            <q-tooltip>Inativar</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';

const $q = useQuasar();

const usuarios = ref([]);
const empresasPorId = ref(new Map());
const filtroTexto = ref('');
const filtroPapel = ref(null);
const filtroAtivo = ref(true);
const carregando = ref(false);

const opcoesFiltroPapel = [
  { label: 'Todos', value: null },
  { label: 'Usuário', value: 'usuario' },
  { label: 'Administrador', value: 'admin' },
];
const opcoesFiltroAtivo = [
  { label: 'Todos', value: null },
  { label: 'Ativos', value: true },
  { label: 'Inativos', value: false },
];

const CINZA = { fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' };
const corPapel = (papel) => (papel === 'admin' ? { fundo: '#F3E5F5', texto: '#6A1B9A', ponto: '#8E24AA' } : CINZA);
const corSituacao = (ativo) => (ativo ? { fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' } : CINZA);

function nomesEmpresas(ids) {
  return ids.map((id) => empresasPorId.value.get(id) || `#${id}`).join(', ');
}

const colunas = [
  { name: 'id', label: '#', field: 'id', align: 'left', sortable: true },
  { name: 'login', label: 'Login', field: 'login', align: 'left', sortable: true },
  { name: 'nome', label: 'Nome', field: 'nome', align: 'left', sortable: true },
  { name: 'email', label: 'Email', field: 'email', align: 'left' },
  { name: 'empresas', label: 'Empresas', field: 'empresas', align: 'left' },
  { name: 'papel', label: 'Perfil', field: 'papel', align: 'center', sortable: true },
  { name: 'ativo', label: 'Situação', field: 'ativo', align: 'center', sortable: true },
  { name: 'acoes', label: 'Ações', field: 'acoes', align: 'center' },
];

const usuariosFiltrados = computed(() => {
  const termo = filtroTexto.value?.trim().toLowerCase();
  return usuarios.value.filter((u) => {
    if (filtroPapel.value !== null && u.papel !== filtroPapel.value) return false;
    if (filtroAtivo.value !== null && u.ativo !== filtroAtivo.value) return false;
    if (!termo) return true;
    return [u.login, u.nome, u.email].some((c) => c && c.toLowerCase().includes(termo)) || String(u.id) === termo;
  });
});

function limparFiltros() {
  filtroTexto.value = '';
  filtroPapel.value = null;
  filtroAtivo.value = true;
}

async function carregar() {
  carregando.value = true;
  try {
    const [respUsuarios, respEmpresas] = await Promise.all([api.get('/usuarios'), api.get('/empresas')]);
    usuarios.value = respUsuarios.data;
    empresasPorId.value = new Map(respEmpresas.data.map((e) => [e.id, e.nomeFantasia || e.razaoSocial]));
  } catch (err) {
    notificarErro('Não foi possível carregar os usuários.', err);
  } finally {
    carregando.value = false;
  }
}

function confirmarInativacao(usuario) {
  $q.dialog({
    title: 'Inativar usuário',
    message: `Deseja inativar "${usuario.login}"? Ele deixa de conseguir entrar no sistema.`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true },
    ok: { label: 'Inativar', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      await api.delete(`/usuarios/${usuario.id}`);
      await carregar();
      $q.notify({ type: 'positive', message: 'Usuário inativado.' });
    } catch (err) {
      notificarErro('Não foi possível inativar o usuário.', err);
    }
  });
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(carregar);
</script>
