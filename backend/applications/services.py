from django.db import transaction, IntegrityError
from applications.models import CandidateIdentity

@transaction.atomic
def get_or_create_candidate_identity(application):
    """
    Race-safe mapping of Applications to CandidateIdentity.
    Registered application -> identity by candidate_user (never group by email).
    Public application with valid email -> trim + lower, get/create by public_email_key.
    Missing/blank/invalid email -> new anonymous identity.
    """
    if application.candidate:
        # Registered candidate identity
        identity, created = CandidateIdentity.objects.get_or_create(
            candidate_user=application.candidate,
            defaults={
                "identity_type": "registered",
                "normalized_email": application.candidate.email.strip().lower() if application.candidate.email else None
            }
        )
        return identity

    email = application.candidate_email.strip().lower() if application.candidate_email else ""
    if email:
        # Public candidate identity
        try:
            with transaction.atomic():
                identity, created = CandidateIdentity.objects.get_or_create(
                    public_email_key=email,
                    defaults={
                        "identity_type": "public",
                        "normalized_email": email
                    }
                )
            return identity
        except IntegrityError:
            # Re-fetch in case of concurrent creation race condition
            return CandidateIdentity.objects.get(public_email_key=email)

    # Anonymous candidate identity for blank/missing email
    return CandidateIdentity.objects.create(
        identity_type="anonymous"
    )
