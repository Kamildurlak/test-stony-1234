import { useRef, type CSSProperties, type RefObject } from 'react';
import { BOUNCE, BOX, CARDBOARD, CONTACT_SHADOW, FLAPS, TAPE_BREAK } from '../../config/scene';
import { computeBoxState } from '../../lib/boxPhysics';
import { round } from '../../lib/math';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';
import { cardboardSurface, CORRUGATION, TAPE_BOTTOM_HALF, TAPE_TOP_HALF } from './cardboard';

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
const TILT_RAD = (Math.abs(BOUNCE.restTiltXDeg) * Math.PI) / 180;
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

const faceBase: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  backfaceVisibility: 'hidden',
};

interface CssBoxProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const CssBox = ({ scrollRef }: CssBoxProps): React.ReactElement => {
  const boxRef = useRef<HTMLDivElement>(null);
  const softShadowRef = useRef<HTMLDivElement>(null);
  const contactShadowRef = useRef<HTMLDivElement>(null);
  const flapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tapeRefs = useRef<Array<HTMLDivElement | null>>([]);

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
        `rotateX(${round(BOUNCE.restTiltXDeg + state.fallTumbleDeg, 2)}deg)`,
        `rotateY(${round(BOUNCE.restTiltYDeg + state.yawDeg)}deg)`,
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
     * Taśma pęka i rozchodzi się na boki, każda połówka w swoją stronę
     * i z lekkim skręceniem. Zaraz potem gaśnie — nie dlatego, że taśma
     * znika, tylko dlatego, że przy tej prędkości i tak przestaje być
     * czytelna, a jej ślad na otwartych klapach dodawałby wyłącznie bałaganu.
     */
    for (let i = 0; i < 2; i += 1) {
      const node = tapeRefs.current[i];
      if (!node) continue;
      const direction = i === 0 ? -1 : 1;
      const offset = state.tapeBreak * TAPE_BREAK.partPx * direction;
      const curl = state.tapeBreak * TAPE_BREAK.curlDeg * direction;
      node.style.transform = `translate3d(0, ${round(offset)}px, 0) rotateZ(${round(curl, 2)}deg)`;
      node.style.opacity = `${round(1 - state.tapeBreak * 0.85, 3)}`;
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
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      aria-hidden="true"
      /**
       * Skalowanie responsywne.
       *
       * Bryła ma stałe wymiary w pikselach, a cień jest od niej o 42% szerszy —
       * razem ponad 330 px. Na ekranie 375 px (najwęższy testowany) nie mieści
       * się to w kadrze i nadruk był ucinany.
       *
       * Skalujemy CAŁĄ scenę jednym transformem zamiast przeliczać każdy wymiar
       * osobno. Dzięki temu proporcje, perspektywa i cienie pozostają
       * nienaruszone — a `scale` nie kosztuje nic, bo i tak działamy na
       * gotowej warstwie kompozycji.
       */
      className="relative flex scale-[0.76] items-center justify-center sm:scale-[0.85] md:scale-100"
      style={{ perspective: `${BOX.perspectivePx}px` }}
    >
      {/* --- CIEŃ, DWIE WARSTWY ---
          Osobno od pudełka, bo NIE dziedziczą jego skalowania: zgniecenie
          pudełka nie może zgniatać cienia (cień leży na podłodze i nie ma
          powodu się kurczyć razem z bryłą). */}
      <div
        ref={softShadowRef}
        className="absolute left-1/2 will-change-transform"
        style={{
          top: `${GROUND_Y - BOX.depthPx * 0.26}px`,
          width: `${BOX.widthPx * 1.42}px`,
          height: `${BOX.depthPx * 0.52}px`,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse closest-side, rgba(38,24,12,0.95) 0%, rgba(38,24,12,0.55) 45%, rgba(38,24,12,0) 100%)',
          transform: 'translate3d(-50%, 0, 0)',
        }}
      />
      <div
        ref={contactShadowRef}
        className="absolute left-1/2 will-change-transform"
        style={{
          top: `${GROUND_Y - BOX.depthPx * 0.15}px`,
          width: `${BOX.widthPx * CONTACT_SHADOW.widthRatio}px`,
          height: `${BOX.depthPx * 0.3}px`,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse closest-side, rgba(24,14,6,1) 0%, rgba(24,14,6,0.7) 55%, rgba(24,14,6,0) 100%)',
          transform: 'translate3d(-50%, 0, 0)',
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
            ...cardboardSurface({
              gradient: `linear-gradient(158deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 52%, ${CARDBOARD.dark} 100%)`,
              // Przyciemnienie przy wszystkich krawędziach + mocniejsze u dołu,
              // gdzie ściana schodzi się z podłożem.
              occlusion:
                'inset 0 -26px 30px -18px rgba(48,28,12,0.55), inset 0 14px 26px -16px rgba(48,28,12,0.30), inset 18px 0 26px -20px rgba(48,28,12,0.35), inset -18px 0 26px -20px rgba(48,28,12,0.35)',
              edgeLight: 'inset 0 1px 0 rgba(255,238,214,0.42)',
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
              gradient: `linear-gradient(158deg, ${CARDBOARD.base} 0%, ${CARDBOARD.dark} 100%)`,
            }),
          }}
        />

        {/* Bok prawy — odwrócony od światła, więc wyraźnie ciemniejszy.
            Zbyt zbliżona jasność ścian to najczęstszy powód, dla którego
            bryła w CSS 3D wygląda jak płaski rysunek pudełka. */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.depthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${HALF_W}px)`,
            ...cardboardSurface({
              gradient: `linear-gradient(172deg, ${CARDBOARD.base} 0%, ${CARDBOARD.dark} 74%, #7B5837 100%)`,
              occlusion:
                'inset 0 -24px 28px -18px rgba(40,22,8,0.62), inset 22px 0 30px -22px rgba(40,22,8,0.55)',
              edgeLight: 'inset 0 1px 0 rgba(255,235,208,0.30)',
            }),
          }}
        />

        {/* Bok lewy */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.depthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${HALF_W}px)`,
            ...cardboardSurface({
              gradient: `linear-gradient(188deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 62%, ${CARDBOARD.dark} 100%)`,
              occlusion:
                'inset 0 -24px 28px -18px rgba(40,22,8,0.55), inset -22px 0 30px -22px rgba(40,22,8,0.45)',
              edgeLight: 'inset 0 1px 0 rgba(255,238,214,0.38)',
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

        {/* Taśma pakowa wzdłuż szwu — DWIE połówki, żeby mogła pęknąć.
            Leży nad klapami, więc musi być za nimi w kolejności rysowania. */}
        {[0, 1].map((half) => (
          <div
            key={half}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: `${BOX.widthPx * 0.34}px`,
              height: `${(BOX.depthPx + 16) / 2}px`,
              // rotateX(90) kładzie płaszczyznę na GÓRZE bryły; rotateX(-90)
              // umieściłaby ją na spodzie, czyli tam, gdzie taśmy nikt nie zobaczy.
              transform: `translate(-50%, ${half === 0 ? '-100%' : '0'}) rotateX(90deg) translateZ(${HALF_H + 1.2}px)`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Postrzępiona krawędź na linii pęknięcia. Taśma nie tnie się
                równo — rozrywa się wzdłuż włókien folii, zostawiając ząbki.
                Prosta krawędź czytałaby się jak cięcie nożem, czyli jako
                czynność celowa, a nie jak coś, co puściło pod naporem.

                Kształt siedzi w obrazku tła, nie w `clip-path` — powód
                w komentarzu przy tapeHalf() w cardboard.ts. */}
            <div
              ref={(node) => {
                tapeRefs.current[half] = node;
              }}
              className="h-full w-full will-change-transform"
              style={half === 0 ? TAPE_TOP_HALF : TAPE_BOTTOM_HALF}
            />
          </div>
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
 * Konstrukcja dwuwarstwowa i to jest istotne: zewnętrzny div to bezwymiarowy
 * PUNKT umieszczony dokładnie na krawędzi zawiasu, a panel klapy zwisa z niego
 * z transform-origin na górnej krawędzi. Dzięki temu obrót klapy jest czystym
 * `rotateX` wokół prawdziwej osi zawiasu — bez kombinowania z przesunięciami
 * kompensacyjnymi, które przy czterech klapach zamieniłyby się w koszmar.
 *
 * W Etapie 3 wystarczy animować jedną liczbę na klapę.
 */
const Flap = ({
  index,
  flapRefs,
  baseRotateY,
  offset,
  width,
  depth,
  sink,
}: FlapProps): React.ReactElement => (
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
        height: `${depth - BOX.flapGapPx}px`,
        transformOrigin: '50% 0',
        transform: `rotateX(${FLAPS.closedDeg}deg)`,
        transformStyle: 'preserve-3d',
        ...cardboardSurface({
          gradient: `linear-gradient(180deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 62%, ${CARDBOARD.dark} 100%)`,
          // Klapa jest przyciemniona bliżej zawiasu — tam wpada najmniej światła.
          occlusion: 'inset 0 20px 26px -18px rgba(48,28,12,0.55)',
        }),
      }}
    >
      {/* Cięta krawędź — tu widać, że tektura ma grubość i jest falista.
          Pojedynczy detal, który najmocniej sprzedaje materiał.

          `rotateX(90deg)` odchyla pasek W DÓŁ od płaszczyzny klapy, czyli
          w grubość materiału. Przeciwny znak wyprowadzał go do góry i przy
          czterech klapach dawał efekt grzebienia sterczącego nad pudełkiem. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          height: `${BOARD_THICKNESS_PX}px`,
          transformOrigin: '50% 100%',
          transform: 'rotateX(90deg)',
          ...CORRUGATION,
        }}
      />
    </div>
  </div>
);

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
      opacity: 0.88,
    }}
  >
    {/* Kolory farby dobrane pod JAŚNIEJSZY karton: ciepła sepia, nie czerń.
        W trybie mnożenia czerń wyszłaby zupełnie płaska i zabiłaby fakturę
        podłoża — a o zachowanie faktury w tym trybie właśnie chodzi. */}
    <span
      className="font-display text-[30px] leading-none font-extrabold"
      style={{ color: '#7A5334', letterSpacing: '0.02em' }}
    >
      OTWÓRZ MNIE
    </span>
    <span
      className="mt-2 font-mono text-[10px] tracking-[0.34em] uppercase"
      style={{ color: '#8A6242' }}
    >
      przewijając
    </span>
    <div className="mt-3 flex gap-1.5" style={{ color: '#8A6242' }}>
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
