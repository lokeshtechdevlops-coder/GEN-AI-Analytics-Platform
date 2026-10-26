"""Natural-language adapter over the shared deterministic analytical executor."""
import time
from api.services.analytics_engine import analytics_engine
from api.services.intent_engine import intent_engine


class AnalyticsService:
    def process_analytics_query(self, query):
        started = time.perf_counter()
        plan = intent_engine.classify(query)
        parsing_ms = (time.perf_counter() - started) * 1000
        result = analytics_engine.execute(plan)
        return {
            "query": query, "generated_sql": "", "execution_backend": "pandas",
            "execution_label": "Executed with the deterministic DataFrame engine",
            "status": getattr(result, "status", "success" if result.success else "invalid_query"), "results": result.data,
            "summary_insights": result.error or ("No matching records." if not result.data else f"Calculated from {result.records_matched} matching records."),
            "recommended_chart": plan.get("chart_type") or "table",
            "parsing_latency": parsing_ms, "execution_time_ms": result.execution_time_ms,
            "hana_latency": None, "sql_determinism": None, "records_scanned": result.records_total, "records_matched": result.records_matched,
            "query_plan": plan,
        }


analytics_service = AnalyticsService()
