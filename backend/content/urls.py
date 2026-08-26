from django.urls import path

from content.views import (
    PublicCatalogView,
    PublicDocumentDetailView,
    PublicDocumentListView,
    PublicFaqListView,
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
]
