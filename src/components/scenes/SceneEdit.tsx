import { useRef, type RefObject } from 'react';
import { PALETTE, PHASES, ROTATIONS } from '../../config/scene';
import { clamp, easeOutCubic, mapRange, phaseProgress, round } from '../../lib/math';
import { getSceneScale } from '../../lib/sceneScale';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';

/**
 * Scena 1 — oś czasu montażu, w środku pierścienia ikon.
 *
 * Wchodzi NATYCHMIAST po tym, jak ikony osiądą na orbicie. Klient postawił
 * to jasno: żadnego czekania, aż formacja się nakręci. Faza SCENE_EDIT
 * startuje w tym samym punkcie, w którym kończy się ICONS.
 *
 * Oś czasu jest STYLIZOWANA, nie jest zrzutem interfejsu programu
 * montażowego — wierna kopia timeline'a z Premiere'a czyta się jak wklejony
 * zrzut ekranu, a nie jak element identyfikacji. Bierzemy z niego wyłącznie
 * to, co każdy rozpozna jako „montaż": pasek narzędzi, linijkę czasu,
 * ścieżki z klipami o różnych długościach, przejścia, napisy, znaczniki,
 * falę dźwięku i głowicę.
 *
 * GEOMETRIA — i to jest miejsce, w którym łatwo się pomylić.
 *
 * Karta ma 520 px szerokości przy promieniu orbity 490 px i kafelku 168 px.
 * Najciaśniejszym miejscem NIE jest odległość ikony od krawędzi karty,
 * tylko od jej NAROŻNIKA. Pierwsza wersja liczyła wyłącznie odległości
 * prostopadłe do boków i wyszło z niej 88 px prześwitu; pomiar realnych
 * prostokątów w przeglądarce pokazał 32 px, bo ikona mija róg po skosie.
 *
 * Stąd promień podniesiony do 490 px. Wartość jest potwierdzona POMIAREM
 * realnych prostokątów w przeglądarce, nie wyliczeniem na kartce. Ponieważ
 * karta i orbita skalują się JEDNYM współczynnikiem (lib/sceneScale.ts),
 * zmierzony prześwit zachowuje proporcję na każdym ekranie.
 */

interface Clip {
  /** Pozycja i szerokość jako procent szerokości osi czasu. */
  readonly start: number;
  readonly width: number;
  readonly track: number;
  /** Dwa kolory — klipy są wypełnione gradientem, nie płaską barwą. */
  readonly from: string;
  readonly to: string;
  /** Ułamek sceny, w którym klip się pojawia. Nigdy równo. */
  readonly revealAt: number;
}

/**
 * Rozszerzona paleta osi czasu.
 *
 * Trzy barwy projektu to za mało na przekonujący timeline — prawdziwy
 * montaż to kilkanaście klipów, a przy trzech kolorach powstaje wzór.
 * Dokładamy bursztyn i błękit: obie leżą między istniejącymi akcentami
 * na kole barw, więc rozszerzają zestaw, zamiast go rozbijać.
 */
const TL = {
  violet: PALETTE.violet,
  violetDeep: '#5B32C4',
  magenta: PALETTE.magenta,
  magentaDeep: '#B8145A',
  cyan: PALETTE.cyan,
  cyanDeep: '#00806F',
  amber: '#F5A524',
  amberDeep: '#C77C0B',
  azure: '#2E8FFF',
  azureDeep: '#1B63C4',
} as const;

/**
 * Układ klipów: trzy ścieżki wideo, czternaście klipów.
 *
 * Długości celowo nierówne i niepodzielne przez siebie — montaż short-form
 * to seria cięć o różnym oddechu, a rytm regularny natychmiast czyta się
 * jako wzór wygenerowany, nie jako materiał.
 */
const CLIPS: readonly Clip[] = [
  // Ścieżka główna — najdłuższe ujęcia.
  { start: 0, width: 15, track: 0, from: TL.violet, to: TL.violetDeep, revealAt: 0.0 },
  { start: 16.2, width: 9, track: 0, from: TL.magenta, to: TL.magentaDeep, revealAt: 0.05 },
  { start: 26.4, width: 19, track: 0, from: TL.violet, to: TL.violetDeep, revealAt: 0.1 },
  { start: 46.6, width: 6.5, track: 0, from: TL.amber, to: TL.amberDeep, revealAt: 0.18 },
  { start: 54.2, width: 13, track: 0, from: TL.magenta, to: TL.magentaDeep, revealAt: 0.24 },
  { start: 68.4, width: 8, track: 0, from: TL.azure, to: TL.azureDeep, revealAt: 0.32 },
  { start: 77.6, width: 22, track: 0, from: TL.violet, to: TL.violetDeep, revealAt: 0.38 },

  // Ścieżka B-roll — przebitki, krótsze i rzadsze.
  { start: 5, width: 12, track: 1, from: TL.cyan, to: TL.cyanDeep, revealAt: 0.08 },
  { start: 21, width: 8.5, track: 1, from: TL.azure, to: TL.azureDeep, revealAt: 0.14 },
  { start: 38, width: 15, track: 1, from: TL.cyan, to: TL.cyanDeep, revealAt: 0.22 },
  { start: 60, width: 10, track: 1, from: TL.amber, to: TL.amberDeep, revealAt: 0.3 },
  { start: 74, width: 18, track: 1, from: TL.cyan, to: TL.cyanDeep, revealAt: 0.42 },

  // Ścieżka efektów — najkrótsze wstawki.
  { start: 12, width: 6, track: 2, from: TL.amber, to: TL.amberDeep, revealAt: 0.11 },
  { start: 44, width: 7.5, track: 2, from: TL.magenta, to: TL.magentaDeep, revealAt: 0.27 },
  { start: 82, width: 9, track: 2, from: TL.azure, to: TL.azureDeep, revealAt: 0.45 },
];

/**
 * Przejścia — leżą NA STYKU dwóch klipów ścieżki głównej.
 * W prawdziwym montażu to właśnie tam siedzą, i ta drobnostka odróżnia
 * timeline od paska kolorowych prostokątów.
 */
const TRANSITIONS: readonly number[] = [15.6, 25.9, 45.8, 53.6, 67.9, 77.1];

/** Znaczniki na linijce — wyskakują, gdy mija je głowica. */
const MARKERS: readonly { at: number; color: string }[] = [
  { at: 16.2, color: TL.magenta },
  { at: 26.4, color: TL.cyan },
  { at: 46.6, color: TL.amber },
  { at: 54.2, color: TL.magenta },
  { at: 68.4, color: TL.azure },
  { at: 77.6, color: TL.violet },
];

/** Napisy na ekranie — chipy na własnej ścieżce. */
const CAPTIONS: readonly { start: number; width: number; text: string }[] = [
  { start: 3, width: 20, text: 'HOOK' },
  { start: 28, width: 24, text: 'PROBLEM' },
  { start: 57, width: 18, text: 'DOWÓD' },
  { start: 79, width: 18, text: 'CTA' },
];

const WAVE_BARS = 38;
const RULER_TICKS = 24;

interface SceneEditProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const SceneEdit = ({ scrollRef }: SceneEditProps): React.ReactElement => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const markerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const captionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;

    /**
     * Wejście jest SZYBKIE — 2,5% scrolla. Klient wymaga, żeby grafika
     * pojawiała się natychmiast po osadzeniu ikon, bez chwili pustki.
     */
    const enter = clamp(mapRange(smooth, PHASES.SCENE_EDIT[0], PHASES.SCENE_EDIT[0] + 0.025, 0, 1));
    const exit = clamp(mapRange(smooth, ROTATIONS.TO_VIRAL[0], ROTATIONS.TO_VIRAL[1], 0, 1));
    const visible = enter * (1 - exit);

    if (rootRef.current) {
      rootRef.current.style.opacity = `${round(visible, 3)}`;
      rootRef.current.style.visibility = visible < 0.01 ? 'hidden' : 'visible';
    }

    if (stageRef.current) {
      /**
       * Ta sama skala co pierścień ikon — jeden współczynnik na całą scenę.
       * Do niej doklejamy mikroruch wejścia i wyjścia.
       *
       * Wyjście przez przesunięcie i skalę, nie przez rozmycie: `filter: blur`
       * na animowanym elemencie wymusza ponowną rasteryzację w każdej klatce
       * i kosztował już raz połowę budżetu klatki w tym projekcie.
       */
      const eased = easeOutCubic(enter);
      const shift = (1 - eased) * 26 + exit * -22;
      const zoom = getSceneScale() * (0.96 + eased * 0.04 - exit * 0.04);
      stageRef.current.style.transform = `translate3d(0, ${round(shift)}px, 0) scale(${round(zoom, 4)})`;
    }

    if (headingRef.current) {
      /**
       * Napis wchodzi z własnym, KRÓTKIM opóźnieniem względem karty.
       * Nie dlatego, że tak ładniej — tylko dlatego, że w tej kolejności
       * oko najpierw dostaje obraz, a potem podpis do niego. Odwrotnie
       * napis wisiałby przez chwilę nad pustym miejscem.
       */
      const headT = clamp(mapRange(enter, 0.35, 1, 0, 1));
      const headEased = easeOutCubic(headT);
      headingRef.current.style.opacity = `${round(headEased * (1 - exit), 3)}`;
      headingRef.current.style.transform = `translate3d(0, ${round((1 - headEased) * 18)}px, 0) scale(${round(0.97 + headEased * 0.03, 4)})`;
    }

    if (visible < 0.01) return;

    /** Postęp w obrębie sceny — to on napędza głowicę. */
    const sceneT = phaseProgress(smooth, PHASES.SCENE_EDIT);
    const headPos = sceneT * 100;

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translate3d(${round(headPos, 3)}%, 0, 0)`;
    }

    for (let i = 0; i < CLIPS.length; i += 1) {
      const clip = CLIPS[i];
      const node = clipRefs.current[i];
      if (!clip || !node) continue;
      /**
       * Klip pojawia się, gdy dojedzie do niego głowica — nie na własnym
       * liczniku czasu. Dzięki temu użytkownik czuje, że to ON montuje
       * materiał przewijając, a nie że ogląda gotową animację.
       */
      const t = clamp(mapRange(sceneT, clip.revealAt, clip.revealAt + 0.07, 0, 1));
      const eased = easeOutCubic(t);
      node.style.opacity = `${round(eased, 3)}`;
      node.style.transform = `scaleX(${round(0.55 + eased * 0.45, 4)})`;
    }

    for (let i = 0; i < CAPTIONS.length; i += 1) {
      const caption = CAPTIONS[i];
      const node = captionRefs.current[i];
      if (!caption || !node) continue;
      // Napis zapala się, dopóki głowica jest w jego zakresie.
      const active = headPos >= caption.start && headPos <= caption.start + caption.width;
      node.style.opacity = `${active ? 1 : 0.28}`;
      node.style.transform = `scale(${active ? 1 : 0.94})`;
    }

    for (let i = 0; i < MARKERS.length; i += 1) {
      const marker = MARKERS[i];
      const node = markerRefs.current[i];
      if (!marker || !node) continue;
      /**
       * Znacznik wyskakuje w chwili minięcia przez głowicę i wraca —
       * krótki impuls, nie trwała zmiana. To ten mikro-akcent, który
       * sprawia, że przewijanie ma rytm.
       */
      const distance = headPos - marker.at;
      const pop = distance >= 0 ? clamp(1 - distance / 5) : 0;
      node.style.transform = `scale(${round(0.55 + pop * 0.75, 3)})`;
      node.style.opacity = `${round(0.3 + pop * 0.7, 3)}`;
    }

    for (let i = 0; i < WAVE_BARS; i += 1) {
      const node = barRefs.current[i];
      if (!node) continue;
      const barPos = (i / (WAVE_BARS - 1)) * 100;

      /**
       * Fala dźwięku: stały kształt materiału plus pulsowanie tam, gdzie
       * właśnie jest głowica.
       *
       * Kształt bazowy jest deterministyczny (złożenie sinusów o niewspółmiernych
       * okresach), nie losowy — dzięki temu fala wygląda identycznie przy
       * przewijaniu w obie strony. Losowa migotałaby przy każdym przeliczeniu.
       */
      const shape =
        0.28 +
        Math.abs(Math.sin(i * 0.79)) * 0.3 +
        Math.abs(Math.sin(i * 0.31 + 1.4)) * 0.22 +
        Math.abs(Math.sin(i * 0.13 + 0.6)) * 0.16;

      const nearHead = clamp(1 - Math.abs(barPos - headPos) / 12);
      // Trzy niewspółmierne częstotliwości, żeby puls nie miał słyszalnego
      // rytmu — dźwięk nie pulsuje równo jak metronom.
      const pulse =
        nearHead * (0.18 + Math.sin(elapsedS * 8.3 + i * 1.7) * 0.07 + Math.sin(elapsedS * 13.1 + i) * 0.05);

      node.style.transform = `scaleY(${round(shape + pulse, 3)})`;
      node.style.opacity = `${round(0.35 + nearHead * 0.65, 3)}`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      /**
       * Nad warstwą ikon. Pierścień ma krążyć ZA treścią — przy zachowanych
       * odstępach nic się nie nakłada, ale wymuszona kolejność jest
       * zabezpieczeniem na wypadek skrajnych proporcji okna.
       */
      style={{ opacity: 0, visibility: 'hidden', zIndex: 1 }}
    >
      <div ref={stageRef} className="flex flex-col items-center will-change-transform">
        {/* --- KARTA OSI CZASU --- */}
        <div
          data-timeline-card=""
          className="relative overflow-hidden"
          style={{
            width: '520px',
            borderRadius: '18px',
            background: 'linear-gradient(168deg, #1D1729 0%, #141020 60%, #100C1A 100%)',
            boxShadow:
              '0 26px 60px -24px rgba(20,12,34,0.6), inset 0 1px 0 rgba(255,255,255,0.09)',
          }}
        >
          {/* Pasek narzędzi */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex gap-1.5">
              {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                <span key={c} className="h-2 w-2 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <span className="ml-1 font-mono text-[9px] tracking-wider text-white/45">
              rolka_final_v4.prproj
            </span>
            <span
              className="ml-auto rounded px-1.5 py-0.5 font-mono text-[8px] tracking-wider"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)' }}
            >
              9:16 · 60 FPS
            </span>
          </div>

          <div className="relative px-3 pt-2 pb-3">
            {/* Linijka czasu */}
            <div className="relative mb-1.5 flex h-4 items-end justify-between">
              {Array.from({ length: RULER_TICKS }, (_, i) => (
                <span
                  key={i}
                  className="w-px"
                  style={{
                    height: i % 4 === 0 ? '9px' : '4px',
                    background: i % 4 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.14)',
                  }}
                />
              ))}
              {/* Znaczniki na linijce */}
              {MARKERS.map((marker, i) => (
                <div
                  key={marker.at}
                  ref={(node) => {
                    markerRefs.current[i] = node;
                  }}
                  className="absolute top-0 h-2.5 w-2.5 origin-center rotate-45 rounded-[2px] will-change-transform"
                  style={{ left: `calc(${marker.at}% - 5px)`, background: marker.color, opacity: 0.3 }}
                />
              ))}
            </div>

            {/* Ścieżki wideo */}
            {[0, 1, 2].map((track) => (
              <div key={track} className="mb-1.5 flex items-center gap-1.5">
                <span className="w-4 shrink-0 font-mono text-[7px] text-white/30">
                  {track === 0 ? 'V1' : track === 1 ? 'V2' : 'FX'}
                </span>
                <div
                  className="relative overflow-hidden rounded-[5px]"
                  style={{
                    height: track === 2 ? '13px' : '20px',
                    flex: 1,
                    background: 'rgba(255,255,255,0.045)',
                  }}
                >
                  {CLIPS.map((clip, index) =>
                    clip.track !== track ? null : (
                      <div
                        key={`${clip.track}-${clip.start}`}
                        ref={(node) => {
                          clipRefs.current[index] = node;
                        }}
                        className="absolute inset-y-[2px] origin-left overflow-hidden rounded-[3px] will-change-transform"
                        style={{
                          left: `${clip.start}%`,
                          width: `${clip.width}%`,
                          background: `linear-gradient(155deg, ${clip.from} 0%, ${clip.to} 100%)`,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
                          opacity: 0,
                        }}
                      >
                        {/* Prążki miniatur — sugestia klatek wewnątrz klipu. */}
                        <span
                          className="absolute inset-0"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0 1px, transparent 1px 7px)',
                          }}
                        />
                      </div>
                    ),
                  )}

                  {/* Przejścia — tylko na ścieżce głównej, na stykach klipów. */}
                  {track === 0 &&
                    TRANSITIONS.map((at) => (
                      <div
                        key={at}
                        className="absolute inset-y-[2px] w-[7px] rounded-[2px]"
                        style={{
                          left: `calc(${at}% - 3.5px)`,
                          background:
                            'repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 1.5px, rgba(255,255,255,0.12) 1.5px 3px)',
                        }}
                      />
                    ))}
                </div>
              </div>
            ))}

            {/* Ścieżka napisów */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="w-4 shrink-0 font-mono text-[7px] text-white/30">T</span>
              <div
                className="relative h-[15px] flex-1 overflow-hidden rounded-[5px]"
                style={{ background: 'rgba(255,255,255,0.045)' }}
              >
                {CAPTIONS.map((caption, i) => (
                  <div
                    key={caption.text}
                    ref={(node) => {
                      captionRefs.current[i] = node;
                    }}
                    className="absolute inset-y-[2px] grid origin-center place-items-center rounded-[3px] will-change-transform"
                    style={{
                      left: `${caption.start}%`,
                      width: `${caption.width}%`,
                      background: 'rgba(255,255,255,0.16)',
                      opacity: 0.28,
                    }}
                  >
                    <span className="font-mono text-[6.5px] tracking-[0.14em] text-white/90">
                      {caption.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ścieżka dźwięku */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 shrink-0 font-mono text-[7px] text-white/30">A1</span>
              <div
                className="relative flex h-[34px] flex-1 items-center justify-between gap-[1.5px] overflow-hidden rounded-[5px] px-1.5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,181,163,0.13) 0%, rgba(0,181,163,0.04) 100%)',
                }}
              >
                {Array.from({ length: WAVE_BARS }, (_, i) => (
                  <div
                    key={i}
                    ref={(node) => {
                      barRefs.current[i] = node;
                    }}
                    className="h-full flex-1 origin-center rounded-full will-change-transform"
                    style={{
                      background: `linear-gradient(180deg, ${TL.cyan} 0%, ${TL.cyanDeep} 100%)`,
                      transform: 'scaleY(0.3)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Głowica — jedyny element jadący wprost ze scrollem. */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-1 bottom-2 left-[27px] w-[2px] will-change-transform"
              style={{
                background: PALETTE.magenta,
                boxShadow: `0 0 14px 2px ${PALETTE.magenta}`,
              }}
            >
              <div
                className="absolute -top-[3px] -left-[4px] h-2.5 w-2.5 rotate-45 rounded-[2px]"
                style={{ background: PALETTE.magenta }}
              />
            </div>
          </div>
        </div>

        {/* --- NAPIS POD GRAFIKĄ --- */}
        <h2
          ref={headingRef}
          className="text-ink mt-7 text-center text-[40px] leading-tight will-change-transform"
          style={{ opacity: 0, letterSpacing: '-0.025em' }}
        >
          Perfekcyjny montaż rolek.
        </h2>
      </div>
    </div>
  );
};
