# Stage 1: Build Frontend Assets
FROM node:18 as builder

# Set working directory for frontend build
WORKDIR /app/frontend

# Install build tools needed for native Node.js modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --frozen-lockfile

# Copy the rest of the frontend source code
COPY frontend/ ./

# Limpieza opcional para evitar errores de binarios nativos (por bug de npm)
RUN rm -rf node_modules package-lock.json \
 && npm install --legacy-peer-deps
RUN npm install react-draggable
RUN npm install reactflow

# Build the frontend
RUN npm run build

# Stage 2: Setup Backend Runtime Environment
FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnl-3-dev \
    libnl-route-3-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy built frontend assets
COPY --from=builder /app/frontend/dist ./backend/frontend/dist

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]