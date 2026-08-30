import { useRef, type RefObject } from 'react';
import { GLOW, ICONS } from '../../config/scene';
import { LOGOS, TILE } from '../../config/logos';
import { computeIconState } from '../../lib/iconPhysics';
import { round } from '../../lib/math';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';
import { BrandGlyph } from './glyphs';

/**
 * Cztery logotypy wylatujące z pudełka.
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
 * wierzchu. Zamiana tych dwóch linijek miejscami psuje całą fazę — ikony
 * pojawiają się PRZED kartonem i cała iluzja wychodzenia z wnętrza znika.
 *
 * Nie da się tego zabezpieczyć typami, więc zabezpieczamy komentarzem.
 */

interface BrandIconsProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const BrandIcons = ({ scrollRef }: BrandIconsProps): React.ReactElement => {
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const innerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shadowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const glowRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;

    /**
     * Promień formacji skalowany do okna. Ikony muszą zmieścić się w kadrze
     * również na 375 px, a wtedy stały promień 250 px wyrzuciłby dwie z nich
     * poza ekran.
     */
    const radius = Math.min(ICONS.radiusPx, window.innerWidth * 0.34, window.innerHeight * 0.32);

    for (let i = 0; i < LOGOS.length; i += 1) {
      const state = computeIconState(i, smooth, elapsedS, radius);
      const tile = tileRefs.current[i];
      const inner = innerRefs.current[i];
      const shadow = shadowRefs.current[i];

      if (tile) {
        /**
         * Pozycja i skala idą na KONTENER, a obrót na element wewnętrzny.
         * Rozdzielenie jest celowe: dzięki niemu cień (dziecko kontenera)
         * przesuwa się razem z ikoną, ale NIE obraca się razem z nią.
         * Obracający się cień natychmiast zdradza, że to płaska naklejka.
         */
        tile.style.transform = `translate3d(${round(state.x)}px, ${round(state.y)}px, 0) scale(${round(state.scale, 4)})`;
        tile.style.opacity = `${state.opacity}`;
      }

      /**
       * Kafelek i jego poświata dostają IDENTYCZNĄ transformację.
       *
       * Pierwsza wersja obracała tylko kafelek. Przy skręcie wokół osi
       * pionowej płytka zwężała się, a nieruchoma poświata zostawała pełnej
       * szerokości i wyłaziła zza niej jako jasny prostokąt. Poświata jest
       * światłem TEGO przedmiotu, więc musi skracać się razem z nim.
       */
      const spinTransform = `rotate(${round(state.rotateDeg, 2)}deg) rotateY(${round(state.spinDeg, 2)}deg)`;
      if (inner) inner.style.transform = spinTransform;

      /**
       * Poświata narasta dopiero po wyjściu ikony z pudełka — ale animujemy
       * WYŁĄCZNIE jej krycie, nigdy samego cienia.
       *
       * Pierwsza wersja przepisywała `box-shadow` w każdej klatce, składając
       * kolor przez `color-mix()`. Zmierzone: 29 fps w locie. Powód jest
       * podwójny: przeglądarka musi przy każdej klatce sparsować i rozwiązać
       * funkcję koloru, a potem PRZEMALOWAĆ cień — a cień to nie jest
       * własność kompozytowana.
       *
       * Poprawka: cień jest ustawiony RAZ, statycznie, na osobnej warstwie
       * pod kafelkiem. Zmienia się tylko `opacity`, które kompozytor obsługuje
       * za darmo. To ta sama zasada, co przy rozmyciu tła i przycinaniu
       * taśmy — trzecie jej zastosowanie w tym projekcie.
       */
      const glow = glowRefs.current[i];
      if (glow) {
        glow.style.opacity = `${round(GLOW.opacity * state.emergence, 3)}`;
        glow.style.transform = spinTransform;
      }

      if (shadow) {
        shadow.style.transform = `translate3d(-50%, 0, 0) scale(${round(state.shadowScale, 4)})`;
        shadow.style.opacity = `${round(state.shadowOpacity, 3)}`;
      }
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {LOGOS.map((logo, index) => (
        <div
          key={logo.id}
          ref={(node) => {
            tileRefs.current[index] = node;
          }}
          className="absolute will-change-transform"
          style={{ width: `${TILE.sizePx}px`, height: `${TILE.sizePx}px`, opacity: 0 }}
        >
          {/* Cień rzucany na podłoże — poza obracanym elementem. */}
          <div
            ref={(node) => {
              shadowRefs.current[index] = node;
            }}
            className="absolute left-1/2"
            style={{
              top: `${TILE.sizePx + 6}px`,
              width: `${TILE.sizePx * 0.86}px`,
              height: `${TILE.sizePx * 0.22}px`,
              borderRadius: '50%',
              background:
                'radial-gradient(ellipse closest-side, rgba(30,20,44,0.9) 0%, rgba(30,20,44,0) 100%)',
              transform: 'translate3d(-50%, 0, 0)',
              opacity: 0,
            }}
          />

          {/* Warstwa poświaty. Cień ustawiony raz i nigdy nie ruszany —
              w pętli animacji zmienia się wyłącznie krycie tego elementu. */}
          <div
            ref={(node) => {
              glowRefs.current[index] = node;
            }}
            className="absolute inset-0 will-change-transform"
            style={{
              borderRadius: `${TILE.radiusPx}px`,
              boxShadow: `0 ${GLOW.offsetY}px ${GLOW.blurPx}px ${GLOW.spreadPx}px ${logo.glow}`,
              opacity: 0,
            }}
          />

          <div
            ref={(node) => {
              innerRefs.current[index] = node;
            }}
            className="relative grid h-full w-full place-items-center will-change-transform"
            style={{
              background: TILE.background,
              borderRadius: `${TILE.radiusPx}px`,
              // Statyczne. Ustawione raz przy renderze, nietykane w pętli.
              boxShadow: TILE.edgeLight,
            }}
          >
            <BrandGlyph id={logo.id} />
          </div>

          {/*
            Nazwa marki dla czytników ekranu i wyszukiwarek.
            Brief wymaga `alt` na wszystkich logotypach — glify są SVG-ami
            oznaczonymi jako dekoracyjne, więc tekst alternatywny musi przyjść
            stąd. Ukryty wizualnie, obecny w drzewie dostępności.
          */}
          <span className="sr-only-content">{logo.label}</span>
        </div>
      ))}
    </div>
  );
};
