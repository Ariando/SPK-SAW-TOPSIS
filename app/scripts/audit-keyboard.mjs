// Audit keyboard, fokus, dan target sentuh pada CSS dan markup.
// Dijalankan: node scripts/audit-keyboard.mjs

import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync('src/styles/global.css', 'utf8');
const issues = [];
const note = (rule, message) => issues.push({ rule, message });

/* ---------- 1. outline: none tanpa pengganti ---------- */
{
  const matches = [...css.matchAll(/outline:\s*(none|0)[^;]*;?/g)];
  for (const match of matches) {
    const before = css.slice(0, match.index);
    const after = css.slice(match.index, match.index + 400);
    const hasReplacement = /:focus-visible[\s\S]{0,300}(outline|box-shadow)/.test(before + after);
    if (!hasReplacement) {
      note('R-32', 'outline dihapus tanpa pengganti fokus: ' + match[0].trim());
    }
  }
}

/* ---------- 2. :focus-visible harus ada ---------- */
{
  if (!/:focus-visible/.test(css)) {
    note('R-32', 'tidak ada aturan :focus-visible');
  } else {
    const block = css.match(/:focus-visible\s*\{[^}]*\}/);
    if (block && !/(outline|box-shadow)/.test(block[0])) {
      note('R-32', ':focus-visible tanpa outline atau box-shadow');
    }
  }
}

/* ---------- 3. Target sentuh minimal 44px di layar kecil ---------- */
{
  const hasTouchRule = /min-height:\s*44px/.test(css);
  if (!hasTouchRule) {
    note('R-03', 'tidak ada aturan min-height 44px untuk layar kecil');
  }

  // Tombol dasar memakai 40px, dinaikkan ke 44px di media query kecil.
  const buttonBlock = css.match(/\.button\s*\{[^}]*\}/);
  if (buttonBlock) {
    const height = buttonBlock[0].match(/min-height:\s*(\d+)px/);
    if (height && Number(height[1]) < 40) {
      note('R-03', 'tinggi tombol dasar kurang dari 40px: ' + height[1] + 'px');
    }
  }

  const inputBlock = css.match(/\.input,\s*\.select,\s*\.textarea\s*\{[^}]*\}/);
  if (inputBlock) {
    const height = inputBlock[0].match(/min-height:\s*(\d+)px/);
    if (height && Number(height[1]) < 40) {
      note('R-03', 'tinggi input dasar kurang dari 40px: ' + height[1] + 'px');
    }
  }
}

/* ---------- 4. prefers-reduced-motion ---------- */
{
  if (/transition:|animation:/.test(css) && !/prefers-reduced-motion/.test(css)) {
    note('Motion', 'ada transisi tetapi tanpa prefers-reduced-motion');
  }
}

/* ---------- 5. Skip link ---------- */
{
  if (!/skip-link/.test(css)) note('R-32', 'tidak ada skip link');
}

/* ---------- 6. Tombol tanpa type di form ---------- */
{
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && e.name.endsWith('.astro') ? [full] : [];
    });

  for (const file of walk('src/pages')) {
    const s = fs.readFileSync(file, 'utf8');
    const rel = file.replace(/\\/g, '/');
    for (const button of s.match(/<button[^>]*>/g) ?? []) {
      if (!/type=/.test(button)) {
        note('R-26', rel + ': tombol tanpa atribut type');
      }
    }
  }
}

/* ---------- 7. Form yang mengubah data harus POST ---------- */
{
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && e.name.endsWith('.astro') ? [full] : [];
    });

  for (const file of walk('src/pages')) {
    const s = fs.readFileSync(file, 'utf8');
    const rel = file.replace(/\\/g, '/');
    for (const form of s.match(/<form[^>]*>/g) ?? []) {
      // Form yang terikat Astro action adalah mutasi, jadi wajib POST. Form
      // lain tanpa action dipakai untuk navigasi dengan GET, misalnya pemilih
      // filter, dan itu bukan masalah keyboard.
      const boundToAction = /action=\{actions\./.test(form);
      if (boundToAction && !/method="post"/.test(form)) {
        note('Form', rel + ': form action tanpa method="post"');
      }
    }
  }
}

/* ---------- 8. label for yang menunjuk id tidak ada ---------- */
{
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && e.name.endsWith('.astro') ? [full] : [];
    });

  for (const file of walk('src/pages')) {
    const s = fs.readFileSync(file, 'utf8');
    const rel = file.replace(/\\/g, '/');
    const ids = new Set([...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    for (const forAttr of s.matchAll(/for="([^"]+)"/g)) {
      if (!ids.has(forAttr[1])) {
        note('R-32', rel + ': label for=' + forAttr[1] + ' tanpa elemen ber-id sama');
      }
    }
  }
}

if (issues.length === 0) {
  console.log('Tidak ada temuan keyboard, fokus, atau target sentuh.');
} else {
  const byRule = new Map();
  for (const issue of issues) {
    if (!byRule.has(issue.rule)) byRule.set(issue.rule, []);
    byRule.get(issue.rule).push(issue.message);
  }
  for (const [rule, list] of [...byRule.entries()].sort()) {
    console.log(`\n[${rule}] ${list.length} temuan`);
    for (const message of list) console.log('  ' + message);
  }
}

console.log(`\nTotal ${issues.length} temuan.`);
process.exit(issues.length === 0 ? 0 : 1);