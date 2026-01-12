import os
import json
import time
import requests
import shutil

JOBS_DIR = "jobs"
BUILDS_DIR = "builds"
DOCS_DIR = "docs/play"

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = "Surya-git-enf/Playful"
WORKFLOW = "godot-build.yml"

os.makedirs(JOBS_DIR, exist_ok=True)
os.makedirs(BUILDS_DIR, exist_ok=True)
os.makedirs(DOCS_DIR, exist_ok=True)


def dispatch_github(job_id):
    if not GITHUB_TOKEN:
        print("⚠️ No GitHub token, skipping dispatch")
        return

    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json"
    }
    data = {
        "ref": "main",
        "inputs": {
            "job_id": job_id
        }
    }

    r = requests.post(url, headers=headers, json=data)
    print("🚀 GitHub dispatch:", r.status_code)


def run_worker():
    while True:
        for file in os.listdir(JOBS_DIR):
            if not file.endswith(".json"):
                continue

            path = os.path.join(JOBS_DIR, file)
            with open(path) as f:
                job = json.load(f)

            if job["status"] != "queued":
                continue

            job_id = job["job_id"]
            print("⚙️ Building", job_id)

            job["status"] = "building"
            with open(path, "w") as f:
                json.dump(job, f)

            # simulate build
            time.sleep(5)

            # build output
            build_dir = os.path.join(BUILDS_DIR, job_id)
            os.makedirs(build_dir, exist_ok=True)

            index_html = os.path.join(build_dir, "index.html")
            with open(index_html, "w") as f:
                f.write(f"""
<!DOCTYPE html>
<html>
<head>
  <title>{job['game_name']}</title>
</head>
<body style="background:black;color:white;text-align:center">
  <h1>🎮 {job['game_name']}</h1>
  <p>Built by Playful</p>
  <button onclick="alert('Game logic here')">PLAY</button>
</body>
</html>
""")

            # 🚚 COPY TO GITHUB PAGES
            pages_dir = os.path.join(DOCS_DIR, job_id)
            os.makedirs(pages_dir, exist_ok=True)
            shutil.copy(index_html, pages_dir)

            # mark complete
            job["status"] = "completed"
            job["dispatched"] = True
            job["play_url"] = f"/play/{job_id}"

            with open(path, "w") as f:
                json.dump(job, f)

            # 🚀 trigger GitHub
            dispatch_github(job_id)

        time.sleep(3)


if __name__ == "__main__":
    run_worker()
