FROM node:22-bookworm-slim AS frontend
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1 HOST=0.0.0.0 PORT=8000 DATA_DIR=/app/data
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY backend/ backend/
COPY scripts/ scripts/
COPY demo/ demo/
COPY --from=frontend /web/dist/ frontend/dist/
RUN useradd --create-home --uid 10001 appuser && mkdir -p /app/data && chown -R appuser /app
USER appuser
EXPOSE 8000
CMD ["python","scripts/serve.py"]
