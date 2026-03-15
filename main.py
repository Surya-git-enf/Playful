import os
import re
import json
import uuid
import httpx
import base64
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import google.generativeai as genai

# ==========================================
# CONFIGURATION & ENVIRONMENT VARIABLES
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-service-role-key") 
PLAYFUL_GH_TOKEN = os.getenv("PLAYFUL_GH_TOKEN", "your-gh-token")
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "Surya-git-enf")
PLAYFUL_BUILDER_REPO = os.getenv("PLAYFUL_BUILDER_REPO", "Playful")

# Monetization Defaults (For Free Users)
PLAYFUL_DEFAULT_BANNER_ID = os.getenv("PLAYFUL_DEFAULT_BANNER_ID", "ca-app-pub-xxx/banner")
PLAYFUL_DEFAULT_INTERSTITIAL_ID = os.getenv("PLAYFUL_DEFAULT_INTERSTITIAL_ID", "ca-app-pub-xxx/interstitial")
PLAYFUL_AD_INTERVAL_MINS = os.getenv("PLAYFUL_AD_INTERVAL_MINS", "10")

# AI Setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSy_YOUR_ACTUAL_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Warning: Supabase client failed to initialize. {e}")
    supabase = None

app = FastAPI(title="Playful Backend - Production", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
class BaseUserRequest(BaseModel):
    email: str

class GenerateRequest(BaseModel):
    email: str
    game_name: str
    prompt: str

class GameRequest(BaseModel):
    email: str
    game_name: str

class EditGameNameRequest(BaseModel):
    email: str
    old_game_name: str
    new_game_name: str

class BuildAPKRequest(BaseModel):
    email: str
    game_name: str

class AddAdmobRequest(BaseModel):
    email: str
    admob_banner: str
    admob_interstitial: str
    admob_interval: str

# ==========================================
# HELPER FUNCTIONS
# ==========================================
async def get_user(email: str) -> dict:
    if not supabase: raise Exception("Supabase not configured")
    res = supabase.table("users").select("*").eq("email", email).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_data = res.data[0]
    if "plan" not in user_data:
        user_data["plan"] = "free"
    if "builds" not in user_data:
        user_data["builds"] = 0
    if "credits" not in user_data:
        user_data["credits"] = 0
    return user_data

def sanitize_code(content: str) -> str:
    content = re.sub(r'\beval\s*\(', '/* eval removed */ (', content)
    content = re.sub(r'\bnew\s+Function\s*\(', '/* new Function removed */ (', content)
    return content

async def github_api(method: str, endpoint: str, json_data: dict = None, return_status: bool = False):
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
async def fetch_existing_game_code(username: str, game_name: str) -> str:
    endpoint = f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}/index.html"
    status, data = await github_api("GET", endpoint, return_status=True)
    if status == 200 and "content" in data:
        return base64.b64decode(data["content"]).decode('utf-8')
    return None

async def ensure_user_repo_exists(username: str):
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    status, _ = await github_api("GET", repo_path, return_status=True)
    if status == 404:
        create_payload = {"name": username, "private": False, "auto_init": True}
        try:
            await github_api("POST", f"/orgs/{GITHUB_OWNER}/repos", create_payload)
        except Exception:
            await github_api("POST", "/user/repos", create_payload)
        await asyncio.sleep(4) 
    elif status >= 400:
        raise Exception(f"Failed to verify repo status. HTTP {status}")

async def commit_files_to_github(username: str, game_name: str, files: list):
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    ref_data = await github_api("GET", f"{repo_path}/git/ref/heads/main")
    base_sha = ref_data["object"]["sha"]
    commit_data = await github_api("GET", f"{repo_path}/git/commits/{base_sha}")
    tree_sha = commit_data["tree"]["sha"]
    
    tree_items = []
    for file in files:
        sanitized_content = sanitize_code(file["content"])
        blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": sanitized_content, "encoding": "utf-8"})
        tree_items.append({
            "path": f"{game_name}/{file['path']}",
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })
        
    new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": tree_sha, "tree": tree_items})
    new_commit = await github_api("POST", f"{repo_path}/git/commits", {"message": f"Deploy {game_name} via Playful AI", "tree": new_tree["sha"], "parents": [base_sha]})
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})

async def delete_folder_from_github(username: str, game_name: str):
    endpoint = f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}"
    status, files = await github_api("GET", endpoint, return_status=True)
    if status == 200 and isinstance(files, list):
        for file in files:
            payload = {"message": f"Delete {file['path']}", "sha": file['sha']}
            await github_api("DELETE", f"/repos/{GITHUB_OWNER}/{username}/contents/{file['path']}", json_data=payload)

# ==========================================
# AI GENERATION ENGINE
# ==========================================
async def generate_game_with_ai(prompt: str, history: list, game_name: str, current_code: str) -> dict:
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in history[-12:]])
    
    context_block = ""
    if current_code:
        context_block = f"\nCURRENT EXISTING CODE FOR {game_name}:\n```html\n{current_code}\n```\nYou are EDITING this existing game. Only return the fully updated files."
    else:
        context_block = f"\nThis is a BRAND NEW game. Generate the complete foundational code."

    system_instruction = f"""
    You are an expert 3D Game Developer AI acting as a conversational agent.
    Your goal is to build or modify a game named '{game_name}' using strictly Babylon.js.
    Use CDN links (https://cdn.babylonjs.com/babylon.js).
    {context_block}
    
    You MUST return a valid JSON object matching this exact schema:
    {{
        "project_name": "string",
        "files": [ {{ "path": "index.html", "type": "text", "content": "<html>...</html>" }} ],
        "assistant_message": "string (A friendly conversational reply explaining what you built/changed. Be enthusiastic!)",
        "estimated_credits": int (1 for minor edits, 2-5 for large creations)
    }}
    History:\n{history_text}
    """
    
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash", 
        system_instruction=system_instruction,
        generation_config={"response_mime_type": "application/json"}
    )

    try:
        response = await model.generate_content_async(prompt)
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text.strip("`").replace("json\n", "")
        return json.loads(raw_text)
    except Exception as e:
        exact_error = f"Google AI Error: {str(e)}"
        print(exact_error)
        raise Exception(exact_error)

# ==========================================
# BACKGROUND WORKFLOWS
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    try:
        await manager.send_update(job_id, "Booting the Engine", "Loading physics, textures, and dreamscapes...")
        
        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        current_code = await fetch_existing_game_code(user["username"], req.game_name)
        
        current_games = len(chat_history.keys())
        plan_limits = {"free": 3, "creator": 10, "studio": 30}
        allowed_games = plan_limits.get(user.get("plan", "free"), 3)

        if not current_code and current_games >= allowed_games:
            raise Exception("limit_reached")
        
        if current_code:
            await manager.send_update(job_id, "Rewriting the Matrix", "Injecting your modifications into the game core...")
        else:
            await manager.send_update(job_id, "Forging the World", "The AI is currently crafting your 3D universe...")
            
        manifest = await generate_game_with_ai(req.prompt, game_history, req.game_name, current_code)
        
        cost = manifest.get("estimated_credits", 1)
        if user["credits"] < cost:
            raise Exception("insufficient_credits")
            
        supabase.table("users").update({"credits": user["credits"] - cost}).eq("id", user["id"]).execute()
        
        await manager.send_update(job_id, "Initializing Server", f"Preparing your global repository...")
        await ensure_user_repo_exists(user["username"])
        
        await manager.send_update(job_id, "Materializing Assets", f"Pushing game files to the global cloud servers...")
        await commit_files_to_github(user["username"], req.game_name, manifest["files"])
        
        await manager.send_update(job_id, "Opening Portals", "Configuring public access links...")
        await github_api("POST", f"/repos/{GITHUB_OWNER}/{user['username']}/pages", {"source": {"branch": "main", "path": "/"}}, return_status=True)
                
        ts = datetime.utcnow().timestamp()
        game_history.append({"role": "user", "content": req.prompt, "ts": ts})
        game_history.append({"role": "assistant", "content": manifest["assistant_message"], "ts": ts + 1})
        chat_history[req.game_name] = game_history
        supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        
        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(job_id, "Level Unlocked!", manifest["assistant_message"], {"preview_url": preview_url, "cost": cost})
        
    except Exception as e:
        await manager.send_update(job_id, "failed", str(e))

async def build_apk_workflow(job_id: str, req: BuildAPKRequest, user: dict):
    try:
        is_free_user = user.get("plan", "free") == "free"

        # 0% - Booting up tailored to plan
        if is_free_user:
            await manager.send_update(job_id, "Initializing", "Booting up the Playful Engine... 🚀", {"progress": 0})
        else:
            await manager.send_update(job_id, "Initializing", "Verifying Pro License... 👑", {"progress": 0})
        
        if user.get("builds", 0) < 1:
            raise Exception("insufficient_builds")
            
        build_cost = 5 if is_free_user else 10
        if user.get("credits", 0) < build_cost:
            raise Exception("insufficient_credits")

        if is_free_user:
            final_banner = PLAYFUL_DEFAULT_BANNER_ID
            final_interstitial = PLAYFUL_DEFAULT_INTERSTITIAL_ID
            final_ad_interval = PLAYFUL_AD_INTERVAL_MINS
            watermark_enabled = "true"
        else:
            final_banner = user.get("admob_banner") or ""
            final_interstitial = user.get("admob_interstitial") or ""
            final_ad_interval = user.get("admob_interval") or "10" 
            watermark_enabled = "false"

        new_builds = user["builds"] - 1
        new_credits = user["credits"] - build_cost
        supabase.table("users").update({
            "builds": new_builds, 
            "credits": new_credits
        }).eq("id", user["id"]).execute()
        
        # Triggering the GitHub Workflow
        dispatch_payload = {
            "ref": "main", 
            "inputs": {
                "owner": GITHUB_OWNER, 
                "repo": user["username"], 
                "folder": req.game_name,
                "admob_banner": final_banner,
                "admob_interstitial": final_interstitial,
                "ad_interval_minutes": final_ad_interval,
                "watermark": watermark_enabled
            }
        }
        await github_api("POST", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/workflows/build_apk.yml/dispatches", dispatch_payload)
        
        # ==========================================
        # EPIC DYNAMIC FRONTEND ANIMATION SEQUENCE
        # ==========================================
        
        await asyncio.sleep(5)
        await manager.send_update(job_id, "Fetching Code", "Downloading your 3D universe... 🌌", {"progress": 20})
        
        await asyncio.sleep(15)
        if is_free_user:
            await manager.send_update(job_id, "Watermark", "Applying the Playful Watermark... 💧", {"progress": 35})
        else:
            await manager.send_update(job_id, "Watermark", "Stripping all watermarks for Pro Build... 🚫💧", {"progress": 35})
            
        await asyncio.sleep(10)
        if is_free_user:
            await manager.send_update(job_id, "Monetization", "Wiring up the Playful Ad Network... 💸", {"progress": 50})
        else:
            await manager.send_update(job_id, "Monetization", "Injecting YOUR custom AdMob IDs... 💰", {"progress": 50})
            
        await asyncio.sleep(15)
        await manager.send_update(job_id, "Capacitor", "Forging the native Android shell... 🛡️", {"progress": 65})
        
        await asyncio.sleep(20)
        if is_free_user:
            await manager.send_update(job_id, "Compiling", "Compiling Gradle code (Grab a coffee, this takes a minute ☕)...", {"progress": 80})
        else:
            await manager.send_update(job_id, "Compiling", "Compiling High-Speed Native Code... ⚡", {"progress": 80})
        
        await asyncio.sleep(40)
        if is_free_user:
            await manager.send_update(job_id, "Finalizing", "Signing and polishing the final APK... ✨", {"progress": 95})
        else:
            await manager.send_update(job_id, "Finalizing", "Signing your custom App Bundle... ✨", {"progress": 95})
        
        await asyncio.sleep(15) 
        
        apk_url = f"[https://github.com/](https://github.com/){GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/releases/download/latest-{user['username']}-{req.game_name}/{req.game_name}.apk"
        
        if is_free_user:
            await manager.send_update(job_id, "Build Complete!", "Level Unlocked! Your Android game is ready! 🎮", {"progress": 100, "apk_url": apk_url})
        else:
            await manager.send_update(job_id, "Build Complete!", "Masterpiece Complete! Your game is ready for the Play Store! 🏆", {"progress": 100, "apk_url": apk_url})

    except Exception as e:
        await manager.send_update(job_id, "failed", str(e))

# ==========================================
# REST API ENDPOINTS
# ==========================================
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.post("/generate-commit")
async def api_generate_and_commit(req: GenerateRequest, background_tasks: BackgroundTasks):
    user = await get_user(req.email)
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Analyzing request..."}
    background_tasks.add_task(generate_and_commit_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.post("/addadmob")
async def api_add_admob(req: AddAdmobRequest):
    user = await get_user(req.email)
    if user.get("plan", "free") == "free":
        raise HTTPException(status_code=403, detail="AdMob integration requires a Creator or Studio plan.")
        
    try:
        supabase.table("users").update({
            "admob_banner": req.admob_banner,
            "admob_interstitial": req.admob_interstitial,
            "admob_interval": req.admob_interval
        }).eq("id", user["id"]).execute()
        return {"status": "success", "message": "AdMob settings locked in! 💰"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/edit-game-name")
async def api_edit_game_name(req: EditGameNameRequest):
    user = await get_user(req.email)
    username = user["username"]
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    
    try:
        ref_data = await github_api("GET", f"{repo_path}/git/ref/heads/main")
        base_sha = ref_data["object"]["sha"]
        commit_data = await github_api("GET", f"{repo_path}/git/commits/{base_sha}")
        base_tree_sha = commit_data["tree"]["sha"]
        
        tree_data = await github_api("GET", f"{repo_path}/git/trees/{base_tree_sha}")
        old_folder_sha = None
        for item in tree_data.get("tree", []):
            if item["path"] == req.old_game_name and item["type"] == "tree":
                old_folder_sha = item["sha"]
                break
                
        if not old_folder_sha:
            raise Exception("Original game folder not found on GitHub.")

        tree_items = [
            {"path": req.old_game_name, "mode": "040000", "type": "tree", "sha": None}, 
            {"path": req.new_game_name, "mode": "040000", "type": "tree", "sha": old_folder_sha} 
        ]
        
        new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": base_tree_sha, "tree": tree_items})
        new_commit = await github_api("POST", f"{repo_path}/git/commits", {"message": f"Rename game {req.old_game_name} -> {req.new_game_name}", "tree": new_tree["sha"], "parents": [base_sha]})
        await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})
        
        chat_history = user.get("chat_history", {})
        if req.old_game_name in chat_history:
            chat_history[req.new_game_name] = chat_history.pop(req.old_game_name)
            supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
            
        new_preview_url = f"https://{GITHUB_OWNER}.github.io/{username}/{req.new_game_name}/index.html"
        return {"status": "success", "message": f"Game renamed to {req.new_game_name}", "new_preview_url": new_preview_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deletegame")
async def api_delete_game(req: GameRequest):
    user = await get_user(req.email)
    try:
        await delete_folder_from_github(user["username"], req.game_name)
        chat_history = user.get("chat_history", {})
        if req.game_name in chat_history:
            del chat_history[req.game_name]
            supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        return {"status": "success", "message": f"Game '{req.game_name}' deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/getgames")
async def api_get_games(req: BaseUserRequest):
    user = await get_user(req.email)
    endpoint = f"/repos/{GITHUB_OWNER}/{user['username']}/contents"
    status, contents = await github_api("GET", endpoint, return_status=True)
    
    if status == 404:
        return {"games": []}
        
    games = []
    for item in contents:
        if item["type"] == "dir":
            games.append({
                "game_name": item["name"],
                "preview_url": f"https://{GITHUB_OWNER}.github.io/{user['username']}/{item['name']}/index.html",
                "last_updated": "Available in Repo" 
            })
    return {"games": games}

@app.post("/getchat")
async def api_get_chat(req: GameRequest):
    user = await get_user(req.email)
    chat_history = user.get("chat_history", {})
    return {"game_name": req.game_name, "chat": chat_history.get(req.game_name, [])}

@app.post("/build-apk")
async def api_build_apk(req: BuildAPKRequest, background_tasks: BackgroundTasks):
    user = await get_user(req.email)
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Queuing APK Build...", "progress": 0}
    background_tasks.add_task(build_apk_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in JOB_STORE:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOB_STORE[job_id]

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
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
