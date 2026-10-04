"""Normalization and validation rules for common Indian registration plates.

The ANPR integration is adapted from the Apache-2.0 licensed module supplied
in ``IBVAP-modules/anpr-module``. See ``backend/THIRD_PARTY_NOTICES.md``.
"""

from __future__ import annotations

import re


# Covers current private/commercial formats such as MH12AB1234, DL1C1234,
# and KA05M1234 while remaining strict about the state prefix and final digits.
INDIAN_PLATE_PATTERN = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$")
_DIGIT_TO_LETTER = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B"}
_LETTER_TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8"}


def normalize_indian_plate(value: str) -> str:
    """Normalize common OCR substitutions without accepting an invalid plate."""

    text = re.sub(r"[^A-Z0-9]", "", (value or "").upper())
    if len(text) < 8 or len(text) > 11:
        return text

    # Indian plates have a variable district/series split. Try every legal
    # split and choose the candidate requiring the fewest OCR substitutions;
    # this handles both MH12AB1234 and older formats such as DL1C1234.
    candidates = []
    for district_length in (2, 1):
        for series_length in (2, 1, 3):
            number_length = len(text) - 2 - district_length - series_length
            if not 1 <= number_length <= 4:
                continue
            state = "".join(_DIGIT_TO_LETTER.get(char, char) for char in text[:2])
            district_start = 2
            series_start = district_start + district_length
            number_start = series_start + series_length
            district = "".join(
                _LETTER_TO_DIGIT.get(char, char)
                for char in text[district_start:series_start]
            )
            series = "".join(
                _DIGIT_TO_LETTER.get(char, char)
                for char in text[series_start:number_start]
            )
            number = "".join(
                _LETTER_TO_DIGIT.get(char, char) for char in text[number_start:]
            )
            candidate = state + district + series + number
            if INDIAN_PLATE_PATTERN.fullmatch(candidate):
                substitutions = sum(
                    original != normalized
                    for original, normalized in zip(text, candidate)
                )
                candidates.append((substitutions, candidate))

    if candidates:
        return min(candidates, key=lambda item: item[0])[1]
    return text


def is_indian_plate(value: str) -> bool:
    """Return whether ``value`` matches the supported Indian plate formats."""

    return bool(INDIAN_PLATE_PATTERN.fullmatch(normalize_indian_plate(value)))
