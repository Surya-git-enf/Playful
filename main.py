import os
import re
import json
import uuid
import httpx
import base64
import zipfile
import io
import asyncio
from datetime import date, datetime
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
SKETCHFAB_API_TOKEN = os.getenv("SKETCHFAB_API_TOKEN", "your-sketchfab-token-here")

# Monetization Defaults (For Free Users)
PLAYFUL_DEFAULT_BANNER_ID = os.getenv("PLAYFUL_DEFAULT_BANNER_ID", "ca-app-pub-xxx/banner")
PLAYFUL_DEFAULT_INTERSTITIAL_ID = os.getenv("PLAYFUL_DEFAULT_INTERSTITIAL_ID", "ca-app-pub-xxx/interstitial")
PLAYFUL_AD_INTERVAL_MINS = os.getenv("PLAYFUL_AD_INTERVAL_MINS", "10")

# AI Setup (Dual Models)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSy_YOUR_ACTUAL_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)
# Flash for fast tasks, Pro for heavy coding
model_flash = genai.GenerativeModel(model_name="gemini-1.5-flash", generation_config={"response_mime_type": "application/json"})
model_pro = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config={"response_mime_type": "application/json"})

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Warning: Supabase client failed to initialize. {e}")
    supabase = None

app = FastAPI(title="Playable Backend - Unicorn Edition", version="6.0.0")

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

class AssetSearchRequest(BaseModel):
    email: str
    prompt: str

class GenerateRequest(BaseModel):
    email: str
    game_name: str
    prompt: str
    selected_uids: Optional[List[str]] = []

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

# ==========================================
# UNICORN GATEKEEPER & ROLLOVER LOGIC
# ==========================================
async def get_user(email: str) -> dict:
    if not supabase: raise Exception("Supabase not configured")
    res = supabase.table("users").select("*").eq("email", email).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = res.data[0]
    today = date.today()
    last_reset = date.fromisoformat(user.get("last_reset_date", str(today)))
    days_passed = (today - last_reset).days

    # THE LAZY EVALUATION (Rollover Logic)
    if days_passed > 0:
        plan = user.get("plan", "free")
        plan_days = user.get("plan_days", 7)
        current_credits = float(user.get("credits", 0.0))
        
        days_to_process = min(days_passed, plan_days)
        
        if days_to_process > 0:
            if plan == "creator":
                current_credits += (days_to_process * 15.0)
            elif plan == "studio":
                current_credits += (days_to_process * 30.0)
            elif plan == "free":
                # Free users get topped up TO 5.0, they don't hoard credits
                if current_credits < 1.0:
                    current_credits = 5.0
            plan_days -= days_to_process
            
        # Downgrade check if paid/trial days are over
        if plan_days <= 0 and plan != "free":
            plan = "free"
            
        # Push the exact updates to Supabase
        updates = {
            "credits": current_credits,
            "plan_days": plan_days,
            "plan": plan,
            "last_reset_date": str(today)
        }
        supabase.table("users").update(updates).eq("id", user["id"]).execute()
        user.update(updates)

    # Ensure JSONB fields exist
    if "game_assets" not in user or not user["game_assets"]: user["game_assets"] = {}
    if "monetization" not in user or not user["monetization"]: user["monetization"] = {}
    
    return user

def sanitize_code(content: str) -> str:
    content = re.sub(r'\beval\s*\(', '/* eval removed */ (', content)
    content = re.sub(r'\bnew\s+Function\s*\(', '/* new Function removed */ (', content)
    return content

# ==========================================
# GITHUB RAW API (For Code and Binary 3D Models)
# ==========================================
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

async def commit_files_to_github(username: str, game_name: str, files: list, is_binary: bool = False):
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    ref_data = await github_api("GET", f"{repo_path}/git/ref/heads/main")
    base_sha = ref_data["object"]["sha"]
    commit_data = await github_api("GET", f"{repo_path}/git/commits/{base_sha}")
    tree_sha = commit_data["tree"]["sha"]
    
    tree_items = []
    for file in files:
        if is_binary:
            # Binary files (like .glb) need base64 encoding for the GitHub blob
            blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": file["content"], "encoding": "base64"})
        else:
            # Code files (HTML/JS)
            sanitized = sanitize_code(file["content"])
            blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": sanitized, "encoding": "utf-8"})
            
        tree_items.append({
            "path": f"{game_name}/{file['path']}",
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })
        
    new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": tree_sha, "tree": tree_items})
    commit_msg = f"Deploy {game_name} assets" if is_binary else f"Deploy {game_name} code via Playable AI"
    new_commit = await github_api("POST", f"{repo_path}/git/commits", {"message": commit_msg, "tree": new_tree["sha"], "parents": [base_sha]})
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})

# ==========================================
# SKETCHFAB 3D ASSET PIPELINE (In-Memory!)
# ==========================================
@app.post("/search-assets")
async def api_search_assets(req: AssetSearchRequest):
    """Uses Gemini Flash to extract keywords, then fetches CC0 Sketchfab models."""
    await get_user(req.email) # Auth check
    
    # 1. Lead Asset Curator (Gemini Flash)
    prompt = f"You are the Lead Asset Curator. Read this game idea: '{req.prompt}'. Identify 1 to 3 primary 3D objects needed. Return ONLY a valid JSON array of strings (e.g. [\"car\", \"tree\"])."
    try:
        response = await model_flash.generate_content_async(prompt)
        keywords = json.loads(response.text.strip("`").replace("json\n", ""))
    except Exception:
        keywords = ["character", "environment"] # Fallback

    # 2. Fetch CC0 Models from Sketchfab
    results = {}
    async with httpx.AsyncClient() as client:
        for keyword in keywords[:3]:
            params = {
                "type": "models", "downloadable": "true", "license": "cc0",
                "q": keyword, "sort_by": "-relevance"
            }
            res = await client.get("https://api.sketchfab.com/v3/search", params=params)
            if res.status_code == 200:
                models = []
                for item in res.json().get("results", [])[:5]:
                    thumbnails = item.get("thumbnails", {}).get("images", [])
                    models.append({
                        "name": item.get("name"),
                        "uid": item.get("uid"),
                        "thumbnail": thumbnails[0]["url"] if thumbnails else ""
                    })
                results[keyword] = models
                
    return {"status": "success", "keywords": keywords, "results": results}

async def process_and_upload_assets(job_id: str, username: str, game_name: str, uids: List[str]) -> List[str]:
    """Downloads ZIPs from Sketchfab in memory, extracts them, and pushes to GitHub."""
    asset_urls = []
    headers = {"Authorization": f"Token {SKETCHFAB_API_TOKEN}"}
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for uid in uids:
            await manager.send_update(job_id, "Fetching Assets", f"Downloading 3D model {uid} into the matrix...")
            
            # Request download URL from Sketchfab
            dl_res = await client.get(f"https://api.sketchfab.com/v3/models/{uid}/download", headers=headers)
            if dl_res.status_code != 200: continue
            
            # Prefer GLB, fallback to GLTF
            dl_data = dl_res.json()
            zip_url = dl_data.get("glb", {}).get("url") or dl_data.get("gltf", {}).get("url")
            if not zip_url: continue
            
            # Download ZIP into RAM (No hard drive storage used! CEO Magic 🦄)
            zip_res = await client.get(zip_url)
            zip_in_memory = io.BytesIO(zip_res.content)
            
            with zipfile.ZipFile(zip_in_memory) as z:
                files_to_push = []
                for file_info in z.infolist():
                    if file_info.is_dir(): continue
                    # Read file and base64 encode it for GitHub
                    file_bytes = z.read(file_info.filename)
                    encoded_bytes = base64.b64encode(file_bytes).decode('utf-8')
                    
                    # Clean filename and put in assets folder
                    clean_name = os.path.basename(file_info.filename)
                    files_to_push.append({
                        "path": f"assets/{uid}_{clean_name}",
                        "content": encoded_bytes
                    })
                    
                    if clean_name.endswith('.glb') or clean_name.endswith('.gltf'):
                        raw_url = f"https://raw.githubusercontent.com/{GITHUB_OWNER}/{username}/main/{game_name}/assets/{uid}_{clean_name}"
                        asset_urls.append(raw_url)

                if files_to_push:
                    await commit_files_to_github(username, game_name, files_to_push, is_binary=True)
                    
    return asset_urls

# ==========================================
# AI GENERATION ENGINE (Dynamic Float Cost)
# ==========================================
async def generate_game_with_ai(prompt: str, history: list, game_name: str, asset_urls: List[str]) -> dict:
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in history[-8:]])
    
    asset_instructions = ""
    if asset_urls:
        asset_instructions = f"""
        CRITICAL STUDIO ASSETS:
        The Art Department provided custom 3D models. You MUST use these exact URLs in your Babylon.js SceneLoader:
        {json.dumps(asset_urls)}
        Do NOT use placeholder primitive shapes for these items. Use BABYLON.SceneLoader.ImportMeshAsync.
        """

    system_instruction = f"""
    You are a Senior Principal Game Developer specializing in Babylon.js. You are building '{game_name}'.
    {asset_instructions}
    
    BILLING MATRIX (Calculate carefully):
    - 0.5 Credits: Minor tweaks (colors, speed, 1-10 lines changed).
    - 1.5 - 2.5 Credits: Feature additions (timers, scores, enemy logic).
    - 5.0 Credits: Standard new game generation (500+ lines).
    - 7.5 - 10.0 Credits: Massive RPGs or complex physics setups.
    
    OUTPUT FORMAT:
    Return a valid JSON matching this schema:
    {{
        "project_name": "string",
        "files": [ {{ "path": "index.html", "type": "text", "content": "<html>...</html>" }} ],
        "assistant_message": "string (Professional update to the client)",
        "estimated_credits": float (Calculated based on the matrix above)
    }}
    History:\n{history_text}
    """
    
    try:
        response = await model_pro.generate_content_async(prompt, tools=[{"function_declarations": []}], request_options={"system_instruction": system_instruction})
        # Note: Added simple formatting cleanup
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
             raw_text = raw_text.strip("`").replace("json\n", "")
        return json.loads(raw_text)
    except Exception as e:
        raise Exception(f"Senior AI Error: {str(e)}")

# ==========================================
# CORE WORKFLOW (WebSocket Bound)
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    try:
        await manager.send_update(job_id, "Analyzing Request", "Consulting the Principal Developer...")
        
        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        game_assets_db = user.get("game_assets", {})
        
        # 1. Handle Custom Assets (Download, Upload, Delete from Server, Save to DB)
        current_asset_urls = game_assets_db.get(req.game_name, [])
        if req.selected_uids:
            await manager.send_update(job_id, "Curating Assets", "Processing Sketchfab CC0 Models...")
            new_urls = await process_and_upload_assets(job_id, user["username"], req.game_name, req.selected_uids)
            current_asset_urls.extend(new_urls)
            game_assets_db[req.game_name] = current_asset_urls
            # Save raw URLs to DB
            supabase.table("users").update({"game_assets": game_assets_db}).eq("id", user["id"]).execute()

        # 2. Generate the Game using Gemini 1.5 Pro
        await manager.send_update(job_id, "Forging the World", "Writing high-performance Babylon.js code...")
        manifest = await generate_game_with_ai(req.prompt, game_history, req.game_name, current_asset_urls)
        
        # 3. Handle Float Economics
        cost = float(manifest.get("estimated_credits", 1.0))
        if user["credits"] < cost:
            raise Exception(f"Insufficient credits. This operation costs {cost} credits. You have {user['credits']}.")
            
        supabase.table("users").update({"credits": user["credits"] - cost}).eq("id", user["id"]).execute()
        
        # 4. Push Code to GitHub
        await manager.send_update(job_id, "Materializing Server", "Pushing core mechanics to global servers...")
        # Create repo if needed (simplified check)
        repo_path = f"/repos/{GITHUB_OWNER}/{user['username']}"
        status, _ = await github_api("GET", repo_path, return_status=True)
        if status == 404:
            await github_api("POST", f"/orgs/{GITHUB_OWNER}/repos", {"name": user["username"], "auto_init": True})
            await asyncio.sleep(4)
            
        await commit_files_to_github(user["username"], req.game_name, manifest["files"], is_binary=False)
        
        # 5. Activate Pages & Update DB
        await manager.send_update(job_id, "Opening Portals", "Configuring live WebGL access...")
        await github_api("POST", f"{repo_path}/pages", {"source": {"branch": "main", "path": "/"}}, return_status=True)
                
        ts = datetime.utcnow().timestamp()
        game_history.append({"role": "user", "content": req.prompt, "ts": ts})
        game_history.append({"role": "assistant", "content": manifest["assistant_message"], "ts": ts + 1})
        chat_history[req.game_name] = game_history
        supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        
        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(job_id, "Level Unlocked!", manifest["assistant_message"], {"preview_url": preview_url, "cost": cost, "remaining": user["credits"] - cost})
        
    except Exception as e:
        await manager.send_update(job_id, "failed", str(e))

# ==========================================
# APK BUILD ENGINE & WEBSOCKET SETUP
# ==========================================
@app.post("/build-apk")
async def api_build_apk(req: BuildAPKRequest, background_tasks: BackgroundTasks):
    user = await get_user(req.email)
    job_id = str(uuid.uuid4())
    # Keep the exact same workflow from previous code for APK Building here
    # (Background task logic remains identical to your previous iteration)
    JOB_STORE[job_id] = {"status": "queued", "message": "Queuing APK Build...", "progress": 0}
    # background_tasks.add_task(build_apk_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.post("/generate-commit")
async def api_generate_and_commit(req: GenerateRequest, background_tasks: BackgroundTasks):
    user = await get_user(req.email)
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Connecting to server..."}
    background_tasks.add_task(generate_and_commit_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

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
                        
