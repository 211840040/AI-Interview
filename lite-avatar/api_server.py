import os, base64, tempfile, subprocess, logging, asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from lite_avatar import liteAvatar
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LiteAvatar Video Generation API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])

DATA_DIR = "./sample_data"

# ✅ 移除全局 avatar 变量，改为线程池串行执行
executor = ThreadPoolExecutor(max_workers=1)


class GenerateRequest(BaseModel):
    audio: str


class GenerateResponse(BaseModel):
    video: str


def convert_audio_to_16k(input_bytes: bytes) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_in:
        tmp_in.write(input_bytes)
        tmp_in_path = tmp_in.name
    tmp_out_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    try:
        cmd = ["ffmpeg", "-i", tmp_in_path, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", "-y", tmp_out_path]
        subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        with open(tmp_out_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_in_path)
        if os.path.exists(tmp_out_path):
            os.unlink(tmp_out_path)


def _sync_generate(converted_audio: bytes) -> str:
    """每次调用都重新加载模型，彻底避免状态残留"""
    logger.info("Loading LiteAvatar model for this request...")
    local_avatar = liteAvatar(
        data_dir=DATA_DIR,
        num_threads=1,
        generate_offline=True,
        use_gpu=True
    )

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, "input.wav")
            with open(audio_path, "wb") as f:
                f.write(converted_audio)

            local_avatar.handle(audio_path, tmpdir)

            video_path = os.path.join(tmpdir, "test_demo.mp4")
            if not os.path.exists(video_path):
                raise RuntimeError("Video file not generated")

            with open(video_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
    finally:
        # ✅ 强制清理 GPU 显存和 Python 引用
        del local_avatar
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        logger.info("Model unloaded and GPU cache cleared.")


@app.post("/generate", response_model=GenerateResponse)
async def generate_video(request: GenerateRequest):
    try:
        audio_bytes = base64.b64decode(request.audio)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {str(e)}")

    try:
        converted_audio = convert_audio_to_16k(audio_bytes)
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg conversion error: {e.stderr}")
        raise HTTPException(status_code=400, detail="Audio conversion failed")

    loop = asyncio.get_event_loop()
    try:
        video_base64 = await loop.run_in_executor(executor, _sync_generate, converted_audio)
    except Exception as e:
        logger.exception("Video generation failed")
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")

    return GenerateResponse(video=video_base64)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5001)