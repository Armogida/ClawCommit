import argparse
import os
import shutil
import subprocess
import tempfile

def install_skill_from_github(repo: str, path: str, target_skills_dir: str):
    """
    Installs a specific skill directory from a GitHub repository into the target skills directory.

    Args:
        repo: The GitHub repository in the format "owner/repo_name".
        path: The path to the skill directory within the repository.
        target_skills_dir: The directory where skills should be installed.
    """
    repo_url = f"https://github.com/{repo}.git"
    
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"Cloning {repo_url} into {temp_dir}...")
        try:
            subprocess.run(["git", "clone", "--depth", "1", repo_url, temp_dir], check=True)
            print("Repository cloned successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Error cloning repository: {e}")
            return

        source_skill_path = os.path.join(temp_dir, path)
        skill_name = os.path.basename(path)
        destination_skill_path = os.path.join(target_skills_dir, skill_name)

        if not os.path.isdir(source_skill_path):
            print(f"Error: Skill path '{path}' not found in repository.")
            return

        if os.path.exists(destination_skill_path):
            print(f"Warning: Skill '{skill_name}' already exists in '{target_skills_dir}'. Overwriting...")
            shutil.rmtree(destination_skill_path)

        try:
            shutil.copytree(source_skill_path, destination_skill_path)
            print(f"Skill '{skill_name}' installed successfully to '{destination_skill_path}'.")
        except Exception as e:
            print(f"Error copying skill: {e}")
            return

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Install a specific Gemini CLI skill from a GitHub repository."
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="The GitHub repository in the format 'owner/repo_name' (e.g., 'Armogida/ClawCommit')."
    )
    parser.add_argument(
        "--path",
        required=True,
        help="The path to the skill directory within the repository (e.g., 'skills/gemini-clawcommit')."
    )
    parser.add_argument(
        "--target-skills-dir",
        required=True,
        help="The absolute path to the Gemini CLI's skills directory (e.g., '/Users/youruser/.gemini/skills')."
    )

    args = parser.parse_args()
    install_skill_from_github(args.repo, args.path, args.target_skills_dir)
