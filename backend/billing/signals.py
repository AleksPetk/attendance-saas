from django.db.models.signals import post_save
from django.dispatch import receiver

from organizations.models import Organization


@receiver(post_save, sender=Organization)
def grant_builtin_trial_on_organization_create(
    sender, instance, created, raw=False, **kwargs
):
    if not created or raw:
        return
    from billing.builtin_trial import grant_builtin_trial_for_new_workspace

    grant_builtin_trial_for_new_workspace(instance)
