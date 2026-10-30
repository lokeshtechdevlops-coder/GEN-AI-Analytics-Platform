"""Semantic-only intent planning. Proposals are validated before any execution."""
import json
import re

from fastapi import HTTPException
from api.models.execution_context import current_selection
from api.models.query_plan import QueryPlan
from api.platform.semantic import semantic_registry
import copy
import threading

_INTENT_CACHE = {}
_INTENT_CACHE_LOCK = threading.Lock()


def clear_intent_cache():
    with _INTENT_CACHE_LOCK:
        _INTENT_CACHE.clear()


def classify_request(prompt):
    selection = current_selection.get()
    model = semantic_registry.get(selection.entry, selection.context.version, selection.context.semantic_revision, approved=True)
    cache_key = (
        selection.context.dataset_id,
        selection.context.version,
        selection.context.semantic_revision,
        re.sub(r"\s+", " ", prompt.strip().casefold()),
    )
    with _INTENT_CACHE_LOCK:
        if cache_key in _INTENT_CACHE:
            return copy.deepcopy(_INTENT_CACHE[cache_key])
    text = prompt.casefold()
    numerical = bool(re.search(r"\b(total|sum|average|avg|count|how many|how much|top|bottom|highest|lowest|compare|chart|graph|plot|min|max|minimum|maximum)\b", text))
    if not re.search(r"\b(meaning|definition|describe|explain)\b", text):
        numerical = numerical or any(f.role == "measure" and any(re.search(r"(?<!\w)" + re.escape(alias.casefold()) + r"(?!\w)", text) for alias in [f.name, f.semantic_name, *f.aliases]) for f in model.fields)
    if not numerical:
        return QueryPlan(intent="chat", requires_structured_query=False, requires_vector_search=True).model_dump(exclude_none=True)
    from api.config import settings
    if settings.NVIDIA_API_KEY:
        from api.services.ai_core_service import ai_core_service
        from api.services.intent_engine import intent_engine
        instruction = ("Return only a JSON analytical query plan matching this JSON schema. Use only the approved fields and aggregations. "
                       "Do not invent a metric, ignore filters, or infer business definitions. If ambiguous, return {\"clarification\":\"question\"}. "
                       "For numerical requests always set requires_structured_query=true. Use COUNT with metric='*' only for source row count.\n"
                       + json.dumps(QueryPlan.model_json_schema()) + "\nApproved semantic model:\n" + model.model_dump_json()
                       + "\nUser request:\n" + prompt)
        response = ai_core_service.generate_nvidia_completion(instruction)
        proposal = intent_engine._parse_json_response(response)
        if not proposal or proposal.get("clarification"):
            raise HTTPException(422, proposal.get("clarification", "Specify the metric, aggregation and filters.") if proposal else "The request could not be planned. Specify the metric and filters.")
        try:
            plan = QueryPlan.model_validate(proposal)
        except ValueError:
            raise HTTPException(422, "The proposed plan is invalid. Specify the metric, aggregation and filters.") from None
        if plan.intent == "chat" or not plan.measures:
            raise HTTPException(422, "A numerical request requires an explicit analytical plan.")
        out = plan.model_dump(exclude_none=True, by_alias=True)
        with _INTENT_CACHE_LOCK:
            if len(_INTENT_CACHE) > 200:
                _INTENT_CACHE.pop(next(iter(_INTENT_CACHE)), None)
            _INTENT_CACHE[cache_key] = out
        return out
    # Conservative offline support: exact approved names/aliases and explicit aggregation.
    matched = []
    for field in model.fields:
        aliases = [field.name, field.semantic_name, *field.aliases]
        if any(re.search(r"(?<!\w)" + re.escape(alias.casefold()) + r"(?!\w)", text) for alias in aliases):
            matched.append(field)
    measures = [f for f in matched if f.role == "measure"]
    dimensions = [f for f in matched if f.role in ("dimension", "identifier", "time") and re.search(r"\b(by|per)\s+" + re.escape(f.name.casefold()), text)]
    aggregation = None
    for pattern, agg in [(r"count distinct|unique", "COUNT_DISTINCT"), (r"\b(count|how many)\b", "COUNT"),
                         (r"\b(average|avg)\b", "AVG"), (r"\b(minimum|min|lowest)\b", "MIN"),
                         (r"\b(maximum|max|highest)\b", "MAX"), (r"\b(total|sum)\b", "SUM")]:
        if re.search(pattern, text):
            aggregation = agg
            break
    metric = measures[0].name if len(measures) == 1 else None
    if aggregation in ("COUNT", "COUNT_DISTINCT"):
        targets = [f for f in matched if f not in dimensions]
        metric = targets[0].name if len(targets) == 1 else "*" if re.search(r"\b(rows|records)\b", text) else None
    if metric is None:
        raise HTTPException(422, "Specify one approved metric or use 'count records'. Multiple or missing metrics require clarification.")
    if not aggregation:
        aggregation = next((f.default_aggregation for f in model.fields if f.name == metric), None)
    if not aggregation:
        raise HTTPException(422, "Specify an aggregation or approve a default for this metric.")
    if re.search(r"\b(where|between|during|since|until|for|in|compare|versus|vs)\b", text):
        raise HTTPException(422, "This request needs an explicit filtered query plan. Configure AI planning or use the structured editor.")
    out = QueryPlan(intent="graph" if re.search(r"\b(chart|plot|graph)\b", text) else "analytical",
                     metric=metric, aggregation=aggregation, dimensions=[f.name for f in dimensions]).model_dump(exclude_none=True)
    with _INTENT_CACHE_LOCK:
        if len(_INTENT_CACHE) > 200:
            _INTENT_CACHE.pop(next(iter(_INTENT_CACHE)), None)
        _INTENT_CACHE[cache_key] = out
    return out
