import { ICONS, PHASES } from '../config/scene';
import { clamp, easeOutBack, easeOutCubic, easeOutQuint, lerp, mapRange, phaseProgress } from './math';

/**
 * Lot ikon — czysta funkcja, tak jak fizyka pudełka.
 *
 * Ruch ma DWA etapy o różnych przyczynach i dlatego różnych krzywych:
 *
 * 1. WYSTRZAŁ — pionowo w górę, prosto z gardzieli pudełka. Ikona jest
 *    wyrzucona: gwałtowny start, długie hamowanie.
 * 2. ROZEJŚCIE — od szczytu elipsy każda ikona jedzie po jej obwodzie na
 *    swoje miejsce. Tu nie ma już wyrzutu, jest przejęcie przez formację,
 *    więc krzywa jest łagodniejsza, z przestrzeleniem na końcu.
 *
 * Sklejenie tego w jeden ruch (jak było wcześniej — jeden łuk Béziera)
 * czytało się jako jedna czynność. Rozdzielenie daje dwie, a to jest
 * dokładnie to, co widz ma zobaczyć: coś wystrzeliło, a potem zostało
 * ustawione w szyku.
 */

export interface IconState {
  /** Pozycja względem środka formacji, w px. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotateDeg: number;
  /** Wahadło wokół osi pionowej po osadzeniu. */
  readonly spinDeg: number;
  readonly opacity: number;
  /** Kolejność rysowania: ikony z przodu elipsy zasłaniają te z tyłu. */
  readonly depth: number;
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
 * Otwór jest u GÓRY bryły, więc ikona musi wyłonić się stamtąd, a nie
 * ze środka kadru. Wartość ujemna, bo oś Y rośnie w dół.
 */
const THROAT_Y = -46;

const DEG = Math.PI / 180;

export const computeIconState = (
  index: number,
  progress: number,
  elapsedS: number,
  radiusPx: number,
): IconState => {
  const phaseT = phaseProgress(progress, PHASES.ICONS);

  const delay = ICONS.delays[index] ?? 0;
  const localT = clamp(mapRange(phaseT, delay, delay + ICONS.duration, 0, 1));

  const radiusY = radiusPx * ICONS.orbitFlatten;

  /* --- ETAP 1: WYSTRZAŁ PIONOWY --- */

  const launchT = clamp(mapRange(localT, 0, ICONS.launchRatio, 0, 1));
  /**
   * Piąta potęga: bardzo gwałtowny start, długie hamowanie. Ikona dostaje
   * impuls raz i dalej tylko wytraca energię — nic jej po drodze nie popycha.
   */
  const launchEased = easeOutQuint(launchT);

  /** Szczyt elipsy — punkt, do którego wystrzeliwują wszystkie ikony. */
  const apexY = -radiusY;
  const launchY = lerp(THROAT_Y, apexY, launchEased);

  /* --- ETAP 2: ROZEJŚCIE PO ELIPSIE --- */

  const spreadT = clamp(mapRange(localT, ICONS.launchRatio, 1, 0, 1));
  const slot = ICONS.slotAngles[index] ?? 0;

  /**
   * Przestrzelenie stosujemy do POSTĘPU po obwodzie, nie do pozycji.
   * Przestrzelona pozycja odjechałaby od elipsy; przestrzelony postęp
   * przenosi ikonę dalej WZDŁUŻ niej i sprowadza z powrotem — czyli ruch
   * zostaje na swoim torze, tak jak przedmiot z bezwładnością.
   */
  const spreadEased = spreadT > 0 ? easeOutBack(easeOutCubic(spreadT), 1.5) : 0;

  /**
   * Powolny obieg całej formacji po osadzeniu.
   *
   * To jest ten „obrót po kole", o który prosił klient: nie każda ikona
   * wokół własnej osi, tylko wszystkie razem po wspólnym torze. Narasta
   * dopiero pod koniec rozejścia, żeby nie walczyć z nim o czytelność.
   */
  const settled = clamp(mapRange(localT, 0.72, 1, 0, 1));
  const orbitDeg = (elapsedS / ICONS.orbitPeriodS) * 360 * settled;

  /** Kąt liczony od szczytu elipsy, zgodnie z ruchem wskazówek zegara. */
  const angleDeg = slot * spreadEased + orbitDeg;
  const angleRad = (angleDeg - 90) * DEG;

  const orbitX = Math.cos(angleRad) * radiusPx;
  const orbitY = Math.sin(angleRad) * radiusY;

  /**
   * Sklejenie etapów.
   *
   * Dopóki trwa wystrzał, pozycja jest czysto pionowa. Potem przechodzimy
   * na elipsę — a ponieważ oba etapy spotykają się dokładnie w szczycie
   * elipsy (kąt 0), przejście jest ciągłe i nie widać w nim szwu.
   */
  const x = spreadT > 0 ? orbitX : 0;
  const y = spreadT > 0 ? orbitY : launchY;

  /* --- GŁĘBIA --- */

  /**
   * Ikona na dole elipsy jest bliżej widza: większa i rysowana na wierzchu.
   * Bez tego elipsa spłaszcza się z powrotem do płaskiej tarczy, bo nic
   * nie sugeruje, że to okrąg widziany pod kątem.
   */
  const depthFactor = Math.sin(angleRad);
  const depthScale = 1 + depthFactor * ICONS.depthScale;

  const baseScale = lerp(ICONS.startScale, 1, easeOutQuint(localT));
  const scale = baseScale * (spreadT > 0 ? depthScale : 1);

  const spinTotal = ICONS.spinDeg[index] ?? 300;
  const rotateDeg = spinTotal * (1 - easeOutQuint(localT));

  /**
   * Wyłanianie się. Dopóki ikona nie opuści obrysu pudełka, zasłania ją
   * przednia ściana kartonu (o to dba kolejność rysowania), więc jej
   * poświata nie ma prawa być widoczna — świecąca aura wokół zasłoniętego
   * obiektu natychmiast zdradziłaby, że to dwie płaskie warstwy.
   */
  const emergence = clamp(mapRange(localT, 0.1, 0.36, 0, 1));

  /* --- RUCH WŁASNY --- */

  const spinPeriod = ICONS.idleSpinPeriodS[index] ?? 12;
  /**
   * Wahadło, nie pełny obrót. Kafelek jest płaski: przy obrocie o 360°
   * dwa razy na cykl staje bokiem i znika, a przez połowę czasu pokazuje
   * lustrzane odbicie znaku marki. Żadna z tych marek na to nie pozwala.
   */
  const spinDeg =
    Math.sin((elapsedS / spinPeriod) * Math.PI * 2 + index * 0.9) * ICONS.idleSwingDeg * settled;

  /** Cień słabnie i kurczy się dla ikon oddalonych (górna część elipsy). */
  const shadowScale = lerp(0.8, 1.05, (depthFactor + 1) / 2) * baseScale;
  const shadowOpacity = lerp(0.16, 0.42, (depthFactor + 1) / 2) * settled;

  return {
    x,
    y,
    scale,
    rotateDeg,
    spinDeg,
    // Niewidoczna, dopóki nie ruszy — inaczej cztery kafelki czekałyby
    // stłoczone w gardzieli, zanim przyjdzie ich kolej.
    opacity: localT > 0 ? 1 : 0,
    depth: depthFactor,
    shadowScale,
    shadowOpacity,
    emergence,
  };
};
