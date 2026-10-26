"""Charts render computed results; no LLM-generated code runs for routine analytics."""
import base64
import io
import math
from fastapi import HTTPException


def render_chart(rows, kind="bar"):
    if kind not in ("bar", "line", "scatter", "pie"):
        raise HTTPException(422, "Choose a supported chart type: bar, line, scatter or pie.")
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    if not rows:
        raise HTTPException(422, "There are no matching values to chart.")
    numeric = []
    for key in rows[0]:
        try:
            values = [float(row[key]) for row in rows if row.get(key) is not None]
            if values:
                numeric.append(key)
        except (TypeError, ValueError):
            pass
    if not numeric:
        raise HTTPException(422, "This result has no numeric chart values.")
    measure = "value" if "value" in numeric else numeric[-1]
    dimension = next((key for key in rows[0] if key not in numeric), None)
    labels = [str(row.get(dimension, index + 1)) for index, row in enumerate(rows)]
    values = [float(row[measure]) if row.get(measure) is not None else float("nan") for row in rows]
    figure = Figure(figsize=(10, 5), layout="constrained")
    FigureCanvasAgg(figure)
    axis = figure.subplots()
    if kind == "line":
        axis.plot(labels, values, marker="o", color="#2563eb")
    elif kind == "scatter":
        if len(numeric) < 2:
            raise HTTPException(422, "Scatter plots require two numeric measures.")
        pairs = [(float(row[numeric[0]]), value) for row, value in zip(rows, values) if row.get(numeric[0]) is not None and math.isfinite(value)]
        axis.scatter([pair[0] for pair in pairs], [pair[1] for pair in pairs])
        axis.set_xlabel(numeric[0])
    elif kind == "pie":
        if any(not math.isfinite(value) or value < 0 for value in values) or sum(values) <= 0:
            raise HTTPException(422, "Pie charts require non-negative values and a positive total.")
        axis.pie(values, labels=labels)
    else:
        axis.bar(labels, values, color="#2563eb")
    axis.set_title(measure)
    if kind not in ("pie", "scatter"):
        axis.tick_params(axis="x", rotation=35)
    buffer = io.BytesIO()
    figure.savefig(buffer, format="png", dpi=120)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
