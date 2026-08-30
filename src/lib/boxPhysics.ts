import { ANTICIPATION, BOUNCE, PHASES, SHADOW } from '../config/scene';
import { clamp, easeOutCubic, lerp, phaseProgress } from './math';

/**
 * Fizyka pudełka — CZYSTA funkcja, bez DOM-u, bez Three.js, bez Reacta.
 *
 * To jest świadomie odizolowane od warstwy renderującej. Powód: mamy dwie
 * warstwy (WebGL na desktopie, CSS 3D na telefonie i przy reduced-motion),
 * a pudełko musi w obu podskakiwać IDENTYCZNIE. Gdyby fizyka siedziała
 * w komponentach, mielibyśmy dwie implementacje tego samego ruchu, które
 * po tygodniu przestałyby być tym samym ruchem.
 *
 * Efekt uboczny, ale cenny: skoro to zwykła funkcja liczba → liczby,
 * da się ją przetestować bez uruchamiania przeglądarki.
 */

export interface BoxState {
  /** Wysokość nad podłożem, 0 = kontakt. Jednostki sceny (1.0 = wysokość pudełka). */
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Obrót wokół osi pionowej, stopnie. */
  readonly yawDeg: number;
  readonly shadowScale: number;
  readonly shadowOpacity: number;
  readonly shadowBlurPx: number;
}

/**
 * Jeden cykl podskoku.
 *
 * Tor lotu to CZYSTA PARABOLA, a nie easing w górę i easing w dół. To nie jest
 * ta sama rzecz: parabola ma stałe przyspieszenie, więc obiekt naturalnie
 * "wisi" u szczytu (prędkość pionowa dąży tam do zera) i nabiera prędkości
 * przy spadku. Sklejone easingi dają ruch, który oko czyta jako sztuczny,
 * nawet jeśli widz nie umie wskazać dlaczego.
 *
 * @param elapsedS czas od startu sceny
 * @param progress globalny progress scrolla — wygasza podskoki w fazie zamachu
 */
export const computeBoxState = (elapsedS: number, progress: number): BoxState => {
  /**
   * Wygaszanie podskoków. Przy progress = 0 pudełko skacze pełną amplitudą;
   * w trakcie ANTICIPATION amplituda schodzi do zera.
   *
   * easeOutCubic, a nie liniowo: skoki mają wytracać energię jak prawdziwy
   * odbijający się przedmiot — szybko na początku, coraz mniej pod koniec.
   * Liniowe wygaszanie wygląda, jakby ktoś przykręcał suwak głośności.
   */
  const anticipation = phaseProgress(progress, PHASES.ANTICIPATION);
  const bounceEnergy = 1 - easeOutCubic(anticipation);

  const cycle = (elapsedS % BOUNCE.periodS) / BOUNCE.periodS;

  let height: number;
  let scaleX: number;
  let scaleY: number;

  if (cycle < BOUNCE.flightRatio) {
    /* --- LOT --- */
    const u = cycle / BOUNCE.flightRatio;

    // Parabola 4u(1-u): zero na krańcach, maksimum 1 dokładnie w połowie lotu.
    height = 4 * u * (1 - u) * BOUNCE.height * bounceEnergy;

    /**
     * Rozciągnięcie proporcjonalne do PRĘDKOŚCI PIONOWEJ, nie do wysokości.
     *
     * To jest ta subtelność, która odróżnia squash and stretch zrobiony
     * ze zrozumieniem od zrobionego z pamięci: przedmiot jest najbardziej
     * wyciągnięty tam, gdzie leci najszybciej (tuż po odbiciu i tuż przed
     * lądowaniem), a u szczytu — gdzie na moment zawisa — wraca do
     * naturalnego kształtu. Wiązanie stretcha z wysokością dałoby maksymalne
     * wyciągnięcie u szczytu, czyli dokładnie odwrotnie niż każe fizyka.
     *
     * Pochodna paraboli 4u(1-u) to 4-8u: maksimum co do modułu na krańcach.
     */
    const verticalSpeed = Math.abs(4 - 8 * u) / 4;
    const stretchT = verticalSpeed * bounceEnergy;
    scaleY = lerp(1, BOUNCE.stretchY, stretchT);
    // Zachowanie objętości: co przybywa w pionie, ubywa w poziomie.
    scaleX = lerp(1, BOUNCE.stretchX, stretchT);
  } else {
    /* --- KONTAKT Z PODŁOŻEM --- */
    const u = (cycle - BOUNCE.flightRatio) / (1 - BOUNCE.flightRatio);
    height = 0;

    /**
     * Zgniecenie jest maksymalne w chwili uderzenia i wraca do kształtu.
     *
     * Skok wartości między końcem lotu (rozciągnięcie) a początkiem kontaktu
     * (zgniecenie) jest CELOWY i nie jest błędem — uderzenie jest zdarzeniem
     * natychmiastowym. Wygładzenie tego przejścia zabiłoby cały efekt masy.
     */
    const recovery = easeOutCubic(u);
    scaleY = lerp(BOUNCE.squashY, 1, recovery);
    scaleX = lerp(BOUNCE.squashX, 1, recovery);

    // Przy wygaszonych skokach zgniecenie też musi zniknąć, inaczej pudełko
    // pulsowałoby w miejscu po zatrzymaniu podskoków.
    scaleY = lerp(1, scaleY, bounceEnergy);
    scaleX = lerp(1, scaleX, bounceEnergy);
  }

  /* --- ZAMACH: przykucnięcie przed wystrzałem --- */
  if (anticipation > 0) {
    const crouch = easeOutCubic(anticipation);
    scaleY = lerp(scaleY, ANTICIPATION.crouchY, crouch);
    scaleX = lerp(scaleX, ANTICIPATION.crouchX, crouch);
    height -= ANTICIPATION.sinkDepth * crouch;
  }

  /**
   * Mikroobrót wokół osi pionowej, niezsynchronizowany z rytmem skoków.
   *
   * Brief wymaga tego wprost i ma rację: gdyby obrót miał ten sam okres
   * co podskok, po dwóch–trzech cyklach oko rozpoznałoby pętlę i cała scena
   * zaczęłaby wyglądać na zapętlony gif. Przy okresach 0.75 s i 5.3 s
   * układ powtarza się dopiero po kilkudziesięciu sekundach — nikt tyle
   * nie patrzy na stan spoczynku.
   */
  const yawDeg = Math.sin((elapsedS / BOUNCE.yawPeriodS) * Math.PI * 2) * BOUNCE.yawAmplitudeDeg;

  /**
   * Cień jako funkcja wysokości.
   *
   * Bez tego pudełko jest naklejką, która zmienia rozmiar — z tym staje się
   * przedmiotem w przestrzeni. Trzy parametry jednocześnie (skala, krycie,
   * rozmycie) dlatego, że tak zachowuje się prawdziwy cień: im dalej od
   * powierzchni, tym mniejszy, jaśniejszy i bardziej rozmyty.
   */
  const heightRatio = clamp(height / BOUNCE.height);
  const shadowScale = lerp(SHADOW.scaleGround, SHADOW.scaleApex, heightRatio);
  const shadowOpacity = lerp(SHADOW.opacityGround, SHADOW.opacityApex, heightRatio);
  const shadowBlurPx = lerp(SHADOW.blurGroundPx, SHADOW.blurApexPx, heightRatio);

  return { y: height, scaleX, scaleY, yawDeg, shadowScale, shadowOpacity, shadowBlurPx };
};
