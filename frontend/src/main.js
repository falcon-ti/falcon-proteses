import { createApp } from 'vue';
import { Quasar, Notify, Dialog, Dark, Loading } from 'quasar';

// Estilos do Quasar e ícones (Material Icons + Outlined, prefixo "o_")
import 'quasar/src/css/index.sass';
import '@quasar/extras/material-icons/material-icons.css';
import '@quasar/extras/material-icons-outlined/material-icons-outlined.css';

// Textos internos dos componentes do Quasar (rodapé das tabelas, date
// picker, etc.) em português do Brasil.
import langPtBR from 'quasar/lang/pt-BR';

import './css/app.css';

import App from './App.vue';
import router from './router';
import { auth } from './stores/auth';
import { tema } from './stores/tema';

const app = createApp(App);

app.use(Quasar, {
  plugins: { Notify, Dialog, Dark, Loading },
  lang: langPtBR,
});
tema.aplicar();
app.use(router);

// Espera a sessão salva (token no localStorage) ser conferida no backend
// antes de montar — ver "pronta" em stores/auth.js.
auth.pronta.finally(() => {
  app.mount('#app');
});
