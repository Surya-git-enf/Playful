# dispatch_worker.py
import os
import json
import time
import requests
from datetime import datetime, timezone

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")   # set in Render / server
REPO = "Surya-git-enf/Playful"                  # owner/repo
WORKFLOW_FILENAME = "godot-build.yml"           # filename in .github/workflows/
POLL_SECONDS = 3
POLL_TIMEOUT = 300  # seconds to wait for workflow to start/finish

JOBS_DIR = "jobs"

def github_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json"
    }

def dispatch_workflow(job):
    """Call workflow_dispatch to trigger the build.
       Returns True if API returned 204.
    """
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW_FILENAME}/dispatches"
    inputs = {
        "ref": "main",
        "inputs": {
            "game_name": job["game_name"],
            "project_dir": job.get("project_dir", "games/runner"),
            "preset": job.get("preset", "Web")
        }
    }
    r = requests.post(url, json=inputs, headers=github_headers())
    print("dispatch status:", r.status_code, r.text)
    return r.status_code == 204

def find_recent_run(job):
    """List workflow runs and try to find the one we just triggered for this job.
       Strategy: list runs for the workflow, filter by created_at within last minute and by actor.
    """
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW_FILENAME}/runs"
    r = requests.get(url, headers=github_headers(), params={"per_page": 10})
    if r.status_code != 200:
        print("list runs failed", r.status_code, r.text)
        return None
    runs = r.json().get("workflow_runs", [])
    # Try to find a run that was created recently (within 2 minutes)
    now = datetime.now(timezone.utc)
    for run in runs:
        created_at = datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
        age = (now - created_at).total_seconds()
        if age < 120:
            # extra check: run head_sha or head_branch may be used; we accept recent run
            return run
    return None

def poll_run_until_complete(run_id, timeout=POLL_TIMEOUT):
    url = f"https://api.github.com/repos/{REPO}/actions/runs/{run_id}"
    start = time.time()
    while True:
        r = requests.get(url, headers=github_headers())
        if r.status_code != 200:
            print("poll run failed", r.status_code, r.text)
            return None
        data = r.json()
        status = data.get("status")
        conclusion = data.get("conclusion")
        print("run status:", status, "conclusion:", conclusion)
        if status == "completed":
            return data
        if time.time() - start > timeout:
            print("timeout waiting for run to complete")
            return None
        time.sleep(POLL_SECONDS)

def load_job(path):
    with open(path, "r") as f:
        return json.load(f)

def save_job(path, job):
    with open(path, "w") as f:
        json.dump(job, f, indent=2)

def process_job_file(path):
    job = load_job(path)
    if job.get("status") != "queued":
        return

    job["status"] = "dispatching"
    save_job(path, job)

    if not GITHUB_TOKEN:
        job["status"] = "failed"
        job["error"] = "Missing GITHUB_TOKEN"
        save_job(path, job)
        return

    if not dispatch_workflow(job):
        job["status"] = "failed"
        job["error"] = "workflow_dispatch failed"
        save_job(path, job)
        return

    # mark dispatched; we will attempt to find the run id
    job["dispatched"] = True
    save_job(path, job)

    # Give GitHub a few seconds then try to find the new run
    run = None
    start = time.time()
    while (time.time() - start) < 60:
        run = find_recent_run(job)
        if run:
            break
        time.sleep(2)

    if not run:
        job["status"] = "running"
        job["workflow_run_id"] = None
        save_job(path, job)
        # we can continue polling later via another process; return now
        return

    run_id = run["id"]
    job["workflow_run_id"] = run_id
    job["status"] = "running"
    save_job(path, job)

    # wait for completion
    run_data = poll_run_until_complete(run_id)
    if not run_data:
        job["status"] = "failed"
        job["error"] = "Workflow run did not complete in time"
        save_job(path, job)
        return

    if run_data.get("conclusion") == "success":
        job["status"] = "completed"
        # compute output URL (your workflow pushes to docs/builds/<game>)
        user, repo = REPO.split("/")
        job["output_url"] = f"https://{user}.github.io/{repo}/builds/{job['game_name']}/index.html"
        job["play_url"] = f"/play/{job['job_id']}"
        job["error"] = ""
    else:
        job["status"] = "failed"
        job["error"] = f"workflow concluded: {run_data.get('conclusion')}"

    save_job(path, job)

if __name__ == "__main__":
    # single-pass worker: scan jobs folder and process queued jobs
    for filename in os.listdir(JOBS_DIR):
        if not filename.endswith(".json"):
            continue
        p = os.path.join(JOBS_DIR, filename)
        try:
            process_job_file(p)
        except Exception as e:
            print("job processing error", e)
