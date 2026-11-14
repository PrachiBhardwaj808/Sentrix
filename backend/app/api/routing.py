from django.urls import re_path, path
from .consumers import AlertConsumer

websocket_urlpatterns = [
    re_path(r"^ws/alerts/?$", AlertConsumer.as_asgi()),
    path("ws/alerts/", AlertConsumer.as_asgi()),
    path("ws/alerts", AlertConsumer.as_asgi()),
]
