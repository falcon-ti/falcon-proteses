<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <q-btn round outline color="grey-7" icon="arrow_back" :to="{ name: 'pessoas' }">
        <q-tooltip>Voltar</q-tooltip>
      </q-btn>
      <div class="text-right">
        <div class="text-h5">{{ modoEdicao ? `Pessoa #${form.id}` : 'Nova pessoa' }}</div>
        <div class="text-caption text-grey-7">
          {{ somenteLeitura ? 'Visualização' : modoEdicao ? 'Atualizar cadastro' : 'Cadastrar cliente, fornecedor ou funcionário' }}
          · {{ auth.empresa.value?.nome }}
        </div>
      </div>
    </div>

    <div v-if="carregando" class="row justify-center q-pa-xl">
      <q-spinner color="primary" size="42px" />
    </div>

    <div v-else-if="modoEdicao && !encontrado" class="text-center q-pa-xl text-grey-7">
      Pessoa não encontrada nesta empresa.
      <div class="q-mt-md"><q-btn flat no-caps color="primary" label="Voltar para a lista" :to="{ name: 'pessoas' }" /></div>
    </div>

    <q-form v-else ref="formRef" greedy @submit="salvar">
      <div class="row q-col-gutter-lg">
        <div class="col-12 col-md-8 column q-gutter-y-md">
          <!-- Identificação -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="o_badge" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Identificação</div>
              <q-space />
              <q-btn-toggle
                v-model="form.tipoPessoa"
                :disable="somenteLeitura"
                no-caps
                unelevated
                rounded
                dense
                toggle-color="primary"
                toggle-text-color="dark"
                class="toggle-pessoa"
                :options="[
                  { label: 'Pessoa física', value: 'F' },
                  { label: 'Pessoa jurídica', value: 'J' },
                ]"
                @update:model-value="form.cnpjCpf = ''"
              />
            </div>

            <!-- Tipo: um ou mais (ex.: cliente que também é fornecedor). -->
            <div class="q-mb-md">
              <div class="text-caption text-grey-7 q-mb-xs">Tipo *</div>
              <div class="row q-gutter-sm">
                <q-btn
                  v-for="t in OPCOES_TIPO"
                  :key="t.value"
                  :outline="!form.tipos.includes(t.value)"
                  :unelevated="form.tipos.includes(t.value)"
                  :color="form.tipos.includes(t.value) ? 'primary' : 'grey-7'"
                  :text-color="form.tipos.includes(t.value) ? 'dark' : undefined"
                  :icon="form.tipos.includes(t.value) ? 'check' : t.icon"
                  :label="t.label"
                  :disable="somenteLeitura"
                  no-caps
                  rounded
                  @click="alternarTipo(t.value)"
                />
              </div>
              <div v-if="erroTipo" class="text-negative text-caption q-mt-xs">Marque pelo menos um tipo.</div>
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-8">
                <q-input
                  v-model="form.nome"
                  v-bind="campo"
                  :label="ehPJ ? 'Razão social *' : 'Nome *'"
                  maxlength="150"
                  autofocus
                  lazy-rules
                  :rules="[(val) => (!!val && val.trim() !== '') || 'Campo obrigatório']"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.limiteCredito"
                  v-bind="campo"
                  label="Limite de crédito"
                  prefix="R$"
                  stack-label
                  type="number"
                  step="0.01"
                  min="0"
                  input-class="text-right"
                  lazy-rules
                  :rules="[(val) => val === '' || val === null || Number(val) >= 0 || 'Valor inválido']"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.cnpjCpf"
                  v-bind="campo"
                  :label="ehPJ ? 'CNPJ' : 'CPF'"
                  :mask="ehPJ ? 'XX.XXX.XXX/XXXX-##' : '###.###.###-##'"
                  unmasked-value
                  lazy-rules
                  :rules="[validarDocumento]"
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-input v-model="form.rgIe" v-bind="campo" :label="ehPJ ? 'Inscrição estadual' : 'RG'" maxlength="20" />
              </div>
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.registroProfissional"
                  v-bind="campo"
                  label="Nº registro (CRO/TPD)"
                  maxlength="30"
                  placeholder="ex.: CRO-SP 12345"
                />
              </div>
            </div>
          </q-card>

          <!-- Endereço (busca por CEP) -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="place" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Endereço</div>
            </div>
            <campo-endereco :form="form" :readonly="somenteLeitura" />
          </q-card>

          <!-- Contato -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="call" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Contato</div>
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input v-model="form.telefone" v-bind="campo" label="Telefone" :mask="mascaraTelefone(form.telefone)" unmasked-value />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="form.celular" v-bind="campo" label="Celular / WhatsApp" :mask="mascaraTelefone(form.celular)" unmasked-value />
              </div>
              <div class="col-12">
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
                <div class="text-body2 text-weight-medium">Cadastro ativo</div>
                <div class="text-caption text-grey-7">Disponível para uso nos lançamentos</div>
              </div>
              <q-toggle v-model="form.ativo" :disable="somenteLeitura" color="primary" />
            </div>
          </q-card>
        </div>
      </div>

      <div class="row justify-end q-gutter-sm q-mt-lg q-pt-md footer-actions">
        <q-btn outline color="grey-8" no-caps :label="somenteLeitura ? 'Voltar' : 'Cancelar'" class="q-px-md text-weight-bold" :to="{ name: 'pessoas' }" />
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
// Cadastro de pessoa DA EMPRESA DA SESSÃO — o backend grava/consulta sempre
// pela empresa do token (não existe campo empresa neste formulário).
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { auth } from '../stores/auth';
import { cnpjValido, cpfValido, mascaraTelefone } from '../utils/documento';
import CampoEndereco from '../components/CampoEndereco.vue';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPCOES_TIPO = [
  { value: 'cliente', label: 'Cliente', icon: 'o_person' },
  { value: 'fornecedor', label: 'Fornecedor', icon: 'o_local_shipping' },
  { value: 'funcionario', label: 'Funcionário', icon: 'o_badge' },
];

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const modoEdicao = computed(() => !!route.params.id);
const somenteLeitura = computed(() => modoEdicao.value && !auth.pode('pessoas', 'editar'));
const carregando = ref(modoEdicao.value);
const encontrado = ref(true);
const salvando = ref(false);
const formRef = ref(null);
const erroTipo = ref(false);

const campo = computed(() => ({ dense: true, outlined: true, readonly: somenteLeitura.value }));

// Tipo pré-marcado quando vem da lista filtrada (?tipo=fornecedor); senão cliente.
const tipoInicial = ['cliente', 'fornecedor', 'funcionario'].includes(route.query.tipo) ? route.query.tipo : 'cliente';

const form = reactive({
  id: null,
  tipos: [tipoInicial],
  tipoPessoa: 'F',
  nome: '',
  cnpjCpf: '',
  rgIe: '',
  registroProfissional: '',
  limiteCredito: 0,
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  uf: null,
  cidade: null,
  telefone: '',
  celular: '',
  email: '',
  ativo: true,
});

const ehPJ = computed(() => form.tipoPessoa === 'J');

function alternarTipo(tipo) {
  const i = form.tipos.indexOf(tipo);
  if (i === -1) form.tipos.push(tipo);
  else form.tipos.splice(i, 1);
  erroTipo.value = false;
}

// CPF/CNPJ é opcional; se preenchido, precisa ser válido.
function validarDocumento(val) {
  if (!val) return true;
  if (ehPJ.value) return cnpjValido(val) || 'CNPJ inválido';
  return cpfValido(val) || 'CPF inválido';
}

async function carregarParaEdicao() {
  carregando.value = true;
  try {
    const { data } = await api.get(`/pessoas/${route.params.id}`);
    const semNulos = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === null ? '' : v]));
    Object.assign(form, semNulos, { uf: data.uf, cidade: data.cidade });
  } catch (err) {
    if (err.response?.status !== 404) notificarErro('Não foi possível carregar a pessoa.', err);
    encontrado.value = false;
  } finally {
    carregando.value = false;
    nextTick(() => formRef.value?.resetValidation());
  }
}

async function salvar() {
  if (!form.tipos.length) {
    erroTipo.value = true;
    return;
  }
  salvando.value = true;
  try {
    const payload = { ...form };
    delete payload.id;
    delete payload.cidadeNome;
    if (modoEdicao.value) await api.put(`/pessoas/${form.id}`, payload);
    else await api.post('/pessoas', payload);
    $q.notify({ type: 'positive', message: 'Pessoa salva com sucesso.' });
    router.push({ name: 'pessoas' });
  } catch (err) {
    notificarErro('Não foi possível salvar a pessoa.', err);
  } finally {
    salvando.value = false;
  }
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(() => {
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
.toggle-pessoa {
  border: 1px solid var(--app-borda);
}
.footer-actions {
  border-top: 1px solid var(--app-borda);
}
</style>
