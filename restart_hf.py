import os
import sys

# Ensure huggingface_hub is ready
try:
    from huggingface_hub import HfApi
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "huggingface_hub"])
    from huggingface_hub import HfApi

api = HfApi(token="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")

try:
    print("Checking repository info...")
    space_info = api.space_info(repo_id="heathclif/monitoring-pemasaran")
    print(f"Space status: {space_info.runtime.stage}")
    
    print("Force Restarting Space...")
    api.restart_space("heathclif/monitoring-pemasaran")
    print("Space restarted successfully!")
except Exception as e:
    print(f"Error: {e}")
