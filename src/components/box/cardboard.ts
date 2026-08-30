import type { CSSProperties } from 'react';
import { CARDBOARD } from '../../config/scene';

/**
 * Materiał kartonu.
 *
 * Wydzielone z komponentu, bo to jest DEFINICJA MATERIAŁU, a nie układ —
 * i będzie potrzebna również warstwie WebGL. Trzymanie jej przy komponencie
 * CSS oznaczałoby przepisywanie tych samych decyzji drugi raz.
 *
 * Zasada nadrzędna przy tworzeniu materiału: to, co odróżnia karton od
 * brązowego prostokąta, to NIEREGULARNOŚĆ. Idealnie gładki gradient czyta się
 * jako plastik albo winyl — i dokładnie tak wyglądała pierwsza wersja tego
 * pudełka. Karton potrzebuje trzech rzeczy naraz: włókna, przybrudzenia
 * i widocznej grubości na cięciu.
 */

/**
 * Włókno papieru.
 *
 * `baseFrequency` ma DWIE wartości (X i Y), i to jest tu najważniejszy detal:
 * szum anizotropowy, wyraźnie rozciągnięty w poziomie. Papier powstaje na
 * sicie, na którym włókna układają się wzdłuż kierunku produkcji — dlatego
 * ma widoczny "słój". Szum izotropowy dałby piasek, a nie papier.
 *
 * Filtr jest zamknięty w dokumencie data URI, więc jego identyfikator nie
 * może kolidować z niczym na stronie.
 */
const FIBER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95 0.28' numOctaves='4' seed='11'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23f)' opacity='0.85'/%3E%3C/svg%3E")`;

/**
 * Wielkoskalowe przybrudzenie — nierównomierność koloru na przestrzeni całej
 * ściany. Karton nigdy nie jest jednolity: recyklat daje plamy, transport
 * dokłada przetarcia. Bez tego nawet ładnie oteksturowana ściana wygląda
 * jak próbka materiału, a nie jak używany przedmiot.
 */
const MOTTLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3' seed='5'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.45' intercept='0.55'/%3E%3CfeFuncG type='linear' slope='0.45' intercept='0.55'/%3E%3CfeFuncB type='linear' slope='0.45' intercept='0.55'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23m)' opacity='0.6'/%3E%3C/svg%3E")`;

interface SurfaceOptions {
  /** Gradient bazowy opisujący oświetlenie tej konkretnej ściany. */
  readonly gradient: string;
  /**
   * Okluzja otoczenia — przyciemnienie przy krawędziach, gdzie światło
   * rozproszone dociera gorzej. To jest tania namiastka tego, co w renderze 3D
   * liczy się kosztownie, a wizualnie odpowiada za większość wrażenia bryły.
   */
  readonly occlusion?: string;
  /** Rozjaśnienie kantu łapiącego światło. */
  readonly edgeLight?: string;
}

export const cardboardSurface = ({
  gradient,
  occlusion,
  edgeLight,
}: SurfaceOptions): CSSProperties => ({
  backgroundImage: `${FIBER}, ${MOTTLE}, ${gradient}`,
  backgroundSize: '220px 220px, 400px 400px, 100% 100%',
  /**
   * `soft-light` dla włókna zamiast `multiply`: mnożenie tylko przyciemnia,
   * więc faktura wychodzi brudna i jednostronna. Miękkie światło działa
   * w obie strony — jedne włókna łapią światło, inne są w cieniu, tak jak
   * na prawdziwej powierzchni.
   */
  backgroundBlendMode: 'soft-light, multiply, normal',
  boxShadow: [occlusion, edgeLight].filter(Boolean).join(', ') || undefined,
});

/**
 * Cięta krawędź tektury falistej.
 *
 * To jest NAJMOCNIEJSZY pojedynczy sygnał "to jest karton". Falisty przekrój
 * między dwiema warstwami liniowca rozpoznaje każdy, kto kiedykolwiek otwierał
 * paczkę — i nie ma go żaden inny materiał. Widać go wyłącznie na cięciu,
 * czyli na wolnych krawędziach klap.
 *
 * Realizacja: powtarzalny gradient poziomy udający naprzemienne wypełnienie
 * i pustkę fali. Prawdziwa sinusoida wymagałaby SVG na każdą krawędź;
 * przy tej grubości i tak nikt nie odróżni.
 */
export const CORRUGATION: CSSProperties = {
  /**
   * Kontrast jest tu CELOWO niski, a okres CELOWO drobny.
   *
   * Pierwsza wersja miała mocny, kontrastowy wzór o okresie 4,5 px — i przy
   * krawędzi oglądanej pod bardzo płaskim kątem dawała mory: regularny wzór
   * próbkowany nieregularnie przez siatkę pikseli zamienia się w grzebień.
   * Fala jest więc drobniejsza niż w rzeczywistości i ledwie zaznaczona:
   * ma sugerować grubość materiału, a nie zwracać na siebie uwagę.
   */
  backgroundImage: `repeating-linear-gradient(90deg, ${CARDBOARD.dark} 0px, ${CARDBOARD.base} 1px, ${CARDBOARD.dark} 2.2px)`,
  backgroundSize: '2.2px 100%',
  boxShadow: 'inset 0 1px 2px rgba(30,16,4,0.55)',
};

/**
 * Taśma pakowa.
 *
 * Ma dwie funkcje naraz. Wizualnie: przezroczysty, błyszczący pas kontrastuje
 * z matowym kartonem i natychmiast czyta się jako "zaklejone". Narracyjnie:
 * w Fazie 2 taśma pęka PRZED otwarciem klap — bez niej wystrzał nie ma
 * przyczyny, klapy po prostu odskakują same z siebie.
 */
export const TAPE: CSSProperties = {
  /**
   * Taśma na jasnym krafcie to problem kontrastu: półprzezroczysta biel
   * na jasnobrązowym tle jest praktycznie niewidoczna — pierwsza wersja
   * po prostu znikała.
   *
   * Rozwiązanie bierze się z obserwacji prawdziwej taśmy: nie jest ani biała,
   * ani przezroczysta. Ma lekko bursztynowy odcień od kleju, matowieje
   * w miejscach naprężenia i — co najważniejsze — daje WĄSKI, ostry refleks
   * wzdłuż osi. To ten refleks, a nie sam kolor, mówi oku "to jest folia".
   */
  background: [
    'linear-gradient(100deg,',
    'rgba(214,182,138,0.55) 0%,',
    'rgba(255,246,226,0.82) 14%,',
    'rgba(236,214,178,0.40) 30%,',
    'rgba(206,176,134,0.34) 62%,',
    'rgba(255,248,232,0.62) 88%,',
    'rgba(198,168,126,0.50) 100%)',
  ].join(' '),
  // Brzeg taśmy łapie światło inaczej niż środek, bo klej tworzy tam
  // mikroskopijny wałek. Pod spodem cień — folia leży NA kartonie.
  boxShadow: [
    'inset 1px 0 0 rgba(255,255,255,0.75)',
    'inset -1px 0 0 rgba(255,255,255,0.75)',
    '0 2px 5px rgba(58,38,16,0.32)',
  ].join(', '),
};
