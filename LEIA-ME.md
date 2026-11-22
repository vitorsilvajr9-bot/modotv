# CanalTV Web

A programacao continua do CanalTV no navegador e no celular (Android).

- **Emissora (GitHub Actions):** a cada 15 min verifica as lives; uma vez por dia monta a grade
  de cada canal. A chave de API fica guardada como segredo do GitHub.
- **App (GitHub Pages):** abre por um link HTTPS, instala no Android como app e toca pelo
  player oficial do YouTube.
- **Reserva:** se a emissora falhar, o app calcula a mesma grade sozinho com a chave reserva.

## Como a grade funciona

- Grade do dia D = videos publicados ate **21:00 do dia anterior**, sem Shorts, sem lives
  agendadas e sem videos que o dono bloqueou fora do YouTube.
- `misto`: videos das ultimas 48h primeiro, depois o acervo embaralhado.
- `acervo`: todo o acervo, embaralhado de um jeito diferente a cada dia.
- `recentes`: do mais novo para o mais antigo.
- Comeca a 00:00 (horario de Brasilia). Ao abrir o app, entra no que esta no ar.
- Canais com `ao_vivo: true` passam a live quando houver.

## Publicar (uma vez)

1. Crie uma conta em github.com e um repositorio **publico** chamado `canaltv`.
2. Envie todo o conteudo desta pasta (inclusive a pasta `.github`).
3. No repositorio: **Settings > Secrets and variables > Actions > New repository secret**
   - Nome: `YT_API_KEY`
   - Valor: a chave de API do YouTube (de preferencia de um projeto so para o app)
4. **Settings > Pages > Build and deployment > Source: GitHub Actions**
5. **Actions > Emissora CanalTV > Run workflow** (a primeira vez demora ~2 min)
6. Abra `https://SEU-USUARIO.github.io/canaltv/`
   - Android (Chrome): menu ⋮ > **Instalar app**

## Chave reserva (opcional)

Google Cloud > Credenciais > Criar chave de API:
- Restricao de aplicativo: **Sites** > `https://SEU-USUARIO.github.io/*`
- Restricao de API: **YouTube Data API v3**

Cole em `web/js/config.js` em `CHAVE_RESERVA` e envie a alteracao.
Ela fica visivel no codigo, mas so funciona a partir do endereco do seu app.

## Editar canais

`web/js/config.js`. Ao enviar a alteracao, a emissora roda sozinha.
A grade nova vale a partir do dia seguinte (para mudar hoje, apague o
`web/data/grade-AAAA-MM-DD.json` de hoje).

## Controles

| Tecla | Acao |
|---|---|
| ↑ / ↓ | troca de canal |
| numeros | vai direto ao canal |
| ← / → | volta / avanca 30 s (nao passa do ao vivo) |
| Home | do inicio do programa |
| L | volta ao vivo |
| espaco | pausa |
| M, + / - | mudo, volume |
| G | guia de canais e programacao |
| F | tela cheia |
