from huggingface_hub import HfApi
api = HfApi(token="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")

# Update Secret
try:
    print("Updating Secret DATABASE_URL...")
    api.add_space_secret(
        repo_id="heathclif/monitoring-pemasaran",
        key="DATABASE_URL",
        value="postgresql://postgres.azomqppnodduqhmbujxv:Sambalpedas1%40@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
    )
    print("Secret updated successfully!")
    
    print("Restarting Space...")
    api.restart_space("heathclif/monitoring-pemasaran")
    print("Space restarted successfully!")
except Exception as e:
    print(f"Error: {e}")
