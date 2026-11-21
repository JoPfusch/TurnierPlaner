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

1. **Teams** eintragen, einzeln oder als Liste. Spielernamen sind optional
   und nur in der Verwaltung sichtbar. Listenformat, ein Team pro Zeile:
   `Teamname` oder `Teamname; Spieler 1; Spieler 2`. Aus Excel kopierte
   Spalten gehen ebenfalls, eine Nummernspalte davor wird ignoriert.
   Fehlerhafte Zeilen werden mit Zeilennummer gemeldet.
2. **Format** festlegen: Tische, Größe der KO-Runde, Gruppenanzahl, Wertung.
   Die Tabelle „Möglichkeiten“ zeigt für die aktuelle Teamanzahl jede
   Gruppenanzahl mit Spielanzahl, Dauer und nötigen Zusatzkriterien.
3. Optional **Infos** für die Teams hinterlegen: Regeln, wo welcher Tisch
   steht, Tischplan als Bild. Die Teams sehen das am Handy im Reiter „Infos“,
   die Tischbeschreibung zusätzlich bei jedem Spiel.
4. **Auslosen** – Gruppen, Spielplan und Tische werden zufällig erzeugt.
5. **Spiele**: Sieger antippen, dann die Zahl der übrig gebliebenen Becher.
   Tabellen und KO-Baum rechnen sofort neu, der Beamer zieht mit.
6. Sind alle Gruppenspiele eingetragen, steht die KO-Runde fest und ihre
   Ergebnisse können eingetragen werden – bis zum Finale.

### Zeiten

„Minuten pro Spiel“ und „Beginn“ dienen nur der Planung: Daraus entstehen die
angezeigten Uhrzeiten und die geschätzte Dauer. Ein Spiel endet nie
automatisch – es ist erst vorbei, wenn ein Ergebnis eingetragen bzw.
bestätigt ist. Die Uhrzeiten werden nicht an den tatsächlichen Verlauf
angepasst. Wer bis zum Ende spielt, egal wie lange es dauert, lässt „Beginn“
leer: Dann zeigen Beamer und Handys nur die Reihenfolge („Runde 3“) statt
Uhrzeiten, die nicht stimmen. Die automatische Bestätigung von Meldungen
(siehe unten) ist davon unabhängig.

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

### Handys mit Teams koppeln

Die Kopplung läuft über einen QR-Code pro Team. Er enthält einen geheimen
Link (`…/team/<code>`); wer ihn öffnet, handelt für dieses Team. Ein Konto
oder Passwort gibt es nicht.

**Vorbereitung (Turnierleitung)**

1. Server so starten, wie er am Turnierabend läuft – mit der endgültigen
   Adresse (`PUBLIC_URL`, ggf. HTTPS, siehe [Konfiguration](#konfiguration)).
   Die Adresse steckt im QR-Code: Ändert sie sich später, müssen die Codes neu
   angezeigt bzw. gedruckt werden. Die Zuordnung selbst bleibt gültig.
2. Teams im Reiter **Teams** eintragen. Das geht schon vor der Auslosung.
3. Dort **„QR-Codes anzeigen“** wählen. Es gibt zwei Wege:
   - *Am Empfang zeigen:* Team antippen, der Code wird groß angezeigt, das
     Team scannt ihn vom Laptop oder Tablet. Nochmal tippen = zurück zur Liste.
   - *Ausdrucken:* „Alle drucken“ erzeugt einen Bogen mit Teamname und Code
     zum Ausschneiden und Verteilen.

**Kopplung (Team)**

1. Handy ins Turnier-WLAN bringen.
2. Mit der Kamera den QR-Code des eigenen Teams scannen und den Link öffnen.
3. Oben steht jetzt der Teamname, der Reiter **„Mein Team“** ist aktiv – das
   Handy ist gekoppelt. Vor der Auslosung steht dort „Ihr seid dabei“, danach
   das nächste Spiel mit Tisch und Gegner.
4. Optional die Seite auf den Startbildschirm legen (siehe unten), damit sie
   den Abend über mit einem Tipp erreichbar ist.

**Gut zu wissen**

- Mehrere Handys pro Team sind möglich: einfach denselben Code scannen.
- Das Handy merkt sich die Zuordnung. Wer später nur `/team` öffnet, landet
  wieder bei seinem Team.
- Neues Handy oder Browserdaten gelöscht: Code erneut scannen.
- Ohne Code ist `/team` eine reine Leseansicht (Tabellen, KO-Runde,
  Spielplan) – für Zuschauer.
- Der Code ist der Schlüssel des Teams: Wer ihn hat, kann für das Team melden.
  Deshalb jedem Team nur den eigenen zeigen. Einzelne Codes lassen sich nicht
  sperren; „Neues Turnier“ (Reiter System) macht alle ungültig.
- Wird ein Team umbenannt, bleibt die Kopplung bestehen.
- Im Reiter **Teams** steht bei jedem Team 📱 mit der Zahl der gekoppelten
  Handys und der letzten Aktivität (aktualisiert sich alle 15 Sekunden).
  So sieht die Turnierleitung, welche Teams noch nicht gescannt haben. Ein
  auf dem Startbildschirm abgelegtes iPhone-App-Symbol zählt als eigenes Gerät.

**Als App ablegen:** In der Team-Ansicht über das Browser-Menü „App
installieren“ bzw. „Zum Startbildschirm hinzufügen“ (Android/Chrome) oder
Teilen → „Zum Home-Bildschirm“ (iPhone/Safari). Die Kopplung bleibt erhalten.
Android bietet die Installation mit eigenem Fenster nur über
[HTTPS](#https-im-eigenen-netz) an; per HTTP entsteht dort eine Verknüpfung,
die im Browser öffnet.

### Ergebnisse von den Teams melden lassen

1. Nach einem Spiel öffnet ein Team **„Mein Team“**, tippt beim Spiel auf
   „Ergebnis melden“, wählt den Sieger und die Zahl der Restbecher.
2. Die Meldung erscheint sofort als **unbestätigt** (Beamer, Tabellen,
   KO-Baum), zählt aber noch nicht. Der Tisch gilt als frei, das nächste Spiel
   rückt nach.
3. Der Gegner sieht auf seinem Handy „Bitte bestätigen“ und tippt „Stimmt“
   oder „Stimmt nicht“.
4. Gültig wird die Meldung je nach Einstellung (Reiter **Format**):

   | Einstellung                         | Meldung gilt, wenn …                                              |
   | ----------------------------------- | ----------------------------------------------------------------- |
   | Gegner bestätigt                    | der Gegner „Stimmt“ tippt (oder dasselbe Ergebnis meldet)          |
   | Gegner bestätigt, sonst automatisch | wie oben, sonst von selbst nach der eingestellten Minutenzahl      |
   | Turnierleitung bestätigt immer      | die Turnierleitung sie im Reiter **Spiele** übernimmt              |

5. Bei „Stimmt nicht“ (oder einer abweichenden Meldung des Gegners) ist die
   Meldung **strittig** und wird nie automatisch übernommen – die
   Turnierleitung entscheidet im Reiter **Spiele** („Zu bestätigen“). Sie kann
   ohnehin jede Meldung übernehmen, verwerfen oder das Ergebnis direkt
   eintragen.
6. Das meldende Team kann seine Meldung zurückziehen oder korrigieren, solange
   sie nicht bestätigt ist.

### Spiele verschieben

Ist ein Team gerade nicht da, lässt sich ein offenes Gruppenspiel im Reiter
**Spiele** über „Verschieben …“ mit einem anderen offenen Gruppenspiel
**tauschen**: Beide wechseln Runde und Tisch. Angeboten werden nur Spiele,
bei denen danach kein Team in derselben Runde doppelt spielt. Gruppen,
Paarungen, Ergebnisse und die KO-Runde bleiben unverändert; ein erneuter
Tausch macht es rückgängig. KO-Spiele und gespielte Spiele lassen sich nicht
verschieben.

Jeder Tisch spielt seine Spiele der Reihe nach ab – „Runde“ ist die geplante
Reihenfolge, keine feste Uhrzeit.

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
| `TLS_CERT`  | –         | Zertifikat inkl. Kette (PEM) – schaltet HTTPS ein            |
| `TLS_KEY`   | –         | privater Schlüssel (PEM), zusammen mit `TLS_CERT`            |
| `HTTP_REDIRECT_PORT` | – | zusätzlicher HTTP-Port, der nur auf HTTPS weiterleitet       |

Beispiel: `ADMIN_PIN=4711 npm start`. Ohne PIN kann jeder im Netzwerk, der die
Adresse kennt, Ergebnisse ändern. Ohne HTTPS gehen PIN und Team-Links
unverschlüsselt durchs WLAN – das schützt vor Spaßvögeln, nicht vor Angreifern.

**Sobald Gäste im WLAN sind, unbedingt `ADMIN_PIN` setzen** – sonst kann jeder
`/admin` öffnen.

Mit PIN fragt `/admin` beim Öffnen danach. Ein Gerät, auf dem die PIN einmal
stimmte, merkt sie sich und fragt nicht erneut (im Browser die Website-Daten
löschen, um sich abzumelden). Wird die PIN am Server geändert, fragt jedes
Gerät beim nächsten Öffnen neu. Beamer (`/`) und Team-Ansicht (`/team`)
bleiben ohne PIN lesbar.

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

### HTTPS im eigenen Netz

Mit einer eigenen Domain läuft der Server lokal mit einem echten Zertifikat –
ohne eigenen DNS-Server und ohne dass der Laptop aus dem Internet erreichbar
ist. Vorteile: Android bietet die App-Installation an, PIN und Team-Links sind
verschlüsselt.

1. **Feste IP:** Dem Laptop im Router eine feste Adresse geben, z. B.
   `192.168.178.20`.
2. **DNS-Eintrag beim Domain-Anbieter:** Subdomain als A-Record auf diese
   lokale IP, z. B. `turnier.example.de → 192.168.178.20`.
3. **Zertifikat per DNS-Challenge** (Let's Encrypt prüft nur einen
   TXT-Eintrag der Domain). Beispiel mit [acme.sh](https://github.com/acmesh-official/acme.sh)
   und der Netcup-DNS-API (Zugangsdaten im Netcup-CCP unter Stammdaten → API):

   ```bash
   export NC_CID="<Kundennummer>" NC_Apikey="<API-Key>" NC_Apipw="<API-Passwort>"
   acme.sh --issue --dns dns_netcup --dnssleep 900 -d turnier.example.de
   ```

   Netcup rollt DNS-Änderungen langsam aus, daher die Wartezeit. Das Ergebnis
   liegt in `~/.acme.sh/turnier.example.de_ecc/`. Das Zertifikat kann auf
   einem beliebigen Rechner ausgestellt und kopiert werden; gebraucht werden
   `fullchain.cer` und `turnier.example.de.key`.
4. **Router:** FRITZ!Boxen blockieren öffentliche Namen, die auf lokale
   Adressen zeigen. Die Subdomain unter Heimnetz → Netzwerk →
   Netzwerkeinstellungen → **DNS-Rebind-Schutz** als Ausnahme eintragen.
5. **Starten:**

   ```bash
   TLS_CERT=~/.acme.sh/turnier.example.de_ecc/fullchain.cer \
   TLS_KEY=~/.acme.sh/turnier.example.de_ecc/turnier.example.de.key \
   PORT=443 HTTP_REDIRECT_PORT=80 \
   PUBLIC_URL=https://turnier.example.de \
   ADMIN_PIN=4711 npm start
   ```

   `PUBLIC_URL` muss der Name aus dem Zertifikat sein – über die IP melden die
   Handys einen Zertifikatsfehler. Die Ports 443/80 brauchen unter Linux und
   macOS Administratorrechte; alternativ z. B. `PORT=3443` und
   `PUBLIC_URL=https://turnier.example.de:3443`.

Hinweise:

- Das Zertifikat gilt 90 Tage und wird nur beim Start gelesen: kurz vor dem
  Turnier ausstellen oder erneuern (`acme.sh --renew -d …`) und neu starten.
- Vor dem Turnier mit einem Handy **im Gast-WLAN** testen, ob der Name
  aufgelöst wird (Rebind-Schutz, abweichender DNS im Gastnetz).
- Im Entwicklungsmodus (`npm run dev`) bleibt es bei HTTP.

Der Stand wird nach jeder Änderung gespeichert und übersteht einen Neustart.
Der Tischplan liegt als Bild ebenfalls in `DATA_DIR`.
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
