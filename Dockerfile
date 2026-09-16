# Standalone hair-compositing service. Deploy this separately from the
# Next.js app (Vercel's Node.js functions cannot run this) — see
# python/server.py and docs/05-mvp-implementation-plan.md.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements-server.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-server.txt

COPY python/ ./python/

EXPOSE 8000
# Shell form so ${PORT} expands at container start — Render (and similar
# platforms) inject their own PORT and route traffic only to that port,
# ignoring EXPOSE. Falls back to 8000 for plain `docker run` locally.
CMD exec uvicorn python.server:app --host 0.0.0.0 --port ${PORT:-8000}
