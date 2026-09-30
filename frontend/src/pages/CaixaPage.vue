<template>
  <q-page class="q-pa-lg">
    <div class="row items-end justify-between q-mb-lg q-col-gutter-md">
      <div class="col-12 col-md">
        <div class="text-h5">Caixa</div>
        <div class="text-caption text-grey-7">Lançamentos à vista e recebimentos de {{ auth.empresa.value?.nome }}</div>
      </div>
      <!-- Atalhos de período -->
      <div class="col-12 col-md-auto">
        <q-btn-toggle
          v-model="atalho"
          no-caps
          unelevated
          dense
          rounded
          toggle-color="primary"
          toggle-text-color="dark"
          class="atalhos"
          :options="[
            { label: 'Hoje', value: 'hoje' },
            { label: 'Ontem', value: 'ontem' },
            { label: '7 dias', value: '7dias' },
            { label: 'Este mês', value: 'mes' },
          ]"
          @update:model-value="aplicarAtalho"
        />
      </div>
    </div>

    <div class="row q-col-gutter-md q-mb-md items-center">
      <div class="col-6 col-md-2">
        <q-input v-model="filtros.de" dense outlined stack-label type="date" label="De" @update:model-value="atalho = null" />
      </div>
      <div class="col-6 col-md-2">
        <q-input v-model="filtros.ate" dense outlined stack-label type="date" label="Até" @update:model-value="atalho = null" />
      </div>
      <div class="col-6 col-md-3">
        <q-select v-model="filtros.meio" dense outlined clearable emit-value map-options label="Meio de pagamento" :options="OPCOES_MEIO" />
      </div>
      <div class="col-6 col-md-3">
        <q-select v-model="filtros.origem" dense outlined clearable emit-value map-options label="Origem" :options="opcoesOrigem" />
      </div>
      <div class="col-12 col-md-2">
        <q-toggle v-model="filtros.cancelados" label="Mostrar cancelados" color="grey-7" />
      </div>
    </div>

    <!-- Totais do período -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <q-card flat bordered class="q-pa-md">
          <div class="text-caption text-grey-7">Entradas</div>
          <div class="text-h5 text-weight-bold text-positive">{{ formatarMoeda(totais.entradas) }}</div>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered class="q-pa-md">
          <div class="text-caption text-grey-7">Saídas</div>
          <div class="text-h5 text-weight-bold" :class="{ 'text-negative': totais.saidas > 0 }">{{ formatarMoeda(totais.saidas) }}</div>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered class="q-pa-md">
          <div class="text-caption text-grey-7">Saldo do período</div>
          <div class="text-h5 text-weight-bold">{{ formatarMoeda(totais.saldo) }}</div>
        </q-card>
      </div>
    </div>

    <div v-if="totais.porMeio.length" class="row q-gutter-sm q-mb-md">
      <q-chip v-for="m in totais.porMeio" :key="m.meio" outline color="grey-8" icon="o_payments">
        {{ nomeMeio(m.meio) }}: <b class="q-ml-xs">{{ formatarMoeda(m.valor) }}</b>
      </q-chip>
    </div>

    <q-table
      :rows="lancamentos"
      :columns="colunas"
      row-key="id"
      :loading="carregando"
      :pagination="{ sortBy: null, rowsPerPage: 50 }"
      :rows-per-page-options="[50, 100, 0]"
      flat
      no-data-label="Nenhum lançamento no período."
      class="shadow-2 rounded-borders"
    >
      <template #body="props">
        <q-tr :props="props" :class="{ cancelado: props.row.situacao === 'C' }">
          <q-td key="data" :props="props">{{ formatarDataHora(props.row.dataMovimento) }}</q-td>
          <q-td key="historico" :props="props">
            <div>{{ props.row.historico }}</div>
            <div class="text-caption text-grey-7">
              {{ props.row.origem === 'RECEBIMENTO' ? 'Recebimento de conta' : 'OS à vista' }}
              <template v-if="props.row.situacao === 'C'"> · cancelado</template>
            </div>
          </q-td>
          <q-td key="pessoa" :props="props">{{ props.row.pessoaNome || '—' }}</q-td>
          <q-td key="meio" :props="props">{{ nomeMeio(props.row.meioPagamento) }}</q-td>
          <q-td key="os" :props="props">
            <router-link v-if="props.row.ordemServico" :to="{ name: 'ordem-editar', params: { id: props.row.ordemServico } }" class="link">
              nº {{ props.row.ordemNumero }}
            </router-link>
          </q-td>
          <q-td key="entrada" :props="props" class="text-positive">{{ props.row.tipo === 'E' ? formatarMoeda(props.row.valor) : '' }}</q-td>
          <q-td key="saida" :props="props" class="text-negative">{{ props.row.tipo === 'S' ? formatarMoeda(props.row.valor) : '' }}</q-td>
          <q-td key="usuario" :props="props" class="text-grey-7">{{ props.row.usuario }}</q-td>
        </q-tr>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
// Caixa DA EMPRESA DA SESSÃO: entradas das OS concluídas à vista e dos
// recebimentos de contas a receber. Por enquanto só visualização (não há
// lançamento manual).
import { onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import { formatarDataHora, hoje, somarDias } from '../utils/data';
import { OPCOES_MEIO, nomeMeio } from '../utils/pagamento';

const $q = useQuasar();

const lancamentos = ref([]);
const totais = ref({ entradas: 0, saidas: 0, saldo: 0, porMeio: [] });
const carregando = ref(false);

const atalho = ref('hoje');
const filtros = reactive({ de: hoje(), ate: hoje(), meio: null, origem: null, cancelados: false });

const opcoesOrigem = [
  { label: 'OS à vista', value: 'OS' },
  { label: 'Recebimento de conta', value: 'RECEBIMENTO' },
];

function aplicarAtalho(valor) {
  const h = hoje();
  if (valor === 'hoje') Object.assign(filtros, { de: h, ate: h });
  else if (valor === 'ontem') Object.assign(filtros, { de: somarDias(h, -1), ate: somarDias(h, -1) });
  else if (valor === '7dias') Object.assign(filtros, { de: somarDias(h, -6), ate: h });
  else if (valor === 'mes') Object.assign(filtros, { de: `${h.slice(0, 8)}01`, ate: h });
}

const colunas = [
  { name: 'data', label: 'Data/hora', field: 'dataMovimento', align: 'left' },
  { name: 'historico', label: 'Histórico', field: 'historico', align: 'left' },
  { name: 'pessoa', label: 'Cliente', field: 'pessoaNome', align: 'left' },
  { name: 'meio', label: 'Meio', field: 'meioPagamento', align: 'left' },
  { name: 'os', label: 'OS', field: 'ordemNumero', align: 'left' },
  { name: 'entrada', label: 'Entrada', field: 'valor', align: 'right' },
  { name: 'saida', label: 'Saída', field: 'valor', align: 'right' },
  { name: 'usuario', label: 'Usuário', field: 'usuario', align: 'left' },
];

async function carregar() {
  if (!filtros.de || !filtros.ate) return;
  carregando.value = true;
  try {
    const params = { de: filtros.de, ate: filtros.ate };
    if (filtros.meio) params.meio = filtros.meio;
    if (filtros.origem) params.origem = filtros.origem;
    if (filtros.cancelados) params.cancelados = 'true';
    const { data } = await api.get('/financeiro/caixa', { params });
    lancamentos.value = data.itens;
    totais.value = data.totais;
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível carregar o caixa.' });
  } finally {
    carregando.value = false;
  }
}

watch(filtros, carregar, { deep: true });
onMounted(carregar);
</script>

<style scoped>
.atalhos {
  border: 1px solid var(--app-borda);
}
.cancelado td {
  text-decoration: line-through;
  color: var(--app-texto-apagado) !important;
}
.link {
  color: var(--app-verde-icone);
  font-weight: 600;
  text-decoration: none;
}
</style>
