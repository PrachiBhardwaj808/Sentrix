"""Relational persistence primitives for Sentrix's operational state."""

from django.db import models


class ApiStateDocument(models.Model):
    """Single durable state document while domain records are normalized."""

    key = models.CharField(max_length=32, primary_key=True)
    payload = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sentrix_api_state"

