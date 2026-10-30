import threading
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException
from api.models.execution_context import current_selection
from api.platform.semantic import semantic_registry
from api.services.analytics_engine import analytics_engine
from api.services.data_service import data_service

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

_DASHBOARD_CACHE = {}
_DASHBOARD_CACHE_LOCK = threading.Lock()


def clear_dashboard_cache():
    with _DASHBOARD_CACHE_LOCK:
        _DASHBOARD_CACHE.clear()


@router.get("")
def get_dashboard():
    selection = current_selection.get()
    if selection is None:
        raise HTTPException(409, "Select a dataset version.")
    context = selection.context
    semantic_registry.get(selection.entry, context.version, context.semantic_revision, approved=True)
    namespace = semantic_registry.namespace(selection.entry, context.version, f"dashboard:{context.semantic_revision}")
    publication = semantic_registry.store.get(namespace, "published")
    if publication is None:
        return {"title": "Analytics dashboard", "widgets": [], "context": context.model_dump(), "status": "unpublished"}

    items_to_compute = publication["value"]["items"]
    cache_key = (
        context.workspace_id,
        context.dataset_id,
        context.version,
        context.semantic_revision,
        str(items_to_compute),
    )
    with _DASHBOARD_CACHE_LOCK:
        if cache_key in _DASHBOARD_CACHE:
            return _DASHBOARD_CACHE[cache_key]

    definitions = semantic_registry.items(selection.entry, context.version, context.semantic_revision)

    # Pre-resolve shared DataFrame once for all widget executions
    df = data_service.get_dataframe()

    def _execute_widget(reference):
        item = next((i for i in definitions if i.id == reference["id"] and i.revision == reference["revision"]), None)
        if item is None or item.status != "approved":
            raise HTTPException(409, "A published definition is no longer available. Review dashboard dependencies.")
        res = analytics_engine.execute(item.query_plan.model_dump(exclude_none=True, by_alias=True), dataframe=df)
        return {"definition": item.model_dump(mode="json"), "result": res.to_dict()}

    if len(items_to_compute) <= 1:
        widgets = [_execute_widget(ref) for ref in items_to_compute]
    else:
        with ThreadPoolExecutor(max_workers=min(8, len(items_to_compute))) as executor:
            widgets = list(executor.map(_execute_widget, items_to_compute))

    response_data = {
        "title": publication["value"]["title"],
        "widgets": widgets,
        "context": context.model_dump(),
        "status": "published",
    }
    with _DASHBOARD_CACHE_LOCK:
        if len(_DASHBOARD_CACHE) > 50:
            _DASHBOARD_CACHE.clear()
        _DASHBOARD_CACHE[cache_key] = response_data
    return response_data
