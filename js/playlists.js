// Este arquivo cuida da funcionalidade principal da aba "Minhas Playlists".
// Todas as chamadas passam por GrooveFlowAuth.spotifyFetch (auth.js), que cuida do
// token, do refresh e das mensagens de erro. Endpoints conforme a Web API de 2026.

const SpotifyPlaylists = (() => {
  const API_BASE = "https://api.spotify.com/v1";
  const DEFAULT_COVER = "linear-gradient(135deg, #1DB954, #3B82F6)";
  const PLACEHOLDER_ART = "https://placehold.co/64x64/1DB954/111111?text=♪";
  const SEARCH_DEBOUNCE_MS = 350;
  const MAX_PAGES = 20;

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
    loaded: false,
    filterQuery: "",
    editingPlaylistId: null,
    currentTrackPlaylistId: null,
    searchTimer: null,
    searchSequence: 0,
    lastSearchTracks: [],
  };

  const escapeHtml = (value) => window.GrooveFlowAuth.escapeHtml(value);

  function spotifyFetch(url, options = {}) {
    return window.GrooveFlowAuth.spotifyFetch(url, options);
  }

  function hasSession() {
    return window.GrooveFlowAuth.hasSession();
  }

  function showToast(message) {
    window.alert(message);
  }

  function renderEmpty(container, message) {
    if (container) {
      container.innerHTML = `<div class="playlist-empty">${escapeHtml(message)}</div>`;
    }
  }

  // Busca todas as páginas de um endpoint paginado do Spotify (seguindo "next").
  async function fetchAllPages(firstUrl) {
    const items = [];
    let url = firstUrl;
    let pages = 0;

    while (url && pages < MAX_PAGES) {
      const page = await spotifyFetch(url);
      items.push(...(page?.items || []));
      url = page?.next || null;
      pages += 1;
    }

    return items;
  }

  function getArtistNames(item) {
    if (Array.isArray(item?.artists) && item.artists.length) {
      return item.artists.map((artist) => artist.name).join(", ");
    }

    // Episódios de podcast não têm "artists"; usamos o nome do programa.
    return item?.show?.name || "";
  }

  // Só é possível adicionar itens em playlists próprias ou colaborativas.
  function canModify(playlist) {
    const user = window.GrooveFlowAuth.getUser();
    return Boolean(playlist.collaborative || (user?.id && playlist.ownerId === user.id));
  }

  function getWritablePlaylists() {
    return state.playlists.filter(canModify);
  }

  function notifyPlaylistsUpdated() {
    window.dispatchEvent(
      new CustomEvent("grooveflow:playlists-updated", {
        detail: { playlists: getWritablePlaylists() },
      })
    );
  }

  function openPlaylistModal(mode = "create", playlist = null) {
    if (!modal) {
      return;
    }

    if (!hasSession()) {
      showToast("Faça login no Spotify para criar ou editar playlists.");
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
    playlistNameInput.focus();
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
    // Para playlists de terceiros a API de 2026 não informa o conteúdo.
    return Number.isFinite(quantity) ? `${quantity} músicas` : "";
  }

  function getCoverStyle(playlist) {
    if (!playlist.imageUrl) {
      return `background: ${DEFAULT_COVER};`;
    }

    const safeUrl = playlist.imageUrl.replace(/["\\\n\r]/g, "");
    return `background: url("${safeUrl}") center / cover no-repeat;`;
  }

  function getVisiblePlaylists() {
    const query = state.filterQuery.toLowerCase();

    if (!query) {
      return state.playlists;
    }

    return state.playlists.filter((playlist) =>
      `${playlist.name} ${playlist.description}`.toLowerCase().includes(query)
    );
  }

  function renderPlaylistGrid() {
    if (!playlistGrid) {
      return;
    }

    if (!state.playlists.length) {
      renderEmpty(playlistGrid, "Você ainda não tem playlists. Crie sua primeira coleção musical.");
      return;
    }

    const visiblePlaylists = getVisiblePlaylists();

    if (!visiblePlaylists.length) {
      renderEmpty(playlistGrid, "Nenhuma playlist encontrada para a busca atual.");
      return;
    }

    playlistGrid.innerHTML = visiblePlaylists
      .map(
        (playlist) => `
          <article class="playlist-card-item">
            <div
              class="playlist-card-cover"
              style="${escapeHtml(getCoverStyle(playlist))}"
            >
              <span>${escapeHtml(playlist.name)}</span>
            </div>
            <div class="playlist-card-body">
              <h3>${escapeHtml(playlist.name)}</h3>
              <p>${escapeHtml(playlist.description || "Sem descrição")}</p>
              <p>${escapeHtml(formatPlaylistCount(playlist.total))}</p>
            </div>
            <div class="playlist-card-actions">
              <button class="icon-btn" type="button" data-action="edit" data-id="${escapeHtml(playlist.id)}">Editar</button>
              <button class="icon-btn" type="button" data-action="manage-tracks" data-id="${escapeHtml(playlist.id)}">Músicas</button>
              <button class="icon-btn" type="button" data-action="delete" data-id="${escapeHtml(playlist.id)}">Excluir</button>
            </div>
          </article>
        `
      )
      .join("");
  }

  // Um único listener na grade trata os botões de todos os cards.
  async function handleGridClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || !playlistGrid.contains(button)) {
      return;
    }

    const playlist = state.playlists.find((item) => item.id === button.dataset.id);
    if (!playlist) {
      return;
    }

    if (button.dataset.action === "edit") {
      if (!canModify(playlist)) {
        showToast("Só é possível editar playlists criadas por você.");
        return;
      }
      openPlaylistModal("edit", playlist);
      return;
    }

    if (button.dataset.action === "manage-tracks") {
      openTrackManager(playlist);
      return;
    }

    if (button.dataset.action === "delete") {
      await unfollowPlaylist(playlist, button);
    }
  }

  async function unfollowPlaylist(playlist, button) {
    const confirmed = window.confirm(`Deseja deixar de seguir a playlist "${playlist.name}"?`);

    if (!confirmed) {
      return;
    }

    button.disabled = true;

    try {
      // DELETE /me/library substitui DELETE /playlists/{id}/followers (2026).
      const uri = `spotify:playlist:${playlist.id}`;
      await spotifyFetch(`${API_BASE}/me/library?uris=${encodeURIComponent(uri)}`, {
        method: "DELETE",
      });
      await loadUserPlaylists();
      showToast("Playlist removida com sucesso.");
    } catch (error) {
      button.disabled = false;
      showToast(error.message || "Não foi possível remover a playlist.");
    }
  }

  function openTrackManager(playlist) {
    if (!tracksModal || !tracksModalTitle || !playlistTrackList) {
      return;
    }

    state.currentTrackPlaylistId = playlist.id;
    tracksModalTitle.textContent = `Músicas de ${playlist.name}`;
    tracksModal.classList.remove("hidden");
    renderEmpty(playlistTrackList, "Carregando músicas...");

    loadTracksForPlaylist(playlist.id);
  }

  async function loadTracksForPlaylist(playlistId) {
    if (!playlistTrackList) {
      return;
    }

    try {
      // GET /playlists/{id}/items substitui /tracks; cada entrada traz o conteúdo em "item".
      const entries = await fetchAllPages(`${API_BASE}/playlists/${encodeURIComponent(playlistId)}/items?limit=50`);

      if (state.currentTrackPlaylistId !== playlistId) {
        return;
      }

      const tracks = entries.map((entry) => entry.item || entry.track).filter((item) => item && item.uri);

      if (!tracks.length) {
        renderEmpty(playlistTrackList, "Esta playlist ainda não tem músicas.");
        return;
      }

      playlistTrackList.innerHTML = tracks
        .map(
          (track) => `
            <div class="playlist-track-item">
              <div>
                <strong>${escapeHtml(track.name)}</strong>
                <span>${escapeHtml(getArtistNames(track))}</span>
              </div>
              <button
                class="track-remove-btn"
                type="button"
                data-track-uri="${escapeHtml(track.uri)}"
                data-track-name="${escapeHtml(track.name)}"
              >
                Remover
              </button>
            </div>
          `
        )
        .join("");
    } catch (error) {
      if (state.currentTrackPlaylistId === playlistId) {
        renderEmpty(playlistTrackList, error.message || "Não foi possível carregar as músicas.");
      }
    }
  }

  async function handleTrackListClick(event) {
    const button = event.target.closest(".track-remove-btn");
    const playlistId = state.currentTrackPlaylistId;

    if (!button || !playlistId) {
      return;
    }

    const confirmed = window.confirm(`Remover a música "${button.dataset.trackName}" desta playlist?`);
    if (!confirmed) {
      return;
    }

    button.disabled = true;

    try {
      await removeTrackFromPlaylist(playlistId, button.dataset.trackUri);
      await loadTracksForPlaylist(playlistId);
      showToast("Música removida da playlist.");
    } catch (error) {
      button.disabled = false;
      showToast(error.message || "Não foi possível remover a música.");
    }
  }

  async function removeTrackFromPlaylist(playlistId, trackUri) {
    // DELETE /playlists/{id}/items com o parâmetro "items" (antes "tracks").
    await spotifyFetch(`${API_BASE}/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: "DELETE",
      body: JSON.stringify({ items: [{ uri: trackUri }] }),
    });
    await loadUserPlaylists();
  }

  async function addTracksToPlaylist(playlistId, uris) {
    // POST /playlists/{id}/items aceita no máximo 100 URIs por requisição.
    for (let index = 0; index < uris.length; index += 100) {
      await spotifyFetch(`${API_BASE}/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: uris.slice(index, index + 100) }),
      });
    }
  }

  function mapPlaylist(playlist) {
    // Em 2026 o campo "tracks" do objeto playlist virou "items".
    const content = playlist.items || playlist.tracks;

    return {
      id: playlist.id,
      name: playlist.name || "Playlist sem nome",
      description: playlist.description || "",
      public: playlist.public,
      collaborative: Boolean(playlist.collaborative),
      ownerId: playlist.owner?.id || null,
      total: typeof content?.total === "number" ? content.total : null,
      imageUrl: playlist.images && playlist.images.length > 0 ? playlist.images[0].url : null,
    };
  }

  async function loadUserPlaylists() {
    if (!hasSession()) {
      resetSessionState();
      return;
    }

    try {
      // GET /v1/me/playlists: lista as playlists associadas ao usuário autenticado.
      const items = await fetchAllPages(`${API_BASE}/me/playlists?limit=50&offset=0`);
      state.playlists = items.filter(Boolean).map(mapPlaylist);
      state.loaded = true;
      renderPlaylistGrid();
      refreshSearchSelects();
      notifyPlaylistsUpdated();
    } catch (error) {
      console.error("Erro ao listar playlists:", error);
      if (hasSession()) {
        renderEmpty(playlistGrid, error.message || "Não foi possível carregar as playlists.");
      }
    }
  }

  async function createPlaylist(playlistName, playlistDescription, isPublic = true) {
    // POST /v1/me/playlists substitui POST /users/{id}/playlists (2026).
    return spotifyFetch(`${API_BASE}/me/playlists`, {
      method: "POST",
      body: JSON.stringify({
        name: playlistName,
        description: playlistDescription,
        public: isPublic,
      }),
    });
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

    const submitButton = playlistForm.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      if (state.editingPlaylistId) {
        await spotifyFetch(`${API_BASE}/playlists/${encodeURIComponent(state.editingPlaylistId)}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            description,
            public: isPublic,
          }),
        });
        closePlaylistModal();
        showToast("Playlist atualizada com sucesso.");
      } else {
        const createdPlaylist = await createPlaylist(name, description, isPublic);
        closePlaylistModal();
        showToast(`Playlist "${createdPlaylist?.name || name}" criada com sucesso!`);
      }

      await loadUserPlaylists();
    } catch (error) {
      showToast(error.message || "Não foi possível salvar a playlist.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }

  function getPlaylistOptionsHtml() {
    const writable = getWritablePlaylists();

    if (!writable.length) {
      return '<option value="">Crie uma playlist primeiro</option>';
    }

    return writable
      .map((playlist) => `<option value="${escapeHtml(playlist.id)}">${escapeHtml(playlist.name)}</option>`)
      .join("");
  }

  // Atualiza apenas as opções dos selects, sem recriar os resultados (não interrompe previews).
  function refreshSearchSelects() {
    if (!searchResults) {
      return;
    }

    const optionsHtml = getPlaylistOptionsHtml();
    searchResults.querySelectorAll(".search-result-actions select").forEach((select) => {
      const previousValue = select.value;
      select.innerHTML = optionsHtml;
      if ([...select.options].some((option) => option.value === previousValue)) {
        select.value = previousValue;
      }
    });
  }

  function renderPreviewOrLink(track) {
    if (track.preview_url) {
      return `<audio controls preload="none"><source src="${escapeHtml(track.preview_url)}" type="audio/mpeg" /></audio>`;
    }

    const href = track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`;
    return `<a class="spotify-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Abrir no Spotify</a>`;
  }

  function renderSearchResults(results) {
    if (!searchResults) {
      return;
    }

    state.lastSearchTracks = results;

    if (!results.length) {
      renderEmpty(searchResults, "Nenhuma música encontrada para a busca atual.");
      return;
    }

    const playlistOptions = getPlaylistOptionsHtml();

    searchResults.innerHTML = results
      .map(
        (track, index) => `
          <article class="search-result-item">
            <img
              class="search-result-art"
              src="${escapeHtml(track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || PLACEHOLDER_ART)}"
              alt="Capa do álbum ${escapeHtml(track.album?.name || "álbum")}"
            />
            <div class="search-result-meta">
              <strong>${escapeHtml(track.name)}</strong>
              <span>${escapeHtml(getArtistNames(track))}</span>
            </div>
            <div class="search-result-actions">
              ${renderPreviewOrLink(track)}
              <select data-track-index="${index}" aria-label="Playlist de destino">
                ${playlistOptions}
              </select>
              <button type="button" data-action="add-track" data-track-index="${index}">Adicionar</button>
            </div>
          </article>
        `
      )
      .join("");
  }

  async function handleSearchResultsClick(event) {
    const button = event.target.closest("[data-action='add-track']");
    if (!button) {
      return;
    }

    const track = state.lastSearchTracks[Number(button.dataset.trackIndex)];
    const playlistId = button.parentElement.querySelector("select")?.value;

    if (!track) {
      return;
    }

    if (!playlistId) {
      showToast("Crie uma playlist antes de adicionar músicas.");
      return;
    }

    button.disabled = true;

    try {
      await addTracksToPlaylist(playlistId, [track.uri]);
      const playlist = state.playlists.find((item) => item.id === playlistId);
      showToast(`Música adicionada à playlist ${playlist ? `"${playlist.name}"` : "selecionada"}.`);
      await loadUserPlaylists();
    } catch (error) {
      showToast(error.message || "Não foi possível adicionar a música.");
    } finally {
      button.disabled = false;
    }
  }

  async function runTrackSearch(query) {
    const sequence = ++state.searchSequence;

    if (!query) {
      state.lastSearchTracks = [];
      searchResults.innerHTML = "";
      return;
    }

    if (!hasSession()) {
      renderEmpty(searchResults, "Conecte-se para buscar músicas e adicionar à sua biblioteca.");
      return;
    }

    try {
      // A busca aceita no máximo limit=10 em 2026.
      const endpoint = `${API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=10&offset=0&market=BR`;
      const result = await spotifyFetch(endpoint);

      // Descarta respostas de buscas antigas que chegaram depois da mais recente.
      if (sequence !== state.searchSequence) {
        return;
      }

      renderSearchResults((result?.tracks?.items || []).filter(Boolean));
    } catch (error) {
      if (sequence === state.searchSequence) {
        renderEmpty(searchResults, error.message || "Não foi possível realizar a busca.");
      }
    }
  }

  function handleTrackSearch() {
    const query = trackSearchInput.value.trim();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runTrackSearch(query), SEARCH_DEBOUNCE_MS);
  }

  // Filtro local da grade de playlists (usado pela busca do topo).
  function filterPlaylists(query) {
    state.filterQuery = (query || "").trim();
    if (state.loaded) {
      renderPlaylistGrid();
    }
  }

  function renderLoggedOutMessages() {
    renderEmpty(playlistGrid, "Faça login no Spotify para ver e gerenciar suas playlists.");
    renderEmpty(searchResults, "Conecte-se para buscar músicas e adicionar à sua biblioteca.");
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
    playlistGrid.addEventListener("click", handleGridClick);
    searchResults.addEventListener("click", handleSearchResultsClick);
    playlistTrackList?.addEventListener("click", handleTrackListClick);

    // Fecha os modais com Esc ou clicando fora do cartão.
    [modal, tracksModal].forEach((overlay) => {
      overlay?.addEventListener("click", (event) => {
        if (event.target === overlay) {
          overlay === modal ? closePlaylistModal() : closeTracksModal();
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (modal && !modal.classList.contains("hidden")) {
        closePlaylistModal();
      }
      if (tracksModal && !tracksModal.classList.contains("hidden")) {
        closeTracksModal();
      }
    });

    if (!hasSession()) {
      renderLoggedOutMessages();
    } else {
      renderEmpty(playlistGrid, "Carregando suas playlists...");
    }

    const loggedIn = await window.GrooveFlowAuth.whenReady();

    if (loggedIn) {
      await loadUserPlaylists();
    } else {
      renderLoggedOutMessages();
    }
  }

  function resetSessionState() {
    state.playlists = [];
    state.loaded = false;
    state.lastSearchTracks = [];
    state.searchSequence += 1;
    closeTracksModal();
    if (modal && !modal.classList.contains("hidden")) {
      closePlaylistModal();
    }
    renderEmpty(playlistGrid, "Faça login no Spotify para ver e gerenciar suas playlists.");
    renderEmpty(searchResults, "Conecte-se novamente para buscar músicas.");
    notifyPlaylistsUpdated();
  }

  return {
    init: initPlaylistFeatures,
    load: loadUserPlaylists,
    search: handleTrackSearch,
    filterPlaylists,
    resetSessionState,
    createPlaylist,
    addTracksToPlaylist,
    getWritablePlaylists,
    isLoaded: () => state.loaded,
  };
})();

// Exposto para discover.js e collab.js (const no topo do script não vira propriedade de window).
window.SpotifyPlaylists = SpotifyPlaylists;

// Navegação da barra lateral e busca global do topo.
// Usa apenas elementos e classes que já existem no index.html (sem ids novos).
const GrooveFlowNavigation = (() => {
  const SCROLL_LOCK_MS = 900;
  let scrollLockUntil = 0;
  let topSearchTimer = null;

  function getNavButtons() {
    return [...document.querySelectorAll(".nav-menu .nav-item")];
  }

  // Ordem dos botões no HTML: Minhas Playlists, Sala com Amigos, Descobrir Músicas.
  function getTargets() {
    return [
      document.getElementById("playlist-grid")?.closest("section"),
      document.querySelector(".collab-section"),
      document.getElementById("discover-vibes")?.closest("section"),
    ];
  }

  function setActive(index) {
    getNavButtons().forEach((button, buttonIndex) => {
      const isActive = buttonIndex === index;
      button.classList.toggle("active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function initNavigation() {
    const buttons = getNavButtons();
    const targets = getTargets();

    buttons.forEach((button, index) => {
      button.addEventListener("click", () => {
        const target = targets[index];
        if (!target) {
          return;
        }
        scrollLockUntil = Date.now() + SCROLL_LOCK_MS;
        setActive(index);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (!("IntersectionObserver" in window)) {
      return;
    }

    // Atualiza o item ativo conforme a rolagem. A seção "Procurar músicas" conta como Playlists.
    const searchSection = document.querySelector(".search-section");
    const tracked = [
      { element: targets[0], index: 0 },
      { element: searchSection, index: 0 },
      { element: targets[2], index: 2 },
      { element: targets[1], index: 1 },
    ].filter((entry) => entry.element);
    const visibility = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visibility.set(entry.target, entry.intersectionRatio));

        if (Date.now() < scrollLockUntil) {
          return;
        }

        let best = null;
        tracked.forEach((item) => {
          const ratio = visibility.get(item.element) || 0;
          if (ratio > 0 && (!best || ratio > best.ratio)) {
            best = { index: item.index, ratio };
          }
        });

        if (best) {
          setActive(best.index);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    tracked.forEach((item) => observer.observe(item.element));
  }

  function initTopSearch() {
    const topSearchInput = document.querySelector(".topbar .search-box input[type='search']");
    const trackSearchInput = document.getElementById("track-search-input");

    if (!topSearchInput) {
      return;
    }

    topSearchInput.addEventListener("input", () => {
      clearTimeout(topSearchTimer);
      topSearchTimer = setTimeout(() => {
        const value = topSearchInput.value.trim();
        SpotifyPlaylists.filterPlaylists(value);

        // Também busca músicas e artistas na seção "Procurar músicas".
        if (trackSearchInput && trackSearchInput.value.trim() !== value) {
          trackSearchInput.value = value;
          SpotifyPlaylists.search();
        }
      }, 250);
    });

    topSearchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const target = getTargets()[0];
      if (target) {
        scrollLockUntil = Date.now() + SCROLL_LOCK_MS;
        setActive(0);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function init() {
    initNavigation();
    initTopSearch();
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", () => {
  SpotifyPlaylists.init();
  GrooveFlowNavigation.init();
});

window.addEventListener("grooveflow:session-expired", () => {
  SpotifyPlaylists.resetSessionState();
});
