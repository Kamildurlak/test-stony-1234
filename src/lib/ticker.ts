/**
 * JEDNA pętla requestAnimationFrame dla całej sceny.
 *
 * Brief stawia to jako twardy wymóg: "jedna pętla requestAnimationFrame dla
 * całej sceny, nie osobna na komponent". Powód nie jest kosmetyczny — przy
 * osobnej pętli na komponent tracisz kontrolę nad KOLEJNOŚCIĄ. Silnik scrollu
 * musi policzyć nowy progress ZANIM cokolwiek go odczyta, inaczej połowa sceny
 * rysuje się na wartości z poprzedniej klatki i pojawia się rozjazd o jedną
 * klatkę między pudełkiem a ikonami. Takiego błędu prawie nie da się
 * zdiagnozować po fakcie, więc rozwiązujemy go architekturą, nie debugowaniem.
 *
 * Stąd priorytety: subskrybenci są sortowani rosnąco i wywoływani w tej kolejności.
 */

/** @param deltaS czas od poprzedniej klatki w sekundach (już ograniczony) */
/** @param elapsedS czas od startu pętli w sekundach */
export type TickCallback = (deltaS: number, elapsedS: number) => void;

export const TICK_PRIORITY = {
  /** Silnik scrolla — liczy progress. Musi być pierwszy. */
  SCROLL: 0,
  /** Logika sceny — przelicza progress na stany. */
  SCENE: 10,
  /** Zapis do DOM / render. Musi być ostatni. */
  RENDER: 20,
} as const;

interface Subscriber {
  readonly callback: TickCallback;
  readonly priority: number;
}

/**
 * Górny limit delty. Gdy karta wraca z tła, rAF potrafi zgłosić deltę rzędu
 * kilku sekund — bez obcięcia fizyka skoku "przeskoczyłaby" kilkanaście cykli
 * w jednej klatce i pudełko wystrzeliłoby poza kadr. Ograniczamy do ~4 klatek
 * przy 60 fps: przy chwilowym zacięciu ruch lekko zwolni, zamiast eksplodować.
 */
const MAX_DELTA_S = 1 / 15;

class Ticker {
  private subscribers: Subscriber[] = [];
  private rafId: number | null = null;
  private lastTimeMs = 0;
  private startTimeMs = 0;
  /** Ustawiane, gdy lista subskrybentów zmieni się w trakcie iteracji. */
  private needsSort = false;

  subscribe(callback: TickCallback, priority: number = TICK_PRIORITY.SCENE): () => void {
    this.subscribers.push({ callback, priority });
    this.needsSort = true;
    this.start();

    // Zwracamy funkcję czyszczącą — pasuje wprost do useEffect w React.
    return () => {
      const index = this.subscribers.findIndex((s) => s.callback === callback);
      if (index !== -1) this.subscribers.splice(index, 1);
      if (this.subscribers.length === 0) this.stop();
    };
  }

  private start(): void {
    if (this.rafId !== null) return;
    this.lastTimeMs = performance.now();
    this.startTimeMs = this.lastTimeMs;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private readonly tick = (nowMs: number): void => {
    this.rafId = requestAnimationFrame(this.tick);

    const deltaS = Math.min((nowMs - this.lastTimeMs) / 1000, MAX_DELTA_S);
    this.lastTimeMs = nowMs;
    const elapsedS = (nowMs - this.startTimeMs) / 1000;

    if (this.needsSort) {
      this.subscribers.sort((a, b) => a.priority - b.priority);
      this.needsSort = false;
    }

    // Kopia listy: subskrybent może się wypisać w trakcie własnego wywołania
    // (np. komponent odmontowany przez zmianę stanu), a mutacja tablicy
    // w trakcie pętli pominęłaby następny element.
    const snapshot = this.subscribers.slice();
    for (const { callback } of snapshot) {
      callback(deltaS, elapsedS);
    }
  };
}

/**
 * Instancja współdzielona przez całą aplikację.
 * Świadomie moduł-singleton, a nie React Context: ticker nie ma nic wspólnego
 * z drzewem komponentów, a Context wymusiłby re-render przy każdej zmianie.
 */
export const ticker = new Ticker();
