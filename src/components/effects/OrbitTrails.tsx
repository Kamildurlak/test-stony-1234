import { useRef, type RefObject } from 'react';
import { ICONS } from '../../config/scene';
import { LOGOS } from '../../config/logos';
import { computeLocalT, computeOrbitDeg, computeOrbitRamp } from '../../lib/iconPhysics';
import { clamp, round } from '../../lib/math';
import { getSceneScale } from '../../lib/sceneScale';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';

/**
 * Tor ruchu ikon — pierścień i smugi „wiatru" ciągnące się za każdą ikoną.
 *
 * Po co: bez tego formacja to cztery kafelki dryfujące w pustce. Widoczny
 * tor nadaje ruchowi przyczynę — oko widzi, że coś krąży PO CZYMŚ, a nie
 * że po prostu się przesuwa. Smuga za ikoną robi drugą rzecz: pokazuje
 * kierunek i prędkość, czyli informacje, których sam ruch nie zdąży przekazać.
 *
 * SZTUCZKA WYDAJNOŚCIOWA, która czyni to praktycznie darmowym:
 *
 * Wszystkie cztery smugi i pierścień to JEDEN statyczny SVG. Ponieważ cała
 * formacja obraca się wspólnie, wystarczy obracać ten jeden element —
 * to jest DOKŁADNIE JEDEN zapis transformu na klatkę, niezależnie od tego,
 * ile segmentów ma smuga. Gdyby każdy segment był animowany osobno,
 * mielibyśmy czterdzieści zapisów i przemalowanie wektorów w każdej klatce.
 *
 * Kąt obiegu bierzemy z tej samej funkcji, co ikony (lib/iconPhysics.ts).
 * To nie jest wygoda, tylko konieczność: gdyby każdy liczył go po swojemu,
 * jedna rozbieżność zaokrągleń odsunęłaby smugi od ikon i efekt by się rozsypał.
 */

const R = ICONS.orbitRadiusPx;
const SIZE = R * 2;
const DEG = Math.PI / 180;

/** Punkt na okręgu, kąt liczony od góry zgodnie z ruchem wskazówek zegara. */
const pointAt = (angleDeg: number): [number, number] => [
  R + Math.sin(angleDeg * DEG) * R,
  R - Math.cos(angleDeg * DEG) * R,
];

/** Łuk między dwoma kątami. Krótki, więc large-arc zawsze 0. */
const arcPath = (fromDeg: number, toDeg: number): string => {
  const [x1, y1] = pointAt(fromDeg);
  const [x2, y2] = pointAt(toDeg);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

/**
 * Smuga jest złożona z segmentów o malejącym kryciu i grubości.
 *
 * SVG nie potrafi puścić gradientu WZDŁUŻ ścieżki — `linearGradient` biegnie
 * po prostej, a nam potrzebny zanik po łuku. Podział na segmenty jest
 * standardowym obejściem i przy dziesięciu odcinkach przejście jest gładkie.
 */
const TRAIL_SEGMENTS = 16;
const SEGMENT_DEG = 3.1;

interface OrbitTrailsProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const OrbitTrails = ({ scrollRef }: OrbitTrailsProps): React.ReactElement => {
  const stageRef = useRef<HTMLDivElement>(null);
  const rotorRef = useRef<SVGGElement>(null);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;

    /**
     * Ramp bierzemy z PIERWSZEJ ikony. Wszystkie mają ten sam obieg —
     * różnią się wyłącznie opóźnieniem startu, a tor jest wspólny.
     */
    const ramp = computeOrbitRamp(computeLocalT(0, smooth));
    const orbitDeg = computeOrbitDeg(elapsedS, ramp);

    if (rotorRef.current) {
      rotorRef.current.style.transform = `rotate(${round(orbitDeg, 2)}deg)`;
    }

    if (stageRef.current) {
      // Tor pojawia się dopiero wtedy, gdy formacja faktycznie rusza —
      // narysowany wcześniej wisiałby w powietrzu bez powodu.
      stageRef.current.style.opacity = `${round(clamp(ramp * 1.2), 3)}`;
      stageRef.current.style.transform = `scale(${round(getSceneScale(), 4)})`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div ref={stageRef} className="will-change-transform" style={{ opacity: 0 }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* Pierścień toru — ledwie widoczny. Ma sugerować ścieżkę,
              nie rysować obwódkę wokół treści. */}
          <circle
            cx={R}
            cy={R}
            r={R}
            fill="none"
            stroke="rgba(90,70,130,0.22)"
            strokeWidth={1.5}
            strokeDasharray="2 10"
          />

          <g ref={rotorRef} style={{ transformOrigin: `${R}px ${R}px`, willChange: 'transform' }}>
            {LOGOS.map((logo, index) => {
              const slot = ICONS.slotAngles[index] ?? 0;
              return (
                <g key={logo.id}>
                  {Array.from({ length: TRAIL_SEGMENTS }, (_, k) => {
                    /**
                     * Zanik nie jest liniowy — kwadratowy. Smuga ma być
                     * mocna tuż za przedmiotem i szybko gasnąć, tak jak
                     * zachowuje się rozrzedzający się ślad w powietrzu.
                     * Liniowy zanik dałby równomierną kreskę, czyli coś,
                     * co wygląda na narysowane, a nie na zostawione.
                     */
                    const t = 1 - k / TRAIL_SEGMENTS;
                    const fade = t * t;
                    const from = slot - (k + 1) * SEGMENT_DEG;
                    const to = slot - k * SEGMENT_DEG;
                    return (
                      <path
                        key={k}
                        d={arcPath(from, to)}
                        fill="none"
                        stroke={logo.glow}
                        strokeWidth={3 + fade * 16}
                        strokeOpacity={fade * 0.62}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};
