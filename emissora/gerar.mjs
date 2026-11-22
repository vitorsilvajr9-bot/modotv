// Emissora do CanalTV: roda no GitHub Actions a cada 15 minutos.
// - resolve os canais (uma vez) -> web/data/canais.json
// - monta a grade de hoje (e de amanha, a partir das 21h) -> web/data/grade-AAAA-MM-DD.json
// - verifica quem esta AO VIVO -> web/data/lives.json
// Uso: YT_API_KEY=... node emissora/gerar.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANAIS } from "../web/js/config.js";
import { diaDe, diaSeguinte, montarGrade, FUSO_H } from "../web/js/grade.js";
import { resolverCanal, listarVideos, liveAgora, QuotaError } from "../web/js/youtube.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(RAIZ, "web", "data");
const CHAVE = process.env.YT_API_KEY;
if (!CHAVE || !CHAVE.startsWith("AIza")) {
  console.error("Defina YT_API_KEY (chave de API do YouTube, comeca com AIza)");
  process.exit(1);
}
fs.mkdirSync(DATA, { recursive: true });

const ler = (f, padrao) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return padrao; }
};
const gravar = (f, obj) => {
  const novo = JSON.stringify(obj);
  const p = path.join(DATA, f);
  const antigo = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (antigo !== novo) { fs.writeFileSync(p, novo); console.log("atualizado:", f); }
};
const chaveCanal = (c) => c.id || c.handle || "busca:" + c.busca;

// 1) canais resolvidos (busca gasta 100 unidades: so faz uma vez)
const resolvidos = ler("canais.json", []);
const porChave = Object.fromEntries(resolvidos.map((r) => [r.chave, r]));
const canais = [];
for (const c of CANAIS) {
  let r = porChave[chaveCanal(c)];
  if (!r) {
    try {
      const info = await resolverCanal(CHAVE, c);
      r = { chave: chaveCanal(c), ...info };
      console.log(`canal ${c.numero} (${c.nome}) -> ${info.titulo}`);
    } catch (e) {
      console.error(String(e));
      continue;
    }
  }
  canais.push({ numero: c.numero, nome: c.nome, categoria: c.categoria, ...r });
}
gravar("canais.json", canais);
const idDo = Object.fromEntries(canais.map((c) => [c.numero, c.channelId]));

// 2) grades: hoje sempre; amanha a partir das 21h de Brasilia
const agora = Date.now();
const hoje = diaDe(agora);
const horaBR = new Date(agora + FUSO_H * 3600e3).getUTCHours();
const dias = [hoje];
if (horaBR >= 21) dias.push(diaSeguinte(hoje));

const cacheVideos = {};
for (const dia of dias) {
  const arq = `grade-${dia}.json`;
  if (fs.existsSync(path.join(DATA, arq))) continue;
  const grade = { dia, gerado: new Date().toISOString(), canais: {} };
  for (const c of CANAIS) {
    const cid = idDo[c.numero];
    if (!cid) continue;
    try {
      cacheVideos[cid] ??= await listarVideos(CHAVE, cid, c.max_videos ?? 600);
      grade.canais[c.numero] = montarGrade(c, cacheVideos[cid], dia);
      console.log(`grade ${dia} canal ${c.numero}: ${grade.canais[c.numero].length} programas`);
    } catch (e) {
      console.error(`canal ${c.numero}: ${e}`);
      if (e instanceof QuotaError) break;
    }
  }
  if (Object.keys(grade.canais).length) gravar(arq, grade);
}

// apaga grades antigas (mantem ontem, hoje e amanha)
const ontem = diaDe(agora - 24 * 3600e3);
for (const f of fs.readdirSync(DATA)) {
  const m = /^grade-(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
  if (m && m[1] < ontem) { fs.unlinkSync(path.join(DATA, f)); console.log("removido:", f); }
}

// 3) lives (so canais com ao_vivo)
const lives = {};
for (const c of CANAIS.filter((x) => x.ao_vivo)) {
  const cid = idDo[c.numero];
  if (!cid) continue;
  try {
    const l = await liveAgora(CHAVE, cid);
    if (l) lives[c.numero] = l;
  } catch (e) {
    console.error(`live canal ${c.numero}: ${e}`);
    if (e instanceof QuotaError) break;
  }
}
gravar("lives.json", { lives });
console.log("ok");
