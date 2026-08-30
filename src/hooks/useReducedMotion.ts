import { useEffect, useState } from 'react';

/**
 * Śledzi preferencję `prefers-reduced-motion` i reaguje na jej zmianę w locie
 * (użytkownik może przełączyć ustawienie systemowe bez przeładowania strony —
 * rzadkie, ale to jest dokładnie ta grupa użytkowników, dla której nie warto
 * robić wyjątków).
 *
 * Wartość początkowa jest czytana synchronicznie w inicjalizatorze useState,
 * a nie w useEffect. To celowe: gdyby startowała od `false`, użytkownik
 * z włączoną redukcją ruchu zobaczyłby jedną klatkę pełnej animacji, zanim
 * efekt zdążyłby ją wyłączyć. Jeden błysk wystarczy, żeby wywołać dokładnie
 * ten dyskomfort, przed którym ta preferencja ma chronić.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

const readPreference = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;

export const useReducedMotion = (): boolean => {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(readPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent): void => setPrefersReduced(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return prefersReduced;
};
