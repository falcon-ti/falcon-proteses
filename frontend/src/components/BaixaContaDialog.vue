<template>
  <q-dialog ref="dialogRef" persistent @hide="onDialogHide">
    <q-card style="width: 520px; max-width: 95vw">
      <q-card-section class="row items-center q-pa-md">
        <div class="icon-badge q-mr-sm"><q-icon name="o_price_check" color="primary" size="20px" /></div>
        <div>
          <div class="text-h6">Dar baixa</div>
          <div class="text-caption text-grey-7">
            {{ conta.pessoaNome }} · parc. {{ conta.parcela }}/{{ conta.totalParcelas }}
            <template v-if="conta.ordemNumero"> · OS nº {{ conta.ordemNumero }}</template>
          </div>
        </div>
        <q-space />
        <q-btn round flat dense icon="close" @click="onDialogCancel" />
      </q-card-section>
      <q-separator />

      <q-form greedy @submit="baixar">
        <q-card-section class="q-pa-lg">
          <div class="resumo row q-mb-md">
            <div class="col">
              <div class="text-caption text-grey-7">Vencimento</div>
              <div class="text-body1" :class="{ 'text-negative text-weight-bold': vencida }">{{ formatarData(conta.vencimento) }}</div>
            </div>
            <div class="col text-right">
              <div class="text-caption text-grey-7">Valor da parcela</div>
              <div class="text-body1">{{ formatarMoeda(conta.valor) }}</div>
            </div>
            <div class="col text-right">
              <div class="text-caption text-grey-7">Saldo</div>
              <div class="text-body1 text-weight-bold">{{ formatarMoeda(conta.saldo) }}</div>
            </div>
          </div>

          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input
                v-model="form.dataPagamento"
                dense
                outlined
                stack-label
                type="date"
                label="Data do pagamento *"
                :max="hoje()"
                lazy-rules
                :rules="[(val) => !!val || 'Informe a data', (val) => val <= hoje() || 'Não pode ser futura']"
              />
            </div>
            <div class="col-6">
              <q-select
                v-model="form.meioPagamento"
                dense
                outlined
                label="Meio de pagamento *"
                emit-value
                map-options
                :options="OPCOES_MEIO"
                lazy-rules
                :rules="[(val) => !!val || 'Selecione']"
              />
            </div>
            <div class="col-4">
              <q-input
                v-model="form.valor"
                dense
                outlined
                stack-label
                type="number"
                step="0.01"
                min="0.01"
                :max="conta.saldo"
                prefix="R$"
                input-class="text-right"
                label="Valor a baixar *"
                hint="Menor que o saldo = baixa parcial"
                lazy-rules
                :rules="[
                  (val) => Number(val) > 0 || 'Informe o valor',
                  (val) => Math.round(Number(val) * 100) <= Math.round(conta.saldo * 100) || 'Maior que o saldo',
                ]"
              />
            </div>
            <div class="col-4">
              <q-input v-model="form.juros" dense outlined stack-label type="number" step="0.01" min="0" prefix="R$" input-class="text-right" label="Juros / multa" />
            </div>
            <div class="col-4">
              <q-input v-model="form.desconto" dense outlined stack-label type="number" step="0.01" min="0" prefix="R$" input-class="text-right" label="Desconto" />
            </div>
            <div class="col-12">
              <q-input v-model="form.observacao" dense outlined maxlength="200" label="Observação" />
            </div>
          </div>

          <div class="total-box row items-center justify-between q-mt-md">
            <div>
              <div class="text-body2 text-grey-8">Total recebido</div>
              <div class="text-caption text-grey-7">Entra no caixa</div>
            </div>
            <div class="text-h5 text-weight-bold" :class="{ 'text-negative': totalRecebido < 0 }">{{ formatarMoeda(totalRecebido) }}</div>
          </div>
          <div v-if="Number(form.valor) > 0 && Math.round(Number(form.valor) * 100) < Math.round(conta.saldo * 100)" class="text-caption text-orange-9 q-mt-xs">
            Baixa parcial: ficará um saldo de {{ formatarMoeda(conta.saldo - Number(form.valor)) }} em aberto.
          </div>
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn outline color="grey-8" no-caps label="Cancelar" class="q-px-md text-weight-bold" @click="onDialogCancel" />
          <q-btn
            type="submit"
            color="primary"
            text-color="dark"
            unelevated
            no-caps
            icon="o_price_check"
            label="Confirmar baixa"
            class="q-px-md text-weight-bold"
            :loading="salvando"
            :disable="totalRecebido < 0"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
// Baixa (recebimento) de uma parcela de contas a receber. Aceita baixa
// parcial, juros e desconto; o total recebido entra no caixa.
import { computed, reactive, ref } from 'vue';
import { useDialogPluginComponent, useQuasar } from 'quasar';
import api from '../services/api';
import { formatarMoeda } from '../utils/moeda';
import { formatarData, hoje } from '../utils/data';
import { OPCOES_MEIO } from '../utils/pagamento';

const props = defineProps({
  conta: { type: Object, required: true },
});
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const $q = useQuasar();
const salvando = ref(false);
const vencida = computed(() => props.conta.vencimento < hoje());

const form = reactive({
  dataPagamento: hoje(),
  meioPagamento: 'PIX',
  valor: props.conta.saldo,
  juros: 0,
  desconto: 0,
  observacao: '',
});

const totalRecebido = computed(
  () => Math.round((Number(form.valor || 0) + Number(form.juros || 0) - Number(form.desconto || 0)) * 100) / 100
);

async function baixar() {
  salvando.value = true;
  try {
    const { data } = await api.post(`/financeiro/contas-receber/${props.conta.id}/baixar`, {
      dataPagamento: form.dataPagamento,
      meioPagamento: form.meioPagamento,
      valor: Number(form.valor),
      juros: Number(form.juros || 0),
      desconto: Number(form.desconto || 0),
      observacao: form.observacao,
    });
    $q.notify({ type: 'positive', message: data.situacao === 'P' ? 'Parcela quitada.' : 'Baixa parcial registrada.' });
    onDialogOK(data);
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível dar baixa.' });
  } finally {
    salvando.value = false;
  }
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
.resumo,
.total-box {
  background: var(--app-superficie-suave);
  border-radius: 10px;
  padding: 12px 16px;
}
</style>
