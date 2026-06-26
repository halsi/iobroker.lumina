#!/usr/bin/env python3
"""
Pool-Cover-Detection via YOLO-World (open-vocabulary).

Usage:
  python detect.py                       # uses ./samples/
  python detect.py path/to/image.jpg
  python detect.py path/to/folder/
  python detect.py --prompts "pool cover" "water surface" --conf 0.1 samples/

Output: one JSON line per processed image, e.g.:
  {"file": "01.jpg", "scores": {"pool cover": 0.42, "water surface": 0.08}, "covered": true, "decision": "cover_dominant"}
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

DEFAULT_PROMPTS = ["pool cover", "water surface"]
DEFAULT_MODEL = "yolov8s-worldv2.pt"
DEFAULT_CONF = 0.10


def iter_images(target: Path):
    if target.is_file():
        yield target
        return
    if target.is_dir():
        for p in sorted(target.iterdir()):
            if p.suffix.lower() in IMAGE_SUFFIXES:
                yield p
        return
    raise FileNotFoundError(f"Not a file or directory: {target}")


def best_scores_per_class(result, class_names):
    """Return {class_name: max_confidence_or_0.0} for the given result."""
    scores = {name: 0.0 for name in class_names}
    boxes = getattr(result, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return scores
    cls_ids = boxes.cls.tolist()
    confs = boxes.conf.tolist()
    for cls_id, conf in zip(cls_ids, confs):
        name = class_names[int(cls_id)]
        if conf > scores[name]:
            scores[name] = float(conf)
    return scores


def decide(scores, cover_key, water_key, margin):
    """Return (covered: bool, decision_label: str)."""
    cover = scores.get(cover_key, 0.0)
    water = scores.get(water_key, 0.0)
    if cover == 0.0 and water == 0.0:
        return False, "no_detection"
    if cover >= water + margin:
        return True, "cover_dominant"
    if water >= cover + margin:
        return False, "water_dominant"
    return False, "ambiguous"


def main():
    ap = argparse.ArgumentParser(description="YOLO-World pool cover detection.")
    ap.add_argument("target", nargs="?", default="samples",
                    help="Image file or folder (default: ./samples/)")
    ap.add_argument("--prompts", nargs="+", default=DEFAULT_PROMPTS,
                    help=f"Text prompts. First = cover class, second = water class. Default: {DEFAULT_PROMPTS}")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"YOLO-World weights (default: {DEFAULT_MODEL})")
    ap.add_argument("--conf", type=float, default=DEFAULT_CONF, help=f"Confidence threshold (default: {DEFAULT_CONF})")
    ap.add_argument("--margin", type=float, default=0.05,
                    help="Min score difference for non-ambiguous decision (default: 0.05)")
    args = ap.parse_args()

    if len(args.prompts) < 2:
        print("Need at least two prompts: cover class + water class.", file=sys.stderr)
        sys.exit(2)

    target = Path(args.target).expanduser().resolve()
    images = list(iter_images(target))
    if not images:
        print(f"No images found in {target}", file=sys.stderr)
        sys.exit(1)

    from ultralytics import YOLOWorld
    model = YOLOWorld(args.model)
    model.set_classes(args.prompts)

    cover_key, water_key = args.prompts[0], args.prompts[1]

    for img_path in images:
        results = model.predict(str(img_path), conf=args.conf, verbose=False)
        if not results:
            out = {"file": img_path.name, "error": "no_result"}
            print(json.dumps(out, ensure_ascii=False))
            continue
        scores = best_scores_per_class(results[0], args.prompts)
        covered, decision = decide(scores, cover_key, water_key, args.margin)
        out = {
            "file": img_path.name,
            "scores": {k: round(v, 3) for k, v in scores.items()},
            "covered": covered,
            "decision": decision,
        }
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
