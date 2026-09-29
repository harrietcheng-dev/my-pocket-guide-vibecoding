from __future__ import annotations

from copy import deepcopy
from datetime import time
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
        "state": "READY",
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


def check_in_trip(trip: dict[str, Any], node_id: str, manual: bool = True) -> tuple[dict[str, Any], dict[str, Any]]:
    updated = deepcopy(trip)
    if updated.get("state") == "COMPLETED":
        raise ValueError("行程已结束，不能继续签到")
    if updated.get("state") == "CANCELLED":
        raise ValueError("行程已取消，不能继续签到")
    nodes = [node for day in updated.get("days", []) for node in day.get("nodes", [])]
    target_index = next((index for index, node in enumerate(nodes) if node.get("id") == node_id), None)
    if target_index is None:
        raise LookupError("行程节点不存在")
    target = nodes[target_index]
    if target.get("status") in {"SKIPPED", "CANCELLED"}:
        raise ValueError("该节点已跳过或取消，不能签到")
    active_index = next((index for index, node in enumerate(nodes) if node.get("status") == "IN_PROGRESS"), None)
    if active_index is not None and active_index != target_index:
        if active_index > target_index:
            raise ValueError("后续节点正在进行，不能回退签到")
        nodes[active_index]["status"] = "COMPLETED"
    if target.get("status") != "COMPLETED":
        target["status"] = "IN_PROGRESS"
        target["checkInMode"] = "MANUAL" if manual else "LOCATION"
    updated["state"] = "ACTIVE"
    return updated, target


def complete_trip_node(trip: dict[str, Any], node_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    updated = deepcopy(trip)
    nodes = [item for day in updated.get("days", []) for item in day.get("nodes", [])]
    node = next((item for item in nodes if item.get("id") == node_id), None)
    if not node:
        raise LookupError("行程节点不存在")
    if node.get("status") != "IN_PROGRESS":
        raise ValueError("只有正在进行的节点可以完成")
    node["status"] = "COMPLETED"
    if nodes and all(item.get("status") in {"COMPLETED", "SKIPPED", "CANCELLED"} for item in nodes):
        updated["state"] = "COMPLETED"
    return updated, node


def cancel_trip(trip: dict[str, Any]) -> dict[str, Any]:
    updated = deepcopy(trip)
    if updated.get("state") == "COMPLETED":
        raise ValueError("已完成的行程不能取消")
    if updated.get("state") == "CANCELLED":
        return updated
    for day in updated.get("days", []):
        for node in day.get("nodes", []):
            if node.get("status") in {"PLANNED", "IN_PROGRESS"}:
                node["status"] = "CANCELLED"
    updated["state"] = "CANCELLED"
    return updated


def preview_trip_edits(trip: dict[str, Any], operations: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    if trip.get("state") in {"COMPLETED", "CANCELLED"}:
        raise ValueError("已结束或取消的行程不能编辑")
    updated = deepcopy(trip)
    snapshot = deepcopy(trip)
    snapshot.pop("previousSnapshot", None)
    changes: list[str] = []
    affected_days: set[int] = set()

    for operation in operations:
        day_index = int(operation["dayIndex"])
        day = next((item for item in updated.get("days", []) if int(item.get("dayIndex", 0)) == day_index), None)
        if not day:
            raise LookupError(f"第 {day_index} 天不存在")
        nodes = day.get("nodes", [])
        action = operation["action"]
        node_id = operation.get("nodeId")
        node_index = next((index for index, item in enumerate(nodes) if item.get("id") == node_id), None)

        if action in {"replace", "delete", "move"}:
            if node_index is None:
                raise LookupError("要编辑的行程节点不存在")
            if nodes[node_index].get("status") != "PLANNED":
                raise ValueError("已完成或正在进行的节点不能修改")

        if action == "delete":
            if len(nodes) <= 1:
                raise ValueError("每天至少保留一个行程节点")
            removed = nodes.pop(node_index)
            changes.append(f"删除第 {day_index} 天的{removed['name']}")
        elif action == "move":
            target_index = operation.get("targetIndex")
            if target_index is None:
                raise ValueError("移动节点缺少目标位置")
            locked_count = len([item for item in nodes if item.get("status") != "PLANNED"])
            if int(target_index) < locked_count:
                raise ValueError("不能把未开始节点移动到已发生行程之前")
            moved = nodes.pop(node_index)
            bounded_index = max(0, min(int(target_index), len(nodes)))
            nodes.insert(bounded_index, moved)
            changes.append(f"调整第 {day_index} 天{moved['name']}的顺序")
        elif action == "replace":
            replacement = operation.get("node")
            if not replacement:
                raise ValueError("替换节点缺少新地点信息")
            original = nodes[node_index]
            nodes[node_index] = _editable_node(replacement, original)
            changes.append(f"将第 {day_index} 天的{original['name']}替换为{nodes[node_index]['name']}")
        elif action == "add":
            addition = operation.get("node")
            if not addition:
                raise ValueError("新增节点缺少地点信息")
            target_index = operation.get("targetIndex")
            locked_count = len([item for item in nodes if item.get("status") != "PLANNED"])
            insert_at = len(nodes) if target_index is None else max(locked_count, min(int(target_index), len(nodes)))
            nearby = nodes[max(0, min(insert_at - 1, len(nodes) - 1))] if nodes else {}
            nodes.insert(insert_at, _editable_node(addition, nearby, new_id=True))
            changes.append(f"在第 {day_index} 天新增{nodes[insert_at]['name']}")
        else:
            raise ValueError("不支持的编辑操作")
        affected_days.add(day_index)

    for day in updated.get("days", []):
        if int(day.get("dayIndex", 0)) in affected_days:
            _recalculate_day(day, updated.get("constraints", {}))
    updated["costSummary"] = _recalculate_cost_summary(updated)
    updated["previousSnapshot"] = snapshot
    updated["version"] = int(updated.get("version", 1)) + 1
    updated["lastAdjustment"] = f"手动编辑了 {len(changes)} 处安排"
    return updated, changes


def _editable_node(payload: dict[str, Any], original: dict[str, Any], new_id: bool = False) -> dict[str, Any]:
    cost_range = [float(value) for value in payload.get("costRange", [0, 0])]
    if len(cost_range) != 2 or cost_range[0] < 0 or cost_range[1] < cost_range[0]:
        raise ValueError("费用区间不合法")
    name = str(payload["name"]).strip()
    if not name:
        raise ValueError("地点名称不能为空")
    return {
        "id": str(uuid4()) if new_id else original.get("id", str(uuid4())),
        "time": original.get("time", "09:00"),
        "name": name,
        "type": payload.get("type", "景点"),
        "costRange": cost_range,
        "durationMin": int(payload.get("durationMin", 90)),
        "longitude": payload.get("longitude") if payload.get("longitude") is not None else original.get("longitude", 116.397),
        "latitude": payload.get("latitude") if payload.get("latitude") is not None else original.get("latitude", 39.908),
        "reason": payload.get("reason") or "用户手动调整",
        "status": "PLANNED",
        "evidence": {"confidence": "UNVERIFIED", "fetchedAt": "用户手动编辑"},
    }


def _recalculate_day(day: dict[str, Any], constraints: dict[str, Any]) -> None:
    start_value = constraints.get("dailyStart", "09:00")
    end_value = constraints.get("dailyEnd", "21:00")
    start = time.fromisoformat(start_value)
    end = time.fromisoformat(end_value)
    cursor = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    for index, node in enumerate(day.get("nodes", [])):
        if node.get("status") == "PLANNED":
            node["time"] = f"{cursor // 60:02d}:{cursor % 60:02d}"
        else:
            fixed_time = time.fromisoformat(node.get("time", start_value))
            cursor = max(cursor, fixed_time.hour * 60 + fixed_time.minute)
        cursor += int(node.get("durationMin", 90))
        if index < len(day["nodes"]) - 1:
            cursor += 30
    if cursor > end_minutes:
        raise ValueError(f"{day.get('dateLabel', '当日')} 调整后超出每日结束时间")
    day["walkDistanceKm"] = round(max(1.2, len(day.get("nodes", [])) * 1.25), 1)


def _recalculate_cost_summary(trip: dict[str, Any]) -> dict[str, list[float]]:
    totals = {"tickets": [0.0, 0.0], "food": [0.0, 0.0], "transport": [0.0, 0.0], "other": [0.0, 0.0]}
    for day in trip.get("days", []):
        for node in day.get("nodes", []):
            category = "food" if node.get("type") == "餐饮" else "transport" if node.get("type") == "交通" else "tickets" if node.get("type") == "景点" else "other"
            values = node.get("costRange", [0, 0])
            totals[category][0] += float(values[0])
            totals[category][1] += float(values[1])
    total = [sum(value[0] for value in totals.values()), sum(value[1] for value in totals.values())]
    return {**totals, "total": total}


def apply_replan(trip: dict[str, Any], replan: dict[str, Any]) -> dict[str, Any]:
    updated = deepcopy(trip)
    snapshot = deepcopy(trip)
    snapshot.pop("previousSnapshot", None)
    updated["previousSnapshot"] = snapshot
    updated["version"] += 1
    updated["lastAdjustment"] = replan["summary"]
    replaced = False
    for day in updated.get("days", []):
        for index, node in enumerate(day.get("nodes", [])):
            if node.get("name") == "圆明园" and node.get("status") == "PLANNED":
                day["walkDistanceKm"] = max(0, round(float(day.get("walkDistanceKm", 0)) - 3.2, 1))
                day["nodes"][index] = make_node(
                    "15:00", "国家博物馆", "景点", 0, 180, 116.4010, 39.9036, "减少步行并改为室内参观"
                )
                replaced = True
                break
        if replaced:
            break
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
