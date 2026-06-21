from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from accounts.exceptions import SessionRevokedException, InactiveAccountException

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
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        from accounts.models import UserSecurityState
        security_state, _ = UserSecurityState.objects.get_or_create(user=user)
        token["token_version"] = security_state.token_version
        token["must_change_password"] = security_state.must_change_password
        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        if not self.user.is_active:
            raise serializers.ValidationError(
                "This account is suspended."
            )

        profile = getattr(
            self.user,
            "profile",
            None,
        )

        if self.user.is_superuser or self.user.is_staff:
            role = "admin"
        elif profile and profile.role == "hr":
            role = "hr"
        else:
            raise serializers.ValidationError(
                "Only HR or Admin accounts can log in."
            )

        data["role"] = role
        from accounts.models import UserSecurityState
        security_state, _ = UserSecurityState.objects.get_or_create(user=self.user)
        data["must_change_password"] = security_state.must_change_password

        from django.utils import timezone
        self.user.last_login = timezone.now()
        self.user.save(update_fields=["last_login"])

        return data


class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        try:
            refresh = RefreshToken(attrs["refresh"])
        except TokenError as e:
            raise InvalidToken(e.args[0])

        user_id = refresh.get("user_id")
        if not user_id:
            raise SessionRevokedException()

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise SessionRevokedException()

        if not user.is_active:
            raise InactiveAccountException()

        from accounts.models import UserSecurityState
        security_state, _ = UserSecurityState.objects.get_or_create(user=user)

        token_version = refresh.get("token_version")
        if token_version is None or token_version != security_state.token_version:
            raise SessionRevokedException()

        data = super().validate(attrs)
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=True, style={"input_type": "password"})
    new_password = serializers.CharField(required=True, style={"input_type": "password"})
    confirm_password = serializers.CharField(required=True, style={"input_type": "password"})

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Incorrect current password.")
        return value

    def validate(self, attrs):
        current_password = attrs.get("current_password")
        new_password = attrs.get("new_password")
        confirm_password = attrs.get("confirm_password")

        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "New passwords do not match."})

        if new_password == current_password:
            raise serializers.ValidationError({"new_password": "New password cannot be the same as current password."})

        from django.contrib.auth.password_validation import validate_password
        user = self.context['request'].user
        try:
            validate_password(new_password, user=user)
        except Exception as e:
            raise serializers.ValidationError({"new_password": list(e.messages)})

        return attrs


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