from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import uuid4


def make_node(
    time: str,
    name: str,
    node_type: str,
    cost: int,
    duration_min: int,
    longitude: float,
    latitude: float,
    reason: str,
) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "time": time,
        "name": name,
        "type": node_type,
        "costRange": [cost, cost + max(20, round(cost * 0.25))],
        "durationMin": duration_min,
        "longitude": longitude,
        "latitude": latitude,
        "reason": reason,
        "status": "PLANNED",
        "evidence": {"confidence": "PARTIAL", "fetchedAt": "演示数据"},
    }


def build_trip(constraints: dict[str, Any]) -> dict[str, Any]:
    city = constraints.get("city", "北京")
    trip_id = str(uuid4())
    days = _beijing_days()
    requested_days = max(1, min(int(constraints.get("days", 4)), 7))
    if requested_days < len(days):
        days = days[:requested_days]
    elif requested_days > len(days):
        for index in range(len(days) + 1, requested_days + 1):
            days.append(
                {
                    "dayIndex": index,
                    "dateLabel": f"Day {index}",
                    "walkDistanceKm": 3.0,
                    "nodes": [
                        make_node("10:00", f"{city}自由探索", "景点", 0, 180, 116.397, 39.908, "根据兴趣保留自由时间")
                    ],
                }
            )
    return {
        "id": trip_id,
        "state": "DRAFT",
        "version": 1,
        "title": f"{city}{requested_days}日游",
        "constraints": constraints,
        "costSummary": {
            "tickets": [360, 460],
            "food": [720, 960],
            "transport": [180, 260],
            "other": [80, 160],
            "total": [1340, 1840],
        },
        "days": days,
        "validationSummary": {
            "routeChecked": True,
            "budgetChecked": True,
            "unverifiedFields": ["部分临时公告请出发前复核"],
        },
    }


def build_replan(trip: dict[str, Any], message: str) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "tripId": trip["id"],
        "request": message,
        "summary": "保留已完成节点，减少后续步行并增加休息时间",
        "changes": [
            "将圆明园替换为国家博物馆室内参观",
            "增加 45 分钟休息时间",
            "预计步行减少 3.2 公里",
            "预计费用增加 20–45 元",
        ],
        "walkingDeltaKm": -3.2,
        "costDelta": [20, 45],
    }


def apply_replan(trip: dict[str, Any], replan: dict[str, Any]) -> dict[str, Any]:
    updated = deepcopy(trip)
    snapshot = deepcopy(trip)
    snapshot.pop("previousSnapshot", None)
    updated["previousSnapshot"] = snapshot
    updated["version"] += 1
    updated["lastAdjustment"] = replan["summary"]
    if len(updated["days"]) >= 3 and len(updated["days"][2]["nodes"]) >= 3:
        updated["days"][2]["walkDistanceKm"] = 2.9
        updated["days"][2]["nodes"][2] = make_node(
            "15:00", "国家博物馆", "景点", 0, 180, 116.4010, 39.9036, "减少步行并改为室内参观"
        )
    return updated


def _beijing_days() -> list[dict[str, Any]]:
    return [
        {
            "dayIndex": 1,
            "dateLabel": "Day 1",
            "walkDistanceKm": 5.6,
            "nodes": [
                make_node("08:30", "天安门广场", "景点", 0, 90, 116.3975, 39.9087, "城市地标，适合清晨到达"),
                make_node("10:10", "故宫博物院", "景点", 120, 210, 116.3970, 39.9180, "历史文化核心地点，需提前预约"),
                make_node("13:00", "午餐区域", "餐饮", 80, 100, 116.4050, 39.9200, "优先选择附近平价餐饮"),
                make_node("14:30", "景山公园", "景点", 20, 90, 116.3966, 39.9250, "俯瞰故宫中轴线"),
            ],
        },
        {
            "dayIndex": 2,
            "dateLabel": "Day 2",
            "walkDistanceKm": 4.2,
            "nodes": [
                make_node("09:00", "天坛公园", "景点", 34, 150, 116.4173, 39.8822, "体验古代祭祀建筑群"),
                make_node("12:00", "午餐区域", "餐饮", 90, 90, 116.4250, 39.8890, "安排休息，避免连续步行"),
                make_node("14:00", "国家博物馆", "景点", 0, 180, 116.4010, 39.9036, "室内文化体验，需预约"),
            ],
        },
        {
            "dayIndex": 3,
            "dateLabel": "Day 3",
            "walkDistanceKm": 6.1,
            "nodes": [
                make_node("08:30", "颐和园", "景点", 30, 210, 116.2732, 39.9999, "皇家园林与湖景"),
                make_node("13:30", "午餐与休息", "休息", 80, 90, 116.2900, 39.9900, "预留恢复体力时间"),
                make_node("15:20", "圆明园", "景点", 25, 150, 116.3036, 40.0081, "历史遗址与园林空间"),
            ],
        },
        {
            "dayIndex": 4,
            "dateLabel": "Day 4",
            "walkDistanceKm": 3.8,
            "nodes": [
                make_node("09:30", "什刹海", "景点", 0, 120, 116.3850, 39.9402, "轻松城市漫步"),
                make_node("12:00", "午餐区域", "餐饮", 100, 90, 116.3900, 39.9350, "体验北京风味"),
                make_node("14:00", "南锣鼓巷", "景点", 0, 120, 116.4030, 39.9370, "街区漫步与伴手礼"),
            ],
        },
    ]
