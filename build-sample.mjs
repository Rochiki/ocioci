// Membuat 2 paket SCORM contoh dari contoh-apd.json lewat baris perintah.
//   npm run build:sample
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { buildPackage, TEMPLATE_FILES } from './packager.js';

const root = new URL('./', import.meta.url);
const template = Object.fromEntries(await Promise.all(TEMPLATE_FILES.map(async (f) => [f, await readFile(new URL(f, root), 'utf8')])));
const { project } = JSON.parse(await readFile(new URL('contoh-apd.json', root), 'utf8'));

/** Ubah data:URL di file contoh menjadi bytes. */
export function revive(v) {
  if (v && typeof v === 'object' && typeof v.data === 'string' && v.data.startsWith('data:')) {
    const [, b64] = v.data.split(',');
    return { ...v, data: new Uint8Array(Buffer.from(b64, 'base64')) };
  }
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  return v;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const version of ['1.2', '2004']) {
    const out = await buildPackage({ ...revive(project), version }, { template, JSZip, type: 'nodebuffer' });
    await writeFile(new URL(out.filename, root), out.data);
    console.log(`✔ ${out.filename}  (${out.files.length} file, ${(out.data.length / 1024).toFixed(1)} KB)`);
  }
}
