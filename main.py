from fastapi import FastAPI
from fastapi.responses import FileResponse
import uuid, json, os

app = FastAPI()

JOBS_DIR = "jobs"
BUILDS_DIR = "builds"

@app.post("/create-game")
def create_game(game_name: str):
    job_id = "job_" + uuid.uuid4().hex[:8]

    job = {
        "job_id": job_id,
        "game_name": game_name,
        "status": "queued"
    }

    with open(f"{JOBS_DIR}/{job_id}.json", "w") as f:
        json.dump(job, f)

    return job

@app.get("/status/{job_id}")
def status(job_id: str):
    with open(f"{JOBS_DIR}/{job_id}.json") as f:
        return json.load(f)

@app.get("/play/{job_id}")
def play(job_id: str):
    return FileResponse(f"{BUILDS_DIR}/{job_id}/index.html")
