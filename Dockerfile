# Dockerfile — Playwright + Python + FastAPI app
# Uses Playwright official base so browsers are preinstalled.
FROM mcr.microsoft.com/playwright/python:latest

# Set working dir
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .

# Install Python deps (pip inside image)
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY . /app

# Expose port (Render provides $PORT)
ENV PORT=10000
EXPOSE 10000

# Ensure uvicorn is available; use env var PORT if provided
CMD ["bash", "-lc", "uvicorn app_single_improved:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
