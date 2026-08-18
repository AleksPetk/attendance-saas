from django.db import connection
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """
    Simple health endpoint for stack verification.

    Confirms the API is running and can reach PostgreSQL.
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        database_status = "disconnected"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            database_status = "connected"
        except Exception:
            database_status = "disconnected"

        return Response(
            {
                "status": "ok" if database_status == "connected" else "degraded",
                "service": "attendance-saas-backend",
                "database": database_status,
            }
        )
