<template>
  <q-dialog ref="dialogRef" @hide="aoFechar">
    <q-card style="width: 680px; max-width: 95vw">
      <q-card-section class="row items-center q-pa-md">
        <div class="icon-badge q-mr-sm"><q-icon name="o_request_quote" color="primary" size="20px" /></div>
        <div>
          <div class="text-h6">Parcela {{ conta.parcela }}/{{ conta.totalParcelas }}</div>
          <div class="text-caption text-grey-7">{{ conta.pessoaNome }}</div>
        </div>
        <q-space />
        <span class="tag-chip q-mr-sm" :style="{ background: cor.fundo, color: cor.texto }">
          <span class="tag-dot" :style="{ background: cor.ponto }" />{{ cor.label }}
        </span>
        <q-btn round flat dense icon="close" v-close-popup />
      </q-card-section>
      <q-separator />

      <q-card-section class="q-pa-lg">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-6 col-sm-3">
            <div class="text-caption text-grey-7">Emissão</div>
            <div>{{ formatarData(conta.dataEmissao) }}</div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="text-caption text-grey-7">Vencimento</div>
            <div :class="{ 'text-negative text-weight-bold': vencida }">{{ formatarData(conta.vencimento) }}</div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="text-caption text-grey-7">Valor</div>
            <div>{{ formatarMoeda(conta.valor) }}</div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="text-caption text-grey-7">Saldo</div>
            <div class="text-weight-bold">{{ formatarMoeda(conta.saldo) }}</div>
          </div>
          <div v-if="conta.ordemNumero" class="col-12">
            <div class="text-caption text-grey-7">Origem</div>
            <router-link :to="{ name: 'ordem-editar', params: { id: conta.ordemServico } }" class="link" @click="onDialogCancel">
              OS nº {{ conta.ordemNumero }}<template v-if="conta.paciente"> — {{ conta.paciente }}</template>
            </router-link>
          </div>
        </div>

        <div class="text-subtitle2 q-mb-sm">Baixas</div>
        <div v-if="!conta.baixas?.length" class="text-caption text-grey-7 q-pa-md vazio">Nenhum recebimento registrado.</div>
        <q-markup-table v-else flat bordered dense>
          <thead>
            <tr>
              <th class="text-left">Data</th>
              <th class="text-left">Meio</th>
              <th class="text-right">Baixado</th>
              <th class="text-right">Juros</th>
              <th class="text-right">Desc.</th>
              <th class="text-right">Recebido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in conta.baixas" :key="b.id" :class="{ estornada: b.situacao === 'C' }">
              <td>
                {{ formatarData(b.dataPagamento) }}
                <q-tooltip>
                  Lançado por {{ b.usuario }} em {{ formatarDataHora(b.dataLancamento) }}
                  <template v-if="b.observacao"><br />{{ b.observacao }}</template>
                  <template v-if="b.situacao === 'C'"><br />Estornado por {{ b.usuarioEstorno }}</template>
                </q-tooltip>
              </td>
              <td>{{ nomeMeio(b.meioPagamento) }}</td>
              <td class="text-right">{{ formatarMoeda(b.valor) }}</td>
              <td class="text-right">{{ b.juros ? formatarMoeda(b.juros) : '—' }}</td>
              <td class="text-right">{{ b.desconto ? formatarMoeda(b.desconto) : '—' }}</td>
              <td class="text-right text-weight-medium">{{ formatarMoeda(b.valorRecebido) }}</td>
              <td class="text-right" style="width: 90px">
                <span v-if="b.situacao === 'C'" class="text-caption text-grey-7">Estornada</span>
                <q-btn
                  v-else-if="auth.pode('contas-receber', 'estornar') && conta.situacao !== 'C'"
                  dense
                  flat
                  no-caps
                  size="sm"
                  color="negative"
                  label="Estornar"
                  @click="estornar(b)"
                />
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn outline color="grey-8" no-caps label="Fechar" class="q-px-md text-weight-bold" v-close-popup />
        <q-btn
          v-if="conta.situacao === 'A' && auth.pode('contas-receber', 'baixar')"
          unelevated
          color="primary"
          text-color="dark"
          no-caps
          icon="o_price_check"
          label="Dar baixa"
          class="q-px-md text-weight-bold"
          @click="abrirBaixa"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
// Detalhe da parcela: dados, histórico de baixas, estorno e botão de baixa.
// Ao fechar, avisa a lista se algo mudou (onDialogOK) pra ela recarregar.
import { computed, ref } from 'vue';
import { useDialogPluginComponent, useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import { formatarData, formatarDataHora, hoje } from '../utils/data';
import { nomeMeio } from '../utils/pagamento';
import BaixaContaDialog from './BaixaContaDialog.vue';

const props = defineProps({
  conta: { type: Object, required: true },
});
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const $q = useQuasar();
const conta = ref({ ...props.conta, baixas: props.conta.baixas || [] });
const alterou = ref(false);

const SITUACOES = {
  A: { label: 'Em aberto', fundo: '#E3F2FD', texto: '#1565C0', ponto: '#1E88E5' },
  PARCIAL: { label: 'Parcial', fundo: '#FFF3E0', texto: '#E65100', ponto: '#FB8C00' },
  P: { label: 'Paga', fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' },
  C: { label: 'Cancelada', fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' },
};
const cor = computed(() => SITUACOES[conta.value.situacao === 'A' && conta.value.valorPago > 0 ? 'PARCIAL' : conta.value.situacao]);
const vencida = computed(() => conta.value.situacao === 'A' && conta.value.vencimento < hoje());

async function recarregar() {
  const { data } = await api.get(`/financeiro/contas-receber/${conta.value.id}`);
  conta.value = data;
}

function abrirBaixa() {
  $q.dialog({ component: BaixaContaDialog, componentProps: { conta: conta.value } }).onOk((atualizada) => {
    conta.value = atualizada;
    alterou.value = true;
  });
}

function estornar(baixa) {
  $q.dialog({
    title: 'Estornar baixa',
    message: `Estornar o recebimento de ${formatarMoeda(baixa.valorRecebido)} em ${formatarData(baixa.dataPagamento)}? O lançamento no caixa também será cancelado.`,
    cancel: { label: 'Voltar', flat: true, noCaps: true },
    ok: { label: 'Estornar', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      const { data } = await api.post(`/financeiro/contas-receber/baixas/${baixa.id}/estornar`);
      conta.value = data;
      alterou.value = true;
      $q.notify({ type: 'positive', message: 'Baixa estornada.' });
    } catch (err) {
      $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível estornar.' });
      recarregar().catch(() => {});
    }
  });
}

function aoFechar() {
  if (alterou.value) onDialogOK(conta.value);
  onDialogHide();
}
</script>

<style scoped>
.icon-badge {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 8px;
  background: var(--app-verde-fundo);
  display: flex;
  align-items: center;
  justify-content: center;
}
.vazio {
  border: 1px dashed var(--app-borda-forte);
  border-radius: 8px;
}
.estornada td {
  text-decoration: line-through;
  color: var(--app-texto-apagado);
}
.estornada td:last-child {
  text-decoration: none;
}
.link {
  color: var(--app-verde-icone);
  font-weight: 600;
  text-decoration: none;
}
</style>
