# GrooveFlow

GrooveFlow é um projeto web de música inspirado na experiência do Spotify, criado como estudo prático de front-end com HTML5, CSS3 e JavaScript puro. Ele oferece um painel para organizar playlists reais do Spotify, descobrir músicas e montar uma fila colaborativa com amigos — tudo sem back-end, podendo ser publicado gratuitamente no GitHub Pages.

## Funcionalidades

- Login com o Spotify (OAuth 2.0 Authorization Code com **PKCE**, sem Client Secret), com renovação automática do token.
- **Minhas Playlists:** listar (com paginação), criar, editar nome/descrição/visibilidade, remover da biblioteca, ver e remover músicas.
- **Procurar músicas:** buscar faixas, ouvir o preview (quando o Spotify fornece) ou abrir no Spotify, e adicionar a uma playlist.
- **Descobrir Músicas:** chips de estilos (Pop, Rock, MPB, Funk, Hip-Hop, Eletrônica, Indie, Lo-fi), busca por artista/gênero/vibe e botão "Recomendar".
- **Sala com Amigos:** fila colaborativa com votos, ordenação por votos, exportação/importação por código e criação de uma playlist oficial no Spotify a partir da fila.
- Busca global no topo (filtra suas playlists e busca músicas) e navegação pela barra lateral.

## Tecnologias

- HTML5, CSS3 e JavaScript puro (sem frameworks, bundler, npm ou back-end)
- Spotify Web API (regras de 2026 para apps em Development Mode)
- `localStorage` e `sessionStorage`
- GitHub Pages

## Estrutura de pastas

```text
GROSS2/
├── index.html        # estrutura da interface
├── README.md
├── spec.md           # especificação do projeto
├── CLAUDE.md         # regras do projeto
├── css/
│   └── style.css     # tema visual
└── js/
    ├── auth.js       # login PKCE, tokens, sessão e spotifyFetch (acesso único à API)
    ├── playlists.js  # playlists, busca de músicas, navegação e busca global
    ├── discover.js   # descoberta por estilos e vibes
    ├── collab.js     # fila colaborativa
    └── app.js        # apenas demonstração com dados fictícios (não é carregado)
```

## 1. Configurar o Spotify Developer Dashboard

1. Acesse https://developer.spotify.com/dashboard e entre com sua conta Spotify.
   > Desde 2026, o dono de um app em Development Mode precisa ter **Spotify Premium**; sem isso o app para de funcionar.
2. Clique em **Create app** (ou abra o app existente) e preencha:
   - **App name** e **App description**: livres.
   - **Redirect URIs**: adicione **exatamente** as URLs em que o site vai rodar (veja abaixo).
   - **Which API/SDKs are you planning to use?**: marque **Web API**.
3. Salve e copie o **Client ID** em **Settings**.
4. Em `js/auth.js`, confira a constante no topo do arquivo:

   ```js
   const SPOTIFY_CLIENT_ID = "seu-client-id";
   ```

   > **Nunca** coloque o *Client Secret* no código. O fluxo PKCE não precisa dele.

5. Em **User Management**, cadastre o nome e o e-mail da conta Spotify de **cada pessoa** que vai fazer login (apps em Development Mode só aceitam usuários cadastrados; o limite atual é de 5 usuários). Sem isso, o login responde **403**.

### Redirect URIs

A Redirect URI é calculada automaticamente pelo endereço atual (origem + caminho, sem query string). Basta cadastrar no Dashboard as que você vai usar:

| Ambiente | Redirect URI |
|---|---|
| Local | `http://127.0.0.1:8000/index.html` |
| GitHub Pages | `https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/index.html` |

- O Spotify **não aceita `localhost`**. Se você abrir `http://localhost:8000`, o site redireciona sozinho para `http://127.0.0.1:8000`.
- Abrir a pasta raiz (`.../`) também funciona: a URI é normalizada para `.../index.html`.
- A URI exata usada aparece no console do navegador (F12) como `[GrooveFlow] Redirect URI usada no login: ...`.

### Escopos solicitados

`playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-public`, `playlist-modify-private`, `user-read-private`.

## 2. Rodar localmente

No terminal, dentro da pasta do projeto:

```bash
python -m http.server 8000
```

Abra no navegador:

```text
http://127.0.0.1:8000/index.html
```

Clique em **Conectar com Spotify**, autorize o app e você voltará para o site já conectado.

> Abrir o `index.html` direto pelo explorador de arquivos (`file://`) **não funciona**: o login precisa de um endereço `http://`.

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie o projeto (os arquivos devem ficar na raiz, com `index.html` no topo).
2. No repositório, acesse **Settings → Pages**.
3. Em **Build and deployment**, escolha:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` — **Folder:** `/ (root)`
4. Salve e aguarde a publicação (alguns minutos). O endereço será:

   ```text
   https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/
   ```

5. No Spotify Developer Dashboard, adicione a Redirect URI do GitHub Pages:

   ```text
   https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/index.html
   ```

6. Acesse o site publicado e faça login. Nenhuma alteração de código é necessária.

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Redirect URI divergente" ou `INVALID_CLIENT: Invalid redirect URI` | A URI não está cadastrada exatamente igual | Copie a URI da mensagem/console e cadastre-a no Dashboard |
| 403 logo após autorizar | Conta não cadastrada em **User Management** | Cadastre o e-mail da conta Spotify no Dashboard |
| 403 ao editar ou ver músicas de uma playlist | A playlist não é sua nem colaborativa | Em Development Mode só é possível ler/alterar playlists próprias ou colaborativas |
| "Sua sessão do Spotify expirou" | Token e refresh token inválidos | Clique em **Conectar com Spotify** novamente |
| "Muitas solicitações ao Spotify" | Limite de requisições (429) | O site tenta de novo sozinho; se persistir, aguarde alguns segundos |
| Sem player de áudio | O Spotify não fornece `preview_url` para muitas faixas | Use o link **Abrir no Spotify** |

## Observações e limitações

- Não há servidor nem banco de dados; tokens e dados do usuário ficam no navegador (`localStorage`). O *code verifier* do PKCE fica no `sessionStorage` apenas durante o login.
- A fila colaborativa fica salva no navegador (`grooveflow_collab_queue`). Compartilhar a fila é feito manualmente pelo **código da sala** (exportar/importar); não há sincronização em tempo real.
- "Remover" uma playlist significa removê-la da sua biblioteca: o Spotify não apaga playlists definitivamente.
- Recursos removidos da Web API em 2026 (recomendações, audio features, artistas relacionados) não são usados; o botão **Recomendar** sorteia um estilo e uma página de resultados da busca.
- A busca do Spotify retorna no máximo 10 resultados por requisição.

## Autor

Projeto desenvolvido como estudo de desenvolvimento web e integração com APIs públicas.
