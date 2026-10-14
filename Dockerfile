# Server TTS Studio SCORM (file main.py & requirements.txt ada di root repo) — siap untuk Render, Railway, Fly.io, Hugging Face Spaces (Docker), atau VPS.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
# Port bawaan 7860 = Hugging Face Spaces. Render/Railway mengisi $PORT sendiri.
ENV PORT=7860 TRUST_PROXY=1 CACHE_DIR=/tmp/tts-cache
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
