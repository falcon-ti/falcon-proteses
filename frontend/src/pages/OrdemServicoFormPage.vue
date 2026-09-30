<template>
  <q-page class="q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <q-btn round outline color="grey-7" icon="arrow_back" :to="{ name: 'ordens-servico' }">
        <q-tooltip>Voltar</q-tooltip>
      </q-btn>
      <div class="text-right">
        <div class="row items-center justify-end q-gutter-x-sm">
          <span v-if="ordem" class="tag-chip" :style="{ background: SITUACOES[ordem.situacao].fundo, color: SITUACOES[ordem.situacao].texto }">
            <span class="tag-dot" :style="{ background: SITUACOES[ordem.situacao].ponto }" />{{ SITUACOES[ordem.situacao].label }}
          </span>
          <div class="text-h5">{{ ordem ? `OS nº ${ordem.numero}` : 'Nova ordem de serviço' }}</div>
        </div>
        <div class="text-caption text-grey-7">{{ auth.empresa.value?.nome }}</div>
      </div>
    </div>

    <div v-if="carregando" class="row justify-center q-pa-xl"><q-spinner color="primary" size="42px" /></div>

    <div v-else-if="modoEdicao && !ordem" class="text-center q-pa-xl text-grey-7">
      Ordem de serviço não encontrada nesta empresa.
      <div class="q-mt-md"><q-btn flat no-caps color="primary" label="Voltar para a lista" :to="{ name: 'ordens-servico' }" /></div>
    </div>

    <q-form v-else ref="formRef" greedy @submit="salvar()">
      <div class="row q-col-gutter-lg">
        <div class="col-12 col-md-8 column q-gutter-y-md">
          <!-- Dados da ordem -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="o_assignment" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Dados da ordem</div>
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-7">
                <q-select
                  v-model="form.cliente"
                  v-bind="campo"
                  label="Cliente *"
                  emit-value
                  map-options
                  use-input
                  input-debounce="150"
                  :options="clientesFiltrados"
                  lazy-rules
                  :rules="[(val) => !!val || 'Selecione o cliente']"
                  @filter="filtrarClientes"
                >
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label>{{ scope.opt.label }}</q-item-label>
                        <q-item-label v-if="scope.opt.registro" caption>{{ scope.opt.registro }}</q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                  <template #no-option>
                    <q-item><q-item-section class="text-grey-7">Nenhum cliente encontrado. Cadastre em Pessoas.</q-item-section></q-item>
                  </template>
                </q-select>
              </div>
              <div class="col-12 col-sm-5">
                <q-input v-model="form.paciente" v-bind="campo" label="Nome do paciente" maxlength="150" />
              </div>
              <div class="col-12 col-sm-6">
                <campo-data-hora v-model="form.dataEntrada" label="Entrada *" obrigatorio :readonly="somenteLeitura" />
              </div>
              <div class="col-12 col-sm-6">
                <campo-data-hora
                  v-model="form.dataEntrega"
                  label="Entrega"
                  :readonly="somenteLeitura"
                  :rules="[(val) => !val || !form.dataEntrada || lerDataHora(val) >= form.dataEntrada || 'Antes da entrada']"
                />
              </div>
              <div class="col-12">
                <div class="toggle-row row items-center justify-between q-pa-sm">
                  <div class="row items-center no-wrap">
                    <q-icon name="o_back_hand" size="22px" class="q-mr-sm" :color="form.enviarProva ? 'orange-8' : 'grey-6'" />
                    <div>
                      <div class="text-body2 text-weight-medium">Enviar para prova antes de finalizar</div>
                      <div class="text-caption text-grey-7">A ordem só pode ser concluída depois da prova realizada</div>
                    </div>
                  </div>
                  <div class="row items-center no-wrap q-gutter-x-md">
                    <q-checkbox
                      v-if="form.enviarProva"
                      v-model="form.provaRealizada"
                      :disable="somenteLeitura"
                      dense
                      label="Prova realizada"
                      color="positive"
                    />
                    <q-toggle v-model="form.enviarProva" :disable="somenteLeitura" color="orange-8" />
                  </div>
                </div>
              </div>
              <div class="col-12">
                <q-input v-model="form.observacao" v-bind="campo" type="textarea" autogrow label="Observações" />
              </div>
            </div>
          </q-card>

          <!-- Serviços -->
          <q-card flat bordered class="q-pa-md">
            <div class="row items-center q-mb-md">
              <div class="icon-badge q-mr-sm"><q-icon name="o_medical_services" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Serviços</div>
              <q-space />
              <q-btn v-if="!somenteLeitura" unelevated no-caps color="primary" text-color="dark" icon="add" label="Adicionar serviço" @click="editarItem(null)" />
            </div>

            <div v-if="!form.itens.length" class="text-center text-grey-7 q-pa-lg itens-vazio">
              Nenhum serviço na ordem.
              <div v-if="tentouSalvar" class="text-negative text-caption q-mt-xs">Inclua pelo menos um serviço.</div>
            </div>
            <q-markup-table v-else flat bordered dense class="itens">
              <thead>
                <tr>
                  <th class="text-left">#</th>
                  <th class="text-left">Serviço</th>
                  <th class="text-left">Responsável</th>
                  <th class="text-right">Qtd</th>
                  <th class="text-right">Unitário</th>
                  <th class="text-right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in form.itens" :key="i" class="cursor-pointer" @click="editarItem(i)">
                  <td>{{ i + 1 }}</td>
                  <td>
                    <div class="text-weight-medium">{{ item.descricao }}</div>
                    <div v-if="item.detalhamento" class="text-caption text-grey-7 detalhe">{{ item.detalhamento }}</div>
                  </td>
                  <td>{{ item.responsavelNome }}</td>
                  <td class="text-right">{{ item.quantidade }}</td>
                  <td class="text-right">{{ formatarMoeda(item.valorUnitario) }}</td>
                  <td class="text-right text-weight-medium">{{ formatarMoeda(item.valorTotal) }}</td>
                  <td class="text-right" style="width: 48px">
                    <q-btn v-if="!somenteLeitura" dense flat round size="sm" color="negative" icon="delete" @click.stop="removerItem(i)">
                      <q-tooltip>Remover</q-tooltip>
                    </q-btn>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="text-right text-weight-bold">Total</td>
                  <td class="text-right text-weight-bold">{{ formatarMoeda(total) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </q-markup-table>
          </q-card>
        </div>

        <!-- Coluna lateral: resumo e pagamento -->
        <div class="col-12 col-md-4 column q-gutter-y-md">
          <q-card flat bordered class="q-pa-md">
            <div class="text-caption text-grey-7">Total da ordem</div>
            <div class="text-h4 text-weight-bold q-mb-sm">{{ formatarMoeda(total) }}</div>
            <div class="text-body2 text-grey-8">{{ form.itens.length }} serviço(s)</div>
            <div v-if="form.enviarProva" class="q-mt-sm">
              <q-chip dense :color="form.provaRealizada ? 'green-1' : 'orange-1'" :text-color="form.provaRealizada ? 'green-9' : 'orange-10'" :icon="form.provaRealizada ? 'o_check_circle' : 'o_pending'">
                {{ form.provaRealizada ? 'Prova realizada' : 'Aguardando prova' }}
              </q-chip>
            </div>
            <div v-if="ordem && ordem.situacao === 'A' && jaPassou(ordem.dataEntrega)" class="q-mt-sm">
              <q-chip dense color="red-1" text-color="red-9" icon="o_schedule">Entrega atrasada</q-chip>
            </div>
          </q-card>

          <!-- Pagamento (depois de concluída) -->
          <q-card v-if="ordem && ordem.situacao === 'C'" flat bordered class="q-pa-md">
            <div class="row items-center q-mb-sm">
              <div class="icon-badge q-mr-sm"><q-icon name="o_payments" color="primary" size="20px" /></div>
              <div class="text-subtitle1 text-weight-bold">Pagamento</div>
            </div>
            <div class="text-caption text-grey-7 q-mb-sm">
              Concluída em {{ formatarDataHora(ordem.dataConclusao) }} por {{ ordem.userConclusao }}
            </div>
            <template v-if="ordem.formaPagamento === 'V'">
              <div class="text-body2 q-mb-xs"><b>À vista</b> — entrada no caixa</div>
              <div v-for="c in ordem.caixa" :key="c.id" class="row justify-between text-body2">
                <span>{{ NOMES_MEIO[c.meioPagamento] || c.meioPagamento }}</span>
                <span class="text-weight-medium">{{ formatarMoeda(c.valor) }}</span>
              </div>
            </template>
            <template v-else-if="ordem.formaPagamento === 'P'">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-body2"><b>A prazo</b> — contas a receber</div>
                <q-btn v-if="auth.pode('contas-receber')" flat dense no-caps size="sm" color="primary" text-color="dark" label="Ver" icon-right="chevron_right" :to="{ name: 'contas-receber' }" />
              </div>
              <div v-for="c in ordem.contasReceber" :key="c.id" class="row justify-between text-body2">
                <span>
                  {{ c.parcela }}/{{ c.totalParcelas }} · venc. {{ formatarData(c.vencimento) }}
                  <q-badge v-if="c.situacao === 'P'" color="positive" label="paga" class="q-ml-xs" />
                  <q-badge v-else-if="c.valorPago > 0" color="orange-8" label="parcial" class="q-ml-xs" />
                </span>
                <span class="text-weight-medium">{{ formatarMoeda(c.valor) }}</span>
              </div>
            </template>
            <div v-else class="text-body2 text-grey-7">Sem valor — nenhum lançamento financeiro.</div>
          </q-card>

          <q-card v-if="ordem" flat bordered class="q-pa-md text-caption text-grey-7">
            Criada por {{ ordem.userInsert }} em {{ formatarDataHora(ordem.dateInsert) }}
          </q-card>
        </div>
      </div>

      <div class="row items-center q-gutter-sm q-mt-lg q-pt-md footer-actions">
        <q-btn
          v-if="ordem && ordem.situacao === 'A' && auth.pode('ordens-servico', 'inativar')"
          flat
          no-caps
          color="negative"
          icon="o_block"
          label="Cancelar OS"
          @click="cancelarOrdem"
        />
        <q-btn
          v-if="ordem && ordem.situacao === 'C' && auth.pode('ordens-servico', 'reabrir')"
          flat
          no-caps
          color="orange-9"
          icon="o_lock_open"
          label="Reabrir OS"
          @click="reabrirOrdem"
        />
        <q-space />
        <q-btn v-if="ordem" outline color="grey-8" no-caps icon="print" label="Imprimir" class="q-px-md text-weight-bold" :loading="imprimindo" @click="imprimirOrdem" />
        <q-btn outline color="grey-8" no-caps label="Voltar" class="q-px-md text-weight-bold" :to="{ name: 'ordens-servico' }" />
        <q-btn
          v-if="!somenteLeitura"
          type="submit"
          outline
          color="primary"
          text-color="dark"
          label="Salvar"
          no-caps
          class="q-px-md text-weight-bold"
          :loading="salvando"
        />
        <q-btn
          v-if="podeConcluir"
          unelevated
          color="primary"
          text-color="dark"
          icon="o_task_alt"
          label="Concluir"
          no-caps
          class="q-px-md text-weight-bold"
          :loading="concluindo"
          @click="concluirOrdem"
        />
      </div>
    </q-form>
  </q-page>
</template>

<script setup>
// Ordem de serviço DA EMPRESA DA SESSÃO.
// - Aberta: edita cabeçalho e itens (itens ficam em memória até "Salvar").
// - "Concluir" salva (se puder editar) e abre ConcluirOrdemDialog para
//   informar o pagamento (à vista -> caixa; a prazo -> contas a receber).
// - Concluída: somente leitura; "Reabrir" desfaz os lançamentos.
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import { agora, formatarData, formatarDataHora, jaPassou, lerDataHora } from '../utils/data';
import CampoDataHora from '../components/CampoDataHora.vue';
import OrdemItemDialog from '../components/OrdemItemDialog.vue';
import ConcluirOrdemDialog from '../components/ConcluirOrdemDialog.vue';

const SITUACOES = {
  A: { label: 'Aberta', fundo: '#E3F2FD', texto: '#1565C0', ponto: '#1E88E5' },
  C: { label: 'Concluída', fundo: '#E8F5E9', texto: '#2E7D32', ponto: '#43A047' },
  X: { label: 'Cancelada', fundo: '#F5F5F5', texto: '#616161', ponto: '#9E9E9E' },
};
const NOMES_MEIO = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  TRANSFERENCIA: 'Transferência',
  CHEQUE: 'Cheque',
};

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const modoEdicao = computed(() => !!route.params.id);
const ordem = ref(null); // última versão vinda do backend
const carregando = ref(modoEdicao.value);
const salvando = ref(false);
const concluindo = ref(false);
const tentouSalvar = ref(false);
const formRef = ref(null);

const aberta = computed(() => !ordem.value || ordem.value.situacao === 'A');
const somenteLeitura = computed(
  () => !aberta.value || (ordem.value ? !auth.pode('ordens-servico', 'editar') : !auth.pode('ordens-servico', 'incluir'))
);
// "Concluir" só aparece numa OS já gravada (em edição) — na inclusão só existe "Salvar".
const podeConcluir = computed(() => !!ordem.value && aberta.value && auth.pode('ordens-servico', 'concluir'));
const campo = computed(() => ({ dense: true, outlined: true, readonly: somenteLeitura.value }));

const form = reactive({
  cliente: null,
  paciente: '',
  dataEntrada: agora(),
  dataEntrega: '',
  enviarProva: false,
  provaRealizada: false,
  observacao: '',
  itens: [],
});

const total = computed(() => form.itens.reduce((t, i) => t + Math.round(i.valorTotal * 100), 0) / 100);

// --- Opções (clientes, funcionários, serviços ativos da empresa) --------
const opcoes = ref({ clientes: [], funcionarios: [], servicos: [], meiosPagamento: [] });
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const opcoesCliente = computed(() => {
  const lista = opcoes.value.clientes.map((c) => ({ label: c.nome, value: c.id, registro: c.registro }));
  if (ordem.value && !lista.some((o) => o.value === ordem.value.cliente)) {
    lista.push({ label: `${ordem.value.clienteNome} (inativo)`, value: ordem.value.cliente });
  }
  return lista;
});
const clientesFiltrados = ref([]);
function filtrarClientes(val, update) {
  update(() => {
    const t = normalizar(val);
    clientesFiltrados.value = opcoesCliente.value.filter((o) => normalizar(o.label).includes(t) || normalizar(o.registro).includes(t));
  });
}

async function carregarOpcoes() {
  try {
    const { data } = await api.get('/ordens-servico/opcoes');
    opcoes.value = data;
    clientesFiltrados.value = opcoesCliente.value;
  } catch (err) {
    notificarErro('Não foi possível carregar clientes/serviços.', err);
  }
}

// --- Itens ---------------------------------------------------------------
function editarItem(indice) {
  const item = indice === null ? null : form.itens[indice];
  if (!item && somenteLeitura.value) return;
  $q.dialog({
    component: OrdemItemDialog,
    componentProps: {
      item,
      servicos: opcoes.value.servicos,
      funcionarios: opcoes.value.funcionarios,
      somenteLeitura: somenteLeitura.value,
    },
  }).onOk((novo) => {
    if (indice === null) form.itens.push(novo);
    else form.itens.splice(indice, 1, novo);
  });
}

function removerItem(indice) {
  form.itens.splice(indice, 1);
}

// --- Carregar / salvar ---------------------------------------------------
function aplicarOrdem(dados) {
  ordem.value = dados;
  Object.assign(form, {
    cliente: dados.cliente,
    paciente: dados.paciente || '',
    dataEntrada: (dados.dataEntrada || '').slice(0, 16),
    dataEntrega: (dados.dataEntrega || '').slice(0, 16),
    enviarProva: dados.enviarProva,
    provaRealizada: dados.provaRealizada,
    observacao: dados.observacao || '',
    itens: dados.itens.map((i) => ({ ...i, detalhamento: i.detalhamento || '' })),
  });
  clientesFiltrados.value = opcoesCliente.value;
}

async function carregar() {
  carregando.value = true;
  try {
    const { data } = await api.get(`/ordens-servico/${route.params.id}`);
    aplicarOrdem(data);
  } catch (err) {
    if (err.response?.status !== 404) notificarErro('Não foi possível carregar a ordem.', err);
  } finally {
    carregando.value = false;
    nextTick(() => formRef.value?.resetValidation());
  }
}

function payload() {
  return {
    cliente: form.cliente,
    paciente: form.paciente,
    dataEntrada: form.dataEntrada,
    dataEntrega: form.dataEntrega,
    enviarProva: form.enviarProva,
    provaRealizada: form.enviarProva && form.provaRealizada,
    observacao: form.observacao,
    itens: form.itens.map((i) => ({
      servico: i.servico,
      responsavel: i.responsavel,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      detalhamento: i.detalhamento,
    })),
  };
}

// Salva e devolve a ordem atualizada (ou null se deu erro/validação).
async function salvar({ silencioso = false } = {}) {
  tentouSalvar.value = true;
  if (!form.itens.length) {
    $q.notify({ type: 'warning', message: 'Inclua pelo menos um serviço.' });
    return null;
  }
  salvando.value = true;
  try {
    const { data } = ordem.value
      ? await api.put(`/ordens-servico/${ordem.value.id}`, payload())
      : await api.post('/ordens-servico', payload());
    const eraNova = !ordem.value;
    aplicarOrdem(data);
    if (!silencioso) {
      // Botão "Salvar": grava, fecha a tela e volta para a listagem.
      $q.notify({ type: 'positive', message: eraNova ? `OS nº ${data.numero} criada.` : `OS nº ${data.numero} salva.` });
      router.push({ name: 'ordens-servico' });
      return data;
    }
    // Salvamento automático do "Concluir" (só em edição): grava alterações
    // pendentes e continua na tela para abrir o diálogo de pagamento.
    return data;
  } catch (err) {
    notificarErro('Não foi possível salvar a ordem.', err);
    return null;
  } finally {
    salvando.value = false;
  }
}

// --- Concluir / reabrir / cancelar ---------------------------------------
async function concluirOrdem() {
  let atual = ordem.value;
  if (!somenteLeitura.value) {
    if (!(await formRef.value.validate())) return;
    concluindo.value = true;
    atual = await salvar({ silencioso: true });
    concluindo.value = false;
    if (!atual) return;
  }
  $q.dialog({
    component: ConcluirOrdemDialog,
    componentProps: { ordem: atual, meiosPagamento: opcoes.value.meiosPagamento },
  }).onOk((concluida) => aplicarOrdem(concluida));
}

// Imprimir: abre a folha (A4, com logo) em outra aba. Numa OS aberta que o
// usuário pode editar, grava antes o que estiver na tela, pra impressão sair
// igual. A aba é aberta ANTES do "await" (senão o navegador bloqueia o pop-up).
const imprimindo = ref(false);
async function imprimirOrdem() {
  const url = router.resolve({ name: 'ordem-imprimir', params: { id: ordem.value.id } }).href;
  if (somenteLeitura.value) {
    window.open(url, '_blank');
    return;
  }
  if (!(await formRef.value.validate())) return;
  const aba = window.open('', '_blank');
  imprimindo.value = true;
  const salva = await salvar({ silencioso: true });
  imprimindo.value = false;
  if (!salva) {
    aba?.close();
    return;
  }
  if (aba) aba.location.href = url;
  else window.open(url, '_blank');
}

function reabrirOrdem() {
  $q.dialog({
    title: `Reabrir OS nº ${ordem.value.numero}`,
    message:
      ordem.value.formaPagamento === 'V'
        ? 'O lançamento de entrada no caixa desta ordem será cancelado.'
        : ordem.value.formaPagamento === 'P'
          ? 'As parcelas de contas a receber desta ordem serão canceladas.'
          : 'A ordem voltará a ficar aberta.',
    cancel: { label: 'Voltar', flat: true, noCaps: true },
    ok: { label: 'Reabrir', color: 'orange-9', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      const { data } = await api.post(`/ordens-servico/${ordem.value.id}/reabrir`);
      aplicarOrdem(data);
      $q.notify({ type: 'positive', message: 'Ordem reaberta.' });
    } catch (err) {
      notificarErro('Não foi possível reabrir a ordem.', err);
    }
  });
}

function cancelarOrdem() {
  $q.dialog({
    title: `Cancelar OS nº ${ordem.value.numero}`,
    message: 'A ordem ficará cancelada e não poderá mais ser alterada.',
    cancel: { label: 'Voltar', flat: true, noCaps: true },
    ok: { label: 'Cancelar OS', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(async () => {
    try {
      const { data } = await api.post(`/ordens-servico/${ordem.value.id}/cancelar`);
      aplicarOrdem(data);
      $q.notify({ type: 'positive', message: 'Ordem cancelada.' });
    } catch (err) {
      notificarErro('Não foi possível cancelar a ordem.', err);
    }
  });
}

function notificarErro(mensagemPadrao, err) {
  console.error(err);
  $q.notify({ type: 'negative', message: err.response?.data?.erro || mensagemPadrao });
}

onMounted(async () => {
  await carregarOpcoes();
  if (modoEdicao.value) await carregar();
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
.itens-vazio {
  border: 1px dashed var(--app-borda-forte);
  border-radius: 8px;
}
.itens .detalhe {
  white-space: pre-wrap;
  max-width: 360px;
}
.itens tbody tr:hover {
  background: var(--app-superficie-suave);
}
.footer-actions {
  border-top: 1px solid var(--app-borda);
}
</style>
