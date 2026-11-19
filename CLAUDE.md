# GrooveFlow — Regras obrigatórias

## REGRA PRINCIPAL: NÃO ALTERAR O VISUAL
- O visual do projeto está aprovado e NÃO pode mudar.
- É PROIBIDO editar css/style.css.
- No index.html é PROIBIDO mudar layout, classes, cores, textos visíveis, ordem das seções ou estrutura dos elementos.
- Se for indispensável mexer no index.html (por exemplo, um id que o JS espera e não existe), PARE, explique o motivo e peça minha autorização antes.
- Mensagens de erro e estados vazios devem usar os elementos e classes que já existem na interface.
- Todo o trabalho é de funcionalidade, dentro de js/auth.js, js/playlists.js, js/discover.js e js/collab.js.
- js/app.js é só demonstração e não é carregado pelo index.html. Não use esse arquivo e não o carregue.

## Stack
- HTML5, CSS3, JavaScript puro. Sem frameworks, sem bundler, sem npm, sem back-end.
- Precisa funcionar no GitHub Pages e localmente com: python -m http.server 8000

## Spotify Web API (regras de 2026, app em Development Mode)
- Use SOMENTE os endpoints atuais. Em caso de dúvida, consulte:
  https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Criar playlist: POST /v1/me/playlists (NÃO use /users/{id}/playlists)
- Listar playlists: GET /v1/me/playlists
- Adicionar itens: POST /v1/playlists/{id}/items (NÃO use /tracks)
- Remover itens: DELETE /v1/playlists/{id}/items (parâmetro "items", não "tracks")
- Deixar de seguir playlist: DELETE /v1/me/library (confirme o formato na documentação oficial)
- Busca: limit máximo 10 (use offset para paginar)
- GET /me não devolve mais email, country, product nem followers.
- preview_url costuma vir null: sempre ofereça o link externo do Spotify como alternativa.
- Recommendations, audio features e related artists não estão disponíveis: não use.
- Autenticação: Authorization Code com PKCE, sem Client Secret no código.
- Redirect URI: nunca usar "localhost"; local é http://127.0.0.1:8000/index.html

## Forma de trabalhar
- Antes de editar, explique o que vai mudar e em quais arquivos.
- Depois de cada etapa, rode `git diff --stat` e confirme que css/style.css e index.html não foram alterados.
