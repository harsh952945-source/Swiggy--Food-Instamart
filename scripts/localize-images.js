// Downloads every external image link (http/https) used by vendors and products
// into public/images/, then updates the database to point at the local copy.
// Run on your own computer:  npm run localize-images
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' };

async function download(url, destBase) {
  const res = await fetch(url, {
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    headers: { 'User-Agent': 'Mozilla/5.0 (ZappyEats image localizer)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) throw new Error('not an image (' + (type || 'unknown type') + ')');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error('file too small, probably not a real image');
  fs.mkdirSync(path.dirname(destBase), { recursive: true });
  fs.writeFileSync(destBase + '.' + ext, buf);
  return ext;
}

async function run(table, folder) {
  const rows = db.prepare(`SELECT id, name, image_url FROM ${table} WHERE image_url LIKE 'http%'`).all();
  let ok = 0; const failed = [];
  for (const r of rows) {
    try {
      const ext = await download(r.image_url, path.join(__dirname, '..', 'public', 'images', folder, String(r.id)));
      db.prepare(`UPDATE ${table} SET image_url = ? WHERE id = ?`).run(`/images/${folder}/${r.id}.${ext}`, r.id);
      ok++;
      console.log(`  ok   ${table} #${r.id} ${r.name}`);
    } catch (e) {
      failed.push({ id: r.id, name: r.name, url: r.image_url, why: e.message });
      console.log(`  FAIL ${table} #${r.id} ${r.name} -> ${e.message}`);
    }
  }
  return { ok, failed };
}

(async () => {
  console.log('Downloading vendor images...');
  const v = await run('vendors', 'vendors');
  console.log('Downloading product images...');
  const p = await run('products', 'products');
  console.log(`\nDone. Saved ${v.ok + p.ok} images locally.`);
  const failed = [...v.failed.map(f => ({ ...f, t: 'vendor' })), ...p.failed.map(f => ({ ...f, t: 'product' }))];
  if (failed.length) {
    console.log(`\n${failed.length} image(s) could NOT be downloaded. Replace these in the admin panel (upload a file or use a different link):`);
    failed.forEach(f => console.log(` - ${f.t} #${f.id} "${f.name}": ${f.why}\n   ${f.url}`));
  }
  console.log('\nNext: run  npm run export-seed  to save everything into db/seed-data.json');
})();
