from __future__ import annotations

from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .planner import apply_replan, build_replan, build_trip
from .schemas import AnonymousSessionRequest, CreateTripRequest, ReplanRequest


REPLANS: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.initialize()
    yield


app = FastAPI(
    title="我的口袋导游 MVP API",
    version="0.1.0",
    description="微信小程序 MVP 的行程、地图与动态调整接口",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/sessions/anonymous")
def create_anonymous_session(payload: AnonymousSessionRequest) -> dict:
    now = datetime.now(UTC)
    return {
        "token": f"anon_{uuid4().hex}",
        "device_id": payload.device_id,
        "expires_at": (now + timedelta(days=7)).isoformat(),
    }


@app.post("/api/v1/trips", status_code=201)
def create_trip(payload: CreateTripRequest) -> dict:
    trip = build_trip(payload.constraints.model_dump())
    return db.save_trip(trip)


@app.get("/api/v1/trips")
def list_trips() -> list[dict]:
    return db.list_trips()


@app.get("/api/v1/trips/{trip_id}")
def get_trip(trip_id: str) -> dict:
    return require_trip(trip_id)


@app.post("/api/v1/trips/{trip_id}/confirm")
def confirm_trip(trip_id: str) -> dict:
    trip = require_trip(trip_id)
    trip["state"] = "CONFIRMED"
    return db.save_trip(trip)


@app.post("/api/v1/trips/{trip_id}/generate")
def generate_trip(trip_id: str) -> dict:
    trip = require_trip(trip_id)
    trip["state"] = "READY"
    db.save_trip(trip)
    return {"trip_id": trip_id, "state": "READY", "trip": trip}


@app.post("/api/v1/trips/{trip_id}/start")
def start_trip(trip_id: str) -> dict:
    trip = require_trip(trip_id)
    trip["state"] = "ACTIVE"
    return db.save_trip(trip)


@app.post("/api/v1/trips/{trip_id}/replans", status_code=201)
def create_replan(trip_id: str, payload: ReplanRequest) -> dict:
    trip = require_trip(trip_id)
    replan = build_replan(trip, payload.message)
    REPLANS[replan["id"]] = replan
    return replan


@app.post("/api/v1/trips/{trip_id}/replans/{replan_id}/apply")
def confirm_replan(trip_id: str, replan_id: str) -> dict:
    trip = require_trip(trip_id)
    replan = REPLANS.get(replan_id)
    if not replan or replan["tripId"] != trip_id:
        raise HTTPException(status_code=404, detail="调整方案不存在")
    return db.save_trip(apply_replan(trip, replan))


@app.post("/api/v1/trips/{trip_id}/undo")
def undo_replan(trip_id: str) -> dict:
    trip = require_trip(trip_id)
    snapshot = trip.get("previousSnapshot")
    if not snapshot:
        raise HTTPException(status_code=409, detail="没有可撤销版本")
    restored = deepcopy(snapshot)
    restored.pop("previousSnapshot", None)
    return db.save_trip(restored)


@app.get("/api/v1/cities/search")
def search_cities(q: str = "") -> list[dict]:
    cities = [
        {"code": "110000", "name": "北京", "deep_content": True},
        {"code": "610100", "name": "西安", "deep_content": True},
        {"code": "330100", "name": "杭州", "deep_content": True},
    ]
    return [city for city in cities if q.lower() in city["name"].lower()]


def require_trip(trip_id: str) -> dict:
    trip = db.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="行程不存在")
    return trip
