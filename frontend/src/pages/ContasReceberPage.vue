<template>
  <q-page class="q-pa-lg">
    <div class="q-mb-lg">
      <div class="text-h5">Contas a Receber</div>
      <div class="text-caption text-grey-7">Parcelas de {{ auth.empresa.value?.nome }}</div>
    </div>

    <!-- Totais do filtro atual -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <q-card flat bordered class="q-pa-md">
          <div class="text-caption text-grey-7">Em aberto</div>
          <div class="text-h5 text-weight-bold">{{ formatarMoeda(totais.saldo) }}</div>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered class="q-pa-md">
          <div class="text-caption text-grey-7">Vencido</div>
          <div class="text-h5 text-weight-bold" :class="{ 'text-negative': totais.vencido > 0 }">{{ formatarMoeda(totais.vencido) }}</div>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered class="q-pa-md">
          <div class="text-caption text-grey-7">Já recebido (das parcelas filtradas)</div>
          <div class="text-h5 text-weight-bold text-positive">{{ formatarMoeda(totais.pago) }}</div>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mb-md items-center">
      <div class="col-12 col-md-4">
        <q-input v-model="filtros.busca" dense outlined clearable debounce="350" placeholder="Buscar por cliente, paciente ou nº da OS...">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-6 col-md-2">
        <q-select v-model="filtros.situacao" dense outlined emit-value map-options label="Situação" :options="opcoesSituacao" />
      </div>
      <div class="col-6 col-md-2">
        <q-input v-model="filtros.vencDe" dense outlined stack-label type="date" label="Vencimento de" clearable />
      </div>
      <div class="col-6 col-md-2">
        <q-input v-model="filtros.vencAte" dense outlined stack-label type="date" label="até" clearable />
      </div>
      <div class="col-6 col-md-2 row items-center no-wrap">
        <q-toggle v-model="filtros.vencidas" label="Só vencidas" color="negative" />
        <q-btn v-if="temFiltro" flat dense round color="grey-7" icon="filter_alt_off" @click="limparFiltros">
          <q-tooltip>Limpar filtros</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-banner v-if="limitado" dense rounded class="bg-blue-1 text-blue-9 q-mb-md">
      Mostrando as primeiras 1000 parcelas. Os totais acima consideram todas. Refine o filtro para ver as demais.
    </q-banner>

    <q-table
      :rows="contas"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: null, rowsPerPage: 30 }"
      :rows-per-page-options="[30, 50, 100, 0]"
      flat
      no-data-label="Nenhuma parcela encontrada."
      class="shadow-2 rounded-borders tabela-clicavel"
      @row-click="(_, row) => abrirDetalhe(row)"
    >
      <template #body-cell-vencimento="props">
        <q-td :props="props">
          <span :class="{ 'text-negative text-weight-bold': vencida(props.row) }">{{ formatarData(props.row.vencimento) }}</span>
          <q-icon v-if="vencida(props.row)" name="o_schedule" color="negative" class="q-ml-xs">
            <q-tooltip>Vencida há {{ diasAtraso(props.row) }} dia(s)</q-tooltip>
          </q-icon>
        </q-td>
      </template>

      <template #body-cell-origem="props">
        <q-td :props="props">
          <span v-if="props.row.ordemNumero">OS nº {{ props.row.ordemNumero }}</span>
          <span class="text-grey-7"> · parc. {{ props.row.parcela }}/{{ props.row.totalParcelas }}</span>
          <div v-if="props.row.paciente" class="text-caption text-grey-7">{{ props.row.paciente }}</div>
        </q-td>
      </template>

      <template #body-cell-situacao="props">
        <q-td :props="props">
          <span class="tag-chip" :style="{ background: corSituacao(props.row).fundo, color: corSituacao(props.row).texto }">
            <span class="tag-dot" :style="{ background: corSituacao(props.row).ponto }" />{{ corSituacao(props.row).label }}
          </span>
        </q-td>
      </template>

      <template #body-cell-acoes="props">
        <q-td :props="props">
          <q-btn
            v-if="props.row.situacao === 'A' && auth.pode('contas-receber', 'baixar')"
            dense
            unelevated
            no-caps
            color="primary"
            text-color="dark"
            size="sm"
            icon="o_price_check"
            label="Baixar"
            @click.stop="abrirBaixa(props.row)"
          />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
// Contas a receber DA EMPRESA DA SESSÃO. Clique na linha abre o detalhe
// (histórico de baixas / estorno); "Baixar" registra o recebimento.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import { formatarData, hoje } from '../utils/data';
import BaixaContaDialog from '../components/BaixaContaDialog.vue';
import ContaReceberDialog from '../components/ContaReceberDialog.vue';

const $q = useQuasar();

const SITUACOES = {
  A: { label: 'Em aberto', fundo: '#E3F2FD', texto: '#1565C0', ponto: '#1E88E5' },
  PARCIAL: { label: 'Parcial', fundo: '#FFF3E0', texto: '#E65100', ponto: '#FB8C00' },
  P: { label: 'Paga', fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' },
  C: { label: 'Cancelada', fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' },
};
const corSituacao = (row) => SITUACOES[row.situacao === 'A' && row.valorPago > 0 ? 'PARCIAL' : row.situacao];

const contas = ref([]);
const totais = ref({ valor: 0, pago: 0, saldo: 0, vencido: 0 });
const limitado = ref(false);
const carregando = ref(false);

const FILTROS_PADRAO = { busca: '', situacao: 'A', vencDe: '', vencAte: '', vencidas: false };
const filtros = reactive({ ...FILTROS_PADRAO });

const opcoesSituacao = [
  { label: 'Todas', value: null },
  { label: 'Em aberto', value: 'A' },
  { label: 'Pagas', value: 'P' },
  { label: 'Canceladas', value: 'C' },
];

const temFiltro = computed(() => Object.keys(FILTROS_PADRAO).some((k) => (filtros[k] || '') !== (FILTROS_PADRAO[k] || '')));

const vencida = (row) => row.situacao === 'A' && row.vencimento < hoje();
function diasAtraso(row) {
  const [a, m, d] = row.vencimento.split('-').map(Number);
  const [ha, hm, hd] = hoje().split('-').map(Number);
  return Math.round((new Date(ha, hm - 1, hd) - new Date(a, m - 1, d)) / 86400000);
}

const colunas = [
  { name: 'vencimento', label: 'Vencimento', field: 'vencimento', align: 'left', sortable: true },
  { name: 'cliente', label: 'Cliente', field: 'pessoaNome', align: 'left', sortable: true },
  { name: 'origem', label: 'Origem', field: 'ordemNumero', align: 'left' },
  { name: 'valor', label: 'Valor', field: 'valor', align: 'right', sortable: true, format: formatarMoeda },
  { name: 'pago', label: 'Recebido', field: 'valorPago', align: 'right', format: (v) => (v ? formatarMoeda(v) : '—') },
  { name: 'saldo', label: 'Saldo', field: 'saldo', align: 'right', sortable: true, format: formatarMoeda },
  { name: 'situacao', label: 'Situação', field: 'situacao', align: 'center' },
  { name: 'acoes', label: '', field: 'id', align: 'right' },
];

async function carregar() {
  carregando.value = true;
  try {
    const params = {};
    if (filtros.busca?.trim()) params.busca = filtros.busca.trim();
    if (filtros.situacao) params.situacao = filtros.situacao;
    if (filtros.vencDe) params.vencDe = filtros.vencDe;
    if (filtros.vencAte) params.vencAte = filtros.vencAte;
    if (filtros.vencidas) params.vencidas = 'true';
    const { data } = await api.get('/financeiro/contas-receber', { params });
    contas.value = data.itens;
    totais.value = data.totais;
    limitado.value = data.limitado;
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível carregar as contas.' });
  } finally {
    carregando.value = false;
  }
}

watch(filtros, carregar, { deep: true });

function limparFiltros() {
  Object.assign(filtros, FILTROS_PADRAO);
}

function abrirBaixa(conta) {
  $q.dialog({ component: BaixaContaDialog, componentProps: { conta } }).onOk(carregar);
}

async function abrirDetalhe(conta) {
  try {
    const { data } = await api.get(`/financeiro/contas-receber/${conta.id}`);
    $q.dialog({ component: ContaReceberDialog, componentProps: { conta: data } }).onOk(carregar);
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível abrir a parcela.' });
  }
}

onMounted(carregar);
</script>

<style scoped>
.tabela-clicavel :deep(tbody tr) {
  cursor: pointer;
}
</style>
