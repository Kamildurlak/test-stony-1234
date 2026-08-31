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
  ANTICIPATION: [0.0, 0.045],

  /**
   * Otwarcie klap. DWA RAZY szybciej niż w pierwszej wersji (było 6% scrolla,
   * jest 3%). Na życzenie klienta — i słusznie: wystrzał ma zaskakiwać,
   * a rozciągnięty wystrzał przestaje być wystrzałem.
   */
  OPEN: [0.045, 0.06],

  /** Wylot ikon: najpierw pionowo w górę, potem rozejście po okręgu. */
  ICONS: [0.055, 0.17],

  /**
   * Upadek pudełka. Startuje DOKŁADNIE tam, gdzie ikony, i trwa trzy razy
   * krócej niż wcześniej (było 10% scrolla, jest 3,5%).
   *
   * Uwaga na przyszłość: pierwotnie upadek startował 0.02 PO wylocie ikon,
   * żeby widz zdążył zobaczyć przyczynę przed skutkiem. Klient poprosił
   * o jednoczesność i tak zostało — ale to jest miejsce, do którego warto
   * wrócić, jeśli wybuch zacznie się czytać jako chaotyczny.
   */
  FALL: [0.058, 0.078],

  /** Scena 1: "Idealny montaż" — wchodzi, gdy formacja rusza po okręgu. */
  SCENE_EDIT: [0.17, 0.42],

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
 * Ruch własny pudełka w spoczynku.
 *
 * ZMIANA KIERUNKU. Pierwotny brief żądał wyraźnego PODSKOKU z fizyką:
 * tor paraboliczny, zgniecenie przy lądowaniu do 82% wysokości, rozciągnięcie
 * w locie, cień reagujący na wysokość. To wszystko zostało zbudowane
 * i działało.
 *
 * Klient poprosił jednak o ruch „bardzo subtelny", bez agresywnych odbić —
 * poziom premium motion design zamiast animacji przedmiotu z reklamy.
 * To jest dokładna odwrotność tamtego wymogu, więc fizyka skoku znika,
 * a zostaje delikatne unoszenie.
 *
 * Co świadomie tracimy: squash and stretch, czyli najmocniejszy sygnał masy,
 * jakim dysponowaliśmy. Ciężar musi teraz nieść samo światło, cień kontaktowy
 * i proporcje bryły.
 *
 * Ruch jest napędzany CZASEM, nie scrollem — scroll steruje narracją,
 * czas steruje życiem sceny.
 */
export const FLOAT = {
  /** Okres unoszenia. Długi: przedmiot ma oddychać, a nie kołysać się. */
  periodS: 5.6,

  /**
   * Amplituda w jednostkach wysokości pudełka. CELOWO bardzo mała —
   * powyżej kilku procent zaczyna się „lewitujący przedmiot", przed którym
   * klient ostrzega wprost.
   */
  amplitude: 0.035,

  /**
   * Mikroskalowanie towarzyszące unoszeniu: gdy bryła jest wyżej, jest
   * odrobinę bliżej widza. Wartość na granicy dostrzegalności — ma działać
   * podprogowo, nie być widocznym efektem.
   */
  breathScale: 0.008,

  /**
   * Mikroobrót wokół osi pionowej. Okres CELOWO niewspółmierny z periodS
   * (5.6 vs 13.7), żeby układ nigdy nie wrócił do tej samej konfiguracji —
   * wspólna wielokrotność oznaczałaby widoczną pętlę.
   */
  yawPeriodS: 13.7,
  yawAmplitudeDeg: 4.5,

  /** Delikatne kołysanie w osi X, jeszcze wolniejsze. */
  pitchPeriodS: 19.3,
  pitchAmplitudeDeg: 2.2,

  /** Stały skos bryły — żeby czytała się jako obiekt 3D, a nie prostokąt. */
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
 * Błysk szwu — następca taśmy.
 *
 * TAŚMA ZOSTAŁA USUNIĘTA NA PROŚBĘ KLIENTA. Warto wiedzieć, co przy okazji
 * zniknęło, bo to nie był ozdobnik: taśma pękała PRZED klapami i dzięki temu
 * wystrzał miał PRZYCZYNĘ. Bez niej klapy odskakują same z siebie, a widz
 * czyta to jako błąd odtwarzania, nie jako zdarzenie.
 *
 * Przyczynę niesie teraz światło. Wzdłuż szwu — tam, gdzie stykają się cztery
 * klapy — narasta wąska, ciepła linia, jakby w środku rosło ciśnienie.
 * Gaśnie w chwili, gdy pierwsza klapa rusza. Ten sam sygnał narracyjny,
 * tylko delikatniejszy, i bez przedmiotu, którego klient nie chce widzieć.
 *
 * Koszt: sama `opacity` na dwóch statycznych paskach. Zero pracy na klatkę.
 */
export const SEAM_LIGHT = {
  /**
   * Wykładnik narastania w fazie ANTICIPATION. Wysoki, bo światło ma pojawić
   * się DOPIERO tuż przed wystrzałem — przy narastaniu liniowym szew świeciłby
   * przez cały początek scrolla i przestałby cokolwiek zapowiadać.
   */
  buildExponent: 3.4,
  /** Ułamek fazy OPEN, w którym błysk gaśnie. Krótki: to rozbłysk, nie lampka. */
  fadeRatio: 0.3,
  /** Szczytowe krycie. */
  peakOpacity: 0.9,
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
   * TikTok, Instagram, YouTube, Facebook. Nierówne — cztery przedmioty,
   * nie jedna klatka kluczowa.
   */
  delays: [0.0, 0.05, 0.02, 0.08],

  /** Ułamek fazy na przelot jednej ikony. */
  duration: 0.84,

  /**
   * Etap 1 — WYSKOK. Ułamek lotu, w którym ikona wyrzucana jest pionowo
   * w górę, prosto z gardzieli pudełka.
   */
  launchRatio: 0.34,

  /**
   * Etap 2 — USTAWIENIE. Ułamek lotu, po którym ikona jest już na swoim
   * miejscu na okręgu. Między launchRatio a settleRatio przemieszcza się
   * ze szczytu wyskoku na swoją pozycję.
   */
  settleRatio: 0.78,

  /**
   * Boczne rozsunięcie przy wyskoku, w px.
   * Bez tego cztery ikony lecą po tej samej pionowej linii i układają się
   * w słupek, który czyta się jak sterta, a nie jak wyrzut.
   */
  /**
   * Wartości MUSZĄ rosnąć razem z kafelkiem: rozsunięcie mniejsze od jego
   * szerokości nie rozdziela ikon, tylko przesuwa stertę. Przy kafelku
   * 168 px potrzeba grubo ponad 168 px rozrzutu, żeby w chwili wyskoku
   * widać było cztery osobne przedmioty.
   */
  launchSpreadPx: [-186, 82, -64, 214],

  /**
   * Wysokość szczytu wyskoku jako ułamek promienia orbity.
   * Poniżej 1, żeby ikony nie wylatywały poza kadr przed ustawieniem się.
   */
  apexRatio: 0.74,

  /**
   * Formacja to OKRĄG, nie elipsa: na elipsie równe kąty NIE dają równych
   * odległości, a wymogiem jest stały odstęp. Na okręgu cztery znaki co 90°
   * są równo oddalone zawsze — gwarancja geometryczna, nie dobór wartości.
   *
   * Promień podniesiony z 380 na 490 px, bo kafelki urosły dwukrotnie.
   * Wartość potwierdzona pomiarem realnych prostokątów, nie wyliczeniem:
   * najciaśniejszym miejscem jest NAROŻNIK karty w środku, mijany po skosie.
   */
  orbitRadiusPx: 490,

  /** Kąty docelowe, w stopniach od góry. Cztery równe ćwiartki. */
  slotAngles: [0, 90, 180, 270],

  /** Skala startowa w gardzieli pudełka. Mała = wrażenie głębi przy wylocie. */
  startScale: 0.16,

  /** Okres pełnego obiegu formacji w sekundach. */
  orbitPeriodS: 16,

  /**
   * Kiedy obieg osiąga pełną prędkość, liczone od settleRatio.
   *
   * Klient chce kolejności „wyskok → ustawienie → dopiero obrót", ale
   * bez martwego momentu. Obieg narasta więc na ostatnim odcinku ustawiania:
   * ikona dojeżdża na miejsce już w ruchu, a mimo to widz odbiera trzy
   * osobne zdarzenia.
   */
  orbitRampStart: 0.62,
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

  /**
   * Zaokrąglenie narożników kartonu.
   *
   * Podniesione z 5 na 9 px. Wcześniej promień był zakładnikiem konstrukcji:
   * ściany to płaskie prostokąty w przestrzeni 3D, więc każde zaokrąglenie
   * rozsuwało je w pionowych krawędziach i zostawiało prześwity na tło.
   *
   * Ograniczenie zniknęło razem z FAZKAMI (niżej): pionowe krawędzie są teraz
   * fizycznie ścięte osobną płaszczyzną, która wypełnia tę szczelinę i przy
   * okazji łapie światło. Promień może więc urosnąć do wartości, przy której
   * bryła czyta się jako miękka i rysunkowa, a nie wycięta żyletką.
   */
  cornerRadiusPx: 9,

  /**
   * Szerokość ścięcia (fazki) na czterech pionowych krawędziach.
   *
   * To jest najstarszy trik z modelowania low-poly i jedyny, który działa
   * w CSS 3D: zaokrąglonej krawędzi nie da się zrobić bez geometrii, ale
   * WĄSKIE ŚCIĘCIE POD 45° daje dokładnie ten sam odczyt. Powód jest
   * optyczny, nie geometryczny — oko rozpoznaje zaokrągloną krawędź po
   * WĄSKIM REFLEKSIE biegnącym wzdłuż niej, a nie po samym łuku.
   * Fazka ten refleks ma; ostra krawędź nie ma go z definicji.
   *
   * Szerokość musi odpowiadać promieniowi narożnika (łuk ćwiartki o promieniu
   * 9 px ma ok. 14 px długości), inaczej ścięcie i zaokrąglone rogi ścian
   * rozjeżdżają się i widać, że to dwa niezależne oszustwa.
   */
  edgeFilletPx: 12,
} as const;

/**
 * Sylwetka klapy.
 *
 * ZMIANA KIERUNKU na prośbę klienta (referencja: ilustracja otwartego kartonu).
 * Klapy przestają być prostokątami — wolna krawędź dostaje łuk, a narożniki
 * przy zawiasie zmiękczenie. To jest ta różnica, przez którą pudełko czyta się
 * jako rysowane, a nie jako cztery prostokąty na zawiasach.
 *
 * Łuk MUSI zostać płytki i to nie jest kwestia gustu. Klapy w stanie zamkniętym
 * leżą parami: przednia z tylną zakrywają całą górę, lewa z prawą też. Wycięcie
 * przy wolnej krawędzi jednej pary wypada dokładnie tam, gdzie druga para leży
 * pełnym materiałem — więc płytki łuk jest niewidoczny przy zamkniętym pudełku.
 * Głęboki zacząłby odsłaniać wnętrze w narożnikach, bo tam obie pary mają już
 * swoje wycięcia.
 */
export const FLAP_SHAPE = {
  /** Promień narożników przy zawiasie. Samo zmiękczenie, bez zmiany sylwetki. */
  hingeRadiusPx: 7,
  /** Poziomy promień łuku wolnej krawędzi, w % szerokości klapy. */
  archRadiusXPct: 26,
  /** Pionowy promień łuku, w % głębokości klapy. Trzyma łuk płytkim. */
  archRadiusYPct: 24,
  /**
   * Szerokość paska grubości tektury, w % szerokości klapy.
   * Musi zmieścić się w PŁASKIM środku łuku (100 − 2 × archRadiusXPct = 48%),
   * inaczej prosty pasek wystaje poza zakrzywioną sylwetkę.
   *
   * Łuk został w tym celu spłycony (32% → 26%). Powód jest praktyczny:
   * klapa to płaszczyzna o zerowej grubości, więc oglądana z boku znika do
   * kreski. Jedyne, co ją wtedy ratuje, to właśnie ten pasek — im dłuższy,
   * tym bardziej klapa czyta się w tym ujęciu jako deska, a nie jako drzazga.
   */
  cutEdgeWidthPct: 46,
  /** Krycie pasma połysku przeciągniętego po klapie. */
  glossOpacity: 0.5,
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
  /**
   * Skala cienia przy podłożu i na szczycie.
   *
   * Rozpiętość ŚWIADOMIE zawężona (0.62 → 0.86). Te liczby pochodziły z czasów
   * podskoku, gdy pudełko wznosiło się o pół własnej wysokości — wtedy skurcz
   * cienia o 38% był uzasadniony. Unoszenie ma amplitudę 3.5% wysokości, czyli
   * około 6 px: cień kurczący się przy takim ruchu o ponad jedną trzecią czyta
   * się jako pulsowanie, bo widz nie widzi zmiany wysokości, która by je
   * tłumaczyła. Ten sam powód stoi za zawężeniem krycia i rozmycia.
   */
  scaleGround: 1.0,
  scaleApex: 0.86,

  /** Krycie cienia przy podłożu i na szczycie. */
  opacityGround: 0.92,
  opacityApex: 0.8,

  /** Rozmycie w px przy podłożu i na szczycie. */
  blurGroundPx: 18,
  blurApexPx: 28,
} as const;

/**
 * Trzecia, najszersza warstwa cienia — okluzja otoczenia.
 *
 * Dwie warstwy (miękka + kontaktowa) opisują cień od JEDNEGO źródła. Realna
 * scena ma jeszcze światło ze wszystkich stron naraz, a przedmiot je zasłania:
 * podłoga wokół niego jest odrobinę ciemniejsza w promieniu znacznie większym
 * niż sam cień rzucony.
 *
 * Bez tej warstwy pudełko ma cień, ale nie ma CIĘŻARU — plama kończy się zbyt
 * blisko bryły i kadr wokół niej jest podejrzanie czysty. To jest tania
 * warstwa: statyczny gradient, ani jednej właściwości animowanej.
 */
export const AMBIENT_SHADOW = {
  /** Szerokość względem pudełka. Bardzo duża — to nie cień, to ubytek światła. */
  widthRatio: 2.35,
  heightRatio: 0.92,
  opacity: 0.3,
} as const;

/**
 * Światło odbite od podłoża.
 *
 * Podłoga pod pudełkiem odbija światło z powrotem w jego spód. Ciepła,
 * bardzo słaba plama TUŻ pod bryłą — mniejsza niż cień i o wyższym kryciu
 * w środku. Wygląda na drobiazg, ale to ona odkleja przedmiot od cienia:
 * bez niej cień i pudełko schodzą się jedną twardą linią.
 */
export const BOUNCE_LIGHT = {
  widthRatio: 1.15,
  heightRatio: 0.34,
  opacity: 0.34,
  color: 'rgba(255,214,158,0.75)',
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
  widthRatio: 1.16,
  opacityGround: 0.95,
  /**
   * Dolna granica krycia. Unoszące się pudełko nigdy nie odrywa się na tyle,
   * żeby szczelina pod nim wpuściła światło — więc twarda obwódka słabnie,
   * ale nie znika. Zero należy wyłącznie do fazy upadku.
   */
  floor: 0.72,
  blurGroundPx: 5,
  blurApexPx: 16,
  /**
   * Wykładnik zaniku. Powyżej 1 krycie spada gwałtownie już przy pierwszych
   * milimetrach oderwania — dokładnie tak, jak zachowuje się realny kontakt.
   *
   * Zbity z 2.6 do 1.6 razem z podniesieniem podłogi. Zmierzone na żywo:
   * przy poprzednich wartościach krycie wahało się przez cykl unoszenia
   * od 0.40 do 0.94, czyli ponad dwukrotnie — i to przy ruchu bryły o 6 px.
   * Widz nie widzi zmiany wysokości, która by to tłumaczyła, więc odbiera to
   * jako PULSOWANIE cienia, a w dolnej fazie cienia po prostu nie ma. Wysoki
   * wykładnik dodatkowo trzymał krycie przy podłodze przez większość cyklu,
   * bo krzywa potęgowa spędza czas głównie przy zerze.
   */
  falloffExponent: 1.6,
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
  /**
   * Baza: chłodna, bardzo jasna biel z nutą błękitu i fioletu.
   *
   * ŚWIADOMIE NIE #FFFFFF. Czysta biel na dużej powierzchni jest martwa —
   * nie ma w niej żadnej informacji o świetle, więc wszystko, co na niej
   * stoi, wygląda jak wklejone. Odcień chłodny, bo cała scena jest
   * oświetlona zimnymi gradientami z tła; ciepła baza kłóciłaby się z nimi.
   */
  bg: '#F1F3F9',
  /** Drugi punkt bazy — tło jest delikatnym gradientem, nie płaską plamą. */
  bgDeep: '#E7EAF4',

  /* Akcenty. Wszystkie występują w tle wyłącznie jako ŹRÓDŁA ŚWIATŁA
     o niskim kryciu, nigdy jako płaskie plamy koloru. */
  blue: '#2E7BFF',
  cyan: '#22D3EE',
  violet: '#8B5CF6',
  magenta: '#F0246E',
  pink: '#FF6BA8',
  /** Bursztyn tylko jako pojedynczy, ciepły akcent równoważący zimne światła. */
  amber: '#FF9A5A',

  /** Tekst. Nie czerń — granatowy grafit, spójny z chłodną bazą. */
  ink: '#141A2E',
  inkMuted: '#5A6280',
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
  /**
   * Źródła światła w tle.
   *
   * To NIE są „kolorowe plamy" — to są światła. Różnica jest w kryciu
   * i w rozmiarze: plama ma ostry zasięg i rzuca się w oczy, światło jest
   * duże, miękkie i pozostaje poniżej progu świadomej uwagi, dopóki się
   * na nie nie spojrzy. Dlatego wszystkie mają krycie w okolicach 0.2–0.4
   * i średnicę liczoną w dziesiątkach procent ekranu.
   *
   * Rozmieszczenie: świadomie WOKÓŁ środka kadru. Środek zostaje jaśniejszy
   * i spokojniejszy, bo tam stoi pudełko i treść — hierarchia z brief'u
   * mówi wprost, że tło nie może konkurować z produktem.
   *
   * `driftS` i `pulseS` są parami niewspółmierne, żeby układ świateł nigdy
   * nie wrócił do tej samej konfiguracji. Wspólna wielokrotność okresów
   * oznaczałaby widoczną pętlę.
   */
  lights: [
    { color: '#2E7BFF', x: 12, y: 18, size: 62, opacity: 0.42, driftS: 41, pulseS: 23, dx: 7, dy: -5 },
    { color: '#22D3EE', x: 86, y: 26, size: 54, opacity: 0.38, driftS: 53, pulseS: 29, dx: -6, dy: 6 },
    { color: '#8B5CF6', x: 74, y: 82, size: 66, opacity: 0.4, driftS: 47, pulseS: 34, dx: -8, dy: -4 },
    { color: '#F0246E', x: 20, y: 78, size: 50, opacity: 0.3, driftS: 59, pulseS: 26, dx: 6, dy: 5 },
    { color: '#FF6BA8', x: 52, y: 6, size: 44, opacity: 0.24, driftS: 67, pulseS: 31, dx: -5, dy: 7 },
    { color: '#FF9A5A', x: 6, y: 54, size: 38, opacity: 0.2, driftS: 73, pulseS: 37, dx: 8, dy: 3 },
  ],

  /**
   * Świetlne fale: bardzo szerokie, ledwie widoczne pasma przepływające
   * w poprzek kadru. Dokładają trzeci wymiar ruchu — same światła dryfują
   * lokalnie, a fale przechodzą przez całą scenę, więc tło nigdy nie wygląda
   * na zapętlone w jednym miejscu.
   */
  waves: [
    { angle: -18, y: 30, thickness: 26, opacity: 0.1, durationS: 44, color: '#2E7BFF' },
    { angle: 12, y: 62, thickness: 34, opacity: 0.085, durationS: 61, color: '#8B5CF6' },
    { angle: -8, y: 88, thickness: 22, opacity: 0.07, durationS: 78, color: '#22D3EE' },
  ],
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
  /**
   * Materiał: czysta, matowa tektura premium.
   *
   * ZMIANA NA PROŚBĘ KLIENTA. Wcześniej powierzchnia miała włókno papieru
   * i wielkoskalowe przybrudzenie — to one zamieniały płaską bryłę w karton.
   * Klient poprosił o powierzchnię idealnie czystą, bez ziarna i szumu.
   *
   * Realizm musi więc przyjść skądinąd: z FAZOWANIA krawędzi, z gradientów
   * opisujących kierunek światła i z kolorowego światła konturowego
   * odbitego od tła. To jest realizm opakowania z fotografii produktowej,
   * a nie paczki kurierskiej — inny, ale nie mniejszy.
   */
  /**
   * Odcienie ocieplone i ROZSUNIĘTE względem poprzedniej wersji.
   *
   * Rozpiętość jasności między `light` a `dark` urosła z 24% do 34%. To nie
   * jest podkręcanie kontrastu dla efektu — na tym stoi cały odczyt bryły.
   * Ilustracja (referencja od klienta) opisuje formę WYŁĄCZNIE różnicą
   * jasności ścian, bo nie ma do dyspozycji ani faktury, ani cieni własnych.
   * Skoro klient wyklucza fakturę, zostaje dokładnie ta sama droga.
   */
  base: '#D9B489',
  light: '#EEDCBB',
  dark: '#A2794E',
  /** Wnętrze — nadal wyraźnie ciemne, żeby ikony miały Z CZEGO się wyłonić. */
  interior: '#3A2716',

  /**
   * Spód klapy, czyli WEWNĘTRZNA strona tektury.
   *
   * Potrzebna, bo klapa otwarta na −208° jest ODWRÓCONA: powierzchnia, która
   * przy zamkniętym pudełku patrzyła w górę, po przewaleniu się przez pion
   * patrzy w dół i do środka. Widz przez większość sceny ogląda więc SPÓD
   * klapy, nie jej wierzch.
   *
   * Wcześniej ta strona nie istniała — klapa była jedną płaszczyzną, więc po
   * otwarciu pokazywała własny wierzch w lustrzanym odbiciu. Działało, dopóki
   * nie było na niej niczego kierunkowego; przy połysku i łuku zaczęłoby
   * kłamać wprost.
   */
  innerLight: '#D2A972',
  inner: '#BC9058',
  innerDark: '#8B6537',

  /**
   * Fazowanie: jasna nitka na krawędzi zwróconej do światła i ciemna
   * na przeciwnej. To ona zastępuje usunięte ziarno — bez niej ściany
   * schodzą się nieskończenie ostrą linią, czego w rzeczywistości nie ma
   * żaden przedmiot.
   */
  bevelLight: 'rgba(255,247,233,0.6)',
  bevelDark: 'rgba(120,88,54,0.5)',

  /**
   * Połysk. Nie biel — bardzo jasny, lekko kremowy odcień.
   *
   * Czysta biel na krafcie zawsze wygląda jak dziura w materiale: refleks
   * przejmuje barwę ŹRÓDŁA światła, a nie farby, ale przechodzi przez
   * powierzchnię i coś z niej zabiera. Kremowy refleks czyta się jako światło
   * NA kartonie; biały jako wycięty otwór.
   */
  sheen: 'rgba(255,250,238,0.45)',

} as const;

/**
 * Światło konturowe odbite od kolorowych gradientów w tle.
 *
 * Fizyczna motywacja: pudełko stoi w scenie oświetlonej zimnymi plamami
 * światła, więc jego krawędzie MUSZĄ łapać ich barwę. Bez tego bryła
 * wygląda, jakby została wycięta z innego zdjęcia i wklejona na tło.
 *
 * Krycie celowo niskie — to ma podkreślać kształt, a nie malować pudełko
 * na niebiesko.
 */
export const RIM_LIGHT = {
  cool: 'rgba(46,123,255,0.34)',
  violet: 'rgba(139,92,246,0.26)',
  warm: 'rgba(255,154,90,0.2)',
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
