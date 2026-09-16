#!/usr/bin/env python3
"""Keep the source portrait and blend only generated hair into it."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


HAIR_CLASS_ID = 17
FACE_PARSING_MODEL = Path(__file__).parent / "models" / "face_parsing_resnet18.onnx"
MODEL_INPUT_SIZE = 512
MIN_OUTPUT_LONG_SIDE = 768
MODEL_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
MODEL_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def detect_face_data(image: np.ndarray) -> np.ndarray:
    image_height, image_width = image.shape[:2]
    model_path = Path(__file__).parent / "models" / "face_detection_yunet_2026may.onnx"
    detector = cv2.FaceDetectorYN.create(
        str(model_path),
        "",
        (image_width, image_height),
        score_threshold=0.72,
        nms_threshold=0.3,
        top_k=5000,
    )
    _, detections = detector.detect(image)
    if detections is None or len(detections) == 0:
        raise RuntimeError("front_facing_face_not_detected")
    return max(detections, key=lambda detection: detection[2] * detection[3])


def detect_face(image: np.ndarray) -> tuple[int, int, int, int]:
    return tuple(int(value) for value in detect_face_data(image)[:4])


def fit_to_source_canvas(source: np.ndarray, generated: np.ndarray) -> np.ndarray:
    """Center-crop to the source aspect ratio, then resize to its canvas."""
    source_height, source_width = source.shape[:2]
    generated_height, generated_width = generated.shape[:2]
    source_ratio = source_width / source_height
    generated_ratio = generated_width / generated_height

    if generated_ratio > source_ratio:
        crop_width = round(generated_height * source_ratio)
        left = max(0, (generated_width - crop_width) // 2)
        generated = generated[:, left : left + crop_width]
    elif generated_ratio < source_ratio:
        crop_height = round(generated_width / source_ratio)
        top = max(0, (generated_height - crop_height) // 2)
        generated = generated[top : top + crop_height, :]

    return cv2.resize(
        generated,
        (source_width, source_height),
        interpolation=cv2.INTER_LANCZOS4,
    )


def align_generated_to_source(source: np.ndarray, generated: np.ndarray) -> np.ndarray:
    generated = fit_to_source_canvas(source, generated)
    try:
        source_face = detect_face_data(source)
    except RuntimeError as error:
        raise RuntimeError("source_face_not_detected") from error
    try:
        generated_face = detect_face_data(generated)
    except RuntimeError as error:
        raise RuntimeError("generated_face_not_detected") from error
    source_landmarks = source_face[4:14].reshape(5, 2).astype(np.float32)
    generated_landmarks = generated_face[4:14].reshape(5, 2).astype(np.float32)

    source_eye_distance = float(
        np.linalg.norm(source_landmarks[0] - source_landmarks[1])
    )
    generated_eye_distance = float(
        np.linalg.norm(generated_landmarks[0] - generated_landmarks[1])
    )
    if min(source_eye_distance, generated_eye_distance) < 1.0:
        raise RuntimeError("unsafe_face_alignment_eye_distance")

    # Estimate a similarity transform (translation, uniform scale, rotation)
    # before judging safety. Gemini often returns the same portrait reframed by
    # 10–25%; rejecting the raw displacement made good source photos fail.
    transform, _ = cv2.estimateAffinePartial2D(
        generated_landmarks,
        source_landmarks,
        method=cv2.LMEDS,
    )
    if transform is None:
        raise RuntimeError("unsafe_face_alignment_transform")

    scale = float(np.hypot(transform[0, 0], transform[1, 0]))
    rotation = abs(
        float(np.degrees(np.arctan2(transform[1, 0], transform[0, 0])))
    )
    projected = cv2.transform(generated_landmarks[None, :, :], transform)[0]
    landmark_errors = (
        np.linalg.norm(projected - source_landmarks, axis=1) / source_eye_distance
    )

    shape_delta: list[float] = []
    for first in range(5):
        for second in range(first + 1, 5):
            source_distance = (
                np.linalg.norm(
                    source_landmarks[first] - source_landmarks[second]
                )
                / source_eye_distance
            )
            generated_distance = (
                np.linalg.norm(
                    generated_landmarks[first] - generated_landmarks[second]
                )
                / generated_eye_distance
            )
            shape_delta.append(abs(float(source_distance - generated_distance)))

    mean_landmark_error = float(landmark_errors.mean())
    max_landmark_error = float(landmark_errors.max())
    mean_shape_delta = float(np.mean(shape_delta))
    max_shape_delta = float(np.max(shape_delta))
    if not (
        0.70 <= scale <= 1.45
        and rotation <= 12.0
        and mean_landmark_error <= 0.08
        and max_landmark_error <= 0.16
        and mean_shape_delta <= 0.10
        and max_shape_delta <= 0.20
    ):
        raise RuntimeError(
            "unsafe_face_alignment_geometry:"
            f"scale={scale:.4f},rotation={rotation:.2f},"
            f"landmark_mean={mean_landmark_error:.4f},"
            f"landmark_max={max_landmark_error:.4f},"
            f"shape_mean={mean_shape_delta:.4f},shape_max={max_shape_delta:.4f}"
        )

    # Avoid an unnecessary second resample when the 1K output already
    # registers to the source. Even a 0.1° detector-jitter rotation can soften
    # individual strands and create a faint semantic-mask seam.
    translation_magnitude = float(np.hypot(transform[0, 2], transform[1, 2]))
    if (
        abs(scale - 1.0) <= 0.01
        and rotation <= 0.30
        and translation_magnitude <= min(source.shape[:2]) * 0.008
    ):
        return generated

    return cv2.warpAffine(
        generated,
        transform,
        (source.shape[1], source.shape[0]),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    )


def upscale_small_source(source: np.ndarray) -> np.ndarray:
    """Keep generated hair detail instead of shrinking it to a tiny upload."""
    height, width = source.shape[:2]
    longest_side = max(height, width)
    if longest_side >= MIN_OUTPUT_LONG_SIDE:
        return source
    scale = MIN_OUTPUT_LONG_SIDE / longest_side
    return cv2.resize(
        source,
        (round(width * scale), round(height * scale)),
        interpolation=cv2.INTER_LANCZOS4,
    )


def face_crop_bounds(
    image: np.ndarray,
    face: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    height, width = image.shape[:2]
    x, y, face_width, face_height = face
    crop_size = max(int(face_width * 1.9), int(face_height * 1.9))
    center_x = x + face_width // 2
    center_y = y + int(face_height * 0.18)
    left = max(0, center_x - crop_size // 2)
    top = max(0, center_y - crop_size // 2)
    right = min(width, center_x + crop_size // 2)
    bottom = min(height, center_y + crop_size // 2)
    return left, top, right, bottom


def segment_hair(
    image: np.ndarray,
    face: tuple[int, int, int, int],
    network: cv2.dnn.Net,
) -> tuple[np.ndarray, np.ndarray]:
    """Return semantic hair and label maps on the full portrait canvas."""
    left, top, right, bottom = face_crop_bounds(image, face)
    crop = image[top:bottom, left:right]
    resized = cv2.resize(
        crop,
        (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE),
        interpolation=cv2.INTER_LINEAR,
    )
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    normalized = (rgb - MODEL_MEAN) / MODEL_STD
    tensor = np.transpose(normalized, (2, 0, 1))[None].astype(np.float32)
    network.setInput(tensor)
    logits = network.forward("output")[0]
    labels = logits.argmax(axis=0).astype(np.uint8)
    crop_labels = cv2.resize(
        labels,
        (right - left, bottom - top),
        interpolation=cv2.INTER_NEAREST,
    )
    crop_mask = np.where(crop_labels == HAIR_CLASS_ID, 255, 0).astype(np.uint8)

    mask = np.zeros(image.shape[:2], dtype=np.uint8)
    mask[top:bottom, left:right] = crop_mask
    full_labels = np.zeros(image.shape[:2], dtype=np.uint8)
    full_labels[top:bottom, left:right] = crop_labels
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    # Keep plausible components inside the head area. A close fade or sideburn
    # can be disconnected from the top hair by a skin-colored gap, so keeping
    # only the single largest component would leave valid old-hair remnants.
    component_count, component_labels, stats, _ = cv2.connectedComponentsWithStats(
        mask,
        connectivity=8,
    )
    if component_count > 1:
        x, y, face_width, face_height = face
        minimum_area = max(12, int(face_width * face_height * 0.0003))
        plausible = np.zeros_like(mask)
        for label in range(1, component_count):
            component_x = stats[label, cv2.CC_STAT_LEFT]
            component_y = stats[label, cv2.CC_STAT_TOP]
            component_width = stats[label, cv2.CC_STAT_WIDTH]
            component_height = stats[label, cv2.CC_STAT_HEIGHT]
            component_area = stats[label, cv2.CC_STAT_AREA]
            center_x = component_x + component_width / 2
            center_y = component_y + component_height / 2
            inside_head = (
                x - 0.30 * face_width <= center_x <= x + 1.30 * face_width
                and center_y <= y + 0.58 * face_height
            )
            if component_area >= minimum_area and inside_head:
                plausible[component_labels == label] = 255
        # An all-zero plausible mask is useful: the caller will invoke the
        # conservative heuristic fallback instead of retaining false positives.
        mask = plausible
    return mask, full_labels


def build_heuristic_hair_mask(
    generated: np.ndarray,
    face: tuple[int, int, int, int],
) -> np.ndarray:
    """Fallback used only if semantic parsing unexpectedly returns no hair."""
    height, width = generated.shape[:2]
    x, y, face_width, face_height = face

    region = np.zeros((height, width), dtype=np.uint8)
    left = max(0, int(x - 0.18 * face_width))
    right = min(width, int(x + 1.18 * face_width))
    top = max(0, int(y - 0.78 * face_height))
    cap_center = (x + face_width // 2, y + int(0.08 * face_height))
    cap_axes = (int(0.62 * face_width), int(0.42 * face_height))
    cv2.ellipse(region, cap_center, cap_axes, 0, 180, 360, 255, -1)

    # Include closely tapered temple hair without exposing the central face.
    side_bottom = min(height, int(y + 0.34 * face_height))
    cv2.rectangle(region, (left, y), (int(x + 0.03 * face_width), side_bottom), 255, -1)
    cv2.rectangle(
        region,
        (int(x + 0.97 * face_width), y),
        (right, side_bottom),
        255,
        -1,
    )

    grayscale = cv2.cvtColor(generated, cv2.COLOR_BGR2GRAY)
    dark_hair = cv2.inRange(grayscale, 0, 105)

    # GrabCut separates the dark hairstyle from a dark studio background using
    # spatial continuity around the center hairline, not color alone.
    grab_mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    grab_mask[region > 0] = cv2.GC_PR_FGD
    seed = np.zeros_like(region)
    seed_left = max(0, int(x + 0.12 * face_width))
    seed_right = min(width, int(x + 0.88 * face_width))
    seed_top = max(0, int(y - 0.30 * face_height))
    seed_bottom = min(height, int(y + 0.03 * face_height))
    cv2.rectangle(seed, (seed_left, seed_top), (seed_right, seed_bottom), 255, -1)
    grab_mask[(seed > 0) & (dark_hair > 0)] = cv2.GC_FGD
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        generated,
        grab_mask,
        None,
        background_model,
        foreground_model,
        5,
        cv2.GC_INIT_WITH_MASK,
    )
    foreground = np.where(
        (grab_mask == cv2.GC_FGD) | (grab_mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)
    mask = cv2.bitwise_and(region, foreground)
    mask = cv2.bitwise_and(mask, dark_hair)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((13, 13), np.uint8))
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=1)

    # A curved face boundary avoids copying eyebrows or facial hair.
    protected_face = np.zeros_like(mask)
    face_center = (x + face_width // 2, y + int(0.64 * face_height))
    face_axes = (int(0.52 * face_width), int(0.58 * face_height))
    cv2.ellipse(
        protected_face,
        face_center,
        face_axes,
        0,
        0,
        360,
        255,
        -1,
    )

    mask[protected_face > 0] = 0
    return mask


def build_replacement_mask(
    source: np.ndarray,
    generated: np.ndarray,
    face: tuple[int, int, int, int],
    face_data: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Replace both the old and new hairstyle silhouettes.

    Copying generated-hair pixels alone leaves pieces of the customer's old
    hairstyle around a shorter generated cut. The union also copies generated
    forehead/background into source-only hair pixels, actually removing the
    old silhouette.
    """
    network = cv2.dnn.readNetFromONNX(str(FACE_PARSING_MODEL))
    source_hair, _ = segment_hair(source, face, network)
    generated_hair, generated_labels = segment_hair(generated, face, network)

    minimum_hair_pixels = max(150, int(face[2] * face[3] * 0.012))
    if np.count_nonzero(generated_hair) < minimum_hair_pixels:
        generated_hair = build_heuristic_hair_mask(generated, face)
    if np.count_nonzero(source_hair) < minimum_hair_pixels:
        source_hair = build_heuristic_hair_mask(source, face)

    replacement = cv2.bitwise_or(source_hair, generated_hair)
    replacement = cv2.morphologyEx(
        replacement,
        cv2.MORPH_CLOSE,
        np.ones((7, 7), np.uint8),
    )

    # Semantic parsers can occasionally connect dark eyebrows to temple hair.
    # Protect both eyes/eyebrows and the lower face, while leaving the forehead
    # editable so old bangs can actually be removed for an Ivy League cut.
    protected_face = np.zeros_like(replacement)
    x, y, face_width, face_height = face
    landmarks = face_data[4:14].reshape(5, 2)
    for eye in landmarks[:2]:
        cv2.ellipse(
            protected_face,
            (round(float(eye[0])), round(float(eye[1] - 0.025 * face_height))),
            (round(0.18 * face_width), round(0.12 * face_height)),
            0,
            0,
            360,
            255,
            -1,
        )
    cv2.ellipse(
        protected_face,
        (x + face_width // 2, y + round(0.82 * face_height)),
        (round(0.48 * face_width), round(0.40 * face_height)),
        0,
        0,
        360,
        255,
        -1,
    )
    replacement[protected_face > 0] = 0
    source_hair[protected_face > 0] = 0
    generated_hair[protected_face > 0] = 0
    # Protect the ears as well. Tight fades and sideburns may touch their outer
    # contour, but the ear pixels themselves must always come from the source.
    for ear_center_x in (x, x + face_width):
        cv2.ellipse(
            protected_face,
            (ear_center_x, y + round(0.50 * face_height)),
            (round(0.14 * face_width), round(0.25 * face_height)),
            0,
            0,
            360,
            255,
            -1,
        )
    source_hair[protected_face > 0] = 0
    generated_hair[protected_face > 0] = 0

    # Expand by one pixel so the blend crosses the antialiased outer edge
    # instead of ending on a dark source-hair pixel.
    replacement = cv2.dilate(replacement, np.ones((3, 3), np.uint8), iterations=1)
    replacement[protected_face > 0] = 0

    # Distance-based inward feathering never spills into the background. The
    # first few pixels ramp from source to generated rather than jumping from
    # alpha 0 to >80%, which previously produced a hard cutout edge.
    distance_inside = cv2.distanceTransform(replacement, cv2.DIST_L2, 5)
    feather_width = max(2.5, min(source.shape[:2]) / 300.0)
    feathered = np.clip(distance_inside / feather_width, 0.0, 1.0)
    feathered = np.round(feathered * 255.0).astype(np.uint8)

    # The core of pixels belonging only to the old hairstyle must be fully
    # replaced. Keep the outermost one-pixel band feathered so the replacement
    # does not create a new hard 255-to-0 cutout edge.
    source_only = (source_hair > 0) & (generated_hair == 0)
    source_only_core = cv2.erode(
        source_only.astype(np.uint8) * 255,
        np.ones((3, 3), np.uint8),
        iterations=1,
    )
    feathered[source_only_core > 0] = 255
    # Ear and face protection is the final authority, including after all
    # source-only mask adjustments.
    feathered[protected_face > 0] = 0
    generated_background = np.where(generated_labels == 0, 255, 0).astype(np.uint8)
    return feathered, source_hair, generated_hair, generated_background


def harmonize_simple_background(
    source: np.ndarray,
    generated: np.ndarray,
    replacement_mask: np.ndarray,
    source_hair_mask: np.ndarray,
    generated_hair_mask: np.ndarray,
    generated_background_mask: np.ndarray,
    face: tuple[int, int, int, int],
) -> np.ndarray:
    """Match removed outer hair to a genuinely simple source backdrop.

    Source-only hair can reveal either forehead skin (old bangs) or background
    (a shorter outer silhouette). Only the area outside a generous face and
    forehead oval is eligible for background recoloring.
    """
    height, width = source.shape[:2]
    border = np.zeros((height, width), dtype=np.uint8)
    border[: max(1, height // 10), :] = 255
    border[:, : max(1, width // 16)] = 255
    border[:, width - max(1, width // 16) :] = 255

    source_max = source.max(axis=2)
    source_min = source.min(axis=2)
    source_brightness = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
    source_samples = (
        (border > 0)
        & (source_brightness > 145)
        & ((source_max - source_min) < 75)
    )
    if np.count_nonzero(source_samples) < 100:
        return generated

    sampled_colors = source[source_samples].astype(np.float32)
    target_color = np.median(sampled_colors, axis=0)
    # A busy or graded background cannot be reconstructed from a single border
    # color. In that case, trust Gemini's locally generated pixels unchanged.
    if float(np.mean(np.std(sampled_colors, axis=0))) > 22.0:
        return generated

    generated_max = generated.max(axis=2)
    generated_min = generated.min(axis=2)
    generated_brightness = cv2.cvtColor(generated, cv2.COLOR_BGR2GRAY)

    x, y, face_width, face_height = face
    protected_skin = np.zeros((height, width), dtype=np.uint8)
    cv2.ellipse(
        protected_skin,
        (x + face_width // 2, y + round(0.43 * face_height)),
        (round(0.56 * face_width), round(0.58 * face_height)),
        0,
        0,
        360,
        255,
        -1,
    )
    source_only = (source_hair_mask > 0) & (generated_hair_mask == 0)
    neutral_generated_background = (
        (replacement_mask > 0)
        & source_only
        & (generated_background_mask > 0)
        & (protected_skin == 0)
        & (generated_brightness > 145)
        & ((generated_max - generated_min) < 55)
    )
    if not np.count_nonzero(neutral_generated_background):
        return generated

    result = generated.astype(np.float32)
    result[neutral_generated_background] = (
        result[neutral_generated_background] * 0.15 + target_color * 0.85
    )
    return np.clip(result, 0, 255).astype(np.uint8)


def harmonize_hair_color(
    source: np.ndarray,
    generated: np.ndarray,
    source_hair_mask: np.ndarray,
    generated_hair_mask: np.ndarray,
) -> np.ndarray:
    """Nudge generated hair toward the source photo's tone and exposure."""
    source_hair = source_hair_mask > 128
    generated_hair = generated_hair_mask > 128
    if np.count_nonzero(source_hair) < 100 or np.count_nonzero(generated_hair) < 100:
        return generated

    source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
    generated_lab = cv2.cvtColor(generated, cv2.COLOR_BGR2LAB).astype(np.float32)
    source_median = np.median(source_lab[source_hair], axis=0)
    generated_median = np.median(generated_lab[generated_hair], axis=0)
    # Limit the correction so highlights and strand texture stay intact.
    correction = np.clip(source_median - generated_median, [-14, -8, -8], [14, 8, 8])
    corrected_lab = generated_lab + correction.reshape(1, 1, 3)
    corrected_lab = np.clip(corrected_lab, 0, 255).astype(np.uint8)
    corrected = cv2.cvtColor(corrected_lab, cv2.COLOR_LAB2BGR)

    # Apply only near the prospective hair area.
    # Never spread color correction into the background around the hair.
    influence = cv2.GaussianBlur(generated_hair_mask, (5, 5), 0)
    influence[generated_hair_mask == 0] = 0
    alpha = influence.astype(np.float32)[:, :, None] / 255.0
    return np.clip(
        corrected.astype(np.float32) * alpha
        + generated.astype(np.float32) * (1.0 - alpha),
        0,
        255,
    ).astype(np.uint8)


def composite(
    source_path: Path,
    generated_path: Path,
    output_path: Path,
    style_id: str,
) -> dict[str, object]:
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    generated = cv2.imread(str(generated_path), cv2.IMREAD_COLOR)
    if source is None or generated is None:
        raise RuntimeError("image_decode_failed")

    source = upscale_small_source(source)
    generated = align_generated_to_source(source, generated)
    face_data = detect_face_data(source)
    face = tuple(int(value) for value in face_data[:4])
    mask, source_hair, generated_hair, generated_background = build_replacement_mask(
        source,
        generated,
        face,
        face_data,
    )
    generated = harmonize_simple_background(
        source,
        generated,
        mask,
        source_hair,
        generated_hair,
        generated_background,
        face,
    )
    generated = harmonize_hair_color(
        source,
        generated,
        source_hair,
        generated_hair,
    )
    alpha = mask.astype(np.float32)[:, :, None] / 255.0
    result = generated.astype(np.float32) * alpha + source.astype(np.float32) * (1.0 - alpha)
    result = np.clip(result, 0, 255).astype(np.uint8)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), result, [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError("image_encode_failed")

    x, y, width, height = face
    return {
        "face": {"x": int(x), "y": int(y), "width": int(width), "height": int(height)},
        "edited_pixel_ratio": round(float(np.count_nonzero(mask)) / mask.size, 4),
        "source_hair_pixel_ratio": round(
            float(np.count_nonzero(source_hair)) / source_hair.size,
            4,
        ),
        "generated_hair_pixel_ratio": round(
            float(np.count_nonzero(generated_hair)) / generated_hair.size,
            4,
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--generated", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--style-id", default="")
    args = parser.parse_args()
    print(json.dumps(composite(args.source, args.generated, args.output, args.style_id)))


if __name__ == "__main__":
    main()
