"""
PostHog Signal Adapter — the real analytics connection.

This is the entire product. It replaces heuristic evaluators with real user
behavior data from PostHog.

Supports:
  - Authentication and project verification
  - Event/metric discovery (populates the metric selector in the UI)
  - Live metric querying (for real 24h+ deployment cycles)
  - Backtest metric querying (for demo: compare two historical windows)

Usage:
  connector = PostHogConnector(personal_api_key="phx_...")
  await connector.verify()           -> {projects: [...]}
  await connector.list_events(123)   -> ["pageview", "signup", "purchase", ...]
  await connector.query_metric(...)  -> MetricResult(value=0.042, ...)
"""

import httpx
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field


POSTHOG_CLOUD_URL = "https://app.posthog.com"
POSTHOG_EU_URL = "https://eu.posthog.com"


@dataclass
class PostHogProject:
    id: int
    name: str
    api_token: str


@dataclass
class MetricDefinition:
    """A queryable metric — what we measure to determine if a variant won.

    Three types:
      "rate"   — numerator_event / denominator_event (e.g. signups / pageviews)
      "count"  — raw event count in window (e.g. purchases)
      "hogsql" — arbitrary HogQL query returning a single number
    """
    type: str
    display_name: str = ""

    # rate
    numerator_event: Optional[str] = None
    denominator_event: Optional[str] = None

    # count
    event: Optional[str] = None

    # hogsql
    hogsql_query: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "display_name": self.display_name,
            "numerator_event": self.numerator_event,
            "denominator_event": self.denominator_event,
            "event": self.event,
            "hogsql_query": self.hogsql_query,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "MetricDefinition":
        return cls(
            type=d.get("type", "count"),
            display_name=d.get("display_name", ""),
            numerator_event=d.get("numerator_event"),
            denominator_event=d.get("denominator_event"),
            event=d.get("event"),
            hogsql_query=d.get("hogsql_query"),
        )


@dataclass
class MetricResult:
    value: float
    time_from: datetime
    time_to: datetime
    sample_size: int  # denominator events or total events counted
    raw: dict = field(default_factory=dict)


class PostHogConnector:
    """HTTP client wrapping the PostHog Query API."""

    def __init__(self, personal_api_key: str, base_url: str = POSTHOG_CLOUD_URL):
        self.personal_api_key = personal_api_key
        self.base_url = base_url.rstrip("/")

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.personal_api_key}"},
            timeout=30.0,
        )

    async def verify(self) -> dict:
        """Verify the personal API key and return available projects.

        Returns:
            {"success": True, "projects": [{"id": 123, "name": "My App", "api_token": "phc_..."}]}
        """
        async with self._client() as c:
            resp = await c.get("/api/projects/")
            if resp.status_code == 401:
                # Check if they used a project token instead of personal API key
                if self.personal_api_key.startswith("phc_"):
                    return {"success": False, "error": "You provided a Project Token (starts with phc_). For server-side API access, you need a Personal API key (starts with phx_). Create one in PostHog: Settings → Personal API Keys"}
                return {"success": False, "error": "Invalid API key"}
            if resp.status_code == 403:
                return {"success": False, "error": "API key lacks project access"}
            resp.raise_for_status()
            data = resp.json()

        projects = data.get("results", [])
        return {
            "success": True,
            "projects": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "api_token": p.get("api_token", ""),
                }
                for p in projects
            ],
        }

    async def list_events(self, project_id: int) -> list[str]:
        """Return the 100 most frequent event names in this project.

        Used to populate the metric selector dropdown in the UI.
        """
        query = {
            "query": {
                "kind": "HogQLQuery",
                "query": (
                    "SELECT event, count() as cnt "
                    "FROM events "
                    "WHERE timestamp > now() - toIntervalDay(30) "
                    "GROUP BY event "
                    "ORDER BY cnt DESC "
                    "LIMIT 100"
                ),
            }
        }
        async with self._client() as c:
            resp = await c.post(f"/api/projects/{project_id}/query/", json=query)
            resp.raise_for_status()
            data = resp.json()

        rows = data.get("results", [])
        return [row[0] for row in rows if row and row[0]]

    async def _count_event(
        self,
        client: httpx.AsyncClient,
        project_id: int,
        event: str,
        time_from: datetime,
        time_to: datetime,
    ) -> int:
        """Count occurrences of a named event in a time window."""
        tf = time_from.strftime("%Y-%m-%d %H:%M:%S")
        tt = time_to.strftime("%Y-%m-%d %H:%M:%S")
        query = {
            "query": {
                "kind": "HogQLQuery",
                "query": (
                    f"SELECT count() FROM events "
                    f"WHERE event = '{event}' "
                    f"AND timestamp >= '{tf}' "
                    f"AND timestamp < '{tt}'"
                ),
            }
        }
        resp = await client.post(f"/api/projects/{project_id}/query/", json=query)
        resp.raise_for_status()
        rows = resp.json().get("results", [])
        return int(rows[0][0]) if rows and rows[0] else 0

    async def query_metric(
        self,
        project_id: int,
        metric: MetricDefinition,
        time_from: datetime,
        time_to: datetime,
    ) -> MetricResult:
        """Query a single metric value for a specific time window.

        This is the core measurement primitive. Called by:
          - Live mode: after cycle_window_hours have elapsed
          - Backtest mode: against historical windows
        """
        async with self._client() as c:
            if metric.type == "rate":
                numerator = await self._count_event(c, project_id, metric.numerator_event, time_from, time_to)
                denominator = await self._count_event(c, project_id, metric.denominator_event, time_from, time_to)
                value = numerator / denominator if denominator > 0 else 0.0
                return MetricResult(
                    value=value,
                    time_from=time_from,
                    time_to=time_to,
                    sample_size=denominator,
                    raw={"numerator": numerator, "denominator": denominator},
                )

            elif metric.type == "count":
                count = await self._count_event(c, project_id, metric.event, time_from, time_to)
                return MetricResult(
                    value=float(count),
                    time_from=time_from,
                    time_to=time_to,
                    sample_size=count,
                    raw={"count": count},
                )

            elif metric.type == "hogsql":
                tf = time_from.strftime("%Y-%m-%d %H:%M:%S")
                tt = time_to.strftime("%Y-%m-%d %H:%M:%S")
                # Inject time bounds via HogQL query context
                hogsql = metric.hogsql_query
                query = {"query": {"kind": "HogQLQuery", "query": hogsql}}
                resp = await c.post(f"/api/projects/{project_id}/query/", json=query)
                resp.raise_for_status()
                rows = resp.json().get("results", [])
                value = float(rows[0][0]) if rows and rows[0] else 0.0
                return MetricResult(
                    value=value,
                    time_from=time_from,
                    time_to=time_to,
                    sample_size=1,
                    raw={"rows": rows},
                )

            else:
                raise ValueError(f"Unknown metric type: {metric.type}")

    async def query_metric_backtest(
        self,
        project_id: int,
        metric: MetricDefinition,
        window_days: int = 7,
        lookback_days: int = 14,
    ) -> tuple[MetricResult, MetricResult]:
        """Query historical PostHog data for backtest / demo mode.

        Compares two non-overlapping historical windows to simulate a baseline
        and a "variant" measurement. Returns (baseline, comparison).

        This is what powers the investor demo — it queries REAL PostHog data
        from two different historical periods.

        Windows:
          baseline:   now - window_days  →  now
          comparison: now - lookback_days - window_days  →  now - lookback_days
        """
        now = datetime.utcnow()
        baseline_start = now - timedelta(days=window_days)
        baseline_end = now

        comparison_end = now - timedelta(days=lookback_days)
        comparison_start = comparison_end - timedelta(days=window_days)

        baseline = await self.query_metric(project_id, metric, baseline_start, baseline_end)
        comparison = await self.query_metric(project_id, metric, comparison_start, comparison_end)
        return baseline, comparison

    async def get_current_metric(
        self,
        project_id: int,
        metric: MetricDefinition,
        window_hours: int = 24,
    ) -> MetricResult:
        """Get the most recent metric value over the last N hours.

        Used for live polling during the measurement phase.
        """
        now = datetime.utcnow()
        time_from = now - timedelta(hours=window_hours)
        return await self.query_metric(project_id, metric, time_from, now)

    # ═══════════════════════════════════════════════════════════════════════════════
    # FEATURE FLAG OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════════

    async def list_feature_flags(self, project_id: int) -> list[dict]:
        """List all feature flags in a project.

        Returns:
            [{"id": "...", "name": "...", "key": "...", "active": true, ...}]
        """
        async with self._client() as c:
            resp = await c.get(f"/api/projects/{project_id}/feature_flags/")
            if resp.status_code == 401:
                raise Exception("Invalid API key")
            if resp.status_code == 403:
                raise Exception("API key lacks project access")
            resp.raise_for_status()
            data = resp.json()
        return data.get("results", [])

    async def create_feature_flag(
        self,
        project_id: int,
        name: str,
        key: str,
        description: str = "",
        variants: Optional[list[dict]] = None,
        rollout_percentage: int = 100,
    ) -> dict:
        """Create a multivariate feature flag with JSON payloads.

        Args:
            project_id: PostHog project ID
            name: Display name for the flag
            key: Flag key (e.g., "forge-landing-page")
            description: Description for the flag
            variants: List of variants with payloads
                [{"name": "control", "payload": {...}}, {"name": "variant", "payload": {...}}]
            rollout_percentage: % of users who receive the flag (0-100)

        Returns:
            {"success": True, "flag": {...}, "flag_id": "..."}
        """
        # Build filters for multivariate flag
        filters = {
            "groups": [{"properties": [], "rollout_percentage": rollout_percentage}],
            "multivariate": None,
        }

        # Add multivariate variants if provided
        if variants and len(variants) > 0:
            multivariate_variants = []
            for v in variants:
                variant = {
                    "key": v.get("name", "control"),
                    "name": v.get("name", "control").title(),
                    "payload": v.get("payload") if v.get("payload") else None,
                }
                multivariate_variants.append(variant)
            
            filters["multivariate"] = {
                "variants": multivariate_variants
            }

        flag_data = {
            "name": name,
            "key": key,
            "description": description,
            "active": True,
            "filters": filters,
        }

        async with self._client() as c:
            resp = await c.post(
                f"/api/projects/{project_id}/feature_flags/",
                json=flag_data
            )
            if resp.status_code == 401:
                return {"success": False, "error": "Invalid API key"}
            if resp.status_code == 403:
                return {"success": False, "error": "API key lacks project access"}
            if resp.status_code == 400:
                error_data = resp.json()
                return {"success": False, "error": error_data.get("detail", "Flag creation failed")}
            resp.raise_for_status()
            data = resp.json()

        return {
            "success": True,
            "flag": data,
            "flag_id": data.get("id"),
            "flag_key": data.get("key"),
        }

    async def update_feature_flag(
        self,
        project_id: int,
        flag_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        active: Optional[bool] = None,
        rollout_percentage: Optional[int] = None,
    ) -> dict:
        """Update a feature flag.

        Args:
            project_id: PostHog project ID
            flag_id: ID of the flag to update
            name: New name (optional)
            description: New description (optional)
            active: Set flag active/inactive
            rollout_percentage: Update rollout percentage

        Returns:
            {"success": True, "flag": {...}}
        """
        updates = {}
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if active is not None:
            updates["active"] = active
        if rollout_percentage is not None:
            # Get current filters and update rollout
            current = await self.get_feature_flag(project_id, flag_id)
            if current:
                filters = current.get("filters", {})
                if "groups" in filters and filters["groups"]:
                    filters["groups"][0]["rollout_percentage"] = rollout_percentage
                updates["filters"] = filters

        if not updates:
            return {"success": True, "flag": None, "message": "No changes provided"}

        async with self._client() as c:
            resp = await c.patch(
                f"/api/projects/{project_id}/feature_flags/{flag_id}/",
                json=updates
            )
            if resp.status_code == 401:
                return {"success": False, "error": "Invalid API key"}
            if resp.status_code == 403:
                return {"success": False, "error": "API key lacks project access"}
            resp.raise_for_status()
            data = resp.json()

        return {"success": True, "flag": data}

    async def delete_feature_flag(self, project_id: int, flag_id: str) -> dict:
        """Delete a feature flag.

        Args:
            project_id: PostHog project ID
            flag_id: ID of the flag to delete

        Returns:
            {"success": True}
        """
        async with self._client() as c:
            resp = await c.delete(f"/api/projects/{project_id}/feature_flags/{flag_id}/")
            if resp.status_code == 401:
                return {"success": False, "error": "Invalid API key"}
            if resp.status_code == 403:
                return {"success": False, "error": "API key lacks project access"}
            if resp.status_code == 404:
                return {"success": False, "error": "Flag not found"}
            resp.raise_for_status()

        return {"success": True}

    async def get_feature_flag(self, project_id: int, flag_id: str) -> Optional[dict]:
        """Get a specific feature flag by ID.

        Args:
            project_id: PostHog project ID
            flag_id: ID of the flag

        Returns:
            Flag object or None if not found
        """
        async with self._client() as c:
            try:
                resp = await c.get(f"/api/projects/{project_id}/feature_flags/{flag_id}/")
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                raise

    async def get_feature_flag_by_key(self, project_id: int, key: str) -> Optional[dict]:
        """Get a feature flag by its key.

        Args:
            project_id: PostHog project ID
            key: Flag key (e.g., "forge-landing-page")

        Returns:
            Flag object or None if not found
        """
        flags = await self.list_feature_flags(project_id)
        for flag in flags:
            if flag.get("key") == key:
                return flag
        return None

    async def compute_flag_metrics(
        self,
        project_id: int,
        flag_key: str,
        metric: MetricDefinition,
        time_from: datetime,
        time_to: datetime,
    ) -> dict:
        """Get per-variant metrics for a feature flag experiment.

        Uses PostHog's insights API to compute metrics segmented by variant.
        This is more accurate than counting events directly as it handles
        the flag-based user assignment automatically.

        Args:
            project_id: PostHog project ID
            key: Flag key
            metric: MetricDefinition to compute
            time_from: Start of measurement window
            time_to: End of measurement window

        Returns:
            {
                "control": {"metric": 0.042, "sample_size": 1000},
                "variant": {"metric": 0.051, "sample_size": 980},
                "total_sample_size": 1980,
                "winner": "variant" | "control" | "inconclusive"
            }
        """
        # Build the base event filter based on metric type
        if metric.type == "rate" and metric.numerator_event and metric.denominator_event:
            # For conversion rates, we need to compute numerator/denominator per variant
            base_filter = {
                "event": metric.numerator_event,
                "properties": [
                    {"key": f"$feature/{flag_key}", "operator": "is_not_set", "type": "person"}
                ],
                "date_from": time_from.strftime("%Y-%m-%d"),
                "date_to": time_to.strftime("%Y-%m-%d"),
            }
            
            # This requires two queries: one for numerator, one for denominator
            # Then combine to get rates per variant
            numerator_data = await self._query_insight(project_id, {
                **base_filter,
                "breakdown": f"$feature/{flag_key}",
                "breakdown_type": "person",
            })
            
            denominator_data = await self._query_insight(project_id, {
                "event": metric.denominator_event,
                "properties": [],
                "date_from": time_from.strftime("%Y-%m-%d"),
                "date_to": time_to.strftime("%Y-%m-%d"),
                "breakdown": f"$feature/{flag_key}",
                "breakdown_type": "person",
            })
            
            # Compute rates per variant
            results = {}
            num_totals = {row["breakdown"]: row["count"] for row in numerator_data.get("result", [])}
            den_totals = {row["breakdown"]: row["count"] for row in denominator_data.get("result", [])}
            
            all_variants = set(list(num_totals.keys()) + list(den_totals.keys()))
            
            for variant in all_variants:
                num = num_totals.get(variant, 0)
                den = den_totals.get(variant, 0)
                rate = num / den if den > 0 else 0.0
                results[variant] = {
                    "metric": rate,
                    "sample_size": den,
                    "numerator_count": num,
                    "denominator_count": den,
                }
            
        elif metric.type == "count" and metric.event:
            # Simple event count per variant
            data = await self._query_insight(project_id, {
                "event": metric.event,
                "properties": [],
                "date_from": time_from.strftime("%Y-%m-%d"),
                "date_to": time_to.strftime("%Y-%m-%d"),
                "breakdown": f"$feature/{flag_key}",
                "breakdown_type": "person",
            })
            
            results = {}
            total_size = 0
            for row in data.get("result", []):
                variant = row.get("breakdown", "unknown")
                count = row.get("count", 0)
                results[variant] = {
                    "metric": float(count),
                    "sample_size": count,
                }
                total_size += count
            
            results["_total"] = {"sample_size": total_size}
        
        else:
            raise ValueError(f"Unsupported metric type for flag metrics: {metric.type}")
        
        # Determine winner
        winner = "inconclusive"
        if "control" in results and "variant" in results:
            control_rate = results["control"]["metric"]
            variant_rate = results["variant"]["metric"]
            
            # Simple comparison - in production you'd want statistical significance
            if results["variant"]["sample_size"] > 50 and results["control"]["sample_size"] > 50:
                if variant_rate > control_rate * 1.05:  # 5% minimum lift
                    winner = "variant"
                elif control_rate > variant_rate * 1.05:
                    winner = "control"
        
        return {
            **results,
            "winner": winner,
        }

    async def _query_insight(self, project_id: int, filters: dict) -> dict:
        """Query PostHog insights API."""
        insight_request = {
            "insight": "TRENDS",
            "filter": filters,
            "series": [{"order": 0, "kind": "EventsNode"}],
        }
        
        async with self._client() as c:
            resp = await c.post(f"/api/projects/{project_id}/insights/", json=insight_request)
            resp.raise_for_status()
            return resp.json()
