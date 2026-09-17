"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  FaceLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useWizard } from "@/lib/wizard-context";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

type CameraStatus = "idle" | "starting" | "running" | "error";

type HairPlacement = {
  centerX: number;
  hairlineY: number;
  width: number;
  angle: number;
  yaw: number;
};

function mix(previous: number, next: number, amount: number) {
  return previous + (next - previous) * amount;
}

function getHairPlacement(
  landmarks: NormalizedLandmark[],
  canvasWidth: number,
  canvasHeight: number
): HairPlacement | null {
  const leftTemple = landmarks[127];
  const rightTemple = landmarks[356];
  const forehead = landmarks[10];
  const nose = landmarks[1];
  if (!leftTemple || !rightTemple || !forehead || !nose) return null;

  const leftX = leftTemple.x * canvasWidth;
  const leftY = leftTemple.y * canvasHeight;
  const rightX = rightTemple.x * canvasWidth;
  const rightY = rightTemple.y * canvasHeight;
  const faceWidth = Math.hypot(rightX - leftX, rightY - leftY);
  if (faceWidth < 40) return null;

  const templeSpan = Math.max(0.001, rightTemple.x - leftTemple.x);
  const noseBalance = (nose.x - leftTemple.x) / templeSpan;

  return {
    centerX: ((leftTemple.x + rightTemple.x) / 2) * canvasWidth,
    hairlineY: forehead.y * canvasHeight + faceWidth * 0.04,
    width: faceWidth * 1.34,
    angle: Math.atan2(rightY - leftY, rightX - leftX),
    yaw: Math.max(-1, Math.min(1, (noseBalance - 0.5) * 2.7)),
  };
}

function smoothPlacement(
  previous: HairPlacement | null,
  next: HairPlacement
): HairPlacement {
  if (!previous) return next;
  const amount = 0.24;
  return {
    centerX: mix(previous.centerX, next.centerX, amount),
    hairlineY: mix(previous.hairlineY, next.hairlineY, amount),
    width: mix(previous.width, next.width, amount),
    angle: mix(previous.angle, next.angle, amount),
    yaw: mix(previous.yaw, next.yaw, amount),
  };
}

function drawIvyLeagueHair(
  context: CanvasRenderingContext2D,
  placement: HairPlacement,
  size: number,
  opacity: number
) {
  const width = placement.width * size;
  const height = width * 0.58;
  const horizontalShift = placement.yaw * width * 0.04;

  context.save();
  context.translate(
    placement.centerX + horizontalShift,
    placement.hairlineY + height * 0.04
  );
  context.rotate(placement.angle);
  context.globalAlpha = opacity;

  const gradient = context.createLinearGradient(0, -height, 0, height * 0.2);
  gradient.addColorStop(0, "#232323");
  gradient.addColorStop(0.5, "#111111");
  gradient.addColorStop(1, "#050505");
  context.fillStyle = gradient;
  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = Math.max(4, width * 0.025);

  context.beginPath();
  context.moveTo(-width * 0.51, height * 0.13);
  context.bezierCurveTo(
    -width * 0.52,
    -height * 0.2,
    -width * 0.42,
    -height * 0.48,
    -width * 0.3,
    -height * 0.58
  );
  const spikes = [
    [-0.3, -0.58],
    [-0.24, -0.76],
    [-0.18, -0.62],
    [-0.1, -0.84],
    [-0.02, -0.66],
    [0.06, -0.86],
    [0.14, -0.65],
    [0.22, -0.78],
    [0.29, -0.58],
  ];
  for (const [x, y] of spikes) context.lineTo(width * x, height * y);
  context.bezierCurveTo(
    width * 0.43,
    -height * 0.46,
    width * 0.52,
    -height * 0.19,
    width * 0.5,
    height * 0.14
  );
  context.bezierCurveTo(
    width * 0.34,
    height * 0.04,
    width * 0.18,
    -height * 0.02,
    0,
    0
  );
  context.bezierCurveTo(
    -width * 0.18,
    -height * 0.02,
    -width * 0.35,
    height * 0.04,
    -width * 0.51,
    height * 0.13
  );
  context.closePath();
  context.fill();

  context.shadowBlur = 0;
  context.strokeStyle = "rgba(98, 98, 98, 0.34)";
  context.lineWidth = Math.max(1, width * 0.006);
  context.lineCap = "round";
  for (let index = -8; index <= 8; index += 1) {
    const x = (index / 19) * width;
    const lean = (index / 8) * width * 0.025;
    context.beginPath();
    context.moveTo(x, -height * 0.04);
    context.quadraticCurveTo(
      x + lean,
      -height * 0.34,
      x + lean * 1.6,
      -height * (0.54 + (Math.abs(index) % 3) * 0.05)
    );
    context.stroke();
  }
  context.restore();
}

async function createFaceLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const commonOptions = {
    baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
    runningMode: "VIDEO" as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, {
      ...commonOptions,
      baseOptions: { ...commonOptions.baseOptions, delegate: "GPU" },
    });
  } catch {
    return FaceLandmarker.createFromOptions(vision, commonOptions);
  }
}

function stopMediaStream(streamRef: RefObject<MediaStream | null>) {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}

export function CameraExperience() {
  const router = useRouter();
  const wizard = useWizard();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<FrameRequestCallback>(() => undefined);
  const lastVideoTimeRef = useRef(-1);
  const placementRef = useRef<HairPlacement | null>(null);
  const guideUpdateRef = useRef(0);

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guideMessage, setGuideMessage] = useState(
    "카메라를 시작하면 얼굴 위치를 안내해 드려요."
  );
  const [hairSize, setHairSize] = useState(1);
  const [hairOpacity, setHairOpacity] = useState(0.88);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const hairSizeRef = useRef(hairSize);
  const hairOpacityRef = useRef(hairOpacity);

  useEffect(() => {
    hairSizeRef.current = hairSize;
  }, [hairSize]);

  useEffect(() => {
    hairOpacityRef.current = hairOpacity;
  }, [hairOpacity]);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    stopMediaStream(streamRef);
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    placementRef.current = null;
    lastVideoTimeRef.current = -1;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(renderFrameRef.current);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks[0];
      if (landmarks) {
        const nextPlacement = getHairPlacement(
          landmarks,
          canvas.width,
          canvas.height
        );
        if (nextPlacement) {
          placementRef.current = smoothPlacement(
            placementRef.current,
            nextPlacement
          );
          drawIvyLeagueHair(
            context,
            placementRef.current,
            hairSizeRef.current,
            hairOpacityRef.current
          );
          if (performance.now() - guideUpdateRef.current > 350) {
            guideUpdateRef.current = performance.now();
            setGuideMessage(
              Math.abs(placementRef.current.yaw) > 0.46
                ? "현재 2D 필터는 정면용이에요. 얼굴을 조금만 정면으로 돌려주세요."
                : "얼굴을 찾았어요. 크기와 농도를 조절한 뒤 촬영해 보세요."
            );
          }
        }
      } else if (performance.now() - guideUpdateRef.current > 350) {
        guideUpdateRef.current = performance.now();
        placementRef.current = null;
        setGuideMessage("얼굴 전체와 이마가 화면에 들어오도록 맞춰주세요.");
      }
    } else if (placementRef.current) {
      drawIvyLeagueHair(
        context,
        placementRef.current,
        hairSizeRef.current,
        hairOpacityRef.current
      );
    }

    animationFrameRef.current = requestAnimationFrame(renderFrameRef.current);
  }, []);

  useEffect(() => {
    renderFrameRef.current = renderFrame;
  }, [renderFrame]);

  async function startCamera() {
    if (!privacyAccepted) {
      setErrorMessage("카메라 처리 안내를 확인하고 동의해 주세요.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("이 브라우저에서는 카메라를 사용할 수 없어요.");
      setStatus("error");
      return;
    }

    setCapturedImage(null);
    setErrorMessage(null);
    setStatus("starting");

    try {
      const landmarkerPromise = createFaceLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 1280 },
            aspectRatio: { ideal: 0.75 },
          },
        });
      streamRef.current = stream;
      const landmarker = await landmarkerPromise;
      landmarkerRef.current = landmarker;

      const video = videoRef.current;
      if (!video) throw new Error("camera_view_missing");
      video.srcObject = stream;
      await video.play();
      setStatus("running");
      animationFrameRef.current = requestAnimationFrame(renderFrameRef.current);
    } catch (error) {
      stopMediaStream(streamRef);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setStatus("error");
      setErrorMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "카메라 권한이 거부됐어요. 브라우저 설정에서 권한을 허용한 뒤 다시 시도해 주세요."
          : "카메라 또는 얼굴 추적 모델을 시작하지 못했어요. 네트워크와 브라우저 설정을 확인해 주세요."
      );
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    const placement = placementRef.current;
    if (!video || !placement) {
      setErrorMessage("먼저 얼굴을 화면 안에 맞춰주세요.");
      return;
    }

    const capture = document.createElement("canvas");
    capture.width = video.videoWidth;
    capture.height = video.videoHeight;
    const context = capture.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, capture.width, capture.height);
    drawIvyLeagueHair(context, placement, hairSize, hairOpacity);
    setCapturedImage(capture.toDataURL("image/jpeg", 0.92));
    stopCamera();
  }

  function useCapturedImage() {
    if (!capturedImage) return;
    wizard.setSelfieConsent(true);
    wizard.setSelfie(capturedImage);
    router.push("/start/demo-salon");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-4 pb-8">
      <header className="flex items-start justify-between gap-4 pt-2">
        <div>
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
            카메라 AR 베타
          </span>
          <h1 className="mt-3 text-2xl font-semibold">아이비리그컷 바로 보기</h1>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            얼굴 추적은 이 기기 안에서 처리합니다. 촬영한 사진을 선택하기
            전에는 서버로 보내거나 저장하지 않아요.
          </p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-neutral-500 underline">
          나가기
        </Link>
      </header>

      <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-950 shadow-sm">
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          {capturedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedImage}
              alt="카메라로 촬영한 아이비리그컷 미리보기"
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
              />
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
                aria-hidden="true"
              />
              {status !== "running" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950 px-8 text-center text-white">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
                    {status === "starting" ? "…" : "✦"}
                  </div>
                  <p className="font-medium">
                    {status === "starting"
                      ? "카메라와 얼굴 추적을 준비하고 있어요"
                      : "전면 카메라로 정면 얼굴을 맞춰보세요"}
                  </p>
                  <p className="text-xs leading-5 text-white/60">
                    첫 실행은 약 5~15초 걸릴 수 있어요.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-white/10 bg-neutral-900 px-4 py-3 text-center text-xs leading-5 text-neutral-200">
          {capturedImage ? "이 사진을 정밀 AI 체험에 사용할까요?" : guideMessage}
        </div>
      </section>

      {!capturedImage && (
        <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 p-4">
          <label className="flex items-start gap-2 text-sm leading-5">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.target.checked)}
              disabled={status === "running" || status === "starting"}
              className="mt-1"
            />
            실시간 영상은 기기에서만 처리되고, 촬영한 사진은 제가 “이 사진
            사용”을 눌렀을 때만 브라우저에 보관된다는 내용을 확인했습니다.
          </label>

          {status === "running" && (
            <div className="grid grid-cols-2 gap-4">
              <label className="text-xs font-medium text-neutral-600">
                머리 크기
                <input
                  type="range"
                  min="0.82"
                  max="1.22"
                  step="0.01"
                  value={hairSize}
                  onChange={(event) => setHairSize(Number(event.target.value))}
                  className="mt-2 w-full accent-neutral-900"
                />
              </label>
              <label className="text-xs font-medium text-neutral-600">
                합성 농도
                <input
                  type="range"
                  min="0.55"
                  max="1"
                  step="0.01"
                  value={hairOpacity}
                  onChange={(event) => setHairOpacity(Number(event.target.value))}
                  className="mt-2 w-full accent-neutral-900"
                />
              </label>
            </div>
          )}

          {errorMessage && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm leading-5 text-red-700">
              {errorMessage}
            </p>
          )}

          {status === "running" ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={captureFrame}
                className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
              >
                지금 모습 촬영
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-xl border border-neutral-300 px-4 py-3 text-sm"
              >
                중지
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              disabled={status === "starting" || !privacyAccepted}
              className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {status === "starting" ? "준비 중…" : "카메라 시작"}
            </button>
          )}
        </section>
      )}

      {capturedImage && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setCapturedImage(null);
              void startCamera();
            }}
            className="rounded-xl border border-neutral-300 px-4 py-3 text-sm"
          >
            다시 촬영
          </button>
          <button
            type="button"
            onClick={useCapturedImage}
            className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
          >
            이 사진 사용
          </button>
        </div>
      )}

      <aside className="rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        <strong className="block text-sm">현재 베타의 한계</strong>
        지금은 정면용 2D 실루엣이라 고개를 크게 돌리면 스티커처럼 보여요.
        좌·우·후면까지 자연스럽게 보이려면 다음 단계에서 3D 헤어 자산과 귀·얼굴
        가림 처리가 필요합니다.
      </aside>
    </main>
  );
}
