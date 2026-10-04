"""Minimal CORS support for the separate Vercel and Django deployments."""

from django.conf import settings
from django.http import HttpResponse


class CorsHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS":
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        allowed_origins = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        allow_all = getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
        request_origin = request.headers.get("Origin", "").strip()
        if request_origin and (allow_all or request_origin in allowed_origins):
            response["Access-Control-Allow-Origin"] = request_origin
            response["Vary"] = "Origin"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
        response["Access-Control-Max-Age"] = "86400"
        return response
