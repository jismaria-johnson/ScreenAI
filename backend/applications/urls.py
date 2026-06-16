from django.urls import path
from .views import (
    ApplyJobView,
    MyApplicationsView,
    HRApplicationsView,
    UpdateApplicationStatusView,
    PublicApplicationCreateView,
)
from .admin_views import (
    AdminHRListView,
    AdminHiredCandidatesListView,
    AdminCandidateProgressionCreateView,
    AdminCandidateProgressionDetailView,
    AdminToggleHRActiveView,
    AdminSystemActivityListView,
)


urlpatterns = [
    path("apply/", ApplyJobView.as_view(), name="apply_job"),
    path("my/", MyApplicationsView.as_view(), name="my_applications"),
    path("hr/", HRApplicationsView.as_view(), name="hr_applications"),
    path("<int:pk>/status/", UpdateApplicationStatusView.as_view(), name="update_application_status"),
    path("public/<uuid:token>/", PublicApplicationCreateView.as_view(), name="public_application_create"),
    path("admin/hrs/", AdminHRListView.as_view(), name="admin_hr_list"),
    path("admin/hrs/<int:pk>/toggle/", AdminToggleHRActiveView.as_view(), name="admin_hr_toggle_active"),
    path("admin/activity-log/", AdminSystemActivityListView.as_view(), name="admin_activity_log"),
    path("admin/hired-candidates/", AdminHiredCandidatesListView.as_view(), name="admin_hired_candidates_list"),
    path("admin/<int:pk>/progression/", AdminCandidateProgressionCreateView.as_view(), name="admin_candidate_progression_create"),
    path("admin/progression/<int:pk>/", AdminCandidateProgressionDetailView.as_view(), name="admin_candidate_progression_detail"),
]