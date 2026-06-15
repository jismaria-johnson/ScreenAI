from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
)

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

    phone = serializers.CharField(
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
            "phone",
            "password",
            "confirm_password",
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

        return attrs

    def create(self, validated_data):
        phone = validated_data.pop(
            "phone",
            "",
        ).strip()

        password = validated_data.pop(
            "password"
        )

        user = User.objects.create_user(
            password=password,
            **validated_data,
        )

        profile, _ = Profile.objects.get_or_create(
            user=user
        )

        profile.role = "hr"
        profile.phone = phone
        profile.education = ""
        profile.skills = ""
        profile.experience = ""
        profile.save()

        return user


class HRTokenObtainPairSerializer(
    TokenObtainPairSerializer
):
    def validate(self, attrs):
        data = super().validate(attrs)

        profile = getattr(
            self.user,
            "profile",
            None,
        )

        if not profile or profile.role != "hr":
            raise serializers.ValidationError(
                "Only HR accounts can log in."
            )

        data["role"] = "hr"

        return data


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

        instance.save()

        return instance