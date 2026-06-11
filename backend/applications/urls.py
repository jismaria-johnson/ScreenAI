from django.urls import path
from .views import ApplyJobView, MyApplicationsView, HRApplicationsView


urlpatterns = [
    path("apply/", ApplyJobView.as_view(), name="apply_job"),
    path("my/", MyApplicationsView.as_view(), name="my_applications"),
    path("hr/", HRApplicationsView.as_view(), name="hr_applications"),
]