# ioBroker Lumina Adapter

Ein moderner ioBroker-Adapter mit mehreren Dashboards für die Haussteuerung — optimiert für Wanddisplays und mobile Nutzung.

![Version](https://img.shields.io/badge/version-1.0.0-orange)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-ioBroker-green)

---

## Dashboards

### `cards.html` — Übersichts-Dashboard
Kompaktes Card-basiertes Dashboard für den täglichen Überblick.

**Sektionen:**
- **Temperaturen** — Außen, Innen, Pool, Warmwasser, Vorlauf
- **Fenster · Türen** — Nuki-Schloss mit Batteriestatus, Fensterkontakte
- **Shield** — Alarmanlage mit Aktivierungs-Buttons und Status-GIF
- **Energie Aktuell** — PV, Verbrauch, Netzbezug, Einspeisung, Autarkie
- **Energie Heute** — Tageswerte PV-Ertrag, Verbrauch, Forecast
- **Energie Batterie** — Ladestand, Restkapazität, Manual-Charge
- **Heizung** — Heizkurve, Sommer- und Urlaubsmodus
- **BYD Sealion 7** — Fahrzeugbild, Ladestand, Entfernung, Wallbox-Status
- **Bodenfeuchte** — Hochbeet-Sensor mit Batterieanzeige
- **Pool Chemie** — pH-Wert und ORP mit Ampel-Farbkodierung
- **Wasser** — Ventilsteuerung (Garten, Pool, Beregner, Hochbeet, Gießkanne)

**Features:**
- LCARS-Farbblock-Filler für dynamisch gefüllte Spalten
- Live-Updates via ioBroker socket.io
- Alle Werte, Labels und Einheiten in einheitlicher Schriftgröße
- Farbkodierung für Pool-Chemie (grün/orange/rot je nach Zielwert)

---

### `energie.html` — Energiefluss-Dashboard
Visuelles SVG-Dashboard das den Energiefluss zwischen allen Quellen animiert darstellt.

**Knoten:**
- ☀️ Solar (PV-Anlage)
- 🔋 Batterie (BYD HVS)
- 🏠 Haus (Verbrauch)
- ⚡ Netz (Bezug / Einspeisung)
- 🚗 Wallbox (Laden)

**Features:**
- Animierte Fluss-Pfeile in Echtzeit je nach Energierichtung
- Vollständig responsiv (`100vh`, dynamischer `fitViewBox`)
- Unterer Datenstreifen: Autarkie, PV-Heute, Forecast, Netzbezug, Verbrauch, Batterie-SOC, Restkapazität
- Dashboard-Wechsel-Button zu `cards.html`

---

### `index.html` — LCARS Wand-Dashboard (1920×1080)
Vollbild-Dashboard im Star-Trek-LCARS-Design für dedizierte Wanddisplays.

**Design:**
- Antonio-Font (lokal, kein CDN)
- LCARS-Elbow-Shapes in Sidebar
- Farbige Bar-Strips zwischen Header und Content
- Animierte Data-Cascade im Header
- 2×3 Card-Grid mit Live-Daten
- Eingebetteter Energie-Iframe

---

## Installation

```bash
# Im ioBroker node_modules Verzeichnis
cd /opt/iobroker/node_modules
git clone https://github.com/halsi/iobroker.lumina.git
cd /opt/iobroker
iobroker upload lumina
```

## Update

```bash
cd /opt/iobroker/node_modules/iobroker.lumina
git pull
cd /opt/iobroker
iobroker upload lumina
```

## Aufrufen

Nach der Installation sind die Dashboards unter folgenden Pfaden erreichbar:

```
http://<iobroker-ip>:8082/lumina/cards.html
http://<iobroker-ip>:8082/lumina/energie.html
http://<iobroker-ip>:8082/lumina/index.html
```

---

## Konfiguration

Die OIDs für alle Datenpunkte werden direkt im JavaScript-Abschnitt der jeweiligen HTML-Datei konfiguriert. Dort sind alle verwendeten Datenpfade in benannten Konstanten zusammengefasst und einfach anpassbar.

---

## Technologie

- **ioBroker socket.io** — Live-Datenverbindung
- **Vanilla JS + HTML/CSS** — keine externen Abhängigkeiten zur Laufzeit
- **SVG** — Energiefluss-Animation
- **Antonio Font** — lokal eingebunden (WOFF2/WOFF)

## Lizenz

MIT — Wolfgang Halbartschlager
