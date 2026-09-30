<template>
  <!-- Bloco de endereço reutilizável (Empresa, Pessoa e próximos cadastros).
       Recebe o objeto do formulário em "form" e preenche direto os campos
       cep, rua, numero, complemento, bairro, uf, cidade (código IBGE).

       CEP: ao digitar os 8 dígitos (ou clicar na lupa) consulta o ViaCEP e
       preenche rua/bairro/UF/cidade. "Não sei o CEP" abre a busca inversa
       (UF + cidade + rua -> lista de CEPs). -->
  <div class="row q-col-gutter-md">
    <div class="col-12 col-sm-4">
      <q-input
        v-model="form.cep"
        dense
        outlined
        :readonly="readonly"
        label="CEP"
        mask="#####-###"
        unmasked-value
        :bottom-slots="!readonly"
        :loading="buscandoCep"
        @update:model-value="aoDigitarCep"
        @keydown.enter.prevent="buscarCep"
      >
        <template v-if="!readonly" #append>
          <q-btn flat dense round icon="search" size="sm" :disable="(form.cep || '').length !== 8" @click="buscarCep">
            <q-tooltip>Buscar CEP</q-tooltip>
          </q-btn>
        </template>
        <template v-if="!readonly" #hint>
          <a href="#" class="link-cep" @click.prevent="abrirBuscaPorEndereco">Não sei o CEP</a>
        </template>
      </q-input>
    </div>
    <div class="col-12 col-sm-8">
      <q-input v-model="form.rua" dense outlined :readonly="readonly" label="Rua" maxlength="150" />
    </div>
    <div class="col-6 col-sm-3">
      <q-input v-model="form.numero" dense outlined :readonly="readonly" label="Número" maxlength="20" />
    </div>
    <div class="col-6 col-sm-4">
      <q-input v-model="form.complemento" dense outlined :readonly="readonly" label="Complemento" maxlength="80" />
    </div>
    <div class="col-12 col-sm-5">
      <q-input v-model="form.bairro" dense outlined :readonly="readonly" label="Bairro" maxlength="80" />
    </div>
    <div class="col-4 col-sm-3">
      <q-select
        v-model="form.uf"
        dense
        outlined
        :readonly="readonly"
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
        dense
        outlined
        :readonly="readonly"
        label="Cidade"
        clearable
        emit-value
        map-options
        use-input
        input-debounce="150"
        :options="cidadesFiltradas"
        :loading="carregandoCidades"
        :disable="!form.uf"
        :hint="!form.uf && !readonly ? 'Selecione a UF primeiro' : undefined"
        @filter="filtrarCidades"
      >
        <template #no-option>
          <q-item><q-item-section class="text-grey-7">Nenhuma cidade encontrada</q-item-section></q-item>
        </template>
      </q-select>
    </div>
  </div>

  <!-- Busca inversa: CEP pelo endereço (ViaCEP /ws/UF/cidade/rua/json). -->
  <q-dialog v-model="dialogoBusca">
    <q-card style="width: 640px; max-width: 95vw">
      <q-card-section class="row items-center">
        <div class="text-h6">Buscar CEP pelo endereço</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>
      <q-separator />
      <q-card-section>
        <q-form class="row q-col-gutter-md" @submit="buscarPorEndereco">
          <div class="col-4 col-sm-2">
            <q-select v-model="busca.uf" dense outlined label="UF" emit-value map-options :options="opcoesUf" @update:model-value="aoMudarUfBusca" />
          </div>
          <div class="col-8 col-sm-4">
            <q-select
              v-model="busca.cidadeNome"
              dense
              outlined
              label="Cidade"
              emit-value
              map-options
              use-input
              input-debounce="150"
              :options="cidadesBuscaFiltradas"
              :disable="!busca.uf"
              @filter="filtrarCidadesBusca"
            />
          </div>
          <div class="col-9 col-sm-4">
            <q-input v-model="busca.rua" dense outlined label="Rua (mín. 3 letras)" />
          </div>
          <div class="col-3 col-sm-2 flex items-center">
            <q-btn
              type="submit"
              color="primary"
              text-color="dark"
              unelevated
              no-caps
              label="Buscar"
              class="full-width"
              :loading="buscandoEndereco"
              :disable="!busca.uf || !busca.cidadeNome || (busca.rua || '').trim().length < 3"
            />
          </div>
        </q-form>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div v-if="resultadosBusca === null" class="text-caption text-grey-7">Informe UF, cidade e parte do nome da rua.</div>
        <div v-else-if="!resultadosBusca.length" class="text-caption text-grey-7">Nenhum endereço encontrado.</div>
        <q-list v-else bordered separator class="rounded-borders resultados-cep">
          <q-item v-for="r in resultadosBusca" :key="r.cep + r.complemento" clickable @click="escolherResultado(r)">
            <q-item-section>
              <q-item-label>{{ r.logradouro }} <span v-if="r.complemento" class="text-grey-7">— {{ r.complemento }}</span></q-item-label>
              <q-item-label caption>{{ r.bairro }} · {{ r.localidade }}/{{ r.uf }}</q-item-label>
            </q-item-section>
            <q-item-section side class="text-weight-bold">{{ r.cep }}</q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
// "form" é o objeto reativo do formulário pai — este componente altera os
// campos de endereço dele diretamente (mesmo objeto, sem cópia).
import { onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';

const props = defineProps({
  form: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
});

const $q = useQuasar();

// --- UF / cidades (cache por UF, compartilhado entre instâncias) --------
const opcoesUf = ref([]);
const cidades = ref([]); // [{ label, value, busca }]
const cidadesFiltradas = ref([]);
const carregandoCidades = ref(false);
let ufCarregada = null;

const cacheCidades = window.__falconCacheCidades || (window.__falconCacheCidades = new Map());
let cacheUfs = window.__falconCacheUfs || null;

function normalizar(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function carregarUfs() {
  if (!cacheUfs) {
    const { data } = await api.get('/localidades/ufs');
    cacheUfs = window.__falconCacheUfs = data.map((u) => ({ label: u.sigla, value: u.sigla }));
  }
  opcoesUf.value = cacheUfs;
}

async function obterCidades(uf) {
  if (!uf) return [];
  if (!cacheCidades.has(uf)) {
    const { data } = await api.get('/localidades/cidades', { params: { uf } });
    cacheCidades.set(uf, data.map((c) => ({ label: c.nome, value: c.codigoIbge, busca: normalizar(c.nome) })));
  }
  return cacheCidades.get(uf);
}

async function carregarCidades(uf) {
  carregandoCidades.value = true;
  try {
    ufCarregada = uf;
    cidades.value = await obterCidades(uf);
    cidadesFiltradas.value = cidades.value;
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'negative', message: 'Não foi possível carregar as cidades.' });
  } finally {
    carregandoCidades.value = false;
  }
}

function filtrarCidades(val, update) {
  update(() => {
    const termo = normalizar(val);
    cidadesFiltradas.value = termo ? cidades.value.filter((c) => c.busca.includes(termo)) : cidades.value;
  });
}

async function aoMudarUf(uf) {
  props.form.cidade = null;
  await carregarCidades(uf);
}

// UF definida de fora (carregar registro para edição): carrega as cidades.
watch(
  () => props.form.uf,
  (uf) => {
    if (uf && uf !== ufCarregada) carregarCidades(uf);
  },
  { immediate: true }
);

// --- CEP -> endereço (ViaCEP, consulta direto do navegador) --------------
const buscandoCep = ref(false);
let ultimoCepBuscado = null;

function aoDigitarCep(valor) {
  const cep = String(valor || '');
  if (cep.length === 8 && cep !== ultimoCepBuscado) buscarCep();
}

async function aplicarEndereco(dados) {
  if (dados.logradouro) props.form.rua = dados.logradouro;
  if (dados.bairro) props.form.bairro = dados.bairro;
  if (dados.complemento && !props.form.complemento) props.form.complemento = dados.complemento;
  if (dados.uf) {
    if (props.form.uf !== dados.uf) {
      props.form.uf = dados.uf;
      await carregarCidades(dados.uf);
    }
    if (dados.ibge) props.form.cidade = Number(dados.ibge);
  }
}

async function buscarCep() {
  const cep = String(props.form.cep || '');
  if (cep.length !== 8 || props.readonly) return;
  ultimoCepBuscado = cep;
  buscandoCep.value = true;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();
    if (dados.erro) {
      $q.notify({ type: 'warning', message: 'CEP não encontrado.' });
      return;
    }
    await aplicarEndereco(dados);
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'warning', message: 'Não foi possível consultar o CEP. Preencha o endereço manualmente.' });
  } finally {
    buscandoCep.value = false;
  }
}

// --- Busca inversa (endereço -> CEP) -------------------------------------
const dialogoBusca = ref(false);
const busca = reactive({ uf: null, cidadeNome: null, rua: '' });
const cidadesBusca = ref([]);
const cidadesBuscaFiltradas = ref([]);
const resultadosBusca = ref(null);
const buscandoEndereco = ref(false);

async function aoMudarUfBusca(uf) {
  busca.cidadeNome = null;
  const lista = await obterCidades(uf);
  // ViaCEP busca pelo NOME da cidade, não pelo código.
  cidadesBusca.value = lista.map((c) => ({ label: c.label, value: c.label, busca: c.busca }));
  cidadesBuscaFiltradas.value = cidadesBusca.value;
}

function filtrarCidadesBusca(val, update) {
  update(() => {
    const termo = normalizar(val);
    cidadesBuscaFiltradas.value = termo ? cidadesBusca.value.filter((c) => c.busca.includes(termo)) : cidadesBusca.value;
  });
}

async function abrirBuscaPorEndereco() {
  resultadosBusca.value = null;
  busca.rua = props.form.rua || '';
  if (props.form.uf) {
    busca.uf = props.form.uf;
    await aoMudarUfBusca(props.form.uf);
    const cidadeAtual = cidades.value.find((c) => c.value === props.form.cidade);
    busca.cidadeNome = cidadeAtual?.label || null;
  }
  dialogoBusca.value = true;
}

async function buscarPorEndereco() {
  buscandoEndereco.value = true;
  try {
    const url = `https://viacep.com.br/ws/${busca.uf}/${encodeURIComponent(busca.cidadeNome)}/${encodeURIComponent(busca.rua.trim())}/json/`;
    const dados = await (await fetch(url)).json();
    resultadosBusca.value = Array.isArray(dados) ? dados : [];
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'warning', message: 'Não foi possível consultar o endereço.' });
  } finally {
    buscandoEndereco.value = false;
  }
}

async function escolherResultado(r) {
  props.form.cep = r.cep.replace(/\D/g, '');
  ultimoCepBuscado = props.form.cep;
  await aplicarEndereco(r);
  dialogoBusca.value = false;
}

onMounted(() => {
  carregarUfs().catch((err) => console.error(err));
});
</script>

<style scoped>
.link-cep {
  color: var(--app-verde-icone);
  text-decoration: none;
  font-weight: 600;
}
.resultados-cep {
  max-height: 320px;
  overflow-y: auto;
}
</style>
