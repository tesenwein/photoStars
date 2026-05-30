# PhotoStars – Projekt-Briefing für Claude Code

## Ziel

Eine lokale Electron-App im Stil von FilmRecipe. Sie liest einen Ordner mit Fotos ein, bewertet jedes Bild nach Schärfe, Belichtung, offenen Augen und fotografischer Qualität, leitet daraus eine Sterne-Empfehlung ab und schreibt diese auf Bestätigung als XMP-Rating in die Dateien. Der Mensch behält immer das letzte Wort.

Unterstützte Formate: RAW (erstklassig), JPEG und HEIC.

## Architektur

- **Electron** mit Hauptprozess für Dateizugriff und Analyse, Renderer für die Oberfläche. Frontend-Basis wie FilmRecipe wiederverwenden.
- **Analyse hybrid:**
  - Schärfe und Belichtung in Node mit `sharp`.
  - Gesichter, Augen und Ästhetik über ein Python-Sidecar mit OpenCV, MediaPipe und einem ONNX-Ästhetikmodell. Start als Subprozess, Kommunikation über JSON.
- **Metadaten** ausschliesslich über `exiftool` als gebündeltes Binary. Originaldateien werden nie destruktiv verändert.

## RAW-Behandlung (zentral)

Anzeigen, Analysieren und Schreiben gehen bei RAW unterschiedliche Wege.

- **Anzeigen und Analysieren:** Nicht das rohe Sensorformat entwickeln. Stattdessen die eingebettete Vorschau-JPEG mit `exiftool` extrahieren und darauf alle Analysen laufen lassen. Falls die eingebettete Vorschau zu klein ist, später `libraw` oder `dcraw` nachrüsten.
- **Orientierung:** RAW-Vorschauen tragen die Drehung oft nur als Metadatum. Beim Erzeugen der Vorschau die Orientierung anwenden, sonst werden Bilder gedreht angezeigt.
- **Schreiben:** Verzweigt nach Dateityp:
  - **RAW:** immer eine XMP-Sidecar mit gleichem Namen und Endung `.xmp` schreiben (Lightroom-Weg, verlustfrei).
  - **JPEG und HEIC:** Rating direkt in die Datei schreiben.

## Datenmodell

Pro Bild ein Objekt mit:

- Pfad
- Dateityp (raw / jpeg / heic)
- Vorschaupfad
- Schärfescore
- Belichtungsscore (plus Hinweis: überbelichtet / unterbelichtet)
- Augenstatus (alle Augen offen ja/nein bei mehreren Personen)
- Ästhetikscore
- abgeleitete Sternezahl
- manuell überschriebene Sternezahl
- Status, ob bereits geschrieben

Liste wird im Hauptprozess gehalten und an den Renderer gespiegelt.

## Analysepipeline

1. **Typerkennung und Vorschau:** Pro Datei den Typ erkennen. Bei RAW die eingebettete Vorschau ziehen, Orientierung anwenden.
2. **Schärfe:** Varianz des Laplace-Filters, idealerweise nur in der Gesichtsregion wenn ein Gesicht vorhanden ist, sonst im ganzen Bild. Höhere Varianz bedeutet schärfer.
3. **Belichtung:** Luminanz-Histogramm. Prüfen auf ausgefressene Lichter, abgesoffene Tiefen und Gesamthelligkeit. Score plus Hinweis.
4. **Augen:** MediaPipe Face Mesh und Eye Aspect Ratio pro erkanntem Gesicht. Bei mehreren Personen vermerken, ob alle Augen offen sind.
5. **Ästhetik:** NIMA-ähnliches ONNX-Modell, Score eins bis zehn. Läuft nur auf Bildern, die die harten Filter überleben.
6. **Sterne-Empfehlung:** Gewichtete Kombination. Harte Ausschlusskriterien (sehr unscharf, geschlossene Augen) deckeln die Sterne nach oben. Der Ästhetikscore bestimmt die Feinabstufung. Gewichte in eine Konfigurationsdatei, ohne Codeänderung anpassbar.

## Oberfläche

- Ordnerauswahl
- Bildraster mit Vorschau, den vier Teilscores als kleine Indikatoren und vorgeschlagener Sternezahl
- Klick auf ein Bild öffnet grössere Ansicht mit Details und manueller Sterne-Eingabe
- Filter und Sortierung nach Score
- Knopf zum Schreiben der Ratings, für Auswahl oder alle

## Ablauf in der App

Ordner wählen, Bilder einlesen und Vorschauen erzeugen, harte Filter rechnen, Ästhetik auf den brauchbaren Bildern, Sterne ableiten, im Raster anzeigen, manuell korrigieren, auf Knopfdruck schreiben.

## Phasenplan

**Phase 1 – Grundgerüst.** Electron-Projekt aufsetzen, Fenster, Ordnerauswahl, Bilder einlesen inklusive RAW-Vorschau-Extraktion, Vorschauen mit korrekter Orientierung, Anzeige im Raster ohne Bewertung.

**Phase 2 – Harte Filter.** Schärfe und Belichtung in Node berechnen und anzeigen.

**Phase 3 – Metadaten schreiben.** exiftool einbinden, Schreiblogik mit Verzweigung RAW-Sidecar versus direkt, manuelles Setzen der Sterne, Schreiben auf Knopfdruck. Ab hier ist die App nützlich.

**Phase 4 – Python-Sidecar.** Augen über MediaPipe, JSON-Kommunikation, Integration in die Pipeline.

**Phase 5 – Ästhetik.** ONNX-Modell laden, Score berechnen, in die Sterne-Empfehlung einfliessen lassen.

**Phase 6 – Feinschliff.** Konfigurierbare Gewichte, Filter und Sortierung, Backup-Option, Bündelung von exiftool und Python für die Auslieferung.

## Stolpersteine

- **Bündelung:** exiftool und Python müssen für eine fertige App mitgeliefert werden, sonst läuft sie nur auf dem Entwicklungsrechner. Unangenehmster Teil, bewusst in Phase 6.
- **Performance:** Vorschauen für grosse Ordner asynchron und in Stapeln erzeugen, sonst friert die Oberfläche ein.
- **Kalibrierung:** Schwellenwerte für Schärfe und Belichtung an echten Bildern kalibrieren. Früh einen kleinen Testordner mit von Hand bewerteten Bildern anlegen, inklusive RAW.
- **RAW-Vorschau-Qualität:** Falls eingebettete Vorschauen einzelner Kameras zu klein sind, libraw als Fallback einplanen.