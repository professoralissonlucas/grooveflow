// =============================================================================
// GrooveFlow — Autenticação com o Spotify (Authorization Code + PKCE)
// Sem Client Secret: todo o fluxo roda no navegador (GitHub Pages / http.server).
// =============================================================================

// Client ID do app criado no Spotify Developer Dashboard (https://developer.spotify.com/dashboard).
// Ele é público por natureza no fluxo PKCE; NUNCA coloque o Client Secret neste arquivo.
const SPOTIFY_CLIENT_ID = "3b3f404ae17d4dbb87d61c8b484ad702";

// O Spotify não aceita "localhost" como Redirect URI (apenas o loopback 127.0.0.1).
// Se a página for aberta via localhost, redirecionamos para 127.0.0.1 antes de tudo.
const IS_REDIRECTING_TO_LOOPBACK = window.location.hostname === "localhost";
if (IS_REDIRECTING_TO_LOOPBACK) {
  const loopbackUrl = new URL(window.location.href);
  loopbackUrl.hostname = "127.0.0.1";
  window.location.replace(loopbackUrl.toString());
}

// Redirect URI calculada pelo endereço atual: origin + pathname, sem query string nem hash.
// Assim funciona em http://127.0.0.1:8000/index.html e no GitHub Pages sem editar código.
// Única normalização: caminho terminado em "/" vira ".../index.html", para coincidir com
// a URI cadastrada no Dashboard mesmo quando o usuário abre a pasta raiz.
function getRedirectUri() {
  let path = window.location.pathname;

  if (path.endsWith("/")) {
    path += "index.html";
  }

  return `${window.location.origin}${path}`;
}

const REDIRECT_URI = getRedirectUri();

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
].join(" ");

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Chaves de armazenamento (conforme spec.md).
const TOKEN_STORAGE_KEY = "spotify_access_token";
const REFRESH_TOKEN_KEY = "spotify_refresh_token";
const TOKEN_EXPIRES_AT_KEY = "spotify_token_expires_at";
const USER_STORAGE_KEY = "spotify_user";
const CODE_VERIFIER_KEY = "spotify_code_verifier"; // sessionStorage
const OAUTH_STATE_KEY = "spotify_oauth_state"; // sessionStorage

// Renova o token este tempo antes de ele expirar.
const REFRESH_MARGIN_MS = 60 * 1000;

// Tentativas extras quando o Spotify responde 429 (limite de requisições).
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_SECONDS = 30;

const SESSION_EXPIRED_MESSAGE = "Sua sessão do Spotify expirou. Clique em \"Conectar com Spotify\" para entrar novamente.";
const LOGIN_REQUIRED_MESSAGE = "Faça login no Spotify para continuar.";
const FORBIDDEN_MESSAGE =
  "O Spotify negou o acesso (403). Verifique se a sua conta do Spotify está cadastrada em " +
  "\"User Management\" no app do Spotify Developer Dashboard (apps em Development Mode só " +
  "aceitam usuários cadastrados) ou se você tem permissão para esta operação — por exemplo, " +
  "só é possível alterar playlists criadas por você ou em que você colabora.";

// Estados de sessão do spec.
const SESSION_STATES = Object.freeze({
  LOGGED_OUT: "desconectado",
  LOGGED_IN: "conectado",
  EXPIRED: "expirada",
});

let sessionState = SESSION_STATES.LOGGED_OUT;
let spotifyConnectButton = null;
let spotifyUserPanel = null;
let refreshPromise = null;
let refreshTimer = null;

// Promessa resolvida quando a inicialização da autenticação termina.
// Os outros módulos esperam por ela antes de chamar a API.
let resolveAuthReady = null;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

// -----------------------------------------------------------------------------
// Utilitários
// -----------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createApiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function handleSpotifyError(message) {
  console.error(message);
  window.alert(message);
}

function isSpotifyConfigured() {
  return Boolean(SPOTIFY_CLIENT_ID) && !SPOTIFY_CLIENT_ID.includes("SEU_CLIENT_ID_AQUI");
}

function getAuthElements() {
  spotifyConnectButton = document.getElementById("spotify-connect-btn") || spotifyConnectButton;
  spotifyUserPanel = document.getElementById("spotify-user-panel") || spotifyUserPanel;
  return Boolean(spotifyConnectButton && spotifyUserPanel);
}

// Remove ?code=&state= (ou ?error=) da barra de endereço após o retorno do Spotify.
function cleanAuthParamsFromUrl() {
  const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);
}

// -----------------------------------------------------------------------------
// PKCE
// -----------------------------------------------------------------------------

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Code verifier: 64 caracteres do conjunto permitido pela RFC 7636 (43 a 128).
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

// Code challenge: base64url(SHA-256(verifier)) — método S256.
async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

function generateOAuthState() {
  const randomValues = new Uint8Array(16);
  crypto.getRandomValues(randomValues);
  return base64UrlEncode(randomValues.buffer);
}

// -----------------------------------------------------------------------------
// Armazenamento da sessão
// -----------------------------------------------------------------------------

function saveTokens(tokenData) {
  if (!tokenData || !tokenData.access_token) {
    return;
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, tokenData.access_token);

  // O Spotify pode ou não rotacionar o refresh token; só substituímos quando vier um novo.
  if (tokenData.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token);
  }

  const expiresInSeconds = Number(tokenData.expires_in) || 3600;
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresInSeconds * 1000));

  scheduleTokenRefresh();
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

function getAccessToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
}

function getTokenExpiresAt() {
  return Number(localStorage.getItem(TOKEN_EXPIRES_AT_KEY) || 0);
}

function isSessionExpired() {
  const expiresAt = getTokenExpiresAt();
  return Boolean(expiresAt && Date.now() >= expiresAt);
}

function isLoggedIn() {
  return Boolean(getAccessToken()) && !isSessionExpired();
}

// Existe uma sessão utilizável: token válido ou refresh token para renová-lo.
function hasSession() {
  return Boolean(getAccessToken() || localStorage.getItem(REFRESH_TOKEN_KEY));
}

// Limpa todos os dados de autenticação (tokens, usuário, verifier e state).
function clearSpotifySession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  clearTimeout(refreshTimer);
  refreshTimer = null;
}

// -----------------------------------------------------------------------------
// Estados de sessão e interface (usa somente elementos existentes no index.html)
// -----------------------------------------------------------------------------

function getSessionState() {
  return sessionState;
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
    user?.images && user.images.length > 0 ? user.images[0].url : "https://placehold.co/80x80/1DB954/111111?text=SP";
  const displayName = user?.display_name || "Usuário Spotify";

  if (spotifyConnectButton) {
    spotifyConnectButton.classList.add("hidden");
  }

  if (!spotifyUserPanel) {
    return;
  }

  spotifyUserPanel.classList.remove("hidden");
  spotifyUserPanel.innerHTML = `
    <img class="spotify-user-avatar" src="${escapeHtml(profileImage)}" alt="Foto do perfil do usuário" />
    <div class="spotify-user-text">
      <span>Conectado como</span>
      <strong>${escapeHtml(displayName)}</strong>
    </div>
    <button id="spotify-logout-btn" class="spotify-logout-btn" type="button">Sair</button>
  `;

  document.getElementById("spotify-logout-btn")?.addEventListener("click", handleLogout);
}

function setLoggedIn(user) {
  sessionState = SESSION_STATES.LOGGED_IN;
  renderLoggedInState(user);
}

function setLoggedOut() {
  sessionState = SESSION_STATES.LOGGED_OUT;
  renderLoggedOutState();
}

// Estado "expirada": encerra a sessão local e solicita nova autenticação (uma única vez,
// mesmo que várias requisições falhem ao mesmo tempo).
function expireSession(showAlert = true) {
  const wasActive = sessionState !== SESSION_STATES.EXPIRED && (sessionState === SESSION_STATES.LOGGED_IN || hasSession());

  clearSpotifySession();
  renderLoggedOutState();
  sessionState = SESSION_STATES.EXPIRED;

  if (!wasActive) {
    return;
  }

  window.dispatchEvent(new CustomEvent("grooveflow:session-expired"));

  if (showAlert) {
    handleSpotifyError(SESSION_EXPIRED_MESSAGE);
  }
}

// Compatibilidade com chamadas antigas.
function handleSessionExpired(showAlert = true) {
  expireSession(showAlert);
}

async function handleSpotifyUnauthorized(showAlert = true) {
  expireSession(showAlert);
}

// Logout: limpa tudo e volta ao estado "desconectado".
function handleLogout() {
  const hadSession = hasSession() || sessionState === SESSION_STATES.LOGGED_IN;

  clearSpotifySession();
  setLoggedOut();

  if (hadSession) {
    window.dispatchEvent(new CustomEvent("grooveflow:session-expired"));
  }
}

// -----------------------------------------------------------------------------
// Tokens: troca do code, refresh automático
// -----------------------------------------------------------------------------

async function readTokenError(response) {
  const rawBody = await response.text().catch(() => "");

  try {
    const data = rawBody ? JSON.parse(rawBody) : null;
    return { error: data?.error || "request_failed", description: data?.error_description || rawBody };
  } catch (error) {
    return { error: "request_failed", description: rawBody };
  }
}

async function exchangeCodeForToken(code) {
  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);

  if (!codeVerifier) {
    throw new Error("Código de verificação PKCE não encontrado. Clique em \"Conectar com Spotify\" novamente.");
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }).toString(),
  });

  // O verifier só vale para uma troca.
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  if (!response.ok) {
    const { error, description } = await readTokenError(response);

    if ((description || "").toLowerCase().includes("redirect")) {
      throw new Error(`Redirect URI divergente. Cadastre exatamente esta URI no Dashboard: ${REDIRECT_URI}`);
    }

    if (error === "invalid_grant") {
      throw new Error("Código de autorização inválido ou expirado. Faça login novamente.");
    }

    if (error === "invalid_client") {
      throw new Error("Client ID inválido. Confira o SPOTIFY_CLIENT_ID em js/auth.js.");
    }

    throw new Error(`Erro ao trocar o código por token: ${description || error}`);
  }

  const tokenData = await response.json();

  if (!tokenData.access_token) {
    throw new Error("O Spotify não retornou um access_token.");
  }

  saveTokens(tokenData);

  const user = await spotifyFetch(`${SPOTIFY_API_BASE}/me`);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  setLoggedIn(user);
}

async function requestTokenRefresh() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
      }).toString(),
    });

    if (!response.ok) {
      const { error, description } = await readTokenError(response);
      console.warn("Falha ao renovar o token do Spotify.", error, description);
      return null;
    }

    const tokenData = await response.json();
    saveTokens(tokenData);
    return tokenData.access_token || null;
  } catch (error) {
    console.warn("Falha de rede ao renovar o token do Spotify.", error);
    return null;
  }
}

// Chamadas simultâneas compartilham o mesmo refresh, evitando que um refresh token
// rotacionado seja usado duas vezes.
function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// Agenda a renovação automática um pouco antes de o token expirar.
function scheduleTokenRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = null;

  const expiresAt = getTokenExpiresAt();
  if (!expiresAt || !localStorage.getItem(REFRESH_TOKEN_KEY)) {
    return;
  }

  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_MARGIN_MS);

  refreshTimer = setTimeout(async () => {
    const newToken = await refreshAccessToken();
    if (!newToken && sessionState === SESSION_STATES.LOGGED_IN) {
      expireSession(true);
    }
  }, delay);
}

// Devolve um access token válido, renovando-o se estiver perto de expirar.
async function getValidAccessToken() {
  const token = getAccessToken();
  const expiresAt = getTokenExpiresAt();
  const nearExpiry = !token || !expiresAt || Date.now() >= expiresAt - REFRESH_MARGIN_MS;

  if (!nearExpiry) {
    return token;
  }

  if (!localStorage.getItem(REFRESH_TOKEN_KEY)) {
    return token && !isSessionExpired() ? token : null;
  }

  return refreshAccessToken();
}

// -----------------------------------------------------------------------------
// spotifyFetch: ÚNICO ponto de acesso à Web API, usado por todos os módulos.
// - adiciona o Bearer token (renovando-o se preciso);
// - 401: tenta um refresh; se falhar, encerra a sessão e pede novo login;
// - 403: mensagem sobre cadastro no Dashboard / permissão;
// - 429: aguarda (Retry-After ou espera crescente) e tenta de novo.
// Devolve o JSON da resposta, ou null quando não houver corpo (200/201/204 vazios).
// -----------------------------------------------------------------------------

function getRetryDelaySeconds(response, attempt) {
  const retryAfter = Number(response.headers.get("Retry-After"));
  return retryAfter > 0 ? retryAfter : 2 ** (attempt + 1); // 2s, 4s, 8s
}

async function readApiErrorMessage(response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error_description || "";
  } catch (error) {
    return "";
  }
}

async function spotifyFetch(url, options = {}) {
  const fullUrl = /^https?:\/\//i.test(url) ? url : `${SPOTIFY_API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
  const hadSession = hasSession();
  let triedRefreshAfter401 = false;
  let rateLimitAttempts = 0;

  while (true) {
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      if (hadSession) {
        expireSession(true);
        throw createApiError(SESSION_EXPIRED_MESSAGE, 401);
      }
      throw createApiError(LOGIN_REQUIRED_MESSAGE, 401);
    }

    const hasBody = options.body !== undefined && options.body !== null;
    let response;

    try {
      response = await fetch(fullUrl, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      throw createApiError("Não foi possível conectar ao Spotify. Verifique sua internet e tente novamente.", 0);
    }

    if (response.status === 401) {
      // Token recusado: tenta renovar uma vez antes de encerrar a sessão.
      if (!triedRefreshAfter401 && localStorage.getItem(REFRESH_TOKEN_KEY)) {
        triedRefreshAfter401 = true;
        localStorage.setItem(TOKEN_EXPIRES_AT_KEY, "1"); // força o refresh na próxima volta
        continue;
      }

      expireSession(true);
      throw createApiError(SESSION_EXPIRED_MESSAGE, 401);
    }

    if (response.status === 429) {
      const delaySeconds = getRetryDelaySeconds(response, rateLimitAttempts);

      if (rateLimitAttempts < MAX_RATE_LIMIT_RETRIES && delaySeconds <= MAX_RATE_LIMIT_WAIT_SECONDS) {
        rateLimitAttempts += 1;
        console.warn(`Spotify respondeu 429. Nova tentativa em ${delaySeconds}s (${rateLimitAttempts}/${MAX_RATE_LIMIT_RETRIES}).`);
        await wait(delaySeconds * 1000);
        continue;
      }

      throw createApiError(
        `O Spotify recebeu muitas solicitações. Aguarde ${delaySeconds} segundos e tente novamente.`,
        429
      );
    }

    if (response.status === 403) {
      const detail = await readApiErrorMessage(response);
      throw createApiError(detail ? `${FORBIDDEN_MESSAGE} (Detalhe: ${detail})` : FORBIDDEN_MESSAGE, 403);
    }

    if (!response.ok) {
      const detail = await readApiErrorMessage(response);
      let message;

      if (response.status === 400) {
        message = detail ? `O Spotify recusou a solicitação: ${detail}` : "O Spotify recusou a solicitação.";
      } else if (response.status === 404) {
        message = "O item solicitado não foi encontrado no Spotify.";
      } else if (response.status >= 500) {
        message = "O Spotify está instável no momento. Tente novamente em instantes.";
      } else {
        message = detail || `A API do Spotify respondeu com o status ${response.status}.`;
      }

      throw createApiError(message, response.status);
    }

    const rawBody = await response.text();

    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody);
    } catch (error) {
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// Login e inicialização
// -----------------------------------------------------------------------------

async function startSpotifyLogin() {
  if (!isSpotifyConfigured()) {
    handleSpotifyError("Configure o SPOTIFY_CLIENT_ID em js/auth.js antes de testar a autenticação.");
    return;
  }

  if (!window.crypto || !window.crypto.subtle) {
    handleSpotifyError("Este navegador não oferece o suporte necessário para a autenticação PKCE.");
    return;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const oauthState = generateOAuthState();

  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);

  const authUrl = new URL(SPOTIFY_AUTHORIZE_URL);
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

async function restoreSavedSession() {
  if (!hasSession()) {
    localStorage.removeItem(USER_STORAGE_KEY);
    setLoggedOut();
    return false;
  }

  // Token vencido ou perto de vencer: tenta renovar antes de encerrar a sessão.
  const token = await getValidAccessToken();
  if (!token) {
    expireSession(true);
    return false;
  }

  scheduleTokenRefresh();

  try {
    const user = await spotifyFetch(`${SPOTIFY_API_BASE}/me`);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    setLoggedIn(user);
    return true;
  } catch (error) {
    if (error.status === 401) {
      return false; // spotifyFetch já encerrou a sessão e avisou o usuário.
    }

    if (error.status === 403) {
      clearSpotifySession();
      setLoggedOut();
      handleSpotifyError(error.message);
      return false;
    }

    // Falha temporária (rede, 429, 5xx): mantém a sessão e mostra o perfil salvo.
    console.warn("Não foi possível atualizar o perfil do Spotify.", error);
    const savedUser = getStoredUser();
    if (savedUser) {
      setLoggedIn(savedUser);
      return true;
    }

    setLoggedOut();
    return false;
  }
}

async function initializeAuth() {
  if (!getAuthElements()) {
    return hasSession();
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
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    cleanAuthParamsFromUrl();
    handleSpotifyError(
      authError === "access_denied"
        ? "Login cancelado: a autorização no Spotify não foi concedida."
        : `Autenticação falhou: ${authError}`
    );
    return restoreSavedSession();
  }

  if (authCode) {
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    cleanAuthParamsFromUrl();

    if (!expectedState || !returnedState || returnedState !== expectedState) {
      clearSpotifySession();
      setLoggedOut();
      handleSpotifyError("Falha na validação do estado OAuth. Tente entrar novamente.");
      return false;
    }

    try {
      await exchangeCodeForToken(authCode);
      return true;
    } catch (error) {
      // Login incompleto (ex.: 403 em /me quando a conta não está cadastrada no app):
      // descarta os tokens para não deixar uma sessão inutilizável.
      clearSpotifySession();
      setLoggedOut();
      handleSpotifyError(error.message);
      return false;
    }
  }

  return restoreSavedSession();
}

function whenReady() {
  return authReady;
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

window.spotifyFetch = spotifyFetch;

window.GrooveFlowAuth = {
  spotifyFetch,
  fetchSpotifyApi: spotifyFetch, // alias para compatibilidade
  startSpotifyLogin,
  handleLogout,
  handleSessionExpired,
  handleSpotifyUnauthorized,
  clearSpotifySession,
  getSessionState,
  SESSION_STATES,
  isSessionExpired,
  isLoggedIn,
  hasSession,
  getAccessToken,
  getValidAccessToken,
  refreshAccessToken,
  escapeHtml,
  whenReady,
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
  getUser: getStoredUser,
  init: initializeAuth,
};

async function setupSpotifyAuth() {
  let loggedIn = false;

  try {
    loggedIn = await initializeAuth();
  } catch (error) {
    console.error("Erro ao inicializar a autenticação do Spotify.", error);
    loggedIn = false;
  }

  resolveAuthReady(Boolean(loggedIn));

  if (loggedIn) {
    window.dispatchEvent(new CustomEvent("grooveflow:session-started"));
  }
}

// Ao voltar para a aba (timers podem ser congelados em segundo plano), confere o token.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && sessionState === SESSION_STATES.LOGGED_IN) {
    getValidAccessToken().then((token) => {
      if (!token) {
        expireSession(true);
      } else {
        scheduleTokenRefresh();
      }
    });
  }
});

if (!IS_REDIRECTING_TO_LOOPBACK) {
  console.info(`[GrooveFlow] Redirect URI usada no login: ${REDIRECT_URI}`);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupSpotifyAuth, { once: true });
  } else {
    setupSpotifyAuth();
  }
}
