<template>
  <q-page class="q-pa-lg">
    <div class="q-mb-lg">
      <div class="text-h5">Comissões</div>
      <div class="text-caption text-grey-7">Comissão de cada funcionário por serviço · {{ auth.empresa.value?.nome }}</div>
    </div>

    <div class="row q-col-gutter-lg">
      <!-- Funcionários -->
      <div class="col-12 col-md-4">
        <q-card flat bordered>
          <q-card-section class="q-pb-sm">
            <q-input v-model="buscaFuncionario" dense outlined clearable placeholder="Buscar funcionário...">
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </q-card-section>
          <div v-if="carregandoFuncionarios" class="row justify-center q-pa-lg"><q-spinner color="primary" size="28px" /></div>
          <div v-else-if="!funcionarios.length" class="text-caption text-grey-7 q-pa-md">
            Nenhum funcionário ativo. Cadastre em Pessoas marcando o tipo <b>Funcionário</b>.
          </div>
          <q-list v-else separator class="lista-func">
            <q-item
              v-for="f in funcionariosFiltrados"
              :key="f.id"
              clickable
              :active="f.id === selecionado"
              active-class="menu-item--ativo"
              @click="selecionar(f.id)"
            >
              <q-item-section avatar><q-icon name="o_badge" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ f.nome }}</q-item-label>
                <q-item-label caption>{{ f.qtdComissoes ? `${f.qtdComissoes} serviço(s) com comissão` : 'Sem comissão definida' }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </div>

      <!-- Tabela de comissões do funcionário -->
      <div class="col-12 col-md-8">
        <q-card flat bordered class="q-pa-md">
          <div v-if="!selecionado" class="text-center text-grey-7 q-pa-xl">Selecione um funcionário.</div>
          <div v-else-if="carregando" class="row justify-center q-pa-xl"><q-spinner color="primary" size="36px" /></div>
          <template v-else>
            <div class="row items-center q-mb-md q-col-gutter-sm">
              <div class="col-12 col-sm">
                <div class="text-subtitle1 text-weight-bold">{{ nomeFuncionario }}</div>
                <div class="text-caption text-grey-7">
                  Deixe em branco os serviços sem comissão. <b>R$</b> = valor fixo por unidade · <b>%</b> = sobre o total do item.
                </div>
              </div>
              <!-- Aplicar o mesmo valor a todos os serviços -->
              <div v-if="podeEditar" class="col-12 col-sm-auto row items-center no-wrap q-gutter-x-sm">
                <q-btn-toggle v-model="massa.tipo" dense unelevated no-caps toggle-color="primary" toggle-text-color="dark" class="toggle-tipo" :options="OPCOES_TIPO" />
                <q-input v-model="massa.valor" dense outlined type="number" step="0.01" min="0" style="width: 100px" placeholder="Valor" input-class="text-right" />
                <q-btn flat dense no-caps color="grey-8" icon="o_done_all" label="Aplicar a todos" :disable="massa.valor === '' || massa.valor === null" @click="aplicarATodos" />
              </div>
            </div>

            <div v-if="!itens.length" class="text-caption text-grey-7 q-pa-md">Nenhum serviço ativo cadastrado.</div>
            <q-markup-table v-else flat bordered dense class="tabela-comissao">
              <thead>
                <tr>
                  <th class="text-left">Serviço</th>
                  <th class="text-right">Valor do serviço</th>
                  <th class="text-center">Tipo</th>
                  <th class="text-right">Comissão</th>
                  <th class="text-right">Por unidade</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in itens" :key="item.servico" :class="{ alterado: alterado(item) }">
                  <td>{{ item.descricao }}</td>
                  <td class="text-right text-grey-8">{{ formatarMoeda(item.valorServico) }}</td>
                  <td class="text-center">
                    <q-btn-toggle
                      v-model="item.tipo"
                      :disable="!podeEditar"
                      dense
                      unelevated
                      no-caps
                      size="sm"
                      toggle-color="primary"
                      toggle-text-color="dark"
                      class="toggle-tipo"
                      :options="OPCOES_TIPO"
                    />
                  </td>
                  <td class="text-right" style="width: 150px">
                    <q-input
                      v-model="item.valor"
                      :readonly="!podeEditar"
                      dense
                      outlined
                      type="number"
                      step="0.01"
                      min="0"
                      :max="item.tipo === 'P' ? 100 : undefined"
                      :prefix="item.tipo === 'V' ? 'R$' : undefined"
                      :suffix="item.tipo === 'P' ? '%' : undefined"
                      input-class="text-right"
                      placeholder="—"
                      :error="invalido(item)"
                      hide-bottom-space
                    />
                  </td>
                  <td class="text-right text-grey-8">{{ estimativa(item) }}</td>
                </tr>
              </tbody>
            </q-markup-table>

            <div v-if="podeEditar && itens.length" class="row justify-end items-center q-gutter-sm q-mt-md">
              <span v-if="qtdAlterados" class="text-caption text-orange-9">{{ qtdAlterados }} alteração(ões) não salva(s)</span>
              <q-btn outline no-caps color="grey-8" label="Desfazer" :disable="!qtdAlterados" @click="desfazer" />
              <q-btn unelevated no-caps color="primary" text-color="dark" icon="save" label="Salvar" class="text-weight-bold" :loading="salvando" :disable="!qtdAlterados || temInvalido" @click="salvar" />
            </div>
          </template>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
// Comissões por funcionário x serviço (empresa da sessão). Tela separada
// do cadastro de Pessoas, com privilégio próprio "comissoes" (ver/editar).
// A comissão calculada é gravada em cada item da OS quando ela é salva.
import { computed, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';

const OPCOES_TIPO = [
  { label: 'R$', value: 'V' },
  { label: '%', value: 'P' },
];

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const podeEditar = computed(() => auth.pode('comissoes', 'editar'));

const funcionarios = ref([]);
const carregandoFuncionarios = ref(false);
const buscaFuncionario = ref('');
const selecionado = ref(null);
const nomeFuncionario = ref('');
const itens = ref([]); // [{ servico, descricao, valorServico, tipo, valor }]
const originais = ref(new Map()); // servico -> "tipo:valor" pra detectar alteração
const carregando = ref(false);
const salvando = ref(false);
const massa = reactive({ tipo: 'V', valor: '' });

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const funcionariosFiltrados = computed(() => {
  const t = normalizar(buscaFuncionario.value);
  return funcionarios.value.filter((f) => normalizar(f.nome).includes(t));
});

const chave = (item) => `${item.tipo}:${item.valor === '' || item.valor === null ? '' : Number(item.valor)}`;
const alterado = (item) => originais.value.get(item.servico) !== chave(item);
const qtdAlterados = computed(() => itens.value.filter(alterado).length);
const invalido = (item) => {
  if (item.valor === '' || item.valor === null) return false;
  const v = Number(item.valor);
  return !Number.isFinite(v) || v < 0 || (item.tipo === 'P' && v > 100);
};
const temInvalido = computed(() => itens.value.some(invalido));

function estimativa(item) {
  if (item.valor === '' || item.valor === null || invalido(item)) return '—';
  const v = Number(item.valor);
  return formatarMoeda(item.tipo === 'P' ? (item.valorServico * v) / 100 : v);
}

async function carregarFuncionarios() {
  carregandoFuncionarios.value = true;
  try {
    const { data } = await api.get('/comissoes/funcionarios');
    funcionarios.value = data;
  } catch (err) {
    notificarErro('Não foi possível carregar os funcionários.', err);
  } finally {
    carregandoFuncionarios.value = false;
  }
}

function aplicarDados(data) {
  nomeFuncionario.value = data.funcionario.nome;
  itens.value = data.itens.map((i) => ({ ...i, valor: i.valor === null ? '' : i.valor }));
  originais.value = new Map(itens.value.map((i) => [i.servico, chave(i)]));
}

async function carregarComissoes(id) {
  carregando.value = true;
  try {
    const { data } = await api.get(`/comissoes/funcionarios/${id}`);
    aplicarDados(data);
  } catch (err) {
    notificarErro('Não foi possível carregar as comissões.', err);
  } finally {
    carregando.value = false;
  }
}

function selecionar(id) {
  if (id === selecionado.value) return;
  const trocar = () => {
    selecionado.value = id;
    router.replace({ query: { funcionario: id } });
    carregarComissoes(id);
  };
  if (qtdAlterados.value) {
    $q.dialog({
      title: 'Alterações não salvas',
      message: 'Descartar as alterações deste funcionário?',
      cancel: { label: 'Voltar', flat: true, noCaps: true },
      ok: { label: 'Descartar', color: 'negative', unelevated: true, noCaps: true },
    }).onOk(trocar);
  } else {
    trocar();
  }
}

function aplicarATodos() {
  for (const item of itens.value) {
    item.tipo = massa.tipo;
    item.valor = massa.valor;
  }
}

function desfazer() {
  carregarComissoes(selecionado.value);
}

async function salvar() {
  salvando.value = true;
  try {
    const payload = {
      itens: itens.value.filter(alterado).map((i) => ({
        servico: i.servico,
        tipo: i.tipo,
        valor: i.valor === '' || i.valor === null ? null : Number(i.valor),
      })),
    };
    const { data } = await api.put(`/comissoes/funcionarios/${selecionado.value}`, payload);
    aplicarDados(data);
    $q.notify({ type: 'positive', message: 'Comissões salvas.' });
    carregarFuncionarios();
  } catch (err) {
    notificarErro('Não foi possível salvar as comissões.', err);
  } finally {
    salvando.value = false;
  }
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(async () => {
  await carregarFuncionarios();
  const inicial = Number(route.query.funcionario);
  if (inicial && funcionarios.value.some((f) => f.id === inicial)) {
    selecionado.value = inicial;
    carregarComissoes(inicial);
  }
});
</script>

<style scoped>
.lista-func {
  max-height: 65vh;
  overflow-y: auto;
}
.toggle-tipo {
  border: 1px solid var(--app-borda);
}
.tabela-comissao td {
  vertical-align: middle;
}
.tabela-comissao tr.alterado td {
  background: rgba(255, 183, 77, 0.12);
}
</style>
