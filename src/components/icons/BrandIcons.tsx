import { useRef, type RefObject } from 'react';
import { GLOW, ICONS } from '../../config/scene';
import { LOGOS, TILE } from '../../config/logos';
import { computeIconState } from '../../lib/iconPhysics';
import { round } from '../../lib/math';
import { getSceneScale } from '../../lib/sceneScale';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';
import { BrandGlyph } from './glyphs';

/**
 * Cztery logotypy wylatujące z pudełka i krążące po orbicie.
 *
 * NAJWAŻNIEJSZA RZECZ W TYM KOMPONENCIE NIE JEST W KODZIE, TYLKO W TYM,
 * GDZIE GO OSADZAMY.
 *
 * Brief: "Krytyczne: dopóki ikona jest w środku, musi ją zasłaniać przednia
 * ściana kartonu. Warstwa ikon leży pod pudełkiem w kolejności rysowania."
 *
 * Dlatego <BrandIcons> montujemy PRZED <CssBox> w HeroScroll. Oba elementy
 * są w tym samym kontekście układania i żaden nie ma z-index, więc o
 * pierwszeństwie decyduje kolejność w drzewie: późniejszy rysuje się na
 * wierzchu. Zamiana tych dwóch linijek psuje całą fazę wylotu.
 *
 * Nie da się tego zabezpieczyć typami, więc zabezpieczamy komentarzem.
 */

interface BrandIconsProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const BrandIcons = ({ scrollRef }: BrandIconsProps): React.ReactElement => {
  const stageRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const glowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shadowRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;

    /**
     * Skala wspólna z grafiką w środku pierścienia.
     *
     * Cała scena — orbita i karta montażu — skaluje się JEDNYM
     * współczynnikiem. Dzięki temu odstęp policzony raz w pikselach
     * bazowych jest zachowany na każdej szerokości ekranu. To jedyny
     * sposób, żeby móc powiedzieć „nie może się nałożyć", zamiast
     * „sprawdziłem kilka rozdzielczości".
     */
    if (stageRef.current) {
      stageRef.current.style.transform = `scale(${round(getSceneScale(), 4)})`;
    }

    for (let i = 0; i < LOGOS.length; i += 1) {
      const state = computeIconState(i, smooth, elapsedS, ICONS.orbitRadiusPx);

      const tile = tileRefs.current[i];
      if (tile) {
        /**
         * Wyłącznie przesunięcie i skala. ŻADNEGO obrotu — ani wokół osi
         * pionowej, ani w płaszczyźnie ekranu. Klient wymaga tego wprost,
         * a dla płaskiej płytki z logotypem to zresztą jedyne poprawne
         * rozwiązanie: obracający się znak marki czyta się jako błąd.
         */
        tile.style.transform = `translate3d(${round(state.x)}px, ${round(state.y)}px, 0) scale(${round(state.scale, 4)})`;
        tile.style.opacity = `${state.opacity}`;
      }

      /**
       * Poświata: animujemy WYŁĄCZNIE krycie, nigdy samego cienia.
       * Cień jest ustawiony raz, statycznie. Przepisywanie `box-shadow`
       * w każdej klatce wymusza przemalowanie, bo cień nie jest własnością
       * kompozytowaną — kosztowało nas to już połowę budżetu klatki.
       */
      const glow = glowRefs.current[i];
      if (glow) glow.style.opacity = `${round(GLOW.opacity * state.emergence, 3)}`;

      const shadow = shadowRefs.current[i];
      if (shadow) shadow.style.opacity = `${round(state.shadowOpacity, 3)}`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      /**
       * `isolation: isolate` zamyka ikony we własnym kontekście układania,
       * żeby ich wewnętrzna kolejność nie mogła wypchnąć żadnej z nich
       * nad pudełko w fazie wylotu.
       */
      style={{ isolation: 'isolate' }}
    >
      <div ref={stageRef} className="relative will-change-transform">
        {LOGOS.map((logo, index) => (
          <div
            key={logo.id}
            ref={(node) => {
              tileRefs.current[index] = node;
            }}
            // Uchwyt dla testów geometrii: mierzymy nim realne odstępy
            // między ikonami i między ikoną a kartą w środku pierścienia.
            data-icon-tile=""
            className="absolute will-change-transform"
            style={{
              width: `${TILE.sizePx}px`,
              height: `${TILE.sizePx}px`,
              // Kafelek wyśrodkowany na własnym punkcie orbity.
              left: `${-TILE.sizePx / 2}px`,
              top: `${-TILE.sizePx / 2}px`,
              opacity: 0,
            }}
          >
            {/* Cień pod kafelkiem — poza warstwą poświaty, żeby jedno
                nie rozjaśniało drugiego. */}
            <div
              ref={(node) => {
                shadowRefs.current[index] = node;
              }}
              className="absolute left-1/2"
              style={{
                top: `${TILE.sizePx + 4}px`,
                width: `${TILE.sizePx * 0.8}px`,
                height: `${TILE.sizePx * 0.2}px`,
                borderRadius: '50%',
                background:
                  'radial-gradient(ellipse closest-side, rgba(46,54,92,0.5) 0%, rgba(46,54,92,0) 100%)',
                transform: 'translate3d(-50%, 0, 0)',
                opacity: 0,
              }}
            />

            {/* Warstwa poświaty. Cień ustawiony raz i nigdy nie ruszany. */}
            <div
              ref={(node) => {
                glowRefs.current[index] = node;
              }}
              className="absolute inset-0"
              style={{
                borderRadius: `${TILE.radiusPx}px`,
                boxShadow: `0 ${GLOW.offsetY}px ${GLOW.blurPx}px ${GLOW.spreadPx}px ${logo.glow}`,
                opacity: 0,
              }}
            />

            <div
              className="relative grid h-full w-full place-items-center"
              style={{
                background: TILE.background,
                borderRadius: `${TILE.radiusPx}px`,
                boxShadow: TILE.edgeLight,
              }}
            >
              <BrandGlyph id={logo.id} />
            </div>

            {/*
              Nazwa marki dla czytników ekranu i wyszukiwarek.
              Brief wymaga tekstu alternatywnego na wszystkich logotypach —
              same znaki są SVG oznaczonymi jako dekoracyjne, więc opis
              musi przyjść stąd.
            */}
            <span className="sr-only-content">{logo.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
