import os
import re
import json
import uuid
import httpx
import base64
import zipfile
import io
import asyncio
import logging
from datetime import date, datetime
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from supabase import create_client, Client
import google.generativeai as genai

# ==========================================
# 1. LOGGING & SECURITY CONFIGURATION
# ==========================================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-service-role-key") 
PLAYFUL_GH_TOKEN = os.getenv("PLAYFUL_GH_TOKEN", "your-gh-token")
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "Surya-git-enf")
PLAYFUL_BUILDER_REPO = os.getenv("PLAYFUL_BUILDER_REPO", "Playful")
SKETCHFAB_API_TOKEN = os.getenv("SKETCHFAB_API_TOKEN", "your-sketchfab-token-here")

# Monetization Defaults
PLAYFUL_DEFAULT_BANNER_ID = os.getenv("PLAYFUL_DEFAULT_BANNER_ID", "ca-app-pub-xxx/banner")
PLAYFUL_DEFAULT_INTERSTITIAL_ID = os.getenv("PLAYFUL_DEFAULT_INTERSTITIAL_ID", "ca-app-pub-xxx/interstitial")
PLAYFUL_AD_INTERVAL_MINS = os.getenv("PLAYFUL_AD_INTERVAL_MINS", "10")

# AI Setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSy_YOUR_ACTUAL_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)
model_flash = genai.GenerativeModel(model_name="gemini-1.5-flash", generation_config={"response_mime_type": "application/json"})
model_pro = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config={"response_mime_type": "application/json"})

# Supabase Initialization
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    logging.error(f"Supabase client failed to initialize: {e}")
    supabase = None

# Rate Limiter & App Init
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Playable Backend - Secure Unicorn Edition", version="7.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ==========================================
# 2. STATE & JOB MANAGEMENT
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
# 3. PYDANTIC MODELS (Strict Input Validation)
# ==========================================
class AssetSearchRequest(BaseModel):
    prompt: str = Field(..., max_length=500)

class GenerateRequest(BaseModel):
    game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)
    prompt: str = Field(..., max_length=3000)
    selected_uids: Optional[List[str]] = []

class GameRequest(BaseModel):
    game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)

class EditGameNameRequest(BaseModel):
    old_game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)
    new_game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)

class BuildAPKRequest(BaseModel):
    game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)

class AddAdmobRequest(BaseModel):
    admob_banner: str = Field(..., max_length=100)
    admob_interstitial: str = Field(..., max_length=100)
    admob_interval: str = Field(..., max_length=10)
    
class ToggleFavoriteRequest(BaseModel):
    game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)
    is_favorite: bool

class UpdateSettingsRequest(BaseModel):
    theme: str = Field(..., max_length=50)
# ==========================================
# 4. SECURE AUTH & GATEKEEPER LOGIC
# ==========================================
async def verify_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    try:
        token = credentials.credentials
        auth_res = supabase.auth.get_user(token)
        if not auth_res or not auth_res.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
            
        user_id = auth_res.user.id
        email = auth_res.user.email
        
        res = supabase.table("users").select("*").eq("id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="User profile not found")
            
        user = res.data[0]
        user["email"] = email
        
        today = date.today()
        last_reset_str = user.get("last_reset_date") or str(today)
        last_reset = date.fromisoformat(last_reset_str)
        days_passed = (today - last_reset).days

        if "builds" not in user:
            user["builds"] = 0
        if "favorites" not in user or not user["favorites"]:
            user["favorites"] = []
        if "settings" not in user or not user["settings"]:
            user["settings"] = {"theme": "neon"}   

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
                elif plan == "free" and current_credits < 1.0:
                    current_credits = 5.0
                plan_days -= days_to_process
                
            if plan_days <= 0 and plan != "free":
                plan = "free"
                
            updates = {
                "credits": current_credits, 
                "plan_days": plan_days, 
                "plan": plan, 
                "last_reset_date": str(today)
            }
            supabase.table("users").update(updates).eq("id", user_id).execute()
            user.update(updates)

        if "game_assets" not in user or not user["game_assets"]:
            user["game_assets"] = {}
        if "monetization" not in user or not user["monetization"]:
            user["monetization"] = {}
        
        return user
    except Exception as e:
        logging.warning(f"Failed Auth Attempt: {e}")
        raise HTTPException(status_code=401, detail="Authentication Failed")

def sanitize_code(content: str) -> str:
    content = re.sub(r'\beval\s*\(', '/* eval removed */ (', content)
    content = re.sub(r'\bnew\s+Function\s*\(', '/* new Function removed */ (', content)
    return content

# ==========================================
# 5. GITHUB & SKETCHFAB CORE LOGIC
# ==========================================
async def github_api(method: str, endpoint: str, json_data: dict = None, return_status: bool = False):
    url = f"https://api.github.com{endpoint}"
    headers = {
        "Authorization": f"Bearer {PLAYFUL_GH_TOKEN}", 
        "Accept": "application/vnd.github.v3+json"
    }
    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url, headers=headers, json=json_data, timeout=30.0)
        if return_status:
            return resp.status_code, resp.json() if resp.text else {}
        if resp.status_code >= 400:
            raise Exception(f"GitHub API Error: {resp.text}")
        return resp.json() if resp.text else {}

async def fetch_existing_game_code(username: str, game_name: str) -> str:
    status, data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}/index.html", return_status=True)
    if status == 200 and "content" in data:
        return base64.b64decode(data["content"]).decode('utf-8')
    return None

async def ensure_user_repo_exists(username: str):
    status, _ = await github_api("GET", f"/repos/{GITHUB_OWNER}/{username}", return_status=True)
    if status == 404:
        try:
            await github_api("POST", f"/orgs/{GITHUB_OWNER}/repos", {"name": username, "auto_init": True})
        except:
            await github_api("POST", "/user/repos", {"name": username, "auto_init": True})
        await asyncio.sleep(4) 

async def commit_files_to_github(username: str, game_name: str, files: list, is_binary: bool = False):
    repo_path = f"/repos/{GITHUB_OWNER}/{username}"
    ref_data = await github_api("GET", f"{repo_path}/git/ref/heads/main")
    base_sha = ref_data["object"]["sha"]
    commit_data = await github_api("GET", f"{repo_path}/git/commits/{base_sha}")
    tree_sha = commit_data["tree"]["sha"]
    
    tree_items = []
    for file in files:
        if is_binary:
            blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": file["content"], "encoding": "base64"})
        else:
            blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": sanitize_code(file["content"]), "encoding": "utf-8"})
        tree_items.append({"path": f"{game_name}/{file['path']}", "mode": "100644", "type": "blob", "sha": blob["sha"]})
        
    new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": tree_sha, "tree": tree_items})
    new_commit = await github_api("POST", f"{repo_path}/git/commits", {"message": f"Deploy {game_name}", "tree": new_tree["sha"], "parents": [base_sha]})
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})

async def delete_folder_from_github(username: str, game_name: str):
    status, files = await github_api("GET", f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}", return_status=True)
    if status == 200 and isinstance(files, list):
        for file in files:
            payload = {"message": f"Delete {file['path']}", "sha": file['sha']}
            await github_api("DELETE", f"/repos/{GITHUB_OWNER}/{username}/contents/{file['path']}", json_data=payload)

async def process_and_upload_assets(job_id: str, username: str, game_name: str, uids: List[str]) -> List[str]:
    asset_urls = []
    headers = {"Authorization": f"Token {SKETCHFAB_API_TOKEN}"}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for uid in uids:
            dl_res = await client.get(f"https://api.sketchfab.com/v3/models/{uid}/download", headers=headers)
            if dl_res.status_code != 200:
                continue
            
            dl_data = dl_res.json()
            zip_url = dl_data.get("glb", {}).get("url") or dl_data.get("gltf", {}).get("url")
            if not zip_url:
                continue
            
            zip_res = await client.get(zip_url)
            with zipfile.ZipFile(io.BytesIO(zip_res.content)) as z:
                files_to_push = []
                for file_info in z.infolist():
                    if file_info.is_dir():
                        continue
                    encoded = base64.b64encode(z.read(file_info.filename)).decode('utf-8')
                    clean_name = os.path.basename(file_info.filename)
                    files_to_push.append({"path": f"assets/{uid}_{clean_name}", "content": encoded})
                    if clean_name.endswith('.glb') or clean_name.endswith('.gltf'):
                        asset_urls.append(f"https://raw.githubusercontent.com/{GITHUB_OWNER}/{username}/main/{game_name}/assets/{uid}_{clean_name}")
                if files_to_push:
                    await commit_files_to_github(username, game_name, files_to_push, is_binary=True)
    return asset_urls

async def generate_game_with_ai(prompt: str, history: list, game_name: str, current_code: str, asset_urls: List[str]) -> dict:
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in history[-8:]])
    
    code_marker = "`" * 3
    if current_code:
        context_block = f"\nCURRENT CODE FOR {game_name}:\n{code_marker}html\n{current_code}\n{code_marker}\nEDIT this game."
    else:
        context_block = "\nBRAND NEW game. Generate foundational code."
        
    if asset_urls:
        asset_instructions = f"STUDIO ASSETS: Use exact URLs in Babylon.js SceneLoader:\n{json.dumps(asset_urls)}"
    else:
        asset_instructions = ""

    sys_instr = f"""You are a Senior Game Dev building '{game_name}'. {context_block} {asset_instructions}
    BILLING MATRIX: 0.5 (Minor), 2.0 (Feature), 5.0 (New Game), 8.0+ (Massive).
    OUTPUT: JSON with project_name, files array (path, type, content), assistant_message, estimated_credits.
    History:\n{history_text}"""
    
    try:
        response = await model_pro.generate_content_async(prompt, tools=[{"function_declarations": []}], request_options={"system_instruction": sys_instr})
        raw_text = response.text.strip()
        
        json_prefix = "`" * 3 + "json"
        if raw_text.startswith(json_prefix): 
            raw_text = raw_text.strip("`").replace("json\n", "", 1)
            
        return json.loads(raw_text)
    except Exception as e: 
        raise Exception(f"AI Error: {str(e)}")

# ==========================================
# 6. WORKFLOWS 
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    try:
        await manager.send_update(job_id, "Waking the Engine 🔋", "Reading your mind... just kidding, parsing your epic game idea! 🧠✨")
        
        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        game_assets_db = user.get("game_assets", {})
        current_code = await fetch_existing_game_code(user["username"], req.game_name)
        
        current_games = len(chat_history.keys())
        plan_limits = {"free": 3, "creator": 10, "studio": 30}
        
        if not current_code and current_games >= plan_limits.get(user.get("plan", "free"), 3):
            raise Exception("Game limit reached for your active plan.")
        
        current_asset_urls = game_assets_db.get(req.game_name, [])
        if req.selected_uids:
            await manager.send_update(job_id, "Looting the Vault 💎", "Snagging those sick 3D models for your game... 🛸🧊")
            current_asset_urls.extend(await process_and_upload_assets(job_id, user["username"], req.game_name, req.selected_uids))
            game_assets_db[req.game_name] = current_asset_urls
            supabase.table("users").update({"game_assets": game_assets_db}).eq("id", user["id"]).execute()

        if current_code:
            await manager.send_update(job_id, "Remixing Reality 🎛️", "Injecting your brand new mods into the matrix... ⚡🛠️")
        else:
            await manager.send_update(job_id, "Forging the World 🌎", "Big Bang in progress! Crafting your 3D universe from scratch... 🌌💥")
            
        manifest = await generate_game_with_ai(req.prompt, game_history, req.game_name, current_code, current_asset_urls)
        
        cost = float(manifest.get("estimated_credits", 1.0))
        if user["credits"] < cost:
            raise Exception(f"Insufficient credits. Costs {cost}, you have {user['credits']}.")
            
        supabase.table("users").update({"credits": user["credits"] - cost}).eq("id", user["id"]).execute()
        
        await manager.send_update(job_id, "Claiming Turf ⛳", "Securing your own private corner of the multiverse... 🪐")
        await ensure_user_repo_exists(user["username"])
        
        await manager.send_update(job_id, "Packing Pixels 🎒", "Stuffing all the physics and code into the launch tube... 🚀📦")
        await commit_files_to_github(user["username"], req.game_name, manifest["files"], is_binary=False)
        
        await manager.send_update(job_id, "Here We Go! 🎢", "Firing up the warp drive! This might take a sec, grab a coffee ☕🔥")
        await github_api("POST", f"/repos/{GITHUB_OWNER}/{user['username']}/pages", {"source": {"branch": "main", "path": "/"}}, return_status=True)
                
        ts = datetime.utcnow().timestamp()
        game_history.extend([
            {"role": "user", "content": req.prompt, "ts": ts}, 
            {"role": "assistant", "content": manifest["assistant_message"], "ts": ts + 1}
        ])
        chat_history[req.game_name] = game_history
        supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        
        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(job_id, "Level Unlocked! 🎮", manifest["assistant_message"], {"preview_url": preview_url, "cost": cost, "remaining": user["credits"] - cost})
        
    except Exception as e:
        logging.error(f"Generation Job Failed: {e}")
        await manager.send_update(job_id, "failed", str(e))

async def build_apk_workflow(job_id: str, req: BuildAPKRequest, user: dict):
    try:
        is_free_user = user.get("plan", "free") == "free"

        if is_free_user:
            await manager.send_update(job_id, "Initializing", "Booting up the Playful Engine... 🚀", {"progress": 0})
        else:
            await manager.send_update(job_id, "Initializing", "Verifying Pro License... 👑", {"progress": 0})
        
        if user.get("builds", 0) < 1:
            raise Exception("Insufficient APK build limits. Please upgrade.")
            
        build_cost = 5 if is_free_user else 10
        if user.get("credits", 0) < build_cost:
            raise Exception("Insufficient credits for APK build.")

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

        supabase.table("users").update({
            "builds": user["builds"] - 1, 
            "credits": user["credits"] - build_cost
        }).eq("id", user["id"]).execute()
        
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
        
        apk_url = f"https://github.com/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/releases/download/latest-{user['username']}-{req.game_name}/{req.game_name}.apk"
        
        if is_free_user:
            await manager.send_update(job_id, "Build Complete!", "Level Unlocked! Your Android game is ready! 🎮", {"progress": 100, "apk_url": apk_url})
        else:
            await manager.send_update(job_id, "Build Complete!", "Masterpiece Complete! Your game is ready for the Play Store! 🏆", {"progress": 100, "apk_url": apk_url})

    except Exception as e:
        await manager.send_update(job_id, "failed", str(e))

# ==========================================
# 7. SECURE REST API ENDPOINTS
# ==========================================
@app.get("/health")
@limiter.limit("5/minute")
async def health_check(request: Request):
    return {"status": "securely locked 🔒", "timestamp": datetime.utcnow().isoformat()}

@app.post("/search-assets")
@limiter.limit("10/minute")
async def api_search_assets(request: Request, req: AssetSearchRequest, user: dict = Depends(verify_user)):
    try:
        res = await model_flash.generate_content_async(f"Extract 1-3 primary 3D objects from: '{req.prompt}'. Return JSON array of strings.")
        keywords = json.loads(res.text.strip("`").replace("json\n", ""))
    except:
        keywords = ["character", "environment"]

    results = {}
    async with httpx.AsyncClient() as client:
        for keyword in keywords[:3]:
            params = {
                "type": "models", 
                "downloadable": "true", 
                "license": "cc0", 
                "q": keyword, 
                "sort_by": "-relevance"
            }
            res = await client.get("https://api.sketchfab.com/v3/search", params=params)
            if res.status_code == 200:
                models = []
                for item in res.json().get("results", [])[:5]:
                    models.append({
                        "name": item.get("name"), 
                        "uid": item.get("uid"), 
                        "thumbnail": item.get("thumbnails", {}).get("images", [{}])[0].get("url", "")
                    })
                results[keyword] = models
    return {"status": "success", "keywords": keywords, "results": results}

@app.post("/generate-commit")
@limiter.limit("5/minute")
async def api_generate_and_commit(request: Request, req: GenerateRequest, background_tasks: BackgroundTasks, user: dict = Depends(verify_user)):
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Connecting to matrix..."}
    background_tasks.add_task(generate_and_commit_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.post("/build-apk")
@limiter.limit("5/minute")
async def api_build_apk(request: Request, req: BuildAPKRequest, background_tasks: BackgroundTasks, user: dict = Depends(verify_user)):
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status": "queued", "message": "Queuing APK Build...", "progress": 0}
    background_tasks.add_task(build_apk_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.post("/addadmob")
@limiter.limit("10/minute")
async def api_add_admob(request: Request, req: AddAdmobRequest, user: dict = Depends(verify_user)):
    if user.get("plan", "free") == "free":
        raise HTTPException(status_code=403, detail="AdMob integration requires Creator or Studio plan.")
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
@limiter.limit("10/minute")
async def api_edit_game_name(request: Request, req: EditGameNameRequest, user: dict = Depends(verify_user)):
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
            
        return {
            "status": "success", 
            "message": f"Game renamed to {req.new_game_name}", 
            "new_preview_url": f"https://{GITHUB_OWNER}.github.io/{username}/{req.new_game_name}/index.html"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deletegame")
@limiter.limit("10/minute")
async def api_delete_game(request: Request, req: GameRequest, user: dict = Depends(verify_user)):
    try:
        await delete_folder_from_github(user["username"], req.game_name)
        chat_history = user.get("chat_history", {})
        if req.game_name in chat_history:
            del chat_history[req.game_name]
            supabase.table("users").update({"chat_history": chat_history}).eq("id", user["id"]).execute()
        return {"status": "success", "message": f"Game '{req.game_name}' deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/getgames")
@limiter.limit("20/minute")
async def api_get_games(request: Request, user: dict = Depends(verify_user)):
    status, contents = await github_api("GET", f"/repos/{GITHUB_OWNER}/{user['username']}/contents", return_status=True)
    if status == 404:
        return {"games": []}
        
    games = []
    for item in contents:
        if item["type"] == "dir":
            games.append({
                "game_name": item["name"], 
                "preview_url": f"https://{GITHUB_OWNER}.github.io/{user['username']}/{item['name']}/index.html", 
                "last_updated": "In Repo"
            })
    return {"games": games}

@app.post("/getchat")
@limiter.limit("30/minute")
async def api_get_chat(request: Request, req: GameRequest, user: dict = Depends(verify_user)):
    chat_history = user.get("chat_history", {})
    return {"game_name": req.game_name, "chat": chat_history.get(req.game_name, [])}

@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in JOB_STORE:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOB_STORE[job_id]



@app.post("/toggle-favorite")
@limiter.limit("20/minute")
async def api_toggle_favorite(request: Request, req: ToggleFavoriteRequest, user: dict = Depends(verify_user)):
    favorites = user.get("favorites", [])
    if req.is_favorite and req.game_name not in favorites:
        favorites.append(req.game_name)
    elif not req.is_favorite and req.game_name in favorites:
        favorites.remove(req.game_name)
    
    supabase.table("users").update({"favorites": favorites}).eq("id", user["id"]).execute()
    return {"status": "success", "favorites": favorites}

@app.post("/update-settings")
@limiter.limit("10/minute")
async def api_update_settings(request: Request, req: UpdateSettingsRequest, user: dict = Depends(verify_user)):
    settings = user.get("settings", {})
    settings["theme"] = req.theme
    supabase.table("users").update({"settings": settings}).eq("id", user["id"]).execute()
    return {"status": "success", "settings": settings}

# ==========================================
# 8. WEBSOCKETS
# ==========================================


# ==========================================
# 8. WEBSOCKETS
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
