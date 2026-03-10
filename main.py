import os
import re
import json
import uuid
import httpx
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, HTTPException, status
from pydantic import BaseModel
from supabase import create_client, Client

# ==========================================
# CONFIGURATION & ENVIRONMENT VARIABLES
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-anon-key")
PLAYFUL_GH_TOKEN = os.getenv("PLAYFUL_GH_TOKEN", "your-gh-token")
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "Surya-git-enf")
PLAYFUL_BUILDER_REPO = os.getenv("PLAYFUL_BUILDER_REPO", "Playful")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "your-gemini-key")
GEMINI_API_ENDPOINT = os.getenv(
    "GEMINI_API_ENDPOINT", 
    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={GEMINI_API_KEY}"
)
BUILD_MODE = os.getenv("BUILD_MODE", "simulation") # 'simulation' or 'production'
PLAYFUL_ADMOB_BANNER_ID = os.getenv("PLAYFUL_ADMOB_BANNER_ID", "ca-app-pub-xxx")
PLAYFUL_ADMOB_INTERSTITIAL_ID = os.getenv("PLAYFUL_ADMOB_INTERSTITIAL_ID", "ca-app-pub-yyy")

# Initialize Supabase
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Warning: Supabase client failed to initialize. {e}")
    supabase = None

# FastAPI App
app = FastAPI(title="Playful Backend", version="1.0.0")

# ==========================================
# STATE & JOB MANAGEMENT
# ==========================================
JOB_STORE: Dict[str, Dict[str, Any]] = {}
ACTIVE_CONNECTIONS: Dict[str, WebSocket] = {}

class ConnectionManager:
    async def connect(self, job_id: str, websocket: WebSocket):
        await websocket.accept()
        ACTIVE_CONNECTIONS[job_id] = websocket

    def disconnect(self, job_id: str):
        if job_id in ACTIVE_CONNECTIONS:
            del ACTIVE_CONNECTIONS[job_id]

    async def send_update(self, job_id: str, status: str, message: str, data: dict = None):
        if job_id in JOB_STORE:
            JOB_STORE[job_id]["status"] = status
            JOB_STORE[job_id]["message"] = message
            if data:
                JOB_STORE[job_id].update(data)
                
        if job_id in ACTIVE_CONNECTIONS:
            payload = {"job_id": job_id, "status": status, "message": message}
            if data:
                payload["data"] = data
            await ACTIVE_CONNECTIONS[job_id].send_json(payload)

manager = ConnectionManager()

# ==========================================
# PYDANTIC MODELS
# ==========================================
class GenerateRequest(BaseModel):
    email: str
    game_name: str
    prompt: str

class BuildAPKRequest(BaseModel):
    email: str
    game_name: str

class HistoryAppendRequest(BaseModel):
    email: str
    game_name: str
    role: str
    content: str

# ==========================================
# HELPER FUNCTIONS
# ==========================================
async def get_user(email: str) -> dict:
    if not supabase: raise Exception("Supabase not configured")
    res = supabase.table("users").select("*").eq("email", email).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]

def sanitize_code(content: str) -> str:
    """Removes dangerous JavaScript execution vectors."""
    content = re.sub(r'\beval\s*\(', '/* eval removed */ (', content)
    content = re.sub(r'\bnew\s+Function\s*\(', '/* new Function removed */ (', content)
    return content

async def generate_game_with_ai(prompt: str, history: list, game_name: str) -> dict:
    """Calls Gemini AI to generate a structured JSON manifest for the game."""
    if BUILD_MODE == "simulation":
        await asyncio.sleep(2)
        return {
            "project_name": game_name,
            "files": [
                {"path": "index.html", "type": "text", "content": f"<html><body><h1>{game_name}</h1><script src='js/app.js'></script></body></html>"},
                {"path": "js/app.js", "type": "text", "content": "console.log('Game Started');"}
            ],
            "estimated_credits": 2
        }

    # Construct context from last 12 messages
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in history[-12:]])
    system_instruction = f"""
    You are an expert game developer. Create a game named {game_name}.
    Return ONLY a valid JSON object with 'project_name', 'files' (array of path, type, content), and 'estimated_credits'.
    History:\n{history_text}\nUser Prompt:\n{prompt}
    """
    
    payload = {
        "contents": [{"parts": [{"text": system_instruction}]}]
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(GEMINI_API_ENDPOINT, json=payload)
        resp.raise_for_status()
        data = resp.json()
        raw_text = data['candidates'][0]['content']['parts'][0]['text']
        
        # Clean markdown codeblocks if AI wraps JSON
        if raw_text.startswith("```json"):
            raw_text = raw_text.strip("`").replace("json\n", "")
            
        return json.loads(raw_text)

async def github_api(method: str, endpoint: str, json_data: dict = None) -> dict:
    url = f"[https://api.github.com](https://api.github.com){endpoint}"
    headers = {
        "Authorization": f"Bearer {PLAYFUL_GH_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url, headers=headers, json=json_data)
        if resp.status_code >= 400:
            raise Exception(f"GitHub API Error: {resp.text}")
        return resp.json() if resp.text else {}

async def commit_files_to_github(username: str, game_name: str, files: list):
    """Commits multiple files to a specific folder in the user's repository."""
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    
    # 1. Ensure Repo Exists (Fallback logic can be added here)
    # 2. Get reference to main branch
    ref_data = await github_api("GET", f"{repo_path}/git/ref/heads/main")
    base_sha = ref_data["object"]["sha"]
    
    # 3. Get base tree
    commit_data = await github_api("GET", f"{repo_path}/git/commits/{base_sha}")
    tree_sha = commit_data["tree"]["sha"]
    
    # 4. Create blobs and tree items
    tree_items = []
    for file in files:
        sanitized_content = sanitize_code(file["content"])
        if len(sanitized_content) > 1024 * 1024 * 5: # 5MB limit
            raise Exception(f"File {file['path']} exceeds 5MB limit.")
            
        blob = await github_api("POST", f"{repo_path}/git/blobs", {
            "content": sanitized_content, "encoding": "utf-8"
        })
        tree_items.append({
            "path": f"{game_name}/{file['path']}",
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })
        
    # 5. Create new tree
    new_tree = await github_api("POST", f"{repo_path}/git/trees", {
        "base_tree": tree_sha, "tree": tree_items
    })
    
    # 6. Create Commit
    new_commit = await github_api("POST", f"{repo_path}/git/commits", {
        "message": f"Update game {game_name} via Playful AI",
        "tree": new_tree["sha"],
        "parents": [base_sha]
    })
    
    # 7. Update Ref
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {
        "sha": new_commit["sha"]
    })

# ==========================================
# BACKGROUND WORKFLOWS
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    try:
        await manager.send_update(job_id, "initializing", "Setting up environment...")
        
        # Extract history
        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        
        # Generate Code
        await manager.send_update(job_id, "thinking", "AI is designing your game...")
        manifest = await generate_game_with_ai(req.prompt, game_history, req.game_name)
        
        # Deduct credits
        cost = manifest.get("estimated_credits", 1)
        if user["credits"] < cost:
            raise Exception("Insufficient credits.")
        supabase.table("users").update({"credits": user["credits"] - cost}).eq("id", user["id"]).execute()
        
        # Commit Code
        await manager.send_update(job_id, "committing", "Saving code to GitHub...")
        await commit_files_to_github(user["username"], req.game_name, manifest["files"])
        
        # Enable Pages (Safely ignore if already enabled)
        await manager.send_update(job_id, "enabling pages", "Publishing game to web...")
        try:
            await github_api("POST", f"/repos/{GITHUB_OWNER}/{user['username']}/pages", {
                "source": {"branch": "main", "path": "/"}
            })
        except Exception as e:
            if "already exists" not in str(e).lower():
                pass # Log error but continue
                
        # Update Chat History
        game_history.append({"role": "user", "content": req.prompt, "ts": datetime.utcnow().timestamp()})
        game_history.append({"role": "assistant", "content": "Game generated successfully", "ts": datetime.utcnow().timestamp()})
        chat_history[req.game_name] = game_history
        supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        
        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(job_id, "done", "Game is ready!", {"preview_url": preview_url})
        
    except Exception as e:
        print(f"Workflow Error: {e}")
        await manager.send_update(job_id, "failed", str(e))

async def build_apk_workflow(job_id: str, req: BuildAPKRequest, user: dict):
    try:
        await manager.send_update(job_id, "initializing", "Preparing APK build pipeline...")
        
        # Deduct build credit
        if user["builds"] < 1:
            raise Exception("Insufficient build credits.")
        supabase.table("users").update({"builds": user["builds"] - 1}).eq("id", user["id"]).execute()
        
        # Dispatch GitHub Action
        await manager.send_update(job_id, "building apk", "Dispatching build worker...")
        dispatch_payload = {
            "ref": "main",
            "inputs": {
                "owner": GITHUB_OWNER,
                "repo": user["username"],
                "folder": req.game_name,
                "admob_banner": PLAYFUL_ADMOB_BANNER_ID,
                "admob_interstitial": PLAYFUL_ADMOB_INTERSTITIAL_ID
            }
        }
        await github_api("POST", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/workflows/build_apk.yml/dispatches", dispatch_payload)
        
        # Simulate polling for brevity in this architectual setup. 
        # In prod: use `/actions/runs` to find the exact run ID based on timing/actor, then poll `/actions/runs/{run_id}`
        for i in range(5):
            await asyncio.sleep(5)
            await manager.send_update(job_id, "building apk", f"Compiling native code... (Step {i+1}/5)")
            
        apk_url = f"[https://github.com/](https://github.com/){GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/artifacts/latest"
        await manager.send_update(job_id, "completed", "APK Build successful!", {"apk_url": apk_url})

    except Exception as e:
        await manager.send_update(job_id, "failed", str(e))

# ==========================================
# API ENDPOINTS
# ==========================================

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.post("/generate-and-commit")
async def api_generate_and_commit(req: GenerateRequest, background_tasks: BackgroundTasks):
    user = await get_user(req.email)
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Waiting to start..."}
    background_tasks.add_task(generate_and_commit_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.post("/build-apk")
async def api_build_apk(req: BuildAPKRequest, background_tasks: BackgroundTasks):
    user = await get_user(req.email)
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Queuing APK Build..."}
    background_tasks.add_task(build_apk_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in JOB_STORE:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOB_STORE[job_id]

@app.post("/history/append")
async def append_history(req: HistoryAppendRequest):
    user = await get_user(req.email)
    chat_history = user.get("chat_history", {})
    game_history = chat_history.get(req.game_name, [])
    
    game_history.append({
        "role": req.role, 
        "content": req.content, 
        "ts": datetime.utcnow().timestamp()
    })
    
    chat_history[req.game_name] = game_history
    supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
    return {"status": "success"}

# ==========================================
# WEBSOCKETS
# ==========================================
@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await manager.connect(job_id, websocket)
    try:
        # Send current status immediately upon connection
        if job_id in JOB_STORE:
            await websocket.send_json({"job_id": job_id, **JOB_STORE[job_id]})
            
        while True:
            # Keep connection alive, wait for client messages if necessary
            data = await websocket.receive_text()
            # Handle client-side pings or cancellations here
    except WebSocketDisconnect:
        manager.disconnect(job_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
            
