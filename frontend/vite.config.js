import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';

// Configuração do Vite: plugin do Vue + plugin do Quasar (que injeta os
// componentes/estilos do Quasar automaticamente) e um proxy de
// desenvolvimento que redireciona /api para o backend Express, assim o
// frontend pode chamar `/api/auth/login` sem se preocupar com a porta
// do backend nem com CORS durante o `npm run dev`.
export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar({
      // Caminho absoluto: o plugin do Quasar apenas injeta este
      // @import antes do CSS interno dele, então um caminho relativo
      // (ex.: "src/css/...") não é resolvido corretamente pelo Sass
      // (ele tenta resolver relativo ao arquivo do Quasar, não à raiz
      // do projeto). Um caminho absoluto sempre resolve certo.
      sassVariables: fileURLToPath(
        new URL('./src/css/quasar-variables.sass', import.meta.url)
      ),
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 9000,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    // "toda hora o server não atualiza e não vem as alterações" (pedido
    // do usuário) — o projeto vive em "P:\...", uma unidade que não é o
    // disco local do Windows (drive letter separado, sem relação com
    // C:\Users\...). O watcher nativo do Vite/Chokidar (ReadDirectoryChangesW
    // no Windows) é conhecido por falhar silenciosamente nesse tipo de
    // unidade (rede/iSCSI/RAID mapeado) — o arquivo muda no disco, mas o
    // evento de mudança nunca chega no processo do Vite, então o HMR não
    // dispara e a tela continua com a versão antiga, sem erro nenhum
    // (exatamente o sintoma relatado). "usePolling" troca o watcher nativo
    // por checagem periódica (a cada "interval" ms) — mais pesado pra CPU,
    // mas funciona em qualquer tipo de unidade.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
