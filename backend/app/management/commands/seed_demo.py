"""Seed deterministic local records for a repeatable command-center demo."""

from __future__ import annotations

import os

from datetime import datetime, timedelta, timezone

from django.core.management.base import BaseCommand, CommandError

from app.api.repository import repository


DEMO_GUARD_IDS = {"G-DEMO-2041", "G-DEMO-2098"}


class Command(BaseCommand):
    help = "Reset local API state and seed a small, deterministic demo dataset."

    def handle(self, *args, **options):
        if os.getenv("SENTRIX_ENABLE_DEMO_DATA", "false").strip().lower() not in {"1", "true", "yes", "on"}:
            raise CommandError("Refusing to seed demo data: set SENTRIX_ENABLE_DEMO_DATA=true for local demos only.")
        now = datetime.now(timezone.utc).replace(microsecond=0)
        timestamp = now.isoformat()
        shift_start = (now - timedelta(hours=2)).isoformat()
        shift_end = (now + timedelta(hours=6)).isoformat()

        state = repository.reset()
        state["currentUser"] = {
            "name": "Inspector Arjun Mehta",
            "rank": "Inspector",
            "badgeId": "SSB-2041",
            "role": "Border Operations Lead",
        }
        state["guards"] = [
            {
                "id": "G-2041",
                "name": "Rifleman Vikram Singh",
                "rank": "Rifleman",
                "badgeId": "SSB-2041",
                "photoUrl": "",
                "phone": "+91 8307348441",
                "emergencyContact": {"name": "S. Singh", "phone": "+91 98765 43211", "relation": "Father"},
                "callSign": "ALPHA-1",
                "certifications": ["Night Vision", "First Aid"],
                "bloodGroup": "O+",
                "status": "on_post",
                "currentPostId": "POST-A1-MAIN",
                "currentSector": "Sector Alpha",
                "shiftStart": shift_start,
                "shiftEnd": shift_end,
                "assignedWeapon": "INSAS-5.56 / A-2041",
                "radioFrequency": "CH-07 / 148.625 MHz",
                "attendanceHistory": [],
            },
            {
                "id": "G-2098",
                "name": "Rifleman Neha Rawat",
                "rank": "Rifleman",
                "badgeId": "SSB-2098",
                "photoUrl": "",
                "phone": "+91 8307348441",
                "emergencyContact": {"name": "P. Rawat", "phone": "+91 98765 43221", "relation": "Brother"},
                "callSign": "BRAVO-2",
                "certifications": ["Drone Countermeasures", "First Aid"],
                "bloodGroup": "B+",
                "status": "patrolling",
                "currentPostId": "POST-B2-RIDGE",
                "currentSector": "Sector Bravo",
                "shiftStart": shift_start,
                "shiftEnd": shift_end,
                "assignedWeapon": "INSAS-5.56 / B-2098",
                "radioFrequency": "CH-07 / 148.625 MHz",
                "attendanceHistory": [],
            },
        ]
        state["shifts"] = [
            {
                "id": "SHIFT-ALPHA-001",
                "guardId": "G-2041",
                "guardName": "Rifleman Vikram Singh",
                "sector": "Sector Alpha",
                "postId": "POST-A1-MAIN",
                "start": "06:00",
                "end": "14:00",
                "day": now.strftime("%a"),
                "shiftName": "Morning (06:00–14:00)",
            },
            {
                "id": "SHIFT-BRAVO-002",
                "guardId": "G-2098",
                "guardName": "Rifleman Neha Rawat",
                "sector": "Sector Bravo",
                "postId": "POST-B2-RIDGE",
                "start": "06:00",
                "end": "14:00",
                "day": now.strftime("%a"),
                "shiftName": "Morning (06:00–14:00)",
            },
        ]
        state["cameras"] = [
            {
                "id": "CAM-ALPHA-01",
                "name": "Alpha Main Gate",
                "sector": "Sector Alpha",
                "rtspUrl": "",
                "type": "ptz",
                "aiActive": True,
                "personDetection": True,
                "vehicleDetection": True,
                "weaponDetection": True,
                "confidenceThreshold": 0.5,
                "minObjectSizePx": 48,
                "zonePolygon": [],
                "triggerAction": "Guard Ping",
                "dwellTimeSeconds": 8,
                "status": "online",
                "fps": 25,
                "resolution": "1920x1080",
                "fovAngle": 92,
                "coordinates": {"lat": 27.2412, "lng": 88.7598},
                "pan": 0,
                "tilt": -4,
                "zoom": 1,
            },
            {
                "id": "CAM-BRAVO-02",
                "name": "Bravo Ridge Thermal",
                "sector": "Sector Bravo",
                "rtspUrl": "",
                "type": "thermal",
                "aiActive": True,
                "personDetection": True,
                "vehicleDetection": True,
                "weaponDetection": False,
                "confidenceThreshold": 0.6,
                "minObjectSizePx": 36,
                "zonePolygon": [],
                "triggerAction": "QRF Dispatch",
                "dwellTimeSeconds": 5,
                "status": "online",
                "fps": 20,
                "resolution": "1280x720",
                "fovAngle": 64,
                "coordinates": {"lat": 27.249, "lng": 88.771},
            },
        ]
        state["sectors"] = [
            {
                "id": "SEC-ALPHA",
                "name": "Sector Alpha",
                "code": "A-01",
                "postsCount": 4,
                "staffedCount": 3,
                "threatLevel": "elevated",
                "centerCoordinates": {"lat": 27.2412, "lng": 88.7598},
                "polygon": [],
                "posts": [],
                "tripwires": [],
            },
            {
                "id": "SEC-BRAVO",
                "name": "Sector Bravo",
                "code": "B-02",
                "postsCount": 3,
                "staffedCount": 2,
                "threatLevel": "low",
                "centerCoordinates": {"lat": 27.249, "lng": 88.771},
                "polygon": [],
                "posts": [],
                "tripwires": [],
            },
        ]
        state["alerts"] = [
            {
                "id": "ALT-DEMO-001",
                "level": "high",
                "timestamp": timestamp,
                "sourceCameraId": "CAM-ALPHA-01",
                "sourceCameraName": "Alpha Main Gate",
                "eventType": "Unauthorized Person Detected",
                "confidence": 91,
                "coordinates": {"lat": 27.2412, "lng": 88.7598},
                "objectClass": "Person",
                "evidenceUrl": "",
                "status": "open",
                "acknowledgedBy": None,
                "sector": "Sector Alpha",
                "notes": "Demo record generated by seed_demo. Fictional, local-only.",
                "evidenceSource": "demo",
                "blockchainStatus": "not_anchored",
            },
            {
                "id": "ALT-DEMO-002",
                "level": "medium",
                "timestamp": timestamp,
                "sourceCameraId": "CAM-BRAVO-02",
                "sourceCameraName": "Bravo Ridge Thermal",
                "eventType": "Demo heatmap activity (fictional)",
                "confidence": 62,
                "coordinates": {"lat": 27.249, "lng": 88.771},
                "objectClass": "Vehicle",
                "evidenceUrl": "",
                "status": "open",
                "acknowledgedBy": None,
                "sector": "Sector Bravo",
                "notes": "Demo heatmap record generated by seed_demo. Fictional, local-only.",
                "evidenceSource": "demo",
                "blockchainStatus": "not_anchored",
            },
        ]
        state["activityLog"] = [
            {
                "id": "LOG-DEMO-001",
                "timestamp": timestamp,
                "actorId": "SYSTEM",
                "actorName": "SYSTEM",
                "actionType": "patrol_checkin",
                "targetType": "system",
                "targetId": "BOOTSTRAP",
                "sector": "All Sectors",
                "details": "Demo state initialized by seed_demo.",
            }
        ]
        state["anprRecords"] = []
        state["watchlistEntries"] = [
            {
                "id": "WATCH-PLATE-001",
                "type": "plate",
                "value": "DL01AB1234",
                "label": "Blacklisted transport",
                "reason": "Vehicle linked to a prior perimeter breach.",
                "status": "Blacklisted",
                "createdAt": timestamp,
            },
            {
                "id": "WATCH-PLATE-002",
                "type": "plate",
                "value": "WB06K7788",
                "label": "Authorized logistics",
                "reason": "Scheduled supply convoy.",
                "status": "Authorized",
                "createdAt": timestamp,
            },
            {
                "id": "WATCH-FACE-001",
                "type": "face",
                "value": "demo-subject-07",
                "label": "Person of interest",
                "reason": "Demonstration face watchlist record.",
                "status": "Under Surveillance",
                "createdAt": timestamp,
            },
        ]
        state["communities"] = [
            {
                "id": "COMM-DEMO-001",
                "name": "Demo North Village (fictional)",
                "population": 1200,
                "coordinates": {"lat": 27.2425, "lng": 88.7615},
                "accessScore": 62,
                "emergencyDistanceKm": 3.1,
            },
            {
                "id": "COMM-DEMO-002",
                "name": "Demo Ridge Hamlet (fictional)",
                "population": 340,
                "coordinates": {"lat": 27.2505, "lng": 88.7725},
                "accessScore": 48,
                "emergencyDistanceKm": 5.4,
            },
        ]
        state["roads"] = [
            {
                "id": "ROAD-DEMO-001",
                "name": "Demo Ridge Patrol Road (fictional)",
                "status": "open",
                "points": [{"lat": 27.2412, "lng": 88.7598}, {"lat": 27.249, "lng": 88.771}],
            },
            {
                "id": "ROAD-DEMO-ZONE-001",
                "name": "Demo Restricted Perimeter (fictional geofence)",
                "status": "affected",
                "points": [
                    {"lat": 27.2435, "lng": 88.7625},
                    {"lat": 27.2455, "lng": 88.7665},
                    {"lat": 27.243, "lng": 88.769},
                ],
            },
        ]
        state["resources"] = [
            {
                "id": "RES-DEMO-001",
                "name": "Demo Checkpoint Alpha (fictional)",
                "type": "checkpoint",
                "coordinates": {"lat": 27.243, "lng": 88.7605},
                "available": True,
                "capacity": 6,
            },
            {
                "id": "RES-DEMO-002",
                "name": "Demo Aid Post (fictional)",
                "type": "hospital",
                "coordinates": {"lat": 27.248, "lng": 88.7695},
                "available": True,
                "capacity": 4,
            },
        ]
        state["infrastructure"] = [
            {
                "id": "INFRA-DEMO-001",
                "name": "Demo Hill School (fictional)",
                "type": "school",
                "coordinates": {"lat": 27.244, "lng": 88.763},
                "criticality": "high",
            },
            {
                "id": "INFRA-DEMO-002",
                "name": "Demo Road Junction (fictional)",
                "type": "road junction",
                "coordinates": {"lat": 27.247, "lng": 88.768},
                "criticality": "medium",
            },
        ]
        state["system"] = {"lockdownActive": False, "defconLevel": 2}

        repository.update_current_user(state["currentUser"])
        for collection in ("guards", "shifts", "cameras", "sectors", "alerts", "activityLog", "watchlistEntries", "communities", "roads", "resources", "infrastructure"):
            for item in state[collection]:
                repository.upsert(collection, item)
        repository.system_update(state["system"])
        # Credential creation is an explicit local/demo action, never a side
        # effect of a login request in the API.
        repository.ensure_demo_auth_users()
        self.stdout.write(self.style.SUCCESS("Demo state seeded: 2 guards, 2 cameras, 2 sectors, 2 alerts, 2 communities, 2 roads, 2 resources, 2 infrastructure records (fictional, local-only)."))
