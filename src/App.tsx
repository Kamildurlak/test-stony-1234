import { HeroScroll } from './components/HeroScroll';

export const App = (): React.ReactElement => (
  <main className="bg-bg">
    <HeroScroll />

    {/*
      Sekcja domykająca. Na tym etapie pełni jedną konkretną funkcję:
      pozwala sprawdzić, czy WYJŚCIE z kontenera sticky jest gładkie.
      Przejście od sekcji przyklejonej do normalnego przewijania to klasyczne
      miejsce na szarpnięcie — łatwo je przeoczyć, testując samą sekcję hero.
    */}
    <section id="kontakt" className="flex min-h-screen items-center justify-center px-6">
      <p className="max-w-md text-center text-sm text-white/30">
        Dalsza część strony. Sprawdź, czy przejście z sekcji hero jest płynne — bez skoku
        i bez efektu gumy.
      </p>
    </section>
  </main>
);
