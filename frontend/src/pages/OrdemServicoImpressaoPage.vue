<template>
  <div class="impressao-tela">
    <!-- Barra só na tela (some na impressão) -->
    <div class="barra no-print row items-center q-gutter-sm">
      <div class="text-subtitle1 text-weight-bold">Impressão da OS{{ dados ? ` nº ${dados.ordem.numero}` : '' }}</div>
      <q-space />
      <q-btn unelevated no-caps color="primary" text-color="dark" icon="print" label="Imprimir" :disable="!dados" @click="imprimir" />
      <q-btn outline no-caps color="grey-8" icon="close" label="Fechar" @click="fechar" />
    </div>

    <div v-if="carregando" class="row justify-center q-pa-xl no-print"><q-spinner color="primary" size="42px" /></div>
    <div v-else-if="erro" class="text-center q-pa-xl text-grey-8 no-print">{{ erro }}</div>

    <!-- Folha A4 -->
    <div v-else-if="dados" class="folha">
      <!-- Cabeçalho: logo + dados da empresa + nº da OS -->
      <header class="cabecalho">
        <div class="logo-area">
          <img v-if="empresa.logo" :src="empresa.logo" alt="Logo" class="logo" @load="logoCarregou" @error="logoCarregou" />
        </div>
        <div class="empresa">
          <div class="empresa-nome">{{ empresa.nomeFantasia || empresa.razaoSocial }}</div>
          <div v-if="empresa.nomeFantasia" class="empresa-linha">{{ empresa.razaoSocial }}</div>
          <div class="empresa-linha">
            {{ empresa.tipoPessoa === 'F' ? 'CPF' : 'CNPJ' }} {{ formatarCnpjCpf(empresa.cnpjCpf) }}
            <template v-if="empresa.inscricaoEstadual"> · IE {{ empresa.inscricaoEstadual }}</template>
          </div>
          <div v-if="enderecoEmpresa" class="empresa-linha">{{ enderecoEmpresa }}</div>
          <div v-if="contatoEmpresa" class="empresa-linha">{{ contatoEmpresa }}</div>
          <div v-if="empresa.responsavelTecnico" class="empresa-linha">
            Resp. técnico: {{ empresa.responsavelTecnico }}
            <template v-if="empresa.croResponsavel"> · {{ empresa.croResponsavel }}{{ empresa.croUf ? `/${empresa.croUf}` : '' }}</template>
          </div>
        </div>
        <div class="numero-box">
          <div class="numero-titulo">ORDEM DE SERVIÇO</div>
          <div class="numero">Nº {{ ordem.numero }}</div>
          <div class="situacao">{{ SITUACOES[ordem.situacao] }}</div>
        </div>
      </header>

      <!-- Cliente / paciente / datas -->
      <section class="bloco grade">
        <div class="campo largo">
          <div class="rotulo">Cliente</div>
          <div class="valor">{{ cliente.nome }}</div>
          <div class="sub">
            <template v-if="cliente.registroProfissional">{{ cliente.registroProfissional }}</template>
            <template v-if="cliente.registroProfissional && cliente.cnpjCpf"> · </template>
            <template v-if="cliente.cnpjCpf">{{ cliente.tipoPessoa === 'J' ? 'CNPJ' : 'CPF' }} {{ formatarCnpjCpf(cliente.cnpjCpf) }}</template>
          </div>
          <div v-if="contatoCliente" class="sub">{{ contatoCliente }}</div>
        </div>
        <div class="campo largo">
          <div class="rotulo">Paciente</div>
          <div class="valor">{{ ordem.paciente || '—' }}</div>
        </div>
        <div class="campo">
          <div class="rotulo">Entrada</div>
          <div class="valor">{{ formatarDataHora(ordem.dataEntrada) }}</div>
        </div>
        <div class="campo">
          <div class="rotulo">Entrega</div>
          <div class="valor">{{ ordem.dataEntrega ? formatarDataHora(ordem.dataEntrega) : '—' }}</div>
        </div>
        <div class="campo">
          <div class="rotulo">Prova</div>
          <div class="valor">
            <template v-if="!ordem.enviarProva">Não</template>
            <template v-else>Sim — {{ ordem.provaRealizada ? 'realizada' : 'pendente' }}</template>
          </div>
        </div>
      </section>

      <!-- Serviços -->
      <section class="bloco">
        <table class="itens">
          <thead>
            <tr>
              <th class="col-seq">#</th>
              <th>Serviço / detalhamento</th>
              <th class="col-resp">Responsável</th>
              <th class="col-num">Qtd</th>
              <th class="col-valor">Unitário</th>
              <th class="col-valor">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in ordem.itens" :key="item.id">
              <td class="col-seq">{{ i + 1 }}</td>
              <td>
                <div class="item-desc">{{ item.descricao }}</div>
                <div v-if="item.detalhamento" class="item-detalhe">{{ item.detalhamento }}</div>
              </td>
              <td class="col-resp">{{ item.responsavelNome }}</td>
              <td class="col-num">{{ item.quantidade }}</td>
              <td class="col-valor">{{ formatarMoeda(item.valorUnitario) }}</td>
              <td class="col-valor">{{ formatarMoeda(item.valorTotal) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" class="total-rotulo">TOTAL</td>
              <td class="col-valor total-valor">{{ formatarMoeda(ordem.valorTotal) }}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- Observações -->
      <section v-if="ordem.observacao" class="bloco">
        <div class="rotulo">Observações</div>
        <div class="observacao">{{ ordem.observacao }}</div>
      </section>

      <!-- Pagamento (OS concluída) -->
      <section v-if="ordem.situacao === 'C' && ordem.formaPagamento" class="bloco">
        <div class="rotulo">Pagamento</div>
        <div v-if="ordem.formaPagamento === 'V'" class="valor-pequeno">
          À vista<template v-for="c in ordem.caixa" :key="c.id"> — {{ nomeMeio(c.meioPagamento) }}: {{ formatarMoeda(c.valor) }}</template>
        </div>
        <table v-else class="parcelas">
          <tr v-for="p in ordem.contasReceber" :key="p.id">
            <td>Parcela {{ p.parcela }}/{{ p.totalParcelas }}</td>
            <td>venc. {{ formatarData(p.vencimento) }}</td>
            <td class="col-valor">{{ formatarMoeda(p.valor) }}</td>
          </tr>
        </table>
      </section>

      <!-- Assinaturas -->
      <section class="assinaturas">
        <div class="assinatura">
          <div class="linha"></div>
          <div>Recebido por (cliente)</div>
        </div>
        <div class="assinatura">
          <div class="linha"></div>
          <div>{{ empresa.nomeFantasia || empresa.razaoSocial }}</div>
        </div>
      </section>

      <footer class="rodape">
        Emitido em {{ emitidoEm }} por {{ dados.emitidoPor }}
        <template v-if="ordem.situacao === 'C'"> · Concluída em {{ formatarDataHora(ordem.dataConclusao) }}</template>
      </footer>
    </div>
  </div>
</template>

<script setup>
// Folha de impressão da OS (A4), com logo e dados da empresa da sessão.
// Abre em outra aba (botão "Imprimir" da OS) e já chama a impressão do
// navegador quando os dados e a logo terminam de carregar. Fica fora do
// layout do sistema (meta.impressao no router, ver App.vue).
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { formatarMoeda } from '../utils/moeda';
import { agora, formatarData, formatarDataHora } from '../utils/data';
import { formatarCep, formatarCnpjCpf, formatarTelefone } from '../utils/documento';
import { nomeMeio } from '../utils/pagamento';

const SITUACOES = { A: 'Aberta', C: 'Concluída', X: 'Cancelada' };

const route = useRoute();
const dados = ref(null);
const carregando = ref(true);
const erro = ref('');
const emitidoEm = formatarDataHora(agora());

const ordem = computed(() => dados.value?.ordem || {});
const empresa = computed(() => dados.value?.empresa || {});
const cliente = computed(() => dados.value?.cliente || {});

function juntar(partes, sep = ', ') {
  return partes.filter(Boolean).join(sep);
}

const enderecoEmpresa = computed(() => {
  const e = empresa.value;
  const rua = juntar([e.rua, e.numero, e.complemento]);
  const cidade = e.cidadeNome ? `${e.cidadeNome}/${e.uf}` : e.uf;
  return juntar([rua, e.bairro, cidade, e.cep ? `CEP ${formatarCep(e.cep)}` : null], ' · ');
});
const contatoEmpresa = computed(() => {
  const e = empresa.value;
  return juntar([
    e.telefone && `Tel. ${formatarTelefone(e.telefone)}`,
    e.celular && `WhatsApp ${formatarTelefone(e.celular)}`,
    e.email,
    e.site,
  ], ' · ');
});
const contatoCliente = computed(() => {
  const c = cliente.value;
  return juntar([
    c.celular && formatarTelefone(c.celular),
    c.telefone && formatarTelefone(c.telefone),
    c.email,
  ], ' · ');
});

// Só imprime depois da logo carregar (senão sai sem a imagem).
let logoPronta = false;
let dadosProntos = false;
let jaImprimiu = false;
function tentarImprimirAutomatico() {
  if (jaImprimiu || !dadosProntos || !logoPronta || route.query.auto === '0') return;
  jaImprimiu = true;
  setTimeout(() => window.print(), 300);
}
function logoCarregou() {
  logoPronta = true;
  tentarImprimirAutomatico();
}

function imprimir() {
  window.print();
}

function fechar() {
  window.close();
  // Se a aba não foi aberta por script, o navegador não deixa fechar: volta pra OS.
  setTimeout(() => {
    window.location.assign(`/ordens-servico/${route.params.id}`);
  }, 200);
}

onMounted(async () => {
  try {
    const { data } = await api.get(`/ordens-servico/${route.params.id}/impressao`);
    dados.value = data;
    document.title = `OS ${data.ordem.numero} - ${data.empresa.nomeFantasia || data.empresa.razaoSocial}`;
    dadosProntos = true;
    if (!data.empresa.logo) logoPronta = true;
    tentarImprimirAutomatico();
  } catch (err) {
    erro.value = err.response?.data?.erro || 'Não foi possível carregar a ordem para impressão.';
  } finally {
    carregando.value = false;
  }
});
</script>

<style scoped>
/* A folha é sempre "papel branco", mesmo com o tema escuro ligado. */
.impressao-tela {
  min-height: 100vh;
  background: #e9ecef;
  color: #111;
  padding-bottom: 24px;
}
.barra {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #ddd;
  padding: 10px 16px;
  color: #111;
}
.folha {
  width: 210mm;
  min-height: 297mm;
  margin: 16px auto;
  padding: 12mm 12mm 10mm;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  color: #111;
  display: flex;
  flex-direction: column;
}

.cabecalho {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #333;
}
.logo-area {
  width: 34mm;
  min-width: 34mm;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo {
  max-width: 34mm;
  max-height: 24mm;
  object-fit: contain;
}
.empresa {
  flex: 1;
  line-height: 1.35;
}
.empresa-nome {
  font-size: 14pt;
  font-weight: 700;
}
.empresa-linha {
  font-size: 8.5pt;
  color: #333;
}
.numero-box {
  text-align: center;
  border: 1.5px solid #333;
  border-radius: 6px;
  padding: 6px 10px;
  min-width: 38mm;
}
.numero-titulo {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.numero {
  font-size: 18pt;
  font-weight: 700;
  line-height: 1.1;
}
.situacao {
  font-size: 8pt;
  text-transform: uppercase;
  color: #444;
}

.bloco {
  margin-top: 10px;
}
.grade {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px 12px;
  border: 1px solid #bbb;
  border-radius: 4px;
  padding: 8px 10px;
}
.campo {
  grid-column: span 2;
}
.campo.largo {
  grid-column: span 3;
}
.rotulo {
  font-size: 7.5pt;
  font-weight: 700;
  text-transform: uppercase;
  color: #555;
}
.valor {
  font-size: 11pt;
  font-weight: 600;
}
.valor-pequeno {
  font-size: 10pt;
}
.sub {
  font-size: 8.5pt;
  color: #333;
}

table.itens {
  width: 100%;
  border-collapse: collapse;
}
.itens th {
  font-size: 8pt;
  text-transform: uppercase;
  text-align: left;
  background: #f0f0f0;
  border: 1px solid #bbb;
  padding: 4px 6px;
}
.itens td {
  border: 1px solid #bbb;
  padding: 5px 6px;
  vertical-align: top;
}
.itens tr {
  page-break-inside: avoid;
}
.col-seq {
  width: 8mm;
  text-align: center !important;
}
.col-resp {
  width: 35mm;
}
.col-num {
  width: 12mm;
  text-align: right !important;
}
.col-valor {
  width: 26mm;
  text-align: right !important;
  white-space: nowrap;
}
.item-desc {
  font-weight: 600;
}
.item-detalhe {
  font-size: 9pt;
  color: #333;
  white-space: pre-wrap;
}
.total-rotulo {
  text-align: right;
  font-weight: 700;
}
.total-valor {
  font-weight: 700;
  font-size: 11.5pt;
}
.observacao {
  border: 1px solid #bbb;
  border-radius: 4px;
  padding: 6px 8px;
  white-space: pre-wrap;
  min-height: 12mm;
}
table.parcelas td {
  padding: 1px 12px 1px 0;
  font-size: 9.5pt;
}

.assinaturas {
  margin-top: auto;
  padding-top: 22mm;
  display: flex;
  gap: 16mm;
}
.assinatura {
  flex: 1;
  text-align: center;
  font-size: 8.5pt;
}
.assinatura .linha {
  border-top: 1px solid #333;
  margin-bottom: 3px;
}
.rodape {
  margin-top: 8mm;
  font-size: 7.5pt;
  color: #666;
  text-align: right;
}

@media print {
  .no-print {
    display: none !important;
  }
  .impressao-tela {
    background: #fff;
    padding: 0;
    min-height: 0;
  }
  .folha {
    width: auto;
    min-height: 262mm; /* A4 menos as margens do @page, com folga (evita 2ª página em branco) */
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
}
</style>

<style>
/* Global (não-scoped): margens da página impressa. */
@page {
  size: A4;
  margin: 12mm;
}
@media print {
  html,
  body {
    background: #fff !important;
    height: auto !important;
    min-height: 0 !important;
  }
  /* O layout do Quasar ocupa 100vh na tela — na impressão isso vira uma
     página extra em branco. */
  .q-layout,
  .q-page-container {
    min-height: 0 !important;
    padding: 0 !important;
  }
}
</style>
