<template>
  <q-page class="q-pa-lg">
    <div class="row items-end justify-between q-mb-lg">
      <div>
        <div class="text-h5">{{ saudacao }}, {{ primeiroNome }}</div>
        <div class="text-caption text-grey-7">{{ hojeExtenso }}<template v-if="auth.empresa.value"> · {{ auth.empresa.value.nome }}</template></div>
      </div>
      <div v-if="auth.empresa.value" class="row q-gutter-sm">
        <q-btn v-if="auth.pode('ordens-servico', 'incluir')" unelevated no-caps color="primary" text-color="dark" icon="add" label="Nova OS" :to="{ name: 'ordem-nova' }" />
        <q-btn flat round dense color="grey-7" icon="refresh" :loading="carregandoPainel" @click="carregarPainel">
          <q-tooltip>Atualizar</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Sem empresa na sessão: nada de lançamento funciona até escolher/
         cadastrar uma (as rotas "por empresa" do backend devolvem 409). -->
    <q-banner v-if="!auth.empresa.value" rounded class="bg-blue-1 text-blue-9 q-mb-lg">
      <template #avatar><q-icon name="o_info" color="primary" /></template>
      <template v-if="carregandoEmpresas">Carregando…</template>
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
        <q-btn v-for="e in minhasEmpresas" :key="e.id" outline no-caps color="blue-9" :label="e.nome" icon="o_apartment" @click="selecionar(e)" />
        <q-btn
          v-if="!carregandoEmpresas && !minhasEmpresas.length && auth.pode('empresas', 'incluir')"
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

    <template v-else>
      <div v-if="carregandoPainel && !painel" class="row justify-center q-pa-xl"><q-spinner color="primary" size="42px" /></div>

      <template v-else-if="painel">
        <!-- ===== Números do dia (ordens) ===== -->
        <div v-if="o" class="row q-col-gutter-md q-mb-md">
          <div v-for="k in kpisOrdens" :key="k.rotulo" class="col-6 col-md-3">
            <router-link :to="k.to" class="kpi-link">
              <q-card flat bordered class="kpi q-pa-md" :class="k.alerta ? `kpi--${k.alerta}` : ''">
                <div class="row items-center no-wrap">
                  <div class="col">
                    <div class="kpi-rotulo">{{ k.rotulo }}</div>
                    <div class="kpi-valor">{{ k.valor }}</div>
                    <div class="kpi-sub">{{ k.sub }}</div>
                  </div>
                  <q-icon :name="k.icone" size="30px" class="kpi-icone" />
                </div>
              </q-card>
            </router-link>
          </div>
        </div>

        <!-- ===== Financeiro ===== -->
        <div v-if="kpisFinanceiro.length" class="row q-col-gutter-md q-mb-lg">
          <div v-for="k in kpisFinanceiro" :key="k.rotulo" class="col-6 col-md-3">
            <router-link :to="k.to" class="kpi-link">
              <q-card flat bordered class="kpi q-pa-md" :class="k.alerta ? `kpi--${k.alerta}` : ''">
                <div class="kpi-rotulo">
                  <q-icon :name="k.icone" size="16px" class="q-mr-xs" />{{ k.rotulo }}
                </div>
                <div class="kpi-valor kpi-valor--moeda">{{ formatarMoeda(k.valor) }}</div>
                <div class="kpi-sub">{{ k.sub }}</div>
              </q-card>
            </router-link>
          </div>
        </div>

        <div class="row q-col-gutter-lg">
          <!-- Faturamento -->
          <div v-if="o" class="col-12 col-lg-7">
            <q-card flat bordered class="q-pa-md full-height">
              <div class="row items-start justify-between">
                <div>
                  <div class="text-subtitle1 text-weight-bold">Faturamento</div>
                  <div class="text-caption text-grey-7">Valor das OS concluídas por mês · últimos 6 meses</div>
                </div>
                <div class="text-right">
                  <div class="text-caption text-grey-7">Este mês</div>
                  <div class="text-h6 text-weight-bold">{{ formatarMoeda(faturamentoMesAtual) }}</div>
                  <div v-if="variacaoMes !== null" class="text-caption" :class="variacaoMes >= 0 ? 'text-positive' : 'text-negative'">
                    <q-icon :name="variacaoMes >= 0 ? 'arrow_upward' : 'arrow_downward'" size="12px" />
                    {{ Math.abs(variacaoMes).toFixed(0) }}% vs mês anterior
                  </div>
                </div>
              </div>
              <grafico-colunas
                class="q-mt-sm"
                :dados="dadosFaturamento"
                :formatar="formatarMoeda"
                :formatar-eixo="formatarMoedaCurta"
                descricao="Faturamento por mês"
                rotulo-categoria="Mês"
                rotulo-valor="Faturamento"
              />
            </q-card>
          </div>

          <!-- Serviços do mês -->
          <div v-if="o" class="col-12 col-lg-5">
            <q-card flat bordered class="q-pa-md full-height">
              <div class="text-subtitle1 text-weight-bold">Serviços mais feitos no mês</div>
              <div class="text-caption text-grey-7 q-mb-md">Quantidade nas OS com entrada neste mês</div>
              <div v-if="!o.servicosMes.length" class="vazio">Nenhum serviço lançado neste mês.</div>
              <div v-for="s in o.servicosMes" :key="s.descricao" class="q-mb-md">
                <div class="row justify-between text-body2">
                  <span class="ellipsis q-pr-sm">{{ s.descricao }}</span>
                  <span class="text-weight-bold">{{ s.qtd }}</span>
                </div>
                <div class="medidor"><div class="medidor-barra" :style="{ width: `${(s.qtd / maxServicos) * 100}%` }" /></div>
                <div class="text-caption text-grey-7">{{ formatarMoeda(s.valor) }}</div>
              </div>
            </q-card>
          </div>

          <!-- Próximas entregas -->
          <div v-if="o" class="col-12 col-lg-7">
            <q-card flat bordered class="q-pa-md full-height">
              <div class="row items-center justify-between q-mb-sm">
                <div>
                  <div class="text-subtitle1 text-weight-bold">Próximas entregas</div>
                  <div class="text-caption text-grey-7">OS abertas com data de entrega, atrasadas primeiro</div>
                </div>
                <q-btn flat dense no-caps color="grey-8" label="Ver ordens" icon-right="chevron_right" :to="{ name: 'ordens-servico' }" />
              </div>
              <div v-if="!o.proximasEntregas.length" class="vazio">Nenhuma OS aberta com entrega marcada.</div>
              <q-list v-else separator>
                <q-item v-for="e in o.proximasEntregas" :key="e.id" clickable :to="{ name: 'ordem-editar', params: { id: e.id } }" class="q-px-sm">
                  <q-item-section avatar class="entrega-data" :class="{ atrasada: jaPassou(e.dataEntrega), hoje: ehHoje(e.dataEntrega) }">
                    <div class="entrega-dia">{{ diaMes(e.dataEntrega) }}</div>
                    <div class="entrega-hora">{{ hora(e.dataEntrega) }}</div>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>
                      <b>OS {{ e.numero }}</b> · {{ e.cliente }}
                    </q-item-label>
                    <q-item-label caption>
                      {{ e.paciente || 'Sem paciente informado' }}
                      <span v-if="e.provaPendente" class="text-orange-9"> · <q-icon name="o_pending" size="13px" /> aguardando prova</span>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge v-if="jaPassou(e.dataEntrega)" color="negative" label="Atrasada" />
                    <q-badge v-else-if="ehHoje(e.dataEntrega)" color="orange-8" label="Hoje" />
                    <span v-else class="text-caption text-grey-7">{{ formatarMoeda(e.valorTotal) }}</span>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Contas a receber: vencidas / vencendo -->
          <div v-if="r" class="col-12 col-lg-5">
            <q-card flat bordered class="q-pa-md full-height">
              <div class="row items-center justify-between q-mb-sm">
                <div>
                  <div class="text-subtitle1 text-weight-bold">Contas a receber</div>
                  <div class="text-caption text-grey-7">Vencidas e a vencer nos próximos 7 dias</div>
                </div>
                <q-btn flat dense no-caps color="grey-8" label="Ver todas" icon-right="chevron_right" :to="{ name: 'contas-receber' }" />
              </div>
              <div v-if="!r.contas.length" class="vazio">Nada vencido nem vencendo nos próximos 7 dias.</div>
              <q-list v-else separator>
                <q-item v-for="c in r.contas" :key="c.id" class="q-px-sm">
                  <q-item-section>
                    <q-item-label>{{ c.cliente }}</q-item-label>
                    <q-item-label caption>
                      <template v-if="c.ordemNumero">OS {{ c.ordemNumero }} · </template>parc. {{ c.parcela }}/{{ c.totalParcelas }} · venc. {{ formatarData(c.vencimento) }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side class="text-right">
                    <div class="text-weight-bold text-body2">{{ formatarMoeda(c.saldo) }}</div>
                    <q-badge v-if="c.vencimento < hoje()" color="negative" label="Vencida" />
                    <q-badge v-else-if="c.vencimento === hoje()" color="orange-8" label="Vence hoje" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>
        </div>

        <div v-if="!o && !r && !kpisFinanceiro.length" class="text-center text-grey-7 q-pa-xl">
          Você ainda não tem acesso a nenhum dos módulos resumidos aqui (Ordens de Serviço, Caixa, Contas a Receber).
        </div>
      </template>
    </template>
  </q-page>
</template>

<script setup>
// Painel inicial: resumo da EMPRESA DA SESSÃO (GET /api/painel). Cada bloco
// só vem do backend se o usuário tiver acesso à tela de origem.
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import api from '../services/api';
import { auth } from '../stores/auth';
import { formatarMoeda } from '../utils/moeda';
import { formatarData, hoje, jaPassou } from '../utils/data';
import GraficoColunas from '../components/GraficoColunas.vue';

const $q = useQuasar();

const primeiroNome = computed(() => (auth.state.usuario?.nome || '').split(' ')[0]);
const saudacao = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
});
const hojeExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

// --- Sem empresa: escolher/cadastrar ---------------------------------------
const minhasEmpresas = ref([]);
const carregandoEmpresas = ref(true);

async function selecionar(empresa) {
  try {
    await auth.trocarEmpresa(empresa.id);
  } catch (err) {
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível selecionar a empresa.' });
  }
}

// --- Painel ----------------------------------------------------------------
const painel = ref(null);
const carregandoPainel = ref(false);
const o = computed(() => painel.value?.ordens);
const c = computed(() => painel.value?.caixa);
const r = computed(() => painel.value?.receber);

async function carregarPainel() {
  carregandoPainel.value = true;
  try {
    const { data } = await api.get('/painel');
    painel.value = data;
  } catch (err) {
    console.error(err);
    $q.notify({ type: 'negative', message: err.response?.data?.erro || 'Não foi possível carregar o painel.' });
  } finally {
    carregandoPainel.value = false;
  }
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const kpisOrdens = computed(() => {
  if (!o.value) return [];
  const x = o.value;
  return [
    {
      rotulo: 'OS abertas',
      valor: x.abertas,
      sub: `${formatarMoeda(x.valorAberto)} em andamento`,
      icone: 'o_assignment',
      to: { name: 'ordens-servico' },
    },
    {
      rotulo: 'Atrasadas',
      valor: x.atrasadas,
      sub: x.atrasadas ? 'entrega vencida' : 'nenhuma atrasada',
      icone: x.atrasadas ? 'o_error' : 'o_check_circle',
      alerta: x.atrasadas ? 'critico' : null,
      to: { name: 'ordens-servico' },
    },
    {
      rotulo: 'Entregas hoje',
      valor: x.entregasHoje,
      sub: `${plural(x.entregasAmanha, 'entrega', 'entregas')} amanhã`,
      icone: 'o_event',
      alerta: x.entregasHoje ? 'atencao' : null,
      to: { name: 'ordens-servico' },
    },
    {
      rotulo: 'Aguardando prova',
      valor: x.aguardandoProva,
      sub: `${plural(x.concluidasMes, 'OS concluída', 'OS concluídas')} no mês`,
      icone: 'o_back_hand',
      to: { name: 'ordens-servico' },
    },
  ];
});

const kpisFinanceiro = computed(() => {
  const lista = [];
  if (c.value) {
    lista.push(
      { rotulo: 'Recebido hoje', valor: c.value.recebidoHoje, sub: 'entradas no caixa', icone: 'o_point_of_sale', to: { name: 'caixa' } },
      { rotulo: 'Recebido no mês', valor: c.value.recebidoMes, sub: 'à vista + recebimentos', icone: 'o_calendar_month', to: { name: 'caixa' } }
    );
  }
  if (r.value) {
    lista.push(
      {
        rotulo: 'A receber',
        valor: r.value.emAberto,
        sub: `${formatarMoeda(r.value.proximos7Dias)} nos próximos 7 dias`,
        icone: 'o_request_quote',
        to: { name: 'contas-receber' },
      },
      {
        rotulo: 'Vencido',
        valor: r.value.vencido,
        sub: r.value.qtdVencidas ? plural(r.value.qtdVencidas, 'parcela vencida', 'parcelas vencidas') : 'nada vencido',
        icone: r.value.vencido ? 'o_error' : 'o_check_circle',
        alerta: r.value.vencido ? 'critico' : null,
        to: { name: 'contas-receber' },
      }
    );
  }
  return lista;
});

// --- Faturamento -----------------------------------------------------------
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dadosFaturamento = computed(() =>
  (o.value?.faturamento || []).map((m) => {
    const [ano, mes] = m.mes.split('-');
    return {
      rotulo: m.rotulo,
      rotuloCompleto: `${NOMES_MES[Number(mes) - 1]} de ${ano}`,
      valor: m.valor,
      detalhe: plural(m.qtd, 'OS concluída', 'OS concluídas'),
    };
  })
);
const faturamentoMesAtual = computed(() => {
  const f = o.value?.faturamento || [];
  return f.length ? f[f.length - 1].valor : 0;
});
const variacaoMes = computed(() => {
  const f = o.value?.faturamento || [];
  if (f.length < 2 || !f[f.length - 2].valor) return null;
  return ((f[f.length - 1].valor - f[f.length - 2].valor) / f[f.length - 2].valor) * 100;
});

function formatarMoedaCurta(v) {
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(v)}`;
}

const maxServicos = computed(() => Math.max(1, ...(o.value?.servicosMes || []).map((s) => s.qtd)));

// --- Datas das entregas ----------------------------------------------------
const diaMes = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : '');
const hora = (v) => (v ? v.slice(11, 16) : '');
const ehHoje = (v) => !!v && v.slice(0, 10) === hoje();

onMounted(async () => {
  if (auth.empresa.value) {
    carregandoEmpresas.value = false;
    carregarPainel();
    return;
  }
  try {
    const { data } = await api.get('/auth/minhas-empresas');
    minhasEmpresas.value = data;
  } catch (err) {
    console.error(err);
  } finally {
    carregandoEmpresas.value = false;
  }
});
</script>

<style scoped>
.kpi-link {
  text-decoration: none;
  color: inherit;
  display: block;
  height: 100%;
}
.kpi {
  height: 100%;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kpi:hover {
  border-color: var(--app-borda-forte);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.kpi-rotulo {
  font-size: 0.8rem;
  color: var(--app-texto-suave);
  display: flex;
  align-items: center;
}
.kpi-valor {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--app-texto);
}
.kpi-valor--moeda {
  font-size: 1.45rem;
  margin: 4px 0 2px;
}
.kpi-sub {
  font-size: 0.75rem;
  color: var(--app-texto-apagado);
}
.kpi-icone {
  color: var(--app-texto-apagado);
  opacity: 0.7;
}
/* Estados: cor + ícone + texto (nunca só a cor). */
.kpi--critico {
  border-left: 4px solid #d32f2f;
}
.kpi--critico .kpi-icone,
.kpi--critico .kpi-rotulo {
  color: #c62828;
  opacity: 1;
}
.kpi--atencao {
  border-left: 4px solid #ef6c00;
}
.kpi--atencao .kpi-icone,
.kpi--atencao .kpi-rotulo {
  color: #e65100;
  opacity: 1;
}
.vazio {
  border: 1px dashed var(--app-borda-forte);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--app-texto-apagado);
}
/* Medidor dos serviços: trilho neutro + barra da série. */
.medidor {
  height: 8px;
  border-radius: 4px;
  background: var(--app-superficie-suave);
  margin: 4px 0 2px;
  overflow: hidden;
}
.medidor-barra {
  height: 100%;
  border-radius: 4px;
  background: var(--painel-serie);
}
.entrega-data {
  min-width: 58px;
  text-align: center;
  border-radius: 8px;
  padding: 4px 0;
  background: var(--app-superficie-suave);
  margin-right: 10px;
}
.entrega-data.atrasada {
  background: rgba(211, 47, 47, 0.12);
  color: #c62828;
}
.entrega-data.hoje {
  background: rgba(239, 108, 0, 0.14);
  color: #e65100;
}
.entrega-dia {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.1;
}
.entrega-hora {
  font-size: 0.72rem;
  opacity: 0.8;
}
</style>

<style>
/* Cor da série do medidor (não-scoped: precisa enxergar o body--dark). */
body {
  --painel-serie: #2a78d6;
}
body.body--dark {
  --painel-serie: #3987e5;
}
</style>
