<template>
  <q-page class="flex flex-center login-page" style="min-height: 100vh">
    <q-card style="width: 380px; max-width: 92vw" class="q-pa-sm shadow-3">
      <q-card-section class="text-center">
        <img :src="logoFalcon" alt="Falcon Próteses" class="login-logo" />
        <div class="text-h6 q-mt-sm">Falcon Próteses</div>
        <div class="text-caption text-grey-7">Entre para continuar</div>
      </q-card-section>

      <q-form greedy @submit="entrar">
        <q-card-section class="q-gutter-md">
          <q-input
            v-model="usuario"
            label="Usuário"
            dense
            outlined
            autofocus
            autocomplete="username"
            lazy-rules
            :rules="[(val) => (!!val && val.trim() !== '') || 'Informe seu usuário']"
            @blur="buscarEmpresas"
          />
          <q-input
            v-model="senha"
            label="Senha"
            dense
            outlined
            autocomplete="current-password"
            :type="mostrarSenha ? 'text' : 'password'"
            lazy-rules
            :rules="[(val) => !!val || 'Informe sua senha']"
          >
            <template #append>
              <q-icon
                :name="mostrarSenha ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="mostrarSenha = !mostrarSenha"
              />
            </template>
          </q-input>
          <!-- Só aparece quando o usuário tem acesso a mais de uma empresa
               — com 0 ou 1 o backend resolve sozinho. -->
          <q-select
            v-if="opcoesEmpresas.length > 1"
            v-model="empresaSelecionada"
            label="Empresa *"
            dense
            outlined
            emit-value
            map-options
            :options="opcoesEmpresas"
            :loading="buscandoEmpresas"
            lazy-rules
            :rules="[(val) => !!val || 'Selecione a empresa']"
          />
        </q-card-section>

        <q-card-actions class="q-px-md q-pb-md">
          <q-btn
            type="submit"
            color="primary"
            text-color="dark"
            label="Entrar"
            unelevated
            no-caps
            class="full-width"
            :loading="entrando"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-page>
</template>

<script setup>
// Login: POST /api/auth/login { usuario, senha, empresa? }. "usuario" é o
// login (nome_usuario), não o email. Quando o usuário tem acesso a mais de
// uma empresa, o select "Empresa" aparece depois que o campo Usuário perde
// o foco (GET /auth/empresas, rota pública).
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import axios from 'axios';
import { auth } from '../stores/auth';
import logoFalcon from '../assets/logo-falcon.png';

const router = useRouter();
const $q = useQuasar();

const usuario = ref('');
const senha = ref('');
const mostrarSenha = ref(false);
const entrando = ref(false);

const opcoesEmpresas = ref([]);
const empresaSelecionada = ref(null);
const buscandoEmpresas = ref(false);

// Corrigiu o usuário depois de buscar: a lista antiga não vale mais.
watch(usuario, () => {
  opcoesEmpresas.value = [];
  empresaSelecionada.value = null;
});

async function buscarEmpresas() {
  if (!usuario.value?.trim()) return;
  buscandoEmpresas.value = true;
  try {
    const { data } = await axios.get('/api/auth/empresas', { params: { usuario: usuario.value.trim() } });
    opcoesEmpresas.value = data.map((e) => ({ label: e.nome, value: e.id }));
    empresaSelecionada.value = opcoesEmpresas.value.length === 1 ? opcoesEmpresas.value[0].value : null;
  } catch {
    // Silencioso: o backend confere tudo de novo no login.
    opcoesEmpresas.value = [];
  } finally {
    buscandoEmpresas.value = false;
  }
}

async function entrar() {
  entrando.value = true;
  try {
    await auth.login(usuario.value.trim(), senha.value, empresaSelecionada.value);
    router.push(auth.rotaInicial.value);
  } catch (err) {
    // Tem mais de uma empresa mas o blur ainda não tinha buscado a lista
    // (ex.: apertou Enter direto no campo senha): busca e pede a escolha.
    if (err.response?.status === 400 && !opcoesEmpresas.value.length) {
      await buscarEmpresas();
    }
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível entrar.' });
  } finally {
    entrando.value = false;
  }
}
</script>

<style scoped>
.login-logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
}
</style>
