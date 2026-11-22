// CanalTV Web - a TV no navegador / celular.
import { CANAIS, CHAVE_RESERVA } from "./js/config.js";
import { diaDe, montarGrade, noAr, proximos, hhmm } from "./js/grade.js";
import { resolverCanal, listarVideos, liveAgora } from "./js/youtube.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou bloqueado */ } },
};

const S = {
  dia: diaDe(),
  grades: {},          // numero -> [[id, titulo, dur], ...]
  lives: {},           // numero -> {id, t}
  fonte: "",
  idx: Math.max(0, CANAIS.findIndex((c) => c.numero === store.get("canal", CANAIS[0].numero))),
  atual: null,         // {id, t, live, i, inicio, dur}
  token: 0,
  player: null,
  ruins: new Set(store.get("ruins", [])),   // videos que nao tocam fora do YouTube
  livesEncerradas: new Set(),
};
const canal = () => CANAIS[S.idx];

// ------------------------------------------------------------------ dados
async function json(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

async function carregarDados() {
  S.dia = diaDe();
  try {
    const [g, l, c] = await Promise.all([
      json(`data/grade-${S.dia}.json`), json("data/lives.json").catch(() => ({ lives: {} })),
      json("data/canais.json").catch(() => null),
    ]);
    if (g.dia !== S.dia) throw new Error("grade de outro dia");
    S.grades = g.canais;
    S.lives = l.lives || {};
    S.fonte = "emissora";
    if (c) store.set("canais", c);
  } catch (e) {
    console.warn("Emissora indisponivel, usando reserva:", e.message);
    S.grades = {};
    S.fonte = CHAVE_RESERVA ? "reserva" : "sem-fonte";
  }
}

async function atualizarLives() {
  if (S.fonte === "emissora") {
    try { S.lives = (await json("data/lives.json")).lives || {}; } catch { /* mantem */ }
  } else if (S.fonte === "reserva" && canal().ao_vivo) {
    try {
      const cid = await channelId(canal());
      const l = await liveAgora(CHAVE_RESERVA, cid);
      if (l) S.lives[canal().numero] = l; else delete S.lives[canal().numero];
    } catch (e) { console.warn(e); }
  }
}

async function channelId(c) {
  const salvos = store.get("canais", []);
  const achado = salvos.find((x) => x.numero === c.numero);
  if (achado) return achado.channelId;
  const info = await resolverCanal(CHAVE_RESERVA, c);
  salvos.push({ numero: c.numero, ...info });
  store.set("canais", salvos);
  return info.channelId;
}

/** Grade do canal: da emissora ou calculada aqui (reserva, mesmo calculo). */
async function gradeDe(c) {
  if (S.grades[c.numero]) return S.grades[c.numero];
  if (S.fonte !== "reserva") return null;
  const chave = `grade:${S.dia}:${c.numero}`;
  let g = store.get(chave, null);
  if (!g) {
    aviso(`Montando a grade de ${c.nome}...`);
    const vids = await listarVideos(CHAVE_RESERVA, await channelId(c), c.max_videos ?? 600);
    g = montarGrade(c, vids, S.dia);
    for (let k = 0; k < localStorage.length; k++) {        // limpa dias antigos
      const key = localStorage.key(k);
      if (key?.startsWith("grade:") && !key.startsWith(`grade:${S.dia}:`)) localStorage.removeItem(key);
    }
    store.set(chave, g);
    aviso(null);
  }
  S.grades[c.numero] = g;
  return g;
}

/** Grade sem os videos que nao tocam fora do YouTube (descobertos neste aparelho). */
function efetiva(numero) {
  const g = S.grades[numero];
  return g ? g.filter((x) => !S.ruins.has(x[0])) : null;
}

// ------------------------------------------------------------------ player
function criarPlayer(id, inicio) {
  return new Promise((ok) => {
    const criar = () => {
      S.player = new YT.Player("player", {
        width: "100%", height: "100%", ...(id ? { videoId: id } : {}),
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0,
          iv_load_policy: 3, cc_load_policy: 0, start: Math.floor(inicio), origin: location.origin },
        events: { onReady: () => ok(), onStateChange: aoMudarEstado, onError: aoErro },
      });
    };
    if (window.YT?.loaded === 1) criar(); else window.onYouTubeIframeAPIReady = criar;
  });
}

async function tocar(id, inicio = 0) {
  if (!S.player) return criarPlayer(id, inicio);
  S.player.loadVideoById({ videoId: id, startSeconds: Math.floor(inicio) });
}

function aoMudarEstado(e) {
  if (e.data === YT.PlayerState.ENDED) {
    if (S.atual?.live) { S.livesEncerradas.add(S.atual.id); delete S.lives[canal().numero]; }
    sintonizar(S.idx, { silencioso: true });   // fim do programa: volta para o que esta no ar
  } else if (e.data === YT.PlayerState.PLAYING) {
    aviso(null);
    semLegenda();
  }
}

/** Desliga a legenda automatica que o YouTube liga sozinho. */
function semLegenda() {
  try { S.player.unloadModule("captions"); } catch { /* sem legenda */ }
  try { S.player.unloadModule("cc"); } catch { /* sem legenda */ }
}

function aoErro(e) {
  // 100: removido | 101/150: dono nao permite tocar fora do YouTube | 2/5: invalido
  const a = S.atual;
  console.warn("Erro do player", e.data, a?.id);
  if (!a) return;
  if (a.live) { S.livesEncerradas.add(a.id); return sintonizar(S.idx); }
  S.ruins.add(a.id);
  store.set("ruins", [...S.ruins].slice(-500));
  pular();
}

// ------------------------------------------------------------------ sintonia
async function sintonizar(idx, { silencioso = false } = {}) {
  const n = CANAIS.length;
  S.idx = ((idx % n) + n) % n;
  const c = canal();
  const meu = ++S.token;
  store.set("canal", c.numero);
  if (diaDe() !== S.dia) await carregarDados();
  if (!silencioso) mostrarBanner({ carregando: true });

  const live = S.lives[c.numero];
  if (c.ao_vivo && live && !S.livesEncerradas.has(live.id) && !S.ruins.has(live.id)) {
    S.atual = { id: live.id, t: live.t, live: true };
    await tocar(live.id, 0);
    if (meu === S.token) mostrarBanner();
    return desenharGuia();
  }

  try { await gradeDe(c); } catch (e) { console.warn(e); }
  if (meu !== S.token) return;              // trocou de canal enquanto carregava
  const grade = efetiva(c.numero);
  if (!grade?.length) {
    S.atual = null;
    S.player?.stopVideo?.();
    aviso(S.fonte === "sem-fonte"
      ? "Sem conexão com a emissora e sem chave reserva configurada."
      : `${c.numero} ${c.nome}: sem programação no momento.`);
    return desenharGuia();
  }
  const { i, off, inicio } = noAr(grade, S.dia);
  const [id, t, dur] = grade[i];
  S.atual = { id, t, live: false, i, inicio, dur };
  await tocar(id, off);
  if (meu === S.token) mostrarBanner();
  desenharGuia();
}

/** Proximo programa da grade, do comeco (sai do horario da grade). */
function pular() {
  const todos = S.grades[canal().numero], g = efetiva(canal().numero);
  if (!g?.length || !S.atual || S.atual.live) return sintonizar(S.idx);
  // proximo depois do atual na grade completa que ainda toca
  let k = todos.findIndex((x) => x[0] === S.atual.id), prox;
  for (let n = 0; n < todos.length; n++) {
    k = (k + 1) % todos.length;
    if (!S.ruins.has(todos[k][0])) { prox = todos[k][0]; break; }
  }
  const i = Math.max(0, g.findIndex((x) => x[0] === prox));
  S.atual = { id: g[i][0], t: g[i][1], live: false, i, inicio: null, dur: g[i][2] };
  tocar(g[i][0], 0);
  mostrarBanner();
}

// ------------------------------------------------------------------ interface
let tBanner, tControles, tAviso;
function mostrarBanner({ carregando = false } = {}) {
  const c = canal(), a = S.atual;
  $("b-num").textContent = c.numero;
  $("b-nome").textContent = c.nome;
  $("b-vivo").classList.toggle("oculto", !(a?.live && !carregando));
  const agora = $("b-agora"), seg = $("b-seguir");
  agora.textContent = ""; seg.textContent = "";
  if (carregando) agora.textContent = "Sintonizando...";
  else if (a) {
    agora.append(a.live ? "" : "Agora: ", a.t);
    if (!a.live && a.inicio) {
      const s = document.createElement("small");
      s.textContent = `  ${hhmm(a.inicio)}–${hhmm(a.inicio + a.dur * 1000)}`;
      agora.append(s);
    }
    const g = efetiva(c.numero);
    if (!a.live && g?.length) {
      const prox = g[(g.findIndex((x) => x[0] === a.id) + 1) % g.length];
      const s = document.createElement("small"); s.textContent = "A seguir: ";
      seg.append(s, prox[1]);
    }
  }
  $("banner").classList.remove("oculto");
  clearTimeout(tBanner);
  if (!carregando) tBanner = setTimeout(() => $("banner").classList.add("oculto"), 7000);
}

function aviso(txt, ms) {
  clearTimeout(tAviso);
  $("aviso").textContent = txt || "";
  $("aviso").classList.toggle("oculto", !txt);
  if (txt && ms) tAviso = setTimeout(() => aviso(null), ms);
}

function mostrarControles() {
  $("controles").classList.remove("oculto");
  $("capa").classList.add("mouse");
  clearTimeout(tControles);
  tControles = setTimeout(() => {
    if ($("guia").classList.contains("oculto")) $("controles").classList.add("oculto");
    $("capa").classList.remove("mouse");
  }, 4000);
}

function desenharGuia() {
  const lista = $("g-lista");
  lista.textContent = "";
  let cat = null;
  CANAIS.forEach((c, i) => {
    if (c.categoria !== cat) {
      cat = c.categoria;
      const d = document.createElement("div"); d.className = "g-cat"; d.textContent = cat;
      lista.append(d);
    }
    const b = document.createElement("button");
    b.className = "g-canal" + (i === S.idx ? " on" : "");
    const num = document.createElement("b"); num.textContent = c.numero;
    const txt = document.createElement("span"); txt.className = "g-txt";
    const nome = document.createElement("span"); nome.textContent = c.nome;
    const sub = document.createElement("small");
    const live = S.lives[c.numero];
    if (c.ao_vivo && live && !S.livesEncerradas.has(live.id)) sub.textContent = "🔴 " + live.t;
    else {
      const g = efetiva(c.numero), p = g?.length && noAr(g, S.dia);
      sub.textContent = p ? g[p.i][1] : "—";
    }
    txt.append(nome, sub);
    b.append(num, txt);
    b.onclick = () => sintonizar(i);
    lista.append(b);
  });

  const gr = $("g-grade");
  gr.textContent = "";
  const g = efetiva(canal().numero);
  if (S.atual?.live) {
    gr.innerHTML = '<div class="g-prog"><span>agora</span><span>Transmissão ao vivo</span></div>';
  } else if (g?.length) {
    for (const p of proximos(g, S.dia, 10)) {
      const d = document.createElement("div"); d.className = "g-prog";
      const h = document.createElement("span"); h.textContent = hhmm(p.inicio);
      const t = document.createElement("span"); t.textContent = p.t;
      d.append(h, t); gr.append(d);
    }
  }
  $("g-fonte").textContent = S.fonte === "emissora" ? "Fonte: emissora (nuvem)"
    : S.fonte === "reserva" ? "Fonte: reserva (calculado neste aparelho)" : "Sem fonte de programação";
}

// ------------------------------------------------------------------ acoes
function posicao() { try { return S.player.getCurrentTime() || 0; } catch { return 0; } }

const ACOES = {
  "canal+": () => sintonizar(S.idx + 1),
  "canal-": () => sintonizar(S.idx - 1),
  voltar: () => { if (!S.atual?.live) S.player?.seekTo(Math.max(0, posicao() - 30), true); },
  avancar: () => {
    if (!S.atual || S.atual.live) return;
    let alvo = posicao() + 30;
    if (S.atual.inicio) {                      // nao passa do "ao vivo" da grade
      const limite = (Date.now() - S.atual.inicio) / 1000;
      if (posicao() >= limite - 2) return aviso("Você já está no ao vivo", 1500);
      alvo = Math.min(alvo, limite);
    }
    S.player?.seekTo(alvo, true);
  },
  inicio: () => { if (!S.atual?.live) S.player?.seekTo(0, true); },
  aovivo: () => { aviso("Voltando ao vivo...", 1500); sintonizar(S.idx, { silencioso: true }); },
  pausa: () => {
    if (!S.player) return;
    S.player.getPlayerState() === YT.PlayerState.PLAYING ? S.player.pauseVideo() : S.player.playVideo();
  },
  mudo: () => {
    if (!S.player) return;
    if (S.player.isMuted()) { S.player.unMute(); aviso("Som ligado", 1000); }
    else { S.player.mute(); aviso("Mudo", 1000); }
  },
  "vol+": () => { const v = Math.min(100, (S.player?.getVolume() ?? 80) + 10); S.player?.setVolume(v); S.player?.unMute(); aviso(`Volume ${v}%`, 1000); },
  "vol-": () => { const v = Math.max(0, (S.player?.getVolume() ?? 80) - 10); S.player?.setVolume(v); aviso(`Volume ${v}%`, 1000); },
  proximo: () => pular(),
  info: () => mostrarBanner(),
  guia: () => {
    desenharGuia();
    $("guia").classList.toggle("oculto");
    $("tela").classList.toggle("guia-aberta", !$("guia").classList.contains("oculto"));
  },
  tela: async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.("landscape"); }
    } catch { /* nao suportado */ }
  },
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-a]");
  if (b) { ACOES[b.dataset.a]?.(); mostrarControles(); }
});
$("capa").addEventListener("click", () => {
  if ($("controles").classList.contains("oculto")) { mostrarControles(); mostrarBanner(); }
  else $("controles").classList.add("oculto");
});
$("capa").addEventListener("mousemove", mostrarControles);

// teclado / controle remoto
let buf = "", tBuf;
document.addEventListener("keydown", (e) => {
  if (!$("ligar").classList.contains("oculto")) { if (e.key === "Enter" || e.key === " ") ligar(); return; }
  const k = e.key;
  if (/^[0-9]$/.test(k)) {
    buf = (buf + k).slice(-3);
    $("digitos").textContent = buf; $("digitos").classList.remove("oculto");
    clearTimeout(tBuf);
    tBuf = setTimeout(() => {
      $("digitos").classList.add("oculto");
      const i = CANAIS.findIndex((c) => c.numero === +buf);
      buf = "";
      if (i >= 0) sintonizar(i); else aviso("Canal não existe", 1500);
    }, 1500);
    return;
  }
  const mapa = {
    ArrowUp: "canal+", PageUp: "canal+", ArrowDown: "canal-", PageDown: "canal-",
    ArrowLeft: "voltar", ArrowRight: "avancar", Home: "inicio", l: "aovivo", L: "aovivo",
    Backspace: "aovivo", " ": "pausa", MediaPlayPause: "pausa", m: "mudo", M: "mudo",
    "+": "vol+", "=": "vol+", "-": "vol-", AudioVolumeUp: "vol+", AudioVolumeDown: "vol-",
    n: "proximo", MediaTrackNext: "proximo", Enter: "info", i: "info", g: "guia", G: "guia",
    f: "tela", F: "tela",
  };
  if (mapa[k]) { e.preventDefault(); ACOES[mapa[k]](); }
});

// ------------------------------------------------------------------ inicio
let travaTela = null;
async function manterTelaLigada() {
  try { travaTela = await navigator.wakeLock?.request("screen"); } catch { /* sem suporte */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && $("ligar").classList.contains("oculto")) manterTelaLigada();
});

async function ligar() {
  $("ligar").classList.add("oculto");
  manterTelaLigada();
  if (!S.player) await criarPlayer(null, 0);   // cria o player no toque (libera o som)
  await sintonizar(S.idx);
  try { S.player?.unMute(); S.player?.setVolume(80); } catch { /* ainda carregando */ }
}

$("btn-ligar").onclick = ligar;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

await carregarDados();
desenharGuia();
setInterval(async () => { await atualizarLives(); desenharGuia(); }, 5 * 60 * 1000);
setInterval(() => { if (diaDe() !== S.dia) carregarDados(); }, 60 * 1000);
