// Datas no frontend SEM passar por conversão de fuso: o backend devolve
// "YYYY-MM-DD" / "YYYY-MM-DD HH:mm:ss" como texto (ver backend/src/config/db.js)
// e aqui só manipulamos texto.

const dois = (n) => String(n).padStart(2, '0');

// Date local -> "YYYY-MM-DD" / "YYYY-MM-DD HH:mm"
export function paraIsoData(d) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
export function paraIsoDataHora(d) {
  return `${paraIsoData(d)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function agora() {
  return paraIsoDataHora(new Date());
}

export function hoje() {
  return paraIsoData(new Date());
}

// "YYYY-MM-DD" + n dias -> "YYYY-MM-DD"
export function somarDias(isoData, dias) {
  const [a, m, d] = isoData.slice(0, 10).split('-').map(Number);
  return paraIsoData(new Date(a, m - 1, d + dias));
}

// "YYYY-MM-DD..." -> "DD/MM/YYYY"
export function formatarData(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// "YYYY-MM-DD HH:mm[:ss]" -> "DD/MM/YYYY HH:mm"
export function formatarDataHora(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(valor || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : formatarData(valor);
}

// "DD/MM/YYYY HH:mm" -> "YYYY-MM-DD HH:mm" (ou null se inválida)
export function lerDataHora(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(String(texto || '').trim());
  if (!m) return null;
  const [, d, mes, a, h, min] = m.map(Number);
  const data = new Date(a, mes - 1, d, h, min);
  if (data.getDate() !== d || data.getMonth() !== mes - 1 || h > 23 || min > 59) return null;
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}`;
}

// Compara com o relógio local (ex.: entrega atrasada).
export function jaPassou(valor) {
  return !!valor && String(valor).slice(0, 16).replace('T', ' ') < agora();
}
