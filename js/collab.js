// Sala colaborativa: fila de músicas votadas em conjunto.
// Como não há back-end, todos os dados ficam armazenados no navegador via localStorage.

const CollabRoom = (() => {
  const collabSearchInput = document.getElementById("collab-search-input");
  const collabSearchResults = document.getElementById("collab-search-results");
  const collabQueue = document.getElementById("collab-queue");
  const saveQueueButton = document.getElementById("collab-save-playlist");
  const exportCodeButton = document.getElementById("collab-export-code");
  const importCodeButton = document.getElementById("collab-import-code");
  const roomCodeBox = document.getElementById("collab-room-code");

  const storageKey = "grooveflow_collab_queue";

  function getAccessToken() {
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
      console.warn("Usuário salvo sem formato válido.", error);
      return null;
    }
  }

  function loadQueue() {
    const savedQueue = localStorage.getItem(storageKey);

    if (!savedQueue) {
      return [];
    }

    try {
      return JSON.parse(savedQueue);
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
    if (!collabQueue) {
      return;
    }

    collabQueue.innerHTML = `
      <div class="playlist-empty">
        ${message}
      </div>
    `;
  }

  async function spotifyFetch(url, options = {}) {
    const token = getAccessToken();

    if (!token) {
      throw new Error("Faça login no Spotify para criar uma playlist oficial.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      if (window.GrooveFlowAuth) {
        window.GrooveFlowAuth.handleSessionExpired(false);
      }
      throw new Error("Sua sessão do Spotify expirou. Faça login novamente para continuar.");
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify respondeu com erro: ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  function sortQueue() {
    const queue = getQueueSorted();
    saveQueue(queue);
    renderQueue();
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
            <img class="collab-queue-art" src="${item.image || "https://placehold.co/56x56/1DB954/111111?text=♪"}" alt="Capa da música ${item.name}" />
            <div class="collab-queue-meta">
              <strong>${index + 1}. ${item.name}</strong>
              <span>${item.artist}</span>
            </div>
            <div class="collab-queue-actions">
              <button class="vote-btn" type="button" data-action="upvote" data-id="${item.id}">Curtir</button>
              <span class="vote-count">${item.votes}</span>
              <button class="remove-queue-btn" type="button" data-action="remove" data-id="${item.id}">Remover</button>
            </div>
          </div>
        `
      )
      .join("");

    collabQueue.querySelectorAll("[data-action='upvote']").forEach((button) => {
      button.addEventListener("click", () => {
        const queue = loadQueue();
        const item = queue.find((track) => track.id === button.dataset.id);

        if (!item) {
          return;
        }

        item.votes = (item.votes || 0) + 1;
        saveQueue(queue);
        renderQueue();
      });
    });

    collabQueue.querySelectorAll("[data-action='remove']").forEach((button) => {
      button.addEventListener("click", () => {
        const queue = loadQueue().filter((track) => track.id !== button.dataset.id);
        saveQueue(queue);
        renderQueue();
      });
    });
  }

  async function searchTracksInRoom(query) {
    if (!collabSearchResults) {
      return;
    }

    if (!query.trim()) {
      collabSearchResults.innerHTML = "";
      return;
    }

    if (!getAccessToken()) {
      collabSearchResults.innerHTML = `
        <div class="playlist-empty">
          Faça login no Spotify para buscar músicas e montar a fila da sala.
        </div>
      `;
      return;
    }

    try {
      const endpoint = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=6&market=BR`;
      const result = await spotifyFetch(endpoint);
      const tracks = result.tracks?.items || [];

      if (!tracks.length) {
        collabSearchResults.innerHTML = `
          <div class="playlist-empty">
            Nenhuma música encontrada para "${query}".
          </div>
        `;
        return;
      }

      collabSearchResults.innerHTML = tracks
        .map(
          (track) => `
            <div class="collab-track-item">
              <img class="collab-track-art" src="${track.album?.images?.[2]?.url || "https://placehold.co/56x56/1DB954/111111?text=♪"}" alt="Capa da música ${track.name}" />
              <div class="collab-track-meta">
                <strong>${track.name}</strong>
                <span>${track.artists.map((artist) => artist.name).join(", ")}</span>
              </div>
              <div class="collab-track-actions">
                <button class="add-queue-btn" type="button" data-action="add-to-queue" data-track-uri="${track.uri}" data-track-name="${track.name}" data-track-artist="${track.artists.map((artist) => artist.name).join(", ")}" data-track-image="${track.album?.images?.[2]?.url || "https://placehold.co/56x56/1DB954/111111?text=♪"}">Adicionar à fila</button>
              </div>
            </div>
          `
        )
        .join("");

      collabSearchResults.querySelectorAll("[data-action='add-to-queue']").forEach((button) => {
        button.addEventListener("click", () => {
          const queue = loadQueue();
          const newItem = {
            id: `${button.dataset.trackUri}-${Date.now()}`,
            uri: button.dataset.trackUri,
            name: button.dataset.trackName,
            artist: button.dataset.trackArtist,
            image: button.dataset.trackImage,
            votes: 1,
          };

          queue.push(newItem);
          saveQueue(queue);
          renderQueue();
          collabSearchResults.innerHTML = "";
          if (collabSearchInput) collabSearchInput.value = "";
        });
      });
    } catch (error) {
      collabSearchResults.innerHTML = `
        <div class="playlist-empty">
          ${error.message || "Não foi possível pesquisar músicas para a sala."}
        </div>
      `;
    }
  }

  async function createPlaylistFromQueue() {
    const queue = getQueueSorted();

    if (!queue.length) {
      window.alert("A fila está vazia. Adicione músicas antes de salvar.");
      return;
    }

    const user = getStoredUser();
    if (!user || !user.id) {
      window.alert("Faça login no Spotify para criar a playlist oficial.");
      return;
    }

    try {
      const playlist = await spotifyFetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
        method: "POST",
        body: JSON.stringify({
          name: `Sala colaborativa ${new Date().toLocaleDateString("pt-BR")}`,
          description: "Playlist criada pela fila colaborativa do GrooveFlow.",
          public: false,
        }),
      });

      const uris = queue.map((item) => item.uri).filter(Boolean);

      if (!uris.length) {
        window.alert("Nenhuma música com URI válida foi encontrada para criar a playlist.");
        return;
      }

      await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris }),
      });

      window.alert(`Playlist criada com sucesso: ${playlist.name}`);
    } catch (error) {
      if (error.message.includes("expirou") || error.message.includes("401")) {
        window.alert("Sua sessão do Spotify expirou. Reconecte para criar a playlist.");
        return;
      }

      window.alert(error.message || "Não foi possível criar a playlist.");
    }
  }

  function exportRoomCode() {
    const queue = loadQueue();
    const payload = { queue };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));

    if (roomCodeBox) {
      roomCodeBox.value = encoded;
    }

    window.alert("Código exportado. Copie e compartilhe com os amigos.");
  }

  function importRoomCode() {
    const code = (roomCodeBox?.value || "").trim();

    if (!code) {
      window.alert("Cole um código da sala antes de importar.");
      return;
    }

    try {
      const decoded = decodeURIComponent(escape(atob(code)));
      const parsed = JSON.parse(decoded);
      const queue = Array.isArray(parsed.queue) ? parsed.queue : [];
      saveQueue(queue);
      renderQueue();
      window.alert("Fila da sala importada com sucesso.");
    } catch (error) {
      window.alert("Código inválido. Verifique se o texto foi copiado corretamente.");
    }
  }

  function attachEvents() {
    if (collabSearchInput) {
      collabSearchInput.addEventListener("input", (event) => {
        searchTracksInRoom(event.target.value);
      });
    }

    if (saveQueueButton) {
      saveQueueButton.addEventListener("click", createPlaylistFromQueue);
    }

    if (exportCodeButton) {
      exportCodeButton.addEventListener("click", exportRoomCode);
    }

    if (importCodeButton) {
      importCodeButton.addEventListener("click", importRoomCode);
    }
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
