import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def send_assessment_invitation_email(
    candidate_email,
    candidate_name,
    recruiter_name,
    assessment_name,
    assessment_duration,
    assessment_deadline_str,
    assessment_url,
):
    """
    Sends an assessment invitation email using Brevo's Transactional Email API.
    Returns:
        dict: {
            "accepted": bool,
            "provider_message_id": str or None,
            "failure_code": str or None,
            "safe_failure_message": str or None
        }
    """
    # 1. Check Configuration (Startup Safety: checked only at runtime)
    api_key = getattr(settings, "BREVO_API_KEY", "")
    sender_email = getattr(settings, "BREVO_SENDER_EMAIL", "")
    sender_name = getattr(settings, "BREVO_SENDER_NAME", "")
    base_url = getattr(settings, "BREVO_API_BASE_URL", "https://api.brevo.com/v3")
    timeout = getattr(settings, "BREVO_REQUEST_TIMEOUT_SECONDS", 10)

    if not api_key or not sender_email or not sender_name:
        logger.error("Brevo client error: Configuration is missing.")
        return {
            "accepted": False,
            "provider_message_id": None,
            "failure_code": "provider_not_configured",
            "safe_failure_message": "Email delivery is not configured on the server."
        }

    # 2. Build dynamically formatted HTML content
    html_content = (
        f"<html><body>"
        f"<h2>ScreenAI Take-Home Assessment Invitation</h2>"
        f"<p>Dear {candidate_name},</p>"
        f"<p>You have been invited by <strong>{recruiter_name}</strong> to take the take-home assessment: "
        f"<strong>{assessment_name}</strong>.</p>"
        f"<ul>"
        f"<li><strong>Duration:</strong> {assessment_duration} minutes</li>"
        f"<li><strong>Deadline:</strong> {assessment_deadline_str}</li>"
        f"</ul>"
        f"<p>To begin your assessment, please visit the secure link below:</p>"
        f"<p><a href='{assessment_url}' style='display:inline-block;padding:10px 20px;background-color:#4f46e5;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;'>Start Assessment</a></p>"
        f"<p>Note: This link is unique to you and will expire at the deadline. Do not share this URL with anyone.</p>"
        f"<p>Best regards,<br/>The ScreenAI Team</p>"
        f"</body></html>"
    )

    headers = {
        "api-key": api_key,
        "accept": "application/json",
        "content-type": "application/json"
    }

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email
        },
        "to": [
            {
                "email": candidate_email,
                "name": candidate_name
            }
        ],
        "subject": f"Invitation: {assessment_name} Assessment for ScreenAI",
        "htmlContent": html_content
    }

    url = f"{base_url.rstrip('/')}/smtp/email"

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=timeout)
    except requests.exceptions.Timeout:
        logger.error("Brevo client error: Request timed out.")
        return {
            "accepted": False,
            "provider_message_id": None,
            "failure_code": "provider_timeout",
            "safe_failure_message": "The email delivery request timed out."
        }
    except requests.exceptions.ConnectionError:
        logger.error("Brevo client error: Connection failed.")
        return {
            "accepted": False,
            "provider_message_id": None,
            "failure_code": "provider_connection_failed",
            "safe_failure_message": "Could not connect to the email delivery provider."
        }
    except requests.exceptions.RequestException as e:
        logger.error("Brevo client error: Network/request exception occurred.")
        return {
            "accepted": False,
            "provider_message_id": None,
            "failure_code": "provider_connection_failed",
            "safe_failure_message": "An error occurred while connecting to the email provider."
        }

    # Handle HTTP responses
    status_code = response.status_code

    if status_code == 201 or status_code == 200:
        try:
            res_json = response.json()
            # Brevo response usually returns {"messageId": "<id>"}
            message_id = res_json.get("messageId")
            if not message_id:
                logger.error("Brevo client error: success response missing messageId.")
                return {
                    "accepted": False,
                    "provider_message_id": None,
                    "failure_code": "provider_missing_message_id",
                    "safe_failure_message": "Email sent but tracking ID was not returned by provider."
                }
            return {
                "accepted": True,
                "provider_message_id": message_id,
                "failure_code": None,
                "safe_failure_message": None
            }
        except Exception:
            logger.error("Brevo client error: success response could not be parsed as JSON.")
            return {
                "accepted": False,
                "provider_message_id": None,
                "failure_code": "provider_invalid_response",
                "safe_failure_message": "Received invalid response format from the email provider."
            }

    # Handle error statuses
    failure_code = "provider_outcome_unknown"
    safe_failure_message = "An unknown error occurred on the email provider side."

    if status_code == 400:
        failure_code = "provider_invalid_request"
        safe_failure_message = "Invalid invitation details provided to email server."
    elif status_code in [401, 403]:
        failure_code = "provider_authentication_failed"
        safe_failure_message = "Email service authentication failed."
    elif status_code == 429:
        failure_code = "provider_rate_limited"
        safe_failure_message = "Email sending limit reached. Please try again later."
    elif status_code >= 500:
        failure_code = "provider_unavailable"
        safe_failure_message = "Email service is temporarily unavailable."

    logger.error(f"Brevo client error: HTTP {status_code} returned.")

    return {
        "accepted": False,
        "provider_message_id": None,
        "failure_code": failure_code,
        "safe_failure_message": safe_failure_message
    }
