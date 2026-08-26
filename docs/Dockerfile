FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DOCS_HOST=0.0.0.0 \
    DOCS_PORT=8091

WORKDIR /app

COPY docs_service ./docs_service
COPY static ./static

EXPOSE 8091

CMD ["python", "-m", "docs_service"]
