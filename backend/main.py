import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from database import engine
from models import Base
from seed import init as seed_db
from routes import ingest, requests, audit, skybot

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


def wait_for_db(retries: int = 10, delay: int = 3):
    """Wait for the database to become available before starting up."""
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("Database is ready.")
            return
        except Exception as e:
            print(f"Waiting for database... attempt {attempt}/{retries} ({e})")
            time.sleep(delay)
    raise RuntimeError("Database not available after maximum retries.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    seed_db()
    yield


app = FastAPI(title="Bumblebee PoC API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(requests.router)
app.include_router(audit.router)
app.include_router(skybot.router)


@app.get("/health")
def health():
    return {"status": "ok"}