from huggingface_hub import HfApi
import os

# API token dan DATABASE_URL dibaca dari environment variable
HF_TOKEN = os.getenv("HF_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")

if not HF_TOKEN or not DATABASE_URL:
    print("Error: HF_TOKEN dan DATABASE_URL harus diset di environment")
    exit(1)

api = HfApi(token=HF_TOKEN)

# Update Secret
try:
    print("Updating Secret DATABASE_URL...")
    api.add_space_secret(
        repo_id="heathclif/monitoring-pemasaran",
        key="DATABASE_URL",
        value=DATABASE_URL  # Railway PostgreSQL URL
    )
    print("Secret updated successfully!")

    print("Restarting Space...")
    api.restart_space("heathclif/monitoring-pemasaran")
    print("Space restarted successfully!")
except Exception as e:
    print(f"Error: {e}")
