from django.urls import path

from contact.views import (
    ContactCategoriesView,
    ContactSubmitView,
    ContactSuggestionsView,
)

urlpatterns = [
    path("contact/categories/", ContactCategoriesView.as_view(), name="contact-categories"),
    path(
        "contact/suggestions/",
        ContactSuggestionsView.as_view(),
        name="contact-suggestions",
    ),
    path("contact/", ContactSubmitView.as_view(), name="contact-submit"),
]
