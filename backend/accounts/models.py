from django.contrib.auth.models import AbstractUser
from django.db import models

from accounts.managers import UserManager


class User(AbstractUser):
    """
    Human login account for the SaaS application.

    Customer Users access exactly one Organization workspace through
    OrganizationMembership (roles: owner, admin, staff). They do not switch
    Organizations in one login. Platform operators may use the same model with
    Django is_staff / is_superuser for global platform-admin tooling.

    This is not an Organization Member or other operational participant record.
    The same real-world person may also have a Member profile, but User and Member
    remain separate records and lifecycles with no required link.
    """

    username = None
    email = models.EmailField("email address", unique=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        if self.email:
            self.email = type(self).objects.normalize_email(self.email)
        super().save(*args, **kwargs)
