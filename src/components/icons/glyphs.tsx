import { LOGOS, TILE, type BrandLogo } from '../../config/logos';

/**
 * Glify marek, wycięte z plików SVG dostarczonych przez klienta.
 *
 * Z każdego pliku usunięte zostało wyłącznie firmowe TŁO (koło Facebooka,
 * gradientowy kwadrat Instagrama, czarny kafelek TikToka, biały kafelek
 * YouTube). Ścieżki samych glifów są nietknięte, co do przecinka — tak samo
 * jak ich kolory.
 *
 * Normalizacja optyczna: każdy plik ma inny układ współrzędnych i inne
 * marginesy, więc renderowanie ich we wspólnym viewBoxie dałoby cztery różne
 * wielkości. Zamiast tego każdy glif dostaje transformację wyliczoną z jego
 * prostokąta otaczającego, która sprowadza go do wspólnej siatki 100×100.
 * Dopiero wtedy cztery ikony wyglądają na równe — a "równe" znaczy tu
 * "równe optycznie", nie "o tym samym viewBoxie".
 */

/** Wspólna siatka odniesienia dla wszystkich czterech glifów. */
const GRID = 100;

/**
 * Buduje transformację sprowadzającą glif do środka siatki.
 *
 * Skala liczona jest z DŁUŻSZEGO boku, nie z powierzchni — inaczej glif wysoki
 * i wąski (jak litera „f" Facebooka) wyszedłby wyraźnie większy od kwadratowego
 * (jak aparat Instagrama), mimo że formalnie zajmowałyby tyle samo miejsca.
 */
const fit = (box: BrandLogo['glyphBox']): string => {
  const [x, y, w, h] = box;
  const scale = (GRID * TILE.glyphRatio) / Math.max(w, h);
  const cx = GRID / 2 - (x + w / 2) * scale;
  const cy = GRID / 2 - (y + h / 2) * scale;
  return `translate(${cx} ${cy}) scale(${scale})`;
};

const byId = (id: BrandLogo['id']): BrandLogo => {
  const logo = LOGOS.find((l) => l.id === id);
  if (!logo) throw new Error(`Brak definicji logotypu: ${id}`);
  return logo;
};

interface GlyphProps {
  readonly id: BrandLogo['id'];
}

export const BrandGlyph = ({ id }: GlyphProps): React.ReactElement => (
  <svg
    viewBox={`0 0 ${GRID} ${GRID}`}
    width="100%"
    height="100%"
    // Glif jest treścią czysto dekoracyjną: nazwa marki jedzie w atrybucie
    // alt kontenera, więc czytnik ekranu nie ma czytać go dwa razy.
    aria-hidden="true"
    focusable="false"
  >
    <g transform={fit(byId(id).glyphBox)}>{GLYPH_PATHS[id]}</g>
  </svg>
);

/* ------------------------------------------------------------------------- */
/* ŚCIEŻKI                                                                     */
/* ------------------------------------------------------------------------- */

const GLYPH_PATHS: Record<BrandLogo['id'], React.ReactElement> = {
  /**
   * TikTok — nuta w trzech warstwach: biała podstawa plus przesunięcia
   * w firmowym cyanie i czerwieni. To przesunięcie JEST logotypem, więc
   * zostaje dokładnie takie, jak w pliku.
   */
  tiktok: (
    <>
      <g fill="#25f4ee">
        <path d="M120.96 123.89v-8.8a64.83 64.83 0 0 0-9.23-.79c-29.93-.06-56.42 19.33-65.41 47.87s1.62 59.62 26.18 76.71c-25.77-27.58-24.3-70.83 3.28-96.6a68.425 68.425 0 0 1 45.18-18.39z" />
        <path d="M122.62 223.53c16.73-.02 30.48-13.2 31.22-29.92V44.44h27.25a50.7 50.7 0 0 1-.79-9.44h-37.27v149.02c-.62 16.8-14.41 30.11-31.22 30.14-5.02-.04-9.97-1.28-14.42-3.6a31.276 31.276 0 0 0 25.23 12.97zM231.98 95.05v-8.29c-10.03 0-19.84-2.96-28.19-8.51a51.63 51.63 0 0 0 28.19 16.8z" />
      </g>
      <path
        fill="#fe2c55"
        d="M203.8 78.26a51.301 51.301 0 0 1-12.76-33.89h-9.95a51.564 51.564 0 0 0 22.71 33.89zM111.73 151.58c-17.28.09-31.22 14.17-31.13 31.45a31.293 31.293 0 0 0 16.71 27.53c-10.11-13.96-6.99-33.48 6.97-43.6a31.191 31.191 0 0 1 18.34-5.93c3.13.04 6.24.53 9.23 1.45v-37.93c-3.05-.46-6.14-.7-9.23-.72h-1.66v28.84c-3.01-.82-6.12-1.18-9.23-1.09z"
      />
      <path
        fill="#fe2c55"
        d="M231.98 95.05v28.84a88.442 88.442 0 0 1-51.69-16.8v75.77c-.08 37.81-30.75 68.42-68.56 68.42a67.816 67.816 0 0 1-39.22-12.4c25.73 27.67 69.02 29.25 96.7 3.52a68.397 68.397 0 0 0 21.83-50.09v-75.56a88.646 88.646 0 0 0 51.76 16.58V96.21c-3.64-.02-7.26-.4-10.82-1.16z"
      />
      <path
        fill="#fff"
        d="M180.29 182.87V107.1a88.505 88.505 0 0 0 51.76 16.58V94.84a51.73 51.73 0 0 1-28.26-16.58 51.634 51.634 0 0 1-22.71-33.89h-27.25v149.24c-.71 17.27-15.27 30.69-32.54 29.99a31.278 31.278 0 0 1-24.06-12.9c-15.29-8.05-21.16-26.97-13.11-42.26a31.274 31.274 0 0 1 27.53-16.71c3.13.03 6.24.51 9.23 1.44V123.9c-37.74.64-67.82 32.19-67.18 69.93a68.353 68.353 0 0 0 18.73 45.86 67.834 67.834 0 0 0 39.29 11.61c37.82-.01 68.49-30.62 68.57-68.43z"
      />
    </>
  ),

  /**
   * Instagram — kontur aparatu. W pliku źródłowym był biały, wycięty
   * z gradientowego kafelka. Tutaj wypełniamy go tym samym firmowym
   * gradientem, który wcześniej niósł kafelek: marka zachowuje swój kolor,
   * a kafelek staje się wspólny.
   */
  instagram: (
    <>
      <defs>
        <linearGradient id="ig-glyph" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fa8f21" />
          <stop offset="0.5" stopColor="#d82d7e" />
          <stop offset="1" stopColor="#8c3aaa" />
        </linearGradient>
      </defs>
      <path
        fill="url(#ig-glyph)"
        d="M1269.25 1689.52c0-230.11 186.49-416.7 416.6-416.7s416.7 186.59 416.7 416.7-186.59 416.7-416.7 416.7-416.6-186.59-416.6-416.7m-225.26 0c0 354.5 287.36 641.86 641.86 641.86s641.86-287.36 641.86-641.86-287.36-641.86-641.86-641.86S1044 1335 1044 1689.52m1159.13-667.31a150 150 0 1 0 150.06-149.94h-.06a150.07 150.07 0 0 0-150 149.94M1180.85 2707c-121.87-5.55-188.11-25.85-232.13-43-58.36-22.72-100-49.78-143.78-93.5s-70.88-85.32-93.5-143.68c-17.16-44-37.46-110.26-43-232.13-6.06-131.76-7.27-171.34-7.27-505.15s1.31-373.28 7.27-505.15c5.55-121.87 26-188 43-232.13 22.72-58.36 49.78-100 93.5-143.78s85.32-70.88 143.78-93.5c44-17.16 110.26-37.46 232.13-43 131.76-6.06 171.34-7.27 505-7.27S2059.13 666 2191 672c121.87 5.55 188 26 232.13 43 58.36 22.62 100 49.78 143.78 93.5s70.78 85.42 93.5 143.78c17.16 44 37.46 110.26 43 232.13 6.06 131.87 7.27 171.34 7.27 505.15s-1.21 373.28-7.27 505.15c-5.55 121.87-25.95 188.11-43 232.13-22.72 58.36-49.78 100-93.5 143.68s-85.42 70.78-143.78 93.5c-44 17.16-110.26 37.46-232.13 43-131.76 6.06-171.34 7.27-505.15 7.27s-373.28-1.21-505-7.27M1170.5 447.09c-133.07 6.06-224 27.16-303.41 58.06-82.19 31.91-151.86 74.72-221.43 144.18S533.39 788.47 501.48 870.76c-30.9 79.46-52 170.34-58.06 303.41-6.16 133.28-7.57 175.89-7.57 515.35s1.41 382.07 7.57 515.35c6.06 133.08 27.16 223.95 58.06 303.41 31.91 82.19 74.62 152 144.18 221.43s139.14 112.18 221.43 144.18c79.56 30.9 170.34 52 303.41 58.06 133.35 6.06 175.89 7.57 515.35 7.57s382.07-1.41 515.35-7.57c133.08-6.06 223.95-27.16 303.41-58.06 82.19-32 151.86-74.72 221.43-144.18s112.18-139.24 144.18-221.43c30.9-79.46 52.1-170.34 58.06-303.41 6.06-133.38 7.47-175.89 7.47-515.35s-1.41-382.07-7.47-515.35c-6.06-133.08-27.16-224-58.06-303.41-32-82.19-74.72-151.86-144.18-221.43s-139.24-112.27-221.33-144.18c-79.56-30.9-170.44-52.1-303.41-58.06-133.3-6.09-175.89-7.57-515.3-7.57s-382.1 1.41-515.45 7.57"
      />
    </>
  ),

  /**
   * YouTube — prostokąt odtwarzania z wyciętym trójkątem. Trójkąt jest
   * PUSTY, nie biały: przez wycięcie widać ciemny kafelek, dokładnie tak
   * jak logotyp działa na ciemnym tle.
   */
  youtube: (
    <path
      fill="#f00"
      d="m1293.24 1938.65-409.54-7.49c-132.6-2.61-265.53 2.6-395.53-24.44-197.76-40.4-211.77-238.49-226.43-404.65-20.2-233.6-12.38-471.44 25.74-703.09 21.52-129.98 106.21-207.54 237.18-215.98 442.12-30.63 887.18-27 1328.32-12.71 46.59 1.31 93.5 8.47 139.44 16.62 226.77 39.75 232.3 264.23 247 453.2 14.66 190.92 8.47 382.82-19.55 572.44-22.48 157-65.49 288.66-247 301.37-227.42 16.62-449.62 30-677.68 25.74zm-240.77-397.48c171.38-98.4 339.49-195.16 509.89-292.9-171.7-98.4-339.49-195.16-509.89-292.9z"
    />
  ),

  /** Facebook — sama litera „f", w firmowym niebieskim z pliku. */
  facebook: (
    <path
      fill="#1977f3"
      d="m330.67 237.648 5.761-37.601h-36.064v-24.396c0-10.278 5.029-20.318 21.196-20.318h16.405v-32.005s-14.886-2.542-29.115-2.542c-29.7 0-49.122 17.996-49.122 50.604v28.658h-33.029v37.601h33.029v90.875c6.62 1.041 13.405 1.572 20.318 1.572s13.698-.549 20.318-1.572v-90.875h30.304z"
    />
  ),
};
