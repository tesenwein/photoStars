#!/usr/bin/env python3
"""
PhotoStars image analysis sidecar — mediapipe Tasks API (>=0.10).

Reads JSON-lines from stdin, writes JSON-lines to stdout.
Request:  {"id":"<uuid>","type":"face_eye"|"aesthetics","image_path":"<abs>"}
Response: {"id":"<uuid>","success":true,"result":{...}}
          {"id":"<uuid>","success":false,"error":"<msg>"}

Requires: pip install opencv-python mediapipe numpy
Model:    face_landmarker.task (downloaded to the same directory as this script)
"""

import sys
import json
import math
import os

import cv2
import numpy as np

# ── Eye landmark indices (478-point model) ────────────────────────────────
_LEFT_EYE  = [362, 385, 387, 263, 373, 380]
_RIGHT_EYE = [33,  160, 158, 133, 153, 144]
_EAR_THRESHOLD   = 0.20

# ── Mouth ─────────────────────────────────────────────────────────────────
_MOUTH_LEFT   = 61
_MOUTH_RIGHT  = 291
_MOUTH_TOP    = 13
_MOUTH_BOTTOM = 14
_MAR_OPEN_THRESHOLD = 0.35

_TILT_THRESHOLD_DEG = 25.0

# ── Lazy-loaded landmarker ────────────────────────────────────────────────
_landmarker = None

def _get_landmarker():
    global _landmarker
    if _landmarker is not None:
        return _landmarker

    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision as mp_vision

    model_path = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"face_landmarker.task not found at {model_path}. "
            "Run: python -c \"import urllib.request; "
            "urllib.request.urlretrieve('https://storage.googleapis.com/"
            "mediapipe-models/face_landmarker/face_landmarker/float16/1/"
            "face_landmarker.task','face_landmarker.task')\""
        )

    base = mp_tasks.BaseOptions(model_asset_path=model_path)
    opts = mp_vision.FaceLandmarkerOptions(
        base_options=base,
        num_faces=10,
        min_face_detection_confidence=0.3,
        min_face_presence_confidence=0.3,
        min_tracking_confidence=0.3,
        output_face_blendshapes=True,   # gives us smile / eye-blink scores
    )
    _landmarker = mp_vision.FaceLandmarker.create_from_options(opts)
    return _landmarker


# ── Helpers ───────────────────────────────────────────────────────────────

def _dist(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)


def _ear(lm, indices, w, h):
    pts = [(lm[i].x*w, lm[i].y*h) for i in indices]
    vert = _dist(pts[1], pts[5]) + _dist(pts[2], pts[4])
    horiz = _dist(pts[0], pts[3])
    return vert / (2.0*horiz) if horiz > 1e-6 else 1.0


def _mar(lm, w, h):
    top    = (lm[_MOUTH_TOP].x*w,    lm[_MOUTH_TOP].y*h)
    bottom = (lm[_MOUTH_BOTTOM].x*w, lm[_MOUTH_BOTTOM].y*h)
    left   = (lm[_MOUTH_LEFT].x*w,   lm[_MOUTH_LEFT].y*h)
    right  = (lm[_MOUTH_RIGHT].x*w,  lm[_MOUTH_RIGHT].y*h)
    return _dist(top, bottom) / (_dist(left, right) + 1e-6)


def _head_tilt(lm, w, h):
    le = (lm[33].x*w,  lm[33].y*h)
    re = (lm[263].x*w, lm[263].y*h)
    return math.degrees(math.atan2(re[1]-le[1], re[0]-le[0]))


def _face_bbox(lm):
    xs = [l.x for l in lm]
    ys = [l.y for l in lm]
    pad = 0.05
    return {
        "x": max(0.0, min(xs)-pad),
        "y": max(0.0, min(ys)-pad),
        "w": min(1.0, max(xs)-min(xs)+2*pad),
        "h": min(1.0, max(ys)-min(ys)+2*pad),
    }


# Landmarks enclosing both eyes (outer corners + brow area)
_EYE_REGION_IDX = [
    # Left eye outer landmarks
    362, 263, 386, 374,
    # Right eye outer landmarks
    33,  133, 159, 145,
    # Brow points (to include brow area)
    70, 63, 105, 66, 107,  # right brow
    336, 296, 334, 293, 300,  # left brow
]

def _eye_bbox(lm):
    pts = [lm[i] for i in _EYE_REGION_IDX]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    pad = 0.02
    return {
        "x": max(0.0, min(xs)-pad),
        "y": max(0.0, min(ys)-pad),
        "w": min(1.0, max(xs)-min(xs)+2*pad),
        "h": min(1.0, max(ys)-min(ys)+2*pad),
    }


def analyze_face_eye(image_path: str) -> dict:
    import mediapipe as mp

    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise ValueError(f"Cannot read image: {image_path}")

    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    result   = _get_landmarker().detect(mp_image)

    if not result.face_landmarks:
        return {"facesDetected": 0, "allEyesOpen": True, "badExpression": False}

    all_eyes_open  = True
    any_mouth_open = False
    worst_tilt     = 0.0
    best_smile     = 0.0
    face_bbox_out  = None
    eye_bbox_out   = None

    for i, face_lm in enumerate(result.face_landmarks):
        lm = face_lm

        # Eyes
        if _ear(lm, _LEFT_EYE, w, h) < _EAR_THRESHOLD or \
           _ear(lm, _RIGHT_EYE, w, h) < _EAR_THRESHOLD:
            all_eyes_open = False

        # Mouth
        if _mar(lm, w, h) > _MAR_OPEN_THRESHOLD:
            any_mouth_open = True

        # Head tilt
        tilt = abs(_head_tilt(lm, w, h))
        worst_tilt = max(worst_tilt, tilt)

        # Smile from blendshapes (mouthSmileLeft / mouthSmileRight)
        if result.face_blendshapes and i < len(result.face_blendshapes):
            shapes = {s.category_name: s.score for s in result.face_blendshapes[i]}
            smile  = (shapes.get("mouthSmileLeft", 0) + shapes.get("mouthSmileRight", 0)) / 2.0
            best_smile = max(best_smile, smile)

        # Bbox outputs for the first face
        if face_bbox_out is None:
            face_bbox_out = _face_bbox(lm)
            eye_bbox_out  = _eye_bbox(lm)

    bad = not all_eyes_open or any_mouth_open or worst_tilt > _TILT_THRESHOLD_DEG

    return {
        "facesDetected": len(result.face_landmarks),
        "allEyesOpen":   all_eyes_open,
        "smileScore":    round(best_smile, 3),
        "mouthOpen":     any_mouth_open,
        "headTiltDeg":   round(worst_tilt, 1),
        "badExpression": bad,
        "faceBbox":      face_bbox_out,
        "eyeBbox":       eye_bbox_out if face_bbox_out else None,
    }


def analyze_aesthetics(image_path: str) -> float:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    img_f = img.astype(np.float32)
    B, G, R = cv2.split(img_f)

    rg = R - G
    yb = 0.5*(R+G) - B
    colorfulness = math.sqrt(float(rg.std())**2 + float(yb.std())**2) + \
                   0.3*math.sqrt(float(rg.mean())**2 + float(yb.mean())**2)

    gray     = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    contrast = float(gray.std())

    hsv        = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = float(hsv[:,:,1].mean())

    raw   = 0.40*min(colorfulness/60.0, 1.0) + \
            0.35*min(contrast/70.0, 1.0)     + \
            0.25*min(saturation/120.0, 1.0)
    return round(1.0 + raw*9.0, 2)


def handle(req: dict) -> dict:
    req_id   = req.get("id")
    req_type = req.get("type")
    img_path = req.get("image_path", "")
    try:
        if req_type == "face_eye":
            result = analyze_face_eye(img_path)
        elif req_type == "aesthetics":
            result = {"aestheticsScore": analyze_aesthetics(img_path)}
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
            print(json.dumps({"id": None, "success": False, "error": str(exc)}), flush=True)
            continue
        print(json.dumps(handle(req)), flush=True)


if __name__ == "__main__":
    main()
