import { BACKDROP, PALETTE } from '../config/scene';

/**
 * Tło sceny: jasna, chłodna baza plus warstwy miękkiego światła.
 *
 * DWIE DECYZJE, KTÓRE DECYDUJĄ O CAŁEJ RESZCIE:
 *
 * 1. To NIE jest „kolorowe tło", tylko OŚWIETLENIE. Każda plama ma krycie
 *    rzędu 0.15–0.3 i średnicę liczoną w dziesiątkach procent ekranu.
 *    Plama jest widoczna; światło jest odczuwalne. Ta różnica jest jedyną
 *    rzeczą, która dzieli tło agencji od tła wygenerowanego w pięć minut.
 *
 * 2. Wszystko animuje CSS, nic nie idzie przez pętlę rAF.
 *
 *    Poprzednia wersja przeliczała pozycje plam w każdej klatce w tickerze.
 *    Działało, ale to była praca wykonywana bez powodu: ruch tła nie zależy
 *    ani od scrolla, ani od żadnego stanu sceny. Animacja CSS na `transform`
 *    i `opacity` jest w całości obsługiwana przez kompozytor — kosztuje ZERO
 *    czasu w klatce i zwalnia budżet dla pudełka, ikon i osi czasu, czyli
 *    dla rzeczy, które faktycznie muszą być zsynchronizowane ze scrollem.
 *
 * Zasada, do której to prowadzi: przez ticker idzie WYŁĄCZNIE to, co musi
 * być zsynchronizowane z resztą sceny. Reszta należy do CSS.
 */

/**
 * Gradient o zaniku gaussowskim.
 *
 * Ręcznie dobrane przystanki zawsze zostawiają widoczne kręgi — oko jest
 * wyjątkowo czułe na nieciągłość drugiej pochodnej jasności (pasma Macha).
 * Liczymy je więc z krzywej dzwonowej, przesuniętej tak, żeby na krawędzi
 * osiągała DOKŁADNIE zero: bez tej korekty zostaje resztkowa alfa rzędu 2%,
 * która rysuje idealny okrąg — czyli dokładnie to, co próbujemy ukryć.
 *
 * `closest-side` jest obowiązkowe: domyślnie gradient mierzy 100% do
 * najdalszego ROGU, a `border-radius: 50%` przycina go do okręgu wpisanego,
 * więc bez tego jest obcinany przy niezerowym kryciu.
 */
const gaussianGradient = (color: string, steps = 14, falloff = 4.2): string => {
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
  return `radial-gradient(circle closest-side, ${stops.join(', ')})`;
};

export const Backdrop = (): React.ReactElement => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    style={{
      /**
       * Baza jest GRADIENTEM, nie płaskim kolorem. Nawet ledwie zauważalne
       * pociemnienie ku dołowi daje przestrzeni kierunek — bez niego kadr
       * jest kartką papieru, a nie pomieszczeniem.
       */
      background: `linear-gradient(168deg, ${PALETTE.bg} 0%, ${PALETTE.bg} 42%, ${PALETTE.bgDeep} 100%)`,
    }}
  >
    <style>{`
      @keyframes bd-drift {
        0%   { transform: translate3d(0, 0, 0) scale(1); }
        50%  { transform: translate3d(var(--dx), var(--dy), 0) scale(var(--s)); }
        100% { transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes bd-pulse {
        0%, 100% { opacity: var(--o-min); }
        50%      { opacity: var(--o-max); }
      }
      @keyframes bd-wave {
        0%   { transform: translate3d(-58%, 0, 0); }
        100% { transform: translate3d(58%, 0, 0); }
      }

      /*
        Przy prefers-reduced-motion tło ZOSTAJE, ale przestaje się ruszać.
        Kompozycja świateł jest częścią projektu, nie animacją — nie ma
        powodu jej zabierać. Zabieramy sam ruch.
      */
      @media (prefers-reduced-motion: reduce) {
        [data-bd] { animation: none !important; }
      }

      /*
        Na wąskich ekranach światła są mniejsze i słabsze.
        Te same wartości co na desktopie dałyby zalanie kadru kolorem —
        przy szerokości 375 px plama o średnicy 60vmax to praktycznie
        cały ekran, a treść musi zostać czytelna.
      */
      @media (max-width: 640px) {
        [data-bd-light] { opacity: calc(var(--o-min) * 0.62) !important; }
        [data-bd-wave]  { opacity: calc(var(--w-o) * 0.5) !important; }
      }
    `}</style>

    {/* --- ŚWIATŁA --- */}
    {BACKDROP.lights.map((light, i) => (
      <div
        key={light.color + String(i)}
        data-bd=""
        data-bd-light=""
        style={{
          position: 'absolute',
          left: `${light.x}%`,
          top: `${light.y}%`,
          width: `${light.size}vmax`,
          height: `${light.size}vmax`,
          marginLeft: `${-light.size / 2}vmax`,
          marginTop: `${-light.size / 2}vmax`,
          borderRadius: '50%',
          background: gaussianGradient(light.color),
          ['--dx' as string]: `${light.dx}%`,
          ['--dy' as string]: `${light.dy}%`,
          // Bardzo delikatne pulsowanie skali. Powyżej kilku procent zaczyna
          // być widoczne jako „oddychanie", a ma pozostać nieuchwytne.
          ['--s' as string]: '1.06',
          ['--o-min' as string]: `${light.opacity}`,
          ['--o-max' as string]: `${light.opacity * 1.35}`,
          opacity: light.opacity,
          animation: `bd-drift ${light.driftS}s ease-in-out infinite, bd-pulse ${light.pulseS}s ease-in-out infinite`,
          willChange: 'transform, opacity',
        }}
      />
    ))}

    {/* --- ŚWIETLNE FALE --- */}
    {BACKDROP.waves.map((wave, i) => (
      <div
        key={`wave-${i}`}
        style={{
          position: 'absolute',
          left: '-30%',
          top: `${wave.y}%`,
          width: '160%',
          height: `${wave.thickness}vmax`,
          marginTop: `${-wave.thickness / 2}vmax`,
          transform: `rotate(${wave.angle}deg)`,
          // Obrót na kontenerze, przesuwanie na dziecku — inaczej animacja
          // transformu skasowałaby obrót i fala wyprostowałaby się w locie.
          overflow: 'visible',
        }}
      >
        <div
          data-bd=""
          data-bd-wave=""
          style={{
            width: '100%',
            height: '100%',
            background: `linear-gradient(90deg, transparent 0%, ${wave.color} 45%, ${wave.color} 55%, transparent 100%)`,
            // Miękkie wygaszenie w pionie: bez tego pasmo ma ostre krawędzie
            // i czyta się jako wstążka, a nie jako przepływ światła.
            maskImage: 'linear-gradient(180deg, transparent 0%, #000 50%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 50%, transparent 100%)',
            ['--w-o' as string]: `${wave.opacity}`,
            opacity: wave.opacity,
            animation: `bd-wave ${wave.durationS}s ease-in-out infinite alternate`,
            willChange: 'transform',
          }}
        />
      </div>
    ))}

    {/*
      Rozjaśnienie środka.
      Hierarchia z brief'u: tło nie może konkurować z produktem. Delikatna
      poświata bazowego koloru w centrum odsuwa światła na obrzeża kadru
      i zostawia scenie spokojne miejsce na pudełko i treść.
    */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 54% 46% at 50% 46%, ${PALETTE.bg}A8 0%, ${PALETTE.bg}4D 52%, transparent 100%)`,
      }}
    />
  </div>
);
