# Sentrix Camera Relay & Streaming Architecture

This service connects on-premise LAN cameras (such as Dahua, CP Plus, and Hikvision IP cameras) streaming over RTSP to web browsers via a low-latency HLS and WebRTC media relay powered by MediaMTX.

## Architecture Overview

`	ext
[ Physical IP Camera ]
        |
        | RTSP (TCP / Port 554, Digest Auth)
        v
[ MediaMTX Relay Service ] (127.0.0.1:8554, 8888, 8889, 9997)
        ^
        | Dynamic Path Configuration (REST API :9997)
        v
[ Django Backend ]
  - Camera Registry (stores IP, port, channel, credentials)
  - app/services/cameras/connection.py (private IP validation)
  - app/services/cameras/relay.py (URL construction & relay registration)
  - GET /api/cameras/<camera_id>/stream (auth-protected endpoint)
        |
        | Browser Playback (HLS via hls.js)
        v
[ Next.js Operator Console ]
  - LocalCameraFeed & CameraVideoFeed
  - Continuous JPEG canvas frame sampling -> POST /api/inference/frame
  - Real-time YOLO Person Tracking, Face Detection, ANPR
`

## Security & Network Isolation

1. **Private IP Enforcement**: Only RFC 1918 private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local (169.254.0.0/16), and loopback (127.0.0.1) can be connected or relayed. Public WAN IP addresses are strictly rejected.
2. **Credential Masking**: RTSP passwords and raw RTSP URLs containing credentials are never returned in client-facing APIs (/api/bootstrap, /api/cameras/<id>, /api/cameras/<id>/stream). Only the browser-safe HLS/WebRTC URLs are exposed.
3. **Authentication**: Access to stream relay endpoints requires a valid signed session token (dmin or command operator tier).

## Local Development Setup

1. **MediaMTX Relay**:
   MediaMTX runs as a local binary from ackend/.localdata/bin/mediamtx.exe using configuration ackend/config/mediamtx.yml:
   `powershell
   .\.localdata\bin\mediamtx.exe .\config\mediamtx.yml
   `
2. **Environment Configuration**:
   Ensure ackend/.env contains:
   `env
   MEDIA_RELAY_BASE_URL=http://127.0.0.1:8888
   MEDIA_RELAY_WEBRTC_URL=http://127.0.0.1:8889
   MEDIA_RELAY_API_URL=http://127.0.0.1:9997
   MEDIA_RELAY_ENABLED=true
   `

## Docker Deployment

To launch the complete stack with MediaMTX, Django, and Next.js:
`ash
docker-compose up -d
`
