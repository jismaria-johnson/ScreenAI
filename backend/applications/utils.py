import datetime
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

def parse_and_validate_date_range(date_from_str, date_to_str):
    """
    Parses and validates date_from and date_to parameters.
    Returns (date_from_obj, date_to_obj) or raises ValidationError.
    Supports YYYY-MM-DD or full ISO 8601 date strings.
    """
    parsed_from = None
    parsed_to = None

    if date_from_str:
        parsed_from = parse_datetime(date_from_str) or parse_date(date_from_str)
        if parsed_from is None:
            raise ValidationError("Invalid date_from format. Use YYYY-MM-DD or ISO 8601 format.")
        if isinstance(parsed_from, datetime.date) and not isinstance(parsed_from, datetime.datetime):
            parsed_from = datetime.datetime.combine(parsed_from, datetime.time.min)

    if date_to_str:
        parsed_to = parse_datetime(date_to_str) or parse_date(date_to_str)
        if parsed_to is None:
            raise ValidationError("Invalid date_to format. Use YYYY-MM-DD or ISO 8601 format.")
        if isinstance(parsed_to, datetime.date) and not isinstance(parsed_to, datetime.datetime):
            parsed_to = datetime.datetime.combine(parsed_to, datetime.time.max)

    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise ValidationError("date_from cannot be greater than date_to.")

    return parsed_from, parsed_to
