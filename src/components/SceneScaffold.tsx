import { useRef, type RefObject } from 'react';
import { PHASES, ROTATIONS, type PhaseRange } from '../config/scene';
import { phaseProgress, round } from '../lib/math';
import { TICK_PRIORITY } from '../lib/ticker';
import { useTicker } from '../hooks/useTicker';
import type { ScrollState } from '../hooks/useScrollProgress';

/**
 * RUSZTOWANIE — element tymczasowy, do usunięcia w Etapie 2.
 *
 * Nie jest to żaden element docelowej grafiki. To przyrząd do jednej rzeczy:
 * sprawdzenia RYTMU sekwencji, zanim wydamy choćby złotówkę na modelowanie 3D.
 *
 * Uzasadnienie: ustaliliśmy 450vh na osiem faz i trzy sceny treści. Podejrzewam,
 * że jest ciasno, ale to jest do sprawdzenia scrollem, nie do przedyskutowania.
 * Jeśli okaże się, że fazy przelatują za szybko, poprawka to jedna liczba
 * w config/scene.ts. Gdybyśmy odkryli to dopiero po zbudowaniu pudełka, ikon
 * i trzech scen — przestrajanie kosztowałoby dni zamiast minut.
 *
 * Kolejność jest więc celowa: najpierw rytm na drucianym modelu, potem grafika.
 */

const TIMELINE: ReadonlyArray<readonly [label: string, range: PhaseRange, color: string]> = [
  ['ANTICIPATION', PHASES.ANTICIPATION, 'bg-white/30'],
  ['OPEN', PHASES.OPEN, 'bg-magenta'],
  ['ICONS', PHASES.ICONS, 'bg-cyan'],
  ['FALL', PHASES.FALL, 'bg-kraft-light'],
  ['MONTAŻ', PHASES.SCENE_EDIT, 'bg-violet'],
  ['↻', ROTATIONS.TO_VIRAL, 'bg-white/20'],
  ['VIRAL', PHASES.SCENE_VIRAL, 'bg-violet'],
  ['↻', ROTATIONS.TO_WEB, 'bg-white/20'],
  ['STRONY', PHASES.SCENE_WEB, 'bg-violet'],
  ['↻', ROTATIONS.TO_OUTRO, 'bg-white/20'],
  ['OUTRO', PHASES.OUTRO, 'bg-magenta'],
];

interface SceneScaffoldProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const SceneScaffold = ({ scrollRef }: SceneScaffoldProps): React.ReactElement => {
  const boxRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const fillRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;

    /**
     * Zgrubna atrapa ruchu pudełka: unosi się i obraca przez fazy OPEN/ICONS,
     * potem spada w FALL. Świadomie BEZ squash and stretch, bez łuku,
     * bez opóźnień — to ma wyglądać na rusztowanie, a nie na niedokończoną
     * animację. Cała fizyka przychodzi w Etapie 2.
     */
    const lift = phaseProgress(smooth, PHASES.OPEN);
    const fall = phaseProgress(smooth, PHASES.FALL);
    const breath = Math.sin(elapsedS * 1.6) * 4;

    const translateY = round(-lift * 40 + fall * 900 + breath);
    const rotate = round(lift * 12 + fall * 140);
    const opacity = round(1 - fall);

    if (boxRef.current) {
      boxRef.current.style.transform = `translate3d(0, ${translateY}px, 0) rotate(${rotate}deg)`;
      boxRef.current.style.opacity = `${opacity}`;
    }
    if (shadowRef.current) {
      const shadowScale = round(1 - lift * 0.25);
      shadowRef.current.style.transform = `translate3d(0, 0, 0) scale(${shadowScale})`;
      shadowRef.current.style.opacity = `${round(opacity * 0.4)}`;
    }

    // Każdy segment osi czasu wypełnia się własnym, lokalnym progressem —
    // dzięki temu widać nie tylko GDZIE jesteśmy, ale jak szybko przelatuje
    // każda faza z osobna.
    for (let i = 0; i < TIMELINE.length; i += 1) {
      const entry = TIMELINE[i];
      const node = fillRefs.current[i];
      if (!entry || !node) continue;
      node.style.transform = `scaleX(${round(phaseProgress(smooth, entry[1]))})`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
      <p className="absolute top-6 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-white/25 uppercase">
        rusztowanie — etap 1 / silnik scrolla
      </p>

      {/* Atrapa pudełka. Sam kontur, żeby nie sugerować kierunku wizualnego. */}
      <div className="relative flex h-64 w-full items-center justify-center">
        <div
          ref={boxRef}
          className="h-28 w-28 rounded-sm border border-dashed border-white/30 will-change-transform"
        />
        <div
          ref={shadowRef}
          className="absolute bottom-6 h-2 w-24 rounded-[50%] bg-black blur-md will-change-transform"
        />
      </div>

      {/* Oś czasu faz — właściwy przyrząd pomiarowy. */}
      <div className="mt-10 flex w-[min(680px,88vw)] gap-[3px]">
        {TIMELINE.map(([label, [start, end], color], index) => (
          <div
            key={`${label}-${start}`}
            className="flex flex-col gap-1"
            // Szerokość segmentu proporcjonalna do jego udziału w progressie —
            // dzięki temu oś czasu jest wizualnie uczciwa: wąski segment
            // naprawdę oznacza mało scrolla.
            style={{ flexGrow: end - start, flexBasis: 0 }}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                ref={(node) => {
                  fillRefs.current[index] = node;
                }}
                className={`h-full w-full origin-left ${color}`}
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
            <span className="truncate font-mono text-[8px] tracking-wider text-white/30">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
