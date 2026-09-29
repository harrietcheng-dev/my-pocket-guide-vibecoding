import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from app import db
from app.planner import apply_replan, build_replan, build_trip, cancel_trip, check_in_trip, complete_trip_node, preview_trip_edits
from app.schemas import TripConstraints


class CoreFlowTest(unittest.TestCase):
    def test_trip_constraints_normalize_days_and_reject_invalid_windows(self):
        constraints = TripConstraints(
            city="北京",
            startDate="2026-10-01",
            endDate="2026-10-04",
            days=1,
            partySize=2,
            groupBudgetCny=3000,
            dailyStart="09:00",
            dailyEnd="21:00",
        )
        self.assertEqual(constraints.days, 4)
        self.assertEqual(constraints.dailyWindow, "09:00–21:00")

        with self.assertRaises(ValidationError):
            TripConstraints(
                city="北京",
                startDate="2026-10-01",
                endDate="2026-10-09",
                partySize=2,
                groupBudgetCny=3000,
            )

        with self.assertRaises(ValidationError):
            TripConstraints(
                city="北京",
                startDate="2026-10-01",
                endDate="2026-10-04",
                partySize=2,
                groupBudgetCny=3000,
                dailyStart="21:00",
                dailyEnd="09:00",
            )

    def test_node_state_moves_forward_without_regression(self):
        trip = build_trip({"city": "北京", "days": 1})
        first = trip["days"][0]["nodes"][0]
        second = trip["days"][0]["nodes"][1]

        active, checked = check_in_trip(trip, first["id"])
        self.assertEqual(checked["status"], "IN_PROGRESS")
        self.assertEqual(active["state"], "ACTIVE")

        advanced, checked = check_in_trip(active, second["id"])
        self.assertEqual(advanced["days"][0]["nodes"][0]["status"], "COMPLETED")
        self.assertEqual(checked["status"], "IN_PROGRESS")

        completed, node = complete_trip_node(advanced, second["id"])
        self.assertEqual(node["status"], "COMPLETED")
        unchanged, old_node = check_in_trip(completed, first["id"])
        self.assertEqual(old_node["status"], "COMPLETED")
        self.assertEqual(unchanged["days"][0]["nodes"][0]["status"], "COMPLETED")

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

    def test_replan_never_replaces_completed_node(self):
        trip = build_trip({"city": "北京", "days": 4})
        protected = trip["days"][2]["nodes"][2]
        protected["status"] = "COMPLETED"
        replan = build_replan(trip, "走累了，后面少走一点")

        adjusted = apply_replan(trip, replan)

        self.assertEqual(adjusted["days"][2]["nodes"][2]["name"], "圆明园")
        self.assertEqual(adjusted["days"][2]["nodes"][2]["status"], "COMPLETED")

    def test_completing_last_node_finishes_trip_and_blocks_more_check_ins(self):
        trip = build_trip({"city": "北京", "days": 1})
        nodes = trip["days"][0]["nodes"]
        for node in nodes[:-1]:
            node["status"] = "COMPLETED"
        nodes[-1]["status"] = "IN_PROGRESS"

        completed, node = complete_trip_node(trip, nodes[-1]["id"])

        self.assertEqual(node["status"], "COMPLETED")
        self.assertEqual(completed["state"], "COMPLETED")
        with self.assertRaisesRegex(ValueError, "行程已结束"):
            check_in_trip(completed, nodes[0]["id"])

    def test_manual_edits_preview_recalculates_schedule_and_preserves_snapshot(self):
        trip = build_trip({"city": "北京", "days": 1, "dailyStart": "09:00", "dailyEnd": "21:00"})
        nodes = trip["days"][0]["nodes"]
        operations = [
            {"action": "move", "dayIndex": 1, "nodeId": nodes[-1]["id"], "targetIndex": 0},
            {
                "action": "replace",
                "dayIndex": 1,
                "nodeId": nodes[1]["id"],
                "node": {
                    "name": "中国美术馆",
                    "type": "景点",
                    "durationMin": 90,
                    "costRange": [0, 20],
                    "reason": "用户希望增加艺术体验",
                    "latitude": 39.925,
                    "longitude": 116.41,
                },
            },
            {
                "action": "add",
                "dayIndex": 1,
                "targetIndex": 4,
                "node": {
                    "name": "晚餐区域",
                    "type": "餐饮",
                    "durationMin": 60,
                    "costRange": [80, 120],
                    "reason": "补充晚餐时间",
                },
            },
        ]

        candidate, changes = preview_trip_edits(trip, operations)

        self.assertEqual(candidate["version"], 2)
        self.assertEqual(candidate["previousSnapshot"]["version"], 1)
        self.assertEqual(candidate["days"][0]["nodes"][0]["name"], "景山公园")
        self.assertIn("中国美术馆", [node["name"] for node in candidate["days"][0]["nodes"]])
        self.assertEqual(candidate["days"][0]["nodes"][-1]["name"], "晚餐区域")
        self.assertEqual(candidate["days"][0]["nodes"][0]["time"], "09:00")
        self.assertEqual(len(changes), 3)

    def test_manual_edits_cannot_change_started_nodes(self):
        trip = build_trip({"city": "北京", "days": 1})
        node = trip["days"][0]["nodes"][0]
        node["status"] = "IN_PROGRESS"

        with self.assertRaisesRegex(ValueError, "不能修改"):
            preview_trip_edits(trip, [{"action": "delete", "dayIndex": 1, "nodeId": node["id"]}])

    def test_cancelling_trip_preserves_completed_nodes_and_closes_remaining_nodes(self):
        trip = build_trip({"city": "北京", "days": 1})
        nodes = trip["days"][0]["nodes"]
        nodes[0]["status"] = "COMPLETED"
        nodes[1]["status"] = "IN_PROGRESS"

        cancelled = cancel_trip(trip)

        self.assertEqual(cancelled["state"], "CANCELLED")
        self.assertEqual(cancelled["days"][0]["nodes"][0]["status"], "COMPLETED")
        self.assertTrue(all(node["status"] in {"COMPLETED", "CANCELLED"} for node in cancelled["days"][0]["nodes"]))
        self.assertNotEqual(trip["state"], "CANCELLED")

        completed = build_trip({"city": "北京", "days": 1})
        completed["state"] = "COMPLETED"
        with self.assertRaisesRegex(ValueError, "不能取消"):
            cancel_trip(completed)


if __name__ == "__main__":
    unittest.main()
