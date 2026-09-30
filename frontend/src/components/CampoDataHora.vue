<template>
  <!-- Data + hora ("DD/MM/AAAA HH:mm"), digitando ou pelo calendário/relógio.
       v-model no formato "YYYY-MM-DD HH:mm" (o backend aceita assim). -->
  <q-input
    v-model="texto"
    dense
    outlined
    :label="label"
    :readonly="readonly"
    mask="##/##/#### ##:##"
    placeholder="DD/MM/AAAA HH:mm"
    lazy-rules
    :rules="regras"
  >
    <template v-if="!readonly" #append>
      <q-icon name="event" class="cursor-pointer">
        <q-popup-proxy cover transition-show="scale" transition-hide="scale">
          <div class="row no-wrap">
            <q-date v-model="interno" mask="YYYY-MM-DD HH:mm" :locale="LOCALE" minimal />
            <q-time v-model="interno" mask="YYYY-MM-DD HH:mm" format24h />
          </div>
          <div class="row justify-end q-pa-sm">
            <q-btn v-close-popup flat no-caps color="primary" label="OK" />
          </div>
        </q-popup-proxy>
      </q-icon>
    </template>
  </q-input>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { formatarDataHora, lerDataHora } from '../utils/data';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  obrigatorio: { type: Boolean, default: false },
  rules: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

const LOCALE = {
  days: 'Domingo_Segunda_Terça_Quarta_Quinta_Sexta_Sábado'.split('_'),
  daysShort: 'Dom_Seg_Ter_Qua_Qui_Sex_Sáb'.split('_'),
  months: 'Janeiro_Fevereiro_Março_Abril_Maio_Junho_Julho_Agosto_Setembro_Outubro_Novembro_Dezembro'.split('_'),
  monthsShort: 'Jan_Fev_Mar_Abr_Mai_Jun_Jul_Ago_Set_Out_Nov_Dez'.split('_'),
};

const texto = ref(formatarDataHora(props.modelValue));

watch(
  () => props.modelValue,
  (valor) => {
    if (lerDataHora(texto.value) !== (valor || '').slice(0, 16)) texto.value = formatarDataHora(valor);
  }
);

watch(texto, (valor) => {
  const iso = lerDataHora(valor);
  if (iso) emit('update:modelValue', iso);
  else if (!valor) emit('update:modelValue', '');
});

// Calendário/relógio trabalham direto no formato ISO.
const interno = computed({
  get: () => (props.modelValue || '').slice(0, 16),
  set: (valor) => emit('update:modelValue', valor),
});

const regras = computed(() => [
  (val) => !props.obrigatorio || !!val || 'Campo obrigatório',
  (val) => !val || !!lerDataHora(val) || 'Data/hora inválida',
  ...props.rules,
]);
</script>
