import { useRef, type CSSProperties, type RefObject } from 'react';
import { BOUNCE, BOX, CARDBOARD } from '../../config/scene';
import { computeBoxState } from '../../lib/boxPhysics';
import { round } from '../../lib/math';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';

/**
 * Pudełko zbudowane w CSS 3D.
 *
 * Rola w projekcie: to jest warstwa dla telefonu i dla prefers-reduced-motion,
 * ale buduję ją PIERWSZĄ, przed WebGL-em. Powód jest praktyczny — fizykę
 * podskoku trzeba przede wszystkim POCZUĆ, a CSS 3D pozwala ją zobaczyć bez
 * stawiania sceny WebGL, ładowania modelu i kompilacji shaderów. Jeśli rytm
 * skoku jest zły, będzie zły również w Three.js — tylko kosztuje więcej,
 * żeby to sprawdzić.
 *
 * Dodatkowo: cokolwiek ustawimy tutaj, jest jednocześnie gotową warstwą
 * zapasową. Zero pracy wyrzuconej.
 */

const HALF_W = BOX.widthPx / 2;
const HALF_H = BOX.heightPx / 2;
const HALF_D = BOX.depthPx / 2;

/**
 * Kąty klapy, liczone wokół osi zawiasu.
 *
 * Układ odniesienia: przy 0° panel zwisa w dół wzdłuż ściany. W CSS dodatni
 * `rotateX` odchyla dolną krawędź KU WIDZOWI, więc żeby klapa położyła się
 * płasko NAD otworem (do środka), potrzebny jest kąt ujemny. Otwarcie
 * w Etapie 3 pojedzie dalej w tę samą stronę, aż za pion.
 */
const FLAP_CLOSED_DEG = -90;

/**
 * Model oświetlenia.
 *
 * Klient wybrał "miękkie, rozproszone światło jak z namiotu bezcieniowego".
 * W CSS nie ma świateł, więc symulujemy je stałą jasnością per ściana —
 * ale to nie jest hack, tylko dokładnie to, co robi cieniowanie płaskie:
 * każda ściana ma inną jasność wynikającą z kąta do źródła.
 *
 * Kluczowe dla wiarygodności: różnice muszą być WYRAŹNE. Zbyt zbliżone
 * jasności dają bryłę, która wygląda jak płaski rysunek pudełka.
 */
const FACE_SHADE = {
  top: CARDBOARD.light,
  front: CARDBOARD.base,
  side: CARDBOARD.dark,
  bottom: CARDBOARD.interior,
} as const;

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
  const shadowRef = useRef<HTMLDivElement>(null);

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
       * translate3d zamiast translateY — wymusza własną warstwę kompozycji,
       * czyli ruch obsługiwany przez GPU zamiast przemalowywania.
       */
      boxRef.current.style.transform = [
        `translate3d(0, ${round(-state.y * BOX.heightPx)}px, 0)`,
        `rotateX(${BOUNCE.restTiltXDeg}deg)`,
        `rotateY(${round(BOUNCE.restTiltYDeg + state.yawDeg)}deg)`,
        `scale3d(${round(state.scaleX, 4)}, ${round(state.scaleY, 4)}, ${round(state.scaleX, 4)})`,
      ].join(' ');
    }

    if (shadowRef.current) {
      const shadow = shadowRef.current.style;
      shadow.transform = `translate3d(-50%, 0, 0) scale(${round(state.shadowScale, 4)})`;
      shadow.opacity = `${round(state.shadowOpacity, 3)}`;
      /**
       * filter: blur() jest kosztowny, ale to JEDYNY sposób, żeby cień
       * zmieniał miękkość razem z wysokością — a właśnie ta zmiana sprzedaje
       * dystans do podłoża. Stać nas na to, bo jest dokładnie jeden taki
       * element w całej scenie. Przy kilkunastu (Etap 4, cienie pod ikonami)
       * trzeba będzie to zastąpić nakładanymi warstwami o stałym rozmyciu.
       */
      shadow.filter = `blur(${round(state.shadowBlurPx, 1)}px)`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      aria-hidden="true"
      className="relative flex items-center justify-center"
      style={{ perspective: `${BOX.perspectivePx}px` }}
    >
      {/* Cień. Osobno od pudełka, bo NIE dziedziczy jego skalowania —
          zgniecenie pudełka nie może zgniatać cienia. */}
      <div
        ref={shadowRef}
        className="absolute left-1/2 will-change-transform"
        style={{
          top: `${HALF_H + 26}px`,
          width: `${BOX.widthPx * 0.92}px`,
          height: `${BOX.depthPx * 0.34}px`,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, #000 0%, #000 45%, transparent 72%)',
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
            background: `linear-gradient(160deg, ${CARDBOARD.light} 0%, ${FACE_SHADE.front} 55%, ${CARDBOARD.dark} 100%)`,
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
            background: FACE_SHADE.side,
          }}
        />

        {/* Bok prawy */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.depthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${HALF_W}px)`,
            background: `linear-gradient(170deg, ${CARDBOARD.base} 0%, ${FACE_SHADE.side} 70%)`,
          }}
        />

        {/* Bok lewy */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.depthPx}px`,
            height: `${BOX.heightPx}px`,
            transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${HALF_W}px)`,
            background: `linear-gradient(190deg, ${CARDBOARD.base} 0%, ${FACE_SHADE.side} 70%)`,
          }}
        />

        {/* Spód */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.widthPx}px`,
            height: `${BOX.depthPx}px`,
            transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${HALF_H}px)`,
            background: FACE_SHADE.bottom,
          }}
        />

        {/* Wnętrze — ciemna płaszczyzna tuż nad dnem.
            Brief: "Wnętrze pudełka jest ciemne, żeby to, co z niego wychodzi,
            miało z czego się wyłonić." Bez tego ikony w Etapie 4 pojawiałyby
            się na tle podłogi, a nie wychodziły z mroku. */}
        <div
          style={{
            ...faceBase,
            width: `${BOX.widthPx - 6}px`,
            height: `${BOX.depthPx - 6}px`,
            transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${HALF_H - 10}px)`,
            background: `radial-gradient(ellipse at center, ${CARDBOARD.interior} 0%, #000 85%)`,
          }}
        />

        {/* --- KLAPY ---
            Klapy boczne leżą o włos niżej niż przednia i tylna. W prawdziwym
            kartonie klapy się zachodzą; tutaj chodzi dodatkowo o to, żeby
            cztery współpłaszczyznowe prostokąty nie walczyły o pierwszeństwo
            w buforze głębi (z-fighting), co daje migotanie przy obrocie. */}
        <Flap baseRotateY={0} offset={HALF_D} width={BOX.widthPx} depth={HALF_D} sink={0} />
        <Flap baseRotateY={180} offset={HALF_D} width={BOX.widthPx} depth={HALF_D} sink={0} />
        <Flap baseRotateY={-90} offset={HALF_W} width={BOX.depthPx} depth={HALF_W} sink={1.5} />
        <Flap baseRotateY={90} offset={HALF_W} width={BOX.depthPx} depth={HALF_W} sink={1.5} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------- */

interface FlapProps {
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
const Flap = ({ baseRotateY, offset, width, depth, sink }: FlapProps): React.ReactElement => (
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
      style={{
        position: 'absolute',
        left: `${-width / 2}px`,
        top: 0,
        width: `${width}px`,
        height: `${depth - BOX.flapGapPx}px`,
        transformOrigin: '50% 0',
        transform: `rotateX(${FLAP_CLOSED_DEG}deg)`,
        background: `linear-gradient(180deg, ${CARDBOARD.light} 0%, ${CARDBOARD.base} 100%)`,
        // Klapy widać z obu stron — od góry karton, od spodu ciemniej.
        backfaceVisibility: 'visible',
      }}
    />
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
    style={{ mixBlendMode: 'multiply' }}
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
