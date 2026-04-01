FROM python:3.9-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/home/user/.local/bin:$PATH"

# Set up a new user 'user' with UID 1000 for security
RUN useradd -m -u 1000 user
WORKDIR /app

# Install system dependencies if needed (for psycopg2 or other libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY --chown=user ./requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

# Copy all project files
COPY --chown=user . /app

# Use the non-root user
USER user

# Railway typically uses the $PORT environment variable
EXPOSE 8080

# Run the app using the PORT env var if available, otherwise default to 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips '*'"]
