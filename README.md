# ioBroker Lumina Adapter

Ein moderner ioBroker-Adapter mit mehreren Dashboards für die Haussteuerung — optimiert für Wanddisplays (1920×1080) und mobile Nutzung.

![Version](https://img.shields.io/badge/version-1.0.0-orange)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-ioBroker-green)

---

## Dashboards

### `index.html` — LCARS Shell (1920×1080)
Vollbild-Rahmen im Star-Trek-LCARS-Design für dedizierte Wanddisplays. Lädt die anderen Dashboards per Iframe.

**Design:**
- LCARS-Elbow-Shapes, farbige Bar-Strips, animierter Verbindungspunkt
- Sidebar-Navigation (Dashboard · Energie · Übersicht + Platzhalter)
- Uhrzeit & Datum im Header (Wochentag, Tag, Monat, Jahr)
- Socket.io-Verbindungsanzeige (Online / Offline)

---

### `dashboard.html` — Holografisches Energie-Dashboard
Hauptansicht mit einem holografischen Hausplan, animierten Energieflüssen und live Sensor-Werten.

**Widgets (Holo-Nodes):**
| Widget | Bild | OID / Funktion |
|--------|------|----------------|
| 🏠 Haus | `haus.png` / `haus-pool-geschlossen.png` | Wechselt je nach Pool-Abdeckungsstatus |
| ☀️ Solar / Mond | `sonne.png` / `mond.png` | Tag/Nacht-Umschaltung |
| 🔋 Batterie | `battery_1–6.png` | SOC-Stufen mit farbigen Zellen (rot/gelb/grün) |
| 🚗 Auto | `auto.png` | BYD Sealion 7, Popup-Karte mit 7 Live-Werten |
| 💧 Pool | `pool.png` | Pooltemperatur |
| 🔌 Wallbox | `wallbox.png` | Ladeleistung |
| ⚡ Netz | `netz.png` | Netzbezug / Einspeisung |
| 🌡️ Temp | `temp.png` | Innen- & Außentemperatur |
| 🔥 Heizung | `heizung.png` | Vorlauftemperatur (Tomato-rot) |
| ♨️ Pool-Heizung | `poolheizung.png` | Zieltemperatur (Tomato-rot) |
| 🌱 Hochbeet | `hochbeet.png` | Bodenfeuchte in % |
| 🍅 Tomaten | `tomaten.png` | Bodenfeuchte (OID pending) |
| 🥒 Gurken | `gurken.png` | Bodenfeuchte (OID pending) |

**Energieflüsse (SVG):**
- Solar → Haus, Solar → Batterie, Solar → Wallbox
- Batterie → Haus, Haus → Netz, Wallbox → Netz
- Animierte Dash-Pfeile je nach Flussrichtung und Stärke
- Inaktive Pfade bei 23 % Opazität sichtbar

**Features:**
- Edit-Mode (`?edit` URL-Parameter): alle Nodes, Labels und Flow-Ankerpunkte per Drag & Drop positionierbar
- Positionen und Labels in localStorage + ioBroker-OIDs persistiert
- Tag/Nacht-Hintergrundbild (`background-day.png` / `background-night.png`) mit dunklem Gradient-Overlay
- Auto-Popup: Klick auf Auto-Node öffnet BYD-Karte mit Ladestand, Reichweite, Türen, etc.
- Pool-Abdeckungs-Toggle: OID `0_userdata.0.Pool.Abdeckung` wechselt Haus-Bild automatisch

---

### `energie.html` — Energiefluss-Detail
Vollbild-SVG-Dashboard mit animierten Energieflüssen zwischen allen Quellen.

**Knoten:** Solar · Batterie · Haus · Netz · Wallbox

**Features:**
- Animierte Fluss-Pfeile in Echtzeit je nach Energierichtung
- Netto-Netz-Logik: `netGrid = bezug − einspeisung`
- Unterer Datenstreifen: Autarkie, PV-Heute, Forecast, Netzbezug, Verbrauch, Batterie-SOC, Restkapazität

---

### `cards.html` — Übersichts-Dashboard
Kompaktes Card-basiertes Dashboard für den täglichen Überblick.

**Sektionen:**
- **Temperaturen** — Außen, Innen, Pool, Warmwasser, Heizung Vorlauf
- **Fenster · Türen** — Nuki-Schloss (Batterie + Status), Fensterkontakte
- **Shield** — Alarmanlage mit Aktivierungs-Buttons
- **Energie Aktuell** — PV, Verbrauch, Netzbezug, Einspeisung, Autarkie
- **Energie Heute** — Tageswerte PV-Ertrag, Verbrauch, Forecast
- **Energie Batterie** — Ladestand, Restkapazität, Manual-Charge
- **Heizung** — Heizkurve, Sommer- und Urlaubsmodus
- **BYD Sealion 7** — Fahrzeugbild, Ladestand, Entfernung, Wallbox-Status
- **Bodenfeuchte** — Hochbeet-Sensor mit Batterieanzeige
- **Pool Chemie** — pH-Wert und ORP mit Ampel-Farbkodierung
- **Wasser** — Ventilsteuerung (Garten, Pool, Beregner, Hochbeet, Gießkanne)

---

## Installation

```bash
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

```
http://<iobroker-ip>:8082/lumina/index.html       ← LCARS Wanddisplay
http://<iobroker-ip>:8082/lumina/dashboard.html   ← Holografisches Dashboard
http://<iobroker-ip>:8082/lumina/energie.html     ← Energiefluss-Detail
http://<iobroker-ip>:8082/lumina/cards.html       ← Übersichts-Cards
```

---

## Konfiguration

Alle OIDs sind direkt im `const OIDs = { ... }` Block der jeweiligen HTML-Datei konfiguriert — keine externe Config-Datei nötig.

---

## Technologie

- **ioBroker socket.io** — Live-Datenverbindung
- **Vanilla JS + HTML/CSS** — keine externen Abhängigkeiten zur Laufzeit
- **SVG** — Energiefluss-Animation
- **LCARS-Farbpalette** — Violet · Orange · Teal · Moonlit · Glow

## Lizenz

MIT — Wolfgang Halbartschlager
