import type { CSSProperties } from 'react';
import { CARDBOARD, FLAP_SHAPE } from '../../config/scene';

/**
 * Materiał kartonu.
 *
 * Wydzielone z komponentu, bo to jest DEFINICJA MATERIAŁU, a nie układ —
 * i będzie potrzebna również warstwie WebGL. Trzymanie jej przy komponencie
 * CSS oznaczałoby przepisywanie tych samych decyzji drugi raz.
 *
 * Zasada nadrzędna, po zmianie kierunku na styl ILUSTRACYJNY: skoro klient
 * wyklucza fakturę, a referencja jest rysunkiem, bryłę musi zbudować samo
 * ŚWIATŁO. Zostają trzy narzędzia i tylko trzy: różnica jasności między
 * ścianami, przyciemnienie przy krawędziach (okluzja) oraz wąskie refleksy
 * na kantach. Każde z nich jest statyczne, więc nie kosztuje ani jednej
 * klatki.
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
   * To jest realizm z ilustracji produktowej, nie z magazynu: powierzchnia
   * ma być bez skazy, a bryłę mają budować światło i geometria.
   */
  boxShadow: [occlusion, edgeLight].filter(Boolean).join(', ') || undefined,
});

/**
 * Miękkie światło kluczowe na ścianie.
 *
 * Sam gradient liniowy opisuje kierunek światła, ale nie opisuje ŹRÓDŁA:
 * przejście jest równomierne na całej wysokości, więc ściana czyta się jako
 * oświetlona z nieskończoności. Rysunek robi to inaczej — kładzie jaśniejszą
 * plamę tam, gdzie pada światło, i to ona mówi oku, że lampa jest blisko.
 *
 * Zwracamy warstwę gradientu do doklejenia PRZED gradientem bazowym
 * (w CSS pierwsza warstwa jest na wierzchu).
 *
 * @param x pozycja plamy w % szerokości ściany
 * @param y pozycja w % wysokości
 * @param size zasięg w % krótszego boku
 * @param strength krycie w szczycie
 */
export const keyLight = (x: number, y: number, size: number, strength: number): string =>
  `radial-gradient(ellipse ${size}% ${size * 1.15}% at ${x}% ${y}%, ` +
  `rgba(255,250,236,${strength}) 0%, ` +
  // Trzy przystanki, nie dwa: przejście z połowicznym krokiem w środku znosi
  // pasmowanie Macha, które przy tak dużej plamie rysuje widoczny okrąg.
  `rgba(255,250,236,${(strength * 0.42).toFixed(3)}) 42%, ` +
  `rgba(255,250,236,0) 100%)`;

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
 * Sylwetka klapy — łuk na wolnej krawędzi, zmiękczenie przy zawiasie.
 *
 * Zawias jest zawsze u GÓRY panelu (transformOrigin: 50% 0), więc kolejność
 * narożników w `border-radius` — lewy górny, prawy górny, prawy dolny, lewy
 * dolny — oznacza tu: zawias, zawias, wolna krawędź, wolna krawędź.
 *
 * Zapis z ukośnikiem rozdziela promień poziomy od pionowego i jest tu
 * konieczny: łuk ma być SZEROKI I PŁYTKI. Jeden promień dałby ćwiartkę koła,
 * czyli wycięcie tak głębokie, że przy zamkniętym pudełku odsłoniłoby wnętrze.
 */
export const FLAP_RADIUS =
  `${FLAP_SHAPE.hingeRadiusPx}px ${FLAP_SHAPE.hingeRadiusPx}px ` +
  `${FLAP_SHAPE.archRadiusXPct}% ${FLAP_SHAPE.archRadiusXPct}% / ` +
  `${FLAP_SHAPE.hingeRadiusPx}px ${FLAP_SHAPE.hingeRadiusPx}px ` +
  `${FLAP_SHAPE.archRadiusYPct}% ${FLAP_SHAPE.archRadiusYPct}%`;

/**
 * Pasmo połysku przeciągnięte po klapie.
 *
 * Referencja od klienta ma je na każdej klapie i to nie jest ozdobnik: na
 * ilustracji, pozbawionej faktury i cieni własnych, ukośny błysk jest jedyną
 * rzeczą, która mówi, że powierzchnia jest PŁASKA I GŁADKA. Bez niego klapa
 * czyta się jak wycinanka z papieru.
 *
 * Kąt 118° zamiast 90°: błysk ma iść w poprzek klapy, ale nie równolegle do
 * żadnej z jej krawędzi. Równoległy czytałby się jako pas nadruku.
 */
export const FLAP_GLOSS: CSSProperties = {
  backgroundImage:
    `linear-gradient(118deg, ` +
    `rgba(255,255,255,0) 0%, ` +
    `rgba(255,255,255,0) 26%, ` +
    `${CARDBOARD.sheen} 40%, ` +
    // Szczyt jest WĄSKI (40–48%), a zejście długie. Symetryczny błysk wygląda
    // jak namalowany pasek; realny refleks ma ostrą górę i długi ogon.
    `${CARDBOARD.sheen} 48%, ` +
    `rgba(255,255,255,0.07) 72%, ` +
    `rgba(255,255,255,0) 100%)`,
  opacity: FLAP_SHAPE.glossOpacity,
};

/**
 * Fazka pionowej krawędzi.
 *
 * Wąski pasek pod 45° wypełniający ścięcie między dwiema ścianami. Gradient
 * ma refleks W ŚRODKU paska, a przy obu brzegach schodzi do barwy ścian —
 * dzięki temu ścięcie nie zdradza się jako trzecia, osobna płaszczyzna,
 * tylko czyta się jako miękko zaokrąglony kant.
 *
 * @param spec siła refleksu; zależy od tego, jak dana krawędź jest ustawiona
 *             do światła (przód-lewo najmocniej, tył najsłabiej)
 */
export const edgeFillet = (spec: number): CSSProperties => ({
  backgroundImage: [
    // Refleks: WARSTWA WIERZCHNIA. `spec` steruje jego kryciem wprost
    // w kolorze, nie właściwością `opacity` — ta przygasiłaby również
    // barwę bazową pod spodem i przez ścięcie prześwitywałoby tło.
    // Refleks jest WĄSKI — 30–62% szerokości paska, nie cała szerokość.
    // Rozlany na całą fazkę zamienia ją w jasną listwę doklejoną do pudełka;
    // realny refleks na zaokrąglonej krawędzi to cienka smuga, bo tylko
    // wąski pas powierzchni ma normalną wycelowaną w źródło światła.
    `linear-gradient(90deg, rgba(255,246,226,0) 30%, rgba(255,246,226,${spec.toFixed(2)}) 46%, rgba(255,246,226,0) 62%)`,
    // Barwa bazowa: ta sama oś światła co na ścianach (góra jasna, dół ciemny),
    // żeby fazka należała do bryły, a nie leżała na niej jak listwa.
    `linear-gradient(172deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 58%, ${CARDBOARD.dark} 100%)`,
  ].join(', '),
});
