// Acesso a API oficial do YouTube (Data API v3). Funciona no navegador e no Node 18+.

const API = "https://www.googleapis.com/youtube/v3/";

export class QuotaError extends Error {}

export async function apiGet(chave, endpoint, params) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries({ ...params, key: chave })) url.searchParams.set(k, v);
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 403 && /quota/i.test(txt)) throw new QuotaError("Cota diaria da API esgotada");
    throw new Error(`API ${endpoint}: HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

function duracao(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => (x ? +x : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

/** -> {channelId, titulo} */
export async function resolverCanal(chave, canal) {
  if (canal.id) {
    const d = await apiGet(chave, "channels", { part: "snippet", id: canal.id });
    if (d.items?.length) return { channelId: d.items[0].id, titulo: d.items[0].snippet.title };
  } else if (canal.handle) {
    const h = canal.handle.startsWith("@") ? canal.handle : "@" + canal.handle;
    const d = await apiGet(chave, "channels", { part: "snippet", forHandle: h });
    if (d.items?.length) return { channelId: d.items[0].id, titulo: d.items[0].snippet.title };
  } else {
    const d = await apiGet(chave, "search", { part: "snippet", type: "channel", q: canal.busca, maxResults: 1 });
    if (d.items?.length) return { channelId: d.items[0].snippet.channelId, titulo: d.items[0].snippet.title };
  }
  throw new Error(`Canal ${canal.numero} (${canal.nome}) nao encontrado`);
}

async function detalhes(chave, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await apiGet(chave, "videos", {
      part: "snippet,contentDetails,status",
      id: ids.slice(i, i + 50).join(","),
    });
    for (const v of d.items || []) {
      const estado = v.snippet.liveBroadcastContent || "none";
      if (estado === "upcoming") continue;
      out.push({
        id: v.id,
        t: v.snippet.title,
        d: duracao(v.contentDetails.duration),
        pub: Date.parse(v.snippet.publishedAt),
        live: estado === "live",
        embed: v.status?.embeddable !== false,
      });
    }
  }
  return out;
}

/** Videos mais recentes do canal (ate max). */
export async function listarVideos(chave, channelId, max = 600) {
  const uploads = "UU" + channelId.slice(2);
  const ids = [];
  let token;
  do {
    const p = { part: "contentDetails", playlistId: uploads, maxResults: 50 };
    if (token) p.pageToken = token;
    const d = await apiGet(chave, "playlistItems", p);
    for (const it of d.items || []) ids.push(it.contentDetails.videoId);
    token = d.nextPageToken;
  } while (token && ids.length < max);
  return detalhes(chave, ids.slice(0, max));
}

/** Live acontecendo agora no canal: {id, t} ou null (gasta ~2 unidades). */
export async function liveAgora(chave, channelId) {
  const d = await apiGet(chave, "playlistItems", {
    part: "contentDetails", playlistId: "UU" + channelId.slice(2), maxResults: 15,
  });
  const ids = (d.items || []).map((it) => it.contentDetails.videoId);
  if (!ids.length) return null;
  const v = (await detalhes(chave, ids)).find((x) => x.live && x.embed);
  return v ? { id: v.id, t: v.t } : null;
}
