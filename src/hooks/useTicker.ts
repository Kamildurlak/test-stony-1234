import { useEffect, useRef } from 'react';
import { ticker, TICK_PRIORITY, type TickCallback } from '../lib/ticker';

/**
 * Podpina callback pod współdzieloną pętlę rAF na czas życia komponentu.
 *
 * Callback jest trzymany w ref i wywoływany pośrednio, żeby subskrypcja NIE
 * odnawiała się przy każdym renderze. Bez tego każda zmiana stanu w komponencie
 * wypisywałaby i zapisywała subskrybenta z powrotem — a to wymusza ponowne
 * sortowanie listy i, co gorsza, może zgubić klatkę dokładnie w momencie,
 * w którym scena jest najbardziej ruchliwa.
 */
export const useTicker = (
  callback: TickCallback,
  priority: number = TICK_PRIORITY.SCENE,
): void => {
  const callbackRef = useRef<TickCallback>(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const stable: TickCallback = (deltaS, elapsedS) => callbackRef.current(deltaS, elapsedS);
    return ticker.subscribe(stable, priority);
  }, [priority]);
};
