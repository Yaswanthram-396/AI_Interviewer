from fastapi import FastAPI
from pydantic import BaseModel
import requests

app = FastAPI()

class MsgIn(BaseModel):
    prompt: str

MODEL_NAME = "gemma:2b"

@app.on_event("startup")
def warmup_model():
    """Warm up Gemma model once during startup."""
    try:
        requests.post("http://localhost:11434/api/generate", json={"model": MODEL_NAME, "prompt": "Hello!"}, timeout=10)
        print("✅ Gemma model warmed up.")
    except Exception as e:
        print(f"⚠️ Warmup failed: {e}")

@app.post("/gemma")
async def chat(msg: MsgIn):
    try:
        payload = {
            "model": MODEL_NAME,
            "prompt": msg.prompt,
            "stream": False
        }
        res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=30)
        res.raise_for_status()

        output = res.json().get("response", "").strip()
        return {"response": output or "No response from Gemma."}
    except Exception as e:
        return {"response": f"Error: {str(e)}"}
