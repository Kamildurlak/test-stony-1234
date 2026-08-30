import { ICONS, PHASES } from '../config/scene';
import { clamp, easeInOutCubic, easeOutCubic, easeOutQuint, lerp, mapRange, phaseProgress } from './math';

/**
 * Ruch ikon — czysta funkcja, tak jak fizyka pudełka.
 *
 * TRZY ETAPY, w kolejności zamówionej przez klienta:
 *
 * 1. WYSKOK — ikona wystrzeliwuje pionowo w górę z gardzieli pudełka.
 *    Krzywa piątego stopnia: gwałtowny start, długie hamowanie. Dostaje
 *    impuls raz i dalej tylko wytraca energię.
 *
 * 2. USTAWIENIE — ze szczytu wyskoku przechodzi na swoje miejsce na okręgu.
 *    Krzywa symetryczna (in-out), bo to już nie jest wyrzut, tylko
 *    przemieszczenie: rusza z zerową prędkością u szczytu i dochodzi
 *    do pozycji łagodnie.
 *
 * 3. OBRÓT — formacja rusza po wspólnym torze.
 *
 * Kolejność jest widoczna dla widza jako trzy osobne zdarzenia, ale między
 * nimi NIE MA zatrzymań: obieg narasta na ostatnim odcinku ustawiania,
 * więc ikona dojeżdża na miejsce już w ruchu.
 */

export interface IconState {
  /** Pozycja względem środka formacji, w px. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
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

/**
 * Kąt obiegu formacji.
 *
 * Wydzielone, bo korzysta z tego również warstwa smug wiatru — a smugi
 * muszą leżeć DOKŁADNIE na torze ikon. Gdyby każdy komponent liczył ten
 * kąt po swojemu, wystarczyłaby jedna rozbieżność zaokrągleń, żeby smugi
 * odjechały od ikon o kilka pikseli i cały efekt się rozsypał.
 */
export const computeOrbitDeg = (elapsedS: number, ramp: number): number =>
  (elapsedS / ICONS.orbitPeriodS) * 360 * ramp;

/** Ile z lotu jest już „za" ikoną — używane też przez smugi. */
export const computeOrbitRamp = (localT: number): number =>
  easeOutCubic(clamp(mapRange(localT, ICONS.orbitRampStart, 1, 0, 1)));

/** Lokalny postęp lotu danej ikony, z uwzględnieniem jej opóźnienia. */
export const computeLocalT = (index: number, progress: number): number => {
  const phaseT = phaseProgress(progress, PHASES.ICONS);
  const delay = ICONS.delays[index] ?? 0;
  return clamp(mapRange(phaseT, delay, delay + ICONS.duration, 0, 1));
};

export const computeIconState = (
  index: number,
  progress: number,
  elapsedS: number,
  radiusPx: number,
): IconState => {
  const localT = computeLocalT(index, progress);

  /* --- ETAP 1: WYSKOK --- */

  const launchT = clamp(mapRange(localT, 0, ICONS.launchRatio, 0, 1));
  const launchEased = easeOutQuint(launchT);

  const apexY = -radiusPx * ICONS.apexRatio;
  const launchY = lerp(THROAT_Y, apexY, launchEased);
  const launchX = (ICONS.launchSpreadPx[index] ?? 0) * launchEased;

  /* --- ETAP 2: USTAWIENIE NA OKRĘGU --- */

  const settleT = clamp(mapRange(localT, ICONS.launchRatio, ICONS.settleRatio, 0, 1));
  /**
   * Krzywa symetryczna, nie „wyrzutowa". Ikona jest u szczytu w bezruchu
   * i ma płynnie przejść na pozycję — gwałtowny start byłby tu drugim
   * wyrzutem, a przecież nic jej ponownie nie popycha.
   */
  const settleEased = easeInOutCubic(settleT);

  /* --- ETAP 3: OBIEG --- */

  const orbitRamp = computeOrbitRamp(localT);
  const orbitDeg = computeOrbitDeg(elapsedS, orbitRamp);

  const slot = ICONS.slotAngles[index] ?? 0;
  const angleRad = (slot + orbitDeg - 90) * DEG;

  const orbitX = Math.cos(angleRad) * radiusPx;
  const orbitY = Math.sin(angleRad) * radiusPx;

  /**
   * Sklejenie etapów: pozycja jest interpolacją między punktem wyskoku
   * a punktem na okręgu, sterowaną postępem etapu 2. Przy settleT = 0
   * mamy czysty wyskok, przy 1 — czystą orbitę.
   */
  const x = lerp(launchX, orbitX, settleEased);
  const y = lerp(launchY, orbitY, settleEased);

  /**
   * Skala rośnie od bardzo małej. To jedyny sygnał głębi przy wylocie:
   * ikona startuje w środku pudełka, czyli DALEKO od widza, i przybliża się.
   * Wszystkie kończą na 1 — żadnego różnicowania wielkości na orbicie,
   * bo układ ma być równomierny.
   */
  const scale = lerp(ICONS.startScale, 1, easeOutQuint(clamp(localT / ICONS.settleRatio)));

  /**
   * Wyłanianie się. Dopóki ikona nie opuści obrysu pudełka, zasłania ją
   * przednia ściana kartonu (o to dba kolejność rysowania), więc jej
   * poświata nie ma prawa być widoczna — świecąca aura wokół zasłoniętego
   * obiektu natychmiast zdradziłaby, że to dwie płaskie warstwy.
   */
  const emergence = clamp(mapRange(localT, 0.06, 0.3, 0, 1));

  return {
    x,
    y,
    scale,
    // Niewidoczna, dopóki nie ruszy — inaczej cztery kafelki czekałyby
    // stłoczone w gardzieli, zanim przyjdzie ich kolej.
    opacity: localT > 0 ? 1 : 0,
    shadowOpacity: 0.32 * settleEased,
    emergence,
  };
};
