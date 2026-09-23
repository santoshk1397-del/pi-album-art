// Spotify Authorization Code flow with PKCE - no client secret, so this is
// safe to run entirely in the browser.

const CLIENT_ID_KEY = 'pi-album-art.client_id';
const VERIFIER_KEY = 'pi-album-art.verifier';
const TOKENS_KEY = 'pi-album-art.tokens';

const SCOPE = 'user-read-playback-state user-read-currently-playing';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export const REDIRECT_URI = `${window.location.origin}/`;

export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || '';
}

function randomString(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function challengeFrom(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function isAuthorized() {
  return Boolean(readTokens()?.refresh_token);
}

export function signOut() {
  localStorage.removeItem(TOKENS_KEY);
  localStorage.removeItem(VERIFIER_KEY);
}

export async function beginLogin(clientId) {
  const verifier = randomString(48);
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(CLIENT_ID_KEY, clientId.trim());

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await challengeFrom(verifier),
    scope: SCOPE,
  });

  window.location.href = `${AUTHORIZE_URL}?${params}`;
}

/** Call once on load: turns a ?code= in the URL into stored tokens. */
export async function completeLoginFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    window.history.replaceState({}, '', REDIRECT_URI);
    throw new Error(`Spotify denied the request: ${error}`);
  }
  if (!code) return false;

  const verifier = localStorage.getItem(VERIFIER_KEY);
  const clientId = getClientId();
  if (!verifier || !clientId) {
    window.history.replaceState({}, '', REDIRECT_URI);
    throw new Error('Login state was lost. Try again.');
  }

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  // Strip the code from the URL whether or not the exchange worked.
  window.history.replaceState({}, '', REDIRECT_URI);

  if (!resp.ok) {
    throw new Error(`Token exchange failed: ${(await resp.json())?.error_description || resp.status}`);
  }

  const payload = await resp.json();
  writeTokens({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000 - 60_000,
  });
  localStorage.removeItem(VERIFIER_KEY);
  return true;
}

/** Returns a valid access token, refreshing it when needed. */
export async function getAccessToken() {
  const tokens = readTokens();
  if (!tokens?.refresh_token) throw new Error('not authorized');
  if (Date.now() < tokens.expires_at) return tokens.access_token;

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!resp.ok) {
    signOut();
    throw new Error('Session expired. Sign in again.');
  }

  const payload = await resp.json();
  writeTokens({
    access_token: payload.access_token,
    // Spotify may or may not hand back a new refresh token.
    refresh_token: payload.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000 - 60_000,
  });
  return payload.access_token;
}
