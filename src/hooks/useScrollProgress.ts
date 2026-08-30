import { useEffect, useRef, type RefObject } from 'react';
import { SCROLL } from '../config/scene';
import { clamp, dampLerp } from '../lib/math';
import { ticker, TICK_PRIORITY } from '../lib/ticker';

/**
 * Stan scrolla, czytany przez całą scenę.
 *
 * Obiekt jest MUTOWALNY i stabilny przez całe życie komponentu — celowo.
 * Gdyby progress trafiał do useState, każda klatka scrolla wywoływałaby
 * przerenderowanie całego drzewa. Przy 60 fps to 60 renderów na sekundę
 * komponentów, z których żaden nie zmienia struktury DOM, a jedynie wartości
 * transformów. To jest najpewniejszy sposób, żeby ta scena nie wyrobiła
 * 60 fps nawet na mocnym laptopie.
 *
 * Zamiast tego: React montuje strukturę RAZ, a animacja żyje wyłącznie
 * w pętli rAF, zapisując transformy wprost do stylów. React nie bierze
 * udziału w klatce.
 */
export interface ScrollState {
  /** Surowy progress 1:1 z pozycją scrolla, 0–1. */
  raw: number;
  /** Progress wygładzony interpolacją — TĄ wartością napędzamy scenę. */
  smooth: number;
  /** Zmiana wygładzonego progressu na sekundę. Znak niesie kierunek scrolla. */
  velocity: number;
  /** true, gdy scena doszła do spoczynku — sygnał do zdjęcia `will-change`. */
  settled: boolean;
}

interface Metrics {
  /** Pozycja górnej krawędzi sekcji w dokumencie (px). */
  startY: number;
  /** Dystans scrolla, na którym progress rośnie od 0 do 1 (px). */
  distance: number;
}

/**
 * Zamienia pozycję scrolla na wygładzoną wartość 0–1 dla sekcji sticky.
 *
 * @param sectionRef element o pełnej wysokości sekcji (ten wysoki, nie sticky)
 * @param reducedMotion gdy true, pomijamy wygładzanie — patrz komentarz niżej
 */
export const useScrollProgress = (
  sectionRef: RefObject<HTMLElement | null>,
  reducedMotion: boolean,
): RefObject<ScrollState> => {
  const stateRef = useRef<ScrollState>({
    raw: 0,
    smooth: 0,
    velocity: 0,
    settled: true,
  });

  const metricsRef = useRef<Metrics>({ startY: 0, distance: 1 });
  const reducedMotionRef = useRef<boolean>(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    /**
     * Pomiary robimy TYLKO przy zmianie rozmiaru, nigdy w klatce animacji.
     * getBoundingClientRect() wymusza synchroniczne przeliczenie layoutu —
     * wywołane 60 razy na sekundę zabiłoby wydajność dokładnie tam, gdzie
     * najbardziej jej potrzebujemy. W pętli czytamy już tylko window.scrollY,
     * które jest darmowe.
     */
    const measure = (): void => {
      const rect = section.getBoundingClientRect();
      const startY = rect.top + window.scrollY;
      // Sekcja sticky "trzyma" ekran przez (wysokość sekcji - wysokość okna).
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      metricsRef.current = { startY, distance };
      readScroll();
    };

    const readScroll = (): void => {
      const { startY, distance } = metricsRef.current;
      stateRef.current.raw = clamp((window.scrollY - startY) / distance);
    };

    /**
     * Wygładzanie żyje w pętli rAF, nie w handlerze scrolla.
     *
     * Zdarzenia scrolla przychodzą nieregularnie i mogą nie pokrywać się
     * z klatkami — na trackpadzie potrafi ich być kilkadziesiąt na sekundę,
     * na kółku myszy kilka. Interpolowanie w handlerze dałoby ruch
     * o prędkości zależnej od urządzenia wejściowego. W pętli mamy stałe,
     * przewidywalne tempo niezależnie od tego, czym użytkownik przewija.
     */
    const onTick = (deltaS: number): void => {
      const state = stateRef.current;
      const previous = state.smooth;

      if (reducedMotionRef.current) {
        /**
         * Przy zredukowanym ruchu nie wygładzamy.
         *
         * To wygląda kontrintuicyjnie — wygładzanie brzmi jak coś "łagodnego" —
         * ale dla osób wrażliwych na ruch problemem jest właśnie rozjazd
         * między gestem a obrazem: ekran dalej płynie, kiedy palec już stanął.
         * Sztywne przypisanie 1:1 sprawia, że obraz porusza się dokładnie tyle,
         * ile użytkownik przewinął, i ani piksela więcej.
         */
        state.smooth = state.raw;
      } else {
        state.smooth = dampLerp(state.smooth, state.raw, SCROLL.smoothing, deltaS);
      }

      state.velocity = deltaS > 0 ? (state.smooth - previous) / deltaS : 0;
      state.settled = Math.abs(state.raw - state.smooth) < SCROLL.settleEpsilon;

      // Domykamy resztkową różnicę, żeby scena zatrzymywała się na dokładnie
      // tej samej wartości, do której zmierza — inaczej progress potrafi
      // zostać na 0.9998 i element nigdy nie dojedzie do pozycji docelowej.
      if (state.settled) state.smooth = state.raw;
    };

    measure();

    // passive: true — deklarujemy, że nie wywołamy preventDefault. Bez tego
    // przeglądarka musi czekać na nasz handler, zanim przewinie stronę,
    // co na telefonie daje wyczuwalne opóźnienie gestu. Brief wymaga wprost:
    // "obsługa gestu dotykowego, bez blokowania natywnego scrolla".
    window.addEventListener('scroll', readScroll, { passive: true });

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(section);
    // Sam ResizeObserver na sekcji nie wystarczy: zmiana wysokości OKNA
    // (pasek adresu na mobile, obrót ekranu) zmienia dystans scrolla,
    // nie zmieniając wysokości elementu.
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    const unsubscribe = ticker.subscribe(onTick, TICK_PRIORITY.SCROLL);

    return () => {
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      resizeObserver.disconnect();
      unsubscribe();
    };
  }, [sectionRef]);

  return stateRef;
};
