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

**Paleta.** Jasne, CHŁODNE tło (`#F1F3F9` → `#E7EAF4`), nigdy czysta biel.
Sześć dużych, miękkich świateł w barwach social mediów plus trzy świetlne
fale. Kluczowe rozróżnienie: to są ŹRÓDŁA ŚWIATŁA o niskim kryciu, a nie
kolorowe plamy — plama jest widoczna, światło jest odczuwalne.

Konsekwencja jasnego tła: nie działa na nim glow, więc wszędzie, gdzie brief
mówi „poświata", realizujemy to kolorowym miękkim cieniem (`GLOW` w scene.ts).

Cienie są CHŁODNE i granatowe, nie czarne — realny cień ma barwę światła
otoczenia, a scenę oświetlają zimne plamy.

**Materiał pudełka — dwie odwrócone decyzje.** Klient najpierw dostał karton
z anizotropowym włóknem papieru i przybrudzeniem (to one zamieniały płaską
bryłę w karton), a potem poprosił o powierzchnię idealnie czystą, bez ziarna
i szumu. **Nie dodawać z powrotem tekstury.** Realizm niesie teraz fazowanie
krawędzi (`CARDBOARD.bevelLight`/`bevelDark`) i kolorowe światło konturowe
odbite od tła (`RIM_LIGHT`).

**Taśma — USUNIĘTA na wyraźną prośbę klienta.** Warto wiedzieć, co przy okazji
zniknęło, bo to nie był ozdobnik: taśma pękała PRZED klapami i dzięki temu
wystrzał miał przyczynę. Zastąpił ją `SEAM_LIGHT` — wąska ciepła linia w szwie,
narastająca w zamachu i gasnąca w chwili, gdy rusza pierwsza klapa.
**Nie przywracać taśmy w żadnej formie.**

**Styl ilustracyjny (referencja od klienta: rysunek otwartego kartonu).**
Klapy nie są prostokątami — wolna krawędź ma płytki łuk (`FLAP_SHAPE`),
a po powierzchni idzie ukośne pasmo połysku. Klapa ma DWIE powierzchnie:
otwarta na −208° przewala się przez pion, więc widz ogląda jej SPÓD
(`CARDBOARD.inner*`), a nie wierzch. Wcześniej była jedną płaszczyzną
i pokazywała własny wierzch w lustrzanym odbiciu.

**Zaokrąglenie narożników a fazki.** Promień ścian (`BOX.cornerRadiusPx`) mógł
urosnąć z 5 na 9 px dopiero wtedy, gdy cztery pionowe krawędzie dostały
ścięcia pod 45° (`BOX.edgeFilletPx`). Wcześniej każde zaokrąglenie rozsuwało
płaskie prostokąty ścian i w narożnikach prześwitywało tło.

**Pułapka przy fazkach — kosztowała pół iteracji.** `rotateY(45deg)
translateZ(d)` ustawia element w odległości `d` wzdłuż normalnej, czyli
w STOPIE PROSTOPADŁEJ ze środka bryły. To NIE jest środek ścięcia — te punkty
pokrywają się wyłącznie wtedy, gdy rzut pudełka jest kwadratem. Przy 230 × 172
rozjeżdżały się o 20 px, czyli więcej niż szerokość fazki, i paski lądowały na
środku ścian jak doklejone listwy. Środek liczymy więc wprost, we
współrzędnych bryły (`translate3d(mx, 0, mz) rotateY(θ)`).

**Ruch pudełka — druga odwrócona decyzja.** Pierwotny brief żądał wyraźnego
PODSKOKU z fizyką: parabola, squash and stretch, cień reagujący na wysokość.
Klient poprosił potem o ruch „bardzo subtelny", bez agresywnych odbić.
Zostało delikatne unoszenie (`FLOAT`). **Nie przywracać podskoku bez pytania.**
Świadomie straciliśmy squash and stretch, czyli najmocniejszy sygnał masy —
ciężar niosą teraz światło, cień kontaktowy i proporcje.

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

## Cienie: dlaczego bywa, że są, a nie widać

Dwie osobne pułapki, obie zdiagnozowane POMIAREM, bo obie wyglądają identycznie
(„cienia nie ma") i obie kuszą tym samym błędnym odruchem — podkręceniem krycia.

1. **Elipsa wyśrodkowana na linii styku oddaje widzowi wyłącznie swoje boki**,
   bo ciemny środek zasłania sam przedmiot. Zmierzone: najciemniejszy punkt
   wypadał 11 px pod najniższym pikselem bryły. Lekarstwem jest zsunięcie plamy
   w dół (`SHADOW_DROP_PX`), nie zwiększanie krycia.
2. **Zamiana podskoku na unoszenie zostawiła nieaktualną fizykę.** `heightRatio`
   liczyło się z `Math.abs(height)`, co było poprawne dla paraboli wychodzącej
   z zera, ale nie dla sinusoidy wahającej się symetrycznie: wartość bezwzględna
   dawała 1 zarówno na szczycie, jak i na DNIE ruchu, więc cień kontaktowy gasł
   dokładnie wtedy, gdy ma być najmocniejszy (zmierzone krycie: 0.001).

Stąd ogólniejsza reguła: **po odwróceniu decyzji o ruchu trzeba przejść wszystkie
wartości, które od tego ruchu zależały.** Zakresy `SHADOW` i `CONTACT_SHADOW`
pochodziły z czasów, gdy bryła wznosiła się o pół własnej wysokości; przy
amplitudzie 6 px dawały pulsowanie cienia od 0.40 do 0.94 w jednym cyklu.

## Warstwy efektów

Kolejność w drzewie `HeroScroll` JEST kolejnością rysowania i część z niej
to nie styl, tylko mechanika:

1. `Ambience` — dryfujące punkty tła. **Jedyna warstwa animowana przez CSS,
   nie przez ticker.** Jej ruch nie zależy od niczego w scenie, a animacja
   CSS na `transform`/`opacity` idzie w całości przez kompozytor, więc
   kosztuje zero pracy w klatce.
2. `OrbitTrails` — pierścień toru i smugi wiatru. Pod ikonami, żeby smuga
   wychodziła spod kafelka. Cały efekt to JEDEN statyczny SVG obracany
   jednym transformem — jeden zapis na klatkę niezależnie od liczby segmentów.
3. `BrandIcons` — **musi być przed `CssBox`**, żeby przednia ściana kartonu
   zasłaniała ikony, dopóki są w środku.
4. `CssBox`
5. `BurstParticles` — po pudełku, bo to błysk w powietrzu, nie przedmiot.
6. `SceneEdit` — nad wszystkim, pierścień krąży za treścią.

Kąt obiegu liczy JEDNA funkcja (`computeOrbitDeg` w `lib/iconPhysics.ts`),
używana i przez ikony, i przez smugi. Gdyby każdy liczył go po swojemu,
rozbieżność zaokrągleń odsunęłaby smugi od ikon.

## Weryfikacja geometrii

Wymóg klienta: ikony nigdy nie mogą się stykać ani nachodzić na grafikę
w środku. To jest sprawdzane POMIAREM realnych prostokątów w przeglądarce,
nie na oko — elementy `[data-icon-tile]` i `[data-timeline-card]` są uchwytami
dla tego testu. Uwaga: najciaśniejszym miejscem jest NAROŻNIK karty, nie jej
krawędź; liczenie odległości prostopadłych daje wynik zawyżony o kilkadziesiąt
procent.

Przy zmianie wielkości kafelka trzeba przeskalować RAZEM z nim: promień
orbity, `SCENE_DESIGN` w `lib/sceneScale.ts` oraz `launchSpreadPx`.
To ostatnie łatwo przeoczyć — rozsunięcie mniejsze od szerokości kafelka
nie rozdziela ikon przy wyskoku, tylko przesuwa stertę.

## Polecenia

```bash
npm run dev          # serwer deweloperski
npm run build        # build produkcyjny
npx tsc -b           # sam typecheck
node scripts/build-preview.mjs out.html   # jednoplikowy podgląd dla klienta
```
