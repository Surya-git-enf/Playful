
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
import tempfile
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
import anthropic

# ==========================================
# 1. LOGGING & SECURITY CONFIGURATION
# ==========================================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Database & GitHub Config
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-service-role-key")
PLAYFUL_GH_TOKEN = os.getenv("PLAYFUL_GH_TOKEN", "your-gh-token")
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "Surya-git-enf")
PLAYFUL_BUILDER_REPO = os.getenv("PLAYFUL_BUILDER_REPO", "Playful")

# V3 API KEYS (Sketchfab is officially dead in V3)
TRIPO_API_KEY = os.getenv("TRIPO_API_KEY", "your-tripo-token-here")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "your-anthropic-key-here")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "your-gemini-key-here")

# Initialize AI Clients
genai.configure(api_key=GEMINI_API_KEY)
model_pro = genai.GenerativeModel(
    model_name="gemini-2.5-pro", 
    generation_config={"response_mime_type": "application/json"}
)

try:
    claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
except Exception as e:
    logging.error(f"Claude client failed to initialize: {e}")
    claude_client = None

# Supabase Initialization
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logging.info("Supabase connected successfully.")
except Exception as e:
    logging.error(f"Supabase client failed to initialize: {e}")
    supabase = None

# CORS and Monetization Defaults
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "https://playful.app,https://www.playful.app,http://localhost:3000").split(",")
PLAYFUL_DEFAULT_BANNER_ID = os.getenv("PLAYFUL_DEFAULT_BANNER_ID", "ca-app-pub-xxx/banner")
PLAYFUL_DEFAULT_INTERSTITIAL_ID = os.getenv("PLAYFUL_DEFAULT_INTERSTITIAL_ID", "ca-app-pub-xxx/interstitial")
PLAYFUL_AD_INTERVAL_MINS = os.getenv("PLAYFUL_AD_INTERVAL_MINS", "10")

# Rate Limiter & App Init
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Playful Backend - V3 Hybrid Edition", version="3.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "PUT"],
    allow_headers=["Authorization", "Content-Type"],
)

security = HTTPBearer()

# ==========================================
# 2. STATE & JOB MANAGEMENT (WebSockets)
# ==========================================
JOB_CACHE: Dict[str, Dict[str, Any]] = {}
ACTIVE_CONNECTIONS: Dict[str, WebSocket] = {}

class ConnectionManager:
    async def connect(self, job_id: str, websocket: WebSocket):
        await websocket.accept()
        ACTIVE_CONNECTIONS[job_id] = websocket

    def disconnect(self, job_id: str):
        ACTIVE_CONNECTIONS.pop(job_id, None)

    async def send_update(self, job_id: str, status: str, message: str, data: dict = None, user_id: str = None):
        payload = {"status": status, "message": message, "updated_at": datetime.utcnow().isoformat()}
        if data:
            payload.update(data)

        if user_id and supabase:
            try:
                supabase.table("jobs").upsert({"id": job_id, "user_id": user_id, **payload}).execute()
            except Exception as db_err:
                logging.warning(f"Job DB persist failed for {job_id}: {db_err}")

        JOB_CACHE[job_id] = payload

        if job_id in ACTIVE_CONNECTIONS:
            ws_payload = {"job_id": job_id, **payload}
            try:
                await ACTIVE_CONNECTIONS[job_id].send_json(ws_payload)
            except Exception:
                self.disconnect(job_id)

manager = ConnectionManager()

# ==========================================
# 3. PYDANTIC MODELS
# ==========================================
class AssetSearchRequest(BaseModel):
    prompt: str = Field(..., max_length=500)

class GenerateRequest(BaseModel):
    game_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", max_length=50)
    prompt: str = Field(..., max_length=3000)

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
# 4. SECURE AUTH LOGIC
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
        user.setdefault("builds", 0)
        user.setdefault("favorites", [])
        user.setdefault("settings", {"theme": "neon"})
        user.setdefault("username", user_id[:8]) # Fallback username if none exists
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
# 5. GITHUB API LOGIC
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
    status, data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}/index.html", return_status=True)
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
            blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": file["content"], "encoding": "base64"})
        else:
            blob = await github_api("POST", f"{repo_path}/git/blobs", {"content": sanitize_code(file["content"]), "encoding": "utf-8"})
        tree_items.append({"path": f"{game_name}/{file['path']}", "mode": "100644", "type": "blob", "sha": blob["sha"]})

    new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": tree_sha, "tree": tree_items})
    new_commit = await github_api("POST", f"{repo_path}/git/commits", {"message": f"🎮 Deploy {game_name}", "tree": new_tree["sha"], "parents": [base_sha]})
    await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})

async def delete_folder_from_github(username: str, game_name: str):
    status, files = await github_api("GET", f"/repos/{GITHUB_OWNER}/{username}/contents/{game_name}", return_status=True)
    if status == 200 and isinstance(files, list):
        for file in files:
            payload = {"message": f"Delete {file['path']}", "sha": file["sha"]}
            await github_api("DELETE", f"/repos/{GITHUB_OWNER}/{username}/contents/{file['path']}", json_data=payload)

# ==========================================
# 6. TRIPO AI LOGIC (V3 Asset Pipeline)
# ==========================================
GLB_MAX_TEXTURE_SIZE = int(os.getenv("GLB_MAX_TEXTURE_SIZE", "1024"))

async def optimize_glb_asset(raw_glb_bytes: bytes, asset_name: str) -> bytes:
    """
    Runs a raw GLB through gltf-transform:
      - Draco compression on geometry (near-lossless, typically 70-90% smaller)
      - KTX2/Basis texture compression, capped to GLB_MAX_TEXTURE_SIZE
    Falls back to Draco-only, then to the original bytes, if either step fails
    (e.g. the basisu encoder or gltf-transform CLI isn't installed on this box).

    Requires on the server: npm install -g @gltf-transform/cli
    """
    with tempfile.TemporaryDirectory() as tmp:
        in_path = os.path.join(tmp, "raw.glb")
        out_path = os.path.join(tmp, "optimized.glb")
        with open(in_path, "wb") as f:
            f.write(raw_glb_bytes)

        async def run(cmd):
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            return proc.returncode, stderr.decode(errors="ignore")

        try:
            rc, err = await run([
                "gltf-transform", "optimize", in_path, out_path,
                "--compress", "draco",
                "--texture-compress", "ktx2",
                "--texture-size", str(GLB_MAX_TEXTURE_SIZE),
            ])
            if rc != 0:
                logging.warning(f"[GLB Optimize] KTX2 pass failed for {asset_name}, retrying Draco-only. {err[:300]}")
                rc, err = await run(["gltf-transform", "optimize", in_path, out_path, "--compress", "draco"])
                if rc != 0:
                    logging.warning(f"[GLB Optimize] Draco-only pass also failed for {asset_name}, shipping original. {err[:300]}")
                    return raw_glb_bytes

            with open(out_path, "rb") as f:
                optimized = f.read()
            before_kb, after_kb = len(raw_glb_bytes) // 1024, len(optimized) // 1024
            logging.info(f"[GLB Optimize] {asset_name}: {before_kb}KB -> {after_kb}KB")
            return optimized
        except FileNotFoundError:
            logging.warning("[GLB Optimize] gltf-transform CLI not installed - shipping unoptimized asset. Run: npm install -g @gltf-transform/cli")
            return raw_glb_bytes

async def store_optimized_asset(optimized_bytes: bytes, asset_name: str) -> str:
    """
    Uploads the optimized GLB to a Supabase Storage bucket ('game-assets', must be public)
    and returns its public URL.
    """
    path = f"{asset_name}_{uuid.uuid4().hex[:8]}.glb"
    if supabase:
        try:
            supabase.storage.from_("game-assets").upload(
                path, optimized_bytes, {"content-type": "model/gltf-binary"}
            )
            return supabase.storage.from_("game-assets").get_public_url(path)
        except Exception as e:
            logging.error(f"[GLB Store] Supabase upload failed: {e}")
    return f"https://cdn.playful.app/assets/{path}"

async def generate_tripo_asset(image_prompt: str) -> str:
    """
    Hits Tripo API to generate a 3D GLB model, then runs it through the
    Draco + KTX2 optimization pipeline before handing back a mobile-safe URL.
    """
    logging.info(f"🎨 [TRIPO] Generating 3D Model for: {image_prompt}")

    # TODO: Replace with actual Tripo POST + polling loop.
    # Tripo should return a raw_glb_url once generation completes.
    await asyncio.sleep(3)
    clean_name = image_prompt.replace(' ', '_').lower()[:15]
    raw_glb_url = f"https://tripo-cdn.example.com/raw/{clean_name}.glb"  # placeholder until real Tripo call is wired in

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(raw_glb_url, timeout=60.0)
            resp.raise_for_status()
            raw_bytes = resp.content
        optimized_bytes = await optimize_glb_asset(raw_bytes, clean_name)
        return await store_optimized_asset(optimized_bytes, clean_name)
    except Exception as e:
        logging.warning(f"[TRIPO] Could not fetch/optimize real asset ({e}), falling back to mock URL.")
        return f"https://cdn.playful.app/assets/{clean_name}_optimized.glb"

async def _parse_ai_json(raw_text: str) -> dict:
    clean = raw_text.strip()
    clean = re.sub(r'\s*```$', '', clean)
    try:
        return json.loads(clean.strip())
    except:
        return {}

# ==========================================
# 6B. MOBILE OPTIMIZATION LAYER (V4 - Step 8)
# ==========================================
# Injected into EVERY generated game regardless of what Claude outputs,
# so mobile performance never depends on Claude remembering to add it.
MOBILE_OPTIMIZATION_SNIPPET = """
<script>
// ===== Playful Mobile Optimization Layer (auto-injected) =====
(function(){
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window);
    window.__PLAYFUL_IS_MOBILE__ = isMobile;

    function applyMobileEngineSettings(engine, scene) {
        if (!engine || !scene) return;

        // 1. Dynamic resolution scaling - lower internal render resolution on mobile/low-DPR devices
        const dpr = window.devicePixelRatio || 1;
        const scaling = isMobile ? Math.max(1.0, dpr * 0.75) : dpr;
        engine.setHardwareScalingLevel(1 / (dpr / scaling));

        // 2. Adaptive quality via Babylon's SceneOptimizer - shadows, particles, post-process,
        //    textures, physics all auto-tuned to hit a target FPS on weaker mobile GPUs.
        if (BABYLON.SceneOptimizer) {
            const options = new BABYLON.SceneOptimizerOptions(isMobile ? 30 : 60);
            options.addOptimization(new BABYLON.HardwareScalingOptimization(0, isMobile ? 2 : 1));
            options.addOptimization(new BABYLON.ShadowsOptimization(1));
            options.addOptimization(new BABYLON.ParticlesOptimization(2));
            options.addOptimization(new BABYLON.PostProcessesOptimization(3));
            options.addOptimization(new BABYLON.TextureOptimization(4, isMobile ? 512 : 1024));
            BABYLON.SceneOptimizer.OptimizeAsync(scene, options);
        }

        // 3. Low-memory mode: cap texture size and disable expensive features on mobile
        if (isMobile) {
            engine.setHardwareScalingLevel(Math.max(engine.getHardwareScalingLevel(), 1.25));
            scene.skipPointerMovePicking = true;
            scene.autoClear = true;
            scene.blockMaterialDirtyMechanism = true;
        }

        // 4. Pause rendering when tab/app is hidden, resume smoothly when visible again
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                engine.stopRenderLoop();
            } else {
                engine.runRenderLoop(function () { scene.render(); });
            }
        });

        // 5. Responsive canvas - keep canvas + engine in sync with viewport/orientation changes
        window.addEventListener("resize", function () { engine.resize(); });
        window.addEventListener("orientationchange", function () {
            setTimeout(function () { engine.resize(); }, 200);
        });
    }

    // 6. Minimal virtual joystick + fire button for touch devices, only added if the
    //    generated game doesn't already define its own touch controls.
    function injectTouchControlsIfMissing() {
        if (!isMobile) return;
        if (window.__PLAYFUL_HAS_TOUCH_CONTROLS__) return; // game already provides its own

        const style = document.createElement("style");
        style.textContent = `
            #playful-joystick-zone { position:fixed; left:24px; bottom:24px; width:120px; height:120px;
                border-radius:50%; background:rgba(255,255,255,0.12); touch-action:none; z-index:9999; }
            #playful-joystick-stick { position:absolute; left:35px; top:35px; width:50px; height:50px;
                border-radius:50%; background:rgba(255,255,255,0.35); }
            #playful-action-btn { position:fixed; right:24px; bottom:24px; width:70px; height:70px;
                border-radius:50%; background:rgba(255,255,255,0.25); z-index:9999; touch-action:none; }
        `;
        document.head.appendChild(style);

        const zone = document.createElement("div");
        zone.id = "playful-joystick-zone";
        zone.innerHTML = '<div id="playful-joystick-stick"></div>';
        const actionBtn = document.createElement("div");
        actionBtn.id = "playful-action-btn";
        document.body.appendChild(zone);
        document.body.appendChild(actionBtn);

        window.PlayfulInput = { x: 0, y: 0, action: false };
        const stick = zone.querySelector("#playful-joystick-stick");
        let active = false, cx = 0, cy = 0;

        zone.addEventListener("touchstart", function (e) {
            active = true;
            const r = zone.getBoundingClientRect();
            cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        });
        zone.addEventListener("touchmove", function (e) {
            if (!active) return;
            const t = e.touches[0];
            let dx = t.clientX - cx, dy = t.clientY - cy;
            const max = 40;
            const dist = Math.min(Math.sqrt(dx*dx+dy*dy), max);
            const ang = Math.atan2(dy, dx);
            dx = Math.cos(ang) * dist; dy = Math.sin(ang) * dist;
            stick.style.transform = `translate(${dx}px, ${dy}px)`;
            window.PlayfulInput.x = dx / max; window.PlayfulInput.y = dy / max;
            e.preventDefault();
        }, { passive: false });
        zone.addEventListener("touchend", function () {
            active = false; stick.style.transform = "translate(0,0)";
            window.PlayfulInput.x = 0; window.PlayfulInput.y = 0;
        });
        actionBtn.addEventListener("touchstart", function (e) { window.PlayfulInput.action = true; e.preventDefault(); });
        actionBtn.addEventListener("touchend", function () { window.PlayfulInput.action = false; });
    }

    window.__playfulApplyMobileEngineSettings = applyMobileEngineSettings;
    document.addEventListener("DOMContentLoaded", injectTouchControlsIfMissing);
})();
</script>
"""

def inject_mobile_optimizations(html_code: str) -> str:
    """
    Guarantees every generated game ships with mobile optimization,
    regardless of whether the LLM output already included it.
    - Skips re-injection if already present (idempotent on edits of existing games).
    - Appends before </body> if present, otherwise at the end of the file.
    """
    if "Playful Mobile Optimization Layer" in html_code:
        return html_code
    if "</body>" in html_code:
        return html_code.replace("</body>", MOBILE_OPTIMIZATION_SNIPPET + "\n</body>")
    return html_code + MOBILE_OPTIMIZATION_SNIPPET

# ==========================================
# 7. GITHUB ACTIONS POLLING (APK Build)
# ==========================================
async def get_latest_actions_run_id(repo: str, workflow_file: str, triggered_after: datetime) -> Optional[str]:
    for _ in range(10):
        await asyncio.sleep(6)
        data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{repo}/actions/workflows/{workflow_file}/runs?per_page=5")
        for run in data.get("workflow_runs", []):
            run_created = datetime.fromisoformat(run["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            if run_created >= triggered_after:
                return str(run["id"])
    return None

async def poll_actions_run(run_id: str, job_id: str, user_id: str, is_free_user: bool):
    progress_steps = {"queued": 10, "in_progress": 50, "completed": 100}
    timeout_seconds = 600 
    elapsed = 0
    poll_interval = 8

    while elapsed < timeout_seconds:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval

        try:
            run_data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/runs/{run_id}")
        except Exception:
            continue

        gh_status = run_data.get("status", "queued")
        gh_conclusion = run_data.get("conclusion")
        progress = progress_steps.get(gh_status, 10)

        if gh_status == "in_progress":
            jobs_data = await github_api("GET", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/runs/{run_id}/jobs")
            steps = jobs_data.get("jobs", [{}])[0].get("steps", [])
            completed_steps = sum(1 for s in steps if s.get("conclusion") == "success")
            total_steps = max(len(steps), 1)
            progress = int(15 + (completed_steps / total_steps) * 75)

            step_name = next((s["name"] for s in steps if s.get("status") == "in_progress"), "Compiling APK...")
            await manager.send_update(job_id, "Building", f"⚙️ {step_name}", {"progress": progress}, user_id=user_id)

        elif gh_status == "completed":
            if gh_conclusion == "success":
                return True
            else:
                raise Exception(f"APK build failed on GitHub Actions. Conclusion: {gh_conclusion}")

    raise Exception("APK build timed out after 10 minutes. Please try again.")

# ==========================================
# 8. MASTER WORKFLOWS (V3 Architecture)
# ==========================================
async def generate_and_commit_workflow(job_id: str, req: GenerateRequest, user: dict):
    """
    THE V3 PIPELINE: Gemini Routes -> Tripo Builds Assets -> Claude 3.5 Writes Logic -> GitHub Deploys
    """
    user_id = user["id"]
    try:
        await manager.send_update(job_id, "starting", "Analyzing prompt with Gemini 2.5 Pro... 🧠✨", {"progress": 5}, user_id=user_id)

        chat_history = user.get("chat_history", {})
        game_history = chat_history.get(req.game_name, [])
        game_assets_db = user.get("game_assets", {})

        current_code = await fetch_existing_game_code(user["username"], req.game_name)

        # ---------------------------------------------------------
        # STEP 1: GEMINI AGENT (The Orchestrator)
        # ---------------------------------------------------------
        routing_prompt = f"""
        Analyze this game prompt: "{req.prompt}"
        Extract exactly two things in JSON format:
        1. "tripo_prompt": A highly descriptive visual prompt to generate the main 3D object via Tripo AI (e.g., "futuristic cyberpunk f1 car").
        2. "game_logic": The core mechanical instructions for the game engine.
        Respond ONLY in valid JSON.
        """
        gemini_response = await model_pro.generate_content_async(routing_prompt)
        parsed_instructions = await _parse_ai_json(gemini_response.text)
        
        tripo_prompt = parsed_instructions.get("tripo_prompt", "default 3d object")
        game_logic = parsed_instructions.get("game_logic", req.prompt)

        # ---------------------------------------------------------
        # STEP 2: TRIPO AI (The Art Department)
        # ---------------------------------------------------------
        await manager.send_update(job_id, "assets", f"Tripo AI generating 3D asset: {tripo_prompt[:30]}... 🛸", {"progress": 30}, user_id=user_id)
        asset_url = await generate_tripo_asset(tripo_prompt)
        
        # Save asset to DB for this game
        current_asset_urls = game_assets_db.get(req.game_name, [])
        if asset_url not in current_asset_urls:
            current_asset_urls.append(asset_url)
        game_assets_db[req.game_name] = current_asset_urls
        if supabase:
            supabase.table("users").update({"game_assets": game_assets_db}).eq("id", user_id).execute()

        # ---------------------------------------------------------
        # STEP 3: CLAUDE 3.5 SONNET (The Engineering Department)
        # ---------------------------------------------------------
        await manager.send_update(job_id, "generating", "Claude 3.5 writing Babylon.js logic... ⚙️", {"progress": 60}, user_id=user_id)
        
        claude_sys = """You are an elite Game Engine Architect. Engine: Babylon.js ONLY.
        Implement standard Babylon.js game loops and physics.
        Output ONLY raw HTML/JS code containing the scene. Do NOT use markdown code fences.

        MOBILE OPTIMIZATION IS MANDATORY. Every game you write MUST include:
        - Mobile device detection (touch capability / user agent).
        - Touch controls (virtual joystick and/or tap-to-act) as the primary input on touch devices,
          in addition to keyboard/mouse for desktop. If you detect window.PlayfulInput at runtime
          (x, y, action), read from it so it can drive movement/attacks on touch devices.
        - Responsive canvas: engine.resize() on window resize and orientation change.
        - Adaptive graphics quality: call window.__playfulApplyMobileEngineSettings(engine, scene)
          immediately after creating the engine and scene, if that function exists on window.
        - Reasonable defaults even if that helper is absent: lower shadow map / particle counts
          and texture sizes on mobile, use instanced meshes over draw-call-heavy repeated meshes,
          and avoid per-frame allocations in the render loop.
        - Do not rely on desktop-only assumptions (hover states, right-click, fixed high resolution)."""

        context_block = f"\nCURRENT CODE:\n{current_code[:4000]}\nEDIT this game." if current_code else "\nBRAND NEW game."
        claude_usr = f"""Build logic for: {game_logic}. {context_block}
        I have pre-generated the main 3D asset. You MUST use this exact URL to load the mesh into the Babylon scene: {asset_url}.
        Ensure the camera tracks this mesh and appropriate colliders are added.
        Remember: this game must run smoothly on Android Chrome, Samsung Internet, and Safari iOS."""

        if claude_client:
            claude_response = claude_client.messages.create(
                model="claude-3-5-sonnet-20240620",
                max_tokens=8000,
                system=claude_sys,
                messages=[{"role": "user", "content": claude_usr}]
            )
            final_game_code = claude_response.content[0].text
        else:
            raise Exception("Claude API Key is missing. Cannot generate logic.")

        # Safety net: guarantee mobile optimization even if Claude's output misses something.
        final_game_code = inject_mobile_optimizations(final_game_code)

        # ---------------------------------------------------------
        # STEP 4: GITHUB FACTORY (Commit & Deploy)
        # ---------------------------------------------------------
        await manager.send_update(job_id, "deploying", "Securing your corner of the multiverse... 🪐", {"progress": 80}, user_id=user_id)
        await ensure_user_repo_exists(user["username"])

        await manager.send_update(job_id, "committing", "Packing pixels into launch tube... 🚀📦", {"progress": 90}, user_id=user_id)
        await commit_files_to_github(user["username"], req.game_name, [{"path": "index.html", "content": final_game_code}], is_binary=False)

        # Trigger GitHub Pages (Non-blocking)
        try:
            await github_api("POST", f"/repos/{GITHUB_OWNER}/{user['username']}/pages", {"source": {"branch": "main", "path": "/"}})
        except Exception:
            pass # Pages might already be enabled

        # Update Chat History
        ts = datetime.utcnow().timestamp()
        game_history.extend([
            {"role": "user", "content": req.prompt, "ts": ts},
            {"role": "assistant", "content": "V3 Game Generated via Claude 3.5 & Tripo AI", "ts": ts + 1},
        ])
        chat_history[req.game_name] = game_history
        if supabase:
            supabase.table("users").update({"chat_history": chat_history}).eq("id", user_id).execute()

        preview_url = f"https://{GITHUB_OWNER}.github.io/{user['username']}/{req.game_name}/index.html"
        await manager.send_update(
            job_id, "completed", "V3 Pipeline Success! 🏁", 
            {"progress": 100, "preview_url": preview_url, "cost": 1.0, "remaining": user.get("credits", 100) - 1.0}, 
            user_id=user_id
        )

    except Exception as e:
        logging.error(f"Generation Job Failed [{job_id}]: {e}")
        await manager.send_update(job_id, "failed", str(e), {"progress": 0}, user_id=user.get("id"))

async def build_apk_workflow(job_id: str, req: BuildAPKRequest, user: dict):
    user_id = user["id"]
    try:
        is_free_user = user.get("plan", "free") == "free"

        await manager.send_update(
            job_id, "initializing", "Booting up the Playful Engine... 🚀" if is_free_user else "Verifying Pro License... 👑",
            {"progress": 5}, user_id=user_id
        )

        if user.get("builds", 0) < 1:
            raise Exception("Insufficient APK build credits. Please upgrade your plan.")

        final_banner = PLAYFUL_DEFAULT_BANNER_ID if is_free_user else (user.get("admob_banner") or "")
        final_interstitial = PLAYFUL_DEFAULT_INTERSTITIAL_ID if is_free_user else (user.get("admob_interstitial") or "")
        final_ad_interval = PLAYFUL_AD_INTERVAL_MINS if is_free_user else (user.get("admob_interval") or "10")
        watermark_enabled = "true" if is_free_user else "false"

        if supabase:
            supabase.table("users").update({"builds": user["builds"] - 1}).eq("id", user_id).execute()

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
        await github_api("POST", f"/repos/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/actions/workflows/build_apk.yml/dispatches", dispatch_payload)

        await manager.send_update(job_id, "queued", "Build queued on GitHub Actions... ⏳", {"progress": 10}, user_id=user_id)

        run_id = await get_latest_actions_run_id(PLAYFUL_BUILDER_REPO, "build_apk.yml", triggered_at)
        if not run_id:
            raise Exception("Could not find the GitHub Actions run. Build may still be processing.")

        await manager.send_update(job_id, "building", f"Build started! Run #{run_id} 🔨", {"progress": 15}, user_id=user_id)
        await poll_actions_run(run_id, job_id, user_id, is_free_user)

        apk_url = f"https://github.com/{GITHUB_OWNER}/{PLAYFUL_BUILDER_REPO}/releases/download/latest-{user['username']}-{req.game_name}/{req.game_name}.apk"
        await manager.send_update(job_id, "completed", "Masterpiece ready for the Play Store! 🏆", {"progress": 100, "apk_url": apk_url}, user_id=user_id)

    except Exception as e:
        logging.error(f"APK Build Job Failed [{job_id}]: {e}")
        if supabase:
            try:
                supabase.table("users").update({"builds": user.get("builds", 0) + 1}).eq("id", user_id).execute()
            except Exception:
                pass
        await manager.send_update(job_id, "failed", str(e), {"progress": 0}, user_id=user_id)


# ==========================================
# 9. SECURE REST API ENDPOINTS & CRUD
# ==========================================
@app.get("/health")
@limiter.limit("10/minute")
async def health_check(request: Request):
    return {"status": "online 🚀", "version": "3.0.0 Hybrid Edition", "timestamp": datetime.utcnow().isoformat()}

@app.post("/search-assets")
@limiter.limit("10/minute")
async def api_search_assets(request: Request, req: AssetSearchRequest, user: dict = Depends(verify_user)):
    """
    NOTE: Sketchfab is officially deprecated in V3. 
    This endpoint returns empty gracefully to prevent legacy frontend UI from crashing.
    Assets are now generated natively via Tripo AI during game generation.
    """
    return {"status": "success", "keywords": [], "results": {}, "message": "Sketchfab deprecated. V3 uses Tripo AI natively."}

@app.post("/api/v3/generate-game")
@app.post("/generate-commit") # Maintained for backward compatibility with frontend
@limiter.limit("5/minute")
async def api_generate_and_commit(request: Request, req: GenerateRequest, background_tasks: BackgroundTasks, user: dict = Depends(verify_user)):
    job_id = str(uuid.uuid4())
    initial = {"status": "queued", "message": "Connecting to the V3 matrix... 🔋", "progress": 0}
    JOB_CACHE[job_id] = initial
    if supabase:
        supabase.table("jobs").insert({"id": job_id, "user_id": user["id"], **initial}).execute()
    
    background_tasks.add_task(generate_and_commit_workflow, job_id, req, user)
    return {"job_id": job_id, "status": "queued"}

@app.post("/build-apk")
@limiter.limit("3/minute")
async def api_build_apk(request: Request, req: BuildAPKRequest, background_tasks: BackgroundTasks, user: dict = Depends(verify_user)):
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

        old_folder_sha = next((item["sha"] for item in tree_data.get("tree", []) if item["path"] == req.old_game_name and item["type"] == "tree"), None)
        if not old_folder_sha:
            raise Exception("Original game folder not found on GitHub.")

        tree_items = [
            {"path": req.old_game_name, "mode": "040000", "type": "tree", "sha": None},
            {"path": req.new_game_name, "mode": "040000", "type": "tree", "sha": old_folder_sha},
        ]

        new_tree = await github_api("POST", f"{repo_path}/git/trees", {"base_tree": base_tree_sha, "tree": tree_items})
        new_commit = await github_api("POST", f"{repo_path}/git/commits", {"message": f"Rename {req.old_game_name} → {req.new_game_name}", "tree": new_tree["sha"], "parents": [base_sha]})
        await github_api("PATCH", f"{repo_path}/git/refs/heads/main", {"sha": new_commit["sha"]})

        chat_history = user.get("chat_history", {})
        game_assets = user.get("game_assets", {})
        for store in [chat_history, game_assets]:
            if req.old_game_name in store:
                store[req.new_game_name] = store.pop(req.old_game_name)

        if supabase:
            supabase.table("users").update({"chat_history": chat_history, "game_assets": game_assets}).eq("id", user["id"]).execute()

        return {"status": "success", "message": f"Game renamed to {req.new_game_name}", "new_preview_url": f"https://{GITHUB_OWNER}.github.io/{username}/{req.new_game_name}/index.html"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deletegame")
@app.delete("/api/v3/games/{game_name}")
@limiter.limit("10/minute")
async def api_delete_game(request: Request, game_name: str = None, req: GameRequest = None, user: dict = Depends(verify_user)):
    target_game = game_name if game_name else (req.game_name if req else None)
    if not target_game:
        raise HTTPException(status_code=400, detail="Game name is required.")
        
    try:
        await delete_folder_from_github(user["username"], target_game)
        
        chat_history = user.get("chat_history", {})
        game_assets = user.get("game_assets", {})
        for store in [chat_history, game_assets]:
            store.pop(target_game, None)

        if supabase:
            supabase.table("users").update({"chat_history": chat_history, "game_assets": game_assets}).eq("id", user["id"]).execute()
            
        return {"status": "success", "message": f"Game '{target_game}' deleted permanently."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v3/games")
@app.post("/getgames")
@limiter.limit("20/minute")
async def api_get_games(request: Request, user: dict = Depends(verify_user)):
    status, contents = await github_api("GET", f"/repos/{GITHUB_OWNER}/{user['username']}/contents", return_status=True)
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
        for item in contents if item["type"] == "dir"
    ]
    return {"status": "success", "games": games}

@app.post("/getchat")
@limiter.limit("30/minute")
async def api_get_chat(request: Request, req: GameRequest, user: dict = Depends(verify_user)):
    chat_history = user.get("chat_history", {})
    return {"game_name": req.game_name, "chat": chat_history.get(req.game_name, [])}

@app.get("/status/{job_id}")
async def get_job_status(job_id: str, user: dict = Depends(verify_user)):
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
        
    if supabase:
        supabase.table("users").update({"favorites": favorites}).eq("id", user["id"]).execute()
        
    return {"status": "success", "favorites": favorites}

@app.post("/update-settings")
@limiter.limit("10/minute")
async def api_update_settings(request: Request, req: UpdateSettingsRequest, user: dict = Depends(verify_user)):
    settings = user.get("settings", {})
    settings["theme"] = req.theme
    
    if supabase:
        supabase.table("users").update({"settings": settings}).eq("id", user["id"]).execute()
        
    return {"status": "success", "settings": settings}

# ==========================================
# 10. WEBSOCKETS (Live Progress Updates)
# ==========================================
@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await manager.connect(job_id, websocket)
    try:
        # Re-hydrate state if available
        if job_id in JOB_CACHE:
            await websocket.send_json({"job_id": job_id, **JOB_CACHE[job_id]})
        elif supabase:
            res = supabase.table("jobs").select("*").eq("id", job_id).execute()
            if res.data:
                await websocket.send_json({"job_id": job_id, **res.data[0]})

        while True:
            await websocket.receive_text() # Keeps the connection alive
    except WebSocketDisconnect:
        manager.disconnect(job_id)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
