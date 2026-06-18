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

# FIX #3: Restrict CORS to your actual frontend domain
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "https://playful.app,https://www.playful.app").split(",")

# Monetization Defaults
PLAYFUL_DEFAULT_BANNER_ID = os.getenv("PLAYFUL_DEFAULT_BANNER_ID", "ca-app-pub-xxx/banner")
PLAYFUL_DEFAULT_INTERSTITIAL_ID = os.getenv("PLAYFUL_DEFAULT_INTERSTITIAL_ID", "ca-app-pub-xxx/interstitial")
PLAYFUL_AD_INTERVAL_MINS = os.getenv("PLAYFUL_AD_INTERVAL_MINS", "10")

# AI Setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_API_KEY)
model_flash = genai.GenerativeModel(model_name="gemini-1.5-flash", generation_config={"response_mime_type": "application/json"})
model_pro = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config={"response_mime_type": "application/json"})

# Supabase Initialization
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logging.info("Supabase connected successfully.")
except Exception as e:
    logging.error(f"Supabase client failed to initialize: {e}")
    supabase = None

# Rate Limiter & App Init
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Playful Backend - v8.0 Unicorn Edition", version="8.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# FIX #3: Locked-down CORS — no more wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

security = HTTPBearer()

# ==========================================
# 2. STATE & JOB MANAGEMENT
# FIX #2: Jobs persisted in Supabase, not in-memory dict
# In-memory dict retained only as a fast-path WebSocket cache
# ==========================================
JOB_CACHE: Dict[str, Dict[str, Any]] = {}       # ephemeral — for live WebSocket pushes only
ACTIVE_CONNECTIONS: Dict[str, WebSocket] = {}


class ConnectionManager:
    async def connect(self, job_id: str, websocket: WebSocket):
        await websocket.accept()
        ACTIVE_CONNECTIONS[job_id] = websocket

    def disconnect(self, job_id: str):
        ACTIVE_CONNECTIONS.pop(job_id, None)

    async def send_update(
        self,
        job_id: str,
        status: str,
        message: str,
        data: dict = None,
        user_id: str = None,
    ):
        # Always persist to Supabase so job state survives restarts (FIX #2)
        payload = {"status": status, "message": message, "updated_at": datetime.utcnow().isoformat()}
        if data:
            payload.update(data)

        if user_id and supabase:
            try:
                supabase.table("jobs").upsert({"id": job_id, "user_id": user_id, **payload}).execute()
            except Exception as db_err:
                logging.warning(f"Job DB persist failed for {job_id}: {db_err}")

        # Also keep the in-memory cache hot for the WebSocket push
        JOB_CACHE[job_id] = payload

        if job_id in ACTIVE_CONNECTIONS:
            ws_payload = {"job_id": job_id, **payload}
            try:
                await ACTIVE_CONNECTIONS[job_id].send_json(ws_payload)
            except Exception:
                self.disconnect(job_id)


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

        user.setdefault("builds", 0)
        user.setdefault("favorites", [])
        user.setdefault("settings", {"theme": "neon"})
        user.setdefault("game_assets", {})
        user.setdefault("monetization", {})

        if days_passed > 0:
            plan = user.get("plan", "free")
            plan_days = user.get("plan_days", 7)
            current_credits = float(user.get("credits", 0.0))

            days_to_process = min(days_passed, plan_days)
            if days_to_process > 0:
                if plan == "creator":
                    current_credits += days_to_process * 15.0
                elif plan == "studio":
                    current_credits += days_to_process * 30.0
                elif plan == "free" and current_credits < 1.0:
                    current_credits = 5.0
                plan_days -= days_to_process

            if plan_days <= 0 and plan != "free":
                plan = "free"

            updates = {
                "credits": current_credits,
                "plan_days": plan_days,
                "plan": plan,
                "last_reset_date": str(today),
            }
            supabase.table("users").update(updates).eq("id", user_id).execute()
            user.update(updates)

        return user

    except HTTPException:
        raise
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
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url, headers=headers, json=json_data, timeout=30.0)
        if return_status:
            return resp.status_code, resp.json() if resp.text else {}
        if resp.status_code >= 400:
            raise Exception(f"GitHub API Error {resp.status_code}: {resp.text}")
        return resp.json() if resp.text else {}


async def fetch_existing_game_code(username: str, game_name: str) -> str:
    status, data = await github_api(
        "GET",
        f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}/index.html",
        return_status=True,
    )
    if status == 200 and "content" in data:
        return base64.b64decode(data["content"]).decode("utf-8")
    return None


async def ensure_user_repo_exists(username: str):
    status, _ = await github_api("GET", f"/repos/{GITHUB_OWNER}/{username}", return_status=True)
    if status == 404:
        try:
            await github_api("POST", f"/orgs/{GITHUB_OWNER}/repos", {"name": username, "auto_init": True})
        except Exception:
            await github_api("POST", "/user/repos", {"name": username, "auto_init": True, "private": False})
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
            blob = await github_api(
                "POST", f"{repo_path}/git/blobs", {"content": file["content"], "encoding": "base64"}
            )
        else:
            blob = await github_api(
                "POST",
                f"{repo_path}/git/blobs",
                {"content": sanitize_code(file["content"]), "encoding": "utf-8"},
            )
        tree_items.append(
            {"path": f"{game_name}/{file['path']}", "mode": "100644", "type": "blob", "sha": blob["sha"]}
        )

    new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": tree_sha, "tree": tree_items})
    new_commit = await github_api(
        "POST",
        f"{repo_path}/git/commits",
        {"message": f"🎮 Deploy {game_name}", "tree": new_tree["sha"], "parents": [base_sha]},
    )
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})


async def delete_folder_from_github(username: str, game_name: str):
    status, files = await github_api(
        "GET", f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}", return_status=True
    )
    if status == 200 and isinstance(files, list):
        for file in files:
            payload = {"message": f"Delete {file['path']}", "sha": file["sha"]}
            await github_api("DELETE", f"/repos/{GITHUB_OWNER}/{username}/contents/{file['path']}", json_data=payload)


async def process_and_upload_assets(
    job_id: str, username: str, game_name: str, uids: List[str]
) -> List[str]:
    asset_urls = []
    headers = {"Authorization": f"Token {SKETCHFAB_API_TOKEN}"}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for uid in uids:
            dl_res = await client.get(f"https://api.sketchfab.com/v3/models/{uid}/download", headers=headers)
            if dl_res.status_code != 200:
                logging.warning(f"Sketchfab download failed for uid {uid}: {dl_res.status_code}")
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
                    encoded = base64.b64encode(z.read(file_info.filename)).decode("utf-8")
                    clean_name = os.path.basename(file_info.filename)
                    files_to_push.append({"path": f"assets/{uid}_{clean_name}", "content": encoded})
                    if clean_name.endswith(".glb") or clean_name.endswith(".gltf"):
                        asset_urls.append(
                            f"https://raw.githubusercontent.com/{GITHUB_OWNER}/{username}/main/{game_name}/assets/{uid}_{clean_name}"
                        )
                if files_to_push:
                    await commit_files_to_github(username, game_name, files_to_push, is_binary=True)
    return asset_urls


# ==========================================
# FIX #5: Robust AI response parsing with retry
# FIX #6: Structured game manifest — no full code dump on every edit
# ==========================================
async def _parse_ai_json(raw_text: str) -> dict:
    """Strip markdown fences and parse JSON safely."""
    clean = raw_text.strip()
    # Strip ```json ... ``` or ``` ... ```
    clean = re.sub(r'^```(?:json)?\s*', '', clean)
    clean = re.sub(r'\s*```$', '', clean)
    return json.loads(clean.strip())


async def generate_game_with_ai(
    prompt: str,
    history: list,
    game_name: str,
    game_manifest: dict,      # FIX #6: structured manifest replaces raw HTML dump
    current_code: str,        # only sent on first generation or full rewrites
    asset_urls: List[str],
) -> dict:
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in history[-8:]])

    # FIX #6: Send the lightweight manifest for edits, not the full HTML
    if game_manifest:
        context_block = (
            f"\nGAME MANIFEST for '{game_name}':\n{json.dumps(game_manifest, indent=2)}\n"
            "EDIT the existing game using this manifest. Only return changed files."
        )
    elif current_code:
        context_block = f"\nCURRENT CODE (first time only):\n{current_code[:4000]}\nEDIT this game."
    else:
        context_block = "\nBRAND NEW game. Generate foundational code."

    asset_instructions = (
        f"STUDIO ASSETS — use these exact URLs in Babylon.js SceneLoader:\n{json.dumps(asset_urls)}"
        if asset_urls
        else ""
    )

    sys_instr = f"""You are a Senior Game Dev building '{game_name}'. {context_block} {asset_instructions}

BILLING MATRIX: 0.5 (Minor tweak), 2.0 (Feature add), 5.0 (New Game), 8.0+ (Massive overhaul).

OUTPUT: Return ONLY a JSON object with these fields:
{{
  "project_name": string,
  "files": [{{"path": string, "type": string, "content": string}}],
  "assistant_message": string,
  "estimated_credits": number,
  "game_manifest": {{
    "genre": string,
    "win_condition": string,
    "physics": string,
    "ui_elements": [string],
    "asset_urls": [string]
  }}
}}

Game rules — every output MUST include:
- A clear win/lose condition
- A score or progress indicator  
- A restart button
- Proper game loop (start screen → gameplay → game over)

Conversation History:\n{history_text}"""

    last_error = None
    for attempt in range(3):  # FIX #5: retry up to 3 times
        try:
            
            response = await model_pro.generate_content_async(
                f"{sys_instr}\n\nUSER REQUEST:\n{prompt}",
                generation_config={"response_mime_type": "application/json"},
                    )
            return await _parse_ai_json(response.text)
        except json.JSONDecodeError as e:
            last_error = e
            logging.warning(f"AI JSON parse failed (attempt {attempt + 1}): {e}")
            if attempt < 2:
                # Ask Gemini to fix its own broken output
                fix_prompt = (
                    f"Your last response was invalid JSON. Error: {e}. "
                    "Return only valid JSON matching the schema, no markdown, no explanation."
                )
                try:
                    fix_response = await model_flash.generate_content_async(fix_prompt)
                    return await _parse_ai_json(fix_response.text)
                except Exception:
                    continue
        except Exception as e:
            last_error = e
            logging.warning(f"AI generation error (attempt {attempt + 1}): {e}")
            await asyncio.sleep(2 ** attempt)

    raise Exception(f"AI generation failed after 3 attempts: {last_error}")


# ==========================================
# FIX #1: Real GitHub Actions polling — no more fake sleep progress
# ==========================================
async def get_latest_actions_run_id(repo: str, workflow_file: str, triggered_after: datetime) -> Optional[str]:
    """Poll until GitHub registers the new workflow run, return its run ID."""
    for _ in range(10):
        await asyncio.sleep(6)
        data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{repo}/actions/workflows/{workflow_file}/runs?per_page=5")
        for run in data.get("workflow_runs", []):
            run_created = datetime.fromisoformat(run["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            if run_created >= triggered_after:
                return str(run["id"])
    return None


async def poll_actions_run(run_id: str, job_id: str, user_id: str, is_free_user: bool):
    """
    FIX #1: Actually poll GitHub Actions status instead of sleeping fixed amounts.
    Maps GitHub's conclusion to our progress percentage.
    """
    progress_steps = {
        "queued": 10,
        "in_progress": 50,
        "completed": 100,
    }

    timeout_seconds = 600  # 10 minutes max
    elapsed = 0
    poll_interval = 8

    while elapsed < timeout_seconds:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval

        try:
            run_data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/runs/{run_id}")
        except Exception as e:
            logging.warning(f"Actions poll error: {e}")
            continue

        gh_status = run_data.get("status", "queued")          # queued | in_progress | completed
        gh_conclusion = run_data.get("conclusion")             # success | failure | cancelled | None
        progress = progress_steps.get(gh_status, 10)

        if gh_status == "in_progress":
            # Try to get step-level progress for a nicer UX
            jobs_data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/runs/{run_id}/jobs")
            steps = jobs_data.get("jobs", [{}])[0].get("steps", [])
            completed_steps = sum(1 for s in steps if s.get("conclusion") == "success")
            total_steps = max(len(steps), 1)
            progress = int(15 + (completed_steps / total_steps) * 75)

            step_name = next(
                (s["name"] for s in steps if s.get("status") == "in_progress"),
                "Building your game...",
            )
            await manager.send_update(
                job_id, "Building", f"⚙️ {step_name}", {"progress": progress}, user_id=user_id
            )

        elif gh_status == "completed":
            if gh_conclusion == "success":
                return True
            else:
                raise Exception(f"APK build failed on GitHub Actions. Conclusion: {gh_conclusion}")

    raise Exception("APK build timed out after 10 minutes. Please try again.")


# ==========================================
# 6. WORKFLOWS
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    user_id = user["id"]
    try:
        await manager.send_update(job_id, "starting", "Parsing your game idea... 🧠✨", user_id=user_id)

        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        game_assets_db = user.get("game_assets", {})
        game_manifests = user.get("game_manifests", {})  # FIX #6: load stored manifests

        current_code = await fetch_existing_game_code(user["username"], req.game_name)
        current_manifest = game_manifests.get(req.game_name, {})

        current_games = len(chat_history.keys())
        plan_limits = {"free": 3, "creator": 10, "studio": 30}

        if not current_code and current_games >= plan_limits.get(user.get("plan", "free"), 3):
            raise Exception("Game limit reached for your active plan. Upgrade to create more games.")

        current_asset_urls = game_assets_db.get(req.game_name, [])
        if req.selected_uids:
            await manager.send_update(job_id, "assets", "Snagging those 3D models... 🛸", user_id=user_id)
            new_urls = await process_and_upload_assets(job_id, user["username"], req.game_name, req.selected_uids)
            current_asset_urls.extend(new_urls)
            game_assets_db[req.game_name] = current_asset_urls
            supabase.table("users").update({"game_assets": game_assets_db}).eq("id", user_id).execute()

        status_msg = "Remixing your game... ⚡🛠️" if current_code else "Big Bang in progress! 🌌💥"
        await manager.send_update(job_id, "generating", status_msg, user_id=user_id)

        manifest = await generate_game_with_ai(
            req.prompt,
            game_history,
            req.game_name,
            current_manifest,
            current_code,
            current_asset_urls,
        )

        cost = float(manifest.get("estimated_credits", 1.0))
        if user["credits"] < cost:
            raise Exception(f"Insufficient credits. This costs {cost}, you have {user['credits']:.1f}.")

        supabase.table("users").update({"credits": user["credits"] - cost}).eq("id", user_id).execute()

        await manager.send_update(job_id, "deploying", "Securing your corner of the multiverse... 🪐", user_id=user_id)
        await ensure_user_repo_exists(user["username"])

        await manager.send_update(job_id, "committing", "Packing pixels into launch tube... 🚀📦", user_id=user_id)
        await commit_files_to_github(user["username"], req.game_name, manifest["files"], is_binary=False)

        await github_api(
            "POST",
            f"/repos/{GITHUB_OWNER}/{user['username']}/pages",
            {"source": {"branch": "main", "path": "/"}},
            return_status=True,
        )

        ts = datetime.utcnow().timestamp()
        game_history.extend([
            {"role": "user", "content": req.prompt, "ts": ts},
            {"role": "assistant", "content": manifest["assistant_message"], "ts": ts + 1},
        ])
        chat_history[req.game_name] = game_history

        # FIX #6: Store the new manifest instead of re-reading full HTML next time
        if "game_manifest" in manifest:
            game_manifests[req.game_name] = manifest["game_manifest"]

        supabase.table("users").update({
            "chat_history": chat_history,
            "game_manifests": game_manifests,
        }).eq("id", user_id).execute()

        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(
            job_id,
            "completed",
            manifest["assistant_message"],
            {"preview_url": preview_url, "cost": cost, "remaining": user["credits"] - cost},
            user_id=user_id,
        )

    except Exception as e:
        logging.error(f"Generation Job Failed [{job_id}]: {e}")
        await manager.send_update(job_id, "failed", str(e), user_id=user.get("id"))


async def build_apk_workflow(job_id: str, req: BuildAPKRequest, user: dict):
    user_id = user["id"]
    try:
        is_free_user = user.get("plan", "free") == "free"

        await manager.send_update(
            job_id,
            "initializing",
            "Booting up the Playful Engine... 🚀" if is_free_user else "Verifying Pro License... 👑",
            {"progress": 5},
            user_id=user_id,
        )

        if user.get("builds", 0) < 1:
            raise Exception("Insufficient APK build credits. Please upgrade your plan.")

        build_cost = 5 if is_free_user else 10
        if user.get("credits", 0) < build_cost:
            raise Exception("Insufficient credits for APK build.")

        final_banner = PLAYFUL_DEFAULT_BANNER_ID if is_free_user else (user.get("admob_banner") or "")
        final_interstitial = PLAYFUL_DEFAULT_INTERSTITIAL_ID if is_free_user else (user.get("admob_interstitial") or "")
        final_ad_interval = PLAYFUL_AD_INTERVAL_MINS if is_free_user else (user.get("admob_interval") or "10")
        watermark_enabled = "true" if is_free_user else "false"

        # Deduct credits before dispatch
        supabase.table("users").update({
            "builds": user["builds"] - 1,
            "credits": user["credits"] - build_cost,
        }).eq("id", user_id).execute()

        dispatch_payload = {
            "ref": "main",
            "inputs": {
                "owner": GITHUB_OWNER,
                "repo": user["username"],
                "folder": req.game_name,
                "admob_banner": final_banner,
                "admob_interstitial": final_interstitial,
                "ad_interval_minutes": final_ad_interval,
                "watermark": watermark_enabled,
            },
        }

        triggered_at = datetime.utcnow()
        await github_api(
            "POST",
            f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/workflows/build_apk.yml/dispatches",
            dispatch_payload,
        )

        await manager.send_update(
            job_id, "queued", "Build queued on GitHub Actions... ⏳", {"progress": 10}, user_id=user_id
        )

        # FIX #1: Get real run ID and poll actual status
        run_id = await get_latest_actions_run_id(PLAYFUL_BUILDER_REPO, "build_apk.yml", triggered_at)
        if not run_id:
            raise Exception("Could not find the GitHub Actions run. Build may still be processing — check your dashboard.")

        await manager.send_update(
            job_id, "building", f"Build started! Run #{run_id} 🔨", {"progress": 15}, user_id=user_id
        )

        # This polls real GitHub status until done or failed
        await poll_actions_run(run_id, job_id, user_id, is_free_user)

        apk_url = (
            f"https://github.com/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/releases/"
            f"download/latest-{user['username']}-{req.game_name}/{req.game_name}.apk"
        )
        final_msg = (
            "Your game is ready! 🎮" if is_free_user else "Masterpiece ready for the Play Store! 🏆"
        )
        await manager.send_update(
            job_id, "completed", final_msg, {"progress": 100, "apk_url": apk_url}, user_id=user_id
        )

    except Exception as e:
        logging.error(f"APK Build Job Failed [{job_id}]: {e}")
        # Refund builds credit on failure
        try:
            supabase.table("users").update({"builds": user.get("builds", 0) + 1}).eq("id", user_id).execute()
        except Exception:
            pass
        await manager.send_update(job_id, "failed", str(e), user_id=user_id)


# ==========================================
# 7. SECURE REST API ENDPOINTS
# ==========================================
@app.get("/health")
@limiter.limit("10/minute")
async def health_check(request: Request):
    return {"status": "online 🚀", "version": "8.0.0", "timestamp": datetime.utcnow().isoformat()}


@app.post("/search-assets")
@limiter.limit("10/minute")
async def api_search_assets(request: Request, req: AssetSearchRequest, user: dict = Depends(verify_user)):
    try:
        res = await model_flash.generate_content_async(
            f"Extract 1-3 primary 3D objects from: '{req.prompt}'. Return JSON array of strings only."
        )
        keywords = await _parse_ai_json(res.text)
        if not isinstance(keywords, list):
            raise ValueError("Expected a list")
    except Exception:
        keywords = ["character", "environment"]

    results = {}
    async with httpx.AsyncClient() as client:
        for keyword in keywords[:3]:
            params = {
                "type": "models",
                "downloadable": "true",
                "license": "cc0",          # Only CC0 — safe for commercial use
                "q": keyword,
                "sort_by": "-relevance",
            }
            res = await client.get(
                "https://api.sketchfab.com/v3/search",
                params=params,
                headers={"Authorization": f"Token {SKETCHFAB_API_TOKEN}"},
            )
            if res.status_code == 200:
                results[keyword] = [
                    {
                        "name": item.get("name"),
                        "uid": item.get("uid"),
                        "thumbnail": item.get("thumbnails", {}).get("images", [{}])[0].get("url", ""),
                        "license": "cc0",
                    }
                    for item in res.json().get("results", [])[:5]
                ]
    return {"status": "success", "keywords": keywords, "results": results}


@app.post("/generate-commit")
@limiter.limit("5/minute")
async def api_generate_and_commit(
    request: Request,
    req: GenerateRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(verify_user),
):
    job_id = str(uuid.uuid4())
    initial = {"status": "queued", "message": "Connecting to the matrix... 🔋"}
    JOB_CACHE[job_id] = initial
    if supabase:
        supabase.table("jobs").insert({"id": job_id, "user_id": user["id"], **initial}).execute()
    background_tasks.add_task(generate_and_commit_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}


@app.post("/build-apk")
@limiter.limit("3/minute")
async def api_build_apk(
    request: Request,
    req: BuildAPKRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(verify_user),
):
    job_id = str(uuid.uuid4())
    initial = {"status": "queued", "message": "Queuing APK build... ⏳", "progress": 0}
    JOB_CACHE[job_id] = initial
    if supabase:
        supabase.table("jobs").insert({"id": job_id, "user_id": user["id"], **initial}).execute()
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
            "admob_interval": req.admob_interval,
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

        old_folder_sha = next(
            (item["sha"] for item in tree_data.get("tree", [])
             if item["path"] == req.old_game_name and item["type"] == "tree"),
            None,
        )
        if not old_folder_sha:
            raise Exception("Original game folder not found on GitHub.")

        tree_items = [
            {"path": req.old_game_name, "mode": "040000", "type": "tree", "sha": None},
            {"path": req.new_game_name, "mode": "040000", "type": "tree", "sha": old_folder_sha},
        ]

        new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": base_tree_sha, "tree": tree_items})
        new_commit = await github_api(
            "POST",
            f"{repo_path}/git/commits",
            {"message": f"Rename {req.old_game_name} → {req.new_game_name}", "tree": new_tree["sha"], "parents": [base_sha]},
        )
        await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})

        # FIX #4: Update chat_history and game_manifests as atomic keys
        chat_history = user.get("chat_history", {})
        game_manifests = user.get("game_manifests", {})
        game_assets = user.get("game_assets", {})

        for store in [chat_history, game_manifests, game_assets]:
            if req.old_game_name in store:
                store[req.new_game_name] = store.pop(req.old_game_name)

        supabase.table("users").update({
            "chat_history": chat_history,
            "game_manifests": game_manifests,
            "game_assets": game_assets,
        }).eq("id", user["id"]).execute()

        return {
            "status": "success",
            "message": f"Game renamed to {req.new_game_name}",
            "new_preview_url": f"https://{GITHUB_OWNER}.github.io/{username}/{req.new_game_name}/index.html",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/deletegame")
@limiter.limit("10/minute")
async def api_delete_game(request: Request, req: GameRequest, user: dict = Depends(verify_user)):
    try:
        await delete_folder_from_github(user["username"], req.game_name)

        chat_history = user.get("chat_history", {})
        game_manifests = user.get("game_manifests", {})
        game_assets = user.get("game_assets", {})

        for store in [chat_history, game_manifests, game_assets]:
            store.pop(req.game_name, None)

        supabase.table("users").update({
            "chat_history": chat_history,
            "game_manifests": game_manifests,
            "game_assets": game_assets,
        }).eq("id", user["id"]).execute()

        return {"status": "success", "message": f"Game '{req.game_name}' deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/getgames")
@limiter.limit("20/minute")
async def api_get_games(request: Request, user: dict = Depends(verify_user)):
    status, contents = await github_api(
        "GET", f"/repos/{GITHUB_OWNER}/{user['username']}/contents", return_status=True
    )
    if status == 404:
        return {"games": []}

    favorites = user.get("favorites", [])
    games = [
        {
            "game_name": item["name"],
            "preview_url": f"https://{GITHUB_OWNER}.github.io/{user['username']}/{item['name']}/index.html",
            "is_favorite": item["name"] in favorites,
            "last_updated": "In Repo",
        }
        for item in contents
        if item["type"] == "dir"
    ]
    return {"games": games}


@app.post("/getchat")
@limiter.limit("30/minute")
async def api_get_chat(request: Request, req: GameRequest, user: dict = Depends(verify_user)):
    chat_history = user.get("chat_history", {})
    return {"game_name": req.game_name, "chat": chat_history.get(req.game_name, [])}


@app.get("/status/{job_id}")
async def get_job_status(job_id: str, user: dict = Depends(verify_user)):
    # FIX #2: Try memory cache first, fall back to Supabase
    if job_id in JOB_CACHE:
        return JOB_CACHE[job_id]

    if supabase:
        res = supabase.table("jobs").select("*").eq("id", job_id).eq("user_id", user["id"]).execute()
        if res.data:
            return res.data[0]

    raise HTTPException(status_code=404, detail="Job not found")


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
@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await manager.connect(job_id, websocket)
    try:
        # Send current job state immediately on connect
        if job_id in JOB_CACHE:
            await websocket.send_json({"job_id": job_id, **JOB_CACHE[job_id]})
        elif supabase:
            # FIX #2: Recover state from DB if not in cache (e.g. after server restart)
            res = supabase.table("jobs").select("*").eq("id", job_id).execute()
            if res.data:
                await websocket.send_json({"job_id": job_id, **res.data[0]})

        while True:
            await websocket.receive_text()   # keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(job_id)


# ==========================================
# SUPABASE SCHEMA NOTE
# Add this table for FIX #2:
#
# CREATE TABLE jobs (
#   id UUID PRIMARY KEY,
#   user_id UUID REFERENCES users(id),
#   status TEXT NOT NULL,
#   message TEXT,
#   progress INT,
#   preview_url TEXT,
#   apk_url TEXT,
#   cost FLOAT,
#   remaining FLOAT,
#   updated_at TIMESTAMPTZ DEFAULT NOW()
# );
#
# Also add to users table for FIX #6:
#   game_manifests JSONB DEFAULT '{}'
# ==========================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
