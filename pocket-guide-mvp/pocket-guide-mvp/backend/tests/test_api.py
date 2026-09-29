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

        created = client.post("/api/v1/trips", json=sample_payload())
        assert created.status_code == 201
        trip = created.json()
        assert trip["title"] == "北京4日游"
        assert len(trip["days"]) == 4

        first_node = trip["days"][0]["nodes"][0]
        node = trip["days"][0]["nodes"][1]
        first_check_in = client.post(
            f"/api/v1/trips/{trip['id']}/nodes/{first_node['id']}/check-in",
            json={"manual": True},
        )
        assert first_check_in.status_code == 200
        checked_in = client.post(
            f"/api/v1/trips/{trip['id']}/nodes/{node['id']}/check-in",
            json={"manual": True},
        )
        assert checked_in.status_code == 200
        assert checked_in.json()["node"]["status"] == "IN_PROGRESS"
        assert checked_in.json()["trip"]["days"][0]["nodes"][0]["status"] == "COMPLETED"
        assert checked_in.json()["guide"]["durationSec"] >= 30

        completed = client.post(f"/api/v1/trips/{trip['id']}/nodes/{node['id']}/complete")
        assert completed.status_code == 200
        assert completed.json()["node"]["status"] == "COMPLETED"

        answer = client.post(
            f"/api/v1/conversations/{trip['id']}/messages",
            json={"text": "走累了，后面少走一点", "node_id": node["id"]},
        )
        assert answer.status_code == 200
        assert answer.json()["action"] == "replan"

        nearby = client.get("/api/v1/nearby", params={"category": "医院"})
        assert nearby.status_code == 200
        assert nearby.json()["items"][0]["type"] == "正规医院"
        assert isinstance(nearby.json()["items"][0]["latitude"], float)
        assert isinstance(nearby.json()["items"][0]["longitude"], float)

        replan = client.post(
            f"/api/v1/trips/{trip['id']}/replans",
            json={"message": "走得有点累，后面少走一点"},
        )
        assert replan.status_code == 201
        plan = replan.json()
        assert plan["walkingDeltaKm"] < 0

        applied = client.post(f"/api/v1/trips/{trip['id']}/replans/{plan['id']}/apply")
        assert applied.status_code == 200
        assert applied.json()["version"] == 2

        undone = client.post(f"/api/v1/trips/{trip['id']}/undo")
        assert undone.status_code == 200
        assert undone.json()["version"] == 1
