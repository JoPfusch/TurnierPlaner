# Turnierplaner

Turnierplaner mit Gruppenphase und live berechneter KO-Phase – in erster Linie
für Beerpong-Turniere, funktioniert aber für jedes Spiel nach dem Prinzip
„höherer Wert gewinnt“.

- **Beamer-Ansicht** (`/`): Vollbild mit Tabellen, KO-Baum und den aktuellen
  Spielen je Tisch. Aktualisiert sich von selbst.
- **Verwaltung** (`/admin`): Teams, Format, Ergebnisse – am Laptop oder per
  QR-Code am Handy, parallel zur Beamer-Ansicht.
- **Team-Ansicht** (`/team`): Übersicht für alle am Handy. Mit dem QR-Code des
  eigenen Teams zusätzlich: nächstes Spiel, Ergebnis melden, Meldung des
  Gegners bestätigen.

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
| Teams      | `http://<IP-des-Laptops>:3000/team`       |

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

### Ergebnisse von den Teams melden lassen

1. Im Reiter **Teams** „QR-Codes anzeigen“ – einzeln groß zeigen oder alle
   drucken. Eine Person pro Team scannt den Code ihres Teams; das Handy ist
   damit dem Team zugeordnet (mehrere Handys pro Team sind möglich).
2. Nach einem Spiel meldet ein Team: Sieger + Restbecher.
3. Die Meldung erscheint sofort als **unbestätigt** (Beamer, Tabellen,
   KO-Baum), zählt aber noch nicht. Der Tisch gilt als frei, das nächste Spiel
   rückt nach.
4. Gültig wird sie je nach Einstellung (Reiter **Format**):

   | Einstellung                         | Meldung gilt, wenn …                                              |
   | ----------------------------------- | ----------------------------------------------------------------- |
   | Gegner bestätigt                    | der Gegner „Stimmt“ tippt (oder dasselbe Ergebnis meldet)          |
   | Gegner bestätigt, sonst automatisch | wie oben, sonst von selbst nach der eingestellten Minutenzahl      |
   | Turnierleitung bestätigt immer      | die Turnierleitung sie im Reiter **Spiele** übernimmt              |

5. Tippt der Gegner „Stimmt nicht“ (oder meldet etwas anderes), ist die Meldung
   **strittig** und wird nie automatisch übernommen – die Turnierleitung
   entscheidet. Sie kann ohnehin jede Meldung übernehmen, verwerfen oder das
   Ergebnis direkt eintragen.

Der QR-Code ist der Schlüssel des Teams: Wer ihn hat, kann für das Team
melden. „Neues Turnier“ macht alle alten Codes ungültig.

**Als App ablegen:** In der Team-Ansicht über das Browser-Menü „Zum
Startbildschirm hinzufügen“ (Android/Chrome) bzw. Teilen → „Zum
Home-Bildschirm“ (iPhone/Safari). Die Team-Zuordnung bleibt erhalten. Eine
echte Installation mit eigenem Fenster bietet Android nur über HTTPS an; im
lokalen Netz per HTTP entsteht dort eine Verknüpfung, die im Browser öffnet.

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
| `PUBLIC_URL`| –         | Adresse für Links und QR-Codes statt der IP (siehe unten)    |

Beispiel: `ADMIN_PIN=4711 npm start`. Ohne PIN kann jeder im Netzwerk, der die
Adresse kennt, Ergebnisse ändern. Die PIN wird unverschlüsselt (HTTP)
übertragen – sie schützt vor Spaßvögeln im WLAN, nicht vor Angreifern.

**Sobald Gäste im WLAN sind, unbedingt `ADMIN_PIN` setzen** – sonst kann jeder
`/admin` öffnen.

### Name statt IP-Adresse

Die Teams scannen QR-Codes, tippen die Adresse also nie ab. Wer trotzdem einen
Namen möchte, braucht keine eigene Domain:

- **Rechnername im Netz**: Windows, macOS und die meisten Linux-Systeme sind
  unter `http://<rechnername>.local:3000` erreichbar (mDNS). An einer
  FRITZ!Box zusätzlich unter `http://<rechnername>.fritz.box:3000`.
- **Eigener Name im Router**: Manche Router erlauben einen frei wählbaren
  DNS-Eintrag (z. B. `turnier.lan`) für die IP des Laptops.

Den Namen dann beim Start mitgeben, damit die QR-Codes ihn verwenden:

```bash
PUBLIC_URL=http://mein-laptop.fritz.box:3000 ADMIN_PIN=4711 npm start
```

Vorher mit einem Handy testen: `.local` wird nicht von jedem Android-Gerät
aufgelöst. Im Zweifel ohne `PUBLIC_URL` starten – die IP im QR-Code
funktioniert immer. Dem Laptop im Router eine feste IP geben, damit gedruckte
Codes gültig bleiben.

**Gast-WLAN:** Viele Router trennen Geräte im Gastnetz voneinander
(„Geräte dürfen untereinander kommunizieren“ / Client-Isolation). Der Laptop
muss im selben Netz wie die Handys sein und diese Trennung muss aus sein,
sonst erreichen die Handys den Server nicht.

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
