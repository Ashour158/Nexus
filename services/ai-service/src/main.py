import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import insights, scoring, transcription

app = FastAPI(title="Nexus AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scoring.router, prefix="/api/v1")
app.include_router(transcription.router, prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}
