from fastapi import FastAPI
import requests
import os

app = FastAPI()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
OWNER = "YOUR_GITHUB_USERNAME"
REPO = "builds"

@app.post("/create-game")
def create_game(game: str, template: str):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/dispatches"

    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json"
    }

    payload = {
        "event_type": "build_game",
        "client_payload": {
            "game": game,
            "template": template
        }
    }

    requests.post(url, headers=headers, json=payload)
    return {"status": "build started"}

@app.get("/status/{game}")
def status(game: str):
    return {
        "message": "Check GitHub Actions",
        "url": f"https://github.com/{OWNER}/{REPO}/actions"
    }
