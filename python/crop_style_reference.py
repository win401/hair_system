#!/usr/bin/env python3
"""Create a hair-only crop so reference identities do not enter generation."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from hair_composite import detect_face


def crop_reference(source_path: Path, output_path: Path) -> None:
    image = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("image_decode_failed")
    x, y, width, height = detect_face(image)
    image_height, image_width = image.shape[:2]
    left = max(0, int(x - 0.28 * width))
    right = min(image_width, int(x + 1.28 * width))
    top = max(0, int(y - 0.78 * height))
    bottom = min(image_height, int(y + 0.22 * height))
    crop = image[top:bottom, left:right]

    # Fade the lower edge before the eyes so the model sees hair geometry, not
    # another person's full identity.
    alpha = np.full(crop.shape[:2], 255, dtype=np.uint8)
    fade_start = max(0, int((y + 0.02 * height) - top))
    fade_end = max(fade_start + 1, int((y + 0.22 * height) - top))
    for row in range(fade_start, min(fade_end, alpha.shape[0])):
        alpha[row, :] = int(255 * (fade_end - row) / (fade_end - fade_start))
    if fade_end < alpha.shape[0]:
        alpha[fade_end:, :] = 0
    bgra = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = alpha
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), bgra):
        raise RuntimeError("image_encode_failed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    crop_reference(args.source, args.output)


if __name__ == "__main__":
    main()
