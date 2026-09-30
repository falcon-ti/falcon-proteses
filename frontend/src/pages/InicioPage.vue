<template>
  <q-page class="q-pa-lg">
    <div class="q-mb-lg">
      <div class="text-h5">Olá, {{ primeiroNome }}</div>
      <div class="text-caption text-grey-7">Painel do laboratório</div>
    </div>

    <!-- Sem empresa na sessão: nada de lançamento funciona até escolher/
         cadastrar uma (as rotas "por empresa" do backend devolvem 409). -->
    <q-banner v-if="!auth.empresa.value" rounded class="bg-blue-1 text-blue-9 q-mb-lg">
      <template #avatar><q-icon name="o_info" color="primary" /></template>
      <template v-if="carregando">Carregando…</template>
      <template v-else-if="minhasEmpresas.length">
        Selecione a empresa com que vai trabalhar. Todos os lançamentos são gravados na empresa selecionada.
      </template>
      <template v-else-if="auth.pode('empresas', 'incluir')">
        Nenhuma empresa cadastrada para o seu usuário ainda. Cadastre a primeira empresa (laboratório) para começar —
        você fica vinculado a ela automaticamente.
      </template>
      <template v-else>
        Seu usuário ainda não está vinculado a nenhuma empresa. Peça a um administrador para fazer o vínculo em
        Usuários &gt; Empresas.
      </template>
      <template #action>
        <q-btn
          v-for="e in minhasEmpresas"
          :key="e.id"
          outline
          no-caps
          color="blue-9"
          :label="e.nome"
          icon="o_apartment"
          @click="selecionar(e)"
        />
        <q-btn
          v-if="!carregando && !minhasEmpresas.length && auth.pode('empresas', 'incluir')"
          unelevated
          no-caps
          color="primary"
          text-color="dark"
          icon="add"
          label="Cadastrar empresa"
          :to="{ name: 'empresa-nova' }"
        />
      </template>
    </q-banner>

    <div v-else class="row q-col-gutter-lg">
      <div class="col-12 col-md-6">
        <q-card flat bordered class="q-pa-md">
          <div class="row items-center no-wrap">
            <div class="icon-badge q-mr-md"><q-icon name="o_apartment" color="primary" size="22px" /></div>
            <div class="col">
              <div class="text-caption text-grey-7">Empresa em uso</div>
              <div class="text-subtitle1 text-weight-bold">{{ auth.empresa.value.nome }}</div>
              <div v-if="empresaAtual" class="text-caption text-grey-7">{{ formatarCnpjCpf(empresaAtual.cnpjCpf) }}</div>
            </div>
          </div>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card flat bordered class="q-pa-md">
          <div class="row items-center no-wrap">
            <div class="icon-badge q-mr-md"><q-icon name="o_construction" color="primary" size="22px" /></div>
            <div class="col">
              <div class="text-caption text-grey-7">Próximos módulos</div>
              <div class="text-body2">Clientes (dentistas/clínicas), serviços e ordens de serviço.</div>
            </div>
          </div>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarCnpjCpf } from '../utils/documento';

const $q = useQuasar();
const minhasEmpresas = ref([]);
const carregando = ref(true);

const primeiroNome = computed(() => (auth.state.usuario?.nome || '').split(' ')[0]);
const empresaAtual = computed(() => minhasEmpresas.value.find((e) => e.id === auth.empresa.value?.id));

async function selecionar(empresa) {
  try {
    await auth.trocarEmpresa(empresa.id);
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível selecionar a empresa.' });
  }
}

onMounted(async () => {
  try {
    const { data } = await api.get('/auth/minhas-empresas');
    minhasEmpresas.value = data;
  } catch (err) {
    console.error(err);
  } finally {
    carregando.value = false;
  }
});
</script>

<style scoped>
.icon-badge {
  width: 42px;
  height: 42px;
  min-width: 42px;
  border-radius: 10px;
  background: var(--app-verde-fundo);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
