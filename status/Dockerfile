FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATUS_HOST=0.0.0.0 \
    STATUS_PORT=8090 \
    STATUS_DATA_DIR=/data

WORKDIR /app

COPY status_service ./status_service
COPY static ./static

EXPOSE 8090

CMD ["python", "-m", "status_service"]
