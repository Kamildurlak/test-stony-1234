import { useRef, type RefObject } from 'react';
import { PHASES, ROTATIONS, type PhaseRange } from '../config/scene';
import { TICK_PRIORITY } from '../lib/ticker';
import { useTicker } from '../hooks/useTicker';
import type { ScrollState } from '../hooks/useScrollProgress';

/**
 * Licznik progressu na czas developmentu.
 *
 * Brief: "Zostaw na ekranie licznik progress na czas developmentu, usuń go
 * na koniec". Komponent renderuje się wyłącznie przy `import.meta.env.DEV`,
 * więc bundler wycina go z produkcyjnego builda razem z całą jego logiką —
 * nie trzeba pamiętać o usunięciu ręcznie, co zawsze kończy się tym,
 * że coś zostaje.
 *
 * Sam licznik NIE używa stanu Reacta. Gdyby używał, narzędzie do mierzenia
 * płynności samo by tę płynność psuło — 60 renderów na sekundę tylko po to,
 * żeby pokazać liczbę. Piszemy prosto do węzłów tekstowych.
 */

const ALL_RANGES: ReadonlyArray<readonly [string, PhaseRange]> = [
  ...Object.entries(PHASES),
  ...Object.entries(ROTATIONS).map(
    ([name, range]) => [`↻ ${name}`, range] as readonly [string, PhaseRange],
  ),
];

interface DevProgressProps {
  readonly scrollRef: RefObject<ScrollState>;
  readonly reducedMotion: boolean;
}

export const DevProgress = ({ scrollRef, reducedMotion }: DevProgressProps): React.ReactElement | null => {
  const smoothRef = useRef<HTMLSpanElement>(null);
  const rawRef = useRef<HTMLSpanElement>(null);
  const velocityRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const phasesRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Uśrednianie FPS w oknie ~0.5 s. Chwilowa wartość z jednej klatki skacze
  // tak bardzo, że jest nieczytelna — a chodzi o wychwycenie trendu,
  // nie pojedynczego zacięcia.
  const fpsAccumulator = useRef<{ frames: number; elapsed: number }>({ frames: 0, elapsed: 0 });

  useTicker((deltaS) => {
    const state = scrollRef.current;

    if (smoothRef.current) smoothRef.current.textContent = state.smooth.toFixed(4);
    if (rawRef.current) rawRef.current.textContent = state.raw.toFixed(4);
    if (velocityRef.current) velocityRef.current.textContent = state.velocity.toFixed(3);
    if (barRef.current) barRef.current.style.transform = `scaleX(${state.smooth.toFixed(4)})`;

    const acc = fpsAccumulator.current;
    acc.frames += 1;
    acc.elapsed += deltaS;
    if (acc.elapsed >= 0.5) {
      if (fpsRef.current) fpsRef.current.textContent = Math.round(acc.frames / acc.elapsed).toString();
      acc.frames = 0;
      acc.elapsed = 0;
    }

    if (phasesRef.current) {
      const active = ALL_RANGES.filter(
        ([, [start, end]]) => state.smooth >= start && state.smooth <= end,
      ).map(([name]) => name);
      phasesRef.current.textContent = active.length > 0 ? active.join(' + ') : '—';
    }
  }, TICK_PRIORITY.RENDER);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      // aria-hidden: to jest przyrząd pomiarowy dla mnie, nie treść strony.
      // Czytnik ekranu nie ma powodu czytać strumienia liczb.
      aria-hidden="true"
      className="pointer-events-none fixed bottom-3 left-3 z-50 rounded-lg border border-white/10 bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-white/70 backdrop-blur-sm"
    >
      <div className="mb-2 h-1 w-44 overflow-hidden rounded-full bg-white/10">
        <div
          ref={barRef}
          className="h-full w-full origin-left rounded-full bg-cyan"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
      <div>
        progress <span ref={smoothRef} className="text-cyan">0.0000</span>
      </div>
      <div>
        raw <span ref={rawRef} className="text-white/45">0.0000</span>
      </div>
      <div>
        v/s <span ref={velocityRef} className="text-white/45">0.000</span>
      </div>
      <div>
        fps <span ref={fpsRef} className="text-magenta">–</span>
      </div>
      <div className="mt-1 max-w-44 border-t border-white/10 pt-1 text-violet">
        <div ref={phasesRef}>—</div>
      </div>
      {reducedMotion && <div className="mt-1 text-magenta">reduced-motion: ON</div>}
    </div>
  );
};
