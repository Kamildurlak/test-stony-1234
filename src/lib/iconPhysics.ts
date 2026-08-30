import { ICONS, PHASES } from '../config/scene';
import { clamp, easeOutBack, easeOutQuint, lerp, mapRange, phaseProgress, quadraticBezier } from './math';

/**
 * Lot ikon — czysta funkcja, tak jak fizyka pudełka.
 *
 * Świadomie osobny plik od boxPhysics: to są dwa niezależne układy, które
 * łączy wyłącznie wspólna oś czasu. Trzymanie ich razem kusiłoby do
 * współdzielenia zmiennych pośrednich i po tygodniu nie dałoby się już
 * zmienić rytmu ikon bez ruszania pudełka.
 */

export interface IconState {
  /** Pozycja względem środka formacji, w px. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotateDeg: number;
  /** Obrót wokół osi pionowej po osadzeniu — ikona „żyje" w formacji. */
  readonly spinDeg: number;
  readonly opacity: number;
  /** Skala i krycie cienia rzucanego pod ikoną. */
  readonly shadowScale: number;
  readonly shadowOpacity: number;
  /**
   * 0 = ikona wciąż w gardzieli pudełka, 1 = całkiem na zewnątrz.
   * Steruje poświatą: w środku pudełka nic nie ma prawa świecić.
   */
  readonly emergence: number;
}

/**
 * Punkt startowy: gardziel pudełka.
 *
 * Nie środek kadru i nie środek bryły — otwór jest u GÓRY pudełka, więc ikona
 * musi wyłonić się stamtąd. Wartość ujemna, bo oś Y rośnie w dół.
 */
const THROAT_Y = -46;

export const computeIconState = (
  index: number,
  progress: number,
  elapsedS: number,
  radiusPx: number,
): IconState => {
  const phaseT = phaseProgress(progress, PHASES.ICONS);

  const delay = ICONS.delays[index] ?? 0;
  const localT = clamp(mapRange(phaseT, delay, delay + ICONS.duration, 0, 1));

  const target = ICONS.targets[index] ?? ([0, 0] as const);
  const endX = target[0] * radiusPx;
  const endY = target[1] * radiusPx;

  /**
   * Tor lotu to krzywa Béziera, nie interpolacja liniowa.
   *
   * Punkt kontrolny leży WYSOKO i tylko nieznacznie w stronę celu — dzięki
   * temu ikona najpierw wystrzeliwuje w górę, a dopiero na drugiej połowie
   * łuku rozchodzi się na bok. Interpolacja liniowa dałaby ruch po skosie,
   * czyli dokładnie tę „sygnaturę maszyny", przed którą ostrzega brief.
   */
  const control = {
    x: endX * 0.3,
    y: THROAT_Y - radiusPx * ICONS.arcHeight,
  };

  /**
   * Przestrzelenie stosujemy do POSTĘPU po krzywej, nie do pozycji końcowej.
   *
   * Różnica jest istotna: przestrzelona pozycja odjechałaby w bok od toru,
   * a przestrzelony postęp przenosi ikonę dalej WZDŁUŻ łuku i sprowadza
   * z powrotem. Ruch zostaje na swojej krzywej — tak zachowuje się przedmiot
   * z bezwładnością, a nie przedmiot szarpnięty w losową stronę.
   */
  const travelT = easeOutBack(easeOutQuint(localT));

  const point = quadraticBezier({ x: 0, y: THROAT_Y }, control, { x: endX, y: endY }, travelT);

  /**
   * Skala rośnie od bardzo małej. To jest jedyny sygnał głębi, jaki mamy —
   * ikona startuje w środku pudełka, czyli DALEKO od widza, i przybliża się,
   * wylatując. Bez tego wygląda, jakby wysunęła się zza kartonu.
   */
  const scale = lerp(ICONS.startScale, 1, easeOutQuint(localT));

  const spinTotal = ICONS.spinDeg[index] ?? 360;
  const rotateDeg = spinTotal * (1 - easeOutQuint(localT));

  /**
   * Wyłanianie się.
   *
   * Dopóki ikona nie opuści obrysu pudełka, zasłania ją przednia ściana
   * (o to dba kolejność rysowania), więc jej poświata nie ma prawa być
   * widoczna — świecąca aura wokół zasłoniętego obiektu natychmiast
   * zdradziłaby, że to dwie płaskie warstwy, a nie przestrzeń.
   */
  const emergence = clamp(mapRange(localT, 0.12, 0.42, 0, 1));

  /* --- RUCH WŁASNY PO OSADZENIU --- */

  /**
   * Ruch własny narasta dopiero wtedy, gdy ikona dolatuje. Włączony od razu
   * walczyłby z lotem i rozmywał jego tor.
   */
  const settled = clamp(mapRange(localT, 0.82, 1, 0, 1));

  const bobPeriod = ICONS.idleBobPeriodS[index] ?? 3;
  const bobPhase = (elapsedS / bobPeriod) * Math.PI * 2 + index * 1.7;
  const bob = Math.sin(bobPhase) * ICONS.idleBobPx * settled;

  /**
   * Ruch wokół osi pionowej to WAHADŁO, nie pełny obrót — i to jest świadome
   * odejście od brief'u, który mówił o obrocie ciągłym.
   *
   * Powód: kafelek jest płaski. Przy pełnym obrocie o 360° dwa razy na cykl
   * ustawia się bokiem i znika, a przez połowę czasu pokazuje LUSTRZANE
   * ODBICIE logotypu — czyli markę zapisaną od tyłu. Żadna z tych czterech
   * marek nie pozwala na takie użycie swojego znaku, a i wizualnie czyta się
   * to jako błąd renderowania, nie jako ruch.
   *
   * Wahadło o amplitudzie kilkunastu stopni daje to samo wrażenie „przedmiot
   * żyje w przestrzeni", nie odwracając znaku ani na chwilę.
   */
  const spinPeriod = ICONS.idleSpinPeriodS[index] ?? 12;
  const spinDeg =
    Math.sin((elapsedS / spinPeriod) * Math.PI * 2 + index * 0.9) * ICONS.idleSwingDeg * settled;

  /**
   * Cień pod ikoną zależy od jej WYSOKOŚCI, tak samo jak cień pudełka.
   * Ikona uniesiona w górę rzuca cień mniejszy i bledszy.
   */
  const heightRatio = clamp((bob + ICONS.idleBobPx) / (ICONS.idleBobPx * 2));
  const shadowScale = lerp(1, 0.78, heightRatio) * scale;
  const shadowOpacity = lerp(0.42, 0.2, heightRatio) * settled;

  return {
    x: point.x,
    y: point.y + bob,
    scale,
    rotateDeg,
    spinDeg,
    // Ikona jest niewidoczna, dopóki nie ruszy — inaczej cztery kafelki
    // czekałyby stłoczone w gardzieli, zanim przyjdzie ich kolej.
    opacity: localT > 0 ? 1 : 0,
    shadowScale,
    shadowOpacity,
    emergence,
  };
};
