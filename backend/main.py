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

# Define the path to the built frontend files WITHIN the container structure
# It's now relative to main.py inside the backend directory
STATIC_FILES_DIR = os.path.join(os.path.dirname(__file__), "frontend/dist")

# ✅ Define app first
app = FastAPI()

# Use ALLOWED_ORIGINS from config.py
allowed_origins = config.ALLOWED_ORIGINS

# ✅ CORS config before routers
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

# ✅ Mount static files directory (Serve assets like CSS, JS)
# The path "/assets" should match the base path used in your index.html for assets
# Check your frontend build output and how index.html references files.
# If index.html uses relative paths like "./assets/...", mounting at "/" might be needed instead.
# Let's assume assets are referenced like /assets/main.css
if os.path.exists(os.path.join(STATIC_FILES_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_FILES_DIR, "assets")), name="assets")

# ✅ Serve index.html for the root path and potentially other frontend routes
# This catch-all route should be last
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    index_path = os.path.join(STATIC_FILES_DIR, "index.html")
    if not os.path.exists(index_path):
        return {"error": "Frontend not built or index.html not found"}, 404
    # Return index.html for any path not caught by API routes or static files mount
    # This allows client-side routing (React Router, Vue Router) to work
    return FileResponse(index_path)

# Serve index.html for the root path explicitly as well
@app.get("/")
async def serve_root_frontend():
    index_path = os.path.join(STATIC_FILES_DIR, "index.html")
    if not os.path.exists(index_path):
         return {"error": "Frontend not built or index.html not found"}, 404
    return FileResponse(index_path)


# ✅ Startup hook AFTER app is defined
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(heartbeat_loop())

# Example of how you *could* run uvicorn programmatically using config
# (Usually you run uvicorn from CLI or Docker CMD)
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host=config.HOST_IP, port=8000)
