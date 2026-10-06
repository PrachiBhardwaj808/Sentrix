from __future__ import annotations

import unittest

from backend.app.services.geospatial_import import GeoJsonImportError, parse_feature_collection


class GeoJsonImportTests(unittest.TestCase):
    def test_imports_point_feature_into_sentrix_coordinate_shape(self) -> None:
        records = parse_feature_collection("communities", {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "id": "COMM-1",
                "properties": {"name": "North Village"},
                "geometry": {"type": "Point", "coordinates": [88.7, 27.2]},
            }],
        })

        self.assertEqual(records[0]["id"], "COMM-1")
        self.assertEqual(records[0]["coordinates"], {"lat": 27.2, "lng": 88.7})

    def test_imports_road_linestring(self) -> None:
        records = parse_feature_collection("roads", {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"id": "ROAD-1"},
                "geometry": {"type": "LineString", "coordinates": [[88.7, 27.2], [88.8, 27.3]]},
            }],
        })

        self.assertEqual(records[0]["points"], [{"lat": 27.2, "lng": 88.7}, {"lat": 27.3, "lng": 88.8}])

    def test_rejects_out_of_range_and_duplicate_features(self) -> None:
        invalid = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "id": "COMM-1",
                "properties": {},
                "geometry": {"type": "Point", "coordinates": [200, 27.2]},
            }],
        }
        with self.assertRaises(GeoJsonImportError):
            parse_feature_collection("communities", invalid)

        duplicate = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "id": "COMM-1", "properties": {}, "geometry": {"type": "Point", "coordinates": [88, 27]}},
                {"type": "Feature", "id": "COMM-1", "properties": {}, "geometry": {"type": "Point", "coordinates": [88, 27]}},
            ],
        }
        with self.assertRaises(GeoJsonImportError):
            parse_feature_collection("communities", duplicate)


if __name__ == "__main__":
    unittest.main()
