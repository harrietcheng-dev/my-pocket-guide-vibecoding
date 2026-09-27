from __future__ import annotations

from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .planner import apply_replan, build_replan, build_trip
from .schemas import (
    AnonymousSessionRequest,
    CompleteTripRequest,
    CreateTripRequest,
    NodeStatusRequest,
    ReplanRequest,
)


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
    device_id = payload.device_id or uuid4().hex
    existing = db.get_session_by_device(device_id)
    if existing and datetime.fromisoformat(existing["expires_at"]) > datetime.now(UTC):
        return existing
    now = datetime.now(UTC)
    return db.save_session(
        token=f"anon_{uuid4().hex}",
        device_id=device_id,
        expires_at=(now + timedelta(days=7)).isoformat(),
    )


@app.post("/api/v1/trips", status_code=201)
def create_trip(payload: CreateTripRequest, x_session_token: Annotated[str | None, Header()] = None) -> dict:
    session_token = require_session(x_session_token)
    trip = build_trip(payload.constraints.model_dump())
    trip["ownerToken"] = session_token
    return public_trip(db.save_trip(trip))


@app.get("/api/v1/trips")
def list_trips(x_session_token: Annotated[str | None, Header()] = None) -> list[dict]:
    return [public_trip(trip) for trip in db.list_trips(require_session(x_session_token))]


@app.get("/api/v1/trips/{trip_id}")
def get_trip(trip_id: str, x_session_token: Annotated[str | None, Header()] = None) -> dict:
    return public_trip(require_owned_trip(trip_id, require_session(x_session_token)))


@app.post("/api/v1/trips/{trip_id}/confirm")
def confirm_trip(trip_id: str, x_session_token: Annotated[str | None, Header()] = None) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"DRAFT"}, "只有草稿行程可以确认")
    trip["state"] = "CONFIRMED"
    return public_trip(db.save_trip(trip))


@app.post("/api/v1/trips/{trip_id}/generate")
def generate_trip(trip_id: str, x_session_token: Annotated[str | None, Header()] = None) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"CONFIRMED"}, "请先确认需求摘要")
    trip["state"] = "GENERATING"
    db.save_trip(trip)
    trip["state"] = "READY"
    db.save_trip(trip)
    return {"trip_id": trip_id, "state": "READY", "trip": public_trip(trip)}


@app.post("/api/v1/trips/{trip_id}/start")
def start_trip(trip_id: str, x_session_token: Annotated[str | None, Header()] = None) -> dict:
    session_token = require_session(x_session_token)
    trip = require_owned_trip(trip_id, session_token)
    require_state(trip, {"READY"}, "只有待出发行程可以开始")
    active_trip = next(
        (item for item in db.list_trips(session_token) if item["state"] == "ACTIVE" and item["id"] != trip_id),
        None,
    )
    if active_trip:
        raise HTTPException(status_code=409, detail="已有进行中行程，请先结束当前行程")
    trip["state"] = "ACTIVE"
    trip["startedAt"] = datetime.now(UTC).isoformat()
    return public_trip(db.save_trip(trip))


@app.post("/api/v1/trips/{trip_id}/nodes/{node_id}/check-in")
def check_in_node(
    trip_id: str,
    node_id: str,
    x_session_token: Annotated[str | None, Header()] = None,
) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"ACTIVE"}, "请先开始行程")
    node = require_node(trip, node_id)
    if node["status"] != "PLANNED":
        raise HTTPException(status_code=409, detail="只有未开始节点可以签到")
    for day in trip["days"]:
        for item in day["nodes"]:
            if item["status"] == "IN_PROGRESS":
                raise HTTPException(status_code=409, detail="请先完成或跳过当前节点")
    node["status"] = "IN_PROGRESS"
    node["checkedInAt"] = datetime.now(UTC).isoformat()
    db.save_trip(trip)
    return {"trip": public_trip(trip), "node": node}


@app.post("/api/v1/trips/{trip_id}/nodes/{node_id}/status")
def update_node_status(
    trip_id: str,
    node_id: str,
    payload: NodeStatusRequest,
    x_session_token: Annotated[str | None, Header()] = None,
) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"ACTIVE"}, "请先开始行程")
    node = require_node(trip, node_id)
    if payload.action == "COMPLETED" and node["status"] != "IN_PROGRESS":
        raise HTTPException(status_code=409, detail="节点签到后才能完成")
    if payload.action == "SKIPPED" and node["status"] not in {"PLANNED", "IN_PROGRESS"}:
        raise HTTPException(status_code=409, detail="当前节点不能跳过")
    node["status"] = payload.action
    node["finishedAt"] = datetime.now(UTC).isoformat()
    db.save_trip(trip)
    return {"trip": public_trip(trip), "node": node}


@app.post("/api/v1/trips/{trip_id}/complete")
def complete_trip(
    trip_id: str,
    payload: CompleteTripRequest,
    x_session_token: Annotated[str | None, Header()] = None,
) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"ACTIVE"}, "只有进行中行程可以结束")
    completed = 0
    skipped = 0
    for day in trip["days"]:
        for node in day["nodes"]:
            if node["status"] == "COMPLETED":
                completed += 1
            elif node["status"] == "SKIPPED":
                skipped += 1
            else:
                node["status"] = "SKIPPED"
                skipped += 1
    trip["state"] = "COMPLETED"
    trip["completedAt"] = datetime.now(UTC).isoformat()
    trip["completionSummary"] = {
        "completedNodes": completed,
        "skippedNodes": skipped,
        "note": payload.note,
    }
    return public_trip(db.save_trip(trip))


@app.post("/api/v1/trips/{trip_id}/replans", status_code=201)
def create_replan(
    trip_id: str,
    payload: ReplanRequest,
    x_session_token: Annotated[str | None, Header()] = None,
) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"ACTIVE"}, "只有进行中行程可以动态调整")
    replan = build_replan(trip, payload.message)
    REPLANS[replan["id"]] = replan
    return replan


@app.post("/api/v1/trips/{trip_id}/replans/{replan_id}/apply")
def confirm_replan(
    trip_id: str,
    replan_id: str,
    x_session_token: Annotated[str | None, Header()] = None,
) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    require_state(trip, {"ACTIVE"}, "只有进行中行程可以应用调整")
    replan = REPLANS.get(replan_id)
    if not replan or replan["tripId"] != trip_id:
        raise HTTPException(status_code=404, detail="调整方案不存在")
    return public_trip(db.save_trip(apply_replan(trip, replan)))


@app.post("/api/v1/trips/{trip_id}/undo")
def undo_replan(trip_id: str, x_session_token: Annotated[str | None, Header()] = None) -> dict:
    trip = require_owned_trip(trip_id, require_session(x_session_token))
    snapshot = trip.get("previousSnapshot")
    if not snapshot:
        raise HTTPException(status_code=409, detail="没有可撤销版本")
    restored = deepcopy(snapshot)
    restored.pop("previousSnapshot", None)
    return public_trip(db.save_trip(restored))


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


def require_session(token: str | None) -> str:
    session = db.get_session(token) if token else None
    if not session or datetime.fromisoformat(session["expires_at"]) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="匿名会话无效或已过期")
    return token


def require_owned_trip(trip_id: str, token: str) -> dict:
    trip = require_trip(trip_id)
    if trip.get("ownerToken") != token:
        raise HTTPException(status_code=403, detail="无权访问该行程")
    return trip


def require_state(trip: dict, allowed: set[str], message: str) -> None:
    if trip["state"] not in allowed:
        raise HTTPException(status_code=409, detail=message)


def require_node(trip: dict, node_id: str) -> dict:
    for day in trip["days"]:
        for node in day["nodes"]:
            if node["id"] == node_id:
                return node
    raise HTTPException(status_code=404, detail="行程节点不存在")


def public_trip(trip: dict) -> dict:
    result = deepcopy(trip)
    result.pop("ownerToken", None)
    if result.get("previousSnapshot"):
        result["previousSnapshot"].pop("ownerToken", None)
    return result
