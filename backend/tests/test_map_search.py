from __future__ import annotations

import unittest

from backend.app.services.geocoding import parse_coordinate_input, search_local_collections


def _state() -> dict:
    return {
        "cameras": [
            {"id": "CAM-1", "name": "Alpha Gate Camera", "status": "online", "coordinates": {"lat": 28.6, "lng": 77.2}},
        ],
        "alerts": [
            {
                "id": "ALT-1",
                "eventType": "Perimeter breach",
                "level": "high",
                "status": "open",
                "coordinates": {"lat": 28.61, "lng": 77.21},
            },
        ],
        "communities": [
            {"id": "COMM-1", "name": "North Village", "coordinates": {"lat": 28.62, "lng": 77.22}},
        ],
        "roads": [
            {
                "id": "ROAD-1",
                "name": "Ridge Patrol Road",
                "status": "open",
                "points": [{"lat": 28.6, "lng": 77.2}, {"lat": 28.61, "lng": 77.21}],
            },
        ],
        "resources": [],
        "infrastructure": [],
        "sectors": [],
        "guards": [],
        "watchlistEntries": [],
    }


class MapSearchTests(unittest.TestCase):
    def test_parses_direct_coordinates(self) -> None:
        parsed = parse_coordinate_input("28.6139, 77.2090")
        self.assertIsNotNone(parsed)
        if parsed is None:
            self.fail("coordinate input should parse")
            return
        self.assertAlmostEqual(parsed["lat"], 28.6139)
        self.assertAlmostEqual(parsed["lng"], 77.209)

    def test_rejects_out_of_range_coordinates(self) -> None:
        self.assertIsNone(parse_coordinate_input("120.0, 77.0"))
        self.assertIsNone(parse_coordinate_input("not a place ???"))

    def test_coordinate_query_returns_coordinate_result_first(self) -> None:
        results = search_local_collections("28.6139, 77.2090", _state(), 8)
        self.assertTrue(results)
        self.assertEqual(results[0]["kind"], "coordinates")

    def test_searches_names_landmarks_cameras_alerts_communities_and_roads(self) -> None:
        self.assertEqual(search_local_collections("alpha gate", _state(), 8)[0]["kind"], "camera")
        self.assertEqual(search_local_collections("perimeter", _state(), 8)[0]["kind"], "alert")
        self.assertEqual(search_local_collections("north village", _state(), 8)[0]["kind"], "community")
        self.assertEqual(search_local_collections("ridge patrol", _state(), 8)[0]["kind"], "road")

    def test_empty_query_returns_no_results(self) -> None:
        self.assertEqual(search_local_collections("  ", _state(), 8), [])

    def test_nearest_responders_view(self) -> None:
        from unittest.mock import patch
        from django.test import RequestFactory
        from backend.app.api.routes.map import nearest_responders_view
        import json

        factory = RequestFactory()
        req = factory.get("/api/map/nearest-responders?lat=28.6139&lng=77.2090&radiusKm=10&limit=3")
        with patch("backend.app.api.routes.map._session_from_request", return_value={"operatorId": "OP-1"}):
            with patch("backend.app.api.routes.map.repository.snapshot", return_value=_state()):
                res = nearest_responders_view(req)
                self.assertEqual(res.status_code, 200)
                data = json.loads(res.content)
                self.assertIn("target", data)
                self.assertIn("responders", data)

    def test_route_recommendation_view(self) -> None:
        from unittest.mock import patch
        from django.test import RequestFactory
        from backend.app.api.routes.map import route_recommendation_view
        import json

        factory = RequestFactory()
        req = factory.get("/api/map/route?lat=28.6139&lng=77.2090&radiusKm=10")
        with patch("backend.app.api.routes.map._session_from_request", return_value={"operatorId": "OP-1"}):
            with patch("backend.app.api.routes.map.repository.snapshot", return_value=_state()):
                res = route_recommendation_view(req)
                self.assertEqual(res.status_code, 200)
                data = json.loads(res.content)
                self.assertIn("route", data)
                self.assertIn("avoid", data)
                self.assertIn("reason", data)


if __name__ == "__main__":
    unittest.main()
