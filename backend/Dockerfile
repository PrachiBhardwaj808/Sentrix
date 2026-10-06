FROM python:3.12-slim

ARG INSTALL_AI=true

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libglib2.0-0 \
       libgl1 \
       libgomp1 \
       gdal-bin \
       libgdal-dev \
       curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-web.txt requirements-services.txt requirements-ai.txt ./
RUN pip install --no-cache-dir -r requirements-web.txt -r requirements-services.txt \
    && if [ "$INSTALL_AI" = "true" ]; then pip install --no-cache-dir -r requirements-ai.txt; fi

COPY . .

RUN mkdir -p /app/.localdata/models

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
