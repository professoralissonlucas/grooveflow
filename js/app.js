// Este arquivo simula dados fictícios para mostrar como a interface vai ficar.
// Como é um projeto de front-end estático, usamos arrays de objetos em JavaScript.
// Isso permite montar os cards dinamicamente sem precisar de banco de dados ou API.

const playlists = [
  {
    title: "Focus Flow",
    subtitle: "32 músicas",
    color: "linear-gradient(135deg, #1db954, #0ea5e9)",
  },
  {
    title: "Night Drive",
    subtitle: "18 músicas",
    color: "linear-gradient(135deg, #8b5cf6, #ec4899)",
  },
  {
    title: "Lo-fi Study",
    subtitle: "27 músicas",
    color: "linear-gradient(135deg, #f59e0b, #ef4444)",
  },
  {
    title: "Vibe Tropical",
    subtitle: "13 músicas",
    color: "linear-gradient(135deg, #22c55e, #14b8a6)",
  },
];

const musicList = [
  { name: "Midnight Echo", artist: "Nova Bloom", time: "3:42", tag: "Synthwave" },
  { name: "Sunset Horizon", artist: "Astra Lane", time: "4:09", tag: "Indie" },
  { name: "Neon Lights", artist: "Velvet District", time: "2:58", tag: "Eletrônica" },
  { name: "Cloudline", artist: "Sora Echo", time: "3:17", tag: "Dream Pop" },
  { name: "Golden Hour", artist: "Mila North", time: "4:24", tag: "Pop" },
];

// Selecionamos os containers onde os elementos serão inseridos na página.
const playlistGrid = document.getElementById("playlist-grid");
const musicContainer = document.getElementById("music-list");

// Esta função cria os cards de playlists com base nos dados do array.
function renderPlaylists() {
  playlistGrid.innerHTML = playlists
    .map(
      (playlist) => `
        <article class="playlist-card">
          <div class="playlist-cover" style="background: ${playlist.color};">
            <span>${playlist.title}</span>
          </div>
          <div class="playlist-info">
            <p class="playlist-name">${playlist.title}</p>
            <p class="playlist-meta">${playlist.subtitle}</p>
          </div>
        </article>
      `
    )
    .join("");
}

// Esta função cria a lista de músicas em destaque.
function renderMusicList() {
  musicContainer.innerHTML = musicList
    .map(
      (music, index) => `
        <article class="music-item">
          <div class="music-index">${index + 1}</div>
          <div class="music-meta">
            <strong>${music.name}</strong>
            <span>${music.artist}</span>
          </div>
          <div class="music-duration">${music.time}</div>
          <div class="music-tag">${music.tag}</div>
        </article>
      `
    )
    .join("");
}

// Chamamos as funções quando a página termina de carregar.
renderPlaylists();
renderMusicList();

// Os comentários abaixo ajudam você a entender a lógica do código.
// 1. O array 'playlists' guarda informações fictícias.
// 2. O array 'musicList' guarda músicas mockadas para a página inicial.
// 3. Cada função gera HTML usando template strings.
// 4. A versão final pode ser adaptada para consumir dados reais futuramente.
