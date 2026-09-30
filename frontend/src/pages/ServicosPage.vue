<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-h5">Serviços</div>
        <div class="text-caption text-grey-7">Serviços e valores de {{ auth.empresa.value?.nome }}</div>
      </div>
      <q-btn
        v-show="auth.pode('servicos', 'incluir')"
        color="primary"
        text-color="dark"
        icon="add"
        label="Novo"
        unelevated
        no-caps
        class="q-px-md text-weight-bold"
        @click="abrir(null)"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-md items-start">
      <div class="col-12 col-sm-6">
        <q-input v-model="filtroTexto" dense outlined clearable debounce="200" placeholder="Buscar por descrição ou código...">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-6 col-sm-3">
        <q-select v-model="filtroAtivo" dense outlined emit-value map-options label="Situação" :options="opcoesFiltroAtivo" />
      </div>
      <div class="col-12 col-sm-1 flex items-center">
        <q-btn v-if="filtroTexto || filtroAtivo !== true" flat dense round color="grey-7" icon="filter_alt_off" @click="limparFiltros">
          <q-tooltip>Limpar filtros</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-table
      :rows="servicosFiltrados"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: 'descricao', rowsPerPage: 15 }"
      :rows-per-page-options="[15, 30, 50, 0]"
      flat
      no-data-label="Nenhum serviço encontrado."
      class="shadow-2 rounded-borders"
      @row-dblclick="(_, row) => abrir(row)"
    >
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
          <q-btn dense flat round color="primary" text-color="dark" :icon="auth.pode('servicos', 'editar') ? 'edit' : 'visibility'" @click="abrir(props.row)">
            <q-tooltip>{{ auth.pode('servicos', 'editar') ? 'Editar' : 'Visualizar' }}</q-tooltip>
          </q-btn>
          <q-btn
            v-show="auth.pode('servicos', 'inativar') && props.row.ativo"
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
// Serviços DA EMPRESA DA SESSÃO. Lista pequena: carrega tudo e filtra em
// memória. Incluir/editar em diálogo (ServicoDialog.vue).
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import ServicoDialog from '../components/ServicoDialog.vue';

const $q = useQuasar();

const servicos = ref([]);
const carregando = ref(false);
const filtroTexto = ref('');
const filtroAtivo = ref(true);

const opcoesFiltroAtivo = [
  { label: 'Todos', value: null },
  { label: 'Ativos', value: true },
  { label: 'Inativos', value: false },
];

function corSituacao(ativo) {
  return ativo
    ? { fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' }
    : { fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' };
}

const colunas = [
  { name: 'id', label: 'Código', field: 'id', align: 'left', sortable: true, style: 'width: 90px' },
  { name: 'descricao', label: 'Descrição', field: 'descricao', align: 'left', sortable: true },
  { name: 'valor', label: 'Valor', field: 'valor', align: 'right', sortable: true, format: formatarMoeda },
  { name: 'ativo', label: 'Situação', field: 'ativo', align: 'center', sortable: true },
  { name: 'acoes', label: 'Ações', field: 'acoes', align: 'center' },
];

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const servicosFiltrados = computed(() => {
  const termo = normalizar(filtroTexto.value?.trim());
  return servicos.value.filter((s) => {
    if (filtroAtivo.value !== null && s.ativo !== filtroAtivo.value) return false;
    return !termo || normalizar(s.descricao).includes(termo) || String(s.id) === termo;
  });
});

function limparFiltros() {
  filtroTexto.value = '';
  filtroAtivo.value = true;
}

async function carregar() {
  carregando.value = true;
  try {
    const { data } = await api.get('/servicos');
    servicos.value = data;
  } catch (err) {
    notificarErro('Não foi possível carregar os serviços.', err);
  } finally {
    carregando.value = false;
  }
}

function abrir(servico) {
  if (!servico && !auth.pode('servicos', 'incluir')) return;
  $q.dialog({ component: ServicoDialog, componentProps: { servico } }).onOk(carregar);
}

function confirmarInativacao(servico) {
  $q.dialog({
    title: 'Inativar serviço',
    message: `Deseja inativar #${servico.id} - "${servico.descricao}"?`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true },
    ok: { label: 'Inativar', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      await api.delete(`/servicos/${servico.id}`);
      await carregar();
      $q.notify({ type: 'positive', message: 'Serviço inativado.' });
    } catch (err) {
      notificarErro('Não foi possível inativar o serviço.', err);
    }
  });
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(carregar);
</script>
