from fastapi import APIRouter
from fastapi import HTTPException
from api.models.execution_context import current_selection
from api.platform.semantic import semantic_registry
from api.services.analytics_engine import analytics_engine

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

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
    definitions = semantic_registry.items(selection.entry, context.version, context.semantic_revision)
    widgets = []
    for reference in publication["value"]["items"]:
        item = next((i for i in definitions if i.id == reference["id"] and i.revision == reference["revision"]), None)
        if item is None or item.status != "approved":
            raise HTTPException(409, "A published definition is no longer available. Review dashboard dependencies.")
        result = analytics_engine.execute(item.query_plan.model_dump(exclude_none=True, by_alias=True))
        widgets.append({"definition": item.model_dump(mode="json"), "result": result.to_dict()})
    return {"title": publication["value"]["title"], "widgets": widgets, "context": context.model_dump(), "status": "published"}
