<template>
  <!-- Usuário logado sem nenhuma tela liberada na aba "Privilégios". -->
  <q-page class="flex flex-center q-pa-lg">
    <div class="text-center" style="max-width: 420px">
      <q-icon name="o_lock" size="56px" class="text-grey-6" />
      <div class="text-h6 q-mt-md">Sem acesso</div>
      <div class="text-body2 text-grey-7 q-mt-sm">
        Seu usuário não tem privilégio para nenhuma tela do sistema. Peça a um administrador que configure em
        Usuários &gt; Privilégios.
      </div>
      <q-btn flat no-caps color="primary" class="q-mt-md" label="Sair" @click="sair" />
    </div>
  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { auth } from '../stores/auth';

const router = useRouter();

function sair() {
  auth.logout();
  router.push('/login');
}
</script>
