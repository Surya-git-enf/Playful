# main.py
import os
import uuid
import json
import shutil
import zipfile
from pathlib import Path
from typing import Dict, Any

import requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------- Config (ENV) ----------
GITHUB_TRIGGER_TOKEN = os.getenv("GITHUB_TRIGGER_TOKEN")  # personal access token with repo scope
GITHUB_REPO = os.getenv("GITHUB_REPO")  # "owner/repo"
BACKEND_BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")  # used when returning preview URLs
UPLOAD_SECRET = os.getenv("UPLOAD_SECRET", "please-set-a-secret")
DATA_FILE = Path("games.json")
BUILDS_DIR = Path("builds")  # each build will be at builds/<game_id>/
BUILDS_DIR.mkdir(exist_ok=True)

if not GITHUB_TRIGGER_TOKEN or not GITHUB_REPO:
    print("Warning: GITHUB_TRIGGER_TOKEN or GITHUB_REPO not set. Deploy pipeline won't trigger builds until set.")

# ---------- Helper functions ----------
def load_db() -> Dict[str, Any]:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {}

def save_db(db: Dict[str, Any]):
    DATA_FILE.write_text(json.dumps(db, indent=2), encoding="utf-8")

def create_game_record(name: str, template: str, build_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    db = load_db()
    game_id = f"game_{uuid.uuid4().hex[:12]}"
    rec = {
        "game_id": game_id,
        "name": name,
        "template": template,
        "build_type": build_type,  # "preview" or "full"
        "config": config,
        "status": "queued",
        "preview_url": None,
        "apk_url": None,
        "logs": []
    }
    db[game_id] = rec
    save_db(db)
    return rec

def update_game_record(game_id: str, patch: Dict[str, Any]):
    db = load_db()
    if game_id not in db:
        raise KeyError("game not found")
    db[game_id].update(patch)
    save_db(db)

# ---------- FastAPI app ----------
app = FastAPI(title="Game Builder Backend")

# Allow CORS from anywhere for testing; tighten later
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["*"],
)

# mount static builds folder at /games
app.mount("/games", StaticFiles(directory=str(BUILDS_DIR)), name="games")

# ---------- Request/Response models ----------
class CreateGameRequest(BaseModel):
    game_name: str
    template: str
    build_type: str  # "preview" or "full"
    config: Dict[str, Any]

# ---------- Endpoints ----------
@app.get("/")
def health():
    return {"status":"ok"}

@app.post("/api/games/create")
def create_game(req: CreateGameRequest):
    # 1. Create record in DB
    rec = create_game_record(req.game_name, req.template, req.build_type, req.config)
    game_id = rec["game_id"]

    # 2. Trigger GitHub Actions via repository_dispatch
    if not GITHUB_TRIGGER_TOKEN or not GITHUB_REPO:
        update_game_record(game_id, {"status": "error", "logs": ["Missing GITHUB_TRIGGER_TOKEN or GITHUB_REPO env var"]})
        return {"status":"error", "message":"Server missing GitHub trigger configuration. Contact admin.", "game_id": game_id}

    url = f"https://api.github.com/repos/{GITHUB_REPO}/dispatches"
    headers = {
        "Authorization": f"token {GITHUB_TRIGGER_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    payload = {
        "event_type": "build_game",
        "client_payload": {
            "game_id": game_id,
            "template": req.template,
            "build_type": req.build_type,
            "config": req.config,
            "callback_upload_url": f"{BACKEND_BASE_URL.rstrip('/')}/api/upload"
        }
    }
    r = requests.post(url, headers=headers, json=payload, timeout=30)
    if r.status_code in (204, 201):
        update_game_record(game_id, {"status": "building", "logs": ["dispatched to github actions"]})
        return {"status":"building", "game_id": game_id}
    else:
        # GitHub will return 404/401 etc if token/repo wrong
        msg = f"github dispatch failed: {r.status_code} {r.text}"
        update_game_record(game_id, {"status":"error", "logs":[msg]})
        raise HTTPException(status_code=500, detail=msg)

@app.post("/api/upload")
def upload_build(
    file: UploadFile = File(...),
    game_id: str = Form(...),
    x_upload_secret: str | None = Header(None)
):
    # Security: validate secret header
    if x_upload_secret != UPLOAD_SECRET:
        raise HTTPException(status_code=403, detail="Invalid upload secret header")

    # Validate game exists
    db = load_db()
    if game_id not in db:
        raise HTTPException(status_code=404, detail="Unknown game_id")

    # save zip to temp path
    game_dir = BUILDS_DIR / game_id
    if game_dir.exists():
        # remove old build (if you want history keep it differently)
        shutil.rmtree(game_dir)
    game_dir.mkdir(parents=True, exist_ok=True)

    zip_path = game_dir / "build.zip"
    with open(zip_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # extract zip
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(path=game_dir)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip")

    # remove zip if you want to save space
    try:
        zip_path.unlink()
    except Exception:
        pass

    # Determine preview index path
    # Expectation: after Godot web export there is an index.html at root or in 'web' folder
    # We'll try to find index.html
    def find_index(base: Path):
        for p in [base, base / "web", base / "build", base / "export", base / "html5", base / "html"]:
            if (p / "index.html").exists():
                return p
        # fallback search
        for p in base.glob("**/index.html"):
            return p.parent
        return None

    index_root = find_index(game_dir)
    if not index_root:
        # keep logs and mark error
        update_game_record(game_id, {"status":"error", "logs":["No index.html found after extracting build"]})
        raise HTTPException(status_code=400, detail="No index.html found in uploaded build. Check export settings.")

    # If index found at subpath, move contents up to game_dir root (makes /games/<game_id>/index.html work)
    if index_root != game_dir:
        # move files to root
        for item in index_root.iterdir():
            target = game_dir / item.name
            if target.exists():
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
            if item.is_dir():
                shutil.copytree(item, target)
            else:
                shutil.copy2(item, target)

    # Set preview URL
    preview_url = f"{BACKEND_BASE_URL.rstrip('/')}/games/{game_id}/index.html"

    update_game_record(game_id, {"status":"ready", "preview_url": preview_url, "logs": ["build uploaded and extracted"]})

    return {"status":"ok", "game_id": game_id, "preview_url": preview_url}

@app.get("/api/games/history")
def history():
    db = load_db()
    return {"games": list(db.values())}

@app.get("/api/games/status/{game_id}")
def status(game_id: str):
    db = load_db()
    if game_id not in db:
        raise HTTPException(status_code=404, detail="game not found")
    return db[game_id]

# ---------- run (for local testing) ----------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
