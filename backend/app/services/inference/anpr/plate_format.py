"""Normalization and validation rules for common Indian registration plates.

The ANPR integration is adapted from the Apache-2.0 licensed module supplied
in ``IBVAP-modules/anpr-module``. See ``backend/THIRD_PARTY_NOTICES.md``.
"""

from __future__ import annotations

import re


# Covers current private/commercial formats (MH12AB1234), older formats (DL1C1234),
# and standard temporary registrations (MH12TR1234).
INDIAN_PLATE_PATTERN = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$")
# Bharat-series (BH) plates introduced by MoRTH, e.g. 22BH1234AA or 24BH0001A.
BH_PLATE_PATTERN = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")
# State-issued temporary plates of the form SS DD T NNNN AA (e.g. TS09T1234AA).
TEMP_PLATE_PATTERN = re.compile(r"^[A-Z]{2}\d{1,2}T\d{4}[A-Z]{1,2}$")

_DIGIT_TO_LETTER = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B"}
_LETTER_TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8"}


def _substitutions(original: str, candidate: str) -> int:
    return sum(a != b for a, b in zip(original, candidate))


def normalize_indian_plate(value: str) -> str:
    """Normalize common OCR substitutions without accepting an invalid plate."""

    text = re.sub(r"[^A-Z0-9]", "", (value or "").upper())
    if len(text) < 7 or len(text) > 11 or not any(ch.isalpha() for ch in text):
        return text

    candidates: list[tuple[int, str]] = []

    # 1. Bharat-series (BH): YY BH NNNN XX (length 9 or 10)
    if len(text) in (9, 10):
        year = "".join(_LETTER_TO_DIGIT.get(ch, ch) for ch in text[:2])
        bh = "".join(_DIGIT_TO_LETTER.get(ch, ch) for ch in text[2:4])
        number = "".join(_LETTER_TO_DIGIT.get(ch, ch) for ch in text[4:8])
        suffix = "".join(_DIGIT_TO_LETTER.get(ch, ch) for ch in text[8:])
        bh_candidate = year + bh + number + suffix
        if BH_PLATE_PATTERN.fullmatch(bh_candidate):
            candidates.append((_substitutions(text, bh_candidate), bh_candidate))

    # 2. Standard / older / TR plates: SS D{1,2} L{1,3} N{1,4}
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
                candidates.append((_substitutions(text, candidate), candidate))

    # 3. Temporary plates: SS D{1,2} T N{4} L{1,2}
    for district_length in (2, 1):
        suffix_length = len(text) - 2 - district_length - 1 - 4
        if not 1 <= suffix_length <= 2:
            continue
        state = "".join(_DIGIT_TO_LETTER.get(ch, ch) for ch in text[:2])
        district = "".join(_LETTER_TO_DIGIT.get(ch, ch) for ch in text[2 : 2 + district_length])
        t_pos = 2 + district_length
        t_char = _DIGIT_TO_LETTER.get(text[t_pos], text[t_pos])
        number = "".join(_LETTER_TO_DIGIT.get(ch, ch) for ch in text[t_pos + 1 : t_pos + 5])
        suffix = "".join(_DIGIT_TO_LETTER.get(ch, ch) for ch in text[t_pos + 5 :])
        temp_candidate = state + district + t_char + number + suffix
        if TEMP_PLATE_PATTERN.fullmatch(temp_candidate):
            candidates.append((_substitutions(text, temp_candidate), temp_candidate))

    if candidates:
        return min(candidates, key=lambda item: item[0])[1]
    return text


def is_indian_plate(value: str) -> bool:
    """Return whether ``value`` matches any supported Indian plate format."""

    normalized = normalize_indian_plate(value)
    return bool(
        INDIAN_PLATE_PATTERN.fullmatch(normalized)
        or BH_PLATE_PATTERN.fullmatch(normalized)
        or TEMP_PLATE_PATTERN.fullmatch(normalized)
    )
