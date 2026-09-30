import axios from 'axios';
import { auth } from '../stores/auth';

// Instância única do axios usada pelo app (exceto pelo próprio login, ver
// stores/auth.js). Em desenvolvimento "/api" vai pro backend pelo proxy do
// Vite (vite.config.js).
const api = axios.create({
  baseURL: '/api',
});

// Anexa o token JWT em toda requisição.
api.interceptors.request.use((config) => {
  if (auth.state.token) {
    config.headers.Authorization = `Bearer ${auth.state.token}`;
  }
  return config;
});

// 401 (token ausente/expirado/inválido ou acesso à empresa removido):
// derruba a sessão local — o guard do router manda pro login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      auth.logout();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default api;
