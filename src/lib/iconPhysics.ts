import { ICONS, PHASES } from '../config/scene';
import { clamp, easeOutCubic, easeOutQuint, lerp, mapRange, phaseProgress } from './math';

/**
 * Ruch ikon — czysta funkcja, tak jak fizyka pudełka.
 *
 * ZASADA NADRZĘDNA: ikona leci PROSTO na swoje miejsce na orbicie.
 *
 * Poprzednia wersja robiła to inaczej — wszystkie wystrzeliwały do jednego
 * punktu nad pudełkiem, tam się zatrzymywały, a dopiero potem rozjeżdżały
 * po obwodzie na swoje pozycje. To dawało trzy osobne ruchy zamiast jednego
 * i wyraźny martwy moment w środku. Klient zgłosił to wprost i miał rację:
 * czytało się jak trzy sklejone animacje, nie jak jedno zdarzenie.
 *
 * Teraz jest jeden ruch: promień rośnie od zera do docelowego, a kąt od
 * początku jest ustawiony na docelowy. Ikona wyjeżdża z pudełka po prostej
 * w stronę swojej pozycji i tam zostaje. Obieg formacji narasta JUŻ W TRAKCIE
 * tego lotu, więc w chwili dotarcia ikona jest w pełnym ruchu — nigdzie
 * nie ma zatrzymania.
 *
 * Efektem ubocznym jest delikatna spirala: kąt zmienia się, gdy promień jeszcze
 * rośnie. To nie jest ozdobnik doklejony do ruchu, tylko konsekwencja tego,
 * że układ już się kręci — i właśnie dlatego wygląda naturalnie.
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

export const computeIconState = (
  index: number,
  progress: number,
  elapsedS: number,
  radiusPx: number,
): IconState => {
  const phaseT = phaseProgress(progress, PHASES.ICONS);

  const delay = ICONS.delays[index] ?? 0;
  const localT = clamp(mapRange(phaseT, delay, delay + ICONS.duration, 0, 1));

  /**
   * Profil prędkości wylotu: piąta potęga. Bardzo gwałtowny start, długie
   * hamowanie. Ikona dostaje impuls raz i dalej tylko wytraca energię —
   * nic jej po drodze nie popycha.
   */
  const flightEased = easeOutQuint(localT);

  /**
   * Narastanie obiegu.
   *
   * To jest mechanizm, który realizuje wymóg „bez żadnych nagłych zatrzymań".
   * Prędkość kątowa dochodzi do pełnej wartości jeszcze w trakcie lotu
   * (domyślnie po 55% drogi), więc ikona nie „ląduje i rusza", tylko
   * cały czas jest w ruchu. Gdyby obieg startował po wylądowaniu, w tym
   * miejscu powstałaby wyraźna dziura.
   */
  const orbitRamp = easeOutCubic(clamp(mapRange(localT, 0, ICONS.orbitRampRatio, 0, 1)));

  /**
   * Obieg jest CIĄGŁY i wspólny dla wszystkich czterech ikon: liczony
   * z czasu, nie ze scrolla. Dzięki temu formacja krąży również wtedy,
   * gdy użytkownik przestanie przewijać — pierścień żyje własnym rytmem,
   * a scroll steruje wyłącznie narracją.
   */
  const orbitDeg = (elapsedS / ICONS.orbitPeriodS) * 360 * orbitRamp;

  /**
   * Kąt docelowy ustawiony jest OD RAZU. Ikona nie „szuka" swojego miejsca —
   * ona od pierwszej klatki leci dokładnie tam, gdzie ma być.
   */
  const slot = ICONS.slotAngles[index] ?? 0;
  const angleRad = (slot + orbitDeg - 90) * DEG;

  /** Promień rośnie od zera: to jest cały lot, jeden ruch. */
  const r = radiusPx * flightEased;

  const x = Math.cos(angleRad) * r;
  /**
   * Przesunięcie startowe do gardzieli pudełka, wygasające wraz z lotem.
   * Przy r = 0 ikona siedzi w otworze; przy pełnym promieniu składnik
   * ten jest już zerowy, więc pozycja leży dokładnie na okręgu.
   */
  const y = Math.sin(angleRad) * r + THROAT_Y * (1 - flightEased);

  /**
   * Skala rośnie od bardzo małej. To jedyny sygnał głębi przy wylocie:
   * ikona startuje w środku pudełka, czyli DALEKO od widza, i przybliża się,
   * wychodząc. Bez tego wygląda, jakby wysunęła się zza kartonu.
   *
   * Wszystkie ikony kończą na skali 1 — żadnego różnicowania wielkości
   * na orbicie. Klient wymaga równomiernego, uporządkowanego układu,
   * a różne rozmiary to od razu wrażenie przypadkowości.
   */
  const scale = lerp(ICONS.startScale, 1, flightEased);

  /**
   * Wyłanianie się. Dopóki ikona nie opuści obrysu pudełka, zasłania ją
   * przednia ściana kartonu (o to dba kolejność rysowania), więc jej
   * poświata nie ma prawa być widoczna — świecąca aura wokół zasłoniętego
   * obiektu natychmiast zdradziłaby, że to dwie płaskie warstwy.
   */
  const emergence = clamp(mapRange(localT, 0.08, 0.34, 0, 1));

  return {
    x,
    y,
    scale,
    // Niewidoczna, dopóki nie ruszy — inaczej cztery kafelki czekałyby
    // stłoczone w gardzieli, zanim przyjdzie ich kolej.
    opacity: localT > 0 ? 1 : 0,
    shadowOpacity: 0.34 * flightEased,
    emergence,
  };
};
