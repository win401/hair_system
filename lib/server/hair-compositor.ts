import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMPOSITOR_WARMUP_TIMEOUT_MS = 75_000;
const COMPOSITOR_REQUEST_TIMEOUT_MS = 90_000;

export async function ensureHairCompositorReady() {
  if ((process.env.HAIR_COMPOSITOR_PROVIDER ?? "python") !== "http") return;

  const serviceUrl = requireCompositorServiceUrl();
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(COMPOSITOR_WARMUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as {
      status?: string;
    } | null;
    if (body?.status !== "ok") {
      throw new Error("invalid_health_response");
    }
  } catch (error) {
    console.error("[hair-compositor] warmup failed:", error);
    throw new Error(
      "헤어 합성 서버를 준비하지 못했어요. 이미지 생성 비용은 발생하지 않았습니다. 잠시 후 다시 시도해 주세요."
    );
  }
}

export async function preserveOriginalPortrait({
  sourceDataUrl,
  generatedBase64,
  styleId,
}: {
  sourceDataUrl: string;
  generatedBase64: string;
  styleId: string;
}) {
  const provider = process.env.HAIR_COMPOSITOR_PROVIDER ?? "python";

  // Vercel's Node.js functions cannot run the "python" subprocess mode below
  // (no interpreter, no OpenCV, no model files) — production deployments use
  // "http" against a separately-deployed service (see python/server.py and
  // the Dockerfile at the repo root).
  if (provider === "http") {
    return compositeViaHttpService({ sourceDataUrl, generatedBase64, styleId });
  }
  if (provider !== "python") {
    return `data:image/jpeg;base64,${generatedBase64}`;
  }

  const workDirectory = await mkdtemp(path.join(tmpdir(), "hair-composite-"));
  const sourcePath = path.join(workDirectory, "source.jpg");
  const generatedPath = path.join(workDirectory, "generated.jpg");
  const outputPath = path.join(workDirectory, "output.jpg");

  try {
    await Promise.all([
      writeFile(sourcePath, decodeDataUrl(sourceDataUrl)),
      writeFile(generatedPath, Buffer.from(generatedBase64, "base64")),
    ]);
    // Keep the environment-specific virtualenv path out of the module graph.
    // A literal project-local Python symlink makes Turbopack follow it beyond
    // the project root and abort an otherwise valid production build.
    const pythonBinary = process.env.HAIR_PYTHON_BIN ?? "python3";
    try {
      await execFileAsync(
        pythonBinary,
        [
          path.join(process.cwd(), "python/hair_composite.py"),
          "--source",
          sourcePath,
          "--generated",
          generatedPath,
          "--output",
          outputPath,
          "--style-id",
          styleId,
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 }
      );
    } catch (error) {
      throw new Error(toSafeCompositeMessage(error));
    }
    return `data:image/jpeg;base64,${(await readFile(outputPath)).toString("base64")}`;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function compositeViaHttpService({
  sourceDataUrl,
  generatedBase64,
  styleId,
}: {
  sourceDataUrl: string;
  generatedBase64: string;
  styleId: string;
}) {
  const serviceUrl = requireCompositorServiceUrl();
  const apiKey = process.env.HAIR_COMPOSITOR_API_KEY;

  let response: Response;
  try {
    response = await fetch(`${serviceUrl}/composite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      body: JSON.stringify({
        source_base64: extractBase64(sourceDataUrl),
        generated_base64: generatedBase64,
        style_id: styleId,
      }),
      signal: AbortSignal.timeout(COMPOSITOR_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(toSafeCompositeMessage(error));
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(toSafeCompositeMessage(body?.detail ?? `http_${response.status}`));
  }

  const body = (await response.json()) as {
    output_base64: string;
    metrics?: unknown;
  };
  if (body.metrics) {
    console.error(
      "[hair-compositor] http composite metrics:",
      JSON.stringify(body.metrics)
    );
  }
  return `data:image/jpeg;base64,${body.output_base64}`;
}

function requireCompositorServiceUrl() {
  const serviceUrl = process.env.HAIR_COMPOSITOR_SERVICE_URL;
  if (!serviceUrl) {
    throw new Error(
      "HAIR_COMPOSITOR_SERVICE_URL is required when HAIR_COMPOSITOR_PROVIDER=http."
    );
  }
  return serviceUrl.replace(/\/$/, "");
}

function extractBase64(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("invalid_source_data_url");
  return dataUrl.slice(commaIndex + 1);
}

function toSafeCompositeMessage(error: unknown) {
  const detail =
    typeof error === "object" && error !== null
      ? `${"message" in error ? String(error.message) : ""}\n${
          "stderr" in error ? String(error.stderr) : ""
        }`
      : String(error);

  // The scale/rotation/landmark-error numbers behind an "unsafe" rejection
  // were being discarded here, leaving no way to tell a genuine misalignment
  // apart from an overly strict threshold. Log them server-side so failures
  // are actually diagnosable.
  console.error("[hair-compositor] composite failed:", detail);

  if (
    detail.includes("unsafe_face_alignment") ||
    detail.includes("generated_face_not_detected")
  ) {
    return "사진 문제는 아니지만, 이번 AI 결과가 원본 얼굴의 크기나 구도를 지나치게 바꿔 안전하게 사용하지 않았어요. 사진은 그대로 유지되며 같은 조건으로 다시 생성할 수 있어요.";
  }
  if (
    detail.includes("source_face_not_detected") ||
    detail.includes("front_facing_face_not_detected")
  ) {
    return "사진에서 정면 얼굴을 찾지 못했어요. 밝은 곳에서 얼굴과 머리 전체가 보이도록 다시 촬영해 주세요.";
  }
  return "헤어 합성 마무리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

function decodeDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("invalid_source_data_url");
  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}
