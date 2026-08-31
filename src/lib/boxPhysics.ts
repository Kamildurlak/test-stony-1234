import {
  ANTICIPATION,
  FLOAT,
  CONTACT_SHADOW,
  FALL,
  FLAPS,
  PHASES,
  SEAM_LIGHT,
  SHADOW,
} from '../config/scene';
import {
  clamp,
  easeInQuad,
  easeOutQuad,
  easeOutCubic,
  easeOutQuint,
  lerp,
  mapRange,
  phaseProgress,
} from './math';

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
  /** Cień kontaktowy — twarda obwódka w punkcie styku, gaśnie po oderwaniu. */
  readonly contactOpacity: number;
  readonly contactBlurPx: number;
  /** Obrót wokół osi poprzecznej, stopnie. Dokłada się do stałego skosu bryły. */
  readonly pitchDeg: number;
  /** Kąty czterech klap: przód, tył, lewa, prawa. */
  readonly flapAngles: readonly [number, number, number, number];
  /** Światło narastające w szwie tuż przed wystrzałem klap, 0–1. */
  readonly seamLight: number;
  /** Upadek: przesunięcie w dół w wysokościach pudełka. */
  readonly fallY: number;
  readonly fallRollDeg: number;
  readonly fallTumbleDeg: number;
  /** Krycie całej bryły — gaśnie dopiero pod koniec upadku. */
  readonly opacity: number;
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

  /**
   * Unoszenie: czysta sinusoida.
   *
   * Nie parabola, jak przy podskoku — bo to nie jest już swobodny lot
   * z lądowaniem, tylko delikatne kołysanie w miejscu. Sinusoida nie ma
   * ani momentu uderzenia, ani zawiśnięcia u szczytu; jest równomierna
   * i właśnie o taką „premium" gładkość tu chodzi.
   */
  const floatPhase = (elapsedS / FLOAT.periodS) * Math.PI * 2;
  let height = Math.sin(floatPhase) * FLOAT.amplitude * bounceEnergy;

  /**
   * Mikroskalowanie sprzężone z wysokością: wyżej znaczy odrobinę bliżej
   * widza. Wartość na granicy dostrzegalności — bez tego unoszenie czyta się
   * jako przesuwanie płaskiego obrazka w pionie, a nie jako ruch w przestrzeni.
   */
  const breath = 1 + Math.sin(floatPhase) * FLOAT.breathScale;
  let scaleX = breath;
  let scaleY = breath;

  /**
   * Zamach przed otwarciem: samo delikatne osiadanie, bez zgniatania bryły.
   *
   * Przy poprzedniej, energicznej animacji pudełko przykucało do 68% wysokości
   * i to była zapowiedź wystrzału. Przy ruchu subtelnym takie przykucnięcie
   * byłoby jedynym gwałtownym zdarzeniem w scenie i kłóciłoby się z resztą.
   * Sygnał „zaraz coś się stanie" niesie teraz samo zatrzymanie unoszenia
   * (amplituda schodzi do zera) plus to nieznaczne osiadanie.
   */
  if (anticipation > 0) {
    const crouch = easeOutCubic(anticipation);
    height -= ANTICIPATION.sinkDepth * 0.4 * crouch;
    scaleY *= 1 - 0.022 * crouch;
    scaleX *= 1 + 0.014 * crouch;
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
  const yawDeg = Math.sin((elapsedS / FLOAT.yawPeriodS) * Math.PI * 2) * FLOAT.yawAmplitudeDeg;

  /**
   * Drugi mikroobrót, w osi poprzecznej.
   *
   * Sam obrót w pionie zostawia bryłę, która kręci się jak na talerzu
   * obrotowym — ruch jest, ale w jednej płaszczyźnie, więc oko odczytuje go
   * jako mechaniczny. Dopiero DWIE niewspółmierne osie (13.7 s i 19.3 s)
   * dają kołysanie, którego tor nigdy się nie powtarza, i to jest różnica
   * między "przedmiotem w przestrzeni" a "obracającym się modelem".
   *
   * Amplituda o połowę mniejsza niż w osi pionowej: przechył pokazuje górę
   * pudełka, a ta jest w tej scenie najbardziej wrażliwa — przy większym
   * kącie zaczyna się zaglądanie do wnętrza jeszcze przed otwarciem.
   */
  const pitchDeg =
    Math.sin((elapsedS / FLOAT.pitchPeriodS) * Math.PI * 2) * FLOAT.pitchAmplitudeDeg;

  /**
   * Cień jako funkcja wysokości.
   *
   * Bez tego pudełko jest naklejką, która zmienia rozmiar — z tym staje się
   * przedmiotem w przestrzeni. Trzy parametry jednocześnie (skala, krycie,
   * rozmycie) dlatego, że tak zachowuje się prawdziwy cień: im dalej od
   * powierzchni, tym mniejszy, jaśniejszy i bardziej rozmyty.
   */
  /**
   * Wysokość → 0..1, gdzie 0 to najniższy punkt unoszenia.
   *
   * TU BYŁ BŁĄD, i to taki, który przeżył zmianę animacji. Wcześniej pudełko
   * PODSKAKIWAŁO: tor był parabolą wychodzącą z zera w górę, więc `height`
   * nigdy nie schodziło poniżej podłoża i `Math.abs()` było poprawne.
   *
   * Po zamianie podskoku na sinusoidalne unoszenie `height` waha się
   * SYMETRYCZNIE wokół zera — a wtedy wartość bezwzględna daje 1 zarówno na
   * szczycie, jak i na DNIE ruchu. Skutek: cień kontaktowy gasł dokładnie
   * wtedy, gdy pudełko jest najniżej, czyli gdy ma być najmocniejszy.
   * Zmierzone krycie w tym stanie wynosiło 0.001 — cienia po prostu nie było.
   *
   * Poprawnie: przemapowanie z [−amplituda, +amplituda] na [0, 1].
   */
  const heightRatio = clamp((height / FLOAT.amplitude + 1) / 2);
  const shadowScale = lerp(SHADOW.scaleGround, SHADOW.scaleApex, heightRatio);
  const shadowOpacity = lerp(SHADOW.opacityGround, SHADOW.opacityApex, heightRatio);
  const shadowBlurPx = lerp(SHADOW.blurGroundPx, SHADOW.blurApexPx, heightRatio);

  /**
   * Cień kontaktowy gaśnie WYKŁADNICZO, nie liniowo.
   *
   * Ta różnica jest tu całym sednem: szczelina bez światła istnieje tylko
   * w bezpośrednim styku. Wystarczy, że przedmiot uniesie się odrobinę,
   * a światło rozproszone wpada pod spód i twarda obwódka znika. Liniowe
   * wygaszanie zostawiałoby ciemną plamkę pod pudełkiem wiszącym u szczytu —
   * i to jest jeden z tych detali, których nikt nie nazwie, ale każdy odbierze
   * jako "coś tu jest nie tak".
   *
   * Krzywa NIE schodzi jednak do zera, tylko do `floor`. Przy podskoku pudełko
   * naprawdę odrywało się od podłoża; przy unoszeniu waha się o kilka pikseli
   * i szczelina pod nim nigdy się w pełni nie otwiera. Zejście do zera dawało
   * przedmiot bez cienia w połowie cyklu — a klient prosił wprost o cienie.
   * Pełne wygaszenie należy teraz do fazy UPADKU i robi je osobny mnożnik.
   */
  const contactOpacity =
    CONTACT_SHADOW.opacityGround *
    (CONTACT_SHADOW.floor +
      (1 - CONTACT_SHADOW.floor) * Math.pow(1 - heightRatio, CONTACT_SHADOW.falloffExponent));
  const contactBlurPx = lerp(CONTACT_SHADOW.blurGroundPx, CONTACT_SHADOW.blurApexPx, heightRatio);

  /* --- FAZA 2: WYSTRZAŁ KLAP --- */
  const openT = phaseProgress(progress, PHASES.OPEN);

  /**
   * Każda klapa dostaje własne okno czasowe wewnątrz fazy OPEN.
   *
   * To jest realizacja zasady "nigdy równo" na najniższym poziomie: klapy nie
   * dzielą jednej krzywej z przesunięciem, tylko każda ma własny, niezależnie
   * przeliczany postęp. Dzięki temu w dowolnym momencie fazy cztery klapy są
   * w czterech różnych miejscach swojego ruchu — a to jest różnica między
   * "coś eksplodowało" a "odtworzyła się animacja".
   */
  const flapAngle = (delay: number): number => {
    const localT = clamp(mapRange(openT, delay, delay + FLAPS.duration, 0, 1));

    /**
     * easeOutQuint: piąta potęga. Bardzo gwałtowny start, bardzo długie
     * hamowanie — dokładnie to, czego wymaga brief. Klapa dostaje impuls,
     * a potem tylko wytraca energię; nie ma tu żadnego "rozpędzania się",
     * bo nic jej nie popycha po drodze.
     */
    const eased = easeOutQuint(localT);

    /**
     * Przestrzelenie zanika osobną, szybszą krzywą. Gdyby wchodziło w ten sam
     * easing, przestrzelenie byłoby największe na końcu ruchu — czyli tam,
     * gdzie klapa już się zatrzymuje. Realnie jest odwrotnie: nadmiar bierze
     * się z bezwładności w trakcie lotu i zdąża wygasnąć przed zatrzymaniem.
     */
    const overshoot = Math.sin(localT * Math.PI) * FLAPS.overshootDeg * (1 - localT * 0.55);

    return lerp(FLAPS.closedDeg, FLAPS.openDeg, eased) - overshoot;
  };

  const flapAngles = [
    flapAngle(FLAPS.delays[0]),
    flapAngle(FLAPS.delays[1]),
    flapAngle(FLAPS.delays[2]),
    flapAngle(FLAPS.delays[3]),
  ] as const;

  /**
   * Światło w szwie: narasta w ZAMACHU, gaśnie razem z pierwszą klapą.
   *
   * Dwie osobne krzywe, bo to dwa różne zjawiska. Narastanie idzie z wysokiego
   * wykładnika (ciśnienie rośnie coraz szybciej — przez większość zamachu nie
   * dzieje się nic widocznego), a wygaszanie z easeOutQuad, czyli natychmiast:
   * gdy szczelina puszcza, nadciśnienie znika w jednej chwili.
   *
   * Gdyby obie strony miały tę samą krzywą, dostalibyśmy symetryczne
   * pulsowanie — a to czyta się jak lampka kontrolna, nie jak coś, co zaraz
   * pęknie.
   */
  const seamBuild = Math.pow(anticipation, SEAM_LIGHT.buildExponent);
  const seamFade = easeOutQuad(clamp(openT / SEAM_LIGHT.fadeRatio));
  const seamLight = seamBuild * (1 - seamFade) * SEAM_LIGHT.peakOpacity;

  /* --- FAZA 4: UPADEK --- */
  const fallT = phaseProgress(progress, PHASES.FALL);

  /**
   * Spadek jest KWADRATOWY, bo tak działa swobodne opadanie.
   *
   * Oko rozpoznaje przyspieszenie ziemskie bez trudu — to jedyny ruch,
   * który każdy widział miliony razy. Liniowe opadanie natychmiast czyta się
   * jako "obiekt jest opuszczany", a nie "obiekt spada".
   */
  const fallY = easeInQuad(fallT) * FALL.distance;

  /**
   * Obrót NIE przyspiesza razem ze spadkiem. Moment obrotowy pudełko dostaje
   * raz, przy oderwaniu, i dalej kręci się mniej więcej równo — bo grawitacja
   * działa na środek masy i nie dokłada obrotu. Wiązanie obrotu z tą samą
   * krzywą co spadek to częsty skrót, który wygląda jak wciągnięcie
   * przedmiotu w wir.
   */
  const fallRollDeg = fallT * FALL.rollDeg;
  const fallTumbleDeg = fallT * FALL.tumbleDeg;

  const opacity = 1 - clamp(mapRange(fallT, FALL.fadeStart, 1, 0, 1));

  return {
    y: height,
    scaleX,
    scaleY,
    yawDeg,
    shadowScale,
    shadowOpacity: shadowOpacity * (1 - clamp(fallT * 2)),
    shadowBlurPx,
    pitchDeg,
    /**
     * Cienie gasną razem z odlotem bryły. Cień przedmiotu, który wypadł
     * z kadru, nie ma prawa zostać na podłodze — a przy szybkim upadku
     * to jedna z tych rzeczy, które łatwo przeoczyć w kodzie i natychmiast
     * widać na ekranie.
     */
    contactOpacity: contactOpacity * (1 - clamp(fallT * 3)),
    contactBlurPx,
    flapAngles,
    seamLight,
    fallY,
    fallRollDeg,
    fallTumbleDeg,
    opacity,
  };
};
