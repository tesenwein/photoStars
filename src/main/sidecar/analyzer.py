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


# ── Eye landmarks (6-point EAR) ──────────────────────────────────────────────
_LEFT_EYE  = [362, 385, 387, 263, 373, 380]
_RIGHT_EYE = [33,  160, 158, 133, 153, 144]
_EAR_THRESHOLD = 0.20

# ── Mouth landmarks ──────────────────────────────────────────────────────────
# Outer corners
_MOUTH_LEFT  = 61
_MOUTH_RIGHT = 291
# Upper / lower lip midpoints
_MOUTH_TOP    = 13
_MOUTH_BOTTOM = 14
# Lip corners for smile (use vertical position relative to mouth centre)
_SMILE_LEFT_CORNER  = 61
_SMILE_RIGHT_CORNER = 291
_SMILE_TOP_LIP      = 0    # upper lip centre (nose-side)
_SMILE_BOTTOM_LIP   = 17   # lower lip centre (chin-side)

_MAR_OPEN_THRESHOLD  = 0.35  # Mouth Aspect Ratio above this → open
_TILT_THRESHOLD_DEG  = 25.0  # head tilt beyond this → misshot


def _dist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def _eye_aspect_ratio(landmarks, indices, w, h):
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in indices]
    vertical  = _dist(pts[1], pts[5]) + _dist(pts[2], pts[4])
    horizontal = _dist(pts[0], pts[3])
    return vertical / (2.0 * horizontal) if horizontal > 1e-6 else 1.0


def _mouth_aspect_ratio(landmarks, w, h):
    """Vertical mouth opening / horizontal mouth width."""
    top    = (landmarks[_MOUTH_TOP].x    * w, landmarks[_MOUTH_TOP].y    * h)
    bottom = (landmarks[_MOUTH_BOTTOM].x * w, landmarks[_MOUTH_BOTTOM].y * h)
    left   = (landmarks[_MOUTH_LEFT].x  * w, landmarks[_MOUTH_LEFT].y  * h)
    right  = (landmarks[_MOUTH_RIGHT].x * w, landmarks[_MOUTH_RIGHT].y * h)
    return _dist(top, bottom) / (_dist(left, right) + 1e-6)


def _smile_score(landmarks, w, h):
    """
    Score 0-1 based on how much the lip corners are raised relative to the
    midpoint of the upper lip.  Higher = more smile.
    """
    left_corner  = (landmarks[_SMILE_LEFT_CORNER].x  * w, landmarks[_SMILE_LEFT_CORNER].y  * h)
    right_corner = (landmarks[_SMILE_RIGHT_CORNER].x * w, landmarks[_SMILE_RIGHT_CORNER].y * h)
    top_lip      = (landmarks[_SMILE_TOP_LIP].x      * w, landmarks[_SMILE_TOP_LIP].y      * h)

    corner_mid_y = (left_corner[1] + right_corner[1]) / 2.0
    # Negative = corners above top lip = smile; normalise by face height proxy
    face_height  = abs(landmarks[10].y - landmarks[152].y) * h + 1e-6
    raw = (top_lip[1] - corner_mid_y) / face_height
    return float(max(0.0, min(1.0, raw * 5.0 + 0.3)))


def _head_tilt_deg(landmarks, w, h):
    """
    Angle of the line between the two eye outer corners from horizontal.
    Positive = clockwise tilt.
    """
    left_eye  = (landmarks[33].x  * w, landmarks[33].y  * h)
    right_eye = (landmarks[263].x * w, landmarks[263].y * h)
    dx = right_eye[0] - left_eye[0]
    dy = right_eye[1] - left_eye[1]
    return math.degrees(math.atan2(dy, dx))


def analyze_face_eye(image_path: str) -> dict:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    results = _get_face_mesh().process(rgb)

    if not results.multi_face_landmarks:
        return {
            "facesDetected": 0,
            "allEyesOpen":   True,
            "badExpression": False,
        }

    all_eyes_open = True
    worst_smile   = 0.0
    any_mouth_open = False
    worst_tilt    = 0.0

    for face in results.multi_face_landmarks:
        lm = face.landmark

        # Eyes
        left_ear  = _eye_aspect_ratio(lm, _LEFT_EYE,  w, h)
        right_ear = _eye_aspect_ratio(lm, _RIGHT_EYE, w, h)
        if (left_ear + right_ear) / 2.0 < _EAR_THRESHOLD:
            all_eyes_open = False

        # Mouth
        mar = _mouth_aspect_ratio(lm, w, h)
        if mar > _MAR_OPEN_THRESHOLD:
            any_mouth_open = True

        # Smile
        worst_smile = max(worst_smile, _smile_score(lm, w, h))

        # Head tilt
        tilt = abs(_head_tilt_deg(lm, w, h))
        worst_tilt = max(worst_tilt, tilt)

    bad_expression = (
        not all_eyes_open
        or any_mouth_open
        or worst_tilt > _TILT_THRESHOLD_DEG
    )

    # Bounding box of the first (largest) face, normalised 0-1.
    face_bbox = None
    if results.multi_face_landmarks:
        lm0 = results.multi_face_landmarks[0].landmark
        xs = [l.x for l in lm0]
        ys = [l.y for l in lm0]
        pad = 0.05  # small padding around the face
        face_bbox = {
            "x": max(0.0, min(xs) - pad),
            "y": max(0.0, min(ys) - pad),
            "w": min(1.0, max(xs) - min(xs) + 2 * pad),
            "h": min(1.0, max(ys) - min(ys) + 2 * pad),
        }

    return {
        "facesDetected": len(results.multi_face_landmarks),
        "allEyesOpen":   all_eyes_open,
        "smileScore":    round(worst_smile, 3),
        "mouthOpen":     any_mouth_open,
        "headTiltDeg":   round(worst_tilt, 1),
        "badExpression": bad_expression,
        "faceBbox":      face_bbox,
    }


def analyze_aesthetics(image_path: str) -> float:
    """
    Multi-metric aesthetic proxy producing a score 1-10.
    Replace with an ONNX NIMA InferenceSession to upgrade to a real model.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    img_f = img.astype(np.float32)
    B, G, R = cv2.split(img_f)

    # Colorfulness (Hasler & Suesstrunk 2003)
    rg = R - G
    yb = 0.5 * (R + G) - B
    colorfulness = math.sqrt(float(rg.std()) ** 2 + float(yb.std()) ** 2) + \
                   0.3 * math.sqrt(float(rg.mean()) ** 2 + float(yb.mean()) ** 2)

    # RMS contrast
    gray     = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    contrast = float(gray.std())

    # Mean saturation
    hsv        = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = float(hsv[:, :, 1].mean())

    col_norm = min(colorfulness / 60.0, 1.0)
    con_norm = min(contrast    / 70.0, 1.0)
    sat_norm = min(saturation  / 120.0, 1.0)

    raw   = 0.40 * col_norm + 0.35 * con_norm + 0.25 * sat_norm
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
            score  = analyze_aesthetics(img_path)
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
        print(json.dumps(handle(req)), flush=True)


if __name__ == "__main__":
    main()
