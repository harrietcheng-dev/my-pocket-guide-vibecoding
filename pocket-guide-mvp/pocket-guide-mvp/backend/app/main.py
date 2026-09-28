from __future__ import annotations

from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .planner import apply_replan, build_replan, build_trip
from .schemas import (
    AnonymousSessionRequest,
    CheckInRequest,
    ConversationMessageRequest,
    CreateTripRequest,
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


@app.post("/api/v1/trips/{trip_id}/nodes/{node_id}/check-in")
def check_in_node(trip_id: str, node_id: str, payload: CheckInRequest) -> dict:
    trip = require_trip(trip_id)
    checked_node = None
    for day in trip.get("days", []):
        for node in day.get("nodes", []):
            if node.get("id") == node_id:
                node["status"] = "IN_PROGRESS"
                node["checkInMode"] = "MANUAL" if payload.manual else "LOCATION"
                checked_node = node
            elif node.get("status") == "IN_PROGRESS":
                node["status"] = "PLANNED"
    if not checked_node:
        raise HTTPException(status_code=404, detail="行程节点不存在")
    trip["state"] = "ACTIVE"
    db.save_trip(trip)
    return {
        "trip": trip,
        "node": checked_node,
        "guide": guide_for_place(checked_node.get("name", "当前景点")),
    }


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


@app.get("/api/v1/places/{place_id}/guide")
def get_place_guide(place_id: str, name: str | None = None, depth: str = "short") -> dict:
    guide = guide_for_place(name or place_id)
    if depth == "detail":
        guide["text"] += " 参观时可以留意建筑轴线、屋顶形制和空间层次，它们共同体现了中国古代宫殿建筑对秩序与礼制的表达。"
        guide["durationSec"] = 58
    return guide


@app.get("/api/v1/nearby")
def nearby(category: str = "休息", latitude: float | None = None, longitude: float | None = None) -> dict:
    samples = {
        "美食": [("简餐与茶歇", "餐饮", 320), ("故宫角楼咖啡", "餐饮", 680)],
        "卫生间": [("公共卫生间", "公共设施", 180), ("游客中心卫生间", "公共设施", 460)],
        "休息": [("游客休息区", "休息点", 120), ("东华门休息点", "休息点", 520)],
        "医院": [("北京医院", "正规医院", 2100), ("协和医院东单院区", "正规医院", 2800)],
        "交通": [("东华门公交站", "公交站", 410), ("金鱼胡同地铁站", "地铁站", 960)],
    }
    items = [
        {"id": f"{category}-{index}", "name": item[0], "type": item[1], "distanceM": item[2]}
        for index, item in enumerate(samples.get(category, samples["休息"]), start=1)
    ]
    return {"category": category, "items": items, "locationUsed": latitude is not None and longitude is not None}


@app.post("/api/v1/conversations/{trip_id}/messages")
def send_conversation_message(trip_id: str, payload: ConversationMessageRequest) -> dict:
    trip = require_trip(trip_id)
    text = payload.text.strip()
    if any(keyword in text for keyword in ("不舒服", "胸痛", "受伤", "危险", "报警")):
        reply = "如果你或同行者身体不适或遇到危险，请尽快联系 120、110 或附近正规机构。我可以帮你查看附近医院，但不能代替专业诊断或安全判断。"
        action = "nearby_hospital"
    elif any(keyword in text for keyword in ("累", "少走", "下雨", "早点结束", "不想去")):
        reply = "可以。我会保留已经完成和正在进行的节点，只调整后续安排。先为你生成变化摘要，确认后才会应用。"
        action = "replan"
    elif "卫生间" in text:
        reply = "可以，已为你准备附近卫生间列表。距离为演示数据，正式接入地图后会按当前位置刷新。"
        action = "nearby_toilet"
    else:
        node_name = next((node.get("name") for day in trip.get("days", []) for node in day.get("nodes", []) if node.get("id") == payload.node_id), "当前景点")
        reply = f"关于{node_name}：{guide_for_place(node_name)['text']} 你也可以问开放时间、参观重点或接下来怎么走。"
        action = None
    return {"id": str(uuid4()), "reply": reply, "action": action, "createdAt": datetime.now(UTC).isoformat()}


def guide_for_place(name: str) -> dict:
    guides = {
        "故宫博物院": "这里是故宫博物院，始建于明永乐年间，曾是明清两代皇宫。参观时建议先看中轴线三大殿，再按体力选择东西六宫。",
        "天安门广场": "天安门广场位于北京中轴线核心位置。清晨到达视野更开阔，也便于衔接故宫参观。",
        "天坛公园": "天坛是明清两代皇帝祭天祈谷的场所，祈年殿与回音壁是最具代表性的参观点。",
        "颐和园": "颐和园以昆明湖和万寿山为主体，是保存较完整的皇家园林。路线较长，建议量力安排步行。",
    }
    return {
        "title": f"{name}短讲解",
        "text": guides.get(name, f"{name}是本次行程的重要一站。我会结合已审核资料介绍核心看点，并把开放信息标记为待复核。"),
        "durationSec": 42,
        "sourceTitle": "团队审核文旅资料（比赛演示）",
        "fetchedAt": "2026-09-27",
        "confidence": "PARTIAL",
    }


def require_trip(trip_id: str) -> dict:
    trip = db.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="行程不存在")
    return trip
