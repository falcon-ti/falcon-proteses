<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <q-btn round outline color="grey-7" icon="arrow_back" :to="{ name: 'usuarios' }">
        <q-tooltip>Voltar</q-tooltip>
      </q-btn>
      <div class="text-right">
        <div class="text-h5">{{ modoEdicao ? `Usuário #${form.id}` : 'Novo usuário' }}</div>
        <div class="text-caption text-grey-7">
          {{ somenteLeitura ? 'Visualização' : modoEdicao ? 'Atualizar dados de acesso' : 'Cadastrar acesso ao sistema' }}
        </div>
      </div>
    </div>

    <div v-if="carregando" class="row justify-center q-pa-xl">
      <q-spinner color="primary" size="42px" />
    </div>

    <div v-else-if="modoEdicao && !encontrado" class="text-center q-pa-xl text-grey-7">
      Usuário não encontrado.
      <div class="q-mt-md"><q-btn flat no-caps color="primary" label="Voltar para a lista" :to="{ name: 'usuarios' }" /></div>
    </div>

    <q-form v-else ref="formRef" greedy @submit="salvar" @validation-error="abaAtiva = 'dados'">
      <q-tabs v-model="abaAtiva" dense align="left" active-color="grey-9" indicator-color="primary" no-caps class="q-mb-md">
        <q-tab name="dados" icon="o_badge" label="Dados" />
        <q-tab name="privilegios" icon="o_admin_panel_settings" :label="`Privilégios (${privilegios.size})`" />
      </q-tabs>

      <q-tab-panels v-model="abaAtiva" animated keep-alive class="bg-transparent">
        <q-tab-panel name="dados" class="q-pa-none">
          <div class="row q-col-gutter-lg">
            <div class="col-12 col-md-8 column q-gutter-y-md">
              <q-card flat bordered class="q-pa-md">
                <div class="row items-center q-mb-md">
                  <div class="icon-badge q-mr-sm"><q-icon name="badge" color="primary" size="20px" /></div>
                  <div class="text-subtitle1 text-weight-bold">Identificação</div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-5">
                    <q-input
                      v-model="form.login"
                      v-bind="campo"
                      label="Login *"
                      maxlength="30"
                      autocomplete="off"
                      hint="Usado para entrar no sistema"
                      lazy-rules
                      :rules="[
                        (val) => (!!val && val.trim() !== '') || 'Informe o login',
                        (val) => /^[A-Za-z0-9._-]+$/.test(val.trim()) || 'Só letras, números, ponto, hífen e sublinhado',
                      ]"
                      @update:model-value="(v) => (form.login = (v || '').toUpperCase())"
                    />
                  </div>
                  <div class="col-12 col-sm-7">
                    <q-input
                      v-model="form.nome"
                      v-bind="campo"
                      label="Nome completo *"
                      maxlength="120"
                      lazy-rules
                      :rules="[(val) => (!!val && val.trim() !== '') || 'Informe o nome']"
                    />
                  </div>
                  <div class="col-12 col-sm-7">
                    <q-input
                      v-model="form.email"
                      v-bind="campo"
                      label="Email"
                      type="email"
                      maxlength="150"
                      lazy-rules
                      :rules="[(val) => !val || EMAIL_REGEX.test(val) || 'Informe um email válido']"
                    />
                  </div>
                  <div class="col-12 col-sm-5">
                    <q-select v-model="form.papel" v-bind="campo" label="Perfil *" emit-value map-options :options="opcoesPapel" />
                  </div>
                </div>
              </q-card>

              <q-card v-if="!somenteLeitura" flat bordered class="q-pa-md">
                <div class="row items-center q-mb-md">
                  <div class="icon-badge q-mr-sm"><q-icon name="lock" color="primary" size="20px" /></div>
                  <div class="text-subtitle1 text-weight-bold">Segurança</div>
                </div>
                <q-input
                  v-model="form.senha"
                  dense
                  outlined
                  :label="modoEdicao ? 'Nova senha' : 'Senha *'"
                  :type="mostrarSenha ? 'text' : 'password'"
                  autocomplete="new-password"
                  lazy-rules
                  :rules="[validarSenha]"
                  :hint="modoEdicao ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 6 caracteres'"
                >
                  <template #append>
                    <q-icon :name="mostrarSenha ? 'visibility_off' : 'visibility'" class="cursor-pointer" @click="mostrarSenha = !mostrarSenha" />
                  </template>
                </q-input>
              </q-card>

              <!-- Empresas que o usuário acessa (usuario_empresa). No login ele
                   escolhe uma delas; os lançamentos são gravados nela. -->
              <q-card flat bordered class="q-pa-md">
                <div class="row items-center q-mb-sm">
                  <div class="icon-badge q-mr-sm"><q-icon name="o_apartment" color="primary" size="20px" /></div>
                  <div class="text-subtitle1 text-weight-bold">Empresas</div>
                </div>
                <div class="text-caption text-grey-7 q-mb-sm">Marque as empresas que este usuário pode acessar:</div>
                <div v-if="carregandoEmpresas" class="row justify-center q-pa-md"><q-spinner color="primary" size="28px" /></div>
                <div v-else-if="!opcoesEmpresas.length" class="text-caption text-grey-6 q-pa-sm">Nenhuma empresa cadastrada ainda.</div>
                <div v-else class="column q-gutter-y-sm">
                  <div v-for="opcao in opcoesEmpresas" :key="opcao.id" class="toggle-row row items-center justify-between q-pa-sm">
                    <div>
                      <div class="text-body2 text-weight-medium">
                        {{ opcao.nome }} <span v-if="!opcao.ativo" class="text-grey-6">(inativa)</span>
                      </div>
                      <div class="text-caption text-grey-7">{{ formatarCnpjCpf(opcao.cnpjCpf) }}</div>
                    </div>
                    <q-toggle
                      :model-value="form.empresas.includes(opcao.id)"
                      :disable="somenteLeitura"
                      color="primary"
                      @update:model-value="alternarEmpresa(opcao.id)"
                    />
                  </div>
                </div>
              </q-card>
            </div>

            <div class="col-12 col-md-4 column q-gutter-y-md">
              <q-card flat bordered class="q-pa-md">
                <div class="row items-center q-mb-md">
                  <div class="icon-badge q-mr-sm"><q-icon name="tune" color="primary" size="20px" /></div>
                  <div class="text-subtitle1 text-weight-bold">Situação</div>
                </div>
                <div class="toggle-row row items-center justify-between q-pa-sm">
                  <div>
                    <div class="text-body2 text-weight-medium">Usuário ativo</div>
                    <div class="text-caption text-grey-7">Pode entrar no sistema</div>
                  </div>
                  <q-toggle v-model="form.ativo" :disable="somenteLeitura || editandoProprioUsuario" color="primary" />
                </div>
                <div class="text-caption text-grey-7 q-mt-md">
                  O acesso a cada tela é definido na aba <b>Privilégios</b>. O perfil Administrador garante sempre os
                  cadastros de Usuários e Empresas.
                </div>
              </q-card>
            </div>
          </div>
        </q-tab-panel>

        <!-- Matriz de privilégios: uma linha por tela, colunas Ver/Incluir/
             Editar/Inativar + ações especiais. Marcar qualquer ação marca
             "Ver"; desmarcar "Ver" limpa a linha. -->
        <q-tab-panel name="privilegios" class="q-pa-none">
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-col-gutter-sm q-mb-md">
              <div class="col-12 col-md">
                <div class="text-subtitle1 text-weight-bold">Privilégios por tela</div>
                <div class="text-caption text-grey-7">Define quais menus este usuário vê e o que pode fazer em cada um.</div>
              </div>
              <template v-if="!somenteLeitura">
                <div class="col-12 col-sm-6 col-md-3">
                  <q-select
                    v-model="copiarDe"
                    label="Copiar de outro usuário"
                    dense
                    outlined
                    clearable
                    emit-value
                    map-options
                    :options="opcoesCopiarDe"
                    :loading="copiando"
                    @update:model-value="copiarPrivilegios"
                  />
                </div>
                <div class="col-auto">
                  <q-btn flat no-caps color="grey-8" icon="o_done_all" label="Marcar tudo" @click="marcarTodos(true)" />
                  <q-btn flat no-caps color="grey-8" icon="o_remove_done" label="Desmarcar tudo" @click="marcarTodos(false)" />
                </div>
              </template>
            </div>

            <div v-if="carregandoCatalogo" class="row justify-center q-pa-lg"><q-spinner color="primary" size="32px" /></div>
            <template v-else>
              <div v-if="form.papel === 'admin'" class="text-caption text-grey-7 q-mb-sm">
                <q-icon name="o_info" class="q-mr-xs" />Perfil Administrador: sempre tem acesso completo a Usuários e
                Empresas, mesmo sem marcar abaixo.
              </div>
              <div v-if="editandoProprioUsuario" class="text-caption text-grey-7 q-mb-sm">
                <q-icon name="o_info" class="q-mr-xs" />Você está editando o seu próprio usuário: "Usuários &gt;
                Ver/Editar" são mantidos para você não perder o acesso.
              </div>
              <div class="privilegios-scroll">
                <table class="privilegios-tabela">
                  <thead>
                    <tr>
                      <th class="text-left">Tela</th>
                      <th v-for="acao in catalogo.acoes" :key="acao.chave">{{ acao.label }}</th>
                      <th class="text-left">Ações especiais</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="secao in catalogo.secoes" :key="secao.titulo">
                      <tr class="privilegios-secao">
                        <td :colspan="catalogo.acoes.length + 2">
                          <q-checkbox
                            dense
                            :disable="somenteLeitura"
                            :model-value="estadoSecao(secao)"
                            toggle-indeterminate
                            :label="secao.titulo"
                            @update:model-value="(v) => marcarSecao(secao, v !== false)"
                          />
                        </td>
                      </tr>
                      <tr v-for="tela in secao.telas" :key="tela.chave">
                        <td class="privilegios-tela">{{ tela.label }}</td>
                        <td v-for="acao in catalogo.acoes" :key="acao.chave" class="text-center">
                          <q-checkbox
                            v-if="tela.acoes.includes(acao.chave)"
                            dense
                            :disable="somenteLeitura"
                            :model-value="temPrivilegio(tela.chave, acao.chave)"
                            @update:model-value="(v) => alternarPrivilegio(tela.chave, acao.chave, v)"
                          />
                          <span v-else class="text-grey-5">—</span>
                        </td>
                        <td>
                          <div class="column q-gutter-y-xs">
                            <q-checkbox
                              v-for="especial in tela.especiais || []"
                              :key="especial.chave"
                              dense
                              :disable="somenteLeitura"
                              :label="especial.label"
                              :model-value="temPrivilegio(tela.chave, especial.chave)"
                              @update:model-value="(v) => alternarPrivilegio(tela.chave, especial.chave, v)"
                            />
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </template>
          </q-card>
        </q-tab-panel>
      </q-tab-panels>

      <div class="row justify-end q-gutter-sm q-mt-lg q-pt-md footer-actions">
        <q-btn outline color="grey-8" no-caps :label="somenteLeitura ? 'Voltar' : 'Cancelar'" class="q-px-md text-weight-bold" :to="{ name: 'usuarios' }" />
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
      </div>
    </q-form>
  </q-page>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarCnpjCpf } from '../utils/documento';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const opcoesPapel = [
  { label: 'Usuário', value: 'usuario' },
  { label: 'Administrador', value: 'admin' },
];

const modoEdicao = computed(() => !!route.params.id);
const somenteLeitura = computed(() => modoEdicao.value && !auth.pode('usuarios', 'editar'));
const editandoProprioUsuario = computed(() => modoEdicao.value && Number(route.params.id) === Number(auth.state.usuario?.id));
const carregando = ref(modoEdicao.value);
const encontrado = ref(true);
const salvando = ref(false);
const mostrarSenha = ref(false);
const formRef = ref(null);
const abaAtiva = ref('dados');

const campo = computed(() => ({ dense: true, outlined: true, readonly: somenteLeitura.value }));

const form = reactive({
  id: null,
  login: '',
  nome: '',
  email: '',
  senha: '',
  papel: 'usuario',
  ativo: true,
  empresas: [],
});

function validarSenha(val) {
  if (!modoEdicao.value) return (!!val && val.length >= 6) || 'A senha deve ter pelo menos 6 caracteres';
  return !val || val.length >= 6 || 'A senha deve ter pelo menos 6 caracteres';
}

// --- Empresas -----------------------------------------------------------
const opcoesEmpresas = ref([]);
const carregandoEmpresas = ref(false);

async function carregarEmpresas() {
  carregandoEmpresas.value = true;
  try {
    const { data } = await api.get('/empresas');
    opcoesEmpresas.value = data.map((e) => ({
      id: e.id,
      nome: e.nomeFantasia || e.razaoSocial,
      cnpjCpf: e.cnpjCpf,
      ativo: e.ativo,
    }));
  } catch (err) {
    notificarErro('Não foi possível carregar as empresas.', err);
  } finally {
    carregandoEmpresas.value = false;
  }
}

function alternarEmpresa(id) {
  const i = form.empresas.indexOf(id);
  if (i === -1) form.empresas.push(id);
  else form.empresas.splice(i, 1);
}

// --- Privilégios --------------------------------------------------------
const catalogo = ref({ acoes: [], secoes: [] });
const carregandoCatalogo = ref(false);
const privilegios = ref(new Set());

function temPrivilegio(tela, acao) {
  return privilegios.value.has(`${tela}.${acao}`);
}

function acoesDaTela(tela) {
  return [...tela.acoes, ...(tela.especiais || []).map((e) => e.chave)];
}

function alternarPrivilegio(tela, acao, marcado) {
  const novo = new Set(privilegios.value);
  if (marcado) {
    novo.add(`${tela}.${acao}`);
    if (acao !== 'ver') novo.add(`${tela}.ver`);
  } else if (acao === 'ver') {
    for (const chave of [...novo]) if (chave.startsWith(`${tela}.`)) novo.delete(chave);
  } else {
    novo.delete(`${tela}.${acao}`);
  }
  privilegios.value = novo;
}

function estadoSecao(secao) {
  let total = 0;
  let marcados = 0;
  for (const tela of secao.telas) {
    for (const acao of acoesDaTela(tela)) {
      total += 1;
      if (temPrivilegio(tela.chave, acao)) marcados += 1;
    }
  }
  if (!marcados) return false;
  return marcados === total ? true : null;
}

function marcarSecao(secao, marcar) {
  const novo = new Set(privilegios.value);
  for (const tela of secao.telas) {
    for (const acao of acoesDaTela(tela)) {
      if (marcar) novo.add(`${tela.chave}.${acao}`);
      else novo.delete(`${tela.chave}.${acao}`);
    }
  }
  privilegios.value = novo;
}

function marcarTodos(marcar) {
  for (const secao of catalogo.value.secoes) marcarSecao(secao, marcar);
}

async function carregarCatalogo() {
  carregandoCatalogo.value = true;
  try {
    const { data } = await api.get('/usuarios/privilegios/catalogo');
    catalogo.value = data;
  } catch (err) {
    notificarErro('Não foi possível carregar o catálogo de privilégios.', err);
  } finally {
    carregandoCatalogo.value = false;
  }
}

// "Copiar de outro usuário" (ainda precisa Salvar).
const copiarDe = ref(null);
const copiando = ref(false);
const outrosUsuarios = ref([]);
const opcoesCopiarDe = computed(() =>
  outrosUsuarios.value
    .filter((u) => String(u.id) !== String(route.params.id || ''))
    .map((u) => ({ label: u.ativo ? u.login : `${u.login} (inativo)`, value: u.id }))
);

async function carregarOutrosUsuarios() {
  try {
    const { data } = await api.get('/usuarios');
    outrosUsuarios.value = data;
  } catch (err) {
    console.error(err);
  }
}

async function copiarPrivilegios(id) {
  if (!id) return;
  copiando.value = true;
  try {
    const { data } = await api.get(`/usuarios/${id}/privilegios`);
    privilegios.value = new Set(data);
    $q.notify({ type: 'info', message: 'Privilégios copiados. Lembre-se de salvar.' });
  } catch (err) {
    notificarErro('Não foi possível copiar os privilégios.', err);
  } finally {
    copiando.value = false;
    copiarDe.value = null;
  }
}

// --- Carregar / salvar --------------------------------------------------
async function carregarParaEdicao() {
  carregando.value = true;
  try {
    const [{ data: usuario }, { data: privs }] = await Promise.all([
      api.get(`/usuarios/${route.params.id}`),
      api.get(`/usuarios/${route.params.id}/privilegios`),
    ]);
    Object.assign(form, {
      id: usuario.id,
      login: usuario.login,
      nome: usuario.nome || '',
      email: usuario.email || '',
      senha: '',
      papel: usuario.papel,
      ativo: usuario.ativo,
      empresas: [...usuario.empresas],
    });
    privilegios.value = new Set(privs);
  } catch (err) {
    if (err.response?.status !== 404) notificarErro('Não foi possível carregar o usuário.', err);
    encontrado.value = false;
  } finally {
    carregando.value = false;
    nextTick(() => formRef.value?.resetValidation());
  }
}

async function salvar() {
  salvando.value = true;
  try {
    const payload = {
      login: form.login,
      nome: form.nome,
      email: form.email || null,
      papel: form.papel,
      ativo: form.ativo,
      empresas: form.empresas,
      privilegios: [...privilegios.value],
    };
    if (form.senha) payload.senha = form.senha;

    if (modoEdicao.value) await api.put(`/usuarios/${form.id}`, payload);
    else await api.post('/usuarios', payload);

    $q.notify({ type: 'positive', message: 'Usuário salvo com sucesso.' });
    // Editou a si mesmo: recarrega a sessão pra menu/rotas refletirem na hora.
    if (editandoProprioUsuario.value) await auth.restaurarSessao();
    router.push({ name: 'usuarios' });
  } catch (err) {
    notificarErro('Não foi possível salvar o usuário.', err);
  } finally {
    salvando.value = false;
  }
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(() => {
  carregarCatalogo();
  carregarEmpresas();
  if (!somenteLeitura.value) carregarOutrosUsuarios();
  if (modoEdicao.value) carregarParaEdicao();
});
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
.toggle-row {
  border: 1px solid var(--app-borda);
  border-radius: 8px;
}
.privilegios-scroll {
  overflow-x: auto;
}
.privilegios-tabela {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
.privilegios-tabela th {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--app-texto-suave);
  padding: 6px 8px;
  border-bottom: 1px solid var(--app-borda);
  white-space: nowrap;
}
.privilegios-tabela td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--app-borda);
  vertical-align: top;
}
.privilegios-secao td {
  background: var(--app-superficie-suave);
  font-weight: 600;
  color: var(--app-texto-2);
  padding: 6px 8px;
}
.privilegios-tela {
  color: var(--app-texto);
  white-space: nowrap;
}
.footer-actions {
  border-top: 1px solid var(--app-borda);
}
</style>
