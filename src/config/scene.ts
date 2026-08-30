/**
 * JEDYNE ŹRÓDŁO PRAWDY dla całej choreografii.
 *
 * Wymóg z brief'u: "wszystkie progi czasowe w jednym obiekcie konfiguracyjnym,
 * nie rozsiane po kodzie". Jeśli kiedykolwiek zaczniesz szukać liczby 0.3
 * gdzieś w komponencie — to znaczy, że złamaliśmy tę zasadę i trzeba wrócić tutaj.
 *
 * Dzięki temu dostrajanie rytmu (a będziemy to robić dziesiątki razy) to edycja
 * jednego pliku, a nie polowanie po drzewie komponentów.
 */

/* ------------------------------------------------------------------------- */
/* SCROLL                                                                      */
/* ------------------------------------------------------------------------- */

export const SCROLL = {
  /**
   * Długość sekcji w jednostkach wysokości ekranu (vh).
   * Ustalone z klientem: 450vh — wariant "krótszy, szybsze wrażenie".
   *
   * UWAGA: przy 450vh i trzech scenach treści rytm jest ciasny. Świadomy
   * kompromis — tniemy czas ekspozycji scen, nie ich liczbę.
   */
  lengthVh: 450,

  /**
   * Współczynnik wygładzania scrolla (lerp). Wartość na klatkę przy 60 fps.
   *
   * Brief: "scroll wygładzany interpolacją, nie przypisywany 1:1".
   * Niżej = bardziej maślane, ale i bardziej "pływające" (element gubi kontakt
   * z palcem). 0.12 to punkt, w którym ruch jest gładki, a jednocześnie
   * użytkownik wciąż czuje, że to ON przewija — a nie że ogląda film.
   *
   * Wartość jest normalizowana do czasu klatki (patrz lib/math.ts → dampLerp),
   * więc na monitorze 144 Hz zachowanie jest identyczne jak na 60 Hz.
   */
  smoothing: 0.12,

  /**
   * Poniżej tej różnicy między wartością docelową a wygładzoną uznajemy ruch
   * za zakończony i wstrzymujemy przeliczanie sceny. Oszczędza baterię
   * i pozwala zdjąć `will-change` (brief wymaga zdejmowania go po animacji).
   */
  settleEpsilon: 0.00005,
} as const;

/* ------------------------------------------------------------------------- */
/* FAZY                                                                        */
/* ------------------------------------------------------------------------- */

/** Zakres progressu [start, end]. Wartości zawsze 0–1. */
export type PhaseRange = readonly [start: number, end: number];

/**
 * Rytm sekwencji dopasowany do 450vh.
 *
 * Zasada projektowa: fazy CELOWO na siebie nachodzą. Gdyby każda zaczynała się
 * dokładnie tam, gdzie kończy poprzednia, ruch czytałby się jak lista kroków,
 * a nie jak jedno zdarzenie. Nakładanie się to jest ta różnica.
 *
 * Przykład, który najlepiej to pokazuje: FALL startuje 0.02 PO tym, jak ikony
 * zaczynają wylot (ICONS 0.08 → FALL 0.10). Najpierw widzisz, że coś wyleciało,
 * dopiero potem karton ucieka z kadru. Odwrotna kolejność zabiłaby przyczynowość.
 */
export const PHASES = {
  /** Stan spoczynku — pętla podskoków. Nie ma końca w sensie progressu; wygasa w ANTICIPATION. */
  IDLE: [0.0, 0.05],

  /** Zamach. Pudełko przykuca przed wybuchem. Bez tego otwarcie czyta się jak glitch. */
  ANTICIPATION: [0.0, 0.05],

  /** Otwarcie klap. Najkrótsza i najgwałtowniejsza faza — to jest ten "wow". */
  OPEN: [0.05, 0.11],

  /** Wylot ikon z gardzieli pudełka. Najdłuższa faza ruchu. */
  ICONS: [0.08, 0.3],

  /** Upadek pudełka. Krótko i gwałtownie, z przyspieszeniem grawitacyjnym. */
  FALL: [0.1, 0.2],

  /** Scena 1: "Idealny montaż" — oś czasu montażu wideo. */
  SCENE_EDIT: [0.3, 0.45],

  /** Scena 2: "Viralowe treści" — licznik wyświetleń + krzywa wzrostu. */
  SCENE_VIRAL: [0.48, 0.63],

  /** Scena 3: "Strony, które konwertują" — dorzucona zgodnie z wymogiem min. 1 dodatkowej sceny. */
  SCENE_WEB: [0.66, 0.81],

  /** Domknięcie: nagłówek marki, opis, CTA. */
  OUTRO: [0.84, 1.0],
} as const satisfies Record<string, PhaseRange>;

export type PhaseName = keyof typeof PHASES;

/**
 * Obroty formacji ikon między scenami.
 *
 * Rytm z brief'u: obrót → napis → animowana ilustracja → obrót.
 * Każdy obrót odsłania nową treść — stara wychodzi z rozmyciem i przesunięciem,
 * nowa wchodzi.
 */
export const ROTATIONS = {
  TO_VIRAL: [0.45, 0.48],
  TO_WEB: [0.63, 0.66],
  TO_OUTRO: [0.81, 0.84],
} as const satisfies Record<string, PhaseRange>;

/* ------------------------------------------------------------------------- */
/* FIZYKA STANU SPOCZYNKU                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Podskok pudełka. To jest napędzane CZASEM, nie scrollem — dlatego stoi
 * osobno od PHASES. Kluczowe rozróżnienie: scroll steruje narracją,
 * czas steruje życiem sceny ("nic nie jest nieruchome").
 */
export const BOUNCE = {
  /** Pełny cykl skoku w sekundach. 0.75 s = żwawo, ale bez nerwowości. */
  periodS: 0.75,

  /** Wysokość skoku w jednostkach sceny. */
  height: 0.42,

  /**
   * Faza lotu jako ułamek cyklu. Reszta (1 - flightRatio) to kontakt z podłożem.
   * Krótki kontakt = wrażenie sprężystości; długi = wrażenie ciężaru.
   * 0.86 daje przedmiot lekki, ale nie gumowy.
   */
  flightRatio: 0.86,

  /** Zgniecenie przy lądowaniu: wysokość spada do 82%, szerokość rośnie o 15%. */
  squashY: 0.82,
  squashX: 1.15,

  /** Rozciągnięcie w locie — odwrotność zgniecenia, ale słabsza (ruch w górę jest subtelniejszy). */
  stretchY: 1.08,
  stretchX: 0.95,

  /**
   * Mikroobrót wokół osi pionowej. Okres CELOWO niewspółmierny z periodS
   * (0.75 vs 5.3 — stosunek niewymierny w praktyce), żeby pętla nie była
   * "słyszalna". Gdyby oba okresy się dzieliły, oko wyłapałoby powtórzenie
   * po kilku sekundach.
   */
  yawPeriodS: 5.3,
  yawAmplitudeDeg: 7,

  /** Stały skos bryły — żeby pudełko czytało się jako obiekt 3D, a nie prostokąt. */
  restTiltXDeg: -8,
  restTiltYDeg: 14,
} as const;

/**
 * Cień. Brief stawia sprawę jasno: "Cień jest obowiązkowy. Bez niego wszystko
 * wygląda jak naklejka."
 *
 * Cień jest funkcją WYSOKOŚCI obiektu — kurczy się i ciemnieje przy lądowaniu,
 * rozmywa i blednie przy szczycie. To jedna z dwóch rzeczy (obok squash),
 * które sprzedają masę.
 */
export const SHADOW = {
  /** Skala cienia przy podłożu i na szczycie skoku. */
  scaleGround: 1.0,
  scaleApex: 0.62,

  /** Krycie cienia przy podłożu i na szczycie. */
  opacityGround: 0.55,
  opacityApex: 0.16,

  /** Rozmycie w px przy podłożu i na szczycie. */
  blurGroundPx: 18,
  blurApexPx: 44,
} as const;

/* ------------------------------------------------------------------------- */
/* PALETA                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Paleta studia — potwierdzona przez klienta bez zmian.
 *
 * Kolory MAREK (glow ikon) celowo NIE są tutaj. Brief wymaga, żeby były
 * pobrane wprost z plików SVG, nie "mniej więcej podobne" — więc mieszkają
 * przy definicjach logotypów, nie w palecie studia. To rozdzielenie jest
 * świadome: paleta studia = UI, kolory marek = tożsamość ikon.
 */
export const PALETTE = {
  bg: '#07070B',
  magenta: '#FF3D81',
  cyan: '#00E5D0',
  violet: '#8B5CF6',
} as const;

/**
 * Kraft.
 *
 * Klient wybrał surowy brąz przy neonowej palecie na ciemnym tle — to
 * połączenie potrafi wyglądać jak dwa sklejone projekty. Kontra: kraft
 * PRZYCIEMNIONY i zdesaturowany (bliżej espresso niż jasnego kartonu),
 * z kolorowymi kick-lightami z palety łapanymi na krawędziach.
 * Ciepły materiał zostaje, ale nie wypada z ciemnej sceny.
 */
export const CARDBOARD = {
  base: '#6B4F3A',
  light: '#8A6949',
  dark: '#43301F',
  /** Wnętrze pudełka — celowo bardzo ciemne, żeby ikony miały Z CZEGO się wyłonić. */
  interior: '#150E08',
} as const;

/* ------------------------------------------------------------------------- */
/* PRÓG WYDAJNOŚCI                                                             */
/* ------------------------------------------------------------------------- */

export const PERFORMANCE = {
  /**
   * Poniżej tej szerokości używamy uproszczonej warstwy renderującej
   * (ta sama, która obsługuje prefers-reduced-motion).
   * Ustalone z klientem: telefon dostaje warstwę CSS 3D, nie WebGL.
   */
  mobileBreakpointPx: 768,

  /** Projekt testowany na 375px — najwęższy sensowny viewport. */
  minDesignWidthPx: 375,

  /** Górny limit device pixel ratio. Powyżej 2 zysk wizualny jest zerowy, a koszt kwadratowy. */
  maxDpr: 2,
} as const;
