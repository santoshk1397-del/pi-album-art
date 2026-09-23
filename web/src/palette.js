// Pulls a dominant colour out of the cover so the UI tints itself per album.
// Spotify's CDN allows cross-origin reads; if that ever changes we just fall
// back to the neutral accent rather than breaking the page.

const FALLBACK = { r: 122, g: 132, b: 148 };

function score({ r, g, b }, count) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = max / 255;
  // Favour colours that are vivid but not blown out or nearly black.
  const usable = brightness > 0.15 && brightness < 0.95 ? 1 : 0.15;
  return count * (0.25 + saturation) * usable;
}

export function dominantColor(img) {
  try {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      // Quantise to 32-value steps so near-identical pixels group together.
      const r = data[i] & 0xe0;
      const g = data[i + 1] & 0xe0;
      const b = data[i + 2] & 0xe0;
      const key = (r << 16) | (g << 8) | b;
      const entry = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      entry.r += data[i];
      entry.g += data[i + 1];
      entry.b += data[i + 2];
      entry.count += 1;
      buckets.set(key, entry);
    }

    let best = null;
    let bestScore = -1;
    for (const entry of buckets.values()) {
      const avg = {
        r: Math.round(entry.r / entry.count),
        g: Math.round(entry.g / entry.count),
        b: Math.round(entry.b / entry.count),
      };
      const s = score(avg, entry.count);
      if (s > bestScore) {
        bestScore = s;
        best = avg;
      }
    }
    return best || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Lifts a colour to a consistent brightness so it reads on a dark ground. */
export function toAccent({ r, g, b }) {
  const max = Math.max(r, g, b, 1);
  const lift = Math.min(235 / max, 2.2);
  const mix = (v) => Math.round(Math.min(255, v * lift));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
