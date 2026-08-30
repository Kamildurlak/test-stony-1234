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

  /**
   * Otwarcie klap. DWA RAZY szybciej niż w pierwszej wersji (było 6% scrolla,
   * jest 3%). Na życzenie klienta — i słusznie: wystrzał ma zaskakiwać,
   * a rozciągnięty wystrzał przestaje być wystrzałem.
   */
  OPEN: [0.05, 0.08],

  /** Wylot ikon: najpierw pionowo w górę, potem rozejście po okręgu. */
  ICONS: [0.07, 0.22],

  /**
   * Upadek pudełka. Startuje DOKŁADNIE tam, gdzie ikony, i trwa trzy razy
   * krócej niż wcześniej (było 10% scrolla, jest 3,5%).
   *
   * Uwaga na przyszłość: pierwotnie upadek startował 0.02 PO wylocie ikon,
   * żeby widz zdążył zobaczyć przyczynę przed skutkiem. Klient poprosił
   * o jednoczesność i tak zostało — ale to jest miejsce, do którego warto
   * wrócić, jeśli wybuch zacznie się czytać jako chaotyczny.
   */
  FALL: [0.07, 0.105],

  /** Scena 1: "Idealny montaż" — wchodzi, gdy formacja rusza po okręgu. */
  SCENE_EDIT: [0.2, 0.42],

  /** Scena 2: "Viralowe treści" — licznik wyświetleń + krzywa wzrostu. */
  SCENE_VIRAL: [0.46, 0.66],

  /** Scena 3: "Strony, które konwertują" — dorzucona zgodnie z wymogiem min. 1 dodatkowej sceny. */
  SCENE_WEB: [0.7, 0.86],

  /** Domknięcie: nagłówek marki, opis, CTA. */
  OUTRO: [0.9, 1.0],
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
  TO_VIRAL: [0.42, 0.46],
  TO_WEB: [0.66, 0.7],
  TO_OUTRO: [0.86, 0.9],
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

  /**
   * Stały skos bryły — żeby pudełko czytało się jako obiekt 3D, a nie prostokąt.
   *
   * Skos w osi X podniesiony z -8° do -14°: przy płytszym kącie górna
   * płaszczyzna była praktycznie niewidoczna, a to na niej siedzą detale
   * decydujące o wiarygodności materiału — taśma, szew i cięte krawędzie klap.
   * Zbudowanie ich i pokazanie pod kątem, pod którym ich nie widać, byłoby
   * pracą wyrzuconą.
   */
  restTiltXDeg: -14,
  restTiltYDeg: 14,
} as const;

/**
 * Zamach (Faza 1) — pudełko przykuca przed wystrzałem klap.
 *
 * Brief: "To jest anticipation: bez niego wybuch czyta się jak błąd."
 * Dokładnie tak. Oko potrzebuje sygnału, że COŚ ZA CHWILĘ SIĘ STANIE —
 * bez niego następny kadr jest po prostu inny, a nie wynikający z poprzedniego.
 */
export const ANTICIPATION = {
  /** Przykucnięcie głębsze niż zwykłe lądowanie (0.82) — to musi być wyraźnie więcej. */
  crouchY: 0.68,
  crouchX: 1.24,
  /** Dodatkowe obniżenie bryły przy pełnym przykucnięciu, w jednostkach sceny. */
  sinkDepth: 0.05,
} as const;

/**
 * Otwarcie klap (Faza 2).
 *
 * Brief: "Cztery klapy strzelają w górę, każda na własnym zawiasie (...)
 * Bardzo szybko — łącznie 7% scrolla. Easing wysokiego rzędu: gwałtowny start,
 * długie hamowanie."
 */
export const FLAPS = {
  /** Klapa zamknięta leży płasko nad otworem. Patrz komentarz w CssBox. */
  closedDeg: -90,

  /**
   * Klapa otwarta przechodzi ZA pion i opada na zewnątrz.
   * Zatrzymanie dokładnie w pionie wyglądałoby jak zamierzona pozycja
   * docelowa — a klapa ma zostać wyrzucona, nie ustawiona.
   */
  openDeg: -208,

  /**
   * Opóźnienia startu, jako ułamek fazy OPEN. Kolejność: przód, tył, lewa, prawa.
   *
   * Wartości są CELOWO niecałkowitymi wielokrotnościami siebie nawzajem —
   * brief mówi "nigdy równo", a równe odstępy (0.05, 0.10, 0.15) czytają się
   * jak sekwencja z pętli for, nie jak cztery rzeczy, które puściły
   * pod naporem.
   *
   * Tył idzie pierwszy, przód drugi: dzięki temu klapa przednia — ta, która
   * najmocniej zasłania wnętrze — odsłania je, gdy jest już na co patrzeć.
   */
  delays: [0.04, 0.0, 0.13, 0.19],

  /** Ułamek fazy zajmowany przez ruch pojedynczej klapy. */
  duration: 0.78,

  /**
   * Przestrzelenie kąta. Klapa dolatuje dalej, niż zostaje, i wraca —
   * bez tego zatrzymanie jest nienaturalnie czyste.
   */
  overshootDeg: 22,
} as const;

/**
 * Taśma. Pęka PRZED klapami — inaczej wystrzał nie ma przyczyny.
 */
export const TAPE_BREAK = {
  /** Ułamek fazy OPEN, w którym taśma pęka. Musi zdążyć przed pierwszą klapą. */
  range: [0.0, 0.16] as const,
  /** Rozejście połówek w px. */
  partPx: 26,
  /** Obrót każdej połówki przy zerwaniu — taśma się zwija, nie odsuwa równo. */
  curlDeg: 14,
} as const;

/**
 * Wylot ikon (Faza 3).
 *
 * Brief: "Cztery logotypy wylatują z wnętrza pudełka, nie znikąd."
 * To zdanie niesie cały ciężar tej fazy — jeśli ikony pojawią się PRZED
 * kartonem albo obok niego, efekt jest zepsuty niezależnie od tego,
 * jak ładnie potem lecą.
 */
export const ICONS = {
  /**
   * Opóźnienia startu jako ułamek fazy ICONS. Kolejność zgodna z LOGOS:
   * TikTok, Instagram, YouTube, Facebook.
   *
   * Ciaśniej niż wcześniej, bo cała czwórka ma wystrzelić jak jeden ładunek —
   * ale nadal nierówno, żeby nie czytało się to jak jedna klatka kluczowa.
   */
  delays: [0.0, 0.07, 0.03, 0.11],

  /** Ułamek fazy na przelot jednej ikony. */
  duration: 0.74,

  /**
   * Ułamek lotu zajmowany przez WYSTRZAŁ PIONOWY.
   *
   * Klient poprosił wprost: ikony mają najpierw lecieć prosto w górę,
   * a dopiero potem rozejść się po okręgu. Ten podział jest sednem ruchu —
   * pionowy start czyta się jak wyrzucenie z pudełka, a rozejście po łuku
   * jak przejęcie ich przez formację. Dwie różne przyczyny, więc dwie
   * różne fazy.
   */
  launchRatio: 0.4,

  /**
   * Boczne rozsunięcie podczas wystrzału, w px.
   *
   * Bez tego wszystkie cztery ikony lecą po dokładnie tej samej pionowej
   * linii i — mimo różnych opóźnień — układają się w SŁUPEK, który czyta się
   * jak sterta, a nie jak wyrzut. Kilkadziesiąt pikseli w bok wystarczy,
   * żeby zobaczyć cztery osobne przedmioty.
   *
   * Wartości nierówne i o różnych znakach: ładunek rozrzuca, nie rozstawia.
   */
  launchSpreadPx: [-46, 21, -17, 52],

  /**
   * Zróżnicowanie wysokości szczytu, jako ułamek promienia. Gdyby wszystkie
   * zatrzymywały się na tej samej wysokości, powstałaby widoczna pozioma
   * linia — a nic w tej scenie nie ma prawa być wyrównane do linijki.
   */
  apexJitter: [0.0, -0.11, 0.07, -0.05],

  /**
   * Formacja to ELIPSA, nie okrąg.
   *
   * Spłaszczenie w pionie czyta się jako okrąg oglądany pod kątem, więc
   * ikony krążące po nim zdają się raz przybliżać, raz oddalać. Idealny
   * okrąg wyglądałby jak płaska tarcza — a chcemy przestrzeni.
   */
  orbitRadiusPx: 300,
  orbitFlatten: 0.66,

  /**
   * Kąty docelowe na elipsie, w stopniach, liczone od GÓRY zgodnie z ruchem
   * wskazówek zegara. Wszystkie ikony wystrzeliwują do punktu 0 (szczyt)
   * i dopiero stamtąd rozjeżdżają się na swoje miejsca — jak na taśmie.
   */
  slotAngles: [0, 90, 180, 270],

  /** Skala startowa w gardzieli pudełka. Mała = wrażenie głębi. */
  startScale: 0.2,

  /**
   * Głębia na elipsie: ikona na dole jest BLIŻEJ widza, więc większa,
   * i musi zasłaniać te z tyłu. Bez tego elipsa spłaszcza się z powrotem
   * do tarczy.
   */
  depthScale: 0.16,

  /** Obrót własny w locie, stopnie. Każda ikona inna i w inną stronę. */
  spinDeg: [300, -240, 260, -340],

  /**
   * Okres pełnego obiegu formacji po osadzeniu. Powolny — to ma być tło
   * dla treści w środku, nie karuzela odciągająca uwagę.
   */
  orbitPeriodS: 34,

  /** Amplituda wahadła kafelka wokół osi pionowej. NIE pełny obrót. */
  idleSwingDeg: 14,
  idleSpinPeriodS: [11.3, 14.7, 9.1, 17.2],
} as const;

/**
 * Upadek pudełka (Faza 4).
 *
 * Brief: "spada w dół z przyspieszeniem grawitacyjnym, obracając się.
 * Krótko i gwałtownie."
 */
export const FALL = {
  /** Dystans w wysokościach pudełka. Musi wyprowadzić bryłę poza kadr. */
  distance: 7.2,
  /** Obrót w osi Z podczas spadania. */
  rollDeg: 148,
  /** Dodatkowy przechył w osi X — bryła koziołkuje, nie obraca się płasko. */
  tumbleDeg: 66,
  /** Ułamek fazy, od którego bryła zaczyna znikać. */
  fadeStart: 0.62,
} as const;

/**
 * Geometria pudełka w pikselach bazowych (przed skalowaniem do viewportu).
 *
 * Proporcje celowo NIE są sześcianem. Sześcian czyta się jako bryła
 * geometryczna, a nie jako przedmiot — a chcemy, żeby to wyglądało
 * na karton, który ktoś mógł trzymać w rękach.
 */
export const BOX = {
  widthPx: 230,
  heightPx: 186,
  depthPx: 172,

  /**
   * Klapy przednia i tylna sięgają połowy głębokości, boczne połowy szerokości —
   * tak składa się prawdziwy karton klapowy. Minimalna szczelina, żeby przy
   * zamknięciu klapy nie migotały wzajemnie (z-fighting).
   */
  flapGapPx: 2,

  /** Perspektywa sceny. Niższa = mocniejszy efekt 3D, ale i mocniejsze zniekształcenie. */
  perspectivePx: 1400,
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

/**
 * Cień kontaktowy — druga, twardsza warstwa cienia.
 *
 * Prawdziwy cień nie jest jedną plamą, tylko złożeniem dwóch zjawisk:
 * miękkiego cienia od światła rozproszonego (duży, blady, zawsze rozmyty)
 * oraz cienia kontaktowego — wąskiej, ciemnej i OSTREJ obwódki dokładnie
 * tam, gdzie przedmiot dotyka podłoża, bo w tę szczelinę nie wpada już
 * żadne światło.
 *
 * Jedna uśredniona plama zawsze wygląda jak naklejona pod spodem. Dopiero
 * ta druga warstwa przykleja przedmiot do podłogi — i znika, gdy tylko
 * przedmiot się oderwie. To dlatego jej krycie spada do zera znacznie
 * szybciej niż krycie cienia miękkiego.
 */
export const CONTACT_SHADOW = {
  /** Szerokość względem cienia miękkiego — wyraźnie węższy. */
  widthRatio: 1.02,
  opacityGround: 0.62,
  blurGroundPx: 5,
  blurApexPx: 16,
  /**
   * Wykładnik zaniku. Powyżej 1 krycie spada gwałtownie już przy pierwszych
   * milimetrach oderwania — dokładnie tak, jak zachowuje się realny kontakt.
   */
  falloffExponent: 2.6,
} as const;

/* ------------------------------------------------------------------------- */
/* PALETA                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Paleta studia — wersja jasna.
 *
 * ZMIANA KIERUNKU względem pierwotnych ustaleń (#07070B). Klient poprosił
 * o tło "dużo jaśniejsze, wielokolorowe, w klimacie social media".
 *
 * Konsekwencja, którą trzeba mieć z tyłu głowy: na jasnym tle NIE DZIAŁA glow.
 * Poświata to światło dodawane — potrzebuje ciemności, żeby było co dodawać.
 * Dlatego wszędzie tam, gdzie brief mówi "glow", realizujemy to kolorowym,
 * miękkim cieniem (patrz GLOW niżej). Efekt jest inny, ale spójny z jasnym
 * tłem; próba dosłownego glow dałaby brudną, szarą obwódkę.
 *
 * Kolory MAREK (ikony) celowo NIE są tutaj — brief wymaga pobrania ich wprost
 * z plików SVG. Paleta studia = UI, kolory marek = tożsamość ikon.
 */
export const PALETTE = {
  /** Baza: ciepła biel z nutą lawendy. Czysta biel byłaby surowa i męcząca. */
  bg: '#F7F5FB',

  /** Akcenty — te same barwy co wcześniej, przeniesione na jasne tło. */
  magenta: '#F0246E',
  cyan: '#00B5A3',
  violet: '#7C4DEE',

  /** Tekst. Nie czarny — czysta czerń na jasnym tle daje nieprzyjemny kontrast. */
  ink: '#14101F',
  inkMuted: '#5B5470',
} as const;

/**
 * Plamy koloru w tle.
 *
 * Zasada, na której to stoi: DUŻE, MOCNO ROZMYTE, O NISKIM NASYCENIU.
 * Wielokolorowe tło jest najkrótszą drogą do jarmarku — zwłaszcza gdy przed
 * nim staną cztery logotypy w barwach marek. Punkty odniesienia z brief'u
 * (Apple, Linear, Vercel) są niemal monochromatyczne właśnie dlatego.
 *
 * Kompromis: kolor jest, ale zachowuje się jak światło odbite od ściany,
 * a nie jak nadruk. Jeśli okaże się za spokojne, podbijamy `opacity`.
 */
export const BACKDROP = {
  blobs: [
    { color: '#FF3D81', x: 18, y: 22, size: 58, opacity: 0.4 },
    { color: '#00E5D0', x: 82, y: 30, size: 52, opacity: 0.34 },
    { color: '#8B5CF6', x: 62, y: 78, size: 62, opacity: 0.38 },
    { color: '#FFB020', x: 30, y: 82, size: 46, opacity: 0.26 },
  ],
  /**
   * Bardzo powolny dryf plam. Brief: "Nic nie jest nieruchome."
   * Okres liczony w dziesiątkach sekund — ruch ma być poniżej progu
   * świadomej uwagi. Zauważalny dryf tła odciągałby wzrok od pudełka.
   */
  driftPeriodS: 46,
  driftAmplitudePct: 4,
} as const;

/**
 * Zamiennik glow na jasnym tle.
 *
 * Zamiast dodawać światło, odejmujemy je — kolorowy, mocno rozmyty cień
 * pod elementem w barwie jego marki. Oko czyta to jako "ten przedmiot
 * promieniuje kolorem", mimo że technicznie dzieje się coś odwrotnego.
 */
export const GLOW = {
  blurPx: 34,
  spreadPx: -6,
  offsetY: 14,
  opacity: 0.55,
} as const;

/**
 * Kraft.
 *
 * Wraca do jaśniejszego, cieplejszego brązu. Wcześniejsze przyciemnienie
 * miało jeden cel — uratować ciepły karton na niemal czarnej scenie.
 * Na jasnym tle problem się odwraca: ciemna bryła byłaby ciężką plamą,
 * a nie przedmiotem. To jest ten sam surowy karton, o który prosiłeś,
 * tyle że teraz może być sobą.
 */
export const CARDBOARD = {
  base: '#C89A6B',
  light: '#E0BC92',
  dark: '#9A7048',
  /** Wnętrze — nadal wyraźnie ciemne, żeby ikony miały Z CZEGO się wyłonić. */
  interior: '#3A2716',
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
