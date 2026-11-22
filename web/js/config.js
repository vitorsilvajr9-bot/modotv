// CanalTV Web - configuracao dos canais
//
// modo:
//   "misto"    -> videos das ultimas 48h primeiro, depois o acervo embaralhado
//   "acervo"   -> todo o acervo do canal, embaralhado por dia (reprises)
//   "recentes" -> so os mais novos
// ao_vivo: true -> se o canal estiver AO VIVO no YouTube, passa a live
// min_minutos: ignora videos menores (tira Shorts)
// max_videos: quantos videos do canal considerar (os mais recentes)
//
// Para achar o canal use handle ("@canal"), id ("UC...") ou busca (nome).

// Chave de API RESERVA, usada so se a emissora (GitHub) estiver fora do ar.
// Crie uma chave separada no Google Cloud e restrinja ao endereco do app.
export const CHAVE_RESERVA = "";

export const CANAIS = [
  // ---------- ESPORTES ----------
  { numero: 1, nome: "CazéTV", categoria: "Esportes", busca: "CazeTV", modo: "misto", ao_vivo: true, min_minutos: 3, max_videos: 600 },
  { numero: 2, nome: "Eurão", categoria: "Esportes", busca: "Eurao", modo: "misto", ao_vivo: true, min_minutos: 3, max_videos: 600 },
  { numero: 3, nome: "SBT Sports", categoria: "Esportes", busca: "SBT Sports", modo: "misto", ao_vivo: true, min_minutos: 3, max_videos: 600 },
  { numero: 4, nome: "ESPN Brasil", categoria: "Esportes", busca: "ESPN Brasil", modo: "misto", ao_vivo: true, min_minutos: 3, max_videos: 600 },
  { numero: 5, nome: "Futebol Antigo", categoria: "Esportes", handle: "@futebolantigo6", modo: "acervo", ao_vivo: false, min_minutos: 5, max_videos: 1500 },
  { numero: 6, nome: "Samuca TV", categoria: "Esportes", busca: "Samuca TV", modo: "misto", ao_vivo: true, min_minutos: 3, max_videos: 600 },
  // ---------- FILMES ----------
  { numero: 10, nome: "Adrenalina TV", categoria: "Filmes", handle: "@AdrenalinaPuraTVBR", modo: "acervo", ao_vivo: true, min_minutos: 40, max_videos: 1500 },
  // ---------- POP ----------
  { numero: 20, nome: "Ei Nerd", categoria: "Pop", busca: "Einerd", modo: "misto", ao_vivo: false, min_minutos: 4, max_videos: 600 },
  { numero: 21, nome: "Nerds de Negócios", categoria: "Pop", busca: "Nerd de Negocios", modo: "misto", ao_vivo: false, min_minutos: 4, max_videos: 600 },
  { numero: 22, nome: "Bit Fut", categoria: "Pop", busca: "Bitfut", modo: "misto", ao_vivo: false, min_minutos: 3, max_videos: 600 },
];
