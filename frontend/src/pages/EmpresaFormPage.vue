<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <q-btn round outline color="grey-7" icon="arrow_back" :to="{ name: 'empresas' }">
        <q-tooltip>Voltar</q-tooltip>
      </q-btn>
      <div class="text-right">
        <div class="text-h5">{{ modoEdicao ? `Empresa #${form.id}` : 'Nova empresa' }}</div>
        <div class="text-caption text-grey-7">
          {{ somenteLeitura ? 'Visualização' : modoEdicao ? 'Atualizar dados da empresa' : 'Cadastrar um novo laboratório' }}
        </div>
      </div>
    </div>

    <div v-if="carregando" class="row justify-center q-pa-xl">
      <q-spinner color="primary" size="42px" />
    </div>

    <div v-else-if="modoEdicao && !encontrado" class="text-center q-pa-xl text-grey-7">
      Empresa não encontrada.
      <div class="q-mt-md"><q-btn flat no-caps color="primary" label="Voltar para a lista" :to="{ name: 'empresas' }" /></div>
    </div>

    <q-form v-else ref="formRef" greedy @submit="salvar">
      <div class="row q-col-gutter-lg">
        <div class="col-12 col-md-8 column q-gutter-y-md">
          <!-- Identificação -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="apartment" color="primary" size="20px" /></div>
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
                  { label: 'Pessoa jurídica', value: 'J' },
                  { label: 'Pessoa física', value: 'F' },
                ]"
                @update:model-value="form.cnpjCpf = ''"
              />
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-5">
                <q-input
                  v-model="form.cnpjCpf"
                  v-bind="campo"
                  :label="ehPJ ? 'CNPJ *' : 'CPF *'"
                  :mask="ehPJ ? 'XX.XXX.XXX/XXXX-##' : '###.###.###-##'"
                  unmasked-value
                  lazy-rules
                  :hint="ehPJ ? 'Aceita CNPJ alfanumérico' : undefined"
                  :rules="[validarDocumento]"
                />
              </div>
              <div class="col-12 col-sm-7">
                <q-input
                  v-model="form.razaoSocial"
                  v-bind="campo"
                  :label="ehPJ ? 'Razão social *' : 'Nome completo *'"
                  maxlength="150"
                  lazy-rules
                  :rules="[(val) => (!!val && val.trim() !== '') || 'Campo obrigatório']"
                />
              </div>
              <div class="col-12 col-sm-7">
                <q-input v-model="form.nomeFantasia" v-bind="campo" label="Nome fantasia" maxlength="150" />
              </div>
              <div class="col-12 col-sm-5">
                <q-select
                  v-model="form.regimeTributario"
                  v-bind="campo"
                  label="Regime tributário"
                  clearable
                  emit-value
                  map-options
                  :options="opcoesRegime"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.inscricaoEstadual"
                  v-bind="campo"
                  label="Inscrição estadual"
                  maxlength="20"
                  :disable="ieIsento"
                >
                  <template #after>
                    <q-checkbox v-model="ieIsento" :disable="somenteLeitura" dense label="Isento" class="text-body2" />
                  </template>
                </q-input>
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="form.inscricaoMunicipal" v-bind="campo" label="Inscrição municipal" maxlength="20" />
              </div>
            </div>
          </q-card>

          <!-- Endereço -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="place" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Endereço</div>
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="form.cep"
                  v-bind="campo"
                  label="CEP"
                  mask="#####-###"
                  unmasked-value
                  :loading="buscandoCep"
                  hint="Preenche o endereço automaticamente"
                  @update:model-value="aoMudarCep"
                />
              </div>
              <div class="col-12 col-sm-8">
                <q-input v-model="form.logradouro" v-bind="campo" label="Logradouro" maxlength="150" />
              </div>
              <div class="col-6 col-sm-3">
                <q-input v-model="form.numero" v-bind="campo" label="Número" maxlength="20" />
              </div>
              <div class="col-6 col-sm-4">
                <q-input v-model="form.complemento" v-bind="campo" label="Complemento" maxlength="80" />
              </div>
              <div class="col-12 col-sm-5">
                <q-input v-model="form.bairro" v-bind="campo" label="Bairro" maxlength="80" />
              </div>
              <div class="col-4 col-sm-3">
                <q-select
                  v-model="form.uf"
                  v-bind="campo"
                  label="UF"
                  clearable
                  emit-value
                  map-options
                  :options="opcoesUf"
                  @update:model-value="aoMudarUf"
                />
              </div>
              <div class="col-8 col-sm-9">
                <q-select
                  v-model="form.cidade"
                  v-bind="campo"
                  label="Cidade"
                  clearable
                  emit-value
                  map-options
                  use-input
                  input-debounce="150"
                  :options="opcoesCidadeFiltradas"
                  :loading="carregandoCidades"
                  :disable="!form.uf"
                  :hint="!form.uf ? 'Selecione a UF primeiro' : undefined"
                  @filter="filtrarCidades"
                >
                  <template #no-option>
                    <q-item><q-item-section class="text-grey-7">Nenhuma cidade encontrada</q-item-section></q-item>
                  </template>
                </q-select>
              </div>
            </div>
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
              <div class="col-12 col-sm-6">
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
              <div class="col-12 col-sm-6">
                <q-input v-model="form.site" v-bind="campo" label="Site" maxlength="150" />
              </div>
            </div>
          </q-card>

          <!-- Responsável técnico (inscrição no CRO) -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="o_medical_services" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Responsável técnico</div>
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input v-model="form.responsavelTecnico" v-bind="campo" label="Nome (TPD / cirurgião-dentista)" maxlength="150" />
              </div>
              <div class="col-8 col-sm-3">
                <q-input v-model="form.croResponsavel" v-bind="campo" label="Nº CRO" maxlength="20" />
              </div>
              <div class="col-4 col-sm-3">
                <q-select v-model="form.croUf" v-bind="campo" label="UF do CRO" clearable emit-value map-options :options="opcoesUf" />
              </div>
            </div>
          </q-card>

          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="notes" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Observações</div>
            </div>
            <q-input v-model="form.observacao" v-bind="campo" type="textarea" autogrow label="Observações" />
          </q-card>
        </div>

        <!-- Coluna lateral: logo + situação -->
        <div class="col-12 col-md-4 column q-gutter-y-md">
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="image" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Logo</div>
            </div>
            <div class="logo-preview q-mb-sm">
              <img v-if="logoPreview" :src="logoPreview" alt="Logo da empresa" />
              <div v-else class="text-caption text-grey-7 text-center">Sem logo</div>
            </div>
            <template v-if="!somenteLeitura">
              <q-file
                v-model="arquivoLogo"
                dense
                outlined
                label="Escolher imagem"
                accept="image/png,image/jpeg,image/webp"
                max-file-size="1048576"
                clearable
                hint="PNG, JPG ou WEBP até 1 MB"
                @rejected="$q.notify({ type: 'negative', message: 'Imagem inválida ou maior que 1 MB.' })"
              >
                <template #prepend><q-icon name="upload" /></template>
              </q-file>
              <q-btn v-if="logoPreview" flat dense no-caps color="negative" label="Remover logo" class="q-mt-sm" @click="removerLogo" />
            </template>
          </q-card>

          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="tune" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Situação</div>
            </div>
            <div class="toggle-row row items-center justify-between q-pa-sm">
              <div>
                <div class="text-body2 text-weight-medium">Empresa ativa</div>
                <div class="text-caption text-grey-7">Disponível para seleção no login</div>
              </div>
              <q-toggle v-model="form.ativo" :disable="somenteLeitura" color="primary" />
            </div>
          </q-card>
        </div>
      </div>

      <div class="row justify-end q-gutter-sm q-mt-lg q-pt-md footer-actions">
        <q-btn outline color="grey-8" no-caps :label="somenteLeitura ? 'Voltar' : 'Cancelar'" class="q-px-md text-weight-bold" :to="{ name: 'empresas' }" />
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
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { auth } from '../stores/auth';
import { cnpjValido, cpfValido, mascaraTelefone, somenteDigitos } from '../utils/documento';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CRT — mesmo código da NF-e (ver sql/001_estrutura_inicial.sql).
const opcoesRegime = [
  { label: '1 - Simples Nacional', value: 1 },
  { label: '2 - Simples Nacional (excesso de sublimite)', value: 2 },
  { label: '3 - Regime Normal (Lucro Presumido/Real)', value: 3 },
  { label: '4 - Simples Nacional - MEI', value: 4 },
];

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const modoEdicao = computed(() => !!route.params.id);
const somenteLeitura = computed(() => modoEdicao.value && !auth.pode('empresas', 'editar'));
const carregando = ref(modoEdicao.value);
const encontrado = ref(true);
const salvando = ref(false);
const formRef = ref(null);

// Props comuns dos campos (dense/outlined + somente leitura sem privilégio).
const campo = computed(() => ({ dense: true, outlined: true, readonly: somenteLeitura.value }));

const form = reactive({
  id: null,
  tipoPessoa: 'J',
  cnpjCpf: '',
  razaoSocial: '',
  nomeFantasia: '',
  inscricaoEstadual: '',
  inscricaoMunicipal: '',
  regimeTributario: null,
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  uf: null,
  cidade: null,
  telefone: '',
  celular: '',
  email: '',
  site: '',
  responsavelTecnico: '',
  croResponsavel: '',
  croUf: null,
  observacao: '',
  ativo: true,
  temLogo: false,
});

const ehPJ = computed(() => form.tipoPessoa === 'J');

function validarDocumento(val) {
  if (!val) return 'Campo obrigatório';
  if (ehPJ.value) return cnpjValido(val) || 'CNPJ inválido';
  return cpfValido(val) || 'CPF inválido';
}

// "Isento" na inscrição estadual grava 'ISENTO'.
const ieIsento = ref(false);
watch(ieIsento, (isento) => {
  if (isento) form.inscricaoEstadual = 'ISENTO';
  else if (form.inscricaoEstadual === 'ISENTO') form.inscricaoEstadual = '';
});

// --- UF / Cidade --------------------------------------------------------
const opcoesUf = ref([]);
const cidadesDaUf = ref([]); // [{ label, value }]
const opcoesCidadeFiltradas = ref([]);
const carregandoCidades = ref(false);

async function carregarUfs() {
  try {
    const { data } = await api.get('/localidades/ufs');
    opcoesUf.value = data.map((u) => ({ label: u.sigla, value: u.sigla }));
  } catch (err) {
    notificarErro('Não foi possível carregar as UFs.', err);
  }
}

async function carregarCidades(uf) {
  cidadesDaUf.value = [];
  opcoesCidadeFiltradas.value = [];
  if (!uf) return;
  carregandoCidades.value = true;
  try {
    const { data } = await api.get('/localidades/cidades', { params: { uf } });
    cidadesDaUf.value = data.map((c) => ({ label: c.nome, value: c.codigoIbge, busca: normalizar(c.nome) }));
    opcoesCidadeFiltradas.value = cidadesDaUf.value;
  } catch (err) {
    notificarErro('Não foi possível carregar as cidades.', err);
  } finally {
    carregandoCidades.value = false;
  }
}

// Busca sem acento: "sao paulo" encontra "São Paulo".
function normalizar(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function filtrarCidades(val, update) {
  update(() => {
    const termo = normalizar(val);
    opcoesCidadeFiltradas.value = termo ? cidadesDaUf.value.filter((c) => c.busca.includes(termo)) : cidadesDaUf.value;
  });
}

async function aoMudarUf(uf) {
  form.cidade = null;
  await carregarCidades(uf);
}

// --- CEP (ViaCEP) -------------------------------------------------------
// Consulta pública do ViaCEP direto do navegador. Preenche logradouro,
// bairro, UF e cidade (pelo código IBGE, que é a PK da tabela cidade). Só
// sobrescreve campos que vieram preenchidos na resposta.
const buscandoCep = ref(false);
async function aoMudarCep(valor) {
  const cep = somenteDigitos(valor);
  if (cep.length !== 8 || somenteLeitura.value) return;
  buscandoCep.value = true;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();
    if (dados.erro) {
      $q.notify({ type: 'warning', message: 'CEP não encontrado.' });
      return;
    }
    if (dados.logradouro) form.logradouro = dados.logradouro;
    if (dados.bairro) form.bairro = dados.bairro;
    if (dados.complemento && !form.complemento) form.complemento = dados.complemento;
    if (dados.uf) {
      if (form.uf !== dados.uf) {
        form.uf = dados.uf;
        await carregarCidades(dados.uf);
      }
      if (dados.ibge) form.cidade = Number(dados.ibge);
    }
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'warning', message: 'Não foi possível consultar o CEP. Preencha o endereço manualmente.' });
  } finally {
    buscandoCep.value = false;
  }
}

// --- Logo ---------------------------------------------------------------
const arquivoLogo = ref(null);
const logoUrlAtual = ref(null); // object URL do logo já salvo
const logoNovo = ref(undefined); // undefined = não mexeu; string = novo; null = removido
const logoPreview = computed(() => (logoNovo.value === undefined ? logoUrlAtual.value : logoNovo.value));

watch(arquivoLogo, (arquivo) => {
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    logoNovo.value = leitor.result;
  };
  leitor.readAsDataURL(arquivo);
});

function removerLogo() {
  arquivoLogo.value = null;
  logoNovo.value = null;
}

async function carregarLogoAtual() {
  if (!form.temLogo) return;
  try {
    // A rota exige o token: busca como blob em vez de <img src> direto.
    const resposta = await api.get(`/empresas/${form.id}/logo`, { responseType: 'blob' });
    logoUrlAtual.value = URL.createObjectURL(resposta.data);
  } catch (err) {
    console.error(err);
  }
}

// --- Carregar / salvar --------------------------------------------------
async function carregarParaEdicao() {
  carregando.value = true;
  try {
    const { data } = await api.get(`/empresas/${route.params.id}`);
    Object.assign(form, {
      ...data,
      nomeFantasia: data.nomeFantasia || '',
      inscricaoEstadual: data.inscricaoEstadual || '',
      inscricaoMunicipal: data.inscricaoMunicipal || '',
      cep: data.cep || '',
      logradouro: data.logradouro || '',
      numero: data.numero || '',
      complemento: data.complemento || '',
      bairro: data.bairro || '',
      telefone: data.telefone || '',
      celular: data.celular || '',
      email: data.email || '',
      site: data.site || '',
      responsavelTecnico: data.responsavelTecnico || '',
      croResponsavel: data.croResponsavel || '',
      observacao: data.observacao || '',
    });
    ieIsento.value = data.inscricaoEstadual === 'ISENTO';
    if (form.uf) await carregarCidades(form.uf);
    await carregarLogoAtual();
  } catch (err) {
    if (err.response?.status !== 404) notificarErro('Não foi possível carregar a empresa.', err);
    encontrado.value = false;
  } finally {
    carregando.value = false;
    nextTick(() => formRef.value?.resetValidation());
  }
}

async function salvar() {
  salvando.value = true;
  try {
    const payload = { ...form };
    delete payload.id;
    delete payload.temLogo;
    // "logoBase64" só vai quando o usuário mexeu no logo — ausente mantém
    // o atual no backend.
    if (logoNovo.value !== undefined) payload.logoBase64 = logoNovo.value;

    if (modoEdicao.value) {
      await api.put(`/empresas/${form.id}`, payload);
    } else {
      const { data: criada } = await api.post('/empresas', payload);
      // Base nova / usuário sem empresa na sessão: quem cadastra já fica
      // vinculado — seleciona a empresa recém-criada pra poder trabalhar.
      if (!auth.empresa.value && criada.ativo) {
        await auth.trocarEmpresa(criada.id);
      }
    }
    $q.notify({ type: 'positive', message: 'Empresa salva com sucesso.' });
    router.push({ name: 'empresas' });
  } catch (err) {
    notificarErro('Não foi possível salvar a empresa.', err);
  } finally {
    salvando.value = false;
  }
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(async () => {
  await carregarUfs();
  if (modoEdicao.value) await carregarParaEdicao();
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
.logo-preview {
  height: 110px;
  border: 1px dashed var(--app-borda-forte);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.logo-preview img {
  max-height: 100px;
  max-width: 100%;
  object-fit: contain;
}
</style>
