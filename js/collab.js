// Sala colaborativa: fila de músicas votadas em conjunto.
// Como não há back-end, todos os dados ficam armazenados no navegador via localStorage.
// As chamadas ao Spotify passam por GrooveFlowAuth.spotifyFetch (auth.js).

const CollabRoom = (() => {
  const API_BASE = "https://api.spotify.com/v1";
  const PLACEHOLDER_ART = "https://placehold.co/56x56/1DB954/111111?text=♪";
  const SEARCH_DEBOUNCE_MS = 350;
  const MAX_QUEUE_ITEMS = 500;
  const TRACK_URI_PATTERN = /^spotify:(track|episode):[A-Za-z0-9]{1,64}$/;

  const collabSearchInput = document.getElementById("collab-search-input");
  const collabSearchResults = document.getElementById("collab-search-results");
  const collabQueue = document.getElementById("collab-queue");
  const saveQueueButton = document.getElementById("collab-save-playlist");
  const exportCodeButton = document.getElementById("collab-export-code");
  const importCodeButton = document.getElementById("collab-import-code");
  const roomCodeBox = document.getElementById("collab-room-code");

  const storageKey = "grooveflow_collab_queue";

  const state = {
    searchTracks: [],
    searchTimer: null,
    searchSequence: 0,
  };

  const escapeHtml = (value) => window.GrooveFlowAuth.escapeHtml(value);

  function spotifyFetch(url, options = {}) {
    return window.GrooveFlowAuth.spotifyFetch(url, options);
  }

  function hasSession() {
    return window.GrooveFlowAuth.hasSession();
  }

  function renderEmpty(container, message) {
    if (container) {
      container.innerHTML = `<div class="playlist-empty">${escapeHtml(message)}</div>`;
    }
  }

  function createItemId(uri) {
    return `${uri}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Normaliza um item da fila; devolve null se não for uma música válida do Spotify.
  // Usado tanto para o localStorage quanto para códigos importados de outras pessoas.
  function sanitizeQueueItem(rawItem) {
    if (!rawItem || typeof rawItem !== "object") {
      return null;
    }

    const uri = typeof rawItem.uri === "string" ? rawItem.uri.trim() : "";
    if (!TRACK_URI_PATTERN.test(uri)) {
      return null;
    }

    const image = typeof rawItem.image === "string" && /^https:\/\//i.test(rawItem.image) ? rawItem.image : "";
    const votes = Number.isFinite(Number(rawItem.votes)) ? Math.max(0, Math.min(1000000, Math.floor(Number(rawItem.votes)))) : 0;

    return {
      id: typeof rawItem.id === "string" && rawItem.id ? rawItem.id.slice(0, 200) : createItemId(uri),
      uri,
      name: String(rawItem.name || "Música sem nome").slice(0, 200),
      artist: String(rawItem.artist || "").slice(0, 300),
      image,
      votes,
    };
  }

  function sanitizeQueue(rawQueue) {
    if (!Array.isArray(rawQueue)) {
      return [];
    }

    const seenIds = new Set();
    return rawQueue
      .map(sanitizeQueueItem)
      .filter(Boolean)
      .filter((item) => {
        if (seenIds.has(item.id)) {
          return false;
        }
        seenIds.add(item.id);
        return true;
      })
      .slice(0, MAX_QUEUE_ITEMS);
  }

  function loadQueue() {
    const savedQueue = localStorage.getItem(storageKey);

    if (!savedQueue) {
      return [];
    }

    try {
      return sanitizeQueue(JSON.parse(savedQueue));
    } catch (error) {
      console.warn("Fila da sala em formato inválido.", error);
      return [];
    }
  }

  function saveQueue(queue) {
    localStorage.setItem(storageKey, JSON.stringify(queue));
  }

  function getQueueSorted() {
    const queue = loadQueue();
    return [...queue].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  }

  function showQueueStatus(message) {
    renderEmpty(collabQueue, message);
  }

  function renderQueue() {
    if (!collabQueue) {
      return;
    }

    const queue = getQueueSorted();

    if (!queue.length) {
      showQueueStatus("A fila está vazia. Busque músicas para começar a festa.");
      return;
    }

    collabQueue.innerHTML = queue
      .map(
        (item, index) => `
          <div class="collab-queue-item">
            <img class="collab-queue-art" src="${escapeHtml(item.image || PLACEHOLDER_ART)}" alt="Capa da música ${escapeHtml(item.name)}" />
            <div class="collab-queue-meta">
              <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.artist)}</span>
            </div>
            <div class="collab-queue-actions">
              <button class="vote-btn" type="button" data-action="upvote" data-id="${escapeHtml(item.id)}">Curtir</button>
              <span class="vote-count">${item.votes}</span>
              <button class="remove-queue-btn" type="button" data-action="remove" data-id="${escapeHtml(item.id)}">Remover</button>
            </div>
          </div>
        `
      )
      .join("");
  }

  function handleQueueClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const queue = loadQueue();

    if (button.dataset.action === "upvote") {
      const item = queue.find((track) => track.id === button.dataset.id);
      if (!item) {
        return;
      }
      item.votes = (item.votes || 0) + 1;
      saveQueue(queue);
      renderQueue();
      return;
    }

    if (button.dataset.action === "remove") {
      saveQueue(queue.filter((track) => track.id !== button.dataset.id));
      renderQueue();
    }
  }

  function getArtistNames(track) {
    return Array.isArray(track?.artists) ? track.artists.map((artist) => artist.name).join(", ") : "";
  }

  function getTrackImage(track) {
    return track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || "";
  }

  async function searchTracksInRoom(query) {
    if (!collabSearchResults) {
      return;
    }

    const sequence = ++state.searchSequence;
    const term = (query || "").trim();

    if (!term) {
      state.searchTracks = [];
      collabSearchResults.innerHTML = "";
      return;
    }

    if (!hasSession()) {
      renderEmpty(collabSearchResults, "Faça login no Spotify para buscar músicas e montar a fila da sala.");
      return;
    }

    try {
      const endpoint = `${API_BASE}/search?q=${encodeURIComponent(term)}&type=track&limit=6&offset=0&market=BR`;
      const result = await spotifyFetch(endpoint);

      if (sequence !== state.searchSequence) {
        return;
      }

      const tracks = (result?.tracks?.items || []).filter((track) => track && track.uri);
      state.searchTracks = tracks;

      if (!tracks.length) {
        renderEmpty(collabSearchResults, `Nenhuma música encontrada para "${term}".`);
        return;
      }

      collabSearchResults.innerHTML = tracks
        .map(
          (track, index) => `
            <div class="collab-track-item">
              <img class="collab-track-art" src="${escapeHtml(getTrackImage(track) || PLACEHOLDER_ART)}" alt="Capa da música ${escapeHtml(track.name)}" />
              <div class="collab-track-meta">
                <strong>${escapeHtml(track.name)}</strong>
                <span>${escapeHtml(getArtistNames(track))}</span>
              </div>
              <div class="collab-track-actions">
                <button class="add-queue-btn" type="button" data-action="add-to-queue" data-track-index="${index}">Adicionar à fila</button>
              </div>
            </div>
          `
        )
        .join("");
    } catch (error) {
      if (sequence === state.searchSequence) {
        renderEmpty(collabSearchResults, error.message || "Não foi possível pesquisar músicas para a sala.");
      }
    }
  }

  function handleSearchResultsClick(event) {
    const button = event.target.closest("[data-action='add-to-queue']");
    if (!button) {
      return;
    }

    const track = state.searchTracks[Number(button.dataset.trackIndex)];
    if (!track) {
      return;
    }

    const queue = loadQueue();
    const existing = queue.find((item) => item.uri === track.uri);

    if (existing) {
      // A música já está na fila: conta como mais um voto em vez de duplicar.
      existing.votes = (existing.votes || 0) + 1;
    } else {
      if (queue.length >= MAX_QUEUE_ITEMS) {
        window.alert(`A fila já tem o máximo de ${MAX_QUEUE_ITEMS} músicas.`);
        return;
      }

      queue.push(
        sanitizeQueueItem({
          id: createItemId(track.uri),
          uri: track.uri,
          name: track.name,
          artist: getArtistNames(track),
          image: getTrackImage(track),
          votes: 1,
        })
      );
    }

    saveQueue(queue);
    renderQueue();
    state.searchSequence += 1;
    state.searchTracks = [];
    collabSearchResults.innerHTML = "";
    if (collabSearchInput) collabSearchInput.value = "";

    if (existing) {
      window.alert(`"${existing.name}" já estava na fila e ganhou mais um voto.`);
    }
  }

  async function createPlaylistFromQueue() {
    const queue = getQueueSorted();

    if (!queue.length) {
      window.alert("A fila está vazia. Adicione músicas antes de salvar.");
      return;
    }

    if (!hasSession()) {
      window.alert("Faça login no Spotify para criar a playlist oficial.");
      return;
    }

    const uris = [...new Set(queue.map((item) => item.uri).filter((uri) => TRACK_URI_PATTERN.test(uri)))];

    if (!uris.length) {
      window.alert("Nenhuma música com URI válida foi encontrada para criar a playlist.");
      return;
    }

    if (saveQueueButton) {
      saveQueueButton.disabled = true;
    }

    let playlist = null;

    try {
      // POST /me/playlists substitui POST /users/{id}/playlists (2026).
      playlist = await spotifyFetch(`${API_BASE}/me/playlists`, {
        method: "POST",
        body: JSON.stringify({
          name: `Sala colaborativa ${new Date().toLocaleDateString("pt-BR")}`,
          description: "Playlist criada pela fila colaborativa do GrooveFlow.",
          public: false,
        }),
      });

      if (!playlist?.id) {
        throw new Error("O Spotify não retornou a playlist criada.");
      }

      // POST /playlists/{id}/items aceita no máximo 100 URIs por requisição.
      for (let index = 0; index < uris.length; index += 100) {
        await spotifyFetch(`${API_BASE}/playlists/${encodeURIComponent(playlist.id)}/items`, {
          method: "POST",
          body: JSON.stringify({ uris: uris.slice(index, index + 100) }),
        });
      }

      window.alert(`Playlist criada com sucesso: ${playlist.name}`);
    } catch (error) {
      const message = error.message || "Não foi possível criar a playlist.";
      window.alert(
        playlist?.id
          ? `A playlist "${playlist.name}" foi criada, mas nem todas as músicas foram adicionadas. ${message}`
          : message
      );
    } finally {
      if (saveQueueButton) {
        saveQueueButton.disabled = false;
      }
      if (playlist?.id) {
        window.SpotifyPlaylists?.load?.();
      }
    }
  }

  function exportRoomCode() {
    const queue = loadQueue();

    if (!queue.length) {
      window.alert("A fila está vazia. Adicione músicas antes de exportar o código.");
      return;
    }

    const payload = { queue };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));

    if (roomCodeBox) {
      roomCodeBox.value = encoded;
      roomCodeBox.select();
    }

    window.alert("Código exportado. Copie e compartilhe com os amigos.");
  }

  function importRoomCode() {
    const code = (roomCodeBox?.value || "").replace(/\s+/g, "");

    if (!code) {
      window.alert("Cole um código da sala antes de importar.");
      return;
    }

    let parsed = null;

    try {
      const decoded = decodeURIComponent(escape(atob(code)));
      parsed = JSON.parse(decoded);
    } catch (error) {
      window.alert("Código inválido. Verifique se o texto foi copiado corretamente.");
      return;
    }

    const rawQueue = Array.isArray(parsed?.queue) ? parsed.queue : null;

    if (!rawQueue) {
      window.alert("Código inválido. Verifique se o texto foi copiado corretamente.");
      return;
    }

    const queue = sanitizeQueue(rawQueue);

    if (rawQueue.length && !queue.length) {
      window.alert("O código não contém nenhuma música válida do Spotify.");
      return;
    }

    const currentQueue = loadQueue();
    if (currentQueue.length) {
      const confirmed = window.confirm("Importar este código vai substituir a fila atual. Deseja continuar?");
      if (!confirmed) {
        return;
      }
    }

    saveQueue(queue);
    renderQueue();

    const ignored = rawQueue.length - queue.length;
    window.alert(
      ignored > 0
        ? `Fila da sala importada com sucesso. ${ignored} item(ns) inválido(s) foram ignorados.`
        : "Fila da sala importada com sucesso."
    );
  }

  function attachEvents() {
    if (collabSearchInput) {
      collabSearchInput.addEventListener("input", (event) => {
        const value = event.target.value;
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => searchTracksInRoom(value), SEARCH_DEBOUNCE_MS);
      });
    }

    collabSearchResults?.addEventListener("click", handleSearchResultsClick);
    collabQueue?.addEventListener("click", handleQueueClick);
    saveQueueButton?.addEventListener("click", createPlaylistFromQueue);
    exportCodeButton?.addEventListener("click", exportRoomCode);
    importCodeButton?.addEventListener("click", importRoomCode);

    window.addEventListener("grooveflow:session-expired", () => {
      state.searchSequence += 1;
      state.searchTracks = [];
      if (collabSearchResults) {
        collabSearchResults.innerHTML = "";
      }
    });

    // Mantém a fila sincronizada entre abas abertas no mesmo navegador.
    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) {
        renderQueue();
      }
    });
  }

  function init() {
    renderQueue();
    attachEvents();
  }

  return {
    init,
    renderQueue,
    searchTracksInRoom,
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  CollabRoom.init();
});
