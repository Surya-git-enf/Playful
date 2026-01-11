import os, json, shutil, subprocess

TEMPLATE_REPO = "https://github.com/surya/game-templates"
BUILDS = "builds"
JOBS = "jobs"

os.makedirs(BUILDS, exist_ok=True)

def build_game(job_id, template):
    job_file = f"{JOBS}/{job_id}.json"
    game_dir = f"/tmp/{job_id}"
    out_dir = f"{BUILDS}/{job_id}"

    try:
        subprocess.run(
            ["git", "clone", TEMPLATE_REPO, game_dir],
            check=True
        )

        project_path = f"{game_dir}/{template}"

        subprocess.run([
            "godot",
            "--headless",
            "--path", project_path,
            "--export-release",
            "Web",
            f"{out_dir}/index.html"
        ], check=True)

        with open(job_file, "w") as f:
            json.dump({
                "status": "done",
                "url": f"/games/{job_id}/index.html"
            }, f)

    except Exception as e:
        with open(job_file, "w") as f:
            json.dump({"status": "error", "error": str(e)}, f)
