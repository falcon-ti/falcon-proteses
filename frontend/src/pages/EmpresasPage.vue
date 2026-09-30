<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-h5">Empresas</div>
        <div class="text-caption text-grey-7">Laboratórios cadastrados no sistema</div>
      </div>
      <q-btn
        v-show="auth.pode('empresas', 'incluir')"
        color="primary"
        text-color="dark"
        icon="add"
        label="Nova"
        unelevated
        no-caps
        class="q-px-md text-weight-bold"
        :to="{ name: 'empresa-nova' }"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-md items-start">
      <div class="col-12 col-sm-6">
        <q-input v-model="filtroTexto" dense outlined clearable debounce="200" placeholder="Buscar por nome, CNPJ/CPF ou cidade...">
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
      :rows="empresasFiltradas"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: 'razaoSocial', rowsPerPage: 10 }"
      flat
      no-data-label="Nenhuma empresa encontrada."
      class="shadow-2 rounded-borders"
    >
      <template #body-cell-razaoSocial="props">
        <q-td :props="props">
          <div class="text-weight-medium">{{ props.row.razaoSocial }}</div>
          <div v-if="props.row.nomeFantasia" class="text-caption text-grey-7">{{ props.row.nomeFantasia }}</div>
        </q-td>
      </template>

      <template #body-cell-ativo="props">
        <q-td :props="props">
          <span class="tag-chip" :style="{ background: corSituacao(props.row.ativo).fundo, color: corSituacao(props.row.ativo).texto }">
            <span class="tag-dot" :style="{ background: corSituacao(props.row.ativo).ponto }" />
            {{ props.row.ativo ? 'Ativa' : 'Inativa' }}
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
            :icon="auth.pode('empresas', 'editar') ? 'edit' : 'visibility'"
            :to="{ name: 'empresa-editar', params: { id: props.row.id } }"
          >
            <q-tooltip>{{ auth.pode('empresas', 'editar') ? 'Editar' : 'Visualizar' }}</q-tooltip>
          </q-btn>
          <q-btn
            v-show="auth.pode('empresas', 'inativar') && props.row.ativo"
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
import { formatarCnpjCpf, formatarTelefone } from '../utils/documento';

const $q = useQuasar();

const empresas = ref([]);
const filtroTexto = ref('');
const filtroAtivo = ref(true);
const carregando = ref(false);

const opcoesFiltroAtivo = [
  { label: 'Todas', value: null },
  { label: 'Ativas', value: true },
  { label: 'Inativas', value: false },
];

function corSituacao(ativo) {
  return ativo
    ? { fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' }
    : { fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' };
}

const colunas = [
  { name: 'id', label: '#', field: 'id', align: 'left', sortable: true },
  { name: 'razaoSocial', label: 'Razão social / Nome', field: 'razaoSocial', align: 'left', sortable: true },
  { name: 'cnpjCpf', label: 'CNPJ / CPF', field: 'cnpjCpf', align: 'left', format: formatarCnpjCpf },
  {
    name: 'cidade',
    label: 'Cidade',
    field: (row) => (row.cidadeNome ? `${row.cidadeNome}/${row.uf}` : row.uf || ''),
    align: 'left',
    sortable: true,
  },
  { name: 'telefone', label: 'Telefone', field: (row) => row.celular || row.telefone, align: 'left', format: formatarTelefone },
  { name: 'ativo', label: 'Situação', field: 'ativo', align: 'center', sortable: true },
  { name: 'acoes', label: 'Ações', field: 'acoes', align: 'center' },
];

const empresasFiltradas = computed(() => {
  const termo = filtroTexto.value?.trim().toLowerCase();
  const termoDoc = termo ? termo.replace(/[^0-9a-z]/g, '') : '';
  return empresas.value.filter((e) => {
    if (filtroAtivo.value !== null && e.ativo !== filtroAtivo.value) return false;
    if (!termo) return true;
    return (
      [e.razaoSocial, e.nomeFantasia, e.cidadeNome].some((c) => c && c.toLowerCase().includes(termo)) ||
      (termoDoc && e.cnpjCpf.toLowerCase().includes(termoDoc)) ||
      String(e.id) === termo
    );
  });
});

function limparFiltros() {
  filtroTexto.value = '';
  filtroAtivo.value = true;
}

async function carregar() {
  carregando.value = true;
  try {
    const { data } = await api.get('/empresas');
    empresas.value = data;
  } catch (err) {
    notificarErro('Não foi possível carregar as empresas.', err);
  } finally {
    carregando.value = false;
  }
}

function confirmarInativacao(empresa) {
  $q.dialog({
    title: 'Inativar empresa',
    message: `Deseja inativar #${empresa.id} - "${empresa.razaoSocial}"? Os usuários deixam de poder selecioná-la.`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true },
    ok: { label: 'Inativar', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      await api.delete(`/empresas/${empresa.id}`);
      await carregar();
      $q.notify({ type: 'positive', message: 'Empresa inativada.' });
    } catch (err) {
      notificarErro('Não foi possível inativar a empresa.', err);
    }
  });
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(carregar);
</script>
