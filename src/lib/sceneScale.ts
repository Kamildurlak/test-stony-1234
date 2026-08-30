/**
 * Wspólna skala sceny orbitalnej.
 *
 * Kluczowa zasada: pierścień ikon i grafika w jego środku MUSZĄ skalować się
 * razem, jednym współczynnikiem. Gdyby każdy element dopasowywał się do okna
 * osobno — ikony przez własny wzór, karta przez media query — ich wzajemne
 * odstępy zmieniałyby się przy każdej szerokości ekranu i na którejś z nich
 * nieuchronnie doszłoby do nachodzenia.
 *
 * Przy jednym współczynniku odstęp policzony raz w pikselach bazowych jest
 * gwarantowany na KAŻDYM ekranie. To jest różnica między „sprawdziłem kilka
 * szerokości i wygląda OK" a „nie może się nałożyć".
 */

/**
 * Wymiary projektu bazowego: pełna średnica pierścienia z kafelkami plus
 * margines oddechu. Wszystkie wartości w scene.ts są liczone w tej skali.
 */
export const SCENE_DESIGN = {
  widthPx: 890,
  heightPx: 890,
} as const;

/**
 * Zwraca współczynnik, przy którym cała scena mieści się w oknie.
 *
 * Nigdy nie powiększa ponad 1 — grafika ma stałą, zaprojektowaną wielkość,
 * a nie rozciągać się na wielkich monitorach.
 */
export const getSceneScale = (): number => {
  if (typeof window === 'undefined') return 1;
  const margin = 48;
  return Math.min(
    1,
    (window.innerWidth - margin) / SCENE_DESIGN.widthPx,
    (window.innerHeight - margin) / SCENE_DESIGN.heightPx,
  );
};
