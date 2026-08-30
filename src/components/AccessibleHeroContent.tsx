/**
 * Warstwa treści niezależna od animacji.
 *
 * Pełni TRZY role naraz i to jest w niej najważniejsze:
 *
 * 1. Dostępność — przy `prefers-reduced-motion` to jest CAŁE doświadczenie.
 *    Brief stawia sprawę ostro: "wersja bez ruchu ma być kompletna i sensowna,
 *    nie okrojona". Dlatego nie jest to zrzut tekstu na czarnym tle, tylko
 *    zaprojektowany układ, który po prostu nie wymaga ruchu, żeby działać.
 *
 * 2. SEO i czytniki ekranu — ten tekst jest w DOM ZAWSZE, także w wersji
 *    animowanej. Robot indeksujący i czytnik ekranu dostają pełną treść
 *    niezależnie od tego, czy ktoś doscrollował do fazy 7.
 *
 * 3. Fallback — gdy WebGL nie wystartuje (stary sterownik, utrata kontekstu,
 *    wyłączony sprzętowo), strona nadal ma sens. Nie pusty ekran.
 *
 * Kluczowy szczegół implementacyjny: w wersji animowanej ukrywamy to
 * WIZUALNIE (clip-path), a nie przez `display: none` ani `visibility: hidden`.
 * Te dwie własności usuwają treść z drzewa dostępności — czyli dokładnie
 * odwrotnie do celu.
 */

interface Service {
  readonly title: string;
  readonly body: string;
  readonly accent: string;
}

const SERVICES: readonly Service[] = [
  {
    title: 'Idealny montaż',
    body: 'Short-form video cięte pod rytm platformy. Tempo, napisy, dźwięk — wszystko na swoim miejscu.',
    accent: 'text-magenta',
  },
  {
    title: 'Viralowe treści',
    body: 'Znajdujemy trend, zanim się nasyci, i budujemy pod niego materiał. Zasięg to nie przypadek.',
    accent: 'text-cyan',
  },
  {
    title: 'Strony, które konwertują',
    body: 'Szybkie, dopracowane strony produktowe. Ładują się od razu i prowadzą do jednego działania.',
    accent: 'text-violet',
  },
  {
    title: 'Content dla firm',
    body: 'Stały dopływ materiałów dla marki — bez zaczynania każdego miesiąca od zera.',
    accent: 'text-magenta',
  },
  {
    title: 'Automatyzacja AI',
    body: 'Powtarzalne etapy produkcji przejmują procesy automatyczne. Zostaje czas na to, co wymaga człowieka.',
    accent: 'text-cyan',
  },
];

interface AccessibleHeroContentProps {
  /** Gdy false, treść jest ukryta wizualnie, ale nadal dostępna dla czytników. */
  readonly visible: boolean;
}

export const AccessibleHeroContent = ({
  visible,
}: AccessibleHeroContentProps): React.ReactElement => (
  <div
    className={
      visible
        ? 'relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-20'
        : 'sr-only-content'
    }
  >
    <p className="mb-5 font-mono text-[11px] tracking-[0.28em] text-violet uppercase">
      Studio treści i automatyzacji
    </p>

    <h1 id="hero-title" className="max-w-3xl text-ink text-[clamp(2.5rem,8vw,5.5rem)]">
      Od pomysłu do viralu.
      <br />
      <span className="text-ink-muted">Bez chaosu.</span>
    </h1>

    <p className="text-ink-muted mt-7 max-w-xl text-base leading-relaxed sm:text-lg">
      Montaż short-form video, viralowe trendy, strony internetowe, content dla firm i
      automatyzacja AI. Jedna ekipa, jeden proces, jeden termin.
    </p>

    <ul className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {SERVICES.map((service) => (
        <li key={service.title}>
          <h2 className={`text-xl ${service.accent}`}>{service.title}</h2>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">{service.body}</p>
        </li>
      ))}
    </ul>

    <div className="mt-14">
      <a
        href="#kontakt"
        className="bg-ink inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-violet"
      >
        Omówmy projekt
        <span aria-hidden="true">→</span>
      </a>
    </div>
  </div>
);
