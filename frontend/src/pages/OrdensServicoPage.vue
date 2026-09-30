<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-h5">Ordens de Serviço</div>
        <div class="text-caption text-grey-7">Trabalhos de {{ auth.empresa.value?.nome }}</div>
      </div>
      <q-btn
        v-show="auth.pode('ordens-servico', 'incluir')"
        color="primary"
        text-color="dark"
        icon="add"
        label="Nova OS"
        unelevated
        no-caps
        class="q-px-md text-weight-bold"
        :to="{ name: 'ordem-nova' }"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-md items-center">
      <div class="col-12 col-sm-5">
        <q-input v-model="filtroTexto" dense outlined clearable debounce="350" placeholder="Buscar por nº, paciente ou cliente...">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-6 col-sm-3">
        <q-select v-model="filtroSituacao" dense outlined emit-value map-options label="Situação" :options="opcoesSituacao" />
      </div>
      <div class="col-6 col-sm-3">
        <q-toggle v-model="somenteAtrasadas" label="Somente atrasadas" color="negative" />
      </div>
      <div class="col-12 col-sm-1">
        <q-btn v-if="temFiltro" flat dense round color="grey-7" icon="filter_alt_off" @click="limparFiltros">
          <q-tooltip>Limpar filtros</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-banner v-if="limitado" dense rounded class="bg-blue-1 text-blue-9 q-mb-md">
      Mostrando as 500 ordens mais recentes. Refine a busca para encontrar as demais.
    </q-banner>

    <q-table
      :rows="ordens"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: null, rowsPerPage: 15 }"
      :rows-per-page-options="[15, 30, 50, 0]"
      flat
      no-data-label="Nenhuma ordem encontrada."
      class="shadow-2 rounded-borders tabela-os"
      @row-click="(_, row) => abrir(row)"
    >
      <template #body-cell-numero="props">
        <q-td :props="props" class="text-weight-bold">{{ props.row.numero }}</q-td>
      </template>

      <template #body-cell-dataEntrega="props">
        <q-td :props="props">
          <span :class="{ 'text-negative text-weight-bold': atrasada(props.row) }">
            {{ formatarDataHora(props.row.dataEntrega) }}
          </span>
          <q-icon v-if="atrasada(props.row)" name="o_schedule" color="negative" class="q-ml-xs">
            <q-tooltip>Entrega atrasada</q-tooltip>
          </q-icon>
        </q-td>
      </template>

      <template #body-cell-prova="props">
        <q-td :props="props">
          <template v-if="props.row.enviarProva">
            <q-icon :name="props.row.provaRealizada ? 'o_check_circle' : 'o_pending'" :color="props.row.provaRealizada ? 'positive' : 'orange-8'" size="20px">
              <q-tooltip>{{ props.row.provaRealizada ? 'Prova realizada' : 'Aguardando prova' }}</q-tooltip>
            </q-icon>
          </template>
        </q-td>
      </template>

      <template #body-cell-situacao="props">
        <q-td :props="props">
          <span class="tag-chip" :style="{ background: SITUACOES[props.row.situacao].fundo, color: SITUACOES[props.row.situacao].texto }">
            <span class="tag-dot" :style="{ background: SITUACOES[props.row.situacao].ponto }" />
            {{ SITUACOES[props.row.situacao].label }}
          </span>
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
// Lista das OS DA EMPRESA DA SESSÃO (filtro no servidor). Clique na linha abre.
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import { formatarDataHora, jaPassou } from '../utils/data';

const $q = useQuasar();
const router = useRouter();

const SITUACOES = {
  A: { label: 'Aberta', fundo: '#E3F2FD', texto: '#1565C0', ponto: '#1E88E5' },
  C: { label: 'Concluída', fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' },
  X: { label: 'Cancelada', fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' },
};

const ordens = ref([]);
const limitado = ref(false);
const carregando = ref(false);
const filtroTexto = ref('');
const filtroSituacao = ref(null); // padrão: Todas
const somenteAtrasadas = ref(false);

const opcoesSituacao = [
  { label: 'Todas', value: null },
  { label: 'Abertas', value: 'A' },
  { label: 'Concluídas', value: 'C' },
  { label: 'Canceladas', value: 'X' },
];

const temFiltro = computed(() => !!filtroTexto.value || filtroSituacao.value !== null || somenteAtrasadas.value);

const atrasada = (row) => row.situacao === 'A' && jaPassou(row.dataEntrega);

const colunas = [
  { name: 'numero', label: 'Nº', field: 'numero', align: 'left', sortable: true },
  { name: 'dataEntrada', label: 'Entrada', field: 'dataEntrada', align: 'left', sortable: true, format: formatarDataHora },
  { name: 'dataEntrega', label: 'Entrega', field: 'dataEntrega', align: 'left', sortable: true },
  { name: 'cliente', label: 'Cliente', field: 'clienteNome', align: 'left', sortable: true },
  { name: 'paciente', label: 'Paciente', field: 'paciente', align: 'left', sortable: true },
  { name: 'prova', label: 'Prova', field: 'enviarProva', align: 'center' },
  { name: 'valorTotal', label: 'Valor', field: 'valorTotal', align: 'right', sortable: true, format: formatarMoeda },
  { name: 'situacao', label: 'Situação', field: 'situacao', align: 'center', sortable: true },
];

async function carregar() {
  carregando.value = true;
  try {
    const params = {};
    if (filtroTexto.value?.trim()) params.busca = filtroTexto.value.trim();
    if (filtroSituacao.value) params.situacao = filtroSituacao.value;
    if (somenteAtrasadas.value) params.atrasadas = 'true';
    const { data } = await api.get('/ordens-servico', { params });
    ordens.value = data.itens;
    limitado.value = data.limitado;
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível carregar as ordens.' });
  } finally {
    carregando.value = false;
  }
}

watch([filtroTexto, filtroSituacao, somenteAtrasadas], carregar);

function limparFiltros() {
  filtroTexto.value = '';
  filtroSituacao.value = null;
  somenteAtrasadas.value = false;
}

function abrir(ordem) {
  router.push({ name: 'ordem-editar', params: { id: ordem.id } });
}

onMounted(carregar);
</script>

<style scoped>
.tabela-os :deep(tbody tr) {
  cursor: pointer;
}
</style>
