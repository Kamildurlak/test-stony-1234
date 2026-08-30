import { PALETTE } from '../../config/scene';

/**
 * Warstwa atmosfery: drobne punkty dryfujące w tle sceny.
 *
 * Po co: kadr był pusty. Cztery kafelki i karta w środku zostawiały ogromne
 * połacie gołego tła, przez co scena wyglądała na niedokończoną, a nie
 * na przestronną. Kilkadziesiąt ledwie widocznych punktów wypełnia tę
 * przestrzeń, nie odbierając uwagi treści.
 *
 * KLUCZOWA DECYZJA: to jedyna warstwa animowana przez CSS, nie przez pętlę rAF.
 *
 * Ruch tych punktów nie zależy ani od scrolla, ani od żadnego innego stanu
 * sceny — jest sam z siebie. Animacja CSS na `transform` i `opacity` jest
 * w całości obsługiwana przez kompozytor, więc kosztuje nas ZERO pracy
 * w klatce. Przepuszczenie jej przez ticker oznaczałoby kilkadziesiąt
 * zapisów stylów na klatkę po to, żeby uzyskać dokładnie to samo.
 *
 * Zasada ogólna: przez ticker idzie to, co MUSI być zsynchronizowane
 * z resztą sceny. Reszta należy do CSS.
 */

const DOTS = 34;

/** Ziarno stałe — układ punktów ma być identyczny przy każdym renderze. */
const seeded = (n: number): number => {
  const x = Math.sin(n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const COLORS = [PALETTE.magenta, PALETTE.cyan, PALETTE.violet];

export const Ambience = (): React.ReactElement => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    <style>{`
      @keyframes hero-drift {
        0%   { transform: translate3d(0, 0, 0); }
        50%  { transform: translate3d(var(--dx), var(--dy), 0); }
        100% { transform: translate3d(0, 0, 0); }
      }
      @keyframes hero-twinkle {
        0%, 100% { opacity: var(--o-min); }
        50%      { opacity: var(--o-max); }
      }
      /* Bez ruchu przy prefers-reduced-motion — punkty zostają, ale stoją.
         Warstwa dekoracyjna nie jest powodem, żeby łamać tę preferencję. */
      @media (prefers-reduced-motion: reduce) {
        [data-ambient-dot] { animation: none !important; }
      }
    `}</style>

    {Array.from({ length: DOTS }, (_, i) => {
      const r1 = seeded(i + 3);
      const r2 = seeded(i + 61);
      const r3 = seeded(i + 137);
      const r4 = seeded(i + 211);
      const size = 2 + r3 * 4;
      // Okresy niewspółmierne, żeby punkty nigdy nie wróciły do wspólnego
      // układu — inaczej po kilkudziesięciu sekundach widać pętlę.
      const driftS = 14 + r4 * 17;
      const twinkleS = 5 + r1 * 6;
      return (
        <div
          key={i}
          data-ambient-dot=""
          style={{
            position: 'absolute',
            left: `${r1 * 100}%`,
            top: `${r2 * 100}%`,
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            background: COLORS[i % COLORS.length],
            filter: 'none',
            ['--dx' as string]: `${(r3 - 0.5) * 90}px`,
            ['--dy' as string]: `${(r4 - 0.5) * 70}px`,
            ['--o-min' as string]: `${0.05 + r2 * 0.08}`,
            ['--o-max' as string]: `${0.18 + r3 * 0.2}`,
            animation: `hero-drift ${driftS.toFixed(1)}s ease-in-out ${(r2 * 6).toFixed(1)}s infinite, hero-twinkle ${twinkleS.toFixed(1)}s ease-in-out ${(r4 * 4).toFixed(1)}s infinite`,
            willChange: 'transform, opacity',
          }}
        />
      );
    })}
  </div>
);
