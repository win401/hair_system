"""HTTP wrapper around hair_composite.composite() for out-of-process deployment.

Vercel's Node.js serverless functions cannot execute a Python subprocess or
ship OpenCV/model binaries, so this runs as its own service (e.g. on
Render/Fly.io). lib/server/hair-compositor.ts calls this over HTTP when
HAIR_COMPOSITOR_PROVIDER=http. The local-subprocess "python" provider stays
available for dev convenience and reuses the same composite() function.
"""

from __future__ import annotations

import base64
import binascii
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .hair_composite import composite

app = FastAPI()

MAX_IMAGE_BYTES = 6 * 1024 * 1024
API_KEY = os.environ.get("HAIR_COMPOSITOR_API_KEY")


class CompositeRequest(BaseModel):
    source_base64: str
    generated_base64: str
    style_id: str = ""


def decode_image(value: str, field: str) -> bytes:
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"invalid_base64:{field}") from error
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail=f"invalid_size:{field}")
    return data


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/composite")
def composite_endpoint(
    payload: CompositeRequest,
    x_api_key: str | None = Header(default=None),
) -> JSONResponse:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="unauthorized")

    source_bytes = decode_image(payload.source_base64, "source")
    generated_bytes = decode_image(payload.generated_base64, "generated")

    with tempfile.TemporaryDirectory(prefix="hair-composite-") as work_dir:
        work_path = Path(work_dir)
        source_path = work_path / "source.jpg"
        generated_path = work_path / "generated.jpg"
        output_path = work_path / "output.jpg"
        source_path.write_bytes(source_bytes)
        generated_path.write_bytes(generated_bytes)

        try:
            metrics = composite(source_path, generated_path, output_path, payload.style_id)
        except RuntimeError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        output_base64 = base64.b64encode(output_path.read_bytes()).decode("ascii")

    return JSONResponse({"output_base64": output_base64, "metrics": metrics})
