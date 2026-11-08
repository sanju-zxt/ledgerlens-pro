"""LedgerLens analytical endpoints. Model outputs are estimates, never observations."""
from typing import List
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

app = FastAPI(title="LedgerLens ML Engine", version="1.0.0")


class Transaction(BaseModel):
    amount: float
    description: str
    date: str
    category: str = "unknown"
    status: str = "COMPLETED"


class ForecastRequest(BaseModel):
    current_balance: float = Field(allow_inf_nan=False)
    payment_amount: float = Field(default=3500.0, ge=0, allow_inf_nan=False)
    payment_day_start: int = Field(default=7, ge=1, le=90)
    payment_day_end: int = Field(default=13, ge=1, le=90)
    daily_expense_mean: float = Field(default=78.0, ge=0, allow_inf_nan=False)
    daily_expense_std: float = Field(default=15.0, ge=0, allow_inf_nan=False)
    reserve_threshold: float = Field(default=1000.0, ge=0, allow_inf_nan=False)
    simulations: int = Field(default=10000, ge=100, le=50000)
    horizon_days: int = Field(default=30, ge=1, le=90)
    seed: int = Field(default=42, ge=0, le=4294967295)
    emergency_probability: float = Field(default=0.05, ge=0, le=1, allow_inf_nan=False)
    emergency_min: float = Field(default=200, ge=0, allow_inf_nan=False)
    emergency_max: float = Field(default=500, ge=0, allow_inf_nan=False)


class AnomalyRequest(BaseModel):
    transactions: List[Transaction]
    sensitivity: float = Field(default=0.1, gt=0, le=0.5)


class CalibrationRequest(BaseModel):
    predictions: List[float] = Field(max_length=100000)
    labels: List[int] = Field(max_length=100000)
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
    path_breach_count = int(np.count_nonzero(path_breached))
    ending_breach_count = int(np.count_nonzero(ending_breached))
    required_events = int(np.ceil(n * 0.5))
    observed_breaches = np.sort(first_breach_day[first_breach_day <= horizon])
    median_runway = int(observed_breaches[required_events - 1]) if len(observed_breaches) >= required_events else None

    def wilson_interval(successes: int) -> dict:
        z = 1.959963984540054
        probability = successes / n
        z2 = z * z
        denominator = 1 + z2 / n
        center = (probability + z2 / (2 * n)) / denominator
        margin = z * np.sqrt(probability * (1 - probability) / n + z2 / (4 * n * n)) / denominator
        return {"lower": 0.0 if successes == 0 else float(max(0.0, center - margin)), "upper": 1.0 if successes == n else float(min(1.0, center + margin)), "level": 0.95, "method": "Wilson score"}

    return {
        "ending_balance": {"mean": float(np.mean(balances)), "median": float(np.median(balances)), "p15": float(np.percentile(balances, 15)), "p85": float(np.percentile(balances, 85))},
        "reserve_runway_days_p50": median_runway,
        "reserve_threshold": request.reserve_threshold,
        "reserve_breach_probability": path_breach_count / n,
        "reserve_breach_probability_95ci": wilson_interval(path_breach_count),
        "ending_below_reserve_probability": ending_breach_count / n,
        "ending_below_reserve_probability_95ci": wilson_interval(ending_breach_count),
        "chart_data": series, "simulations": n, "horizon_days": horizon,
        "provenance": {"kind": "simulation", "method": "Monte Carlo", "seed": request.seed, "generator": "NumPy PCG64", "assumptions": {"payment_amount": request.payment_amount, "payment_day_range": [request.payment_day_start, request.payment_day_end], "daily_operating_expense": f"Normal({request.daily_expense_mean}, {request.daily_expense_std}), clipped at zero", "emergency_probability_per_path": request.emergency_probability, "emergency_amount_range": [request.emergency_min, request.emergency_max], "same_day_event_order": ["payment", "operating expense", "emergency expense"]}}
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
    p, y = np.asarray(request.predictions, dtype=np.float64), np.asarray(request.labels, dtype=np.float64)
    if not np.isfinite(p).all():
        raise HTTPException(400, "predictions must be finite")
    edges = np.linspace(0, 1, request.bins + 1)
    bins = []
    ece = 0.0
    for i in range(request.bins):
        mask = (p >= edges[i]) & ((p <= edges[i + 1]) if i == request.bins - 1 else (p < edges[i + 1]))
        if mask.any():
            confidence, rate = float(p[mask].mean()), float(y[mask].mean())
            ece += float(mask.mean()) * abs(confidence - rate)
        else:
            confidence, rate = None, None
        bins.append({"lower": float(edges[i]), "upper": float(edges[i + 1]), "count": int(mask.sum()), "mean_prediction": confidence, "observed_rate": rate})
    brier = float(np.mean((p - y) ** 2))
    prevalence = float(y.mean())
    baseline_brier = float(np.mean((prevalence - y) ** 2))
    return {"brier_score": brier, "baseline_brier_score": baseline_brier, "brier_skill_score": 1 - brier / baseline_brier if baseline_brier > 0 else None, "ece": float(ece), "expected_calibration_error": float(ece), "ece_method": "equal-width bins", "positive_rate": prevalence, "positive_count": int(y.sum()), "bins": request.bins, "n_samples": len(p), "reliability_bins": bins}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
