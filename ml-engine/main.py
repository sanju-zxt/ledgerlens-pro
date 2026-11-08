"""LedgerLens analytical endpoints. Model outputs are estimates, never observations."""
from typing import List
import hmac
import os
from datetime import datetime
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, confusion_matrix, roc_auc_score

app = FastAPI(title="LedgerLens ML Engine", version="1.0.0")


def require_internal_api_key(authorization: str | None = Header(default=None)):
    expected = os.getenv("ML_ENGINE_API_KEY")
    if not expected:
        if os.getenv("NODE_ENV") == "production":
            raise HTTPException(503, "ML service authentication is not configured")
        return
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(401, "Invalid ML service credentials")


class Transaction(BaseModel):
    amount: float = Field(allow_inf_nan=False)
    description: str = Field(max_length=500)
    date: str
    category: str = "unknown"
    status: str = "COMPLETED"
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")


class ForecastRequest(BaseModel):
    current_balance: float = Field(allow_inf_nan=False)
    payment_amount: float = Field(default=0.0, ge=0, allow_inf_nan=False)
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
    transactions: List[Transaction] = Field(max_length=1000)
    sensitivity: float = Field(default=0.1, gt=0, le=0.5)


class CalibrationRequest(BaseModel):
    predictions: List[float] = Field(max_length=100000)
    labels: List[int] = Field(max_length=100000)
    bins: int = Field(default=10, ge=2, le=50)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-engine"}


@app.post("/forecast", dependencies=[Depends(require_internal_api_key)])
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


@app.post("/anomaly", dependencies=[Depends(require_internal_api_key)])
async def detect_anomaly(request: AnomalyRequest):
    eligible = [(i, tx) for i, tx in enumerate(request.transactions) if tx.status.upper() in {"COMPLETED", "S"}]
    by_currency = {}
    for index, tx in eligible:
        currency = tx.currency.upper()
        by_currency.setdefault(currency, []).append((index, tx))
    anomalies = []
    skipped = {}
    for currency, group in by_currency.items():
        if len(group) < 3:
            skipped[currency] = len(group)
            continue
        peer_counts = {}
        for _, tx in group:
            peer = (tx.category.strip().casefold(), tx.description.strip().casefold())
            peer_counts[peer] = peer_counts.get(peer, 0) + 1
        features = []
        time_values = []
        for _, tx in group:
            peer = (tx.category.strip().casefold(), tx.description.strip().casefold())
            try:
                timestamp = datetime.fromisoformat(tx.date.replace("Z", "+00:00"))
                week_hour = timestamp.weekday() * 24 + timestamp.hour + timestamp.minute / 60
                angle = 2 * np.pi * week_hour / 168
                time_features = [np.sin(angle), np.cos(angle), 1.0]
                time_values.append(week_hour)
            except ValueError:
                time_features = [0.0, 0.0, 0.0]
                time_values.append(None)
            features.append([np.log1p(abs(tx.amount)), float(np.sign(tx.amount)), np.log1p(peer_counts[peer]), *time_features])
        model = IsolationForest(contamination=request.sensitivity, random_state=42)
        predictions = model.fit_predict(np.asarray(features, dtype=float))
        scores = model.score_samples(np.asarray(features, dtype=float))
        magnitudes = np.array([abs(tx.amount) for _, tx in group], dtype=float)
        median = float(np.median(magnitudes))
        mad = float(np.median(np.abs(magnitudes - median)))
        scale = 1.4826 * mad
        for position, ((index, tx), prediction) in enumerate(zip(group, predictions)):
            if prediction != -1:
                continue
            relative_deviation = abs(abs(tx.amount) - median) / scale if scale else None
            reason = "Transaction amount differs materially from the within-currency batch." if relative_deviation is not None and relative_deviation >= 3 else "Combined amount, transaction-time, and peer-frequency features differ from this within-currency batch."
            anomalies.append({
                "index": index, "transaction": tx.model_dump(), "score": float(scores[position]),
                "reason": reason,
                "features": {"currency_batch_median_abs_amount": median, "description_category_batch_frequency": peer_counts[(tx.category.strip().casefold(), tx.description.strip().casefold())], "time_feature_available": time_values[position] is not None}
            })
    message = "At least 3 completed transactions per currency are required for analysis." if skipped and not anomalies else None
    return {"anomalies": anomalies, "message": message, "total_checked": len(eligible), "skipped_currency_groups": skipped, "feature_set": ["log absolute amount", "direction", "description/category frequency", "time of week", "currency-isolated model"], "interpretation": "Statistical outliers are review prompts, not confirmed fraud. Batch-relative signals are not merchant history."}


@app.post("/calibration", dependencies=[Depends(require_internal_api_key)])
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
    positive_count = int(y.sum())
    negative_count = int(len(y) - positive_count)
    threshold = 0.5
    tn, fp, fn, tp = (int(value) for value in confusion_matrix(y, p >= threshold, labels=[0, 1]).ravel())
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = (2 * precision * recall / (precision + recall)) if precision is not None and recall is not None and precision + recall else (0.0 if positive_count else None)
    roc_auc = float(roc_auc_score(y, p)) if positive_count and negative_count else None
    pr_auc = float(average_precision_score(y, p)) if positive_count else None
    return {
        "brier_score": brier, "baseline_brier_score": baseline_brier,
        "brier_skill_score": 1 - brier / baseline_brier if baseline_brier > 0 else None,
        "ece": float(ece), "expected_calibration_error": float(ece), "ece_method": "equal-width bins",
        "positive_rate": prevalence, "positive_count": positive_count, "negative_count": negative_count,
        "class_distribution_valid": bool(positive_count and negative_count), "classification_threshold": threshold,
        "evaluation_status": "two_class" if positive_count and negative_count else "single_class",
        "class_distribution_warning": ("Positive-event performance cannot be validated because the evaluation dataset contains no positive labels." if not positive_count else "Negative-event performance cannot be validated because the evaluation dataset contains no negative labels." if not negative_count else None),
        "confusion_matrix": {"true_positive": tp, "false_positive": fp, "true_negative": tn, "false_negative": fn},
        "precision": precision, "recall": recall, "f1_score": f1,
        "roc_auc": roc_auc, "pr_auc": pr_auc, "pr_auc_method": "average precision",
        "holdout_validation": {"status": "unavailable", "reason": "This request has no temporal or group key for an independent split."},
        "bins": request.bins, "n_samples": len(p), "reliability_bins": bins,
        "limitation": "Single-class evaluation cannot validate positive-event performance; independent holdout evaluation requires genuine timestamped outcomes."
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
