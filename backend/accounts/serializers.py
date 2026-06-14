from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Profile


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        min_length=6,
        style={"input_type": "password"},
    )

    confirm_password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )

    role = serializers.ChoiceField(
        choices=Profile.ROLE_CHOICES,
        write_only=True,
    )

    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )

    education = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )

    class Meta:
        model = User
        fields = [
            "username",
            "first_name",
            "last_name",
            "email",
            "password",
            "confirm_password",
            "role",
            "phone",
            "education",
        ]

    def validate_username(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Username is required."
            )

        if User.objects.filter(
            username__iexact=value
        ).exists():
            raise serializers.ValidationError(
                "A user with this username already exists."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        if not value:
            raise serializers.ValidationError(
                "Email is required."
            )

        if User.objects.filter(
            email__iexact=value
        ).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )

        return value

    def validate(self, attrs):
        password = attrs.get("password")
        confirm_password = attrs.pop(
            "confirm_password",
            None,
        )

        if password != confirm_password:
            raise serializers.ValidationError(
                {
                    "confirm_password": (
                        "Passwords do not match."
                    )
                }
            )

        role = attrs.get("role")

        if role == "candidate":
            phone = attrs.get("phone", "").strip()

            if not phone:
                raise serializers.ValidationError(
                    {
                        "phone": (
                            "Phone number is required "
                            "for candidates."
                        )
                    }
                )

        return attrs

    def create(self, validated_data):
        role = validated_data.pop("role")

        phone = validated_data.pop(
            "phone",
            "",
        ).strip()

        education = validated_data.pop(
            "education",
            "",
        ).strip()

        password = validated_data.pop("password")

        user = User.objects.create_user(
            password=password,
            **validated_data,
        )

        profile, _ = Profile.objects.get_or_create(
            user=user
        )

        profile.role = role
        profile.phone = phone
        profile.education = education

        # These fields remain empty because skills and
        # experience are extracted from uploaded resumes.
        profile.skills = ""
        profile.experience = ""

        profile.save()

        return user


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        source="user.username",
        read_only=True,
    )

    first_name = serializers.CharField(
        source="user.first_name",
        required=False,
        allow_blank=True,
    )

    last_name = serializers.CharField(
        source="user.last_name",
        required=False,
        allow_blank=True,
    )

    email = serializers.EmailField(
        source="user.email",
        required=False,
    )

    role = serializers.CharField(
        read_only=True,
    )

    class Meta:
        model = Profile
        fields = [
            "username",
            "first_name",
            "last_name",
            "email",
            "role",
            "phone",
            "education",
        ]

    def validate_email(self, value):
        value = value.strip().lower()

        current_user = self.instance.user

        email_exists = (
            User.objects.filter(
                email__iexact=value
            )
            .exclude(id=current_user.id)
            .exists()
        )

        if email_exists:
            raise serializers.ValidationError(
                "A user with this email already exists."
            )

        return value

    def validate_phone(self, value):
        return value.strip()

    def validate_education(self, value):
        return value.strip()

    def update(self, instance, validated_data):
        user_data = validated_data.pop(
            "user",
            {},
        )

        user = instance.user

        if "first_name" in user_data:
            user.first_name = user_data[
                "first_name"
            ].strip()

        if "last_name" in user_data:
            user.last_name = user_data[
                "last_name"
            ].strip()

        if "email" in user_data:
            user.email = user_data[
                "email"
            ].strip().lower()

        user.save()

        instance.phone = validated_data.get(
            "phone",
            instance.phone,
        )

        instance.education = validated_data.get(
            "education",
            instance.education,
        )

        instance.save()

        return instance