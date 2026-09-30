<template>
  <!-- Gráfico de colunas de UMA série (SVG puro, sem biblioteca).
       Uma cor só (a série), colunas finas com topo arredondado, grade
       discreta, valor escrito só na última coluna e tooltip ao passar o
       mouse/tocar. Alternativa em tabela pelo botão (acessibilidade). -->
  <div class="grafico-colunas" ref="raiz">
    <div class="row justify-end q-mb-xs">
      <q-btn-toggle
        v-model="modo"
        dense
        flat
        no-caps
        size="sm"
        toggle-color="grey-9"
        color="grey-6"
        :options="[
          { label: 'Gráfico', value: 'grafico' },
          { label: 'Tabela', value: 'tabela' },
        ]"
      />
    </div>

    <div v-if="modo === 'grafico'" class="area" @mouseleave="ativo = null">
      <svg :viewBox="`0 0 ${L} ${A}`" class="svg" role="img" :aria-label="descricao">
        <!-- Grade + eixo Y -->
        <g v-for="t in ticks" :key="t.valor">
          <line :x1="M.esq" :x2="L - M.dir" :y1="t.y" :y2="t.y" class="grade" :class="{ base: t.valor === 0 }" />
          <text :x="M.esq - 8" :y="t.y" class="eixo" text-anchor="end" dominant-baseline="middle">{{ formatarEixo(t.valor) }}</text>
        </g>
        <!-- Colunas -->
        <g v-for="(d, i) in pontos" :key="d.rotulo">
          <!-- alvo de hover = a faixa inteira (maior que a coluna) -->
          <rect
            :x="d.faixaX"
            :y="M.topo"
            :width="d.faixaL"
            :height="alturaUtil"
            class="alvo"
            @mouseenter="ativo = i"
            @click="ativo = i"
          />
          <path v-if="d.h > 0" :d="d.caminho" class="coluna" :class="{ esmaecida: ativo !== null && ativo !== i }" />
          <text :x="d.cx" :y="A - M.base + 16" class="eixo" text-anchor="middle">{{ d.rotulo }}</text>
          <!-- valor só na última coluna (ou na que está em foco) -->
          <text
            v-if="i === pontos.length - 1 && ativo === null"
            :x="d.cx"
            :y="d.topoY - 6"
            class="valor"
            text-anchor="middle"
          >
            {{ formatar(d.valor) }}
          </text>
        </g>
      </svg>
      <div v-if="ativo !== null" class="tooltip" :style="estiloTooltip">
        <div class="tt-titulo">{{ pontos[ativo].rotuloCompleto || pontos[ativo].rotulo }}</div>
        <div class="tt-valor">{{ formatar(pontos[ativo].valor) }}</div>
        <div v-if="pontos[ativo].detalhe" class="tt-detalhe">{{ pontos[ativo].detalhe }}</div>
      </div>
    </div>

    <q-markup-table v-else flat dense class="tabela">
      <thead>
        <tr>
          <th class="text-left">{{ rotuloCategoria }}</th>
          <th class="text-right">{{ rotuloValor }}</th>
          <th v-if="dados.some((d) => d.detalhe)" class="text-right"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in dados" :key="d.rotulo">
          <td>{{ d.rotuloCompleto || d.rotulo }}</td>
          <td class="text-right">{{ formatar(d.valor) }}</td>
          <td v-if="dados.some((x) => x.detalhe)" class="text-right text-grey-7">{{ d.detalhe }}</td>
        </tr>
      </tbody>
    </q-markup-table>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  // [{ rotulo, valor, rotuloCompleto?, detalhe? }]
  dados: { type: Array, required: true },
  formatar: { type: Function, default: (v) => String(v) },
  formatarEixo: { type: Function, default: (v) => String(v) },
  descricao: { type: String, default: 'Gráfico de colunas' },
  rotuloCategoria: { type: String, default: 'Período' },
  rotuloValor: { type: String, default: 'Valor' },
});

const modo = ref('grafico');
const ativo = ref(null);

// Geometria (viewBox fixo, o SVG escala com a largura do card).
// Em tela estreita o viewBox é menor, então o texto sai proporcionalmente maior.
const estreito = typeof window !== 'undefined' && window.innerWidth < 600;
const L = estreito ? 400 : 640;
const A = estreito ? 220 : 240;
const M = { esq: estreito ? 58 : 64, dir: 12, topo: 24, base: 28 };
const LARGURA_COLUNA = 24; // colunas finas: sobra "ar" na faixa
const alturaUtil = A - M.topo - M.base;

// Escala "redonda" pro eixo Y.
const maximo = computed(() => {
  const m = Math.max(0, ...props.dados.map((d) => d.valor));
  if (m <= 0) return 1;
  const pot = 10 ** Math.floor(Math.log10(m));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => (m / p) <= 4) || 10 * pot;
  return Math.ceil(m / passo) * passo;
});

const ticks = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((f) => ({ valor: maximo.value * f, y: M.topo + alturaUtil * (1 - f) }))
);

const pontos = computed(() => {
  const n = props.dados.length || 1;
  const faixaL = (L - M.esq - M.dir) / n;
  const base = A - M.base;
  return props.dados.map((d, i) => {
    const faixaX = M.esq + faixaL * i;
    const cx = faixaX + faixaL / 2;
    const h = Math.max(0, (d.valor / maximo.value) * alturaUtil);
    const w = Math.min(LARGURA_COLUNA, faixaL * 0.6);
    const r = Math.min(4, h, w / 2); // topo arredondado 4px, base reta
    const x = cx - w / 2;
    const topoY = base - h;
    const caminho = `M${x},${base} L${x},${topoY + r} Q${x},${topoY} ${x + r},${topoY} L${x + w - r},${topoY} Q${x + w},${topoY} ${x + w},${topoY + r} L${x + w},${base} Z`;
    return { ...d, faixaX, faixaL, cx, h, topoY, caminho };
  });
});

// Tooltip posicionado em % da largura (o SVG escala).
const estiloTooltip = computed(() => {
  const p = pontos.value[ativo.value];
  const esquerda = (p.cx / L) * 100;
  const topo = (Math.min(p.topoY, A - M.base - 10) / A) * 100;
  return {
    left: `${esquerda}%`,
    top: `${topo}%`,
    transform: esquerda > 75 ? 'translate(-100%, -110%)' : esquerda < 25 ? 'translate(0, -110%)' : 'translate(-50%, -110%)',
  };
});
</script>

<style scoped>
/* Cor da série: azul da paleta de referência, validado contra o fundo
   claro (#fff) e o escuro (#1e2228) do sistema. */
.area {
  position: relative;
}
.svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.grade {
  stroke: var(--app-borda);
  stroke-width: 1;
}
.grade.base {
  stroke: var(--app-borda-forte);
}
.eixo {
  font-size: 11px;
  fill: var(--app-texto-apagado);
}
.valor {
  font-size: 12px;
  font-weight: 600;
  fill: var(--app-texto);
}
.coluna {
  fill: var(--serie-1);
  transition: opacity 0.15s;
  pointer-events: none; /* o hover é da faixa inteira (.alvo), por baixo */
}
.valor,
.eixo {
  pointer-events: none;
}
.coluna.esmaecida {
  opacity: 0.35;
}
.alvo {
  fill: transparent;
  cursor: pointer;
}
.tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--app-superficie);
  border: 1px solid var(--app-borda-forte);
  border-radius: 8px;
  padding: 6px 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
  z-index: 2;
}
.tt-titulo {
  font-size: 11px;
  color: var(--app-texto-suave);
}
.tt-valor {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-texto);
}
.tt-detalhe {
  font-size: 11px;
  color: var(--app-texto-suave);
}
</style>

<style>
/* Cor da série (não-scoped: precisa enxergar o body--dark do Quasar).
   Azul da paleta de referência, validado contra o fundo claro (#fff) e o
   escuro (#1e2228) do sistema. */
.grafico-colunas {
  --serie-1: #2a78d6;
}
body.body--dark .grafico-colunas {
  --serie-1: #3987e5;
}
</style>
