<template>
  <q-dialog ref="dialogRef" persistent @hide="onDialogHide">
    <q-card style="width: 620px; max-width: 95vw">
      <q-card-section class="row items-center q-pa-md">
        <div class="icon-badge q-mr-sm"><q-icon name="o_medical_services" color="primary" size="20px" /></div>
        <div class="text-h6">{{ item ? 'Serviço da ordem' : 'Adicionar serviço' }}</div>
        <q-space />
        <q-btn round flat dense icon="close" @click="onDialogCancel" />
      </q-card-section>
      <q-separator />

      <q-form greedy @submit="confirmar">
        <q-card-section class="q-pa-lg">
          <div class="row q-col-gutter-md">
            <div class="col-12">
              <q-select
                v-model="form.servico"
                dense
                outlined
                label="Serviço *"
                emit-value
                map-options
                use-input
                input-debounce="100"
                :readonly="somenteLeitura"
                :options="servicosFiltrados"
                lazy-rules
                :rules="[(val) => !!val || 'Selecione o serviço']"
                @filter="filtrarServicos"
                @update:model-value="aoEscolherServico"
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>{{ scope.opt.label }}</q-item-section>
                    <q-item-section side>{{ formatarMoeda(scope.opt.valor) }}</q-item-section>
                  </q-item>
                </template>
                <template #no-option>
                  <q-item><q-item-section class="text-grey-7">Nenhum serviço encontrado</q-item-section></q-item>
                </template>
              </q-select>
            </div>
            <div class="col-4">
              <q-input
                v-model.number="form.quantidade"
                dense
                outlined
                label="Quantidade *"
                type="number"
                min="1"
                :readonly="somenteLeitura"
                lazy-rules
                :rules="[(val) => (Number.isInteger(Number(val)) && Number(val) > 0) || 'Inválida']"
              />
            </div>
            <div class="col-4">
              <q-input
                v-model="form.valorUnitario"
                dense
                outlined
                stack-label
                label="Valor unitário *"
                prefix="R$"
                type="number"
                step="0.01"
                min="0"
                input-class="text-right"
                :readonly="somenteLeitura"
                lazy-rules
                :rules="[(val) => (val !== '' && val !== null && Number(val) >= 0) || 'Inválido']"
              />
            </div>
            <div class="col-4">
              <q-input dense outlined stack-label label="Total" :model-value="formatarMoeda(total)" readonly input-class="text-right" />
            </div>
            <div class="col-12">
              <q-select
                v-model="form.responsavel"
                dense
                outlined
                label="Responsável *"
                emit-value
                map-options
                use-input
                input-debounce="100"
                :readonly="somenteLeitura"
                :options="funcionariosFiltrados"
                hint="Pessoas cadastradas como funcionário"
                lazy-rules
                :rules="[(val) => !!val || 'Selecione o responsável']"
                @filter="filtrarFuncionarios"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey-7">Nenhum funcionário encontrado. Cadastre em Pessoas com o tipo Funcionário.</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            <div class="col-12">
              <q-input
                v-model="form.detalhamento"
                dense
                outlined
                type="textarea"
                autogrow
                label="Detalhamento"
                placeholder="Dentes, cor, material, instruções..."
                :readonly="somenteLeitura"
              />
            </div>
          </div>
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn outline color="grey-8" no-caps :label="somenteLeitura ? 'Fechar' : 'Cancelar'" class="q-px-md text-weight-bold" @click="onDialogCancel" />
          <q-btn v-if="!somenteLeitura" type="submit" color="primary" text-color="dark" unelevated no-caps label="OK" class="q-px-lg text-weight-bold" />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
// Item da OS (serviço + responsável + detalhamento). Só edita em memória —
// quem grava é o "Salvar" da ordem. Devolve o item com os nomes pra exibir.
import { computed, reactive, ref } from 'vue';
import { useDialogPluginComponent } from 'quasar';
import { formatarMoeda } from '../utils/moeda';

const props = defineProps({
  item: { type: Object, default: null },
  servicos: { type: Array, required: true }, // [{ id, descricao, valor }] ativos
  funcionarios: { type: Array, required: true }, // [{ id, nome }] ativos
  somenteLeitura: { type: Boolean, default: false },
});
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const form = reactive({
  servico: props.item?.servico || null,
  quantidade: props.item?.quantidade || 1,
  valorUnitario: props.item ? props.item.valorUnitario : '',
  responsavel: props.item?.responsavel || null,
  detalhamento: props.item?.detalhamento || '',
});

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Opções = ativos + o que já estava no item (mesmo que tenha sido inativado).
const opcoesServico = computed(() => {
  const lista = props.servicos.map((s) => ({ label: s.descricao, value: s.id, valor: s.valor }));
  if (props.item && !lista.some((o) => o.value === props.item.servico)) {
    lista.push({ label: `${props.item.descricao} (inativo)`, value: props.item.servico, valor: props.item.valorUnitario });
  }
  return lista;
});
const opcoesFuncionario = computed(() => {
  const lista = props.funcionarios.map((f) => ({ label: f.nome, value: f.id }));
  if (props.item && !lista.some((o) => o.value === props.item.responsavel)) {
    lista.push({ label: `${props.item.responsavelNome} (inativo)`, value: props.item.responsavel });
  }
  return lista;
});

const servicosFiltrados = ref(opcoesServico.value);
const funcionariosFiltrados = ref(opcoesFuncionario.value);

function filtrarServicos(val, update) {
  update(() => {
    const t = normalizar(val);
    servicosFiltrados.value = opcoesServico.value.filter((o) => normalizar(o.label).includes(t));
  });
}
function filtrarFuncionarios(val, update) {
  update(() => {
    const t = normalizar(val);
    funcionariosFiltrados.value = opcoesFuncionario.value.filter((o) => normalizar(o.label).includes(t));
  });
}

// Escolheu o serviço: traz o valor da tabela de serviços (pode alterar).
function aoEscolherServico(id) {
  const opcao = opcoesServico.value.find((o) => o.value === id);
  if (opcao) form.valorUnitario = opcao.valor;
}

const total = computed(() => Math.round(Number(form.valorUnitario || 0) * Number(form.quantidade || 0) * 100) / 100);

function confirmar() {
  const servico = opcoesServico.value.find((o) => o.value === form.servico);
  const responsavel = opcoesFuncionario.value.find((o) => o.value === form.responsavel);
  onDialogOK({
    servico: form.servico,
    descricao: servico.label.replace(/ \(inativo\)$/, ''),
    quantidade: Number(form.quantidade),
    valorUnitario: Math.round(Number(form.valorUnitario) * 100) / 100,
    valorTotal: total.value,
    responsavel: form.responsavel,
    responsavelNome: responsavel.label.replace(/ \(inativo\)$/, ''),
    detalhamento: form.detalhamento?.trim() || '',
  });
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
</style>
