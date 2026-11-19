// Este arquivo busca músicas públicas do Spotify por estilo, artista ou vibe.
// Como o GitHub Pages não tem servidor, usamos os endpoints públicos da API e o token do usuário no navegador.

const DiscoverMusic = (() => {
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

  function getAccessToken() {
    return localStorage.getItem("spotify_access_token");
  }

  function showFriendlyError(message) {
    if (!musicList) return;

    musicList.innerHTML = `
      <div class="playlist-empty">
        ${message}
      </div>
    `;
  }

  function getStoredUser() {
    const rawUser = localStorage.getItem("spotify_user");
    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser);
    } catch (error) {
      console.warn("Usuário salvo inválido.", error);
      return null;
    }
  }

  async function spotifyPublicFetch(url, options = {}) {
    const token = getAccessToken();

    if (!token) {
      throw new Error("Sua sessão do Spotify expirou. Faça login novamente para continuar.");
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
      throw new Error(`Não foi possível buscar músicas: ${text}`);
    }

    return response.json();
  }

  async function fetchUserPlaylists() {
    if (!getAccessToken()) {
      return [];
    }

    try {
      const result = await spotifyPublicFetch("https://api.spotify.com/v1/me/playlists?limit=20");
      return result.items || [];
    } catch (error) {
      console.warn("Não foi possível carregar playlists do usuário.", error);
      return [];
    }
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
            data-vibe="${vibe.value}"
            style="background: ${vibe.color};"
          >
            ${vibe.label}
          </button>
        `
      )
      .join("");

    vibeButtonsContainer.querySelectorAll(".discover-chip").forEach((button) => {
      button.addEventListener("click", () => {
        const vibeValue = button.dataset.vibe;
        if (discoverInput) {
          discoverInput.value = vibeValue;
        }
        discoverTracks(vibeValue);
      });
    });
  }

  function renderTracks(tracks) {
    if (!musicList) {
      return;
    }

    if (!tracks.length) {
      musicList.innerHTML = `
        <div class="playlist-empty">
          Nenhuma sugestão encontrada. Tente outro artista ou estilo musical.
        </div>
      `;
      return;
    }

    musicList.innerHTML = tracks
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
            <div class="discover-track-actions">
              ${
                track.preview_url
                  ? `<audio controls preload="none"><source src="${track.preview_url}" type="audio/mpeg" /></audio>`
                  : `<a class="spotify-link" href="${track.external_urls?.spotify || "#"}" target="_blank" rel="noreferrer">Abrir no Spotify</a>`
              }
              <select data-track-uri="${track.uri}" data-track-name="${track.name}">
                <option value="">Escolha uma playlist</option>
              </select>
              <button class="discover-add-button" type="button" data-action="discover-add" data-track-uri="${track.uri}">+ Adicionar à Playlist</button>
            </div>
          </article>
        `
      )
      .join("");

    populatePlaylistOptions();

    musicList.querySelectorAll("[data-action='discover-add']").forEach((button) => {
      button.addEventListener("click", async () => {
        const row = button.closest(".search-result-item");
        const selector = row.querySelector("select");
        const playlistId = selector?.value;
        const trackUri = button.dataset.trackUri;

        if (!playlistId) {
          window.alert("Selecione uma playlist antes de adicionar a música.");
          return;
        }

        try {
          await spotifyPublicFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            method: "POST",
            body: JSON.stringify({ uris: [trackUri] }),
          });
          window.alert("Música adicionada à playlist com sucesso.");
        } catch (error) {
          if (error.message.includes("expirou") || error.message.includes("401")) {
            window.alert("Sua sessão do Spotify expirou. Reconecte para continuar.");
            return;
          }

          window.alert(error.message || "Não foi possível adicionar a música.");
        }
      });
    });
  }

  async function populatePlaylistOptions() {
    const playlists = await fetchUserPlaylists();
    const selects = musicList.querySelectorAll("select");

    if (!selects.length) {
      return;
    }

    selects.forEach((select) => {
      select.innerHTML = playlists.length
        ? `<option value="">Escolha uma playlist</option>${playlists
            .map((playlist) => `<option value="${playlist.id}">${playlist.name}</option>`)
            .join("")}`
        : '<option value="">Crie uma playlist no painel de playlists</option>';
    });
  }

  async function discoverTracks(query = "pop") {
    if (!musicList) {
      return;
    }

    if (!getAccessToken()) {
      showFriendlyError("Faça login no Spotify para desbloquear a descoberta de músicas.");
      return;
    }

    try {
      const searchTerm = query.trim() || "pop";
      const endpoint = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchTerm)}&type=track&limit=8&market=BR`;
      const data = await spotifyPublicFetch(endpoint);
      const tracks = data.tracks?.items || [];
      renderTracks(tracks);
    } catch (error) {
      if (error.message.includes("expirou") || error.message.includes("401")) {
        showFriendlyError("Sua sessão do Spotify expirou. Reconecte para continuar.");
        return;
      }

      showFriendlyError(error.message || "Não foi possível carregar sugestões.");
    }
  }

  function attachEvents() {
    if (discoverInput) {
      discoverInput.addEventListener("input", (event) => {
        const value = event.target.value.trim();
        if (!value) {
          discoverTracks("pop");
          return;
        }

        discoverTracks(value);
      });
    }
  }

  function init() {
    renderVibeButtons();
    attachEvents();
    discoverTracks("pop");
  }

  return {
    init,
    discover: discoverTracks,
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  DiscoverMusic.init();
});
