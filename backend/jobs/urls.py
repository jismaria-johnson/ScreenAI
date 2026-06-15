from django.urls import path

from .views import (
    JobDetailView,
    JobListCreateView,
    PublicJobDetailView,
)


urlpatterns = [
    path(
        "",
        JobListCreateView.as_view(),
        name="job-list-create",
    ),
    path(
        "<int:pk>/",
        JobDetailView.as_view(),
        name="job-detail",
    ),
    path(
        "public/<uuid:token>/",
        PublicJobDetailView.as_view(),
        name="public-job-detail",
    ),
]