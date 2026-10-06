from __future__ import annotations

import unittest

from backend.app.services.location_workspace import build_workspace, haversine_km


class LocationWorkspaceTests(unittest.TestCase):
    def test_haversine_orders_nearby_first(self) -> None:
        center = {"lat": 28.6, "lng": 77.2}
        self.assertLess(haversine_km(center, {"lat": 28.61, "lng": 77.21}), haversine_km(center, {"lat": 29.0, "lng": 78.0}))

    def test_workspace_groups_everything_for_location(self) -> None:
        state = {
            "alerts": [
                {"id": "A1", "level": "critical", "status": "open", "coordinates": {"lat": 28.6, "lng": 77.2}},
                {"id": "A2", "level": "medium", "status": "resolved", "coordinates": {"lat": 28.6, "lng": 77.2}},
                {"id": "FAR", "level": "high", "status": "open", "coordinates": {"lat": 10.0, "lng": 10.0}},
            ],
            "cameras": [{"id": "C1", "status": "offline", "coordinates": {"lat": 28.601, "lng": 77.201}}],
            "guards": [{"id": "G1", "currentSector": "Alpha"}],
            "communities": [{"id": "COMM1", "coordinates": {"lat": 28.6, "lng": 77.2}}],
            "resources": [],
            "infrastructure": [],
            "roads": [{"id": "R1", "points": [{"lat": 28.6, "lng": 77.2}, {"lat": 28.61, "lng": 77.21}]}],
            "activityLog": [{"id": "LOG1"}],
        }
        workspace = build_workspace(state, 28.6, 77.2, radius_km=5, limit=10)
        self.assertEqual(workspace["summary"]["openAlerts"], 1)
        self.assertEqual(workspace["summary"]["criticalUnresolved"], 1)
        self.assertEqual(workspace["summary"]["camerasOffline"], 1)
        self.assertEqual([a["id"] for a in workspace["alerts"]], ["A1", "A2"])
        self.assertEqual(workspace["tasks"]["offlineCameras"], ["C1"])
        self.assertEqual(len(workspace["roads"]), 1)


if __name__ == "__main__":
    unittest.main()
