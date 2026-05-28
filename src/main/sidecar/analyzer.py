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
_EAR_THRESHOLD   = 0.17   # lower = only clearly closed eyes (was 0.20)

# ── Mouth ─────────────────────────────────────────────────────────────────
_MOUTH_LEFT   = 61
_MOUTH_RIGHT  = 291
_MOUTH_TOP    = 13
_MOUTH_BOTTOM = 14
_MAR_OPEN_THRESHOLD = 0.55  # higher = only wide-open/yawning (was 0.35)

# Head tilt: informational only — NOT included in badExpression for model shots.
# Intentional model poses often have 30-60° tilts.
_TILT_INFO_THRESHOLD_DEG = 60.0  # shown in UI but does not flag bad expression

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


def _eye_bbox(lm):
    """
    Very tight crop around both eyes — just enough to judge sharpness and
    whether eyes are open. Uses only the eye-corner landmarks (no brows).
    Iris centers (468, 473) are used when available (refine_landmarks=True).
    """
    # Tight eye corners only — no brows
    eye_pts_idx = [
        33,  133, 159, 145, 160, 144,  # right eye
        362, 263, 386, 374, 385, 380,  # left eye
    ]
    pts = [lm[i] for i in eye_pts_idx]

    # If iris landmarks are present (478-point model), use them for centring
    if len(lm) > 473:
        pts += [lm[468], lm[473]]  # right iris, left iris centres

    xs  = [p.x for p in pts]
    ys  = [p.y for p in pts]

    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    eye_w = x_max - x_min
    eye_h = y_max - y_min

    # Add small horizontal padding, generous vertical so eye whites show
    pad_x = eye_w * 0.25
    pad_y = eye_h * 0.80   # eyes are thin — pad more vertically

    return {
        "x": max(0.0, x_min - pad_x),
        "y": max(0.0, y_min - pad_y),
        "w": min(1.0, eye_w + 2 * pad_x),
        "h": min(1.0, eye_h + 2 * pad_y),
    }


def analyze_face_eye(image_path: str) -> dict:
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise ValueError(f"Cannot read image: {image_path}")
    return _face_eye_from_img(img_bgr)


def _face_eye_from_img(img_bgr) -> dict:
    import mediapipe as mp

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

    # badExpression: only eyes closed or mouth clearly wide open.
    # Head tilt is intentional for model/portrait photography — not flagged.
    bad = not all_eyes_open or any_mouth_open

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


# ── Lazy-loaded NIMA ONNX model (required — no heuristic fallback) ─────────
_nima_session = None
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _get_nima():
    global _nima_session
    if _nima_session is not None:
        return _nima_session

    model_path = os.path.join(os.path.dirname(__file__), "nima.onnx")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"nima.onnx not found at {model_path}")
    import onnxruntime as ort
    _nima_session = ort.InferenceSession(
        model_path, providers=["CPUExecutionProvider"]
    )
    return _nima_session


def _nima_score(img) -> float:
    session = _get_nima()
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, (224, 224), interpolation=cv2.INTER_AREA)
    x = rgb.astype(np.float32) / 255.0
    x = (x - _IMAGENET_MEAN) / _IMAGENET_STD
    x = np.transpose(x, (2, 0, 1))[np.newaxis, ...].astype(np.float32)
    probs = session.run(None, {session.get_inputs()[0].name: x})[0][0]
    buckets = np.arange(1, len(probs) + 1, dtype=np.float32)
    return round(float((probs * buckets).sum()), 2)


def analyze_aesthetics(image_path: str) -> float:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    return _aesthetics_from_img(img)


def _aesthetics_from_img(img) -> float:
    return _nima_score(img)


def handle(req: dict) -> dict:
    req_id   = req.get("id")
    req_type = req.get("type")
    img_path = req.get("image_path", "")
    try:
        if req_type == "analyze":
            img = cv2.imread(img_path)
            if img is None:
                raise ValueError(f"Cannot read image: {img_path}")
            result = _face_eye_from_img(img)
            # Aesthetics is best-effort: a NIMA failure must not discard the
            # face/eye result computed above.
            try:
                result["aestheticsScore"] = _aesthetics_from_img(img)
            except Exception as exc:
                result["aestheticsError"] = str(exc)
        elif req_type == "face_eye":
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
