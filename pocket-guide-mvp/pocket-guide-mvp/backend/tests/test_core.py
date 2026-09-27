import tempfile
import unittest
from pathlib import Path

from app import db
from app.planner import apply_replan, build_replan, build_trip


class CoreFlowTest(unittest.TestCase):
    def test_create_replan_apply_and_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            original_path = db.DATABASE_PATH
            db.DATABASE_PATH = Path(directory) / "test.db"
            try:
                db.initialize()
                trip = build_trip(
                    {
                        "city": "北京",
                        "startDate": "2026-10-01",
                        "endDate": "2026-10-04",
                        "days": 4,
                        "partySize": 2,
                        "groupBudgetCny": 3000,
                        "interests": ["历史文化", "美食"],
                        "pace": "适中",
                    }
                )
                db.save_trip(trip)
                loaded = db.get_trip(trip["id"])
                self.assertEqual(loaded["title"], "北京4日游")
                self.assertEqual(len(loaded["days"]), 4)

                replan = build_replan(loaded, "走得有点累，后面少走一点")
                adjusted = apply_replan(loaded, replan)
                db.save_trip(adjusted)
                self.assertEqual(adjusted["version"], 2)
                self.assertLess(adjusted["days"][2]["walkDistanceKm"], loaded["days"][2]["walkDistanceKm"])

                restored = adjusted["previousSnapshot"]
                db.save_trip(restored)
                self.assertEqual(db.get_trip(trip["id"])["version"], 1)
            finally:
                db.DATABASE_PATH = original_path


if __name__ == "__main__":
    unittest.main()
