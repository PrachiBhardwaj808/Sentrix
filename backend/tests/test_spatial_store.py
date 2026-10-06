from __future__ import annotations

import unittest

from backend.app.services.spatial_store import geometry_for_feature


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


if __name__ == "__main__":
    unittest.main()
