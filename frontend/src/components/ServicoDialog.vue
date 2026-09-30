<template>
  <q-dialog ref="dialogRef" persistent @hide="onDialogHide">
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section class="row items-center q-pa-md">
        <div class="icon-badge q-mr-sm"><q-icon name="o_medical_services" color="primary" size="20px" /></div>
        <div class="text-h6">{{ servico ? (somenteLeitura ? `Serviço #${servico.id}` : `Editar serviço #${servico.id}`) : 'Novo serviço' }}</div>
        <q-space />
        <q-btn round flat dense icon="close" @click="onDialogCancel" />
      </q-card-section>
      <q-separator />

      <q-form greedy @submit="salvar">
        <q-card-section class="q-gutter-y-md q-pa-lg">
          <q-input
            v-model="form.descricao"
            label="Descrição *"
            dense
            outlined
            autofocus
            maxlength="150"
            :readonly="somenteLeitura"
            lazy-rules
            :rules="[(val) => (!!val && val.trim() !== '') || 'Informe a descrição']"
          />
          <q-input
            v-model="form.valor"
            label="Valor *"
            dense
            outlined
            prefix="R$"
            stack-label
            type="number"
            step="0.01"
            min="0"
            input-class="text-right"
            :readonly="somenteLeitura"
            lazy-rules
            :rules="[(val) => (val !== '' && val !== null && Number(val) >= 0) || 'Informe um valor (zero ou maior)']"
          />
          <q-toggle v-if="servico" v-model="form.ativo" :disable="somenteLeitura" label="Serviço ativo" color="primary" />
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn outline color="grey-8" no-caps :label="somenteLeitura ? 'Fechar' : 'Cancelar'" class="q-px-md text-weight-bold" @click="onDialogCancel" />
          <q-btn
            v-if="!somenteLeitura"
            type="submit"
            color="primary"
            text-color="dark"
            label="Salvar"
            unelevated
            no-caps
            class="q-px-md text-weight-bold"
            :loading="salvando"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
// Cadastro/edição de serviço em diálogo (só descrição + valor). Grava na
// empresa da sessão — o backend usa a empresa do token.
import { computed, reactive, ref } from 'vue';
import { useDialogPluginComponent, useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';

const props = defineProps({
  servico: { type: Object, default: null }, // null = novo
});
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const $q = useQuasar();
const salvando = ref(false);
const somenteLeitura = computed(() => !!props.servico && !auth.pode('servicos', 'editar'));

const form = reactive({
  descricao: props.servico?.descricao || '',
  valor: props.servico ? props.servico.valor : '',
  ativo: props.servico ? props.servico.ativo : true,
});

async function salvar() {
  salvando.value = true;
  try {
    const payload = { descricao: form.descricao, valor: Number(form.valor), ativo: form.ativo };
    const { data } = props.servico
      ? await api.put(`/servicos/${props.servico.id}`, payload)
      : await api.post('/servicos', payload);
    $q.notify({ type: 'positive', message: 'Serviço salvo com sucesso.' });
    onDialogOK(data);
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível salvar o serviço.' });
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
</style>
