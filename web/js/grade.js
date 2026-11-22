// Calculo da grade - IDENTICO na emissora (GitHub) e no app (reserva).
// Mesmos videos + mesmo dia => mesma programacao em qualquer aparelho.

export const FUSO_H = -3;            // Horario de Brasilia (sem horario de verao)
export const CORTE_H = 3;            // grade do dia D usa videos publicados ate 21:00 de D-1
export const COBERTURA_S = 26 * 3600; // grade cobre pelo menos 26h

const H = 3600e3;

/** "YYYY-MM-DD" do dia em Brasilia para um instante (ms). */
export function diaDe(ts = Date.now()) {
  return new Date(ts + FUSO_H * H).toISOString().slice(0, 10);
}

/** Instante (ms) da meia-noite de Brasilia do dia "YYYY-MM-DD". */
export function inicioDoDia(dia) {
  return Date.parse(dia + "T00:00:00Z") - FUSO_H * H;
}

export function diaSeguinte(dia) {
  return diaDe(inicioDoDia(dia) + 30 * H);
}

/** Horario de corte: so entram na grade videos publicados antes disso. */
export function corteDoDia(dia) {
  return inicioDoDia(dia) - CORTE_H * H;
}

export function hhmm(ts) {
  return new Date(ts + FUSO_H * H).toISOString().slice(11, 16);
}

// --- embaralhamento com semente (igual em qualquer navegador/Node) ---
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralhar(lista, semente) {
  const a = lista.slice();
  const rnd = mulberry32(fnv1a(semente));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Monta a grade do dia de um canal.
 * videos: [{id, t, d (segundos), pub (ms), live, embed}]
 * retorna: [[id, titulo, duracao], ...]
 */
export function montarGrade(canal, videos, dia) {
  const corte = corteDoDia(dia);
  const min = (canal.min_minutos ?? 3) * 60;
  const ok = videos
    .filter((v) => !v.live && v.embed !== false && v.d >= min && v.pub < corte)
    .sort((a, b) => b.pub - a.pub || (a.id < b.id ? -1 : 1));
  const semente = `${dia}#${canal.numero}`;
  let ordem;
  if (canal.modo === "recentes") {
    ordem = ok;
  } else if (canal.modo === "acervo") {
    ordem = embaralhar(ok, semente);
  } else { // misto
    const limite = corte - 48 * H;
    const novos = ok.filter((v) => v.pub >= limite);
    const resto = ok.filter((v) => v.pub < limite);
    ordem = novos.concat(embaralhar(resto, semente));
  }
  const grade = [];
  let total = 0;
  for (const v of ordem) {
    grade.push([v.id, v.t, v.d]);
    total += v.d;
    if (total >= COBERTURA_S) break;
  }
  return grade;
}

/** Programa no ar: {i, off (s), inicio (ms)} ou null. Repete a grade se acabar. */
export function noAr(grade, dia, agora = Date.now()) {
  if (!grade || !grade.length) return null;
  const total = grade.reduce((s, g) => s + g[2], 0);
  if (!total) return null;
  const decorrido = (((agora - inicioDoDia(dia)) / 1000) % total + total) % total;
  let acc = 0;
  for (let i = 0; i < grade.length; i++) {
    if (acc + grade[i][2] > decorrido) {
      const off = decorrido - acc;
      return { i, off, inicio: agora - off * 1000 };
    }
    acc += grade[i][2];
  }
  return { i: 0, off: 0, inicio: agora };
}

/** Proximos n programas a partir do que esta no ar: [{id,t,inicio,fim}] */
export function proximos(grade, dia, n = 8, agora = Date.now()) {
  const p = noAr(grade, dia, agora);
  if (!p) return [];
  const out = [];
  let t = p.inicio;
  for (let k = 0; k < n; k++) {
    const g = grade[(p.i + k) % grade.length];
    out.push({ id: g[0], t: g[1], inicio: t, fim: t + g[2] * 1000 });
    t += g[2] * 1000;
  }
  return out;
}
