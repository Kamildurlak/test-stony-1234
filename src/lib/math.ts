/**
 * Warsztat matematyczny dla całej sceny.
 *
 * Wszystko tutaj to czyste funkcje bez efektów ubocznych — dzięki temu
 * choreografia jest deterministyczna: dla danego `progress` scena zawsze
 * wygląda identycznie, niezależnie od tego, czy użytkownik doszedł do tego
 * miejsca scrollując w dół, czy wracając w górę.
 *
 * To nie jest szczegół techniczny, tylko decyzja produktowa: scroll w obie
 * strony musi dawać ten sam obraz, inaczej sekwencja "rozjeżdża się"
 * przy pierwszym cofnięciu.
 */

export const clamp = (value: number, min = 0, max = 1): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/**
 * Wygładzanie niezależne od liczby klatek na sekundę.
 *
 * Naiwne `current += (target - current) * 0.12` w każdej klatce daje RÓŻNĄ
 * prędkość na 60 Hz i na 144 Hz — na szybkim monitorze scroll dogania cel
 * ponad dwa razy szybciej i cała scena jest "ostrzejsza". Klasyczny błąd,
 * którego nie widać na sprzęcie deweloperskim.
 *
 * Poprawka: traktujemy współczynnik jako tempo zaniku i podnosimy je do potęgi
 * równej liczbie klatek 60 Hz, które zmieściły się w rzeczywistej delcie.
 */
export const dampLerp = (from: number, to: number, smoothing: number, deltaS: number): number => {
  const factor = 1 - Math.pow(1 - smoothing, deltaS * 60);
  return from + (to - from) * factor;
};

/**
 * Mapuje wartość z zakresu wejściowego na wyjściowy, z obcięciem na krańcach.
 * Podstawowe narzędzie do przeliczania globalnego progressu na lokalny.
 */
export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  if (inMax === inMin) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin));
  return outMin + (outMax - outMin) * t;
};

/**
 * Zamienia globalny progress (0–1 całej sekcji) na lokalny progress fazy (0–1).
 * Poza zakresem fazy zwraca 0 lub 1 — nigdy wartości spoza [0,1].
 */
export const phaseProgress = (progress: number, range: readonly [number, number]): number =>
  mapRange(progress, range[0], range[1], 0, 1);

/* ------------------------------------------------------------------------- */
/* EASINGI                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Krzywe czasowe. Świadomie NIE używamy tu jednej uniwersalnej krzywej —
 * brief mówi wprost: "każdy element z osobną krzywą". Krzywa jest częścią
 * charakteru ruchu, tak samo jak czas trwania.
 */

/** Łagodny start i koniec. Domyślny wybór dla ruchu bez wyraźnej przyczyny. */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Szybki start, długie hamowanie. Dla rzeczy, które są POPYCHANE. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Easing wysokiego rzędu — bardzo gwałtowny start, bardzo długie hamowanie.
 * To jest krzywa dla otwarcia klap (brief: "gwałtowny start, długie hamowanie").
 * Piąta potęga jest na granicy tego, co czyta się jeszcze jako ruch,
 * a nie jako teleportacja.
 */
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

/** Powolny start, gwałtowny koniec. Dla rzeczy, które SPADAJĄ lub są wciągane. */
export const easeInCubic = (t: number): number => t * t * t;

/**
 * Grawitacja. Kwadratowa, bo tak działa swobodny spadek w rzeczywistości —
 * i oko to wie, nawet jeśli widz nie umie tego nazwać.
 * Używane przy upadku pudełka (Faza 4) i przy opadaniu w pętli skoków.
 */
export const easeInQuad = (t: number): number => t * t;

/** Odwrotność powyższego — wyhamowanie ruchu w górę. */
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * Przestrzelenie i powrót (follow-through).
 *
 * Brief: "elementy nie zatrzymują się w miejscu docelowym, tylko przestrzeliwują
 * i wracają". To jest funkcja, która sprzedaje, że rzecz ma masę i bezwładność.
 *
 * `overshoot` 1.70158 to klasyczna wartość dająca ~10% przestrzelenia.
 * Podbijamy do 2.2 — ikony mają wyraźnie "dojechać z rozpędu".
 */
export const easeOutBack = (t: number, overshoot = 2.2): number => {
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
};

/**
 * Sprężysty powrót do stanu spoczynku. Dla zgniecenia po lądowaniu —
 * materiał wraca do kształtu z kilkoma coraz słabszymi drganiami.
 */
export const easeOutElastic = (t: number, amplitude = 1, period = 0.3): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const s = (period / (2 * Math.PI)) * Math.asin(1 / Math.max(amplitude, 1));
  return amplitude * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1;
};

/* ------------------------------------------------------------------------- */
/* RUCH PO ŁUKU                                                                */
/* ------------------------------------------------------------------------- */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Kwadratowa krzywa Béziera.
 *
 * Brief: "Ruch idzie po łuku. Linia prosta to sygnatura animacji robionej
 * przez maszynę." To jest narzędzie, które tę zasadę egzekwuje — ikony lecą
 * z pudełka najpierw w górę, potem rozchodzą się na boki, i to jedną
 * płynną krzywą, a nie dwoma sklejonymi ruchami.
 */
export const quadraticBezier = (
  start: Point2D,
  control: Point2D,
  end: Point2D,
  t: number,
): Point2D => {
  const inv = 1 - t;
  const a = inv * inv;
  const b = 2 * inv * t;
  const c = t * t;
  return {
    x: a * start.x + b * control.x + c * end.x,
    y: a * start.y + b * control.y + c * end.y,
  };
};

/* ------------------------------------------------------------------------- */
/* NARZĘDZIA POMOCNICZE                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Formatuje liczbę z separatorami tysięcy (spacja niełamliwa — norma polska).
 * Potrzebne w Fazie 7 przy liczniku wyświetleń.
 */
export const formatCount = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Zaokrągla do zadanej liczby miejsc. Używane przy zapisie transformów do DOM —
 * ogranicza długość stringa CSS, co realnie zmniejsza pracę parsera przy
 * setkach aktualizacji na sekundę.
 */
export const round = (value: number, decimals = 3): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
