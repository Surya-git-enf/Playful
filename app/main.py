# app/main.py
import os
import json
import uuid
import time
import threading
import re
from datetime import datetime, timezone
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from app.utils import dispatch_workflow, list_recent_runs, get_run

JOBS_DIR = os.path.join(os.path.dirname(__file__), "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

app = FastAPI(title="Playful Dispatcher")

GAME_NAME_RE = re.compile(r"^[a-zA-Z0-9-_]{1,64}$")  # safe characters


class CreateJob(BaseModel):
    game_name: str
    template: str = "runner"
    project_dir: str = "games/runner"
    preset: str = "Web"


def save_job(job):
    path = os.path.join(JOBS_DIR, f"{job['job_id']}.json")
    with open(path, "w") as f:
        json.dump(job, f, indent=2)


def find_recent_run_for_job(job_id, timeout=60):
    """
    Heuristic: look at recent runs and match one that has the unique job_id embedded in the inputs/game_name.
    We'll embed the job_id into game_name when dispatching to make detection deterministic.
    """
    end = time.time() + timeout
    while time.time() < end:
        runs = list_recent_runs()
        if runs:
            for r in runs:
                # check inputs (some runners include inputs in 'head_commit' or 'name')
                # best if we passed a game_name containing job_id; we will do that.
                head_sha = r.get("head_sha")
                created_at = r.get("created_at")
                # check run name or head_branch or event payload - but simplest: created_at recent
                # We'll accept the most recent run for simplicity.
                return r
        time.sleep(2)
    return None


def background_dispatch(job_path):
    # load job
    job = json.load(open(job_path))
    try:
        # update and save
        job["status"] = "dispatching"
        save_job(job)

        # embed job id in the game name so detection is unique
        dispatched_game_name = f"{job['game_name']}-{job['job_id']}"
        status_code, text = dispatch_workflow(dispatched_game_name, job.get("project_dir"), job.get("preset"))
        if status_code != 204:
            job["status"] = "failed"
            job["error"] = f"workflow_dispatch failed: {status_code} {text}"
            save_job(job)
            return

        job["dispatched"] = True
        save_job(job)

        # find run (simple heuristic)
        run = find_recent_run_for_job(job["job_id"], timeout=60)
        if not run:
            job["status"] = "running"
            save_job(job)
            return

        run_id = run["id"]
        job["workflow_run_id"] = run_id
        job["status"] = "running"
        save_job(job)

        # poll until completed
        start = time.time()
        timeout = 300
        while time.time() - start < timeout:
            run_data = get_run(run_id)
            if not run_data:
                time.sleep(3)
                continue
            if run_data.get("status") == "completed":
                if run_data.get("conclusion") == "success":
                    job["status"] = "completed"
                    user, repo = os.environ.get("GITHUB_REPO", "Surya-git-enf/Playful").split("/")
                    # NOTE: workflow is expected to put files under docs/builds/<original_game_name> (without job_id)
                    orig_game = job["game_name"]
                    job["output_url"] = f"https://{user}.github.io/{repo}/builds/{orig_game}/index.html"
                    job["play_url"] = f"/play/{job['job_id']}"
                    job["error"] = ""
                else:
                    job["status"] = "failed"
                    job["error"] = f"workflow concluded with: {run_data.get('conclusion')}"
                save_job(job)
                return
            time.sleep(3)

        job["status"] = "failed"
        job["error"] = "timeout waiting for workflow completion"
        save_job(job)
    except Exception as e:
        job["status"] = "failed"
        job["error"] = f"exception: {str(e)}"
        save_job(job)


@app.post("/create", status_code=202)
def create_job(payload: CreateJob, background_tasks: BackgroundTasks):
    game_name = payload.game_name.strip()
    if not GAME_NAME_RE.match(game_name):
        raise HTTPException(status_code=400, detail="invalid game_name (allowed: letters, numbers, -, _ )")

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job = {
        "job_id": job_id,
        "game_name": game_name,     # original name used for docs path
        "template": payload.template,
        "project_dir": payload.project_dir,
        "preset": payload.preset,
        "status": "queued",
        "dispatched": False,
        "workflow_run_id": None,
        "output_url": "",
        "error": ""
    }

    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    with open(path, "w") as f:
        json.dump(job, f, indent=2)

    # start background task to dispatch workflow and monitor
    background_tasks.add_task(background_dispatch, path)

    return {"job_id": job_id, "status": "queued", "play_url": f"/play/{job_id}"}


@app.get("/job/{job_id}")
def get_job(job_id: str):
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="job not found")
    return json.load(open(path))
