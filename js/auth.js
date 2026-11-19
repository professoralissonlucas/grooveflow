// Configuração principal do Spotify.
// Para forçar uma URI exata, preencha SPOTIFY_REDIRECT_URI.
// Caso fique vazia, o projeto usa a URL atual normalizada para index.html.
const SPOTIFY_CLIENT_ID = "8dce9fc0d3f041a19ffcc17ba2496185";
const SPOTIFY_REDIRECT_URI = "";

function getRedirectUri() {
  if (SPOTIFY_REDIRECT_URI.trim()) {
    return SPOTIFY_REDIRECT_URI.trim();
  }

  let path = window.location.pathname;

  if (path.endsWith("/")) {
    path += "index.html";
  } else if (!/[.]html?$/.test(path)) {
    path = `${path}/index.html`;
  }

  return `${window.location.origin}${path}`;
}

// Calculada uma única vez e compartilhada por todo o fluxo OAuth.
const REDIRECT_URI = getRedirectUri();
const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
].join(" ");

const TOKEN_STORAGE_KEY = "spotify_access_token";
const USER_STORAGE_KEY = "spotify_user";
const CODE_VERIFIER_KEY = "spotify_code_verifier";
const OAUTH_STATE_KEY = "spotify_oauth_state";

let spotifyConnectButton = null;
let spotifyUserPanel = null;

function getAuthElements() {
  spotifyConnectButton = document.getElementById("spotify-connect-btn") || spotifyConnectButton;
  spotifyUserPanel = document.getElementById("spotify-user-panel") || spotifyUserPanel;
  return Boolean(spotifyConnectButton && spotifyUserPanel);
}

function isSpotifyConfigured() {
  return SPOTIFY_CLIENT_ID && !SPOTIFY_CLIENT_ID.includes("SEU_CLIENT_ID_AQUI");
}

function saveAccessToken(tokenData) {
  if (!tokenData || !tokenData.access_token) {
    return;
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, tokenData.access_token);

  if (tokenData.refresh_token) {
    localStorage.setItem("spotify_refresh_token", tokenData.refresh_token);
  }

  if (tokenData.expires_in) {
    const expiresAt = Date.now() + Number(tokenData.expires_in) * 1000;
    localStorage.setItem("spotify_token_expires_at", String(expiresAt));
  }
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateCodeVerifier() {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = new Uint32Array(64);
  crypto.getRandomValues(randomValues);

  let verifier = "";
  randomValues.forEach((value) => {
    verifier += charset[value % charset.length];
  });

  return verifier;
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64UrlEncode(digest);
}

function generateOAuthState() {
  const randomValues = new Uint32Array(8);
  crypto.getRandomValues(randomValues);
  return base64UrlEncode(randomValues.buffer);
}

function renderLoggedOutState() {
  getAuthElements();
  if (spotifyConnectButton) {
    spotifyConnectButton.classList.remove("hidden");
  }
  if (spotifyUserPanel) {
    spotifyUserPanel.classList.add("hidden");
    spotifyUserPanel.innerHTML = "";
  }
}

function renderLoggedInState(user) {
  getAuthElements();
  const profileImage =
    user.images && user.images.length > 0
      ? user.images[0].url
      : "https://placehold.co/80x80/1DB954/111111?text=SP";

  const displayName = user.display_name || "Usuário Spotify";

  if (spotifyConnectButton) {
    spotifyConnectButton.classList.add("hidden");
  }

  if (!spotifyUserPanel) {
    return;
  }

  spotifyUserPanel.classList.remove("hidden");
  spotifyUserPanel.innerHTML = `
    <img class="spotify-user-avatar" src="${profileImage}" alt="Foto do perfil do usuário" />
    <div class="spotify-user-text">
      <span>Conectado como</span>
      <strong>${displayName}</strong>
    </div>
    <button id="spotify-logout-btn" class="spotify-logout-btn" type="button">Sair</button>
  `;

  const logoutButton = document.getElementById("spotify-logout-btn");
  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }
}

function handleSpotifyError(message) {
  console.error(message);
  window.alert(message);
}

async function fetchSpotifyProfile(accessToken) {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    handleSessionExpired(false);
    throw new Error("Sua sessão do Spotify expirou. Faça login novamente para continuar.");
  }

  if (!response.ok) {
    throw new Error("Não foi possível carregar os dados do perfil do Spotify.");
  }

  return response.json();
}

async function exchangeCodeForToken(code) {
  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);

  if (!codeVerifier) {
    throw new Error("Código de verificação PKCE não encontrado. Reinicie o login.");
  }

  if (!/^.{43,128}$/.test(codeVerifier)) {
    throw new Error("Code verifier inválido. Reinicie o login para gerar um novo valor.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let errorData = null;

    try {
      errorData = rawBody ? JSON.parse(rawBody) : null;
    } catch (error) {
      errorData = null;
    }

    const spotifyError = errorData?.error || "request_failed";
    const spotifyDescription = errorData?.error_description || rawBody || "Resposta desconhecida do Spotify.";

    if (spotifyError === "invalid_grant") {
      throw new Error("Código de autorização inválido ou expirado. Reinicie o processo de login.");
    }

    if (spotifyDescription.toLowerCase().includes("redirect")) {
      throw new Error(`Redirect URI divergente. Cadastre exatamente: ${REDIRECT_URI}`);
    }

    throw new Error(`Erro ao trocar código por token: ${spotifyDescription}`);
  }

  const tokenData = await response.json();

  if (!tokenData.access_token) {
    throw new Error("O Spotify não retornou um access_token.");
  }

  saveAccessToken(tokenData);

  const user = await fetchSpotifyProfile(tokenData.access_token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  renderLoggedInState(user);

  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

async function startSpotifyLogin() {
  if (!isSpotifyConfigured()) {
    handleSpotifyError("Configure o SPOTIFY_CLIENT_ID antes de testar a autenticação.");
    return;
  }

  if (!window.crypto || !window.crypto.subtle) {
    handleSpotifyError("Este navegador não oferece suporte necessário para autenticação PKCE.");
    return;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const oauthState = generateOAuthState();

  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.search = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state: oauthState,
    show_dialog: "true",
  }).toString();

  window.location.href = authUrl.toString();
}

function handleLogout() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_token_expires_at");
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  renderLoggedOutState();
  window.dispatchEvent(new CustomEvent("grooveflow:session-expired"));
}

function isSessionExpired() {
  const expiresAt = Number(localStorage.getItem("spotify_token_expires_at") || 0);
  return Boolean(expiresAt && Date.now() >= expiresAt);
}

function isLoggedIn() {
  const accessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  return Boolean(accessToken) && !isSessionExpired();
}

async function getValidAccessToken() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiresAt = Number(localStorage.getItem("spotify_token_expires_at") || 0);

  if (!token) {
    return null;
  }

  if (expiresAt && Date.now() >= expiresAt - 60000) {
    return refreshAccessToken();
  }

  return token;
}

function getAccessToken() {
  // Recupera o access token do armazenamento local usado pela autenticação PKCE.
  return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
}

function getSpotifyAuthorizationHeaders(extraHeaders = {}) {
  // Todas as chamadas autenticadas à API devem enviar este cabeçalho Bearer.
  const accessToken = getAccessToken();

  if (!accessToken) {
    return null;
  }

  return {
    ...extraHeaders,
    Authorization: `Bearer ${accessToken}`,
  };
}

function clearSpotifySession() {
  // Limpa todos os dados da sessão para impedir novas chamadas com credenciais antigas.
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_token_expires_at");
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

async function handleSpotifyUnauthorized(showAlert = false) {
  // Respostas 401 significam token inválido ou expirado no Spotify.
  clearSpotifySession();
  renderLoggedOutState();
  window.dispatchEvent(new CustomEvent("grooveflow:session-expired"));

  if (showAlert) {
    handleSpotifyError("Sua sessão do Spotify expirou. Reconecte sua conta para continuar.");
  }
}

async function fetchSpotifyApi(url, options = {}) {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error("Faça login no Spotify para continuar.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(!options.method || options.method === "GET"
        ? {}
        : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    await handleSpotifyUnauthorized(false);
    throw new Error("Sua sessão do Spotify expirou. Reconecte sua conta para continuar.");
  }

  if (!response.ok) {
    let message = `A API do Spotify respondeu com o status ${response.status}.`;

    try {
      const errorData = await response.json();
      message = errorData?.error?.message || errorData?.error_description || message;
    } catch (error) {
      // Mantém a mensagem padrão quando o Spotify não envia um corpo JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function handleSessionExpired(showAlert = true) {
  handleLogout();
  if (showAlert) {
    handleSpotifyError("Sua sessão do Spotify expirou. Reconecte sua conta para continuar.");
  }
}

function getStoredUser() {
  try {
    const rawUser = localStorage.getItem(USER_STORAGE_KEY);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.warn("Dados do usuário armazenados em formato inválido.", error);
    return null;
  }
}

window.GrooveFlowAuth = {
  startSpotifyLogin,
  handleSessionExpired,
  isSessionExpired,
  isLoggedIn,
  getAccessToken,
  getValidAccessToken,
  refreshAccessToken,
  handleLogout,
  getSpotifyAuthorizationHeaders,
  clearSpotifySession,
  handleSpotifyUnauthorized,
  fetchSpotifyApi,
  getUser: getStoredUser,
  getRedirectUri: () => REDIRECT_URI,
  getPkceConfiguration: () => ({
    clientId: SPOTIFY_CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scopes: SPOTIFY_SCOPES,
  }),
};

window.SpotifyAuth = {
  login: startSpotifyLogin,
  logout: handleLogout,
  getToken: getValidAccessToken,
  getUser: () => {
    try {
      const rawUser = localStorage.getItem(USER_STORAGE_KEY);
      return rawUser ? JSON.parse(rawUser) : null;
    } catch (error) {
      return null;
    }
  },
  init: initializeAuth,
};

async function initializeAuth() {
  if (!getAuthElements()) {
    return;
  }

  // Evita registrar o mesmo listener mais de uma vez.
  if (!spotifyConnectButton.dataset.grooveflowLoginBound) {
    spotifyConnectButton.dataset.grooveflowLoginBound = "true";
    spotifyConnectButton.addEventListener("click", startSpotifyLogin);
  }

  const params = new URLSearchParams(window.location.search);
  const authCode = params.get("code");
  const returnedState = params.get("state");
  const authError = params.get("error");

  if (authError) {
    handleSpotifyError(`Autenticação cancelada ou falhou: ${authError}`);
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
    renderLoggedOutState();
    return;
  }

  if (authCode) {
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);

    if (!expectedState || !returnedState || returnedState !== expectedState) {
      handleLogout();
      handleSpotifyError("Falha na validação do estado OAuth. Tente entrar novamente.");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    try {
      await exchangeCodeForToken(authCode);
      return;
    } catch (error) {
      sessionStorage.removeItem(CODE_VERIFIER_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);
      handleSpotifyError(error.message);
      renderLoggedOutState();
      return;
    }
  }

  const savedUser = localStorage.getItem(USER_STORAGE_KEY);
  const accessToken = localStorage.getItem(TOKEN_STORAGE_KEY);

  if (isSessionExpired()) {
    handleSessionExpired(true);
    return;
  }

  if (accessToken) {
    try {
      const user = await fetchSpotifyProfile(accessToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      renderLoggedInState(user);
      return;
    } catch (error) {
      console.warn("Token salvo inválido.", error);
      handleLogout();
      return;
    }
  }

  if (savedUser) {
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  renderLoggedOutState();
}

function setupSpotifyAuth() {
  if (!getAuthElements()) {
    return;
  }

  initializeAuth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupSpotifyAuth, { once: true });
} else {
  setupSpotifyAuth();
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh_token");

  if (!refreshToken) {
    handleLogout();
    return null;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }).toString(),
  });

  if (!response.ok) {
    handleLogout();
    return null;
  }

  const tokenData = await response.json();
  saveAccessToken(tokenData);
  return tokenData.access_token;
}
