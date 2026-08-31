from django.urls import path

from content.views import (
    PublicCatalogView,
    PublicDocumentDetailView,
    PublicDocumentListView,
    PublicFaqListView,
)
from content.announcement_views import (
    AnnouncementListView,
    AnnouncementMarkVisibleReadView,
    AnnouncementReadView,
)

urlpatterns = [
    path(
        "content/documents/",
        PublicDocumentListView.as_view(),
        name="content-document-list",
    ),
    path(
        "content/documents/<slug:slug>/",
        PublicDocumentDetailView.as_view(),
        name="content-document-detail",
    ),
    path(
        "content/catalog/",
        PublicCatalogView.as_view(),
        name="content-catalog",
    ),
    path(
        "content/faq/",
        PublicFaqListView.as_view(),
        name="content-faq-list",
    ),
    path(
        "announcements/",
        AnnouncementListView.as_view(),
        name="announcement-list",
    ),
    path(
        "announcements/mark-read/",
        AnnouncementMarkVisibleReadView.as_view(),
        name="announcement-mark-visible-read",
    ),
    path(
        "announcements/<int:announcement_id>/read/",
        AnnouncementReadView.as_view(),
        name="announcement-read",
    ),
]
