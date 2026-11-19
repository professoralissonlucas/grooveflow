# Especificação do Projeto — GrooveFlow

## Visão geral

GrooveFlow é uma aplicação web estática de música inspirada no Spotify. O projeto demonstra um painel responsivo em HTML5, CSS3 e JavaScript puro, com integração à API pública do Spotify e armazenamento local no navegador.

## Objetivos

- Organizar, criar, editar e excluir playlists reais do usuário.
- Buscar músicas e artistas por meio da API do Spotify.
- Ouvir previews disponíveis e adicionar faixas a playlists.
- Descobrir músicas por estilos, artistas e vibrações.
- Criar uma fila colaborativa, votar nas músicas e exportar/importar a fila.
- Salvar a fila localmente e transformá-la em playlist oficial do Spotify.
- Funcionar gratuitamente no GitHub Pages, sem back-end.

## Tecnologias

- HTML5
- CSS3
- JavaScript Vanilla
- Spotify Web API
- OAuth 2.0 Authorization Code com PKCE
- `localStorage` e `sessionStorage`
- GitHub Pages

## Estrutura

```text
index.html
README.md
spec.md
css/style.css
js/
  auth.js
  playlists.js
  discover.js
  collab.js
  app.js
```

## Arquitetura e responsabilidades

- `index.html`: estrutura da interface, seções, formulários e modais.
- `css/style.css`: tema visual escuro responsivo, cards, navegação e componentes.
- `js/auth.js`: login/logout com Spotify PKCE, token, perfil e controle de sessão.
- `js/playlists.js`: CRUD de playlists, gerenciamento de faixas e busca para inclusão.
- `js/discover.js`: estilos musicais, busca por vibe e descoberta de faixas.
- `js/collab.js`: fila colaborativa, votos, remoção, exportação/importação e criação de playlist.
- `js/app.js`: exemplo demonstrativo com dados mockados; não é carregado por `index.html`.

## Autenticação Spotify

O projeto utiliza PKCE no navegador.

- `SPOTIFY_CLIENT_ID` deve ser configurado em `js/auth.js`.
- Redirect URI deve coincidir com a URL cadastrada no Spotify Developer Dashboard.
- Escopos:
  - `playlist-read-private`
  - `playlist-modify-public`
  - `playlist-modify-private`
  - `user-read-private`
- Token e dados do usuário são armazenados em `localStorage`.
- O code verifier PKCE é armazenado em `sessionStorage` durante o login.

### Estados de sessão

- Desconectado: exibe o botão de conexão.
- Conectado: exibe perfil, nome e opção de logout.
- Expirada: encerra a sessão local e solicita nova autenticação.

## Funcionalidades

### Playlists

- Listar playlists do usuário conectado.
- Criar playlist informando nome, descrição e visibilidade.
- Editar nome, descrição e visibilidade.
- Deixar de seguir/excluir uma playlist da biblioteca.
- Abrir o gerenciador de músicas da playlist.
- Buscar músicas e adicioná-las a uma playlist.
- Remover músicas de uma playlist.

### Descoberta

- Disponibiliza chips de estilos como Pop, Rock, MPB, Funk, Hip-Hop, Eletrônica, Indie e Lo-fi.
- Permite busca por artista, gênero ou vibe.
- Exibe capa, nome da faixa, artistas e preview ou link externo.
- Permite selecionar uma playlist do usuário e adicionar a música.

### Sala colaborativa

- Busca músicas por nome, artista ou termo.
- Adiciona músicas à fila persistida em `localStorage`.
- Permite aumentar votos de uma música.
- Ordena a fila pelos votos em ordem decrescente.
- Permite remover músicas da fila.
- Exporta a fila como código/texto JSON codificado.
- Importa uma fila compartilhada por código.
- Cria uma playlist oficial no Spotify com as músicas da fila.

## Armazenamento local

- `spotify_access_token`: token de acesso.
- `spotify_refresh_token`: token de atualização, quando fornecido.
- `spotify_token_expires_at`: instante de expiração do token.
- `spotify_user`: perfil do usuário.
- `spotify_code_verifier`: code verifier da autenticação PKCE.
- `grooveflow_collab_queue`: fila colaborativa.

## Interface

- Layout com barra lateral e painel principal.
- Navegação para playlists, sala colaborativa e descobertas.
- Busca global, busca de faixas e área de descobertas.
- Hero panel com destaque visual.
- Modais para criação/edição de playlists e lista de músicas.
- Tema responsivo com fundo escuro e elementos em verde, azul e roxo.
- A interface deve permanecer acessível com rótulos, botões e estados de conteúdo.

## API e tratamento de erros

- Todas as chamadas autenticadas usam o Bearer token no cabeçalho `Authorization`.
- Respostas HTTP `401` devem encerrar ou invalidar a sessão ativa.
- Operações com falha devem mostrar mensagens claras ao usuário.
- Requisições sem login devem orientar o usuário a conectar sua conta.
- Buscas vazias devem apresentar estados vazios amigáveis.

## Executando localmente

```bash
python -m http.server 8000
```

Acesse:

```text
http://127.0.0.1:8000/index.html
```

Para autenticação local, registre a Redirect URI correspondente no Spotify Developer Dashboard.

## Publicação

O projeto pode ser publicado no GitHub Pages via deploy da branch principal na raiz do repositório.

A Redirect URI publicada deve ter formato compatível com:

```text
https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/index.html
```

## Limitações

- Não possui servidor nem banco de dados.
- Não oferece sincronização em tempo real entre participantes.
- O código da sala representa uma exportação/importação manual da fila.
- O acesso à API depende de aplicativo Spotify configurado e usuário autorizado.
- A experiência offline não inclui integração com o catálogo do Spotify.
- O token e os dados permanecem no navegador do usuário.
