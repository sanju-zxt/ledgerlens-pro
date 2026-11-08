"""LedgerLens analytical endpoints. Model outputs are estimates, never observations."""
from typing import List
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest
from sklearn.metrics import brier_score_loss

app = FastAPI(title="LedgerLens ML Engine", version="1.0.0")


class Transaction(BaseModel):
    amount: float
    description: str
    date: str
    category: str = "unknown"
    status: str = "COMPLETED"


class ForecastRequest(BaseModel):
    current_balance: float = Field(ge=0)
    payment_amount: float = Field(default=3500.0, ge=0)
    payment_day_start: int = Field(default=7, ge=1, le=90)
    payment_day_end: int = Field(default=13, ge=1, le=90)
    daily_expense_mean: float = Field(default=78.0, ge=0)
    daily_expense_std: float = Field(default=15.0, ge=0)
    reserve_threshold: float = Field(default=1000.0, ge=0)
    simulations: int = Field(default=10000, ge=100, le=50000)
    horizon_days: int = Field(default=30, ge=1, le=90)
    seed: int = 42
    emergency_probability: float = Field(default=0.05, ge=0, le=1)
    emergency_min: float = Field(default=200, ge=0)
    emergency_max: float = Field(default=500, ge=0)


class AnomalyRequest(BaseModel):
    transactions: List[Transaction]
    sensitivity: float = Field(default=0.1, gt=0, le=0.5)


class CalibrationRequest(BaseModel):
    predictions: List[float]
    labels: List[int]
    bins: int = Field(default=10, ge=2, le=50)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-engine"}


@app.post("/forecast")
async def forecast(request: ForecastRequest):
    if request.emergency_min > request.emergency_max:
        raise HTTPException(400, "emergency_min must not exceed emergency_max")
    if request.payment_day_start > request.payment_day_end:
        raise HTTPException(400, "payment_day_start must not exceed payment_day_end")
    rng = np.random.Generator(np.random.PCG64(request.seed))
    n, horizon = request.simulations, request.horizon_days
    balances = np.full(n, request.current_balance, dtype=np.float64)
    path_breached = balances < request.reserve_threshold
    ending_breached = np.zeros(n, dtype=bool)
    first_breach_day = np.where(path_breached, 0, horizon + 1)
    payment_days = rng.integers(request.payment_day_start, request.payment_day_end + 1, n)
    has_emergency = rng.random(n) < request.emergency_probability
    emergency_days = rng.integers(1, horizon + 1, n)
    emergency_amounts = rng.uniform(request.emergency_min, request.emergency_max, n)
    series = [{"day": 0, "median": request.current_balance, "lower_bound": request.current_balance, "upper_bound": request.current_balance}]
    for day in range(1, horizon + 1):
        # Same-day event order: incoming payment, clipped operating expense, then emergency.
        balances += np.where(payment_days == day, request.payment_amount, 0.0)
        expenses = np.maximum(0, rng.normal(request.daily_expense_mean, request.daily_expense_std, n))
        balances -= expenses
        balances -= np.where(has_emergency & (emergency_days == day), emergency_amounts, 0.0)
        newly_breached = (balances < request.reserve_threshold) & (first_breach_day > horizon)
        first_breach_day[newly_breached] = day
        path_breached |= balances < request.reserve_threshold
        if day == horizon:
            ending_breached = balances < request.reserve_threshold
        series.append({"day": day, "median": float(np.percentile(balances, 50)), "lower_bound": float(np.percentile(balances, 15)), "upper_bound": float(np.percentile(balances, 85))})
    return {
        "day_30_mean": float(np.mean(balances)), "day_30_median": float(np.median(balances)),
        "p15": float(np.percentile(balances, 15)), "p85": float(np.percentile(balances, 85)),
        "reserve_breach_probability": float(np.mean(path_breached)),
        "ending_below_reserve_probability": float(np.mean(ending_breached)),
        "reserve_runway_days_p50": float(np.percentile(first_breach_day, 50)) if np.percentile(first_breach_day, 50) <= horizon else None,
        "chart_data": series, "simulations": n, "horizon_days": horizon,
        "provenance": {"kind": "simulation", "seed": request.seed, "generator": "NumPy PCG64", "assumptions": {"payment_amount": request.payment_amount, "payment_day_range": [request.payment_day_start, request.payment_day_end], "daily_operating_expense": f"Normal({request.daily_expense_mean}, {request.daily_expense_std}), clipped at zero", "emergency_probability_per_path": request.emergency_probability, "emergency_amount_range": [request.emergency_min, request.emergency_max], "same_day_event_order": ["payment", "operating expense", "emergency expense"]}}
    }


@app.post("/anomaly")
async def detect_anomaly(request: AnomalyRequest):
    eligible = [(i, tx) for i, tx in enumerate(request.transactions) if tx.status.upper() in {"COMPLETED", "S", "REFUNDED", "REVERSED"}]
    if len(eligible) < 3:
        return {"anomalies": [], "message": "Need at least 3 eligible transactions", "total_checked": len(eligible), "interpretation": "Statistical outliers are not confirmed fraud."}
    amounts = np.array([tx.amount for _, tx in eligible], dtype=float).reshape(-1, 1)
    model = IsolationForest(contamination=request.sensitivity, random_state=42)
    predictions = model.fit_predict(amounts)
    scores = model.score_samples(amounts)
    return {"anomalies": [{"index": index, "transaction": tx.model_dump(), "score": float(scores[j])} for j, ((index, tx), pred) in enumerate(zip(eligible, predictions)) if pred == -1], "total_checked": len(eligible), "interpretation": "Statistical outliers are not confirmed fraud."}


@app.post("/calibration")
async def calibration(request: CalibrationRequest):
    if len(request.predictions) != len(request.labels) or not request.predictions:
        raise HTTPException(400, "predictions and labels must be non-empty arrays of equal length")
    if any(not 0 <= p <= 1 for p in request.predictions) or any(label not in (0, 1) for label in request.labels):
        raise HTTPException(400, "predictions must be in [0,1] and labels must be binary")
    p, y = np.asarray(request.predictions), np.asarray(request.labels)
    edges = np.linspace(0, 1, request.bins + 1)
    bins = []
    ece = 0.0
    for i in range(request.bins):
        mask = (p >= edges[i]) & ((p <= edges[i + 1]) if i == request.bins - 1 else (p < edges[i + 1]))
        if mask.any():
            confidence, rate = float(p[mask].mean()), float(y[mask].mean())
            ece += float(mask.mean()) * abs(confidence - rate)
            bins.append({"lower": float(edges[i]), "upper": float(edges[i + 1]), "count": int(mask.sum()), "mean_prediction": confidence, "observed_rate": rate})
    return {"brier_score": float(brier_score_loss(y, p)), "ece": float(ece), "n_samples": len(p), "reliability_bins": bins}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
