from django import template

from core.admin_categories import (
    category_label_for_app_label,
    category_url_for_app_label,
)

register = template.Library()


@register.simple_tag
def platform_category_label(app_label):
    return category_label_for_app_label(app_label)


@register.simple_tag
def platform_category_url(app_label):
    return category_url_for_app_label(app_label)
