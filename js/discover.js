// Este arquivo busca músicas do Spotify por estilo, artista ou vibe.
// As chamadas passam por GrooveFlowAuth.spotifyFetch (auth.js) e as playlists de destino
// vêm do módulo de playlists, evitando requisições repetidas.

const DiscoverMusic = (() => {
  const API_BASE = "https://api.spotify.com/v1";
  const PLACEHOLDER_ART = "https://placehold.co/64x64/1DB954/111111?text=♪";
  const SEARCH_DEBOUNCE_MS = 350;
  const SEARCH_LIMIT = 10;

  const vibeButtonsContainer = document.getElementById("discover-vibes");
  const discoverInput = document.getElementById("discover-input");
  const musicList = document.getElementById("music-list");

  const vibes = [
    { label: "Pop", value: "pop", color: "linear-gradient(135deg, #1DB954, #22c55e)" },
    { label: "Rock", value: "rock", color: "linear-gradient(135deg, #f43f5e, #fb7185)" },
    { label: "MPB", value: "mpb", color: "linear-gradient(135deg, #f59e0b, #f97316)" },
    { label: "Funk", value: "funk", color: "linear-gradient(135deg, #8b5cf6, #ec4899)" },
    { label: "Hip-Hop", value: "hip hop", color: "linear-gradient(135deg, #10b981, #14b8a6)" },
    { label: "Eletrônica", value: "electronic", color: "linear-gradient(135deg, #38bdf8, #2563eb)" },
    { label: "Indie", value: "indie", color: "linear-gradient(135deg, #a855f7, #c084fc)" },
    { label: "Lo-fi", value: "lo-fi", color: "linear-gradient(135deg, #64748b, #94a3b8)" },
  ];

  const state = {
    tracks: [],
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

  function showFriendlyError(message) {
    if (!musicList) return;

    musicList.innerHTML = `
      <div class="playlist-empty">
        ${escapeHtml(message)}
      </div>
    `;
  }

  function getWritablePlaylists() {
    return window.SpotifyPlaylists?.getWritablePlaylists?.() || [];
  }

  function getArtistNames(track) {
    return Array.isArray(track?.artists) ? track.artists.map((artist) => artist.name).join(", ") : "";
  }

  function renderVibeButtons() {
    if (!vibeButtonsContainer) {
      return;
    }

    vibeButtonsContainer.innerHTML = vibes
      .map(
        (vibe) => `
          <button
            class="discover-chip"
            type="button"
            data-vibe="${escapeHtml(vibe.value)}"
            style="background: ${vibe.color};"
          >
            ${escapeHtml(vibe.label)}
          </button>
        `
      )
      .join("");

    vibeButtonsContainer.addEventListener("click", (event) => {
      const button = event.target.closest(".discover-chip");
      if (!button) {
        return;
      }

      const vibeValue = button.dataset.vibe;
      if (discoverInput) {
        discoverInput.value = vibeValue;
      }
      clearTimeout(state.searchTimer);
      discoverTracks(vibeValue);
    });
  }

  function renderPreviewOrLink(track) {
    if (track.preview_url) {
      return `<audio controls preload="none"><source src="${escapeHtml(track.preview_url)}" type="audio/mpeg" /></audio>`;
    }

    const href = track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`;
    return `<a class="spotify-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Abrir no Spotify</a>`;
  }

  function renderTracks(tracks) {
    if (!musicList) {
      return;
    }

    state.tracks = tracks;

    if (!tracks.length) {
      showFriendlyError("Nenhuma sugestão encontrada. Tente outro artista ou estilo musical.");
      return;
    }

    musicList.innerHTML = tracks
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
            <div class="discover-track-actions">
              ${renderPreviewOrLink(track)}
              <select data-track-index="${index}" aria-label="Playlist de destino">
                <option value="">Escolha uma playlist</option>
              </select>
              <button class="discover-add-button" type="button" data-action="discover-add" data-track-index="${index}">+ Adicionar à Playlist</button>
            </div>
          </article>
        `
      )
      .join("");

    populatePlaylistOptions();
  }

  // Preenche os selects mantendo a escolha atual, quando ainda válida.
  function populatePlaylistOptions() {
    if (!musicList) {
      return;
    }

    const selects = musicList.querySelectorAll(".discover-track-actions select");
    if (!selects.length) {
      return;
    }

    const playlists = getWritablePlaylists();
    const stillLoading = hasSession() && window.SpotifyPlaylists?.isLoaded && !window.SpotifyPlaylists.isLoaded();
    const optionsHtml = stillLoading
      ? '<option value="">Carregando playlists...</option>'
      : playlists.length
      ? `<option value="">Escolha uma playlist</option>${playlists
          .map((playlist) => `<option value="${escapeHtml(playlist.id)}">${escapeHtml(playlist.name)}</option>`)
          .join("")}`
      : '<option value="">Crie uma playlist no painel de playlists</option>';

    selects.forEach((select) => {
      const previousValue = select.value;
      select.innerHTML = optionsHtml;
      if ([...select.options].some((option) => option.value === previousValue)) {
        select.value = previousValue;
      }
    });
  }

  async function handleMusicListClick(event) {
    const button = event.target.closest("[data-action='discover-add']");
    if (!button) {
      return;
    }

    const track = state.tracks[Number(button.dataset.trackIndex)];
    const row = button.closest(".search-result-item");
    const playlistId = row?.querySelector("select")?.value;

    if (!track) {
      return;
    }

    if (!playlistId) {
      window.alert("Selecione uma playlist antes de adicionar a música.");
      return;
    }

    button.disabled = true;

    try {
      // POST /playlists/{id}/items substitui /tracks (2026).
      await spotifyFetch(`${API_BASE}/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: [track.uri] }),
      });
      window.alert("Música adicionada à playlist com sucesso.");
      window.SpotifyPlaylists?.load?.();
    } catch (error) {
      window.alert(error.message || "Não foi possível adicionar a música.");
    } finally {
      button.disabled = false;
    }
  }

  async function discoverTracks(query = "pop", offset = 0) {
    if (!musicList) {
      return;
    }

    const sequence = ++state.searchSequence;

    if (!hasSession()) {
      state.tracks = [];
      showFriendlyError("Faça login no Spotify para desbloquear a descoberta de músicas.");
      return;
    }

    try {
      const searchTerm = query.trim() || "pop";
      const safeOffset = Math.max(0, Math.min(1000 - SEARCH_LIMIT, Math.floor(offset)));
      const endpoint = `${API_BASE}/search?q=${encodeURIComponent(searchTerm)}&type=track&limit=${SEARCH_LIMIT}&offset=${safeOffset}&market=BR`;
      const data = await spotifyFetch(endpoint);

      if (sequence !== state.searchSequence) {
        return;
      }

      renderTracks((data?.tracks?.items || []).filter(Boolean));
    } catch (error) {
      if (sequence === state.searchSequence) {
        showFriendlyError(error.message || "Não foi possível carregar sugestões.");
      }
    }
  }

  function attachEvents() {
    if (discoverInput) {
      discoverInput.addEventListener("input", (event) => {
        const value = event.target.value.trim();
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => discoverTracks(value || "pop"), SEARCH_DEBOUNCE_MS);
      });
    }

    if (musicList) {
      musicList.addEventListener("click", handleMusicListClick);
    }

    // "Recomendar": a API de recomendações não existe mais em 2026, então sorteamos
    // um estilo diferente do atual e uma página (offset) aleatória da busca.
    const recommendLink = musicList?.closest("section")?.querySelector(".link-more");
    if (recommendLink) {
      recommendLink.addEventListener("click", (event) => {
        event.preventDefault();
        const current = (discoverInput?.value || "").trim().toLowerCase();
        const options = vibes.filter((vibe) => vibe.value !== current);
        const vibe = options[Math.floor(Math.random() * options.length)];
        const offset = Math.floor(Math.random() * 10) * SEARCH_LIMIT;

        if (discoverInput) {
          discoverInput.value = vibe.value;
        }
        clearTimeout(state.searchTimer);
        discoverTracks(vibe.value, offset);
      });
    }

    window.addEventListener("grooveflow:playlists-updated", populatePlaylistOptions);
    window.addEventListener("grooveflow:session-expired", () => {
      state.searchSequence += 1;
      state.tracks = [];
      showFriendlyError("Faça login no Spotify para desbloquear a descoberta de músicas.");
    });
  }

  async function init() {
    renderVibeButtons();
    attachEvents();

    if (!hasSession()) {
      showFriendlyError("Faça login no Spotify para desbloquear a descoberta de músicas.");
    }

    const loggedIn = await window.GrooveFlowAuth.whenReady();

    if (loggedIn) {
      discoverTracks((discoverInput?.value || "").trim() || "pop");
    } else {
      showFriendlyError("Faça login no Spotify para desbloquear a descoberta de músicas.");
    }
  }

  return {
    init,
    discover: discoverTracks,
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  DiscoverMusic.init();
});
