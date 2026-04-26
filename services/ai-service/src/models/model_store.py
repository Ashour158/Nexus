import os
from pathlib import Path


def models_dir() -> Path:
    return Path(os.getenv("AI_MODELS_DIR", "models")).resolve()


def model_path(name: str) -> Path:
    return models_dir() / name
