from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.api.routes import router as api_router
from backend.api.latency import router as latency_router
from backend.heartbeat import heartbeat_loop
import asyncio
import os
import backend.config as config

# ✅ Define app first
app = FastAPI()

# Define the path to the built frontend files WITHIN the container structure
# It's now relative to main.py inside the backend directory
STATIC_FILES_DIR = os.path.join(os.path.dirname(__file__), "frontend/dist")

# ✅ Mount static files after app is defined
# Ensure the directory path is correct relative to where main.py is when the app runs
# Inside the container, after COPY backend/ ./backend/, main.py is at /app/backend/main.py
# And frontend assets are at /app/backend/frontend/dist
app.mount("/", StaticFiles(directory=STATIC_FILES_DIR, html=True), name="static-root")


# Use ALLOWED_ORIGINS from config.py
allowed_origins = config.ALLOWED_ORIGINS

# ✅ CORS config before routers, after app is defined
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins, # Use the imported config value
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Include API routes *before* the catch-all static file route
app.include_router(api_router, prefix="/api")
app.include_router(latency_router, prefix="/api")

# The StaticFiles mount at "/" with html=True should handle serving index.html
# for the root and client-side routes. The explicit @app.get("/") and @app.get("/{full_path:path}")
# might become redundant or conflict if not carefully managed with the StaticFiles mount.
# For a typical SPA, mounting StaticFiles at "/" with html=True is often sufficient.

# If you still need specific handling for index.html for client-side routing,
# ensure it doesn't conflict with the primary StaticFiles mount.
# Consider removing these if the main app.mount("/", ...) handles it.
# @app.get("/{full_path:path}")
# async def serve_frontend(full_path: str):
#     index_path = os.path.join(STATIC_FILES_DIR, "index.html")
#     if not os.path.exists(index_path):
#         return {"error": "Frontend not built or index.html not found"}, 404
#     return FileResponse(index_path)

# @app.get("/")
# async def serve_root_frontend():
#     index_path = os.path.join(STATIC_FILES_DIR, "index.html")
#     if not os.path.exists(index_path):
#          return {"error": "Frontend not built or index.html not found"}, 404
#     return FileResponse(index_path)


# ✅ Startup hook AFTER app is defined
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(heartbeat_loop())

# Example of how you *could* run uvicorn programmatically using config
# (Usually you run uvicorn from CLI or Docker CMD)
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host=config.HOST_IP, port=8000)