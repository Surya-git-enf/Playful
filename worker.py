import os
import json
import time
import uuid

JOBS_DIR = "jobs"
BUILDS_DIR = "builds"

os.makedirs(JOBS_DIR, exist_ok=True)
os.makedirs(BUILDS_DIR, exist_ok=True)

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
            job["status"] = "building"
            with open(path, "w") as f:
                json.dump(job, f)

            # simulate build time
            time.sleep(10)

            # create playable game
            game_dir = os.path.join(BUILDS_DIR, job_id)
            os.makedirs(game_dir, exist_ok=True)

            with open(os.path.join(game_dir, "index.html"), "w") as f:
                f.write(f"""
<!DOCTYPE html>
<html>
<head>
  <title>{job['game_name']}</title>
</head>
<body style="background:black;color:white;text-align:center">
  <h1>🎮 {job['game_name']}</h1>
  <p>This game was built by Playful backend</p>
  <button onclick="alert('Game logic here')">PLAY</button>
</body>
</html>
""")

            job["status"] = "completed"
            job["play_url"] = f"/play/{job_id}"

            with open(path, "w") as f:
                json.dump(job, f)

        time.sleep(3)

if __name__ == "__main__":
    run_worker()
