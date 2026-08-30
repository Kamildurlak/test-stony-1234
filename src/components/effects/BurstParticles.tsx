import { useRef, type RefObject } from 'react';
import { PALETTE, PHASES } from '../../config/scene';
import { clamp, easeOutQuint, mapRange, phaseProgress, round } from '../../lib/math';
import { getSceneScale } from '../../lib/sceneScale';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';

/**
 * Wybuch cząstek w chwili otwarcia pudełka.
 *
 * Po co: otwarcie trwa teraz 1,5% scrolla — mgnienie. Same klapy w tak
 * krótkim czasie nie zdążą przekazać, że stało się coś gwałtownego.
 * Rozprysk daje temu momentowi rozmiar: widz nie musi zdążyć zobaczyć
 * mechaniki, wystarczy, że zobaczy skutek.
 *
 * Cząstki wylatują z GARDZIELI pudełka, nie ze środka kadru — muszą mieć
 * to samo źródło co ikony, inaczej czytałyby się jako osobny efekt
 * doklejony do sceny.
 */

const COUNT = 44;

/**
 * Generator pseudolosowy o stałym ziarnie.
 *
 * Świadomie NIE Math.random(). Scena musi wyglądać identycznie przy każdym
 * przeliczeniu i przy przewijaniu w obie strony — losowe wartości zmieniałyby
 * układ cząstek przy każdym renderze i rozprysk migotałby przy cofaniu scrolla.
 */
const seeded = (n: number): number => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

interface Particle {
  readonly angleDeg: number;
  readonly distance: number;
  readonly size: number;
  readonly color: string;
  readonly delay: number;
}

const COLORS = [PALETTE.magenta, PALETTE.cyan, PALETTE.violet, '#F5A524', '#2E8FFF'];

const PARTICLES: readonly Particle[] = Array.from({ length: COUNT }, (_, i) => {
  const r1 = seeded(i + 1);
  const r2 = seeded(i + 51);
  const r3 = seeded(i + 101);
  return {
    /**
     * Kąty rozłożone równomiernie z niewielkim rozrzutem. Czysto losowe
     * dałyby zbitki i puste sektory — a to ma wyglądać jak ciśnienie
     * uwolnione z pudełka, czyli w miarę równomiernie we wszystkie strony.
     */
    angleDeg: (i / COUNT) * 360 + (r1 - 0.5) * 26,
    distance: 220 + r2 * 470,
    size: 4 + r3 * 11,
    color: COLORS[i % COLORS.length] ?? PALETTE.magenta,
    delay: r1 * 0.22,
  };
});

const DEG = Math.PI / 180;

/** Gardziel pudełka — wspólne źródło z ikonami. */
const THROAT_Y = -46;

interface BurstParticlesProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const BurstParticles = ({ scrollRef }: BurstParticlesProps): React.ReactElement => {
  const stageRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker(() => {
    const { smooth } = scrollRef.current;

    /**
     * Rozprysk żyje w oknie od otwarcia klap do początku ustawiania ikon.
     * Poza nim element jest ukryty — nie chodzi tylko o estetykę, ale o to,
     * żeby 28 elementów nie kosztowało kompozycji przez całą resztę sekwencji.
     */
    const t = phaseProgress(smooth, [PHASES.OPEN[0], PHASES.ICONS[0] + 0.06]);
    const alive = t > 0 && t < 1;

    if (stageRef.current) {
      stageRef.current.style.visibility = alive ? 'visible' : 'hidden';
      stageRef.current.style.transform = `scale(${round(getSceneScale(), 4)})`;
    }
    if (!alive) return;

    for (let i = 0; i < PARTICLES.length; i += 1) {
      const particle = PARTICLES[i];
      const node = dotRefs.current[i];
      if (!particle || !node) continue;

      const local = clamp(mapRange(t, particle.delay, 1, 0, 1));
      /**
       * Rozprysk hamuje bardzo szybko — cząstka dostaje impuls i zaraz
       * traci prędkość w powietrzu. Piąta potęga oddaje to lepiej niż
       * cokolwiek łagodniejszego.
       */
      const eased = easeOutQuint(local);
      const d = particle.distance * eased;

      const x = Math.sin(particle.angleDeg * DEG) * d;
      const y = -Math.cos(particle.angleDeg * DEG) * d + THROAT_Y;

      node.style.transform = `translate3d(${round(x)}px, ${round(y)}px, 0) scale(${round(1 - eased * 0.6, 3)})`;
      // Zapala się natychmiast, gaśnie przez większość lotu.
      node.style.opacity = `${round(clamp(local * 6) * (1 - eased), 3)}`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div
        ref={stageRef}
        className="relative will-change-transform"
        style={{ visibility: 'hidden' }}
      >
        {PARTICLES.map((particle, index) => (
          <div
            key={index}
            ref={(node) => {
              dotRefs.current[index] = node;
            }}
            className="absolute will-change-transform"
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${-particle.size / 2}px`,
              top: `${-particle.size / 2}px`,
              borderRadius: '50%',
              background: particle.color,
              boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
              opacity: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};
