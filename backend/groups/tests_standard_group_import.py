"""One-time Standard Group → Structured Class snapshot import."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupType,
)
from groups.readiness import compute_group_setup_status
from kiosk_builder.models import ensure_group_kiosk_design, ensure_group_kiosk_settings
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member, MemberStatus
from organizations.models import Organization, OrganizationPlan

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


class StandardGroupImportTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("import-owner@example.com")
        )
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan"])
        self.other_org = Organization.objects.create_with_owner(
            owner=create_user("import-other@example.com")
        )
        self.user = self.organization.owner
        self.client = APIClient()
        force_platform_admin_login(self.client, self.user)

        self.source = Group.objects.create_group(
            organization=self.organization,
            name="Fitness",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            check_out_enabled=True,
            require_pin=False,
            require_email=False,
        )
        configure_group_kiosk_for_launch(self.source, exit_code="2222", use_pin=False)
        ensure_group_kiosk_design(self.source)

        self.member_aleks = Member.objects.create(
            organization=self.organization,
            name="Aleks",
            email="aleks@import.example",
        )
        self.member_nami = Member.objects.create(
            organization=self.organization,
            name="Nami",
            email="nami@import.example",
        )
        self.membership_aleks = GroupMembership.objects.create(
            organization=self.organization,
            group=self.source,
            member=self.member_aleks,
            participation_email="aleks-fit@example.com",
        )
        self.membership_aleks.set_participation_pin("1111")
        self.membership_aleks.save(update_fields=["participation_pin_hash"])
        self.membership_nami = GroupMembership.objects.create(
            organization=self.organization,
            group=self.source,
            member=self.member_nami,
            participation_email="nami-fit@example.com",
        )
        self.membership_nami.set_participation_pin("2222")
        self.membership_nami.save(update_fields=["participation_pin_hash"])
        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.source,
            name="Jimi",
            email="jimi@example.com",
        )
        self.visitor.set_participation_pin("3333")
        self.visitor.save(update_fields=["pin_hash"])
        ActionRecord.objects.create(
            organization=self.organization,
            group=self.source,
            group_name_snapshot=self.source.name,
            source_group_id=self.source.id,
            participant_kind="member",
            member=self.member_aleks,
            participant_name_snapshot="Aleks",
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
        )

        self.destination = Group.objects.create_group(
            organization=self.organization,
            name="School Event",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=False,
            require_pin=True,
            require_email=False,
            require_class_pin=False,
        )
        configure_group_kiosk_for_launch(self.destination, exit_code="1111", use_pin=True)

    def _sources_url(self, group=None):
        group = group or self.destination
        return reverse("group-section-import-sources", kwargs={"group_pk": group.pk})

    def _import_url(self, group=None):
        group = group or self.destination
        return reverse(
            "group-section-import-standard-group",
            kwargs={"group_pk": group.pk},
        )

    def test_a_standard_group_appears_as_valid_source(self):
        response = self.client.get(self._sources_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data}
        self.assertIn(self.source.pk, ids)
        fitness = next(item for item in response.data if item["id"] == self.source.pk)
        self.assertEqual(fitness["participant_count"], 3)

    def test_b_structured_group_rejected_as_source(self):
        other_structured = Group.objects.create_group(
            organization=self.organization,
            name="Other Structured",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
        )
        sources = self.client.get(self._sources_url())
        self.assertNotIn(other_structured.pk, {item["id"] for item in sources.data})

        response = self.client.post(
            self._import_url(),
            {"source_group_id": other_structured.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "source_not_standard")

    def test_c_cross_tenant_source_rejected(self):
        foreign = Group.objects.create_group(
            organization=self.other_org,
            name="Foreign Fitness",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
        )
        response = self.client.post(
            self._import_url(),
            {"source_group_id": foreign.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "source_not_found")

    def test_d_through_i_copy_participants_and_codes(self):
        source_code = self.membership_aleks.group_participant_code
        response = self.client.post(
            self._import_url(),
            {"source_group_id": self.source.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["section"]["name"], "Fitness")
        self.assertEqual(response.data["participants_copied"], 3)
        self.assertEqual(response.data["members_copied"], 2)
        self.assertEqual(response.data["visitors_copied"], 1)
        self.assertEqual(response.data["members_skipped"], 0)

        section = GroupSection.objects.get(pk=response.data["section"]["id"])
        dest_aleks = GroupMembership.objects.get(
            group=self.destination,
            member=self.member_aleks,
            section=section,
        )
        self.assertNotEqual(dest_aleks.group_participant_code, source_code)
        self.assertTrue(dest_aleks.group_participant_code.startswith(f"G{self.destination.pk}-"))
        self.assertEqual(dest_aleks.participation_email, "aleks-fit@example.com")
        self.assertTrue(dest_aleks.check_effective_pin("1111"))
        self.assertTrue(dest_aleks.has_participation_pin)
        self.assertNotEqual(dest_aleks.participation_pin_hash, "1111")
        self.assertNotEqual(dest_aleks.pk, self.membership_aleks.pk)

        visitor = GroupOnlyParticipant.objects.get(group=self.destination, section=section)
        self.assertEqual(visitor.name, "Jimi")
        self.assertEqual(visitor.email, "jimi@example.com")
        self.assertTrue(visitor.check_pin("3333"))
        self.assertTrue(visitor.has_pin)
        self.assertNotEqual(visitor.pin_hash, "3333")
        self.assertNotEqual(visitor.pk, self.visitor.pk)
        self.assertNotEqual(visitor.group_participant_code, self.visitor.group_participant_code)

    def test_j_k_l_source_settings_design_history_not_copied(self):
        response = self.client.post(
            self._import_url(),
            {"source_group_id": self.source.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.destination.refresh_from_db()
        self.assertTrue(self.destination.require_pin)
        self.assertFalse(self.destination.check_out_enabled)
        self.assertNotEqual(
            self.destination.kiosk_settings.exit_code_hash,
            self.source.kiosk_settings.exit_code_hash,
        )
        self.assertEqual(
            ActionRecord.objects.filter(group=self.destination).count(),
            0,
        )
        self.assertEqual(
            ActionRecord.objects.filter(group=self.source).count(),
            1,
        )

    def test_m_n_independence_after_import(self):
        response = self.client.post(
            self._import_url(),
            {"source_group_id": self.source.pk},
            format="json",
        )
        section_id = response.data["section"]["id"]
        clara = Member.objects.create(
            organization=self.organization,
            name="Clara",
            email="clara@import.example",
        )
        clara_membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.source,
            member=clara,
        )
        clara_membership.set_participation_pin("4444")
        clara_membership.save(update_fields=["participation_pin_hash"])
        self.assertFalse(
            GroupMembership.objects.filter(
                group=self.destination,
                member=clara,
            ).exists()
        )

        dest_aleks = GroupMembership.objects.get(
            group=self.destination,
            member=self.member_aleks,
            section_id=section_id,
        )
        dest_aleks.set_participation_pin("9999")
        dest_aleks.save(update_fields=["participation_pin_hash"])
        self.membership_aleks.refresh_from_db()
        self.assertTrue(self.membership_aleks.check_effective_pin("1111"))
        self.assertFalse(self.membership_aleks.check_effective_pin("9999"))

        self.source.name = "Fitness Renamed"
        self.source.save()
        section = GroupSection.objects.get(pk=section_id)
        self.assertEqual(section.name, "Fitness")

    def test_o_archived_participants_excluded(self):
        archived_member = Member.objects.create(
            organization=self.organization,
            name="Old",
            email="old@import.example",
        )
        archived_membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.source,
            member=archived_member,
        )
        archived_membership.set_participation_pin("5555")
        archived_membership.save(update_fields=["participation_pin_hash"])
        archived_member.archive()
        inactive_visitor = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.source,
            name="Gone",
        )
        inactive_visitor.set_participation_pin("6666")
        inactive_visitor.save(update_fields=["pin_hash"])
        inactive_visitor.archive()

        response = self.client.post(
            self._import_url(),
            {"source_group_id": self.source.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["participants_copied"], 3)
        self.assertFalse(
            GroupMembership.objects.filter(
                group=self.destination,
                member=archived_member,
            ).exists()
        )
        self.assertFalse(
            GroupOnlyParticipant.objects.filter(
                group=self.destination,
                name="Gone",
            ).exists()
        )

    def test_p_destination_readiness_recalculated(self):
        response = self.client.post(
            self._import_url(),
            {"source_group_id": self.source.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Destination require_pin=True; copied participants have pins → complete
        # unless Class PIN required. Here Class PIN off and pins present.
        readiness = compute_group_setup_status(self.destination)
        self.assertTrue(readiness["setup_complete"])
        self.assertEqual(response.data["readiness"]["setup_complete"], True)

        # Missing PIN case
        bare = Group.objects.create_group(
            organization=self.organization,
            name="Bare Source",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
        )
        bare_member = Member.objects.create(
            organization=self.organization,
            name="NoPin",
            email="nopin@import.example",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=bare,
            member=bare_member,
        )
        dest2 = Group.objects.create_group(
            organization=self.organization,
            name="Strict Dest",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            require_pin=True,
        )
        configure_group_kiosk_for_launch(dest2, exit_code="3333", use_pin=True)
        import_resp = self.client.post(
            reverse(
                "group-section-import-standard-group",
                kwargs={"group_pk": dest2.pk},
            ),
            {"source_group_id": bare.pk},
            format="json",
        )
        self.assertEqual(import_resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(import_resp.data["readiness"]["setup_complete"])
        self.assertEqual(import_resp.data["readiness"]["missing_pin_count"], 1)

    def test_q_duplicate_member_skipped(self):
        class_a = GroupSection.objects.create_section(
            group=self.destination,
            name="Already Here",
        )
        existing = GroupMembership.objects.create(
            organization=self.organization,
            group=self.destination,
            member=self.member_aleks,
            section=class_a,
        )
        existing.set_participation_pin("1111")
        existing.save(update_fields=["participation_pin_hash"])
        response = self.client.post(
            self._import_url(),
            {"source_group_id": self.source.pk, "name": "Fitness Copy"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["members_skipped"], 1)
        self.assertEqual(response.data["members_copied"], 1)
        self.assertEqual(response.data["visitors_copied"], 1)
        self.assertIn("skipped", response.data["message"].lower())
        self.assertEqual(
            GroupMembership.objects.filter(
                group=self.destination,
                member=self.member_aleks,
            ).count(),
            1,
        )

    def test_custom_class_name_and_source_unchanged(self):
        source_settings = ensure_group_kiosk_settings(self.source)
        before_hash = source_settings.exit_code_hash
        before_codes = {
            self.membership_aleks.group_participant_code,
            self.membership_nami.group_participant_code,
            self.visitor.group_participant_code,
        }
        response = self.client.post(
            self._import_url(),
            {
                "source_group_id": self.source.pk,
                "name": "Imported Fitness",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["section"]["name"], "Imported Fitness")
        self.source.refresh_from_db()
        self.assertEqual(self.source.name, "Fitness")
        source_settings.refresh_from_db()
        self.assertEqual(source_settings.exit_code_hash, before_hash)
        self.membership_aleks.refresh_from_db()
        self.membership_nami.refresh_from_db()
        self.visitor.refresh_from_db()
        self.assertEqual(
            {
                self.membership_aleks.group_participant_code,
                self.membership_nami.group_participant_code,
                self.visitor.group_participant_code,
            },
            before_codes,
        )

    def test_import_on_standard_destination_rejected(self):
        response = self.client.post(
            reverse(
                "group-section-import-standard-group",
                kwargs={"group_pk": self.source.pk},
            ),
            {"source_group_id": self.source.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
