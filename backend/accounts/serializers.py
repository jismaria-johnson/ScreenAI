from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Profile


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(
        choices=Profile.ROLE_CHOICES,
        write_only=True
    )
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True
    )
    education = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True
    )
    skills = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True
    )
    experience = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "role",
            "phone",
            "education",
            "skills",
            "experience",
        ]

    def create(self, validated_data):
        role = validated_data.pop("role")
        phone = validated_data.pop("phone", "")
        education = validated_data.pop("education", "")
        skills = validated_data.pop("skills", "")
        experience = validated_data.pop("experience", "")
        password = validated_data.pop("password")

        user = User.objects.create_user(
            username=validated_data.get("username"),
            email=validated_data.get("email", ""),
            password=password,
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )

        Profile.objects.create(
            user=user,
            role=role,
            phone=phone,
            education=education,
            skills=skills,
            experience=experience,
        )

        return user

    def to_representation(self, instance):
        profile = instance.profile

        return {
            "id": instance.id,
            "username": instance.username,
            "email": instance.email,
            "first_name": instance.first_name,
            "last_name": instance.last_name,
            "role": profile.role,
            "phone": profile.phone,
            "education": profile.education,
            "skills": profile.skills,
            "experience": profile.experience,
        }


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        source="user.username",
        read_only=True
    )
    email = serializers.EmailField(
        source="user.email",
        required=False
    )
    first_name = serializers.CharField(
        source="user.first_name",
        required=False,
        allow_blank=True
    )
    last_name = serializers.CharField(
        source="user.last_name",
        required=False,
        allow_blank=True
    )

    class Meta:
        model = Profile
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "phone",
            "education",
            "skills",
            "experience",
        ]
        read_only_fields = ["role"]

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})

        user = instance.user

        if "email" in user_data:
            user.email = user_data["email"]

        if "first_name" in user_data:
            user.first_name = user_data["first_name"]

        if "last_name" in user_data:
            user.last_name = user_data["last_name"]

        user.save()

        instance.phone = validated_data.get(
            "phone",
            instance.phone
        )
        instance.education = validated_data.get(
            "education",
            instance.education
        )
        instance.skills = validated_data.get(
            "skills",
            instance.skills
        )
        instance.experience = validated_data.get(
            "experience",
            instance.experience
        )

        instance.save()

        return instance