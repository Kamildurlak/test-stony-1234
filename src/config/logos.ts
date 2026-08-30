/**
 * Logotypy platform.
 *
 * ŹRÓDŁO: pliki dostarczone przez klienta, leżą w src/assets/logos/.
 * Nie podmieniać ich na inne bez jego zgody — to jest zestaw zatwierdzony.
 *
 * Ten zestaw jest znacznie lepszy od pierwszego, który dostaliśmy:
 * wszystkie cztery znaki mają IDENTYCZNY układ współrzędnych (viewBox 0 0 24 24),
 * są jednościeżkowe i pozbawione firmowych teł. Dzięki temu odpada cała
 * gimnastyka z normalizacją optyczną, której wymagała poprzednia mieszanka
 * koła, kwadratów i różnych marginesów — cztery znaki po prostu SĄ już
 * jednym zestawem i wystarczy je osadzić na wspólnym kafelku.
 *
 * Kolory pobrane wprost z plików, bez dobierania na oko.
 */

export interface BrandLogo {
  readonly id: 'tiktok' | 'instagram' | 'youtube' | 'facebook';
  /** Nazwa do tekstu alternatywnego — wymóg dostępności z brief'u. */
  readonly label: string;
  /** Kolor znaku na kafelku. */
  readonly ink: string;
  /** Kolor poświaty. Zwykle ten sam co znak. */
  readonly glow: string;
}

export const LOGOS: readonly BrandLogo[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    /**
     * Jedyne odstępstwo od koloru z pliku, i wymuszone.
     *
     * Plik TikToka ma `fill="#000000"` — czerń jest przewidziana do użycia
     * na JASNYM tle. Na naszym ciemnym kafelku znak byłby niewidoczny.
     * Biel to drugi oficjalny wariant tego znaku, przeznaczony dokładnie
     * do takiego zastosowania.
     *
     * Poświata bierze firmową czerwień TikToka, żeby kafelek nie był
     * jedynym bezbarwnym w całej formacji.
     */
    ink: '#FFFFFF',
    glow: '#FE2C55',
  },
  { id: 'instagram', label: 'Instagram', ink: '#FF0069', glow: '#FF0069' },
  { id: 'youtube', label: 'YouTube', ink: '#FF0000', glow: '#FF0000' },
  { id: 'facebook', label: 'Facebook', ink: '#0866FF', glow: '#0866FF' },
] as const;

/**
 * Wspólny kafelek pod znakiem.
 *
 * Ciemny, żeby kolorowe znaki miały kontrast na jasnym tle strony i żeby
 * poświata w barwie marki miała się od czego odbić — na jasnym tle samo
 * świecenie nie działa (patrz komentarz przy GLOW w scene.ts).
 */
export const TILE = {
  /** Bok kafelka w px, w skali projektu bazowego (patrz lib/sceneScale.ts). */
  /** Dwa razy wiecej niz poprzednio (84) — na prosbe klienta. */
  sizePx: 168,
  /** Promień narożnika. Ten sam dla wszystkich czterech — o to cała rzecz. */
  radiusPx: 42,
  background: '#17121F',
  /** Delikatne rozjaśnienie górnej krawędzi — kafelek ma być bryłą, nie plamą. */
  edgeLight: 'inset 0 1px 0 rgba(255,255,255,0.16)',
  /** Ułamek boku kafelka zajmowany przez znak. Reszta to margines optyczny. */
  glyphRatio: 0.5,
} as const;
