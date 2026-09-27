from fastapi.testclient import TestClient

from app.main import app


def sample_payload() -> dict:
    return {
        "constraints": {
            "city": "北京",
            "startDate": "2026-10-01",
            "endDate": "2026-10-04",
            "days": 4,
            "partySize": 2,
            "groupBudgetCny": 3000,
            "interests": ["历史文化", "美食"],
            "pace": "适中",
            "transportModes": ["公交", "地铁", "步行"],
            "dailyWindow": "09:00–21:00",
        }
    }


def test_full_mvp_flow(tmp_path, monkeypatch):
    from app import db

    monkeypatch.setattr(db, "DATABASE_PATH", tmp_path / "test.db")
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}

        session = client.post(
            "/api/v1/sessions/anonymous",
            json={"device_id": "test-device"},
        )
        assert session.status_code == 200
        headers = {"X-Session-Token": session.json()["token"]}

        created = client.post("/api/v1/trips", json=sample_payload(), headers=headers)
        assert created.status_code == 201
        trip = created.json()
        assert trip["title"] == "北京4日游"
        assert len(trip["days"]) == 4
        assert trip["state"] == "DRAFT"

        early_start = client.post(f"/api/v1/trips/{trip['id']}/start", headers=headers)
        assert early_start.status_code == 409

        confirmed = client.post(f"/api/v1/trips/{trip['id']}/confirm", headers=headers)
        assert confirmed.status_code == 200
        assert confirmed.json()["state"] == "CONFIRMED"

        generated = client.post(f"/api/v1/trips/{trip['id']}/generate", headers=headers)
        assert generated.status_code == 200
        assert generated.json()["trip"]["state"] == "READY"

        started = client.post(f"/api/v1/trips/{trip['id']}/start", headers=headers)
        assert started.status_code == 200
        active_trip = started.json()
        assert active_trip["state"] == "ACTIVE"

        first_node = active_trip["days"][0]["nodes"][0]
        checked_in = client.post(
            f"/api/v1/trips/{trip['id']}/nodes/{first_node['id']}/check-in",
            headers=headers,
        )
        assert checked_in.status_code == 200
        assert checked_in.json()["node"]["status"] == "IN_PROGRESS"

        completed_node = client.post(
            f"/api/v1/trips/{trip['id']}/nodes/{first_node['id']}/status",
            headers=headers,
            json={"action": "COMPLETED"},
        )
        assert completed_node.status_code == 200
        assert completed_node.json()["node"]["status"] == "COMPLETED"

        replan = client.post(
            f"/api/v1/trips/{trip['id']}/replans",
            json={"message": "走得有点累，后面少走一点"},
            headers=headers,
        )
        assert replan.status_code == 201
        plan = replan.json()
        assert plan["walkingDeltaKm"] < 0

        applied = client.post(
            f"/api/v1/trips/{trip['id']}/replans/{plan['id']}/apply",
            headers=headers,
        )
        assert applied.status_code == 200
        assert applied.json()["version"] == 2

        undone = client.post(f"/api/v1/trips/{trip['id']}/undo", headers=headers)
        assert undone.status_code == 200
        assert undone.json()["version"] == 1

        finished = client.post(
            f"/api/v1/trips/{trip['id']}/complete",
            headers=headers,
            json={"note": "演示结束"},
        )
        assert finished.status_code == 200
        assert finished.json()["state"] == "COMPLETED"
        assert finished.json()["completionSummary"]["completedNodes"] == 1
