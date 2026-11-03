import fs from 'node:fs';
import path from 'node:path';

const pagesDir = 'src/pages';
const componentsDir = 'src/components';
const layoutsDir = 'src/layouts';

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && e.name.endsWith('.astro') ? [full] : [];
  });

const pages = walk(pagesDir);
const components = walk(componentsDir);
const layouts = walk(layoutsDir);

const layoutSource = layouts.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const layoutHasH1 = /<h1/.test(layoutSource);

const issues = [];
const note = (rule, file, message) => issues.push({ rule, file, message });

/* ---------- 1. Heading ---------- */
for (const file of pages) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  // Halaman redirect tidak merender heading
  const isRedirect = /return Astro\.redirect|redirect\(/.test(s) && !/<App/.test(s);
  if (isRedirect) continue;

  const ownH1 = (s.match(/<h1/g) ?? []).length;
  const usesAppLayout = /<App[\s>]/.test(s);

  if (usesAppLayout && !layoutHasH1) {
    note('Heading', rel, 'memakai layout App tetapi layout tidak menyediakan h1');
  } else if (!usesAppLayout && ownH1 !== 1) {
    note('Heading', rel, `${ownH1} h1 pada halaman tanpa layout App`);
  }

  // Halaman dengan >1 h1 milik sendiri
  if (ownH1 > 1) note('Heading', rel, `${ownH1} h1 di dalam satu halaman`);
}

/* ---------- 2. Tabel tanpa nama aksesibel ---------- */
for (const file of [...pages, ...components]) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  const tables = s.match(/<table[\s\S]*?<\/table>/g) ?? [];
  tables.forEach((table, index) => {
    const hasCaption = /<caption/.test(table);
    const hasLabelledBy = /aria-labelledby/.test(table);
    const hasAriaLabel = /aria-label=/.test(table);
    if (!hasCaption && !hasLabelledBy && !hasAriaLabel) {
      const columns = (table.match(/<th/g) ?? []).length;
      note('R-31', rel, `tabel #${index + 1} (${columns} th) tanpa caption atau aria-label`);
    }
  });
}

/* ---------- 3. Input tanpa label ---------- */
for (const file of [...pages, ...components]) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  for (const block of s.match(/<input[^>]*>/g) ?? []) {
    if (/type="hidden"/.test(block)) continue;
    if (/aria-label=/.test(block)) continue;
    if (/type="(submit|button|reset)"/.test(block)) continue;

    const id = block.match(/id="([^"]+)"/)?.[1];
    if (id) {
      if (!new RegExp(`for="${id}"`).test(s)) {
        note('R-32', rel, `input id=${id} tanpa label for`);
      }
    } else {
      note('R-32', rel, 'input tanpa id dan tanpa aria-label');
    }
  }
}

/* ---------- 4. Interaktif non-native tanpa peran ---------- */
for (const file of [...pages, ...components]) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  const divClick = s.match(/<div[^>]*onclick=/g) ?? [];
  for (const block of divClick) {
    if (!/role="button"/.test(block)) note('R-32', rel, 'div dengan onclick tanpa role="button"');
    if (!/tabindex="0"/.test(block)) note('R-32', rel, 'div dengan onclick tanpa tabindex');
  }
}

/* ---------- 5. Tautan mati ---------- */
for (const file of [...pages, ...components, ...layouts]) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');
  if (/href="#"/.test(s)) note('R-24', rel, 'tautan href="#" tanpa tujuan');
}

/* ---------- 6. Gambar tanpa alt ---------- */
for (const file of [...pages, ...components, ...layouts]) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');
  for (const img of s.match(/<img[^>]*>/g) ?? []) {
    if (!/alt=/.test(img)) note('Alt', rel, 'img tanpa atribut alt');
  }
}

/* ---------- 7. Form mutasi harus POST ---------- */
for (const file of pages) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');
  for (const form of s.match(/<form[^>]*>/g) ?? []) {
    // Form yang terikat ke Astro action adalah mutasi, jadi wajib POST.
    // Form lain tanpa action dipakai untuk navigasi, misalnya pemilih filter,
    // dan GET adalah metode yang benar untuk itu.
    const boundToAction = /action=\{actions\./.test(form);
    if (boundToAction && !/method="post"/.test(form)) {
      note('Form', rel, 'form action tanpa method="post"');
    }
  }
}

/* ---------- 8. Tabel di dalam overflow wrapper ---------- */
for (const file of [...pages, ...components]) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');
  const tables = (s.match(/<table/g) ?? []).length;
  const wrappers = (s.match(/table-wrap/g) ?? []).length;
  if (tables > 0 && wrappers < tables) {
    note('R-03', rel, `${tables} tabel tetapi hanya ${wrappers} pembungkus table-wrap`);
  }
}

/* ---------- Laporan ---------- */
if (issues.length === 0) {
  console.log('Tidak ada temuan.');
} else {
  const byRule = new Map();
  for (const issue of issues) {
    if (!byRule.has(issue.rule)) byRule.set(issue.rule, []);
    byRule.get(issue.rule).push(issue);
  }
  for (const [rule, list] of [...byRule.entries()].sort()) {
    console.log(`\n[${rule}] ${list.length} temuan`);
    for (const item of list) console.log('  ' + item.file + ': ' + item.message);
  }
}

console.log(`\nTotal ${issues.length} temuan, ${new Set(issues.map((i) => i.file)).size} berkas.`);
process.exit(issues.length === 0 ? 0 : 1);