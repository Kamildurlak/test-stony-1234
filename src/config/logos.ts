/**
 * Logotypy platform.
 *
 * Decyzja projektowa (uzgodniona z klientem): zdejmujemy firmowe tła i osadzamy
 * sam glif na WSPÓLNYM, ciemnym kafelku o jednakowym kształcie.
 *
 * Powód: pliki dostarczone przez klienta nie tworzą zestawu. Facebook przyszedł
 * jako koło, pozostałe jako zaokrąglone kwadraty, a kafelek YouTube jest biały —
 * na jasnym tle strony po prostu by zniknął, podczas gdy czarny TikTok
 * zlewałby się z ciemnym. Ustawione obok siebie wyglądałyby jak zlepek
 * pobranych plików, a nie jak zaprojektowana formacja.
 *
 * Co ZOSTAJE nienaruszone: kształty glifów i kolory marek, pobrane wprost
 * z plików SVG (brief wymaga tego wprost — nie "mniej więcej podobne").
 * Glif na ciemnym kafelku to zresztą wariant przewidziany przez wytyczne
 * wszystkich czterech marek.
 *
 * Pliki źródłowe leżą nieruszone w src/assets/logos/ jako materiał odniesienia.
 */

export interface BrandLogo {
  readonly id: 'tiktok' | 'instagram' | 'youtube' | 'facebook';
  /** Nazwa do atrybutu alt — wymóg dostępności z brief'u. */
  readonly label: string;
  /**
   * Kolor poświaty, pobrany DOKŁADNIE z pliku SVG dostarczonego przez klienta.
   * Żadnego dobierania na oko.
   */
  readonly glow: string;
  /**
   * Prostokąt otaczający glif w układzie współrzędnych źródłowego SVG.
   * Służy do optycznego wyrównania: same viewBoxy są nieporównywalne,
   * bo każdy plik ma inne marginesy (Facebook miał ich najwięcej —
   * grafika zajmowała mniej niż połowę powierzchni pliku).
   */
  readonly glyphBox: readonly [x: number, y: number, w: number, h: number];
}

export const LOGOS: readonly BrandLogo[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    // Firmowa czerwień z pliku. Cyan #25f4ee to drugi kolor marki, użyty
    // w samym glifie — do poświaty bierzemy dominującą czerwień.
    glow: '#fe2c55',
    glyphBox: [45, 34, 188, 217],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    // Środkowy przystanek firmowego gradientu z pliku (#fa8f21 → #d82d7e).
    glow: '#d82d7e',
    glyphBox: [435, 447, 2496, 2486],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    glow: '#ff0000',
    glyphBox: [240, 552, 2022, 1412],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    glow: '#1977f3',
    glyphBox: [226, 120, 111, 210],
  },
] as const;

/**
 * Wspólny kafelek.
 *
 * Ciemny, żeby kolorowe glify miały kontrast na jasnym tle strony,
 * i żeby poświata w barwie marki miała się od czego odbić — na jasnym tle
 * świecenie samo z siebie nie działa (patrz komentarz przy GLOW w scene.ts).
 */
export const TILE = {
  /** Bok kafelka w px, przed skalowaniem responsywnym. */
  sizePx: 88,
  /** Promień narożnika. Ten sam dla wszystkich czterech — o to cała rzecz. */
  radiusPx: 22,
  background: '#17121F',
  /** Delikatne rozjaśnienie górnej krawędzi — kafelek ma być bryłą, nie plamą. */
  edgeLight: 'inset 0 1px 0 rgba(255,255,255,0.16)',
  /** Ułamek boku kafelka zajmowany przez glif. Reszta to margines optyczny. */
  glyphRatio: 0.54,
} as const;
