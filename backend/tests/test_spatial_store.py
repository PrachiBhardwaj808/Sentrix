from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from backend.app.services.spatial_store import (
    features_in_bbox,
    geometry_for_feature,
    haversine_km,
    nearest_responders,
    route_recommendation,
)
from backend.app.services.location_workspace import build_workspace


class SpatialStoreTests(unittest.TestCase):
    def test_point_coordinates_are_written_in_geojson_order(self) -> None:
        geometry = geometry_for_feature("communities", {
            "id": "COMM-1",
            "coordinates": {"lat": 27.2, "lng": 88.7},
        })

        self.assertEqual(geometry, {"type": "Point", "coordinates": [88.7, 27.2]})

    def test_roads_are_indexed_as_linestrings(self) -> None:
        geometry = geometry_for_feature("roads", {
            "id": "ROAD-1",
            "points": [{"lat": 27.2, "lng": 88.7}, {"lat": 27.3, "lng": 88.8}],
        })

        self.assertEqual(
            geometry,
            {"type": "LineString", "coordinates": [[88.7, 27.2], [88.8, 27.3]]},
        )

    def test_invalid_coordinates_are_not_indexed(self) -> None:
        self.assertIsNone(geometry_for_feature("resources", {
            "id": "RESOURCE-1",
            "coordinates": {"lat": 95, "lng": 88.7},
        }))
        self.assertIsNone(geometry_for_feature("roads", {"id": "ROAD-2", "points": []}))

    def test_haversine_distance_calculation(self) -> None:
        # Distance between (28.6139, 77.2090) and (28.6149, 77.2100) is ~0.15 km
        dist = haversine_km(28.6139, 77.2090, 28.6149, 77.2100)
        self.assertGreater(dist, 0.1)
        self.assertLess(dist, 0.25)

    def test_nearest_responders_haversine_fallback(self) -> None:
        state = {
            "resources": [
                {
                    "id": "RES-NEAR",
                    "name": "QRF Team Alpha",
                    "type": "qrf",
                    "coordinates": {"lat": 28.615, "lng": 77.210},
                },
                {
                    "id": "RES-MID",
                    "name": "Patrol Unit Bravo",
                    "type": "patrol",
                    "coordinates": {"lat": 28.630, "lng": 77.220},
                },
                {
                    "id": "RES-FAR",
                    "name": "Base Reserve",
                    "type": "base",
                    "coordinates": {"lat": 30.000, "lng": 78.000},
                },
            ]
        }
        responders = nearest_responders(lat=28.6139, lng=77.2090, radius_km=5.0, limit=2, state=state)
        self.assertEqual(len(responders), 2)
        self.assertEqual(responders[0]["id"], "RES-NEAR")
        self.assertEqual(responders[1]["id"], "RES-MID")
        self.assertIn("distanceKm", responders[0])
        self.assertLess(responders[0]["distanceKm"], responders[1]["distanceKm"])

    @patch("backend.app.services.spatial_store._enabled", return_value=True)
    @patch("backend.app.services.spatial_store.connection")
    def test_nearest_responders_postgis_operators(self, mock_conn: MagicMock, mock_enabled: MagicMock) -> None:
        cursor_mock = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = cursor_mock
        cursor_mock.fetchall.return_value = [
            ("resources", json.dumps({"id": "RES-PG-1", "name": "PostGIS Fast QRF"}), 1.234),
        ]

        responders = nearest_responders(lat=28.6139, lng=77.2090, radius_km=10.0, limit=5)
        self.assertEqual(len(responders), 1)
        self.assertEqual(responders[0]["id"], "RES-PG-1")
        self.assertEqual(responders[0]["distanceKm"], 1.234)

        # Verify that ST_DistanceSphere and ST_DWithin were in the executed query
        query_executed = cursor_mock.execute.call_args[0][0]
        self.assertIn("ST_DistanceSphere", query_executed)
        self.assertIn("ST_DWithin", query_executed)

    def test_route_recommendation_haversine_fallback(self) -> None:
        state = {
            "roads": [
                {
                    "id": "ROAD-OPEN",
                    "name": "North Access Road",
                    "status": "open",
                    "points": [{"lat": 28.614, "lng": 77.208}, {"lat": 28.618, "lng": 77.212}],
                },
                {
                    "id": "ROAD-AFFECTED",
                    "name": "Perimeter Breach Road",
                    "status": "affected",
                    "points": [{"lat": 28.613, "lng": 77.209}, {"lat": 28.614, "lng": 77.210}],
                },
            ],
            "alerts": [
                {
                    "id": "ALT-1",
                    "status": "open",
                    "coordinates": {"lat": 28.6135, "lng": 77.2092},
                }
            ],
        }
        rec = route_recommendation(lat=28.6139, lng=77.2090, radius_km=5.0, state=state)
        self.assertEqual(rec["provider"], "haversine_fallback")
        self.assertIn("approach via alternate corridor", rec["route"])
        self.assertEqual(rec["avoid"], "Perimeter Breach Road")
        self.assertIsNotNone(rec["nearestRoad"])
        self.assertIsNotNone(rec["affectedRoad"])

    @patch("backend.app.services.spatial_store._enabled", return_value=True)
    @patch("backend.app.services.spatial_store.connection")
    def test_route_recommendation_postgis_operators(self, mock_conn: MagicMock, mock_enabled: MagicMock) -> None:
        cursor_mock = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = cursor_mock
        cursor_mock.fetchall.return_value = [
            ("roads", json.dumps({"id": "ROAD-PG-1", "name": "Patrol Corridor Alpha", "status": "open"}), 0.45),
        ]

        rec = route_recommendation(lat=28.6139, lng=77.2090, radius_km=5.0)
        self.assertEqual(rec["provider"], "postgis")
        self.assertIn("Patrol Corridor Alpha", rec["route"])
        self.assertIsNone(rec["affectedRoad"])

    def test_features_in_bbox_fallback(self) -> None:
        state = {
            "communities": [
                {"id": "COMM-IN", "coordinates": {"lat": 28.61, "lng": 77.21}},
                {"id": "COMM-OUT", "coordinates": {"lat": 30.00, "lng": 80.00}},
            ],
            "resources": [],
            "infrastructure": [],
            "roads": [
                {
                    "id": "ROAD-IN",
                    "points": [{"lat": 28.605, "lng": 77.205}, {"lat": 28.615, "lng": 77.215}],
                },
                {
                    "id": "ROAD-OUT",
                    "points": [{"lat": 35.0, "lng": 85.0}, {"lat": 36.0, "lng": 86.0}],
                },
            ],
        }
        # west, south, east, north
        results = features_in_bbox(south=28.5, west=77.1, north=28.7, east=77.3, state_fallback=state)
        self.assertIsNotNone(results)
        self.assertEqual(len(results["communities"]), 1)
        self.assertEqual(results["communities"][0]["id"], "COMM-IN")
        self.assertEqual(len(results["roads"]), 1)
        self.assertEqual(results["roads"][0]["id"], "ROAD-IN")

    @patch("backend.app.services.spatial_store._enabled", return_value=True)
    @patch("backend.app.services.spatial_store.connection")
    def test_features_in_bbox_postgis(self, mock_conn: MagicMock, mock_enabled: MagicMock) -> None:
        cursor_mock = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = cursor_mock
        cursor_mock.fetchall.return_value = [
            ("communities", json.dumps({"id": "COMM-PG-1"})),
        ]

        results = features_in_bbox(south=28.5, west=77.1, north=28.7, east=77.3)
        self.assertIsNotNone(results)
        self.assertEqual(results["communities"][0]["id"], "COMM-PG-1")

        query_executed = cursor_mock.execute.call_args[0][0]
        self.assertIn("ST_MakeEnvelope", query_executed)
        self.assertIn("&&", query_executed)

    def test_workspace_includes_responders_and_routing(self) -> None:
        state = {
            "alerts": [],
            "cameras": [],
            "guards": [],
            "communities": [],
            "resources": [
                {"id": "RES-1", "name": "QRF Fast", "coordinates": {"lat": 28.61, "lng": 77.21}},
            ],
            "infrastructure": [],
            "roads": [
                {"id": "ROAD-1", "name": "Secure Path", "status": "open", "points": [{"lat": 28.60, "lng": 77.20}, {"lat": 28.62, "lng": 77.22}]},
            ],
            "activityLog": [],
        }
        workspace = build_workspace(state, lat=28.61, lng=77.21, radius_km=5)
        self.assertIn("nearestResponders", workspace)
        self.assertIn("routeRecommendation", workspace)
        self.assertEqual(len(workspace["nearestResponders"]), 1)
        self.assertEqual(workspace["nearestResponders"][0]["id"], "RES-1")
        self.assertIn("Secure Path", workspace["routeRecommendation"]["route"])


if __name__ == "__main__":
    unittest.main()
