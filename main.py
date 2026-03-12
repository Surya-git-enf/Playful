import os
import re
import json
import uuid
import httpx
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
import google.generativeai as genai

# ==========================================
# CONFIGURATION & ENVIRONMENT VARIABLES
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-service-role-key") # Use service_role to bypass RLS!
PLAYFUL_GH_TOKEN = os.getenv("PLAYFUL_GH_TOKEN", "your-gh-token")
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "Surya-git-enf")
PLAYFUL_BUILDER_REPO = os.getenv("PLAYFUL_BUILDER_REPO", "Playful")
BUILD_MODE = os.getenv("BUILD_MODE", "production") # 'simulation' or 'production'

# AI Setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSy_YOUR_ACTUAL_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)

# Initialize Supabase
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Warning: Supabase client failed to initialize. {e}")
    supabase = None

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
    """Calls Gemini AI using the official SDK to generate a structured JSON manifest."""
    if BUILD_MODE == "simulation":
        await asyncio.sleep(2)
        return {
            "project_name": game_name,
            "files": [
                {"path": "index.html", "type": "text", "content": f"<html><body><h1 style='color:red;'>{game_name}</h1><script src='js/app.js'></script></body></html>"},
                {"path": "js/app.js", "type": "text", "content": "console.log('Simulation Game Started!');"}
            ],
            "estimated_credits": 2
        }

    # Build context
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in history[-12:]])
    system_instruction = f"""
    You are an expert game developer. Create a game named {game_name}.
    Return ONLY a valid JSON object with 'project_name', 'files' (array of path, type, content), and 'estimated_credits'.
    History:\n{history_text}
    """
    
    # Initialize the Flash model (Fast, 15 RPM free limit)
    model = genai.GenerativeModel(
        model_name="models/gemini-2.5-pro",
        system_instruction=system_instruction,
        generation_config={"response_mime_type": "application/json"}
    )
    
    try:
        response = await model.generate_content_async(prompt)
        raw_text = response.text
        
        # Strip markdown formatting just in case Gemini adds it
        if raw_text.startswith("```json"):
            raw_text = raw_text.strip("`").replace("json\n", "")
            
        return json.loads(raw_text)
    except Exception as e:
        # This will now capture the EXACT error from Google and send it to you
        exact_error = f"Google AI Error: {str(e)}"
        print(exact_error)
        raise Exception(exact_error) 
        
    
        

        
        

async def github_api(method: str, endpoint: str, json_data: dict = None, return_status: bool = False):
    """Generic wrapper for GitHub API calls."""
    url = f"https://api.github.com{endpoint}"
    headers = {
        "Authorization": f"Bearer {PLAYFUL_GH_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url, headers=headers, json=json_data, timeout=30.0)
        
        if return_status:
            return resp.status_code, resp.json() if resp.text else {}
            
        if resp.status_code >= 400:
            raise Exception(f"GitHub API Error ({resp.status_code}): {resp.text}")
        return resp.json() if resp.text else {}

# ==========================================
# CORE GITHUB ORCHESTRATION
# ==========================================
async def ensure_user_repo_exists(username: str):
    """Checks if the user's repository exists. If not, creates it on the fly."""
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    
    status, _ = await github_api("GET", repo_path, return_status=True)
    
    if status == 404:
        print(f"Repository for {username} not found. Creating it now...")
        create_payload = {
            "name": username,
            "description": f"Playful Games Repository for {username}",
            "private": False, # Must be public for free GitHub Pages
            "auto_init": True 
        }
        
        try:
            await github_api("POST", f"/orgs/{GITHUB_OWNER}/repos", create_payload)
        except Exception as e:
            if "Not Found" in str(e):
                await github_api("POST", "/user/repos", create_payload)
        
        await asyncio.sleep(4) # Wait for GitHub to initialize 'main' branch
    elif status >= 400:
        raise Exception(f"Failed to verify repository status. HTTP {status}")

async def commit_files_to_github(username: str, game_name: str, files: list):
    """Commits game files into a specific folder inside the user's repository."""
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    
    # 1. Get reference to main branch
    ref_data = await github_api("GET", f"{repo_path}/git/ref/heads/main")
    base_sha = ref_data["object"]["sha"]
    
    # 2. Get base tree
    commit_data = await github_api("GET", f"{repo_path}/git/commits/{base_sha}")
    tree_sha = commit_data["tree"]["sha"]
    
    # 3. Create blobs and format tree items
    tree_items = []
    for file in files:
        sanitized_content = sanitize_code(file["content"])
        if len(sanitized_content) > 1024 * 1024 * 5: # 5MB limit
            raise Exception(f"File {file['path']} exceeds 5MB limit.")
            
        blob = await github_api("POST", f"{repo_path}/git/blobs", {
            "content": sanitized_content, "encoding": "utf-8"
        })
        tree_items.append({
            "path": f"{game_name}/{file['path']}", # Game folder routing!
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })
        
    # 4. Create new tree
    new_tree = await github_api("POST", f"{repo_path}/git/trees", {
        "base_tree": tree_sha, "tree": tree_items
    })
    
    # 5. Create Commit
    new_commit = await github_api("POST", f"{repo_path}/git/commits", {
        "message": f"Deploy {game_name} via Playful AI",
        "tree": new_tree["sha"],
        "parents": [base_sha]
    })
    
    # 6. Update main branch Reference
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {
        "sha": new_commit["sha"]
    })

# ==========================================
# BACKGROUND WORKFLOWS
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    try:
        await manager.send_update(job_id, "initializing", "Setting up environment...")
        
        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        
        # 1. Generate Code
        await manager.send_update(job_id, "thinking", "AI is designing your game...")
        manifest = await generate_game_with_ai(req.prompt, game_history, req.game_name)
        
        # 2. Deduct credits
        cost = manifest.get("estimated_credits", 1)
        if user["credits"] < cost:
            raise Exception("Insufficient credits.")
        supabase.table("users").update({"credits": user["credits"] - cost}).eq("id", user["id"]).execute()
        
        # 3. Ensure Repo Exists
        await manager.send_update(job_id, "initializing", f"Preparing repository: {user['username']}...")
        await ensure_user_repo_exists(user["username"])
        
        # 4. Commit Code
        await manager.send_update(job_id, "committing", f"Saving {req.game_name} to GitHub...")
        await commit_files_to_github(user["username"], req.game_name, manifest["files"])
        
        # 5. Enable Pages
        await manager.send_update(job_id, "enabling pages", "Publishing game to web...")
        status, resp = await github_api("POST", f"/repos/{GITHUB_OWNER}/{user['username']}/pages", {
            "source": {"branch": "main", "path": "/"}
        }, return_status=True)
                
        # 6. Update History
        game_history.append({"role": "user", "content": req.prompt, "ts": datetime.utcnow().timestamp()})
        game_history.append({"role": "assistant", "content": "Game generated successfully", "ts": datetime.utcnow().timestamp()})
        chat_history[req.game_name] = game_history
        supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        
        # 7. Deliver URL
        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(job_id, "done", "Game is ready!", {"preview_url": preview_url})
        
    except Exception as e:
        print(f"Workflow Error: {e}")
        await manager.send_update(job_id, "failed", str(e))

async def build_apk_workflow(job_id: str, req: BuildAPKRequest, user: dict):
    try:
        await manager.send_update(job_id, "initializing", "Preparing APK build pipeline...")
        
        if user["builds"] < 1:
            raise Exception("Insufficient build credits.")
        supabase.table("users").update({"builds": user["builds"] - 1}).eq("id", user["id"]).execute()
        
        await manager.send_update(job_id, "building apk", "Dispatching build worker...")
        dispatch_payload = {"ref": "main", "inputs": {"owner": GITHUB_OWNER, "repo": user["username"], "folder": req.game_name}}
        await github_api("POST", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/workflows/build_apk.yml/dispatches", dispatch_payload)
        
        for i in range(5):
            await asyncio.sleep(5)
            await manager.send_update(job_id, "building apk", f"Compiling native code... (Step {i+1}/5)")
            
        apk_url = f"https://github.com/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/artifacts/latest"
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
    game_history.append({"role": req.role, "content": req.content, "ts": datetime.utcnow().timestamp()})
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
        if job_id in JOB_STORE:
            await websocket.send_json({"job_id": job_id, **JOB_STORE[job_id]})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(job_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    
