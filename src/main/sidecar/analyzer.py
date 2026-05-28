#!/usr/bin/env python3
"""
PhotoStars image analysis sidecar.

Reads JSON-lines from stdin, writes JSON-lines to stdout.
Request:  {"id": "<uuid>", "type": "face_eye"|"aesthetics", "image_path": "<abs>"}
Response: {"id": "<uuid>", "success": true,  "result": {...}}
          {"id": "<uuid>", "success": false, "error":  "<msg>"}

Install deps:  pip install opencv-python mediapipe numpy
To swap in a real NIMA ONNX model: replace analyze_aesthetics() with an
onnxruntime InferenceSession call.
"""

import sys
import json
import math

import cv2
import numpy as np

# Lazy-import mediapipe so a missing install shows a clear error on first use.
_face_mesh = None

def _get_face_mesh():
    global _face_mesh
    if _face_mesh is None:
        import mediapipe as mp
        _face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=10,
            refine_landmarks=True,
        )
    return _face_mesh


# MediaPipe Face Mesh landmark indices for left / right eye (6-point EAR).
# Order: [outer, top1, top2, inner, bot2, bot1]
_LEFT_EYE  = [362, 385, 387, 263, 373, 380]
_RIGHT_EYE = [33,  160, 158, 133, 153, 144]
_EAR_THRESHOLD = 0.20


def _dist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def _eye_aspect_ratio(landmarks, indices, w, h):
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in indices]
    vertical = _dist(pts[1], pts[5]) + _dist(pts[2], pts[4])
    horizontal = _dist(pts[0], pts[3])
    if horizontal < 1e-6:
        return 1.0
    return vertical / (2.0 * horizontal)


def analyze_face_eye(image_path: str) -> dict:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    results = _get_face_mesh().process(rgb)

    if not results.multi_face_landmarks:
        return {"facesDetected": 0, "allEyesOpen": True}

    all_open = True
    for face in results.multi_face_landmarks:
        lm = face.landmark
        left_ear  = _eye_aspect_ratio(lm, _LEFT_EYE,  w, h)
        right_ear = _eye_aspect_ratio(lm, _RIGHT_EYE, w, h)
        avg_ear = (left_ear + right_ear) / 2.0
        if avg_ear < _EAR_THRESHOLD:
            all_open = False
            break

    return {
        "facesDetected": len(results.multi_face_landmarks),
        "allEyesOpen": all_open,
    }


def analyze_aesthetics(image_path: str) -> float:
    """
    Multi-metric aesthetic proxy producing a score 1-10.

    Metrics (Hasler & Suesstrunk colorfulness, RMS contrast, mean saturation)
    are weighted and mapped to 1-10. Replace this function with an ONNX
    InferenceSession call to upgrade to a real NIMA model.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    img_f = img.astype(np.float32)

    # 1. Colorfulness (Hasler & Suesstrunk 2003)
    B, G, R = cv2.split(img_f)
    rg = R - G
    yb = 0.5 * (R + G) - B
    colorfulness = math.sqrt(float(rg.std()) ** 2 + float(yb.std()) ** 2) + \
                   0.3 * math.sqrt(float(rg.mean()) ** 2 + float(yb.mean()) ** 2)

    # 2. RMS contrast (std of luminance, 0-255)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    contrast = float(gray.std())

    # 3. Mean saturation (HSV, 0-255)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = float(hsv[:, :, 1].mean())

    # Normalise each to [0, 1]
    col_norm = min(colorfulness / 60.0, 1.0)
    con_norm = min(contrast    / 70.0, 1.0)
    sat_norm = min(saturation  / 120.0, 1.0)

    # Weighted combination → [0, 1] → [1, 10]
    raw = 0.40 * col_norm + 0.35 * con_norm + 0.25 * sat_norm
    score = 1.0 + raw * 9.0
    return round(score, 2)


def handle(req: dict) -> dict:
    req_id   = req.get("id")
    req_type = req.get("type")
    img_path = req.get("image_path", "")

    try:
        if req_type == "face_eye":
            result = analyze_face_eye(img_path)
        elif req_type == "aesthetics":
            score = analyze_aesthetics(img_path)
            result = {"aestheticsScore": score}
        else:
            return {"id": req_id, "success": False, "error": f"unknown type: {req_type}"}
        return {"id": req_id, "success": True, "result": result}
    except Exception as exc:
        return {"id": req_id, "success": False, "error": str(exc)}


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"id": None, "success": False, "error": f"JSON parse error: {exc}"}), flush=True)
            continue

        response = handle(req)
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
