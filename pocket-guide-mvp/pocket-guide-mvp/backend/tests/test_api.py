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
