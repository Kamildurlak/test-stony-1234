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
  backgroundImage: gradient,
  /**
   * ŻADNEGO ziarna ani szumu — na wyraźną prośbę klienta.
   *
   * Wcześniej powierzchnia miała anizotropowe włókno papieru i wielkoskalowe
   * przybrudzenie; to one zamieniały płaską bryłę w karton. Teraz realizm
   * musi wziąć się wyłącznie z gradientu opisującego kierunek światła,
   * z okluzji przy krawędziach i z fazowania.
   *
   * To jest realizm z fotografii produktowej, nie z magazynu: powierzchnia
   * ma być bez skazy, a bryłę mają budować światło i geometria.
   */
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
/**
 * Połówka taśmy, w całości jako obrazek SVG.
 *
 * Kształt postrzępionej krawędzi MUSI być wpieczony w obrazek, a nie wycięty
 * `clip-path`em — i to jest jedna z najdroższych lekcji w tym pliku.
 *
 * Pierwsza wersja używała `clip-path: polygon(...)`. Zmierzone: 30 fps zamiast
 * 60, czyli połowa budżetu klatki na jeden efekt trwający ułamek sekundy.
 * Powód: pudełko obraca się bez przerwy (mikroobrót w spoczynku), a przycinanie
 * elementu wewnątrz kontekstu `preserve-3d` zmusza przeglądarkę do ponownego
 * rasteryzowania go w KAŻDEJ klatce. Ten sam kształt w tle to jedno
 * rasteryzowanie przy pierwszym renderze i zero kosztu potem.
 *
 * Zasada ogólna, warta zapamiętania: w scenie 3D wszystko, co zmienia KSZTAŁT
 * elementu (clip-path, mask, border-radius na animowanym elemencie), jest
 * drogie. Tanie jest wyłącznie to, co zmienia jego POŁOŻENIE.
 *
 * @param torn 'bottom' dla górnej połówki, 'top' dla dolnej — postrzępiona
 *             jest zawsze ta krawędź, wzdłuż której taśma pęka.
 */
const tapeHalf = (torn: 'top' | 'bottom'): string => {
  const shape =
    torn === 'bottom'
      ? 'M0,0 H100 V93 L82,100 L61,92 L43,100 L24,91 L8,98 L0,94 Z'
      : 'M0,6 L18,0 L39,8 L57,1 L76,9 L92,2 L100,7 V100 H0 Z';

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>
<defs><linearGradient id='t' x1='0' y1='0' x2='1' y2='0.18'>
<stop offset='0' stop-color='#E8DCC8' stop-opacity='.42'/>
<stop offset='.11' stop-color='#FFFFFF' stop-opacity='.88'/>
<stop offset='.22' stop-color='#F4EEE2' stop-opacity='.34'/>
<stop offset='.58' stop-color='#E2D6C4' stop-opacity='.26'/>
<stop offset='.83' stop-color='#FFFFFF' stop-opacity='.7'/>
<stop offset='.93' stop-color='#EDE4D6' stop-opacity='.3'/>
<stop offset='1' stop-color='#DCCFBB' stop-opacity='.4'/>
</linearGradient></defs>
<path d='${shape}' fill='url(%23t)'/>
<path d='${shape}' fill='none' stroke='%23FFFFFF' stroke-opacity='.55' stroke-width='1'/>
</svg>`;

  return `url("data:image/svg+xml,${svg.replace(/\n/g, '').replace(/#/g, '%23').replace(/"/g, "'")}")`;
};

export const TAPE_TOP_HALF: CSSProperties = {
  backgroundImage: tapeHalf('bottom'),
  backgroundSize: '100% 100%',
};

export const TAPE_BOTTOM_HALF: CSSProperties = {
  backgroundImage: tapeHalf('top'),
  backgroundSize: '100% 100%',
};

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
