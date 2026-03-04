# main.py
"""
Playful backend - Single-file service
- Supabase users table stores chat_history as JSON: { "<game_name>": [ {role,content,ts}, ... ] }
- POST /generate-and-commit -> background job (WebSocket stream) -> AI manifest -> commit to GitHub -> enable Pages -> return preview_url
- POST /build-apk -> triggers GitHub Actions workflow_dispatch on the relevant repo (repo = username under GITHUB_OWNER) with folder input
- WebSocket at /ws/{job_id} streams status updates for frontend

Environment variables (see ENV.md):
- SUPABASE_URL, SUPABASE_KEY (service role)
- PLAYFUL_GH_TOKEN (GitHub PAT)
- GITHUB_OWNER (org/owner where repos will be created)
- GEMINI_API_ENDPOINT, GEMINI_API_KEY
- OPTIONAL: PLAYFUL_ADMOB_BANNER_ID, PLAYFUL_ADMOB_INTERSTITIAL_ID
"""

import os
import re
import json
import time
import uuid
import base64
import asyncio
from typing import Any, Dict, List, Optional
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from supabase import create_client

# ---- CONFIG from env ----
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
PLAYFUL_GH_TOKEN = os.getenv("PLAYFUL_GH_TOKEN")
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "playful-git-enf")
GEMINI_API_ENDPOINT = os.getenv("GEMINI_API_ENDPOINT")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PLAYFUL_ADMOB_BANNER_ID = os.getenv("PLAYFUL_ADMOB_BANNER_ID", "")
PLAYFUL_ADMOB_INTERSTITIAL_ID = os.getenv("PLAYFUL_ADMOB_INTERSTITIAL_ID", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY")
if not PLAYFUL_GH_TOKEN:
    raise RuntimeError("Set PLAYFUL_GH_TOKEN")
if not GEMINI_API_ENDPOINT or not GEMINI_API_KEY:
    # we will allow simulation of AI for testing, but warn
    print("Warning: GEMINI_API_ENDPOINT or GEMINI_API_KEY not set — call_gemini will fail until set.")

# ---- Init supabase ----
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Playful Backend")

# ---- simple in-memory websocket manager & job store (POC) ----
class WSManager:
    def __init__(self):
        self.clients: Dict[str, List[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, job_id: str, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.clients.setdefault(job_id, []).append(ws)

    async def disconnect(self, job_id: str, ws: WebSocket):
        async with self.lock:
            if job_id in self.clients and ws in self.clients[job_id]:
                self.clients[job_id].remove(ws)

    async def send(self, job_id: str, payload: Dict[str, Any]):
        async with self.lock:
            sockets = list(self.clients.get(job_id, []))
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                await self.disconnect(job_id, ws)

ws = WSManager()
JOB_STORE: Dict[str, Dict[str, Any]] = {}

# ---- utilities ----
def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r'[\s]+', '-', s)
    s = re.sub(r'[^a-z0-9\-]', '', s)
    s = re.sub(r'-{2,}', '-', s)
    return s.strip('-')

def safe_username_from_name(name: str) -> str:
    # remove spaces, lowercase, replace spaces with '-' per your instruction
    return re.sub(r'[^a-z0-9\-]', '-', name.strip().lower())

# ---- models ----
class GenerateRequest(BaseModel):
    email: str
    game_name: str
    prompt: str

class AppendRequest(BaseModel):
    email: str
    game_name: str
    role: str
    content: str

class BuildRequest(BaseModel):
    email: str
    game_name: str
    admob_ids: Optional[Dict[str,str]] = None  # optional: banner/interstitial

# ---- Supabase helpers (users table holds chat_history JSON) ----
def get_user_by_email(email: str) -> Optional[Dict]:
    r = supabase.table("users").select("*").eq("email", email).maybe_single().execute()
    if r.error:
        raise RuntimeError(f"Supabase error: {r.error.message}")
    return r.data

def upsert_user(user_row: Dict):
    r = supabase.table("users").upsert(user_row).execute()
    if r.error:
        raise RuntimeError(f"Supabase upsert error: {r.error.message}")
    return r.data

def append_chat_history(email: str, game_name: str, role: str, content: str):
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    history = user.get("chat_history") or {}
    # ensure last 40 messages per game only
    arr = history.get(game_name, [])
    arr.append({"role": role, "content": content, "ts": int(time.time())})
    arr = arr[-40:]
    history[game_name] = arr
    res = supabase.table("users").update({"chat_history": history}).eq("email", email).execute()
    if res.error:
        raise RuntimeError(f"Supabase update error: {res.error.message}")
    return {"ok": True, "len": len(arr)}

def get_last_messages(email: str, game_name: str, last_n: int = 12):
    user = get_user_by_email(email)
    if not user:
        return []
    history = user.get("chat_history") or {}
    arr = history.get(game_name, [])
    return arr[-last_n:]

# ---- GitHub helpers (commit files into path username/game_folder/) ----
GITHUB_API = "https://api.github.com"
GH_HEADERS = {"Authorization": f"token {PLAYFUL_GH_TOKEN}", "Accept": "application/vnd.github+json"}

def ensure_repo_for_username(username: str):
    """
    Create a repo under GITHUB_OWNER with name = username (if not exists).
    This matches preview URL pattern: https://{GITHUB_OWNER}.github.io/{username}/{game_folder}/index.html
    """
    repo = username
    url = f"{GITHUB_API}/repos/{GITHUB_OWNER}/{repo}"
    r = requests.get(url, headers=GH_HEADERS)
    if r.status_code == 200:
        return True
    # create repo in org
    payload = {"name": repo, "private": False, "auto_init": False}
    cr = requests.post(f"{GITHUB_API}/orgs/{GITHUB_OWNER}/repos", headers=GH_HEADERS, json=payload)
    if cr.status_code in (201,202):
        return True
    # fallback to creating user repo — usually not allowed with org token; raise error
    raise RuntimeError(f"Failed to ensure repo for username '{username}': {cr.status_code} {cr.text}")

def get_branch_sha(owner: str, repo: str, branch: str = "main") -> Optional[str]:
    r = requests.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/ref/heads/{branch}", headers=GH_HEADERS)
    if r.status_code == 200:
        return r.json()["object"]["sha"]
    return None

def create_readme_if_missing(owner: str, repo: str, branch: str = "main"):
    if get_branch_sha(owner, repo, branch):
        return
    content = base64.b64encode(f"# {repo}\n\nGenerated by Playful".encode()).decode()
    payload = {"message":"init repo", "content": content, "branch": branch}
    r = requests.put(f"{GITHUB_API}/repos/{owner}/{repo}/contents/README.md", headers=GH_HEADERS, json=payload)
    if r.status_code not in (201,200):
        raise RuntimeError(f"Failed to init repo: {r.status_code} {r.text}")

def commit_files(owner: str, repo: str, branch: str, folder: str, files: List[Dict[str,Any]], commit_message: str = "Playful AI commit"):
    """
    files: list of {"path":"index.html", "type":"text" or "binary_base64", "content": "<...>"}
    We'll create blobs, tree entries with paths = f"{folder}/{path}" and commit.
    """
    ensure_repo_for_username(repo)
    create_readme_if_missing(owner, repo, branch)
    ref_sha = get_branch_sha(owner, repo, branch)
    if not ref_sha:
        raise RuntimeError("Missing branch ref (main)")

    commit_resp = requests.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/commits/{ref_sha}", headers=GH_HEADERS)
    if commit_resp.status_code >= 400:
        raise RuntimeError(f"Failed to fetch base commit: {commit_resp.status_code} {commit_resp.text}")
    base_tree_sha = commit_resp.json()["tree"]["sha"]

    tree_items = []
    for f in files:
        p = f.get("path")
        if not p:
            continue
        path_in_repo = f"{folder}/{p}".lstrip("/")
        ftype = f.get("type","text")
        cnt = f.get("content","")
        if ftype == "binary_base64":
            blob_payload = {"content": cnt, "encoding":"base64"}
        else:
            b64 = base64.b64encode(cnt.encode()).decode()
            blob_payload = {"content": b64, "encoding":"base64"}
        br = requests.post(f"{GITHUB_API}/repos/{owner}/{repo}/git/blobs", headers=GH_HEADERS, json=blob_payload)
        if br.status_code >= 400:
            raise RuntimeError(f"Failed to create blob for {path_in_repo}: {br.status_code} {br.text}")
        blob_sha = br.json()["sha"]
        tree_items.append({"path": path_in_repo, "mode":"100644", "type":"blob", "sha": blob_sha})

    tree_payload = {"base_tree": base_tree_sha, "tree": tree_items}
    tr = requests.post(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees", headers=GH_HEADERS, json=tree_payload)
    if tr.status_code >= 400:
        raise RuntimeError(f"Failed to create tree: {tr.status_code} {tr.text}")
    new_tree_sha = tr.json()["sha"]

    commit_payload = {"message": commit_message, "tree": new_tree_sha, "parents":[ref_sha]}
    cr = requests.post(f"{GITHUB_API}/repos/{owner}/{repo}/git/commits", headers=GH_HEADERS, json=commit_payload)
    if cr.status_code >= 400:
        raise RuntimeError(f"Failed to create commit: {cr.status_code} {cr.text}")
    new_commit_sha = cr.json()["sha"]

    up = requests.patch(f"{GITHUB_API}/repos/{owner}/{repo}/git/refs/heads/{branch}", headers=GH_HEADERS, json={"sha": new_commit_sha})
    if up.status_code >= 400:
        raise RuntimeError(f"Failed to update ref: {up.status_code} {up.text}")

    return {"commit_sha": new_commit_sha}

def enable_pages(owner: str, repo: str):
    r = requests.put(f"{GITHUB_API}/repos/{owner}/{repo}/pages", headers=GH_HEADERS, json={"source":{"branch":"main","path":"/"}})
    return {"status": r.status_code, "text": r.text}

# ---- AI wrapper (Gemini generic) ----
def call_gemini(prompt: str) -> Dict[str, Any]:
    """
    Call your GEMINI_API_ENDPOINT with GEMINI_API_KEY.
    Expect returned text containing a JSON manifest as described in prompt.
    If the provider returns a JSON body with the content already parsed, adapt accordingly.
    """
    if not GEMINI_API_ENDPOINT or not GEMINI_API_KEY:
        raise RuntimeError("Gemini endpoint/key not configured")
    payload = {
        "prompt": prompt,
        "max_tokens": 6000,
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {GEMINI_API_KEY}", "Content-Type": "application/json"}
    r = requests.post(GEMINI_API_ENDPOINT, headers=headers, json=payload, timeout=120)
    if r.status_code >= 400:
        raise RuntimeError(f"AI call failed: {r.status_code} {r.text}")
    data = r.json()
    # Try to extract text/json from response — provider-dependent.
    # Many providers return data['output'] or data['candidates'][0]['content'] — adapt if needed.
    text = None
    if isinstance(data, dict):
        if "output" in data and isinstance(data["output"], str):
            text = data["output"]
        elif "candidates" in data and isinstance(data["candidates"], list):
            text = data["candidates"][0].get("content") or data["candidates"][0].get("text")
        elif "content" in data:
            # could be direct
            text = data["content"]
        else:
            # fallback: stringify
            text = json.dumps(data)
    else:
        text = str(data)
    # extract JSON manifest from text
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise RuntimeError("AI did not return valid JSON manifest")
    js = text[first:last+1]
    manifest = json.loads(js)
    return manifest

# ---- sanitizer simplistic ----
def sanitize_manifest_files(files: List[Dict[str, Any]]):
    safe = []
    for f in files:
        p = f.get("path","")
        typ = f.get("type","text")
        content = f.get("content","")
        if typ == "text":
            # strip dangerous patterns
            content = re.sub(r'\beval\s*\(', '//[stripped eval](', content)
            content = re.sub(r'new\s+Function\s*\(', '//[stripped new Function](', content)
            safe.append({"path": p, "type":"text", "content": content})
        elif typ == "binary_base64":
            # ensure not huge
            size_bytes = (len(content) * 3)//4
            if size_bytes > 50*1024*1024:
                raise RuntimeError(f"Binary file {p} too large")
            safe.append({"path": p, "type":"binary_base64", "content": content})
        else:
            raise RuntimeError("Unknown file type")
    return safe

# ---- credit estimator (100 lines = 2 credits; base 5; 0.5/file; glb extra) ----
def estimate_credits(files: List[Dict[str, Any]]) -> int:
    base = 5
    per_file = 0.5 * len(files)
    total_lines = 0
    complex_cost = 0
    for f in files:
        p = f.get("path","").lower()
        if p.endswith((".glb",".gltf",".zip")):
            complex_cost += 20
        cont = f.get("content","")
        if isinstance(cont, str):
            total_lines += cont.count("\n")
    per_lines = 2 * (total_lines // 100)
    return int(base + per_file + per_lines + complex_cost)

# ---- core background job ----
async def do_generate_job(job_id: str, payload: Dict[str, Any]):
    await ws.send(job_id, {"job_id": job_id, "status": "initializing", "message": "job started"})
    try:
        email = payload["email"]
        game_name = payload["game_name"]
        prompt = payload["prompt"]
        # 1) user check
        user = get_user_by_email(email)
        if not user:
            await ws.send(job_id, {"status":"failed","message":"user not found"})
            JOB_STORE[job_id] = {"status":"failed"}
            return
        username = user.get("username") or user.get("email").split("@")[0]
        username_safe = safe_username_from_name(username)
        folder = slugify(game_name)
        # 2) build AI prompt with last 12 history
        last12 = get_last_messages(email, game_name, 12)
        hist_text = "\n".join([f"{m['role']}: {m['content']}" for m in last12])
        ai_prompt = f"""
You are a senior game developer and will produce a JSON manifest for a Babylon.js playable web game.
User email: {email}
Game name: {game_name}
History (last messages): {hist_text}
User prompt: {prompt}

Return only a single JSON object with fields:
- project_name (string)
- files: array of {{ path, type, content }} where path is relative (index.html, js/app.js, css/style.css, assets/car.glb)
  - type is "text" or "binary_base64" for binary content
- estimated_credits (integer)
- notes (string)
- build_instructions (string)

Ensure JS is safe (no eval/new Function). Keep assets small or refer to placeholders for big models.
"""
        await ws.send(job_id, {"status":"thinking", "message":"calling AI..."})
        manifest = call_gemini(ai_prompt)
        await ws.send(job_id, {"status":"thinking", "message":"AI returned manifest; validating..."})
        files = manifest.get("files", [])
        # 3) estimate & credit check
        est = manifest.get("estimated_credits") or estimate_credits(files)
        credits = int(user.get("credits", 0))
        if credits < est:
            await ws.send(job_id, {"status":"failed", "message": f"Insufficient credits: need {est}, have {credits}"})
            JOB_STORE[job_id] = {"status":"failed", "reason":"insufficient_credits", "estimated": est}
            return
        # deduct credits (simple update - in production do transaction)
        supabase.table("users").update({"credits": credits - est}).eq("email", email).execute()
        await ws.send(job_id, {"status":"committing", "message":"sanitizing files and committing to GitHub..."})
        safe_files = sanitize_manifest_files(files)
        # 4) commit to GitHub (repo name = username_safe, path folder)
        owner = GITHUB_OWNER
        repo = username_safe
        commit_res = commit_files(owner, repo, "main", folder, safe_files, commit_message=f"Playful AI generate {folder}")
        # attempt to enable pages (best-effort)
        pages_res = enable_pages(owner, repo)
        preview_url = f"https://{owner}.github.io/{repo}/{folder}/index.html"
        # 5) append assistant chat history entry summarizing the action
        append_chat_history = get_last_messages(email, game_name, 0)  # no-op to get user row ensure
        # Append assistant record
        append_chat = {
            "role": "assistant",
            "content": f"Generated files and committed to GitHub. Preview: {preview_url}. Notes: {manifest.get('notes','')}",
            "ts": int(time.time())
        }
        # update chat_history JSON for user
        user = get_user_by_email(email)
        history = user.get("chat_history") or {}
        arr = history.get(game_name, [])
        arr.append(append_chat)
        arr = arr[-40:]
        history[game_name] = arr
        supabase.table("users").update({"chat_history": history}).eq("email", email).execute()
        await ws.send(job_id, {"status":"done", "message":"commit complete", "preview_url": preview_url, "commit": commit_res, "pages": pages_res})
        JOB_STORE[job_id] = {"status":"done", "preview_url": preview_url}
    except Exception as e:
        await ws.send(job_id, {"status":"failed", "message": str(e)})
        JOB_STORE[job_id] = {"status":"failed", "error": str(e)}

# ---- endpoints ----
@app.post("/history/append")
async def http_append(req: AppendRequest):
    return append_chat_history(req.email, req.game_name, req.role, req.content)

@app.post("/generate-and-commit")
async def http_generate(req: GenerateRequest, background: BackgroundTasks):
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status":"queued"}
    payload = {"email": req.email, "game_name": req.game_name, "prompt": req.prompt}
    background.add_task(asyncio.create_task, do_generate_job(job_id, payload))
    return {"ok": True, "job_id": job_id, "ws_url": f"/ws/{job_id}"}

@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await ws.connect(job_id, websocket)
    try:
        while True:
            # optional: keep alive heartbeat from client
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws.disconnect(job_id, websocket)

@app.post("/build-apk")
async def http_build_apk(req: BuildRequest):
    """
    Triggers a GitHub Actions workflow_dispatch on the repo (username) with input 'folder' = game folder
    The workflow (in the repo) should build Capacitor/Android release and create a Release with artifact.
    """
    email = req.email
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    username_safe = safe_username_from_name(user.get("username") or user.get("email").split("@")[0])
    folder = slugify(req.game_name)
    owner = GITHUB_OWNER
    repo = username_safe
    # trigger workflow_dispatch
    # The workflow file name we expect: build_apk.yml
    dispatch_url = f"{GITHUB_API}/repos/{owner}/{repo}/actions/workflows/build_apk.yml/dispatches"
    payload = {"ref": "main", "inputs": {"folder": folder, "admob_banner": req.admob_ids.get("banner","") if req.admob_ids else "", "admob_interstitial": req.admob_ids.get("interstitial","") if req.admob_ids else ""}}
    r = requests.post(dispatch_url, headers=GH_HEADERS, json=payload)
    if r.status_code not in (204,201):
        raise HTTPException(status_code=500, detail=f"Failed trigger workflow: {r.status_code} {r.text}")
    # store job and inform user they can open websocket to track (we will poll via GitHub API in a separate worker in production)
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {"status":"queued", "message":"workflow dispatched"}
    return {"ok": True, "job_id": job_id, "message":"Workflow dispatched, check repo Actions for progress"}

@app.get("/status/{job_id}")
async def status(job_id: str):
    return JOB_STORE.get(job_id, {"status":"unknown"})

@app.get("/health")
async def health():
    return {"ok": True, "time": int(time.time())}
