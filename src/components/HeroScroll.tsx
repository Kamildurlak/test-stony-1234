import { useRef } from 'react';
import { SCROLL } from '../config/scene';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { AccessibleHeroContent } from './AccessibleHeroContent';
import { DevProgress } from './DevProgress';
import { SceneScaffold } from './SceneScaffold';

/**
 * Sekcja hero — orkiestracja.
 *
 * Konstrukcja: wysoka sekcja (450vh) nadaje DYSTANS scrolla, a wewnętrzny
 * kontener `sticky` przykleja scenę do ekranu na czas jego przewijania.
 * To jest cała mechanika — użytkownik przewija normalnie, natywnie, bez
 * przechwytywania zdarzeń, a my zamieniamy jego pozycję na progress 0–1.
 *
 * Świadomie odrzuciliśmy przechwytywanie scrolla, mimo że daje pełniejszą
 * kontrolę nad tempem. Powód: to najczęstsza przyczyna, dla której
 * scroll-experience czuje się "sztucznie" — łamie bezwładność trackpada
 * i gestu dotykowego, na których użytkownik polega odruchowo. Zyskujemy
 * kontrolę, tracimy zaufanie. Zła wymiana.
 */
export const HeroScroll = (): React.ReactElement => {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const scrollRef = useScrollProgress(sectionRef, reducedMotion);

  /**
   * Przy zredukowanym ruchu nie budujemy sceny w ogóle — nie ukrywamy jej,
   * nie zatrzymujemy, tylko nie montujemy. Różnica jest istotna: ukryta scena
   * nadal kosztowałaby pobranie modelu, kompilację shaderów i pracę GPU
   * na rzecz czegoś, czego nikt nie zobaczy.
   */
  if (reducedMotion) {
    return (
      <section aria-labelledby="hero-title" className="bg-bg">
        <AccessibleHeroContent visible />
      </section>
    );
  }

  return (
    <>
      <section
        ref={sectionRef}
        aria-labelledby="hero-title"
        style={{ height: `${SCROLL.lengthVh}vh` }}
        className="relative bg-bg"
      >
        <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
          <SceneScaffold scrollRef={scrollRef} />

          {/* Treść dla czytników ekranu i wyszukiwarek — obecna w DOM
              również w wersji animowanej, tylko ukryta wizualnie. */}
          <AccessibleHeroContent visible={false} />
        </div>
      </section>

      <DevProgress scrollRef={scrollRef} reducedMotion={reducedMotion} />
    </>
  );
};
