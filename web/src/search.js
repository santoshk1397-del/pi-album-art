import { getAccessToken } from './auth';

const SEARCH_URL = 'https://api.spotify.com/v1/search';

// Pushed tracks (YouTube Music via the bridge) arrive without artwork, so we
// look it up in Spotify's catalogue - the same catalogue, mostly, and a far
// better match than a generic web search.
const cache = new Map();

export async function searchArtwork({ title, artist, album }) {
  const key = `${artist}|${album || title}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  // Track search rather than album search: it resolves to the album the song
  // actually belongs to, instead of landing on a deluxe reissue of the name.
  const query = [
    `track:${title}`,
    artist && `artist:${artist}`,
    album && `album:${album}`,
  ].filter(Boolean).join(' ');

  try {
    const token = await getAccessToken();
    const resp = await fetch(
      `${SEARCH_URL}?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) throw new Error(`search returned ${resp.status}`);

    const data = await resp.json();
    const images = data.tracks?.items?.[0]?.album?.images || [];
    const best = images.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a), images[0]);

    const url = best?.url || null;
    cache.set(key, url);
    return url;
  } catch {
    cache.set(key, null);
    return null;
  }
}
