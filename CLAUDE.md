# Hero scroll experience — notatki projektowe

Sekcja hero sterowana scrollem: pudełko podskakuje, otwiera się, wyrzuca cztery
logotypy platform na orbitę, a w środku pierścienia pojawiają się kolejne sceny
treści.

## Ustalenia z klientem — nie zmieniać bez pytania

**Logotypy.** Pliki w `src/assets/logos/` to zestaw dostarczony i zatwierdzony
przez klienta (TikTok, Instagram, YouTube, Facebook — jednościeżkowe znaki
w `viewBox 0 0 24 24`, bez teł). **Nie podmieniać ich na inne.** Kształty
w `src/components/icons/glyphs.tsx` są przepisane z tych plików co do punktu;
kolory pobrane wprost z atrybutów `fill`.

Jedyne odstępstwo: TikTok ma w pliku `fill="#000000"`, czyli wariant na jasne
tło. Na ciemnym kafelku znak byłby niewidoczny, więc renderujemy go w bieli —
to drugi oficjalny wariant tego znaku. Uzasadnienie stoi przy definicji
w `src/config/logos.ts`.

**Paleta.** Jasne tło z rozmytymi plamami koloru (zmiana kierunku na prośbę
klienta — pierwotnie było `#07070B`). Konsekwencja: na jasnym tle nie działa
glow, więc wszędzie, gdzie brief mówi „poświata", realizujemy to kolorowym
miękkim cieniem. Szczegóły przy `GLOW` w `src/config/scene.ts`.

**Typografia.** Cabinet Grotesk (nagłówki) + Inter (tekst). Cabinet hostuje
Fontshare; w jednoplikowym podglądzie (`scripts/build-preview.mjs`) podmieniamy
go na Archivo, bo polityka CSP podglądu nie wpuszcza tego hosta.

## Architektura

- `src/config/scene.ts` — **jedyne źródło prawdy** dla progów czasowych, palety
  i fizyki. Jeśli szukasz liczby rozsianej po komponentach, to znaczy, że ktoś
  złamał tę zasadę.
- `src/lib/ticker.ts` — jedna pętla `requestAnimationFrame` dla całej sceny,
  z priorytetami wymuszającymi kolejność scroll → scena → render.
- `src/lib/*Physics.ts` — czyste funkcje `(czas, progress) → stan`. Bez DOM-u,
  bez Reacta. Warstwy renderujące tylko je konsumują.
- `src/lib/sceneScale.ts` — **jeden** współczynnik skali dla orbity i grafiki
  w jej środku. To on gwarantuje zachowanie odstępów na każdym ekranie.

React montuje strukturę raz; animacja żyje wyłącznie w pętli rAF i zapisuje
transformy wprost do stylów. Progress scrolla siedzi w mutowalnym ref, nigdy
w `useState` — inaczej każda klatka wywoływałaby przerenderowanie drzewa.

## Lekcja wydajnościowa, która powtórzyła się trzy razy

W scenie 3D **drogie jest wszystko, co zmienia KSZTAŁT** elementu, tanie jest
tylko to, co zmienia jego **położenie**. Zmierzone przypadki:

| co | koszt |
|---|---|
| `filter: blur(60px)` na plamach tła | 13 fps zamiast 60 |
| `clip-path` na taśmie w `preserve-3d` | 30 fps zamiast 60 |
| `box-shadow` przepisywany co klatkę | 29 fps zamiast 60 |

Za każdym razem rozwiązaniem było przeniesienie kształtu do statycznego zasobu
(gradient, obrazek SVG, osobna warstwa) i animowanie wyłącznie `transform`
albo `opacity`.

**Nie ufaj bezwzględnym wartościom fps mierzonym w kontenerze** — zmieniają się
między restartami maszyny. Miarodajne jest wyłącznie porównanie w obrębie
jednego przebiegu.

## Weryfikacja geometrii

Wymóg klienta: ikony nigdy nie mogą się stykać ani nachodzić na grafikę
w środku. To jest sprawdzane POMIAREM realnych prostokątów w przeglądarce,
nie na oko — elementy `[data-icon-tile]` i `[data-timeline-card]` są uchwytami
dla tego testu. Uwaga: najciaśniejszym miejscem jest NAROŻNIK karty, nie jej
krawędź; liczenie odległości prostopadłych daje wynik zawyżony o kilkadziesiąt
procent.

## Polecenia

```bash
npm run dev          # serwer deweloperski
npm run build        # build produkcyjny
npx tsc -b           # sam typecheck
node scripts/build-preview.mjs out.html   # jednoplikowy podgląd dla klienta
```
