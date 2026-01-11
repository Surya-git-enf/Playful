from fastapi import FastAPI
import uuid, json, os
from worker import build_game
from fastapi.staticfiles import StaticFiles
app.mount("/games", StaticFiles(directory="builds"), name="games")
app = FastAPI()

JOBS_DIR = "jobs"
os.makedirs(JOBS_DIR, exist_ok=True)

@app.post("/create")
def create_game(template: str):
    job_id = str(uuid.uuid4())
    job_file = f"{JOBS_DIR}/{job_id}.json"

    with open(job_file, "w") as f:
        json.dump({"status": "building"}, f)

    build_game(job_id, template)
    return {"job_id": job_id}

@app.get("/status/{job_id}")
def status(job_id: str):
    job_file = f"{JOBS_DIR}/{job_id}.json"
    if not os.path.exists(job_file):
        return {"error": "job not found"}

    with open(job_file) as f:
        return json.load(f)
