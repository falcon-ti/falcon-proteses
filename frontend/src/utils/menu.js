// Definição única do menu lateral (App.vue). Cada item diz qual privilégio
// "tela" (backend/src/config/privilegios.js) libera ele: aparece se, e só
// se, o usuário tem "<tela>.ver".
//
// Seções/itens em ordem alfabética dentro de cada seção (convenção do
// falcon-web). Itens com "filhos" viram grupo recolhível. "acao" (em vez
// de "to") abre um modal — o App.vue resolve o nome da ação.
// Ícones "o_*" = Material Icons Outlined.
export const MENU = [
  {
    titulo: 'Início',
    itens: [{ label: 'Painel', icon: 'o_dashboard', to: '/inicio', exact: true, tela: 'dashboard' }],
  },
  {
    titulo: 'Administração',
    itens: [
      {
        label: 'Cadastros',
        icon: 'o_folder_open',
        filhos: [{ label: 'Empresas', icon: 'o_apartment', to: '/empresas', tela: 'empresas' }],
      },
      {
        label: 'Sistema',
        icon: 'o_settings',
        filhos: [{ label: 'Usuários', icon: 'o_admin_panel_settings', to: '/usuarios', tela: 'usuarios' }],
      },
    ],
  },
];

// Menu filtrado pelos privilégios ("pode" = auth.pode). Seção/grupo sem
// nenhum item visível some.
export function filtrarMenu(pode) {
  const secoes = [];
  for (const secao of MENU) {
    const itens = [];
    for (const item of secao.itens) {
      if (item.filhos) {
        const filhos = item.filhos.filter((f) => pode(f.tela));
        if (filhos.length) itens.push({ ...item, filhos });
      } else if (pode(item.tela)) {
        itens.push(item);
      }
    }
    if (itens.length) secoes.push({ titulo: secao.titulo, itens });
  }
  return secoes;
}

// Primeira ROTA (não modal) que o usuário pode abrir. Painel primeiro;
// sem ele, a primeira tela do menu. null = nenhuma tela liberada.
export function primeiraRota(pode) {
  if (pode('dashboard')) return '/inicio';
  for (const secao of filtrarMenu(pode)) {
    for (const item of secao.itens) {
      for (const folha of item.filhos || [item]) {
        if (folha.to) return folha.to;
      }
    }
  }
  return null;
}
