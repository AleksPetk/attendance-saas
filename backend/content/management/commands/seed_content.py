from django.core.management.base import BaseCommand

from content.seed import seed_documents, seed_faq_entries


class Command(BaseCommand):
    help = (
        "Create canonical public documents if missing. "
        "Does not overwrite existing rows unless --overwrite is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Replace body and metadata from seed files. Destroys admin edits.",
        )

    def handle(self, *args, **options):
        created, updated = seed_documents(overwrite=options["overwrite"])
        faq_created, faq_updated = seed_faq_entries(overwrite=options["overwrite"])
        created.extend(faq_created)
        updated.extend(faq_updated)
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created: {', '.join(created)}"))
        if updated:
            self.stdout.write(self.style.WARNING(f"Overwritten: {', '.join(updated)}"))
        if not created and not updated:
            self.stdout.write("Canonical documents already exist.")
