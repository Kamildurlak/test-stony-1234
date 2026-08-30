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
  ['ANTICIPATION', PHASES.ANTICIPATION, 'bg-ink/40'],
  ['OPEN', PHASES.OPEN, 'bg-magenta'],
  ['ICONS', PHASES.ICONS, 'bg-cyan'],
  ['FALL', PHASES.FALL, 'bg-kraft-light'],
  ['MONTAŻ', PHASES.SCENE_EDIT, 'bg-violet'],
  ['↻', ROTATIONS.TO_VIRAL, 'bg-ink/25'],
  ['VIRAL', PHASES.SCENE_VIRAL, 'bg-violet'],
  ['↻', ROTATIONS.TO_WEB, 'bg-ink/25'],
  ['STRONY', PHASES.SCENE_WEB, 'bg-violet'],
  ['↻', ROTATIONS.TO_OUTRO, 'bg-ink/25'],
  ['OUTRO', PHASES.OUTRO, 'bg-magenta'],
];

interface SceneScaffoldProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const SceneScaffold = ({ scrollRef }: SceneScaffoldProps): React.ReactElement => {
  const fillRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker(() => {
    const { smooth } = scrollRef.current;

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
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center"
    >
      {/* Oś czasu faz — przyrząd pomiarowy, nie element projektu. Do usunięcia
          razem z licznikiem progressu w Etapie 6. */}
      <div className="flex w-[min(680px,88vw)] gap-[3px]">
        {TIMELINE.map(([label, [start, end], color], index) => (
          <div
            key={`${label}-${start}`}
            className="flex flex-col gap-1"
            // Szerokość segmentu proporcjonalna do jego udziału w progressie —
            // dzięki temu oś czasu jest wizualnie uczciwa: wąski segment
            // naprawdę oznacza mało scrolla.
            style={{ flexGrow: end - start, flexBasis: 0 }}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div
                ref={(node) => {
                  fillRefs.current[index] = node;
                }}
                className={`h-full w-full origin-left ${color}`}
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
            <span className="text-ink-muted/60 truncate font-mono text-[8px] tracking-wider">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
