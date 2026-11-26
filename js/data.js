/**
 * Load and parse tablal_226.csv + small shared utilities.
 */

export async function loadOnscrits() {
  const res = await fetch('./tablal_226.csv');
  if (!res.ok) {
    throw new Error(`Impossible de charger tablal_226.csv (${res.status})`);
  }
  const raw = (await res.text()).replace(/^\uFEFF/, '');
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idxNom = headers.indexOf('nom');
  const idxBuque = headers.indexOf('buque');
  const idxFamss = headers.indexOf('famss');
  const idxPhoto = headers.indexOf('photo');

  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const nom = (r[idxNom] || '').trim();
    const buque = (r[idxBuque] || '').trim();
    const famss = (r[idxFamss] || '').trim();
    const photo = (r[idxPhoto] || '').trim();
    if (!nom) continue;
    out.push({
      id: slugify(nom),
      nom,
      buque,
      famss,
      photo,
    });
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function slugify(str) {
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function formatTime(ms) {
  const safe = Math.max(0, Math.round(ms));
  return `${(safe / 1000).toFixed(2)}s`;
}
