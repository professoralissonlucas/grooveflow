// Este arquivo cuida da funcionalidade principal da aba "Minhas Playlists".
// Ele usa a API do Spotify com autenticação JWT/Access Token já salva no localStorage.
// Como o GitHub Pages não aceita back-end, a autenticação acontece no navegador.

const SpotifyPlaylists = (() => {
  const playlistGrid = document.getElementById("playlist-grid");
  const openCreateButton = document.getElementById("open-create-playlist");
  const modal = document.getElementById("playlist-modal");
  const modalTitle = document.getElementById("playlist-modal-title");
  const playlistForm = document.getElementById("playlist-form");
  const playlistNameInput = document.getElementById("playlist-name");
  const playlistDescriptionInput = document.getElementById("playlist-description");
  const playlistPublicInput = document.getElementById("playlist-public");
  const closeModalButton = document.getElementById("close-playlist-modal");
  const cancelModalButton = document.getElementById("cancel-playlist-modal");
  const trackSearchInput = document.getElementById("track-search-input");
  const searchResults = document.getElementById("search-results");
  const tracksModal = document.getElementById("tracks-modal");
  const tracksModalTitle = document.getElementById("tracks-modal-title");
  const playlistTrackList = document.getElementById("playlist-track-list");
  const closeTracksModalButton = document.getElementById("close-tracks-modal");
  const cancelTracksModalButton = document.getElementById("cancel-tracks-modal");

  const state = {
    playlists: [],
    editingPlaylistId: null,
    latestSearchQuery: "",
    currentTrackPlaylistId: null,
  };

  function getAccessToken() {
    // Usa a API exposta por auth.js, quando disponível, para respeitar a expiração.
    if (window.GrooveFlowAuth?.getAccessToken) {
      return window.GrooveFlowAuth.getAccessToken();
    }

    return localStorage.getItem("spotify_access_token");
  }

  function getStoredUser() {
    const rawUser = localStorage.getItem("spotify_user");
    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser);
    } catch (error) {
      console.warn("Usuário salvo em formato inválido.", error);
      return null;
    }
  }

  function showToast(message) {
    window.alert(message);
  }

  async function spotifyFetch(url, options = {}) {
    // Usa os utilitários centralizados do auth.js para obter o token válido e tratar 401.
    if (window.GrooveFlowAuth?.fetchSpotifyApi) {
      return window.GrooveFlowAuth.fetchSpotifyApi(url, options);
    }

    // Fallback para ambiente onde auth.js ainda não tenha sido carregado.
    const token = getAccessToken();

    if (!token) {
      throw new Error("Você precisa estar logado no Spotify para usar esta funcionalidade.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(!options.method || options.method === "GET"
          ? {}
          : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("spotify_user");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("spotify_token_expires_at");
      window.dispatchEvent(new CustomEvent("grooveflow:session-expired"));
      throw new Error("Sua sessão do Spotify expirou. Reconecte sua conta para continuar.");
    }

    if (!response.ok) {
      let details = "";

      try {
        const errorData = await response.json();
        details = errorData?.error?.message || errorData?.error_description || "";
      } catch (error) {
        details = await response.text().catch(() => "");
      }

      const statusMessages = {
        403: "Você não tem permissão para realizar esta operação.",
        429: "Muitas solicitações foram enviadas. Aguarde alguns instantes.",
      };

      throw new Error(
        details || statusMessages[response.status] || `A API do Spotify respondeu com o status ${response.status}.`
      );
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  function openPlaylistModal(mode = "create", playlist = null) {
    if (!modal) {
      return;
    }

    state.editingPlaylistId = mode === "edit" && playlist ? playlist.id : null;
    modalTitle.textContent = mode === "edit" ? "Editar playlist" : "Nova playlist";

    if (playlist) {
      playlistNameInput.value = playlist.name || "";
      playlistDescriptionInput.value = playlist.description || "";
      playlistPublicInput.checked = playlist.public !== false;
    } else {
      playlistForm.reset();
      playlistPublicInput.checked = true;
    }

    modal.classList.remove("hidden");
  }

  function closePlaylistModal() {
    modal.classList.add("hidden");
    playlistForm.reset();
    state.editingPlaylistId = null;
  }

  function closeTracksModal() {
    if (tracksModal) {
      tracksModal.classList.add("hidden");
    }
    state.currentTrackPlaylistId = null;
    if (playlistTrackList) {
      playlistTrackList.innerHTML = "";
    }
  }

  function formatPlaylistCount(quantity) {
    return `${quantity} músicas`;
  }

  function renderPlaylistGrid() {
    if (!playlistGrid) {
      return;
    }

    if (!state.playlists.length) {
      playlistGrid.innerHTML = `
        <div class="playlist-empty">
          Você ainda não tem playlists. Crie sua primeira coleção musical.
        </div>
      `;
      return;
    }

    playlistGrid.innerHTML = state.playlists
      .map(
        (playlist) => `
          <article class="playlist-card-item">
            <div
              class="playlist-card-cover"
              style="background: ${playlist.image || "linear-gradient(135deg, #1DB954, #3B82F6)"};"
            >
              <span>${playlist.name}</span>
            </div>
            <div class="playlist-card-body">
              <h3>${playlist.name}</h3>
              <p>${playlist.description || "Sem descrição"}</p>
              <p>${formatPlaylistCount(playlist.tracks.total)}</p>
            </div>
            <div class="playlist-card-actions">
              <button class="icon-btn" type="button" data-action="edit" data-id="${playlist.id}">Editar</button>
              <button class="icon-btn" type="button" data-action="manage-tracks" data-id="${playlist.id}">Músicas</button>
              <button class="icon-btn" type="button" data-action="delete" data-id="${playlist.id}">Excluir</button>
            </div>
          </article>
        `
      )
      .join("");

    playlistGrid.querySelectorAll("[data-action='edit']").forEach((button) => {
      button.addEventListener("click", async () => {
        const playlist = state.playlists.find((item) => item.id === button.dataset.id);
        if (playlist) {
          openPlaylistModal("edit", playlist);
        }
      });
    });

    playlistGrid.querySelectorAll("[data-action='manage-tracks']").forEach((button) => {
      button.addEventListener("click", async () => {
        const playlist = state.playlists.find((item) => item.id === button.dataset.id);
        if (playlist) {
          openTrackManager(playlist);
        }
      });
    });

    playlistGrid.querySelectorAll("[data-action='delete']").forEach((button) => {
      button.addEventListener("click", async () => {
        const playlistId = button.dataset.id;
        const playlist = state.playlists.find((item) => item.id === playlistId);

        if (!playlist) {
          return;
        }

        const confirmed = window.confirm(
          `Deseja deixar de seguir a playlist "${playlist.name}"?`
        );

        if (!confirmed) {
          return;
        }

        try {
          await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
            method: "DELETE",
          });
          await loadUserPlaylists();
          showToast("Playlist removida com sucesso.");
        } catch (error) {
          showToast(error.message || "Não foi possível remover a playlist.");
        }
      });
    });
  }

  function openTrackManager(playlist) {
    if (!tracksModal || !tracksModalTitle || !playlistTrackList) {
      return;
    }

    state.currentTrackPlaylistId = playlist.id;
    tracksModalTitle.textContent = `Músicas de ${playlist.name}`;
    tracksModal.classList.remove("hidden");
    playlistTrackList.innerHTML = '<div class="playlist-empty">Carregando músicas...</div>';

    loadTracksForPlaylist(playlist.id);
  }

  async function loadTracksForPlaylist(playlistId) {
    if (!playlistTrackList) {
      return;
    }

    try {
      const result = await spotifyFetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`
      );

      const items = result.items || [];

      if (!items.length) {
        playlistTrackList.innerHTML = '<div class="playlist-empty">Esta playlist ainda não tem músicas.</div>';
        return;
      }

      playlistTrackList.innerHTML = items
        .map((item) => {
          const track = item.track;
          if (!track) {
            return "";
          }

          return `
            <div class="playlist-track-item">
              <div>
                <strong>${track.name}</strong>
                <span>${track.artists.map((artist) => artist.name).join(", ")}</span>
              </div>
              <button
                class="track-remove-btn"
                type="button"
                data-track-uri="${track.uri}"
                data-track-name="${track.name}"
              >
                Remover
              </button>
            </div>
          `;
        })
        .join("");

      playlistTrackList.querySelectorAll(".track-remove-btn").forEach((button) => {
        button.addEventListener("click", async () => {
          const trackUri = button.dataset.trackUri;
          const confirmed = window.confirm(`Remover a música "${button.dataset.trackName}" desta playlist?`);

          if (!confirmed) {
            return;
          }

          try {
            await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
              method: "DELETE",
              body: JSON.stringify({
                tracks: [{ uri: trackUri }],
              }),
            });
            await loadTracksForPlaylist(playlistId);
            await loadUserPlaylists();
            showToast("Música removida da playlist.");
          } catch (error) {
            showToast(error.message || "Não foi possível remover a música.");
          }
        });
      });
    } catch (error) {
      playlistTrackList.innerHTML = `<div class="playlist-empty">${error.message || "Não foi possível carregar as músicas."}</div>`;
    }
  }

  async function loadUserPlaylists() {
    if (!getAccessToken()) {
      state.playlists = [];
      renderPlaylistGrid();
      return;
    }

    try {
      // GET /v1/me/playlists: lista as playlists associadas ao usuário autenticado.
      const result = await spotifyFetch("https://api.spotify.com/v1/me/playlists?limit=20&offset=0");

      state.playlists = (result.items || []).map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        public: playlist.public,
        tracks: playlist.tracks,
        image:
          playlist.images && playlist.images.length > 0
            ? playlist.images[0].url
            : "linear-gradient(135deg, #1DB954, #3B82F6)",
      }));

      renderPlaylistGrid();
    } catch (error) {
      console.error("Erro ao listar playlists:", error);
      playlistGrid.innerHTML = `<div class="playlist-empty">${error.message || "Não foi possível carregar as playlists."}</div>`;
    }
  }

  async function createPlaylist(playlistName, playlistDescription, isPublic = true) {
    try {
      const token = await GrooveFlowAuth.getValidAccessToken();
      if (!token) {
        throw new Error("Usuário não autenticado. Faça login no Spotify.");
      }

      const user = GrooveFlowAuth.getUser();
      if (!user?.id) {
        throw new Error("Usuário não identificado. Faça login novamente.");
      }

      const response = await fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(user.id)}/playlists`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: playlistName,
            description: playlistDescription,
            public: isPublic,
          }),
        }
      );

      if (response.status === 401) {
        await GrooveFlowAuth.handleSpotifyUnauthorized(false);
        throw new Error("Sua sessão expirou. Faça login novamente.");
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || `Erro ao criar playlist: ${response.status}`
        );
      }

      const newPlaylist = await response.json();
      console.log("Playlist criada com sucesso:", newPlaylist);
      alert(`Playlist "${newPlaylist.name}" criada com sucesso!`);
      return newPlaylist;
    } catch (error) {
      console.error("Erro na criação da playlist:", error);
      alert(error.message);
      return null;
    }
  }

  async function handleCreateOrUpdatePlaylist(event) {
    event.preventDefault();

    const name = playlistNameInput.value.trim();
    const description = playlistDescriptionInput.value.trim();
    const isPublic = playlistPublicInput.checked;

    if (!name) {
      showToast("O nome da playlist é obrigatório.");
      return;
    }

    try {
      if (state.editingPlaylistId) {
        await spotifyFetch(`https://api.spotify.com/v1/playlists/${state.editingPlaylistId}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            description,
            public: isPublic,
          }),
        });
        showToast("Playlist atualizada com sucesso.");
      } else {
        const createdPlaylist = await createPlaylist(name, description, isPublic);
        if (!createdPlaylist) {
          return;
        }
      }

      await loadUserPlaylists();
      closePlaylistModal();
    } catch (error) {
      showToast(error.message || "Não foi possível salvar a playlist.");
    }
  }

  async function removeTrackFromPlaylist(playlistId, trackUri) {
    try {
      await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        body: JSON.stringify({
          tracks: [{ uri: trackUri }],
        }),
      });
      await loadUserPlaylists();
      showToast("Música removida da playlist.");
    } catch (error) {
      showToast(error.message || "Não foi possível remover a música.");
    }
  }

  function renderSearchResults(results) {
    if (!searchResults) {
      return;
    }

    if (!results.length) {
      searchResults.innerHTML = `
        <div class="playlist-empty">
          Nenhuma música encontrada para a busca atual.
        </div>
      `;
      return;
    }

    const playlistOptions = state.playlists.length
      ? state.playlists
          .map(
            (playlist) =>
              `<option value="${playlist.id}">${playlist.name}</option>`
          )
          .join("")
      : '<option value="">Crie uma playlist primeiro</option>';

    searchResults.innerHTML = results
      .map(
        (track) => `
          <article class="search-result-item">
            <img
              class="search-result-art"
              src="${track.album?.images?.[2]?.url || "https://placehold.co/64x64/1DB954/111111?text=♪"}"
              alt="Capa do álbum ${track.album?.name || "álbum"}"
            />
            <div class="search-result-meta">
              <strong>${track.name}</strong>
              <span>${track.artists.map((artist) => artist.name).join(", ")}</span>
            </div>
            <div class="search-result-actions">
              ${
                track.preview_url
                  ? `<audio controls preload="none"><source src="${track.preview_url}" type="audio/mpeg" /></audio>`
                  : `<a class="spotify-link" href="${track.external_urls?.spotify || "#"}" target="_blank" rel="noreferrer">Abrir no Spotify</a>`
              }
              <select data-track-uri="${track.uri}" data-track-name="${track.name}">
                ${playlistOptions}
              </select>
              <button type="button" data-action="add-track" data-track-uri="${track.uri}" data-track-name="${track.name}">Adicionar</button>
            </div>
          </article>
        `
      )
      .join("");

    searchResults.querySelectorAll("[data-action='add-track']").forEach((button) => {
      button.addEventListener("click", async () => {
        const playlistId = button.parentElement.querySelector("select").value;
        const trackUri = button.dataset.trackUri;

        if (!playlistId) {
          showToast("Crie uma playlist antes de adicionar músicas.");
          return;
        }

        try {
          await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            method: "POST",
            body: JSON.stringify({ uris: [trackUri] }),
          });
          showToast(`Música adicionada à playlist selecionada.`);
          await loadUserPlaylists();
        } catch (error) {
          showToast(error.message || "Não foi possível adicionar a música.");
        }
      });
    });
  }

  async function handleTrackSearch() {
    const query = trackSearchInput.value.trim();
    state.latestSearchQuery = query;

    if (!query) {
      searchResults.innerHTML = "";
      return;
    }

    try {
      const endpoint = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10&market=BR`;
      const result = await spotifyFetch(endpoint);
      const tracks = result.tracks?.items || [];
      renderSearchResults(tracks);
    } catch (error) {
      searchResults.innerHTML = `
        <div class="playlist-empty">
          ${error.message || "Não foi possível realizar a busca."}
        </div>
      `;
    }
  }

  async function initPlaylistFeatures() {
    if (!playlistGrid || !openCreateButton || !trackSearchInput || !searchResults) {
      return;
    }

    openCreateButton.addEventListener("click", () => openPlaylistModal("create"));
    closeModalButton.addEventListener("click", closePlaylistModal);
    cancelModalButton.addEventListener("click", closePlaylistModal);
    closeTracksModalButton.addEventListener("click", closeTracksModal);
    cancelTracksModalButton.addEventListener("click", closeTracksModal);
    playlistForm.addEventListener("submit", handleCreateOrUpdatePlaylist);
    trackSearchInput.addEventListener("input", handleTrackSearch);

    if (!getAccessToken()) {
      playlistGrid.innerHTML = `
        <div class="playlist-empty">
          Faça login no Spotify para ver e gerenciar suas playlists.
        </div>
      `;
      searchResults.innerHTML = `
        <div class="playlist-empty">
          Conecte-se para buscar músicas e adicionar à sua biblioteca.
        </div>
      `;
      return;
    }

    await loadUserPlaylists();
  }

  function resetSessionState() {
    state.playlists = [];

    if (playlistGrid) {
      playlistGrid.innerHTML = '<div class="playlist-empty">Faça login no Spotify para ver e gerenciar suas playlists.</div>';
    }

    if (searchResults) {
      searchResults.innerHTML = '<div class="playlist-empty">Conecte-se novamente para buscar músicas.</div>';
    }
  }

  return {
    init: initPlaylistFeatures,
    load: loadUserPlaylists,
    search: handleTrackSearch,
    resetSessionState,
    createPlaylist,
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  SpotifyPlaylists.init();
});

window.addEventListener("grooveflow:session-expired", () => {
  SpotifyPlaylists.resetSessionState();
});
