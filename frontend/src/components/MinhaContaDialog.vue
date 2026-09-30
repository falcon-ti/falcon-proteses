<template>
  <q-dialog ref="dialogRef" persistent @hide="onDialogHide">
    <q-card class="minha-conta-dialog-card">
      <q-card-section class="row items-center q-pa-md">
        <div class="icon-badge q-mr-sm">
          <q-icon name="manage_accounts" color="primary" size="20px" />
        </div>
        <div>
          <div class="text-h6">Meu perfil</div>
          <div class="text-caption text-grey-7">{{ auth.state.usuario?.login }}</div>
        </div>
        <q-space />
        <q-btn round flat dense icon="close" @click="onDialogCancel" />
      </q-card-section>
      <q-separator />

      <q-form greedy @submit="salvar">
        <q-card-section class="minha-conta-dialog-body q-pa-lg">
          <q-card flat bordered class="q-pa-md q-mb-lg">
            <div class="q-gutter-y-md">
              <q-input
                v-model="form.nome"
                label="Nome *"
                dense
                outlined
                maxlength="120"
                lazy-rules
                :rules="[(val) => (!!val && val.trim() !== '') || 'Informe o nome']"
              />
              <q-input
                v-model="form.email"
                label="Email"
                dense
                outlined
                type="email"
                hint="Opcional"
                lazy-rules
                :rules="[(val) => !val || EMAIL_REGEX.test(val) || 'Informe um email válido']"
              />
            </div>
          </q-card>

          <!-- Troca de senha opcional: só exige os 3 campos se algum for
               preenchido. -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-lg">
              <div class="icon-badge q-mr-md">
                <q-icon name="lock" color="primary" size="20px" />
              </div>
              <div>
                <div class="text-subtitle1 text-weight-bold">Segurança</div>
                <div class="text-caption text-grey-7">Deixe em branco para não alterar a senha</div>
              </div>
            </div>
            <div class="q-gutter-y-md">
              <q-input
                v-model="form.senhaAtual"
                label="Senha atual"
                dense
                outlined
                :type="mostrarSenha ? 'text' : 'password'"
                autocomplete="current-password"
                lazy-rules
                :rules="[(val) => !querTrocarSenha || !!val || 'Informe sua senha atual']"
              >
                <template #append>
                  <q-icon
                    :name="mostrarSenha ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="mostrarSenha = !mostrarSenha"
                  />
                </template>
              </q-input>
              <q-input
                v-model="form.novaSenha"
                label="Nova senha"
                dense
                outlined
                :type="mostrarSenha ? 'text' : 'password'"
                autocomplete="new-password"
                lazy-rules
                :rules="[(val) => !querTrocarSenha || (!!val && val.length >= 6) || 'Mínimo de 6 caracteres']"
              />
              <q-input
                v-model="form.confirmarSenha"
                label="Confirmar nova senha"
                dense
                outlined
                :type="mostrarSenha ? 'text' : 'password'"
                autocomplete="new-password"
                lazy-rules
                :rules="[(val) => !querTrocarSenha || val === form.novaSenha || 'As senhas não conferem']"
              />
            </div>
          </q-card>
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn outline color="grey-8" no-caps label="Cancelar" class="q-px-md text-weight-bold" @click="onDialogCancel" />
          <q-btn
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
// "Meu perfil": o próprio usuário edita nome/email (PUT /auth/perfil, que
// devolve token novo) e troca a senha (PUT /auth/senha).
import { computed, reactive, ref } from 'vue';
import { useDialogPluginComponent, useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const $q = useQuasar();
const salvando = ref(false);
const mostrarSenha = ref(false);

const original = { nome: auth.state.usuario?.nome || '', email: auth.state.usuario?.email || '' };
const form = reactive({ ...original, senhaAtual: '', novaSenha: '', confirmarSenha: '' });

const querTrocarSenha = computed(() => !!form.senhaAtual || !!form.novaSenha || !!form.confirmarSenha);

async function salvar() {
  const perfilMudou = form.nome.trim() !== original.nome || (form.email || '').trim() !== original.email;
  if (!perfilMudou && !querTrocarSenha.value) {
    onDialogOK();
    return;
  }

  salvando.value = true;
  try {
    if (perfilMudou) {
      const { data } = await api.put('/auth/perfil', { nome: form.nome, email: form.email || null });
      auth.aplicarSessao(data);
    }
    if (querTrocarSenha.value) {
      await api.put('/auth/senha', { senhaAtual: form.senhaAtual, novaSenha: form.novaSenha });
    }
    $q.notify({ type: 'positive', message: 'Dados atualizados com sucesso.' });
    onDialogOK();
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível salvar.' });
  } finally {
    salvando.value = false;
  }
}
</script>

<style scoped>
.minha-conta-dialog-card {
  width: 500px;
  max-width: 95vw;
}
.minha-conta-dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
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
