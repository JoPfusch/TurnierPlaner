# Turnierplaner

Turnierplaner mit Gruppenphase und live berechneter KO-Phase – in erster Linie
für Beerpong-Turniere, funktioniert aber für jedes Spiel nach dem Prinzip
„höherer Wert gewinnt“.

- **Beamer-Ansicht** (`/`): Vollbild mit Tabellen, KO-Baum und den aktuellen
  Spielen je Tisch. Aktualisiert sich von selbst.
- **Verwaltung** (`/admin`): Teams, Format, Ergebnisse – am Laptop oder per
  QR-Code am Handy, parallel zur Beamer-Ansicht.

## Schnellstart

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm run build
npm start
```

Danach:

| Zweck      | Adresse                                   |
| ---------- | ----------------------------------------- |
| Beamer     | `http://localhost:3000/`                  |
| Verwaltung | `http://localhost:3000/admin`             |
| Handy      | `http://<IP-des-Laptops>:3000/admin`      |

Die Netzwerkadresse gibt der Server beim Start aus; im Reiter **System** steht
sie zusätzlich als QR-Code. Alle Geräte müssen im selben WLAN sein.

## Ablauf eines Turniers

1. **Teams** eintragen (einzeln oder als Liste, ein Team pro Zeile).
2. **Format** festlegen: Tische, Größe der KO-Runde, Gruppenanzahl, Wertung.
   Die Tabelle „Möglichkeiten“ zeigt für die aktuelle Teamanzahl jede
   Gruppenanzahl mit Spielanzahl, Dauer und nötigen Zusatzkriterien.
3. **Auslosen** – Gruppen, Spielplan und Tische werden zufällig erzeugt.
4. **Spiele**: Sieger antippen, dann die Zahl der übrig gebliebenen Becher.
   Tabellen und KO-Baum rechnen sofort neu, der Beamer zieht mit.
5. Sind alle Gruppenspiele eingetragen, steht die KO-Runde fest und ihre
   Ergebnisse können eingetragen werden – bis zum Finale.

### Regeln der Berechnung

- **Ergebnis** = Restbecher des Siegers (der Verlierer hat 0).
- **Tabelle**: Die Kriterien gelten in der eingestellten Reihenfolge; das
  nächste zählt nur bei Gleichstand. Verfügbar: Punkte, Becherdifferenz,
  direkter Vergleich, eigene Restbecher, Anzahl Siege, wenigste Gegenbecher.
  Als letztes entscheidet immer ein bei der Auslosung gezogenes Los (in der
  Tabelle mit „Los“ markiert).
- **KO-Plätze**: Bei `K` Plätzen und `G` Gruppen kommen die besten `K ÷ G`
  jeder Gruppe direkt weiter; der Rest geht an die Besten des nächsten Platzes
  im Vergleich über alle Gruppen (z. B. 20 Teams, 5 Gruppen, Viertelfinale:
  5 Gruppensieger + 3 beste Zweite).
- **Vergleich über Gruppen**: ohne direkten Vergleich; bei ungleich großen
  Gruppen wird pro Spiel gerechnet (Quotient).
- **Setzliste**: erst alle Gruppensieger, dann alle Zweiten usw. Im KO-Baum
  spielt der Beste gegen den Schlechtesten; Duelle zweier Teams derselben
  Gruppe in der ersten KO-Runde werden nach Möglichkeit vermieden.
- **KO-Größe** ist frei: Ist sie keine Zweierpotenz (z. B. 6), bekommen die
  bestplatzierten Teams ein Freilos.
- **Prognose**: Während der Gruppenphase zeigt der KO-Baum gestrichelt, wer
  nach aktuellem Stand weiterkäme.

### Korrekturen

- Ergebnisse lassen sich jederzeit überschreiben oder löschen.
- Ändert sich in der KO-Phase ein Sieger, werden die davon abhängigen späteren
  Spiele automatisch geleert.
- Würde eine Korrektur in der Gruppenphase die KO-Teilnehmer ändern, obwohl
  dort schon Ergebnisse stehen, wird sie abgelehnt – erst „KO-Phase
  zurücksetzen“ (Reiter System).
- Gruppen- und Tischanzahl stehen nach der Auslosung fest („Auslosung
  verwerfen“ löscht Spielplan und Ergebnisse, die Teams bleiben).

## Beamer-Ansicht

| Taste / Parameter | Wirkung                                        |
| ----------------- | ---------------------------------------------- |
| `F`               | Vollbild                                       |
| `←` / `→`         | Seite wechseln                                 |
| Leertaste         | automatischen Wechsel pausieren                |
| `?view=groups`    | nur Tabellen                                   |
| `?view=bracket`   | nur KO-Baum                                    |
| `?rotate=20`      | Sekunden pro Seite (Standard 15)               |

In der Gruppenphase wechselt die Ansicht zwischen Tabellen und KO-Prognose,
in der KO-Phase bleibt der Baum stehen, am Ende erscheint das Siegerbild.

## Konfiguration

Umgebungsvariablen des Servers:

| Variable    | Standard  | Bedeutung                                                    |
| ----------- | --------- | ------------------------------------------------------------ |
| `PORT`      | `3000`    | Port                                                         |
| `HOST`      | `0.0.0.0` | Netzwerkschnittstelle                                        |
| `DATA_DIR`  | `./data`  | Ablage der Datei `tournament.json`                           |
| `ADMIN_PIN` | –         | Wenn gesetzt, sind Änderungen nur mit dieser PIN möglich     |

Beispiel: `ADMIN_PIN=4711 npm start`. Ohne PIN kann jeder im Netzwerk, der die
Adresse kennt, Ergebnisse ändern. Die PIN wird unverschlüsselt (HTTP)
übertragen – sie schützt vor Spaßvögeln im WLAN, nicht vor Angreifern.

Der Stand wird nach jeder Änderung gespeichert und übersteht einen Neustart.
Zusätzlich gibt es im Reiter **System** eine Sicherung als Datei.

## Entwicklung

```bash
npm run dev        # Server (:3000) + Vite mit Hot Reload (:5173)
npm test           # Unit- und API-Tests (Vitest)
npm run typecheck  # TypeScript für Server und Client
npm run build      # Produktions-Build nach dist/
```

Im Entwicklungsmodus die Oberfläche über `http://localhost:5173` öffnen.

Aufbau und Entwurfsentscheidungen: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
