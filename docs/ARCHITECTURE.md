# Architektur

## Überblick

```
Browser (Beamer)  ─┐                         ┌─ data/tournament.json
Browser (Laptop)  ─┼─ HTTP + SSE ─ Node.js ──┤
Browser (Handy)   ─┘               (Express) └─ dist/client (statische Dateien)
```

Ein Node-Prozess hält genau ein Turnier. Clients ändern es über Befehle
(`POST /api/commands`) und erhalten jeden neuen Stand per Server-Sent Events
(`GET /api/events`).

## Verzeichnisse

```
src/
  shared/    Fachlogik – rein funktional, ohne Node- oder Browser-APIs
  server/    HTTP-API, Persistenz, Live-Verteilung
  client/    React-Oberfläche (Beamer + Verwaltung)
tests/       Vitest: Fachlogik und API
docs/        diese Datei
```

### `src/shared` – Fachlogik

| Datei              | Aufgabe                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `types.ts`         | Datenmodell des gespeicherten Zustands                                  |
| `defaults.ts`      | Standardwerte, Grenzen, Beschriftungen der Kriterien                    |
| `commands.ts`      | Zod-Schemas aller Befehle und des Zustands (Validierung an der Grenze)  |
| `reducer.ts`       | `applyCommand(state, command)` – einzige Stelle, die Zustand verändert  |
| `random.ts`        | Zufallsgenerator mit Startwert (reproduzierbare Auslosung)              |
| `schedule.ts`      | Auslosung, Jeder-gegen-jeden, Verteilung auf Runden und Tische          |
| `standings.ts`     | Statistik und Rangfolge nach gewichteten Kriterien                      |
| `qualification.ts` | Wer kommt weiter, Setzliste, Vergleich über Gruppen                     |
| `knockout.ts`      | KO-Baum: Setzpositionen, Freilose, Weiterkommen, Zeitplan               |
| `format.ts`        | Formatplaner: Spielanzahl, Dauer, Hinweise, empfohlene Kriterien        |
| `view.ts`          | `deriveView(state)` – Lesemodell für die Oberfläche                     |

### `src/server`

| Datei        | Aufgabe                                                        |
| ------------ | -------------------------------------------------------------- |
| `index.ts`   | Start, sauberes Beenden                                        |
| `config.ts`  | Umgebungsvariablen                                             |
| `app.ts`     | Routen, PIN-Prüfung, Fehlerabbildung, Auslieferung des Clients |
| `store.ts`   | Zustand im Speicher, atomares Schreiben, Benachrichtigung      |
| `network.ts` | LAN-Adressen für Links und QR-Codes                            |

### `src/client`

| Pfad                     | Aufgabe                                               |
| ------------------------ | ----------------------------------------------------- |
| `App.tsx`                | Weiche: `/` Beamer, `/admin` Verwaltung               |
| `useTournament.ts`       | SSE-Anbindung, leitet das Lesemodell ab               |
| `api.ts`                 | Befehle senden, PIN-Abfrage, Import                   |
| `display/DisplayApp.tsx` | Vollbild: Seitenwechsel, Skalierung, Tisch-Leiste     |
| `admin/*Tab.tsx`         | je ein Reiter der Verwaltung                          |
| `components/`            | Gruppentabelle und KO-Baum (von beiden genutzt)       |
| `styles/`                | `base.css` (gemeinsam), `display.css`, `admin.css`    |

## Entwurfsentscheidungen

### Nur Fakten speichern, alles andere ableiten

Gespeichert werden Teams, Einstellungen, die Auslosung und die eingetragenen
Ergebnisse. Tabellen, Qualifikanten, KO-Baum und „jetzt am Tisch“ berechnet
`deriveView` bei jeder Änderung neu. Folgen:

- Die KO-Phase ist ohne Zusatzaufwand „live“ – auch als Prognose während der
  Gruppenphase.
- Korrekturen sind unkritisch: Es gibt keinen abgeleiteten Zustand, der
  veralten könnte.
- Server und Clients nutzen dieselbe Funktion und können sich nicht
  widersprechen.

KO-Ergebnisse hängen an Positionen im Baum (`ko-<Runde>-<Index>`), nicht an
Teams. Deshalb schützt der Reducer sie: Ändert sich ein Sieger, werden
abhängige Spiele geleert; ändert eine Gruppenkorrektur die Setzliste, wird sie
abgelehnt, solange KO-Ergebnisse existieren.

### Befehle statt freier Zustandsänderung

Jede Änderung ist ein validierter Befehl, den der reine Reducer anwendet.
Regelverstöße werfen einen `DomainError` mit deutscher Meldung, die API
antwortet mit 400 und die Verwaltung zeigt den Text an. Der Reducer ist ohne
Server testbar; der Zufall kommt als Startwert im Befehl.

### Server-Sent Events statt WebSocket

Die Live-Daten fließen nur vom Server zum Client, Änderungen sind normale
HTTP-Aufrufe. SSE braucht keine Zusatzbibliothek und der Browser verbindet
sich nach WLAN-Aussetzern oder einem Server-Neustart selbst neu. Gesendet wird
immer der vollständige Zustand (wenige Kilobyte) – kein Delta-Protokoll, keine
verpassten Nachrichten.

### JSON-Datei statt Datenbank

Ein Turnier, ein Prozess, wenige Kilobyte: Eine Datei genügt und lässt sich
kopieren oder von Hand ansehen. Geschrieben wird atomar (temporäre Datei,
dann umbenennen) und in Reihenfolge. Eine ungültige Datei wird beim Start
beiseitegelegt, nicht überschrieben.

### Spielplan

Je Gruppe entstehen die Paarungen mit der Kreismethode. Die Runden füllt ein
Greedy-Verfahren: reihum aus jeder Gruppe das früheste Spiel, dessen Teams in
dieser Runde noch frei sind, bis alle Tische belegt sind. Die Tische rotieren,
damit keine Gruppe immer am selben Ort spielt. Der Formatplaner lässt
denselben Algorithmus mit Platzhaltern laufen – Runden und Dauer sind daher
exakt, nicht geschätzt (Dauer = Runden × Minuten pro Spiel + Pause).

In der KO-Phase füllt jede Runde die Tische; das Spiel um Platz 3 und das
Finale bekommen je eine eigene Runde.

### Rangfolge

`rankTeams` verfeinert schrittweise: Alle Teams starten in einem Topf, jedes
Kriterium teilt jeden Topf noch gleichstehender Teams weiter auf. Der direkte
Vergleich wird innerhalb eines Topfes gerechnet, also nur unter den Teams, die
an dieser Stelle wirklich gleichauf sind. Was übrig bleibt, entscheidet das
Los.

### Skalierung der Beamer-Ansicht

Tabellen und Baum sind in `em` gebaut; die Seite berechnet aus Gruppenanzahl,
Gruppengröße bzw. Größe der ersten KO-Runde eine Schriftgröße in `vh`/`vw`.
So passt der Inhalt ohne Scrollen auf jede Auflösung. Mehr als acht Gruppen
werden auf mehrere Seiten verteilt.

## API

| Methode | Pfad            | Zweck                                             |
| ------- | --------------- | ------------------------------------------------- |
| GET     | `/api/state`    | aktueller Zustand                                 |
| GET     | `/api/events`   | SSE: Zustand bei Verbindung und nach jeder Änderung |
| GET     | `/api/info`     | LAN-Adressen, PIN nötig?                          |
| POST    | `/api/commands` | Befehl anwenden (PIN)                             |
| POST    | `/api/import`   | Zustand ersetzen (PIN)                            |

Befehle (`type`): `addTeams`, `renameTeam`, `removeTeam`, `updateSettings`,
`draw`, `discardDraw`, `setResult`, `clearResult`, `resetKnockout`,
`resetTournament`. Die genauen Felder stehen in `src/shared/commands.ts`.

## Grenzen und mögliche Erweiterungen

- Ein Turnier je Serverinstanz.
- Keine Unentschieden.
- Ergebnis-Eingabe erfasst Sieger + Restbecher; das Datenmodell
  (`scoreA`/`scoreB`) erlaubt bereits beliebige Spielstände.
- Auslosung rein zufällig – keine Setztöpfe, keine manuelle Gruppeneinteilung.
- Keine Hin- und Rückrunde.
