import { useRef, type RefObject } from 'react';
import { PALETTE, PHASES, ROTATIONS } from '../../config/scene';
import { clamp, easeOutCubic, mapRange, phaseProgress, round } from '../../lib/math';
import { TICK_PRIORITY } from '../../lib/ticker';
import { useTicker } from '../../hooks/useTicker';
import type { ScrollState } from '../../hooks/useScrollProgress';

/**
 * Scena 1 — „Idealny montaż".
 *
 * Wchodzi dokładnie wtedy, gdy formacja ikon rusza po okręgu: obrót jest
 * pretekstem do odsłonięcia treści, więc treść musi pojawić się NA nim,
 * a nie po jego zakończeniu.
 *
 * Oś czasu jest STYLIZOWANA, nie jest zrzutem interfejsu programu
 * montażowego. Brief stawia to wprost i ma rację: wierna kopia timeline'a
 * z Premiere'a czyta się jak zrzut ekranu wklejony w stronę, a nie jak
 * element identyfikacji. Zostawiamy tylko te elementy, które każdy rozpozna
 * jako „montaż" — ścieżki, klipy o różnych długościach, cięcia, napisy,
 * falę dźwięku i głowicę — a wszystko inne odrzucamy.
 */

interface Clip {
  /** Pozycja i szerokość jako procent szerokości osi czasu. */
  readonly start: number;
  readonly width: number;
  readonly track: number;
  readonly color: string;
  /** Ułamek sceny, w którym klip się pojawia. Nigdy równo. */
  readonly revealAt: number;
}

/**
 * Układ klipów.
 *
 * Długości celowo nierówne i niepodzielne przez siebie — prawdziwy montaż
 * short-form to seria cięć o różnym oddechu, a rytm regularny natychmiast
 * czyta się jako wzór wygenerowany, nie jako materiał.
 */
const CLIPS: readonly Clip[] = [
  { start: 0, width: 17, track: 0, color: PALETTE.violet, revealAt: 0.0 },
  { start: 18.5, width: 11, track: 0, color: PALETTE.magenta, revealAt: 0.08 },
  { start: 31, width: 23, track: 0, color: PALETTE.violet, revealAt: 0.15 },
  { start: 55.5, width: 8, track: 0, color: PALETTE.cyan, revealAt: 0.26 },
  { start: 65, width: 14.5, track: 0, color: PALETTE.magenta, revealAt: 0.33 },
  { start: 81, width: 19, track: 0, color: PALETTE.violet, revealAt: 0.41 },

  { start: 6, width: 21, track: 1, color: PALETTE.cyan, revealAt: 0.12 },
  { start: 40, width: 16, track: 1, color: PALETTE.cyan, revealAt: 0.29 },
  { start: 70, width: 25, track: 1, color: PALETTE.cyan, revealAt: 0.47 },
];

/** Znaczniki cięć — wyskakują, gdy mija je głowica. */
const CUTS: readonly number[] = [18.5, 31, 55.5, 65, 81];

/** Liczba słupków fali dźwiękowej. Więcej = ładniej, ale i drożej. */
const WAVE_BARS = 34;

interface SceneEditProps {
  readonly scrollRef: RefObject<ScrollState>;
}

export const SceneEdit = ({ scrollRef }: SceneEditProps): React.ReactElement => {
  const rootRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cutRefs = useRef<Array<HTMLDivElement | null>>([]);
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  useTicker((_deltaS, elapsedS) => {
    const { smooth } = scrollRef.current;

    /**
     * Wejście i wyjście sceny.
     *
     * Wyjście jest związane z OBROTEM formacji, nie z końcem własnej fazy —
     * treść ma znikać dokładnie wtedy, gdy układ ikon rusza dalej. Inaczej
     * powstaje martwa chwila, w której nie dzieje się nic.
     */
    const enter = clamp(mapRange(smooth, PHASES.SCENE_EDIT[0], PHASES.SCENE_EDIT[0] + 0.035, 0, 1));
    const exit = clamp(mapRange(smooth, ROTATIONS.TO_VIRAL[0], ROTATIONS.TO_VIRAL[1], 0, 1));
    const visible = enter * (1 - exit);

    if (rootRef.current) {
      rootRef.current.style.opacity = `${round(visible, 3)}`;
      /**
       * Stara treść wychodzi z PRZESUNIĘCIEM I ZMNIEJSZENIEM, nie samym
       * zanikiem. Brief wspominał o rozmyciu — świadomie go nie używamy:
       * `filter: blur` na animowanym elemencie wymusza ponowną rasteryzację
       * w każdej klatce, co w tym projekcie kosztowało już raz połowę
       * budżetu klatki. Przesunięcie i skala dają to samo wrażenie
       * „odjeżdżania w tło" i są w całości kompozytowane.
       */
      const enterShift = (1 - easeOutCubic(enter)) * 34;
      const exitShift = exit * -28;
      const scale = 0.94 + easeOutCubic(enter) * 0.06 - exit * 0.05;
      rootRef.current.style.transform = `translate3d(0, ${round(enterShift + exitShift)}px, 0) scale(${round(scale, 4)})`;
      // Poza sceną element nie może przechwytywać niczego ani zaśmiecać
      // drzewa dostępności widoczną, lecz przezroczystą treścią.
      rootRef.current.style.visibility = visible < 0.01 ? 'hidden' : 'visible';
    }

    if (visible < 0.01) return;

    /** Postęp w obrębie sceny — to on napędza głowicę. */
    const sceneT = phaseProgress(smooth, PHASES.SCENE_EDIT);

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translate3d(${round(sceneT * 100, 3)}%, 0, 0)`;
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
      const t = clamp(mapRange(sceneT, clip.revealAt, clip.revealAt + 0.1, 0, 1));
      const eased = easeOutCubic(t);
      node.style.opacity = `${round(eased, 3)}`;
      // Klip wjeżdża od lewej i rozciąga się do pełnej długości.
      node.style.transform = `scaleX(${round(0.6 + eased * 0.4, 4)})`;
    }

    for (let i = 0; i < CUTS.length; i += 1) {
      const cut = CUTS[i];
      const node = cutRefs.current[i];
      if (cut === undefined || !node) continue;
      /**
       * Znacznik cięcia wyskakuje w chwili minięcia przez głowicę i wraca —
       * krótki impuls, nie trwała zmiana. To jest ten mikro-akcent, który
       * sprawia, że przewijanie ma rytm.
       */
      const distance = sceneT * 100 - cut;
      const pop = distance >= 0 ? clamp(1 - distance / 6) : 0;
      node.style.transform = `scaleY(${round(0.4 + pop * 0.8, 3)})`;
      node.style.opacity = `${round(0.25 + pop * 0.75, 3)}`;
    }

    for (let i = 0; i < WAVE_BARS; i += 1) {
      const node = barRefs.current[i];
      if (!node) continue;
      const barPos = (i / (WAVE_BARS - 1)) * 100;

      /**
       * Fala dźwięku: stały kształt materiału plus pulsowanie tam, gdzie
       * właśnie jest głowica.
       *
       * Kształt bazowy jest deterministyczny (złożenie kilku sinusów
       * o niewspółmiernych okresach), a nie losowy — dzięki temu fala
       * wygląda identycznie przy przewijaniu w obie strony. Losowa
       * migotałaby przy każdym przeliczeniu.
       */
      const shape =
        0.32 +
        Math.abs(Math.sin(i * 0.7)) * 0.3 +
        Math.abs(Math.sin(i * 0.23 + 1.1)) * 0.26;

      const nearHead = clamp(1 - Math.abs(barPos - sceneT * 100) / 14);
      const pulse = nearHead * (0.22 + Math.sin(elapsedS * 9 + i) * 0.1);

      node.style.transform = `scaleY(${round(shape + pulse, 3)})`;
      node.style.opacity = `${round(0.4 + nearHead * 0.6, 3)}`;
    }
  }, TICK_PRIORITY.RENDER);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6"
      /**
       * z-index nad warstwą ikon.
       *
       * Ikony krążą po elipsie przechodzącej przez górę i dół kadru, czyli
       * dokładnie tam, gdzie stoi nagłówek i oś czasu. Bez wymuszonej
       * kolejności kafelek potrafił wjechać NA tekst. Formacja ma krążyć
       * ZA treścią — wtedy przecięcie czyta się jako głębia, a nie jako
       * kolizja dwóch warstw.
       */
      style={{ opacity: 0, visibility: 'hidden', zIndex: 1 }}
    >
      <h2 className="text-ink text-center text-[clamp(1.9rem,5.2vw,3.1rem)]">Idealny montaż</h2>
      <p className="text-ink-muted mt-3 max-w-sm text-center text-sm leading-relaxed">
        Cięcia pod rytm platformy. Napisy, dźwięk i tempo dopięte na styk.
      </p>

      {/* --- OŚ CZASU --- */}
      <div
        className="mt-7 w-[min(392px,72vw)] rounded-2xl p-4"
        style={{
          background: 'rgba(23,18,31,0.94)',
          boxShadow: '0 18px 46px -20px rgba(23,18,31,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <div className="relative">
          {/* Ścieżki wideo */}
          {[0, 1].map((track) => (
            <div
              key={track}
              className="relative mb-1.5 h-7 overflow-hidden rounded-md"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              {CLIPS.map((clip, index) =>
                clip.track !== track ? null : (
                  <div
                    key={`${clip.start}-${clip.track}`}
                    ref={(node) => {
                      clipRefs.current[index] = node;
                    }}
                    className="absolute inset-y-[3px] origin-left rounded-[4px] will-change-transform"
                    style={{
                      left: `${clip.start}%`,
                      width: `${clip.width}%`,
                      background: `linear-gradient(160deg, ${clip.color}, ${clip.color}99)`,
                      opacity: 0,
                    }}
                  />
                ),
              )}
            </div>
          ))}

          {/* Ścieżka napisów — cieńsza, bo napisy to nie materiał, tylko warstwa. */}
          <div
            className="relative mb-1.5 flex h-3 items-center gap-1 overflow-hidden rounded-md px-1"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {[14, 9, 20, 11, 16].map((w, i) => (
              <div
                key={i}
                className="h-1 rounded-full"
                style={{ width: `${w}%`, background: 'rgba(255,255,255,0.35)' }}
              />
            ))}
          </div>

          {/* Ścieżka dźwięku z falą */}
          <div
            className="relative flex h-10 items-center justify-between gap-[2px] overflow-hidden rounded-md px-1.5"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {Array.from({ length: WAVE_BARS }, (_, i) => (
              <div
                key={i}
                ref={(node) => {
                  barRefs.current[i] = node;
                }}
                className="h-full flex-1 origin-center rounded-full will-change-transform"
                style={{ background: PALETTE.cyan, transform: 'scaleY(0.3)' }}
              />
            ))}
          </div>

          {/* Znaczniki cięć */}
          {CUTS.map((cut, i) => (
            <div
              key={cut}
              ref={(node) => {
                cutRefs.current[i] = node;
              }}
              className="pointer-events-none absolute top-0 bottom-0 w-px origin-center will-change-transform"
              style={{ left: `${cut}%`, background: 'rgba(255,255,255,0.5)', opacity: 0.25 }}
            />
          ))}

          {/* Głowica — jedyny element, który jedzie wprost ze scrollem. */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-[-6px] bottom-[-6px] left-0 w-[2px] will-change-transform"
            style={{
              background: PALETTE.magenta,
              boxShadow: `0 0 12px 2px ${PALETTE.magenta}`,
            }}
          >
            <div
              className="absolute -top-1 -left-[4px] h-2.5 w-2.5 rotate-45 rounded-[2px]"
              style={{ background: PALETTE.magenta }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
