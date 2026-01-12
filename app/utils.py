# app/utils.py
import os
import requests
from datetime import datetime, timezone

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = os.environ.get("GITHUB_REPO", "Surya-git-enf/Playful")
WORKFLOW_FILENAME = os.environ.get("WORKFLOW_FILENAME", "godot-build.yml")
HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json"
}

def dispatch_workflow(game_name, project_dir="games/runner", preset="Web"):
    """
    Trigger the workflow_dispatch. Returns True on 204.
    """
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW_FILENAME}/dispatches"
    payload = {
        "ref": "main",
        "inputs": {
            "game_name": game_name,
            "project_dir": project_dir,
            "preset": preset
        }
    }
    r = requests.post(url, json=payload, headers=HEADERS, timeout=15)
    return r.status_code, r.text

def list_recent_runs(per_page=10):
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW_FILENAME}/runs"
    r = requests.get(url, headers=HEADERS, params={"per_page": per_page}, timeout=10)
    if r.status_code != 200:
        return None
    return r.json().get("workflow_runs", [])

def get_run(run_id):
    url = f"https://api.github.com/repos/{REPO}/actions/runs/{run_id}"
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        return None
    return r.json()
