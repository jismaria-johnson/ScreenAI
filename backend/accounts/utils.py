import ipaddress
from django.conf import settings
from accounts.models import AuditLog

SENSITIVE_METADATA_KEY_PARTS = {
    "password", "token", "access", "refresh", "secret", "authorization"
}
SAFE_METADATA_KEYS = {"access_role"}

def _normalize_key(key):
    if not isinstance(key, str):
        return str(key)
    normalized = key.lower()
    normalized = normalized.replace("-", "_").replace(" ", "_")
    return normalized

def _is_sensitive_key(key):
    norm_key = _normalize_key(key)
    if norm_key in SAFE_METADATA_KEYS:
        return False
    for part in SENSITIVE_METADATA_KEY_PARTS:
        if part in norm_key:
            return True
    return False

def sanitize_metadata(data):
    """
    Recursively removes sensitive keys from audit log metadata, preserving lists, tuples, and dicts,
    without mutating the original object.
    """
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if _is_sensitive_key(k):
                continue
            sanitized[k] = sanitize_metadata(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_metadata(item) for item in data]
    elif isinstance(data, tuple):
        return tuple(sanitize_metadata(item) for item in data)
    else:
        return data

def is_valid_ip(ip_str):
    if not ip_str:
        return False
    try:
        ipaddress.ip_address(ip_str.strip())
        return True
    except ValueError:
        return False

def log_audit(action, actor, target_type=None, target_id=None, target_label=None, metadata=None, request=None):
    """
    Appends a new permanent audit record. Extracts request IP and User Agent if request is provided.
    If audit creation fails, exceptions propagate to roll back surrounding transactions.
    """
    ip_address = None
    user_agent = None
    if request:
        remote_addr = request.META.get('REMOTE_ADDR')
        if remote_addr:
            remote_addr = remote_addr.strip()
            if not is_valid_ip(remote_addr):
                remote_addr = None

        trust_proxy = getattr(settings, 'TRUST_PROXY_HEADERS', False)
        if trust_proxy:
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                parts = [p.strip() for p in x_forwarded_for.split(',')]
                valid_forwarded = None
                for p in parts:
                    if p and is_valid_ip(p):
                        valid_forwarded = p
                        break
                if valid_forwarded:
                    ip_address = valid_forwarded
                else:
                    ip_address = remote_addr
            else:
                ip_address = remote_addr
        else:
            ip_address = remote_addr
        user_agent = request.META.get('HTTP_USER_AGENT')

    clean_metadata = sanitize_metadata(metadata or {})

    return AuditLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        target_label=target_label,
        metadata=clean_metadata,
        ip_address=ip_address,
        user_agent=user_agent
    )
