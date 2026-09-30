<template>
  <q-dialog ref="dialogRef" persistent @hide="onDialogHide">
    <q-card style="width: 640px; max-width: 95vw">
      <q-card-section class="row items-center q-pa-md">
        <div class="icon-badge q-mr-sm"><q-icon name="o_task_alt" color="primary" size="20px" /></div>
        <div>
          <div class="text-h6">Concluir OS nº {{ ordem.numero }}</div>
          <div class="text-caption text-grey-7">{{ ordem.clienteNome }}<template v-if="ordem.paciente"> · Paciente: {{ ordem.paciente }}</template></div>
        </div>
        <q-space />
        <q-btn round flat dense icon="close" @click="onDialogCancel" />
      </q-card-section>
      <q-separator />

      <q-form greedy @submit="concluir">
        <q-card-section class="q-pa-lg q-gutter-y-md">
          <div class="total-box row items-center justify-between">
            <div class="text-body2 text-grey-8">Total da ordem</div>
            <div class="text-h5 text-weight-bold">{{ formatarMoeda(ordem.valorTotal) }}</div>
          </div>

          <!-- Prova pendente: precisa confirmar antes de concluir. -->
          <q-banner v-if="provaPendente" rounded class="bg-orange-1 text-orange-10">
            <template #avatar><q-icon name="o_warning" color="orange-8" /></template>
            Esta ordem está marcada para <b>enviar para prova</b> antes de finalizar.
            <div class="q-mt-sm">
              <q-checkbox v-model="provaConfirmada" dense label="Confirmo que a prova foi realizada" color="orange-9" />
            </div>
          </q-banner>

          <div v-if="ordem.valorTotal <= 0" class="text-caption text-grey-7">
            Ordem sem valor: nenhum lançamento financeiro será gerado.
          </div>

          <template v-else>
            <div>
              <div class="text-subtitle2 q-mb-sm">Forma de pagamento</div>
              <div class="row q-col-gutter-md">
                <div v-for="op in FORMAS" :key="op.value" class="col-6">
                  <div class="forma-card q-pa-md cursor-pointer" :class="{ 'forma-card--ativa': forma === op.value }" @click="forma = op.value">
                    <div class="row items-center no-wrap">
                      <q-icon :name="op.icon" size="26px" class="q-mr-sm" :color="forma === op.value ? 'green-8' : 'grey-7'" />
                      <div>
                        <div class="text-weight-bold">{{ op.label }}</div>
                        <div class="text-caption text-grey-7">{{ op.descricao }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- À vista: entrada no caixa -->
            <div v-if="forma === 'V'">
              <q-select
                v-model="meio"
                dense
                outlined
                label="Meio de pagamento *"
                emit-value
                map-options
                :options="opcoesMeio"
                lazy-rules
                :rules="[(val) => !!val || 'Selecione o meio de pagamento']"
              />
            </div>

            <!-- A prazo: parcelas em contas a receber -->
            <div v-if="forma === 'P'">
              <div class="row q-col-gutter-md items-start">
                <div class="col-4">
                  <q-input v-model.number="qtdParcelas" dense outlined type="number" min="1" :max="MAX_PARCELAS" label="Parcelas" @update:model-value="gerarParcelas" />
                </div>
                <div class="col-5">
                  <q-input v-model="primeiroVencimento" dense outlined type="date" stack-label label="1º vencimento" @update:model-value="gerarParcelas" />
                </div>
                <div class="col-3">
                  <q-input v-model.number="intervalo" dense outlined type="number" min="1" label="Intervalo (dias)" @update:model-value="gerarParcelas" />
                </div>
              </div>
              <q-markup-table flat bordered dense class="q-mt-sm parcelas">
                <thead>
                  <tr>
                    <th class="text-left">Parcela</th>
                    <th class="text-left">Vencimento</th>
                    <th class="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in parcelas" :key="i">
                    <td>{{ i + 1 }}/{{ parcelas.length }}</td>
                    <td><q-input v-model="p.vencimento" dense borderless type="date" /></td>
                    <td>
                      <q-input v-model.number="p.valor" dense borderless type="number" step="0.01" min="0.01" prefix="R$" input-class="text-right" />
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
              <div class="row justify-end q-mt-xs text-caption" :class="diferenca === 0 ? 'text-grey-7' : 'text-negative text-weight-bold'">
                Soma das parcelas: {{ formatarMoeda(somaParcelas / 100) }}
                <span v-if="diferenca !== 0">&nbsp;(diferença de {{ formatarMoeda(diferenca / 100) }})</span>
              </div>
            </div>
          </template>
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
            icon="o_task_alt"
            label="Concluir ordem"
            class="q-px-md text-weight-bold"
            :loading="salvando"
            :disable="!podeConcluir"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
// Conclusão da OS com a forma de pagamento:
//   À vista -> gera entrada no caixa (backend: caixa_movimento)
//   A prazo -> gera as parcelas em contas a receber (conta_receber)
// A baixa das contas a receber fica para um módulo futuro.
import { computed, ref } from 'vue';
import { useDialogPluginComponent, useQuasar } from 'quasar';
import api from '../services/api';
import { formatarMoeda } from '../utils/moeda';
import { hoje, somarDias } from '../utils/data';

const MAX_PARCELAS = 60;
const FORMAS = [
  { value: 'V', label: 'À vista', descricao: 'Entrada no caixa', icon: 'o_payments' },
  { value: 'P', label: 'A prazo', descricao: 'Gera contas a receber', icon: 'o_event_repeat' },
];
const NOMES_MEIO = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  TRANSFERENCIA: 'Transferência',
  CHEQUE: 'Cheque',
};

const props = defineProps({
  ordem: { type: Object, required: true },
  meiosPagamento: { type: Array, default: () => ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TRANSFERENCIA', 'CHEQUE'] },
});
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const $q = useQuasar();
const salvando = ref(false);

const provaPendente = computed(() => props.ordem.enviarProva && !props.ordem.provaRealizada);
const provaConfirmada = ref(false);

const forma = ref('V');
const meio = ref('DINHEIRO');
const opcoesMeio = computed(() => props.meiosPagamento.map((m) => ({ value: m, label: NOMES_MEIO[m] || m })));

const totalCentavos = computed(() => Math.round(props.ordem.valorTotal * 100));

// --- Parcelas -----------------------------------------------------------
const qtdParcelas = ref(1);
const primeiroVencimento = ref(somarDias(hoje(), 30));
const intervalo = ref(30);
const parcelas = ref([]);

// Divide em partes iguais; a diferença de centavos vai para a última.
function gerarParcelas() {
  const n = Math.min(Math.max(parseInt(qtdParcelas.value, 10) || 1, 1), MAX_PARCELAS);
  const dias = Math.max(parseInt(intervalo.value, 10) || 30, 1);
  const base = Math.floor(totalCentavos.value / n);
  const inicio = primeiroVencimento.value || somarDias(hoje(), 30);
  parcelas.value = Array.from({ length: n }, (_, i) => ({
    vencimento: somarDias(inicio, i * dias),
    valor: (i === n - 1 ? totalCentavos.value - base * (n - 1) : base) / 100,
  }));
}
gerarParcelas();

const somaParcelas = computed(() => parcelas.value.reduce((t, p) => t + Math.round(Number(p.valor || 0) * 100), 0));
const diferenca = computed(() => totalCentavos.value - somaParcelas.value);

const podeConcluir = computed(() => {
  if (provaPendente.value && !provaConfirmada.value) return false;
  if (props.ordem.valorTotal <= 0) return true;
  if (forma.value === 'V') return !!meio.value;
  return (
    parcelas.value.length > 0 &&
    diferenca.value === 0 &&
    parcelas.value.every((p) => p.vencimento && Number(p.valor) > 0)
  );
});

async function concluir() {
  if (!podeConcluir.value) return;
  salvando.value = true;
  try {
    const payload = { provaRealizada: provaConfirmada.value };
    if (props.ordem.valorTotal > 0) {
      payload.formaPagamento = forma.value;
      if (forma.value === 'V') payload.meioPagamento = meio.value;
      else payload.parcelas = parcelas.value.map((p) => ({ vencimento: p.vencimento, valor: Number(p.valor) }));
    }
    const { data } = await api.post(`/ordens-servico/${props.ordem.id}/concluir`, payload);
    $q.notify({ type: 'positive', message: `OS nº ${data.numero} concluída.` });
    onDialogOK(data);
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível concluir a ordem.' });
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
.total-box {
  background: var(--app-superficie-suave);
  border-radius: 10px;
  padding: 12px 16px;
}
.forma-card {
  border: 1px solid var(--app-borda-forte);
  border-radius: 10px;
  transition: border-color 0.15s, background 0.15s;
}
.forma-card--ativa {
  border: 2px solid #7cb342;
  background: var(--app-verde-fundo);
}
.parcelas td {
  padding-top: 0;
  padding-bottom: 0;
}
</style>
