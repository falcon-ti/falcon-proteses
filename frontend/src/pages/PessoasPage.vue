<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-h5">Pessoas</div>
        <div class="text-caption text-grey-7">Clientes, fornecedores e funcionários de {{ auth.empresa.value?.nome }}</div>
      </div>
      <q-btn
        v-show="auth.pode('pessoas', 'incluir')"
        color="primary"
        text-color="dark"
        icon="add"
        label="Nova"
        unelevated
        no-caps
        class="q-px-md text-weight-bold"
        :to="{ name: 'pessoa-nova', query: filtroTipo ? { tipo: filtroTipo } : {} }"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-md items-start">
      <div class="col-12 col-sm-5">
        <q-input
          v-model="filtroTexto"
          dense
          outlined
          clearable
          debounce="350"
          placeholder="Buscar por nome, CPF/CNPJ, código, cidade, registro..."
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-6 col-sm-3">
        <q-select v-model="filtroTipo" dense outlined emit-value map-options label="Tipo" :options="opcoesFiltroTipo" />
      </div>
      <div class="col-6 col-sm-3">
        <q-select v-model="filtroAtivo" dense outlined emit-value map-options label="Situação" :options="opcoesFiltroAtivo" />
      </div>
      <div class="col-12 col-sm-1 flex items-center">
        <q-btn v-if="temFiltro" flat dense round color="grey-7" icon="filter_alt_off" @click="limparFiltros">
          <q-tooltip>Limpar filtros</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-banner v-if="limitado" dense rounded class="bg-blue-1 text-blue-9 q-mb-md">
      Mostrando as primeiras 500 pessoas. Refine a busca para encontrar as demais.
    </q-banner>

    <q-table
      :rows="pessoas"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: 'nome', rowsPerPage: 15 }"
      :rows-per-page-options="[15, 30, 50, 0]"
      flat
      no-data-label="Nenhuma pessoa encontrada."
      class="shadow-2 rounded-borders"
    >
      <template #body-cell-nome="props">
        <q-td :props="props">
          <div class="text-weight-medium">{{ props.row.nome }}</div>
          <div v-if="props.row.cnpjCpf" class="text-caption text-grey-7">{{ formatarCnpjCpf(props.row.cnpjCpf) }}</div>
        </q-td>
      </template>

      <template #body-cell-tipos="props">
        <q-td :props="props">
          <div class="row no-wrap q-gutter-x-xs justify-center">
            <span
              v-for="t in props.row.tipos"
              :key="t"
              class="tag-chip"
              :style="{ background: TIPOS[t].fundo, color: TIPOS[t].texto }"
            >
              <span class="tag-dot" :style="{ background: TIPOS[t].ponto }" />{{ TIPOS[t].label }}
            </span>
          </div>
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
            :icon="auth.pode('pessoas', 'editar') ? 'edit' : 'visibility'"
            :to="{ name: 'pessoa-editar', params: { id: props.row.id } }"
          >
            <q-tooltip>{{ auth.pode('pessoas', 'editar') ? 'Editar' : 'Visualizar' }}</q-tooltip>
          </q-btn>
          <q-btn
            v-show="auth.pode('pessoas', 'inativar') && props.row.ativo"
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
// Lista de pessoas DA EMPRESA DA SESSÃO (o backend filtra por ela). A busca
// roda no servidor (a lista cresce com o tempo), com debounce.
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarCnpjCpf, formatarTelefone } from '../utils/documento';

const $q = useQuasar();

const TIPOS = {
  cliente: { label: 'Cliente', fundo: '#E3F2FD', texto: '#1565C0', ponto: '#1E88E5' },
  fornecedor: { label: 'Fornecedor', fundo: '#FFF3E0', texto: '#E65100', ponto: '#FB8C00' },
  funcionario: { label: 'Funcionário', fundo: '#F3E5F5', texto: '#6A1B9A', ponto: '#8E24AA' },
};

const pessoas = ref([]);
const limitado = ref(false);
const carregando = ref(false);
const filtroTexto = ref('');
const filtroTipo = ref(null);
const filtroAtivo = ref(true);

const opcoesFiltroTipo = [
  { label: 'Todos', value: null },
  { label: 'Clientes', value: 'cliente' },
  { label: 'Fornecedores', value: 'fornecedor' },
  { label: 'Funcionários', value: 'funcionario' },
];
const opcoesFiltroAtivo = [
  { label: 'Todas', value: null },
  { label: 'Ativas', value: true },
  { label: 'Inativas', value: false },
];

const temFiltro = computed(() => !!filtroTexto.value || filtroTipo.value !== null || filtroAtivo.value !== true);

function corSituacao(ativo) {
  return ativo
    ? { fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' }
    : { fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' };
}

const colunas = [
  { name: 'id', label: 'Código', field: 'id', align: 'left', sortable: true },
  { name: 'nome', label: 'Nome / Razão social', field: 'nome', align: 'left', sortable: true },
  { name: 'tipos', label: 'Tipo', field: 'tipos', align: 'center' },
  { name: 'registro', label: 'Nº registro', field: 'registroProfissional', align: 'left' },
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

async function carregar() {
  carregando.value = true;
  try {
    const params = {};
    if (filtroTexto.value?.trim()) params.busca = filtroTexto.value.trim();
    if (filtroTipo.value) params.tipo = filtroTipo.value;
    if (filtroAtivo.value !== null) params.ativo = String(filtroAtivo.value);
    const { data } = await api.get('/pessoas', { params });
    pessoas.value = data.itens;
    limitado.value = data.limitado;
  } catch (err) {
    notificarErro('Não foi possível carregar as pessoas.', err);
  } finally {
    carregando.value = false;
  }
}

watch([filtroTexto, filtroTipo, filtroAtivo], carregar);

function limparFiltros() {
  filtroTexto.value = '';
  filtroTipo.value = null;
  filtroAtivo.value = true;
}

function confirmarInativacao(pessoa) {
  $q.dialog({
    title: 'Inativar pessoa',
    message: `Deseja inativar #${pessoa.id} - "${pessoa.nome}"?`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true },
    ok: { label: 'Inativar', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      await api.delete(`/pessoas/${pessoa.id}`);
      await carregar();
      $q.notify({ type: 'positive', message: 'Pessoa inativada.' });
    } catch (err) {
      notificarErro('Não foi possível inativar a pessoa.', err);
    }
  });
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(carregar);
</script>
