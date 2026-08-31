import { useRef, type CSSProperties, type RefObject } from 'react';
import {
  AMBIENT_SHADOW,
  BOUNCE_LIGHT,
  BOX,
  CARDBOARD,
  CONTACT_SHADOW,
  FLAPS,
  FLAP_SHAPE,
  FLOAT,
  RIM_LIGHT,
} from '../../config/scene';
import { computeBoxState } from '../../lib/boxPhysics';
import { round } from '../../lib/math';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';
import {
  cardboardSurface,
  CORRUGATION,
  edgeFillet,
  FLAP_GLOSS,
  FLAP_RADIUS,
  keyLight,
} from './cardboard';

/**
 * Pudełko zbudowane w CSS 3D.
 *
 * Rola w projekcie: warstwa dla telefonu i dla prefers-reduced-motion, ale
 * budowana PIERWSZA. Fizykę podskoku trzeba przede wszystkim poczuć, a CSS 3D
 * pozwala ją zobaczyć bez stawiania sceny WebGL. Jeśli rytm skoku jest zły,
 * będzie zły również w Three.js — tylko drożej to sprawdzić.
 */

const HALF_W = BOX.widthPx / 2;
const HALF_H = BOX.heightPx / 2;
const HALF_D = BOX.depthPx / 2;

/** Udawana grubość tektury. Widoczna na cięciach klap. */
const BOARD_THICKNESS_PX = 3.5;

/**
 * Wsunięcie fazki względem ostrego narożnika.
 *
 * Fazka to ścięcie pod 45° na pionowej krawędzi. Ścięcie odsunięte o `t`
 * wzdłuż normalnej odsłania po t·√2 na każdej ze ścian, czyli ma szerokość
 * 2t; chcąc fazkę szerokości `edgeFilletPx`, wsuwamy ją o połowę tej wartości.
 * Środek powstałego paska leży wtedy o t·√2/2 do wewnątrz od obu ścian.
 *
 * UWAGA — TU BYŁ BŁĄD I WART JEST ZAPAMIĘTANIA. Pierwsza wersja ustawiała
 * fazkę zapisem `rotateY(45deg) translateZ(d)`, czyli w odległości `d` wzdłuż
 * normalnej. To jest STOPA PROSTOPADŁEJ ze środka bryły, a nie środek ścięcia —
 * a te dwa punkty pokrywają się WYŁĄCZNIE wtedy, gdy rzut pudełka jest
 * kwadratem. Przy 230 × 172 rozjeżdżały się o 20 px, czyli więcej niż cała
 * szerokość fazki: paski lądowały na środku ścian i wyglądały jak doklejone
 * pionowe listwy. Dlatego środek liczymy WPROST, we współrzędnych bryły.
 */
const FILLET_INSET = (BOX.edgeFilletPx * Math.SQRT2) / 4;

/**
 * Cztery pionowe krawędzie.
 *
 * `spec` to siła refleksu i jest RÓŻNA dla każdej krawędzi, bo światło pada
 * z góry z lewej. Krawędź przednio-lewa patrzy w nie niemal prosto — i to ona
 * ma być najjaśniejszą powierzchnią całej bryły. Tylne są od źródła odwrócone
 * i dostają ledwie ślad. Jednakowy refleks na wszystkich czterech natychmiast
 * spłaszcza pudełko, bo mówi oku, że światło przychodzi zewsząd, czyli znikąd.
 */
const EDGE_FILLETS = [
  { key: 'front-left', sx: -1, sz: 1, rotY: -45, spec: 0.3 },
  { key: 'front-right', sx: 1, sz: 1, rotY: 45, spec: 0.12 },
  { key: 'back-right', sx: 1, sz: -1, rotY: 135, spec: 0.05 },
  { key: 'back-left', sx: -1, sz: -1, rotY: -135, spec: 0.09 },
] as const;

/**
 * Poziom podłoża, liczony od GÓRNEJ krawędzi kontenera.
 *
 * Nie wystarczy wziąć spodu kontenera. Kontener ma wysokość pudełka, ale
 * WIZUALNY spód bryły leży wyraźnie niżej, z dwóch niezależnych powodów:
 *
 * 1. Obrót w osi X (-14°) opuszcza przednią dolną krawędź. Punkt (y, z)
 *    przechodzi na y' = y·cos θ + z·sin θ, więc głębokość dokłada się
 *    do wysokości.
 * 2. Ta krawędź jest BLIŻEJ widza (z dodatnie), więc perspektywa dodatkowo
 *    ją powiększa o czynnik d / (d − z).
 *
 * Bez tej korekty cienie lądują za pudełkiem i znikają dokładnie w chwili
 * kontaktu — czyli wtedy, gdy mają być najmocniejsze. Liczymy to z geometrii,
 * żeby zmiana skosu albo proporcji bryły nie wymagała ponownego dobierania
 * wartości ręcznie.
 */
const TILT_RAD = (Math.abs(FLOAT.restTiltXDeg) * Math.PI) / 180;
const PROJECTED_BOTTOM =
  (HALF_H * Math.cos(TILT_RAD) + HALF_D * Math.sin(TILT_RAD)) *
  (BOX.perspectivePx / (BOX.perspectivePx - HALF_D * Math.cos(TILT_RAD)));
/**
 * Ujemna korekta wsuwa cień POD bryłę.
 *
 * Wyliczona krawędź to skrajny, przedni dolny narożnik — najniższy punkt
 * rzutu. Ale przedmiot styka się z podłożem całym dnem, którego środek leży
 * głębiej w scenie, czyli wyżej na ekranie. Cień posadzony na skrajnej
 * krawędzi zostawia jasną szczelinę i pudełko zaczyna wyglądać, jakby
 * lewitowało tuż nad podłogą — a to jest dokładnie ten błąd, przez który
 * cień przestaje robić swoją robotę.
 */
const GROUND_Y = HALF_H + PROJECTED_BOTTOM - 12;

/**
 * Zejście środka cienia PONIŻEJ linii styku.
 *
 * Zmierzone: przy elipsie wyśrodkowanej dokładnie na GROUND_Y (a tak było)
 * najciemniejszy punkt cienia wypada 11 px pod najniższym pikselem pudełka —
 * czyli praktycznie w całości ZA bryłą. Krycie było poprawne, warstwy
 * istniały, a cienia po prostu nie było widać. To ta sama pułapka co przy
 * poprzedniej iteracji: elipsa leżąca na podłodze pod przedmiotem oddaje
 * widzowi wyłącznie swoje BOKI, bo środek zasłania sam przedmiot.
 *
 * Rozwiązaniem nie jest podkręcanie krycia — przy zasłoniętym środku nic to
 * nie daje — tylko zsunięcie plamy w dół, tak żeby jej ciemny rdzeń wyszedł
 * spod bryły. Fizycznie odpowiada to światłu padającemu z góry i OD PRZODU,
 * czyli dokładnie stamtąd, skąd świeci nasze światło kluczowe.
 */
const SHADOW_DROP_PX = BOX.depthPx * 0.17;

const faceBase: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  backfaceVisibility: 'hidden',
  /**
   * Zaokrąglenie narożników.
   *
   * Promień mógł urosnąć dopiero wtedy, gdy pionowe krawędzie dostały fazki
   * (patrz FILLET_DISTANCE). Wcześniej każde zaokrąglenie rozsuwało płaskie
   * prostokąty ścian i w narożnikach pojawiały się prześwity na tło; teraz
   * ścięcie tę szczelinę wypełnia, więc karton może być tak miękki, jak
   * wymaga tego styl ilustracji.
   */
  borderRadius: `${BOX.cornerRadiusPx}px`,
};

interface CssBoxProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const CssBox = ({ scrollRef }: CssBoxProps): React.ReactElement => {
  const boxRef = useRef<HTMLDivElement>(null);
  const ambientShadowRef = useRef<HTMLDivElement>(null);
  const softShadowRef = useRef<HTMLDivElement>(null);
  const contactShadowRef = useRef<HTMLDivElement>(null);
  const bounceRef = useRef<HTMLDivElement>(null);
  const flapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const seamRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;
    const state = computeBoxState(elapsedS, smooth);

    if (boxRef.current) {
      /**
       * Kolejność transformacji ma znaczenie i nie jest dowolna:
       * najpierw przesunięcie w przestrzeni, potem obrót bryły, na końcu
       * skalowanie (squash). Gdyby skalowanie szło przed obrotem, zgniecenie
       * odbywałoby się w obróconym układzie i pudełko ścinałoby się na skos
       * zamiast spłaszczać do podłoża.
       *
       * Upadek dokłada się PRZED obrotami spoczynkowymi: przesunięcie w dół
       * ma się odbywać w układzie ekranu, a koziołkowanie nakładać na skos
       * bryły, nie zastępować go.
       */
      const totalY = -state.y * BOX.heightPx + state.fallY * BOX.heightPx;

      boxRef.current.style.transform = [
        `translate3d(0, ${round(totalY)}px, 0)`,
        `rotateZ(${round(state.fallRollDeg, 2)}deg)`,
        `rotateX(${round(FLOAT.restTiltXDeg + state.pitchDeg + state.fallTumbleDeg, 2)}deg)`,
        `rotateY(${round(FLOAT.restTiltYDeg + state.yawDeg)}deg)`,
        `scale3d(${round(state.scaleX, 4)}, ${round(state.scaleY, 4)}, ${round(state.scaleX, 4)})`,
      ].join(' ');
      boxRef.current.style.opacity = `${round(state.opacity, 3)}`;
    }

    // Każda klapa dostaje własny kąt — to jedyna rzecz, jaką animujemy
    // na klapie, bo cała reszta jej geometrii jest statyczna.
    for (let i = 0; i < 4; i += 1) {
      const node = flapRefs.current[i];
      const angle = state.flapAngles[i];
      if (!node || angle === undefined) continue;
      node.style.transform = `rotateX(${round(angle, 2)}deg)`;
    }

    /**
     * Światło w szwie — następca pękającej taśmy.
     *
     * Animujemy WYŁĄCZNIE `opacity`. Kusiło, żeby razem z narastaniem
     * poszerzać też smugę, ale to jest dokładnie ta klasa zmian, która
     * w tej scenie kosztuje połowę budżetu klatki: szerokość to KSZTAŁT,
     * a kształt wewnątrz `preserve-3d` przelicza się od nowa co klatkę.
     */
    for (let i = 0; i < 2; i += 1) {
      const node = seamRefs.current[i];
      if (node) node.style.opacity = `${round(state.seamLight, 3)}`;
    }

    if (ambientShadowRef.current) {
      // Okluzja otoczenia reaguje na wysokość ZNACZNIE słabiej niż cień
      // rzucony: to ubytek światła rozproszonego, więc kilka centymetrów
      // uniesienia niewiele w nim zmienia. Stąd spłaszczony zakres.
      const s = ambientShadowRef.current.style;
      s.opacity = `${round(AMBIENT_SHADOW.opacity * (0.72 + state.shadowOpacity * 0.35), 3)}`;
    }

    if (softShadowRef.current) {
      const s = softShadowRef.current.style;
      s.transform = `translate3d(-50%, 0, 0) scale(${round(state.shadowScale, 4)})`;
      s.opacity = `${round(state.shadowOpacity, 3)}`;
      s.filter = `blur(${round(state.shadowBlurPx, 1)}px)`;
    }

    if (contactShadowRef.current) {
      const s = contactShadowRef.current.style;
      /**
       * Cień kontaktowy kurczy się MOCNIEJ niż miękki. Nie jest to ozdobnik:
       * obszar bez dostępu światła zwęża się gwałtowniej niż półcień, więc
       * przy oderwaniu obwódka najpierw się ściąga, a dopiero potem gaśnie.
       */
      s.transform = `translate3d(-50%, 0, 0) scale(${round(state.shadowScale * 0.88, 4)})`;
      s.opacity = `${round(state.contactOpacity, 3)}`;
      s.filter = `blur(${round(state.contactBlurPx, 1)}px)`;
    }

    if (bounceRef.current) {
      // Odbicie od podłoża gaśnie tak samo szybko jak cień kontaktowy —
      // bo to ta sama sytuacja widziana z drugiej strony: światło odbite
      // wraca w spód przedmiotu tylko wtedy, gdy ten jest blisko podłogi.
      bounceRef.current.style.opacity = `${round(state.contactOpacity * BOUNCE_LIGHT.opacity, 3)}`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      aria-hidden="true"
      /**
       * Skalowanie responsywne.
       *
       * Bryła ma stałe wymiary w pikselach, a najszersza warstwa cienia jest
       * od niej ponad dwukrotnie szersza — razem grubo ponad 500 px. Na ekranie
       * 375 px (najwęższy testowany) nie mieści się to w kadrze.
       *
       * Skalujemy CAŁĄ scenę jednym transformem zamiast przeliczać każdy wymiar
       * osobno. Dzięki temu proporcje, perspektywa i cienie pozostają
       * nienaruszone — a `scale` nie kosztuje nic, bo i tak działamy na
       * gotowej warstwie kompozycji.
       */
      className="relative flex scale-[0.76] items-center justify-center sm:scale-[0.85] md:scale-100"
      style={{ perspective: `${BOX.perspectivePx}px` }}
    >
      {/* --- CIEŃ, TRZY WARSTWY + ODBICIE ---
          Osobno od pudełka, bo NIE dziedziczą jego skalowania: zgniecenie
          pudełka nie może zgniatać cienia (cień leży na podłodze i nie ma
          powodu się kurczyć razem z bryłą).

          Trzy warstwy, bo realny cień to trzy różne zjawiska o trzech różnych
          zasięgach: okluzja otoczenia (bardzo szeroka, płaska), cień rzucony
          (średni, reaguje na wysokość) i kontaktowy (wąski, twardy, znika
          natychmiast po oderwaniu). Jedna uśredniona plama zawsze wygląda
          jak naklejona pod spodem — i tak wyglądała pierwsza wersja. */}
      <div
        ref={ambientShadowRef}
        className="absolute left-1/2"
        style={{
          top: `${GROUND_Y + SHADOW_DROP_PX - BOX.depthPx * 0.46}px`,
          width: `${BOX.widthPx * AMBIENT_SHADOW.widthRatio}px`,
          height: `${BOX.depthPx * AMBIENT_SHADOW.heightRatio}px`,
          marginLeft: `${(-BOX.widthPx * AMBIENT_SHADOW.widthRatio) / 2}px`,
          borderRadius: '50%',
          /**
           * Ta warstwa NIE dostaje `filter: blur`.
           *
           * Rozmycie tej wielkości to najdroższa rzecz, jaką można w tej
           * scenie włączyć — zmierzone 13 fps zamiast 60 przy plamach tła.
           * Gradient wielostopniowy daje tu identyczny efekt za zero, bo
           * i tak jest to miękka elipsa bez żadnych detali do rozmycia.
           */
          background:
            'radial-gradient(ellipse closest-side, rgba(38,46,84,0.34) 0%, rgba(38,46,84,0.19) 38%, rgba(38,46,84,0.07) 68%, rgba(38,46,84,0) 100%)',
          opacity: AMBIENT_SHADOW.opacity,
        }}
      />
      <div
        ref={softShadowRef}
        className="absolute left-1/2 will-change-transform"
        style={{
          top: `${GROUND_Y + SHADOW_DROP_PX - BOX.depthPx * 0.26}px`,
          width: `${BOX.widthPx * 1.55}px`,
          height: `${BOX.depthPx * 0.52}px`,
          borderRadius: '50%',
          /**
           * Cień jest CHŁODNY i granatowy, nie czarny.
           *
           * Czerń jest w cieniu niemal zawsze błędem: realny cień ma barwę
           * światła OTOCZENIA, a scenę oświetlają zimne, niebiesko-fioletowe
           * plamy z tła. Czarna plama pod pudełkiem natychmiast czyta się
           * jako ciężka i doklejona.
           */
          background:
            'radial-gradient(ellipse closest-side, rgba(44,52,92,0.6) 0%, rgba(44,52,92,0.55) 32%, rgba(44,52,92,0.28) 62%, rgba(44,52,92,0) 100%)',
          transform: 'translate3d(-50%, 0, 0)',
        }}
      />
      <div
        ref={contactShadowRef}
        className="absolute left-1/2 will-change-transform"
        style={{
          top: `${GROUND_Y + SHADOW_DROP_PX * 0.55 - BOX.depthPx * 0.15}px`,
          width: `${BOX.widthPx * CONTACT_SHADOW.widthRatio}px`,
          height: `${BOX.depthPx * 0.44}px`,
          borderRadius: '50%',
          // Cień kontaktowy jest ciemniejszy i cieplejszy od miękkiego —
          // to szczelina bez dostępu światła, więc dominuje w niej lokalna
          // barwa przedmiotu, nie oświetlenia.
          background:
            'radial-gradient(ellipse closest-side, rgba(52,38,26,0.76) 0%, rgba(52,38,26,0.66) 38%, rgba(52,38,26,0.3) 70%, rgba(52,38,26,0) 100%)',
          transform: 'translate3d(-50%, 0, 0)',
        }}
      />
      {/* Światło odbite od podłogi w spód pudełka. Leży NA cieniu, bo to
          jest rozjaśnienie samego cienia, nie osobna plama na podłodze. */}
      <div
        ref={bounceRef}
        className="absolute left-1/2"
        style={{
          top: `${GROUND_Y + SHADOW_DROP_PX * 0.55 - BOX.depthPx * 0.17}px`,
          width: `${BOX.widthPx * BOUNCE_LIGHT.widthRatio}px`,
          height: `${BOX.depthPx * BOUNCE_LIGHT.heightRatio}px`,
          marginLeft: `${(-BOX.widthPx * BOUNCE_LIGHT.widthRatio) / 2}px`,
          borderRadius: '50%',
          background: `radial-gradient(ellipse closest-side, ${BOUNCE_LIGHT.color} 0%, rgba(255,214,158,0) 100%)`,
          opacity: BOUNCE_LIGHT.opacity,
        }}
      />

      <div
        ref={boxRef}
        className="relative will-change-transform"
        style={{
          width: `${BOX.widthPx}px`,
          height: `${BOX.heightPx}px`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* --- ŚCIANY --- */}

        {/* Przód — nośnik nadruku. */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.widthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) translateZ(${HALF_D}px)`,
            /**
             * Nadruk NIE MOŻE wyjść poza ścianę — farba nie wisi w powietrzu.
             * Bez tego przycięcia napis rozjeżdża się poza karton przy każdym
             * kroju szerszym od docelowego, a Cabinet Grotesk bywa niedostępny
             * (blokada hosta w podglądzie) i wtedy wchodzi krój zastępczy.
             */
            overflow: 'hidden',
            ...cardboardSurface({
              /**
               * DWIE warstwy: miękka plama światła u góry po lewej, a pod nią
               * gradient opisujący ogólny kierunek oświetlenia.
               *
               * Sam gradient liniowy mówi tylko "jaśniej stąd, ciemniej tam" —
               * czyli opisuje światło z nieskończoności. Plama dokłada
               * informację, że źródło jest BLISKO, i to ona odpowiada za
               * większość wrażenia bryły na płaskiej ścianie.
               */
              gradient: [
                keyLight(30, 14, 78, 0.2),
                `linear-gradient(152deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 54%, ${CARDBOARD.dark} 100%)`,
              ].join(', '),
              occlusion: [
                'inset 0 -34px 40px -22px rgba(88,58,30,0.5)',
                'inset 0 18px 30px -18px rgba(88,58,30,0.24)',
                'inset 22px 0 34px -24px rgba(88,58,30,0.3)',
                'inset -22px 0 34px -24px rgba(88,58,30,0.3)',
              ].join(', '),
              /**
               * FAZOWANIE + ŚWIATŁO KONTUROWE.
               *
               * Jasna nitka u góry i ciemna u dołu to fazka: żaden realny
               * przedmiot nie ma nieskończenie ostrej krawędzi, a to właśnie
               * ten jeden piksel odróżnia bryłę od prostokąta.
               *
               * Do tego kolorowe refleksy z tła — chłodny od lewej, fioletowy
               * od prawej. Pudełko stoi w scenie oświetlonej zimnymi plamami
               * światła, więc jego krawędzie MUSZĄ łapać ich barwę. Bez tego
               * wygląda jak wycięte z innego zdjęcia.
               */
              edgeLight: [
                `inset 0 1.5px 0 ${CARDBOARD.bevelLight}`,
                `inset 0 -1px 0 ${CARDBOARD.bevelDark}`,
                `inset 3px 0 10px -6px ${RIM_LIGHT.cool}`,
                `inset -3px 0 10px -6px ${RIM_LIGHT.violet}`,
              ].join(', '),
            }),
          }}
        >
          <BoxPrint />
        </div>

        {/* Tył */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.widthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${HALF_D}px)`,
            ...cardboardSurface({
              gradient: `linear-gradient(152deg, ${CARDBOARD.base} 0%, ${CARDBOARD.dark} 100%)`,
            }),
          }}
        />

        {/* Bok prawy — odwrócony od światła, więc wyraźnie ciemniejszy. */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.depthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${HALF_W}px)`,
            ...cardboardSurface({
              // Zbyt zbliżone jasności ścian to najczęstszy powód, dla którego
              // bryła w CSS 3D wygląda jak płaski rysunek pudełka. Ta ściana
              // schodzi więc wyraźnie niżej niż `dark`.
              gradient: `linear-gradient(168deg, ${CARDBOARD.base} 0%, ${CARDBOARD.dark} 68%, #83603A 100%)`,
              occlusion: [
                'inset 0 -30px 34px -20px rgba(78,52,26,0.58)',
                'inset 26px 0 36px -26px rgba(78,52,26,0.48)',
              ].join(', '),
              edgeLight: [
                `inset 0 1.5px 0 ${CARDBOARD.bevelLight}`,
                `inset 0 -1px 0 ${CARDBOARD.bevelDark}`,
                `inset -3px 0 12px -6px ${RIM_LIGHT.violet}`,
              ].join(', '),
            }),
          }}
        />

        {/* Bok lewy — zwrócony do światła. */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.depthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${HALF_W}px)`,
            ...cardboardSurface({
              gradient: [
                keyLight(38, 16, 80, 0.26),
                `linear-gradient(192deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 60%, ${CARDBOARD.dark} 100%)`,
              ].join(', '),
              occlusion: [
                'inset 0 -28px 32px -20px rgba(78,52,26,0.48)',
                'inset -26px 0 36px -26px rgba(78,52,26,0.38)',
              ].join(', '),
              edgeLight: [
                `inset 0 1.5px 0 ${CARDBOARD.bevelLight}`,
                `inset 0 -1px 0 ${CARDBOARD.bevelDark}`,
                `inset 3px 0 12px -6px ${RIM_LIGHT.cool}`,
              ].join(', '),
            }),
          }}
        />

        {/* Spód */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.widthPx}px`,
            height: `${BOX.depthPx}px`,
            transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${HALF_H}px)`,
            background: CARDBOARD.interior,
          }}
        />

        {/* --- FAZKI PIONOWYCH KRAWĘDZI ---
            Cztery wąskie ścięcia pod 45°, po jednym na każdą pionową krawędź.
            Robią dwie rzeczy naraz: wypełniają szczelinę, którą zostawia
            zaokrąglenie narożników ścian, i prowadzą wzdłuż kantu wąski
            refleks. To ten refleks — nie łuk — mówi oku "ta krawędź jest
            zaokrąglona". */}
        {EDGE_FILLETS.map((fillet) => (
          <div
            key={fillet.key}
            style={{
              ...faceBase,
              width: `${BOX.edgeFilletPx}px`,
              height: `${BOX.heightPx}px`,
              transform: [
                'translate(-50%, -50%)',
                `translate3d(${round(fillet.sx * (HALF_W - FILLET_INSET), 2)}px, 0, ${round(fillet.sz * (HALF_D - FILLET_INSET), 2)}px)`,
                `rotateY(${fillet.rotY}deg)`,
              ].join(' '),
              // Zaokrąglenie tylko na końcach paska, i to niewielkie —
              // fazka ma zlewać się ze ścianami, a nie być osobną listwą.
              borderRadius: '3px',
              ...edgeFillet(fillet.spec),
            }}
          />
        ))}

        {/* --- WNĘTRZE ---
            Brief: "Wnętrze pudełka jest ciemne, żeby to, co z niego wychodzi,
            miało z czego się wyłonić." Bez tego ikony w Etapie 4 pojawiałyby
            się na tle podłogi, a nie wychodziły z mroku.

            Wnętrze wymaga WŁASNYCH ścianek i nie da się tego obejść. Ściany
            zewnętrzne mają `backface-visibility: hidden`, więc oglądane od
            środka są po prostu niewidoczne — po otwarciu klap przez otwór
            widać było tło strony. Jeden element nie może mieć dwóch różnych
            powierzchni, więc każda ściana potrzebuje ciemnego bliźniaka
            odwróconego do wewnątrz. */}
        <InnerWall
          width={BOX.widthPx}
          height={BOX.heightPx}
          transform={`translateZ(${HALF_D - 1}px) rotateY(180deg)`}
          shade={0.55}
        />
        <InnerWall
          width={BOX.widthPx}
          height={BOX.heightPx}
          transform={`rotateY(180deg) translateZ(${HALF_D - 1}px) rotateY(180deg)`}
          shade={0.9}
        />
        <InnerWall
          width={BOX.depthPx}
          height={BOX.heightPx}
          transform={`rotateY(90deg) translateZ(${HALF_W - 1}px) rotateY(180deg)`}
          shade={0.75}
        />
        <InnerWall
          width={BOX.depthPx}
          height={BOX.heightPx}
          transform={`rotateY(-90deg) translateZ(${HALF_W - 1}px) rotateY(180deg)`}
          shade={0.68}
        />

        {/* Dno widziane od środka — najciemniejszy punkt sceny. */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.widthPx - 2}px`,
            height: `${BOX.depthPx - 2}px`,
            backfaceVisibility: 'visible',
            transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${-(HALF_H - 1)}px)`,
            background: `radial-gradient(ellipse at 50% 35%, #241606 0%, #0B0602 90%)`,
            boxShadow: 'inset 0 0 46px 14px rgba(0,0,0,0.9)',
          }}
        />

        {/* --- KLAPY ---
            Klapy boczne leżą o włos niżej niż przednia i tylna. W prawdziwym
            kartonie klapy się zachodzą; tutaj chodzi dodatkowo o to, żeby
            cztery współpłaszczyznowe prostokąty nie walczyły o pierwszeństwo
            w buforze głębi (z-fighting), co daje migotanie przy obrocie. */}
        {/* Kolejność musi odpowiadać FLAPS.delays: przód, tył, lewa, prawa. */}
        <Flap
          index={0}
          flapRefs={flapRefs}
          baseRotateY={0}
          offset={HALF_D}
          width={BOX.widthPx}
          depth={HALF_D}
          sink={0}
        />
        <Flap
          index={1}
          flapRefs={flapRefs}
          baseRotateY={180}
          offset={HALF_D}
          width={BOX.widthPx}
          depth={HALF_D}
          sink={0}
        />
        <Flap
          index={2}
          flapRefs={flapRefs}
          baseRotateY={-90}
          offset={HALF_W}
          width={BOX.depthPx}
          depth={HALF_W}
          sink={1.5}
        />
        <Flap
          index={3}
          flapRefs={flapRefs}
          baseRotateY={90}
          offset={HALF_W}
          width={BOX.depthPx}
          depth={HALF_W}
          sink={1.5}
        />

        {/* --- ŚWIATŁO W SZWIE ---
            Dwie wąskie smugi na krzyż, dokładnie tam, gdzie stykają się cztery
            klapy. Leżą TUŻ NAD nimi (translateZ o 2 px więcej), bo mają być
            widoczne przy pudełku jeszcze zamkniętym — to jest zapowiedź
            wystrzału, więc musi wyprzedzać ruch.

            Smuga jest jasna w środku i schodzi do zera na obu końcach: światło
            uchodzi szczeliną, a szczelina jest najszersza pośrodku. Pasek
            o stałej jasności czytałby się jak świecąca listwa. */}
        {[
          { key: 'seam-w', w: BOX.widthPx * 0.92, h: 5, rot: 0 },
          { key: 'seam-d', w: BOX.depthPx * 0.92, h: 5, rot: 90 },
        ].map((seam, i) => (
          <div
            key={seam.key}
            ref={(node) => {
              seamRefs.current[i] = node;
            }}
            className="will-change-[opacity]"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: `${seam.w}px`,
              height: `${seam.h}px`,
              marginLeft: `${-seam.w / 2}px`,
              marginTop: `${-seam.h / 2}px`,
              transform: `rotateX(90deg) translateZ(${HALF_H + 2}px) rotateZ(${seam.rot}deg)`,
              background:
                'linear-gradient(90deg, rgba(255,214,150,0) 0%, rgba(255,236,198,0.95) 26%, rgba(255,252,240,1) 50%, rgba(255,236,198,0.95) 74%, rgba(255,214,150,0) 100%)',
              // Rozmycie WPIECZONE w gradient pionowy, nie `filter: blur` —
              // filtr na elemencie w `preserve-3d` przelicza się co klatkę.
              maskImage:
                'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 45%, #000 55%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage:
                'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 45%, #000 55%, rgba(0,0,0,0) 100%)',
              opacity: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------- */

interface InnerWallProps {
  readonly width: number;
  readonly height: number;
  readonly transform: string;
  /** 0 = jasno, 1 = zupełny mrok. Ściany dalsze od otworu są ciemniejsze. */
  readonly shade: number;
}

/**
 * Ścianka wnętrza.
 *
 * Każda ma inną jasność, i to nie jest ozdobnik: światło wpada do pudełka
 * wyłącznie przez otwór u góry, więc ściana zwrócona ku niemu łapie go
 * najwięcej, a przeciwległa prawie wcale. Jednolicie czarne wnętrze wygląda
 * jak dziura wycięta w obrazku, a nie jak przestrzeń.
 *
 * Gradient pionowy dokłada drugą połowę efektu: przy krawędzi otworu jaśniej,
 * ku dnu coraz ciemniej.
 */
const InnerWall = ({ width, height, transform, shade }: InnerWallProps): React.ReactElement => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${width}px`,
      height: `${height}px`,
      backfaceVisibility: 'hidden',
      transform: `translate(-50%, -50%) ${transform}`,
      background: `linear-gradient(180deg,
        rgba(74,48,22,${1 - shade * 0.55}) 0%,
        rgba(40,25,10,${1 - shade * 0.72}) 38%,
        rgba(12,7,2,${0.92 + shade * 0.08}) 100%)`,
      backgroundColor: '#150D04',
    }}
  />
);

/* ------------------------------------------------------------------------- */

interface FlapProps {
  /** Pozycja w tablicy kątów z fizyki. Kolejność: przód, tył, lewa, prawa. */
  readonly index: number;
  readonly flapRefs: RefObject<Array<HTMLDivElement | null>>;
  /** Obrót ustawiający klapę na właściwej krawędzi górnej. */
  readonly baseRotateY: number;
  /** Odległość zawiasu od środka bryły. */
  readonly offset: number;
  readonly width: number;
  readonly depth: number;
  /** Obniżenie zawiasu, żeby klapy się nie nakładały w tej samej płaszczyźnie. */
  readonly sink: number;
}

/**
 * Klapa na własnym zawiasie.
 *
 * Konstrukcja TRÓJwarstwowa i każda warstwa ma osobny powód:
 *
 * 1. Zewnętrzny div to bezwymiarowy PUNKT na krawędzi zawiasu. Dzięki niemu
 *    obrót klapy jest czystym `rotateX` wokół prawdziwej osi — bez przesunięć
 *    kompensacyjnych, które przy czterech klapach zamieniłyby się w koszmar.
 * 2. Panel (animowany) trzyma kąt i nic poza tym.
 * 3. DWIE powierzchnie wewnątrz panelu: wierzch i spód tektury.
 *
 * Trzecia warstwa jest nowa i wynika z geometrii, nie z estetyki. Klapa
 * otwarta na −208° przewala się przez pion, więc widz ogląda jej SPÓD, a nie
 * wierzch. Wcześniej klapa była jedną płaszczyzną i po otwarciu pokazywała
 * własny wierzch w lustrzanym odbiciu — przy jednolitym gradiencie nikt tego
 * nie zauważał, ale przy ukośnym połysku błysk uciekałby w złą stronę.
 */
const Flap = ({
  index,
  flapRefs,
  baseRotateY,
  offset,
  width,
  depth,
  sink,
}: FlapProps): React.ReactElement => {
  const panelHeight = depth - BOX.flapGapPx;

  const faceCommon: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    borderRadius: FLAP_RADIUS,
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 0,
        height: 0,
        transformStyle: 'preserve-3d',
        transform: `rotateY(${baseRotateY}deg) translateY(${-HALF_H + sink}px) translateZ(${offset}px)`,
      }}
    >
      <div
        ref={(node) => {
          flapRefs.current[index] = node;
        }}
        className="will-change-transform"
        style={{
          position: 'absolute',
          left: `${-width / 2}px`,
          top: 0,
          width: `${width}px`,
          height: `${panelHeight}px`,
          transformOrigin: '50% 0',
          transform: `rotateX(${FLAPS.closedDeg}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* WIERZCH — widoczny przy pudełku zamkniętym. */}
        <div
          style={{
            ...faceCommon,
            ...cardboardSurface({
              gradient: `linear-gradient(178deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 60%, ${CARDBOARD.dark} 100%)`,
              // Klapa jest przyciemniona bliżej zawiasu — tam wpada najmniej światła.
              occlusion: 'inset 0 22px 28px -20px rgba(78,52,26,0.5)',
              edgeLight: [
                // Jasna nitka biegnie wzdłuż WOLNEJ krawędzi i podąża za jej
                // łukiem, bo cień wewnętrzny respektuje `border-radius`.
                // To ona rysuje sylwetkę klapy — bez niej łuk ginie na tle.
                `inset 0 -2px 0 ${CARDBOARD.bevelLight}`,
                `inset 0 1px 0 ${CARDBOARD.bevelDark}`,
              ].join(', '),
            }),
          }}
        >
          <div style={{ ...faceCommon, ...FLAP_GLOSS }} />
        </div>

        {/* SPÓD — powierzchnia oglądana przez większość sceny, bo klapa
            otwarta jest odwrócona. Ciemniejsza i bez plamy światła: patrzy
            w dół i do środka, więc łapie głównie odbicia. */}
        <div
          style={{
            ...faceCommon,
            transform: 'rotateY(180deg)',
            ...cardboardSurface({
              // Kierunek odwrócony względem wierzchu: przy otwartej klapie
              // ZAWIAS jest na dole (przy pudełku), a wolna krawędź w górze,
              // więc to ona łapie światło.
              gradient: `linear-gradient(180deg, ${CARDBOARD.innerDark} 0%, ${CARDBOARD.inner} 46%, ${CARDBOARD.innerLight} 100%)`,
              occlusion: 'inset 0 26px 34px -18px rgba(62,40,18,0.72)',
              edgeLight: `inset 0 -2px 0 rgba(255,240,214,0.55)`,
            }),
          }}
        >
          <div style={{ ...faceCommon, ...FLAP_GLOSS, opacity: FLAP_SHAPE.glossOpacity * 0.5 }} />
        </div>

        {/* Cięta krawędź — tu widać, że tektura ma grubość i jest falista.

            Pasek jest WĘŻSZY od klapy i wyśrodkowany, bo sylwetka ma teraz
            łuk: prosty pasek na pełną szerokość wystawałby poza zakrzywione
            narożniki. Szerokość dobrana tak, żeby mieścił się w płaskim
            środku łuku (patrz FLAP_SHAPE.cutEdgeWidthPct).

            `rotateX(90deg)` odchyla pasek W DÓŁ od płaszczyzny klapy, czyli
            w grubość materiału. Przeciwny znak wyprowadzał go do góry i przy
            czterech klapach dawał efekt grzebienia sterczącego nad pudełkiem. */}
        <div
          style={{
            position: 'absolute',
            left: `${(100 - FLAP_SHAPE.cutEdgeWidthPct) / 2}%`,
            bottom: 0,
            width: `${FLAP_SHAPE.cutEdgeWidthPct}%`,
            height: `${BOARD_THICKNESS_PX}px`,
            transformOrigin: '50% 100%',
            transform: 'rotateX(90deg)',
            borderRadius: '1.5px',
            ...CORRUGATION,
          }}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------- */

/**
 * Nadruk na przedniej ścianie.
 *
 * `mix-blend-mode: multiply` — wymóg z brief'u i słuszny: farba drukarska
 * nie leży NA kartonie, tylko wsiąka w niego, więc przejmuje jego fakturę
 * i cieniowanie. Bez trybu mnożenia napis wygląda jak naklejka nałożona
 * w programie graficznym, co jest dokładnie tym, czego unikamy.
 */
const BoxPrint = (): React.ReactElement => (
  <div
    className="flex h-full w-full flex-col items-center justify-center select-none"
    style={{
      mixBlendMode: 'multiply',
      // Nadruk odrobinę przekrzywiony i nie idealnie kryjący. Sitodruk na
      // kartonie nigdy nie jest ani równy, ani pełny — a idealny nadruk
      // natychmiast zdradza, że to grafika wektorowa, a nie przedmiot.
      transform: 'rotate(-0.4deg)',
      opacity: 0.9,
    }}
  >
    {/* Farba przyciemniona względem poprzedniej wersji, bo karton pojaśniał.
        W trybie mnożenia wynik zależy OD OBU warstw — rozjaśnienie podłoża
        automatycznie rozjaśnia nadruk, więc żeby kontrast został ten sam,
        farba musi zejść niżej. */}
    <span
      className="font-display text-[23px] leading-none font-extrabold whitespace-nowrap"
      // Rozmiar dobrany tak, żeby napis mieścił się na ścianie także w krojach
      // szerszych od docelowego — nadruk wychodzący poza karton natychmiast
      // zdradza, że to warstwa tekstu, a nie farba na powierzchni.
      style={{ color: '#6B451F', letterSpacing: '0.01em' }}
    >
      OTWÓRZ MNIE
    </span>
    <span
      className="mt-2 font-mono text-[10px] tracking-[0.34em] uppercase"
      style={{ color: '#7C5330' }}
    >
      przewijając
    </span>
    <div className="mt-3 flex gap-1.5" style={{ color: '#7C5330' }}>
      {[0, 1, 2].map((index) => (
        <svg key={index} width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true">
          <path
            d="M1 1L5.5 5.5L10 1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            // Strzałki blakną ku dołowi — prowadzą wzrok w kierunku scrolla.
            opacity={1 - index * 0.3}
          />
        </svg>
      ))}
    </div>
  </div>
);
