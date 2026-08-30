/**
 * Skleja produkcyjny build w JEDEN plik HTML nadający się do opublikowania
 * jako podgląd dla klienta.
 *
 * Po co: podgląd hostowany jest w środowisku o restrykcyjnej polityce CSP,
 * które nie wpuszcza zewnętrznych arkuszy stylów ani plików z dowolnych
 * domen. Wszystko — style, skrypt i fonty — musi więc jechać w samym
 * dokumencie.
 *
 * Czego to NIE zmienia: normalny build (`npm run build`) zostaje bez zmian.
 * Fonty w produkcji mają być osobnymi, cache'owalnymi plikami, a nie
 * base64 doklejonym do CSS przy każdym wejściu na stronę. To narzędzie
 * istnieje wyłącznie na potrzeby podglądu.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const OUT = process.argv[2] ?? 'dist/preview.html';

const files = readdirSync(ASSETS);
const cssName = files.find((f) => f.endsWith('.css'));
const jsName = files.find((f) => f.endsWith('.js'));
if (!cssName || !jsName) throw new Error('Brak plików CSS/JS w dist/assets — uruchom najpierw build');

let css = readFileSync(join(ASSETS, cssName), 'utf8');
const js = readFileSync(join(ASSETS, jsName), 'utf8');

/* --- Fonty jako data URI ------------------------------------------------ */

let inlined = 0;
for (const file of files.filter((f) => f.endsWith('.woff2'))) {
  const base64 = readFileSync(join(ASSETS, file)).toString('base64');
  const dataUri = `data:font/woff2;base64,${base64}`;
  // Vite emituje odwołania jako /assets/<nazwa>. Podmieniamy każde wystąpienie.
  const before = css;
  css = css.split(`/assets/${file}`).join(dataUri);
  if (css !== before) inlined += 1;
}

/* --- Krój nagłówkowy ----------------------------------------------------- */

/**
 * Cabinet Grotesk jest hostowany przez Fontshare, którego polityka CSP
 * podglądu nie dopuszcza. Google Fonts jest jedynym dozwolonym hostem krojów,
 * więc w PODGLĄDZIE podstawiamy Archivo — grotesk o zbliżonych proporcjach
 * i równie mocnych odmianach grubych.
 *
 * To jest różnica wyłącznie w podglądzie. Uruchomiony lokalnie projekt
 * nadal używa Cabinet Grotesk, zgodnie z ustaleniami.
 */
css = css.replace(/'Cabinet Grotesk'/g, "'Archivo'");

/**
 * Deklaracja kodowania.
 *
 * Środowisko publikujące dokłada własną, ale plik musi być poprawny również
 * otwarty bezpośrednio z dysku — inaczej polskie znaki diakrytyczne
 * rozsypują się na mojibake i nie da się rzetelnie sprawdzić nadruku
 * „OTWÓRZ MNIE" ani żadnego innego napisu.
 */
const html = `<meta charset="utf-8">
<title>Otwórz mnie</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&display=swap" rel="stylesheet">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

writeFileSync(OUT, html);
console.log(
  `Zapisano ${OUT} — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, ${inlined} krojów wbudowanych`,
);
