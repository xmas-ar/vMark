# Stage 1: Build Frontend Assets
FROM node:18-alpine as builder

# Set working directory for frontend build
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --frozen-lockfile

# Copy the rest of the frontend source code
COPY frontend/ ./

# Build the frontend
# Ensure your build script outputs to 'dist' or change the directory name below
RUN npm run build

# Stage 2: Setup Backend Runtime Environment
FROM python:3.10-slim

# Set working directory for the backend
WORKDIR /app

# Prevent Python from writing pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install system dependencies needed for Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnl-3-dev \
    libnl-route-3-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
# Copy requirements first to leverage Docker cache
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the entire backend directory
COPY backend/ ./backend/

# Copy the entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy the built frontend assets from the builder stage
# The destination path 'backend/frontend/dist' should match how main.py finds it
COPY --from=builder /app/frontend/dist ./backend/frontend/dist

# Expose the port the app runs on
EXPOSE 8000

# Set the entrypoint script to run on container start
ENTRYPOINT ["/app/entrypoint.sh"]

# CMD can be removed or left as default arguments to the ENTRYPOINT
# If left, it would be passed as arguments to entrypoint.sh, but the script above executes uvicorn directly.
# For clarity, you might remove the CMD line or keep it commented out.
# CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]