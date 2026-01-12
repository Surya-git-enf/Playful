"""
main.py - Playful backend to trigger GitHub Actions Godot builds and track status.

How it works:
- POST /create-game -> dispatches a GitHub workflow (workflow_dispatch) with inputs.
- Background thread polls GitHub Actions for the matching workflow run & watches its status.
- GET  /status/{job_id} -> returns job JSON, including output_url when build succeeded.

Environment variables (required):
- GITHUB_TOKEN         -> Personal Access Token with repo:status, repo (push) permissions
- REPO_OWNER           -> GitHub owner/org (example: Surya-git-enf)
- REPO_NAME            -> Repository name that contains the Godot project & workflow
- WORKFLOW_FILE        -> Workflow filename (example: godot-build.yml)
- REF                  -> Git ref to dispatch (default: "main")
- PAGES_URL_TEMPLATE   -> Template for building the playable URL.
                         Default: "https://{owner}.github.io/{repo}/builds/{game_name}/index.html"
- JOBS_DIR (optional)  -> local folder to keep job JSON (default: "./jobs")
- POLL_INTERVAL (opt)  -> seconds (default: 4.0)
"""

import os
import time
import uuid
import json
import threading
import datetime
from typing import Optional, Dict, Any
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

# ----------------------
# Config / Environment
# ----------------------
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
REPO_OWNER = os.getenv("REPO_OWNER", "").strip()
REPO_NAME = os.getenv("REPO_NAME", "").strip()
WORKFLOW_FILE = os.getenv("WORKFLOW_FILE", "godot-build.yml")
REF = os.getenv("REF", "main")
PAGES_URL_TEMPLATE = os.getenv(
    "PAGES_URL_TEMPLATE",
    "https://{owner}.github.io/{repo}/builds/{game_name}/index.html"
)
JOBS_DIR = os.getenv("JOBS_DIR", "jobs")
BUILDS_DIR = os.getenv("BUILDS_DIR", "builds")
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "4.0"))
WORKER_START_DELAY = float(os.getenv("WORKER_START_DELAY", "1.0"))

if not GITHUB_TOKEN or not REPO_OWNER or not REPO_NAME:
    # We will still run but dispatch will fail until the envs are set.
    print("WARNING: GITHUB_TOKEN / REPO_OWNER / REPO_NAME are required to dispatch builds.", flush=True)

os.makedirs(JOBS_DIR, exist_ok=True)
os.makedirs(BUILDS_DIR, exist_ok=True)

GITHUB_API_BASE = "https://api.github.com"

HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"token {GITHUB_TOKEN}" if GITHUB_TOKEN else "",
    "User-Agent": "playful-backend"
}

app = FastAPI(title="Playful - GitHub-triggered Godot builder")

# Mount builds folder so render can optionally serve ./builds if desired.
# (If you host builds via GitHub Pages, PAGES_URL_TEMPLATE is used instead.)
app.mount("/builds", StaticFiles(directory=BUILDS_DIR, html=True), name="builds")


# ----------------------
# Models & helpers
# ----------------------
class CreateGameRequest(BaseModel):
    game_name: str
    template: Optional[str] = ""


def _now_iso():
    return datetime.datetime.utcnow().isoformat() + "Z"


def save_job(job: Dict[str, Any]):
    path = os.path.join(JOBS_DIR, f"{job['job_id']}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(job, f, indent=2)


def load_job(job_id: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_jobs():
    out = []
    for fn in os.listdir(JOBS_DIR):
        if fn.endswith(".json"):
            with open(os.path.join(JOBS_DIR, fn), "r", encoding="utf-8") as f:
                try:
                    out.append(json.load(f))
                except:
                    continue
    return out


def log(msg: str):
    print(f"[{datetime.datetime.utcnow().isoformat()}] {msg}", flush=True)


# ----------------------
# GitHub dispatch / polling helpers
# ----------------------
def dispatch_workflow(job: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trigger a workflow_dispatch for WORKFLOW_FILE on REF.
    We pass inputs: game_name and template (workflow needs to be written to accept inputs).
    Returns dict with success flag & http status.
    Note: GitHub returns 204 on success (no content).
    """
    url = f"{GITHUB_API_BASE}/repos/{REPO_OWNER}/{REPO_NAME}/actions/workflows/{WORKFLOW_FILE}/dispatches"
    payload = {"ref": REF, "inputs": {"game_name": job["game_name"], "template": job.get("template", "")}}
    try:
        r = requests.post(url, headers=HEADERS, json=payload, timeout=15)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if r.status_code in (204, 201):
        return {"ok": True, "status_code": r.status_code}
    else:
        return {"ok": False, "status_code": r.status_code, "body": r.text}


def find_workflow_run_for_job(job: Dict[str, Any]) -> Optional[int]:
    """
    Look up workflow runs for the configured workflow file, and find the first run
    created at or after job.created_at. Returns run_id or None.
    """
    created_after = job.get("created_at")
    # GitHub supports listing runs for a workflow:
    url = f"{GITHUB_API_BASE}/repos/{REPO_OWNER}/{REPO_NAME}/actions/workflows/{WORKFLOW_FILE}/runs"
    params = {"event": "workflow_dispatch", "per_page": 10}
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=15)
    except Exception as e:
        log(f"[{job['job_id']}] find run error: {e}")
        return None
    if r.status_code != 200:
        log(f"[{job['job_id']}] find run HTTP {r.status_code}: {r.text}")
        return None
    data = r.json()
    runs = data.get("workflow_runs", [])
    # Try to match by created_at >= job.created_at and matching inputs/game_name if possible:
    job_created = job.get("created_at")
    # fallback: parse ISO to datetime for comparison
    try:
        job_dt = datetime.datetime.fromisoformat(job_created.replace("Z", "+00:00"))
    except Exception:
        job_dt = None

    for run in runs:
        # prefer runs created after job
        run_created = run.get("created_at")
        try:
            run_dt = datetime.datetime.fromisoformat(run_created.replace("Z", "+00:00"))
        except:
            run_dt = None
        # Some heuristic: run_dt >= job_dt - 10s
        if job_dt and run_dt and run_dt >= (job_dt - datetime.timedelta(seconds=10)):
            # If inputs are present in run, compare game_name
            # NOTE: GitHub REST does not return inputs in list endpoint; rough match only.
            return run.get("id")
    # If not found, return None
    return None


def get_run_status(run_id: int) -> Optional[Dict[str, Any]]:
    url = f"{GITHUB_API_BASE}/repos/{REPO_OWNER}/{REPO_NAME}/actions/runs/{run_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if r.status_code != 200:
        return {"ok": False, "status_code": r.status_code, "body": r.text}
    return {"ok": True, "run": r.json()}


# ----------------------
# Background worker thread
# ----------------------
def worker_loop():
    log("Worker loop started.")
    while True:
        try:
            jobs = [j for j in list_jobs() if j.get("status") in ("queued", "dispatched", "running", "waiting_for_run")]
            if not jobs:
                time.sleep(POLL_INTERVAL)
                continue

            for job in jobs:
                job_id = job["job_id"]
                status = job.get("status")
                # 1) dispatch if queued and not yet dispatched
                if status == "queued" and not job.get("dispatched", False):
                    log(f"[{job_id}] dispatching workflow for game '{job['game_name']}'")
                    res = dispatch_workflow(job)
                    if res.get("ok"):
                        job["dispatched"] = True
                        job["dispatch_response"] = {"status_code": res.get("status_code")}
                        job["status"] = "dispatched"
                        save_job(job)
                        # continue; a run will appear shortly
                    else:
                        job["status"] = "failed"
                        job["error"] = f"dispatch failed: {res}"
                        save_job(job)
                        log(f"[{job_id}] dispatch failed: {res}")
                        continue

                # 2) find run id (when dispatched but no run_id)
                if job.get("dispatched") and not job.get("workflow_run_id"):
                    run_id = find_workflow_run_for_job(job)
                    if run_id:
                        job["workflow_run_id"] = run_id
                        job["status"] = "running"
                        job["started_at"] = _now_iso()
                        save_job(job)
                        log(f"[{job_id}] linked to workflow run {run_id}")
                    else:
                        # keep waiting for the run to appear
                        job["status"] = "waiting_for_run"
                        save_job(job)
                        continue

                # 3) if we have a run_id, poll its status
                if job.get("workflow_run_id"):
                    run_id = job["workflow_run_id"]
                    res = get_run_status(run_id)
                    if not res.get("ok"):
                        log(f"[{job_id}] get_run_status error: {res}")
                        # don't change state yet
                        time.sleep(0.5)
                        continue
                    run = res["run"]
                    run_status = run.get("status")         # queued, in_progress, completed
                    run_conclusion = run.get("conclusion") # success, failure, cancelled, null
                    job["run_status"] = run_status
                    job["run_conclusion"] = run_conclusion
                    job["run_url"] = run.get("html_url")
                    save_job(job)
                    log(f"[{job_id}] workflow run {run_id} status={run_status} conclusion={run_conclusion}")

                    if run_status == "completed":
                        if run_conclusion == "success":
                            # Build succeeded — compute play URL
                            play_url = PAGES_URL_TEMPLATE.format(
                                owner=REPO_OWNER,
                                repo=REPO_NAME,
                                game_name=job["game_name"],
                                job_id=job_id
                            )
                            job["status"] = "completed"
                            job["output_url"] = play_url
                            job["finished_at"] = _now_iso()
                            save_job(job)
                            log(f"[{job_id}] completed successfully -> {play_url}")
                        else:
                            job["status"] = "failed"
                            job["error"] = f"workflow concluded: {run_conclusion}"
                            job["finished_at"] = _now_iso()
                            save_job(job)
                            log(f"[{job_id}] failed -> conclusion={run_conclusion}")
                    # otherwise: still running; leave it
                # small sleep to avoid hammering for many jobs
                time.sleep(0.2)

        except Exception as e:
            log(f"worker_loop unexpected error: {e}")
            time.sleep(POLL_INTERVAL)


# start worker thread once on import
worker_thread = threading.Thread(target=worker_loop, daemon=True)
# Slight delay so FastAPI can boot, helpful on Render.
def _start_worker_delayed():
    time.sleep(WORKER_START_DELAY)
    worker_thread.start()
    log("Background worker thread launched.")

threading.Thread(target=_start_worker_delayed, daemon=True).start()


# ----------------------
# API endpoints
# ----------------------
@app.post("/create-game")
def create_game(body: CreateGameRequest):
    # sanitize name
    game_name = body.game_name.strip().replace(" ", "_")
    if not game_name:
        raise HTTPException(400, "game_name required")

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job = {
        "job_id": job_id,
        "game_name": game_name,
        "template": body.template or "",
        "status": "queued",
        "created_at": _now_iso(),
        "dispatched": False,
        "workflow_run_id": None,
        "output_url": "",
        "error": ""
    }
    save_job(job)
    log(f"Created job {job_id} for game '{game_name}' (template={body.template})")

    # We return immediately. Worker will dispatch and update job.
    return {"job_id": job_id, "status": "queued"}

@app.get("/status/{job_id}")
def job_status(job_id: str):
    job = load_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job


@app.get("/jobs")
def list_all_jobs():
    return {"jobs": list_jobs()}


@app.get("/debug/files")
def debug_files():
    result = {}
    for root, dirs, files in os.walk(BUILDS_DIR):
        rel = os.path.relpath(root, BUILDS_DIR)
        if rel == ".":
            key = "builds"
        else:
            key = rel
        result[key] = files
    return result


@app.get("/")
def root():
    return {
        "status": "playful-backend running",
        "time": _now_iso(),
        "repo": f"{REPO_OWNER}/{REPO_NAME}",
        "workflow": WORKFLOW_FILE
                            }
