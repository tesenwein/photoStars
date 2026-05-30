#!/usr/bin/env python3
"""
Reproducible converter: NIMA (MobileNetV2) PyTorch checkpoint -> nima.onnx.

NIMA (Neural Image Assessment) is a CNN with a 10-way softmax head over score
buckets 1..10. The aesthetic score is the expected value of that distribution,
sum(p[i] * (i+1)), a float in [1, 10] — the contract the sidecar exposes as
`aestheticsScore`.

This is a SELF-CONTAINED, version-independent converter. It vendors the exact
MobileNetV2 + NIMA architecture from truskovskiyk/nima.pytorch (v1) using only
torch.nn primitives, so it does not depend on a specific torchvision version or
on that repo staying online. It downloads the published AVA-trained checkpoint
(~9 MB) from S3 if not already present, then exports nima.onnx with a dynamic
batch axis.

The checkpoint and the resulting nima.onnx are NOT committed to git — every
developer/build reproduces nima.onnx by running this script (see setup.ps1 /
setup.sh, which invoke it through uv with a pinned Python + torch).

Usage:
  uv run --python 3.12 --with torch --with onnx \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      python tools/convert_nima_onnx.py --out src/main/sidecar/nima.onnx
"""
import argparse
import os
import sys
import urllib.request

import torch
import torch.nn as nn

CHECKPOINT_URL = "https://s3-us-west-1.amazonaws.com/models-nima/pretrain-model.pth"


# ── Vendored MobileNetV2 (truskovskiyk/nima.pytorch v1) ────────────────────
def conv_bn(inp, oup, stride):
    return nn.Sequential(
        nn.Conv2d(inp, oup, 3, stride, 1, bias=False),
        nn.BatchNorm2d(oup),
        nn.ReLU(inplace=True),
    )


def conv_1x1_bn(inp, oup):
    return nn.Sequential(
        nn.Conv2d(inp, oup, 1, 1, 0, bias=False),
        nn.BatchNorm2d(oup),
        nn.ReLU(inplace=True),
    )


class InvertedResidual(nn.Module):
    def __init__(self, inp, oup, stride, expand_ratio):
        super().__init__()
        self.use_res_connect = stride == 1 and inp == oup
        hidden = inp * expand_ratio
        self.conv = nn.Sequential(
            nn.Conv2d(inp, hidden, 1, 1, 0, bias=False),
            nn.BatchNorm2d(hidden),
            nn.ReLU6(inplace=True),
            nn.Conv2d(hidden, hidden, 3, stride, 1, groups=hidden, bias=False),
            nn.BatchNorm2d(hidden),
            nn.ReLU6(inplace=True),
            nn.Conv2d(hidden, oup, 1, 1, 0, bias=False),
            nn.BatchNorm2d(oup),
        )

    def forward(self, x):
        return x + self.conv(x) if self.use_res_connect else self.conv(x)


class MobileNetV2(nn.Module):
    def __init__(self, input_size=224, width_mult=1.0):
        super().__init__()
        setting = [
            [1, 16, 1, 1], [6, 24, 2, 2], [6, 32, 3, 2], [6, 64, 4, 2],
            [6, 96, 3, 1], [6, 160, 3, 2], [6, 320, 1, 1],
        ]
        input_channel = int(32 * width_mult)
        self.last_channel = 1280
        feats = [conv_bn(3, input_channel, 2)]
        for t, c, n, s in setting:
            output_channel = int(c * width_mult)
            for i in range(n):
                feats.append(InvertedResidual(
                    input_channel, output_channel, s if i == 0 else 1, t))
                input_channel = output_channel
        feats.append(conv_1x1_bn(input_channel, self.last_channel))
        feats.append(nn.AvgPool2d(input_size // 32))
        self.features = nn.Sequential(*feats)
        self.classifier = nn.Sequential(
            nn.Dropout(), nn.Linear(self.last_channel, 1000))

    def forward(self, x):
        x = self.features(x)
        x = x.view(-1, self.last_channel)
        return self.classifier(x)


class NIMA(nn.Module):
    def __init__(self):
        super().__init__()
        base = MobileNetV2()
        self.base_model = nn.Sequential(*list(base.children())[:-1])  # = features
        self.head = nn.Sequential(
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.75),
            nn.Linear(1280, 10),
            nn.Softmax(dim=1),
        )

    def forward(self, x):
        x = self.base_model(x)
        x = x.view(x.size(0), -1)
        return self.head(x)


def _download(url: str, dest: str) -> str:
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    if os.path.exists(dest):
        return dest
    print(f"[..] downloading checkpoint -> {dest}")
    urllib.request.urlretrieve(url, dest)
    return dest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--checkpoint", default="tools/_ckpt/pretrain-model.pth",
                    help="path to NIMA .pth (downloaded automatically if absent)")
    ap.add_argument("--out", default="src/main/sidecar/nima.onnx")
    ap.add_argument("--opset", type=int, default=17)
    args = ap.parse_args()

    ckpt = _download(CHECKPOINT_URL, args.checkpoint)
    state = torch.load(ckpt, map_location="cpu")
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    model = NIMA()
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        print(f"[error] state_dict mismatch: {len(missing)} missing, "
              f"{len(unexpected)} unexpected", file=sys.stderr)
        print(f"        missing: {missing[:5]}", file=sys.stderr)
        print(f"        unexpected: {unexpected[:5]}", file=sys.stderr)
        return 1

    model.eval()
    dummy = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        probs = model(dummy)
    score = float((probs[0] * torch.arange(1, 11)).sum())
    print(f"[ok] sanity forward pass: score={score:.2f} (expect ~1..10)")

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    torch.onnx.export(
        model, dummy, args.out,
        input_names=["input"], output_names=["scores"],
        dynamic_axes={"input": {0: "batch"}, "scores": {0: "batch"}},
        opset_version=args.opset,
    )

    # Consolidate into a single self-contained file. The exporter may externalize
    # weights to <out>.data; embed them so only one file needs to ship.
    import onnx
    m = onnx.load(args.out)  # resolves external data if present
    onnx.save_model(m, args.out, save_as_external_data=False)
    data_file = args.out + ".data"
    if os.path.exists(data_file):
        os.remove(data_file)
    size_mb = os.path.getsize(args.out) / 1e6
    print(f"[ok] wrote {args.out} ({size_mb:.1f} MB, single file)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
