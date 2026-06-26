# Pool-Cover-Detection (YOLO-World)

Open-Vocabulary-Detection für Poolabdeckung. Kein Training, kein Labeling — nur Text-Prompts.

## Setup (macOS, lokal testen)

```bash
cd tools/pool-cover
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Beim ersten Lauf lädt Ultralytics die Gewichte (`yolov8s-worldv2.pt`, ~25 MB) automatisch ins Working Directory.

## Beispielbilder

Ablegen in `tools/pool-cover/samples/`. Erlaubte Endungen: `.jpg .jpeg .png .bmp .webp`.

## Lauf

```bash
# Alle Bilder im samples/-Ordner
python detect.py

# Einzelbild
python detect.py samples/01.jpg

# Anderer Ordner
python detect.py /pfad/zu/bildern/

# Eigene Prompts + Threshold
python detect.py --prompts "blue pool cover" "swimming pool water" --conf 0.08
```

Output (eine JSON-Zeile pro Bild):

```json
{"file": "01.jpg", "scores": {"pool cover": 0.42, "water surface": 0.08}, "covered": true, "decision": "cover_dominant"}
```

`decision` ist eines von:
- `cover_dominant` — Cover-Score deutlich > Water-Score → `covered: true`
- `water_dominant` — Water-Score deutlich > Cover-Score → `covered: false`
- `ambiguous` — beide Scores nah beieinander → `covered: false` (konservativ)
- `no_detection` — gar nichts erkannt → `covered: false`

## Threshold tuning

Nach dem ersten Lauf über deine Beispielbilder die JSON-Zeilen anschauen, dann:
- `--conf` senken/anheben um die Anzahl der Detections zu steuern
- `--margin` anpassen, um wann "ambiguous" greift
- Prompts variieren (`"solar pool cover"`, `"rolled up tarp"`, `"blue tarp on pool"` …)

## Cron (später, wenn die Schwellen sitzen)

```cron
# Alle 10 Minuten Cover-Status checken (Beispiel — Pfade anpassen)
*/10 * * * * /Users/halsi/Documents/Claude-Code/iobroker.lumina/tools/pool-cover/.venv/bin/python \
  /Users/halsi/Documents/Claude-Code/iobroker.lumina/tools/pool-cover/detect.py \
  /pfad/zum/aktuellen-snapshot.jpg >> /tmp/pool-cover.log 2>&1
```

Für die iobroker-Integration kommt später ein zusätzlicher Schritt: aus dem JSON den `covered`-Boolean rausziehen und per REST-API auf eine OID setzen (z.B. `0_userdata.0.Pool.CoverDetected`). Das bauen wir, sobald die Detection-Qualität passt.
