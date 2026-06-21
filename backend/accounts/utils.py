import ipaddress
from django.conf import settings
from accounts.models import AuditLog

def sanitize_metadata(data):
    """
    Recursively removes sensitive keys from audit log metadata.
    """
    if not isinstance(data, dict):
        return data
    sensitive_keys = {
        "password", "token", "access", "refresh", "secret", "authorization",
        "current_password", "new_password", "confirm_password"
    }
    sanitized = {}
    for k, v in data.items():
        if any(sk in k.lower() for sk in sensitive_keys):
            continue
        if isinstance(v, dict):
            sanitized[k] = sanitize_metadata(v)
        else:
            sanitized[k] = v
    return sanitized

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
