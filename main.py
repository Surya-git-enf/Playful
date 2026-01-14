# main.py
import os
import uuid
import json
import shutil
import zipfile
import time
from pathlib import Path
from typing import Dict, Any, Optional

import requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------- Config (ENV) ----------
GITHUB_TRIGGER_TOKEN = os.getenv("GITHUB_TRIGGER_TOKEN")  # PAT for repository_dispatch
GITHUB_REPO = os.getenv("GITHUB_REPO")  # "owner/repo"
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
UPLOAD_SECRET = os.getenv("UPLOAD_SECRET", "please-set-a-secret")
DATA_FILE = Path("games.json")
BUILDS_DIR = Path("builds")
BUILDS_DIR.mkdir(exist_ok=True, parents=True)

# ---------- Helpers ----------
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
        "build_type": build_type,
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

def append_game_log(game_id: str, message: str):
    db = load_db()
    if game_id not in db:
        return
    logs = db[game_id].get("logs", [])
    logs.append(message)
    db[game_id]["logs"] = logs
    save_db(db)

# ---------- App ----------
app = FastAPI(title="Game Builder Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["*"],
)
app.mount("/games", StaticFiles(directory=str(BUILDS_DIR)), name="games")

class CreateGameRequest(BaseModel):
    game_name: str
    template: str
    build_type: str
    config: Dict[str, Any]

@app.get("/")
def health():
    return {"status":"ok"}

def dispatch_to_github_async(game_id: str, template: str, build_type: str, config: Dict[str, Any], callback_url: str):
    """
    Background worker: perform repository_dispatch to GitHub and update record.
    This will append logs and set status to 'building' on success or 'error' on failure.
    """
    try:
        token = os.getenv("GITHUB_TRIGGER_TOKEN")
        repo = os.getenv("GITHUB_REPO")
        if not token or not repo:
            append_game_log(game_id, "Missing GITHUB_TRIGGER_TOKEN or GITHUB_REPO (background).")
            update_game_record(game_id, {"status":"error"})
            return

        url = f"https://api.github.com/repos/{repo}/dispatches"
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
        payload = {
            "event_type": "build_game",
            "client_payload": {
                "game_id": game_id,
                "template": template,
                "build_type": build_type,
                "config": config,
                "callback_upload_url": callback_url
            }
        }

        attempts = 3
        for attempt in range(1, attempts+1):
            try:
                r = requests.post(url, headers=headers, json=payload, timeout=15)
            except Exception as exc:
                append_game_log(game_id, f"Attempt {attempt}: request exception: {exc}")
                time.sleep(2)
                continue

            # GitHub returns 204 No Content on success for repository_dispatch
            if r.status_code in (204, 201):
                append_game_log(game_id, f"Dispatched to GitHub actions (attempt {attempt}).")
                update_game_record(game_id, {"status":"building"})
                return
            else:
                append_game_log(game_id, f"Attempt {attempt}: GitHub API returned {r.status_code}: {r.text}")
                time.sleep(2)

        # if we reach here, all attempts failed
        update_game_record(game_id, {"status":"error"})
        append_game_log(game_id, "repository_dispatch failed after retries.")
    except Exception as ex:
        append_game_log(game_id, f"Unexpected background error: {ex}")
        update_game_record(game_id, {"status":"error"})

@app.post("/api/games/create")
def create_game(req: CreateGameRequest, background_tasks: BackgroundTasks):
    rec = create_game_record(req.game_name, req.template, req.build_type, req.config)
    game_id = rec["game_id"]

    # quick sanity check for config so user sees immediate error
    if not GITHUB_TRIGGER_TOKEN or not GITHUB_REPO:
        update_game_record(game_id, {"status":"error", "logs":["Missing GITHUB_TRIGGER_TOKEN or GITHUB_REPO"]})
        return {"status":"error","message":"Server missing GitHub trigger configuration.","game_id":game_id}

    callback_upload_url = f"{BASE_URL.rstrip('/')}/api/upload"
    # schedule the background dispatch (non-blocking)
    background_tasks.add_task(dispatch_to_github_async, game_id, req.template, req.build_type, req.config, callback_upload_url)

    # return immediately to client
    return {"status":"queued","game_id":game_id}

@app.post("/api/upload")
async def upload_build(
    request: Request,
    file: UploadFile = File(...),
    game_id: str = Form(...),
    authorization: Optional[str] = Header(None),
    x_upload_secret: Optional[str] = Header(None)
):
    # Accept either `Authorization: Bearer <secret>` or header `X-Upload-Secret: <secret>`
    incoming_secret = None
    if authorization:
        # Expected: "Bearer <secret>"
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            incoming_secret = parts[1]
    if not incoming_secret and x_upload_secret:
        incoming_secret = x_upload_secret

    if incoming_secret != UPLOAD_SECRET:
        raise HTTPException(status_code=403, detail="Invalid upload secret")

    db = load_db()
    if game_id not in db:
        raise HTTPException(status_code=404, detail="Unknown game_id")

    game_dir = BUILDS_DIR / game_id
    if game_dir.exists():
        shutil.rmtree(game_dir)
    game_dir.mkdir(parents=True, exist_ok=True)

    zip_path = game_dir / "build.zip"
    with open(zip_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # extract
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(path=game_dir)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip")

    try:
        zip_path.unlink()
    except Exception:
        pass

    # find index.html
    def find_index(base: Path):
        for p in [base, base / "web", base / "build", base / "export", base / "html5", base / "html"]:
            if (p / "index.html").exists():
                return p
        for p in base.glob("**/index.html"):
            return p.parent
        return None

    index_root = find_index(game_dir)
    if not index_root:
        update_game_record(game_id, {"status":"error", "logs":["No index.html found after extracting build"]})
        raise HTTPException(status_code=400, detail="No index.html found in uploaded build")

    if index_root != game_dir:
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

    preview_url = f"{BASE_URL.rstrip('/')}/games/{game_id}/index.html"
    update_game_record(game_id, {"status":"ready", "preview_url": preview_url, "logs":["build uploaded and extracted"]})

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

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
