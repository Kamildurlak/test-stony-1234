import { useRef } from 'react';
import { BACKDROP, PALETTE } from '../config/scene';
import { round } from '../lib/math';
import { TICK_PRIORITY } from '../lib/ticker';
import { useTicker } from '../hooks/useTicker';

/**
 * Tło — jasna baza z rozmytymi plamami koloru.
 *
 * Konstrukcja: każda plama to osobny div z gradientem promienistym i mocnym
 * rozmyciem. Świadomie NIE jeden wielowarstwowy `background` na jednym
 * elemencie — wtedy nie dałoby się animować plam niezależnie, a cały sens
 * polega na tym, że dryfują we WŁASNYCH fazach. Wspólny ruch czytałby się
 * jako przesuwanie obrazka.
 *
 * Wydajność: rozmycie liczone jest raz przy pierwszym renderze i utrwalane
 * w warstwie kompozycji. Animujemy wyłącznie `transform`, więc GPU przesuwa
 * gotową, rozmytą teksturę zamiast przeliczać rozmycie w każdej klatce.
 * Gdybyśmy ruszali `background-position` albo promień gradientu, każda klatka
 * oznaczałaby ponowne rasteryzowanie czterech dużych plam — i to jest
 * dokładnie ta różnica, która na telefonie decyduje o 60 vs 20 fps.
 */
/**
 * Buduje gradient o zaniku gaussowskim.
 *
 * Ręcznie dobrane przystanki zawsze zostawiają widoczne kręgi — oko jest
 * wyjątkowo czułe na nieciągłość DRUGIEJ pochodnej jasności (efekt pasm Macha).
 * Dlatego zamiast zgadywać wartości, liczymy je z krzywej dzwonowej.
 *
 * Krzywa jest dodatkowo przesunięta i przeskalowana tak, żeby na krawędzi
 * osiągała DOKŁADNIE zero. Bez tej korekty zostaje resztkowa alfa rzędu 2%,
 * która rysuje idealny okrąg — czyli dokładnie to, co próbujemy ukryć.
 */
const gaussianGradient = (color: string, steps = 12, falloff = 4): string => {
  const edge = Math.exp(-falloff);
  const stops: string[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const r = i / steps;
    const raw = Math.exp(-falloff * r * r);
    const alpha = Math.max(0, (raw - edge) / (1 - edge));
    const hex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0');
    stops.push(`${color}${hex} ${Math.round(r * 100)}%`);
  }

  /**
   * `closest-side` jest tu OBOWIĄZKOWE, nie stylistyczne.
   *
   * Domyślnie radial-gradient mierzy 100% do najdalszego ROGU elementu,
   * podczas gdy `border-radius: 50%` przycina go do okręgu wpisanego,
   * czyli do najbliższego BOKU. Gradient jest więc obcinany w miejscu,
   * gdzie ma jeszcze ~12% krycia — i dostajemy ostry okrąg dokładnie tam,
   * gdzie miało być niewidoczne wygaszenie.
   */
  return `radial-gradient(circle closest-side, ${stops.join(', ')})`;
};

export const Backdrop = (): React.ReactElement => {
  const blobRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    for (let i = 0; i < BACKDROP.blobs.length; i += 1) {
      const node = blobRefs.current[i];
      if (!node) continue;

      /**
       * Każda plama ma własne przesunięcie fazowe i lekko inny okres.
       * Gdyby wszystkie dryfowały zgodnie, po kilkunastu sekundach oko
       * wyłapałoby wspólny rytm — a to natychmiast zdradza pętlę.
       */
      const phase = (i * Math.PI * 2) / BACKDROP.blobs.length;
      const period = BACKDROP.driftPeriodS * (1 + i * 0.17);
      const t = (elapsedS / period) * Math.PI * 2;

      const dx = Math.sin(t + phase) * BACKDROP.driftAmplitudePct;
      // Pionowo o połowę mniej i z innym mnożnikiem częstotliwości —
      // złożenie dwóch niewspółmiernych sinusów daje tor zbliżony do
      // krzywej Lissajous, czyli ruch po łuku zamiast po prostej.
      const dy = Math.cos(t * 0.61 + phase) * BACKDROP.driftAmplitudePct * 0.5;

      node.style.transform = `translate3d(${round(dx, 2)}%, ${round(dy, 2)}%, 0)`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ backgroundColor: PALETTE.bg }}
    >
      {BACKDROP.blobs.map((blob, index) => (
        <div
          key={blob.color}
          ref={(node) => {
            blobRefs.current[index] = node;
          }}
          className="absolute will-change-transform"
          style={{
            left: `${blob.x}%`,
            top: `${blob.y}%`,
            width: `${blob.size}vmax`,
            height: `${blob.size}vmax`,
            marginLeft: `${-blob.size / 2}vmax`,
            marginTop: `${-blob.size / 2}vmax`,
            borderRadius: '50%',
            opacity: blob.opacity,
            /**
             * ŻADNEGO `filter: blur()` — i to nie jest drobiazg.
             *
             * Pierwsza wersja miała tu `blur(60px)`. Zmierzone: 13 fps.
             * Po zdjęciu samego rozmycia: 53 fps. Czterokrotna różnica
             * z jednej właściwości.
             *
             * Powód: rozmycie na elemencie wielkości pół ekranu zmusza
             * przeglądarkę do rasteryzowania ogromnej powierzchni z dużym
             * promieniem próbkowania. Nie ratuje tego nawet animowanie
             * wyłącznie transformu — a to jest właśnie ta pułapka, przez którą
             * "przecież animuję tylko transform" bywa nieprawdą w praktyce.
             *
             * Miękkość odzyskujemy za darmo: gradient promienisty z kilkoma
             * przystankami wygasającymi wykładniczo daje krawędź nie do
             * odróżnienia od rozmytej, a kosztuje jedno rysowanie przy
             * pierwszym renderze.
             */
            background: gaussianGradient(blob.color),
          }}
        />
      ))}

      {/*
        Delikatne ziarno na całości. Jeden element, jedna tekstura w data URI.
        Powód jest ten sam co wyżej: idealnie gładkie gradienty wyglądają
        cyfrowo i tanio. Ziarno to najstarszy trik z retuszu i nadal działa —
        daje wrażenie materiału zamiast wypełnienia.
      */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.32,
          mixBlendMode: 'multiply',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
};
