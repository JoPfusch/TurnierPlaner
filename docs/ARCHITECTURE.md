# Architektur

## Überblick

```
Browser (Beamer)  ─┐                         ┌─ data/tournament.json
Browser (Laptop)  ─┼─ HTTP + SSE ─ Node.js ──┤
Browser (Handy)   ─┤               (Express) ├─ data/team-tokens.json
Browser (Teams)   ─┘                         └─ dist/client (statische Dateien)
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
| `teamList.ts`      | eingefügte Teamliste lesen (Name; Spieler; Spieler)                     |
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
| `listen.ts`  | HTTP oder HTTPS (mit optionaler Weiterleitung von HTTP)        |
| `config.ts`  | Umgebungsvariablen                                             |
| `app.ts`     | Routen, PIN-Prüfung, Fehlerabbildung, Auslieferung des Clients |
| `store.ts`   | Zustand im Speicher, atomares Schreiben, Benachrichtigung      |
| `network.ts` | LAN-Adressen für Links und QR-Codes                            |
| `tokens.ts`  | geheime Team-Links (Handy ↔ Team) und gekoppelte Geräte        |
| `venueMap.ts`| Tischplan-Bild im Datenordner                                  |

### `src/client`

| Pfad                     | Aufgabe                                               |
| ------------------------ | ----------------------------------------------------- |
| `App.tsx`                | Weiche: `/` Beamer, `/admin` Verwaltung, `/team` Teams |
| `team/TeamApp.tsx`       | Handy-Ansicht: Übersicht, melden, bestätigen          |
| `useTournament.ts`       | SSE-Anbindung, leitet das Lesemodell ab               |
| `api.ts`                 | Befehle senden, PIN-Abfrage, Import                   |
| `display/DisplayApp.tsx` | Vollbild: Seitenwechsel, Skalierung, Tisch-Leiste     |
| `admin/*Tab.tsx`         | je ein Reiter der Verwaltung                          |
| `admin/PinGate.tsx`      | PIN-Abfrage beim Öffnen der Verwaltung                |
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

### Meldungen der Teams

Eine Meldung ist ein **Vorschlag** (`state.proposals[matchId]`), kein Ergebnis:
Tabellen und KO-Baum rechnen ausschließlich mit `state.results`. Erst
Bestätigung (Gegner, Zeitablauf oder Turnierleitung – je nach
`settings.confirmation`) macht aus dem Vorschlag über denselben Codepfad wie
die Admin-Eingabe ein Ergebnis. Damit gelten alle Schutzregeln der KO-Phase
unverändert.

- Nach jedem Befehl räumt der Reducer Vorschläge ab, die nicht mehr passen
  (Spiel hat ein Ergebnis, Paarung hat sich geändert).
- Der Zeitablauf ist ebenfalls ein Befehl (`expireProposals` mit Zeitstempel),
  den ein Timer im Server sendet – der Reducer bleibt frei von Uhr und Zufall.
- Strittige Vorschläge laufen nie automatisch ab.

**Zuordnung Handy ↔ Team:** Jedes Team hat ein zufälliges Token; der QR-Code
enthält `/team/<token>`. Die Tokens liegen bewusst *nicht* im Turnierzustand,
denn der geht per SSE an alle Geräte. Sie stehen in `team-tokens.json`, die
Verwaltung holt sie PIN-geschützt für die QR-Codes. Team-Aktionen laufen über
`/api/team/:token/actions`; der Server setzt `teamId` und Zeitstempel selbst,
ein Handy kann also nur für das eigene Team handeln.

**Startbildschirm:** `/api/manifest?start=/team/<token>` liefert ein Manifest
mit dem Team-Link als Start-URL. Das ist nötig, weil abgelegte Web-Apps auf
iOS einen eigenen Speicher haben und das im Browser gemerkte Token nicht
sehen. Auf einen Service Worker wurde verzichtet: Die App ist ohne Server
ohnehin nutzlos, offline gäbe es nichts anzuzeigen.

### Spiele tauschen

`swapMatches` tauscht Runde (`slot`) und Tisch zweier offener Gruppenspiele.
Ids, Paarungen und Gruppen bleiben gleich, daher sind Ergebnisse, Meldungen
und Tabellen nicht betroffen. Die Menge der belegten Runden ändert sich nicht,
also auch nicht der Beginn der KO-Phase. Einzige Bedingung (`swapProblem`):
Kein Team spielt danach zweimal in derselben Runde.

### Gekoppelte Geräte

Jeder Browser erzeugt eine zufällige Geräte-Id (localStorage) und schickt sie
beim Öffnen des Team-Links und danach minütlich mit. Der Server merkt sich je
Team die Ids mit letzter Aktivität in `team-devices.json`; neue Geräte werden
sofort geschrieben, die Aktivitätszeit nur im Speicher gehalten.

### Tischplan

Das Bild liegt als Datei im Datenordner, nicht im Zustand – der wird bei jeder
Änderung an alle Geräte geschickt. Der Zustand trägt nur `venueMapVersion`
(Zeitpunkt des Uploads); die Clients laden `/api/venue-map?v=<version>` und
dürfen das Bild deshalb unbegrenzt cachen. Die Verwaltung verkleinert Fotos
vor dem Hochladen auf 2000 px und speichert sie als JPEG; so funktionieren
auch iPhone-Fotos (HEIC), sofern der Browser sie lesen kann.

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
| GET     | `/api/team-links` | Token je Team für die QR-Codes (PIN)            |
| GET     | `/api/team/:token` | Team zu einem Token                            |
| POST    | `/api/team/:token/actions` | `propose`, `confirm`, `dispute`, `withdraw` |
| GET     | `/api/manifest` | Web-App-Manifest                                  |
| GET     | `/api/team-devices` | gekoppelte Handys je Team (PIN)               |
| GET     | `/api/admin/check` | 204, wenn die PIN stimmt                       |
| GET     | `/api/venue-map` | Tischplan-Bild                                   |
| PUT/DELETE | `/api/venue-map` | Tischplan hochladen/entfernen (PIN)          |

Befehle (`type`): `addTeams`, `renameTeam`, `removeTeam`, `updateSettings`,
`draw`, `discardDraw`, `setResult`, `clearResult`, `resetKnockout`,
`resetTournament`, `setPlayers`, `swapMatches`, dazu für Meldungen `proposeResult`, `confirmProposal`,
`disputeProposal`, `withdrawProposal`, `acceptProposal`, `rejectProposal`,
`expireProposals`. Die genauen Felder stehen in `src/shared/commands.ts`.

## Grenzen und mögliche Erweiterungen

- Ein Turnier je Serverinstanz.
- Ohne `TLS_CERT`/`TLS_KEY` gehen PIN und Team-Links unverschlüsselt durchs WLAN.
- Keine Unentschieden.
- Ergebnis-Eingabe erfasst Sieger + Restbecher; das Datenmodell
  (`scoreA`/`scoreB`) erlaubt bereits beliebige Spielstände.
- Auslosung rein zufällig – keine Setztöpfe, keine manuelle Gruppeneinteilung.
- Keine Hin- und Rückrunde.
