# GrooveFlow

GrooveFlow é um projeto web de música inspirado na experiência do Spotify, criado para ser usado como estudo prático de front-end com HTML5, CSS3 e JavaScript puro. O objetivo é demonstrar um painel moderno para organizar playlists, descobrir músicas e criar uma fila colaborativa para amigos.

## Objetivo do projeto

O site permite:

- explorar um layout moderno e responsivo com visual em tons escuros e destaques vibrantes;
- autenticar com a API do Spotify usando o fluxo PKCE em JavaScript puro;
- listar, criar, atualizar e excluir playlists reais do usuário logado;
- buscar músicas, ouvir previews e adicionar faixas às playlists;
- criar uma fila colaborativa de música para sala de amigos;
- salvar a fila localmente no navegador e exportar/importar o código da sala;
- publicar gratuitamente no GitHub Pages sem back-end.

## Tecnologias utilizadas

- HTML5
- CSS3
- JavaScript puro (Vanilla JS)
- API pública do Spotify
- LocalStorage do navegador
- GitHub Pages

## Estrutura de pastas

```text
GROSS2/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── playlists.js
│   ├── discover.js
│   └── collab.js
└── assets/ (opcional para imagens futuras)
```

## Como configurar o CLIENT_ID do Spotify

1. Acesse o portal do Spotify for Developers:
   https://developer.spotify.com/dashboard
2. Crie um app novo ou abra um existente.
3. Copie o valor do `Client ID`.
4. Abra o arquivo `js/auth.js` e substitua o valor do `CLIENT_ID`:

```js
const SPOTIFY_CLIENT_ID = "SEU_CLIENT_ID_AQUI";
```

5. Configure a `Redirect URI` no painel do Spotify Developer.

### Redirect URI recomendada para testes locais

```text
http://127.0.0.1:5500/index.html
```

### Redirect URI para GitHub Pages

```text
https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/index.html
```

> Importante: a mesma URL precisa estar cadastrada no Spotify Developer, ou a autenticação vai falhar com erro de redirecionamento.

## Como rodar localmente

No terminal, dentro da pasta do projeto, execute:

```bash
python -m http.server 8000
```

Depois abra no navegador:

```text
http://127.0.0.1:8000/index.html
```

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todo o projeto para o repositório.
3. No GitHub, entre em:
   - `Settings`
   - `Pages`
4. Em `Build and deployment`, escolha:
   - Source: `Deploy from a branch`
   - Branch: `main` (ou `master`)
   - Folder: `/ (root)`
5. Salve e aguarde o processo de publicação.
6. O site ficará disponível em algo como:

```text
https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/
```

## Observações importantes

- O projeto foi pensado para rodar somente no front-end, sem back-end e sem banco de dados.
- O `CLIENT_ID` e os tokens de acesso ficam no navegador e são armazenados em `localStorage` para facilitar a experiência do usuário.
- Para melhores resultados em produção, mantenha a `Redirect URI` igual à URL que o GitHub Pages vai usar.
- Em navegadores modernos, a autenticação PKCE funciona corretamente com o fluxo de autorização do Spotify.

## Autor

Projeto desenvolvido como estudo de desenvolvimento web e integração com APIs públicas.
