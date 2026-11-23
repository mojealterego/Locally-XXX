# OMEGA Mobile Sovereign Runtime Ω — v1.0.0

Kompletna specyfikacja inżynieryjno-wdrożeniowa referencyjnego sterownika mobilnego, dokumentacja PDF/DOCX/Markdown, rejestr wymagań, schematy danych i uruchomiony kod kontrolny Python.

```
python3 -m unittest reference.test_policy -v
sha256sum -c SHA256SUMS.txt
```

**Nie jest to zbudowana aplikacja Android ani osiągnięte ASI.** Python jest wykonywalnym walidatorem zachowania reguł, a nie autorytatywnym produkcyjnym PDP. Produkcyjne poświadczenia/granty muszą być weryfikowane kryptograficznie, co nie jest zaimplementowane. Specyfikację należy przekazać do implementacji po sprawdzeniu istniejącego kodu na `main`.

Pakiet nie zawiera mechanizmów ukrytego obciążania cudzych urządzeń, obejścia ochron systemowych ani realizowania płatności bez nadzoru.
