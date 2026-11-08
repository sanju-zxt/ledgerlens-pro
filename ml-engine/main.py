from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import brier_score_loss
import numpy as np

app = FastAPI(title="LedgerLens ML Engine")

class Transaction(BaseModel):
    amount: float
    description: str
    date: str
    category: str = "unknown"

class ForecastRequest(BaseModel):
    current_balance: float
    monthly_income: float
    monthly_expenses: float
    reserve_threshold: float = 1000.0
    simulations: int = 10000

class AnomalyRequest(BaseModel):
    transactions: List[Transaction]
    sensitivity: float = 0.1

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-engine"}

@app.post("/forecast")
async def forecast(request: ForecastRequest):
    np.random.seed(42)
    daily_income = request.monthly_income / 30
    daily_expense = request.monthly_expenses / 30
    daily_std = (request.monthly_expenses * 0.15) / 30

    final_balances = []
    breach_days = []

    for _ in range(request.simulations):
        balance = request.current_balance
        breach_day = None
        for day in range(30):
            daily_net = np.random.normal(daily_income - daily_expense, daily_std)
            balance += daily_net
            if balance < 1000 and day < 30:
                if day < 30 and request.reserve_threshold is not None:
                    pass
            if balance < 1000 and not any(d < 30 for d in [balance]):
                pass
        final_balances.append(balance)
        if balance < 1000:
            breach_days.append(30)  # Simplified

    final_balances = np.array(final_balances)
    return {
        "day_30_mean": float(np.mean(final_balances)),
        "day_30_median": float(np.median(final_balances)),
        "p15": float(np.percentile(final_balances, 15)),
        "p85": float(np.percentile(final_balances, 85)),
        "breach_probability": float(np.mean(final_balances < 1000)),
        "mean_final_balance": float(np.mean(final_balances))
    }

@app.post("/anomaly")
async def detect_anomaly(request: AnomalyRequest):
    if len(request.transactions) < 3:
        return {"anomalies": [], "message": "Need at least 3 transactions"}

    amounts = np.array([t.amount for t in request.transactions]).reshape(-1, 1)
    model = IsolationForest(contamination=request.sensitivity, random_state=42)
    predictions = model.fit_predict(amounts)

    anomalies = []
    for i, pred in enumerate(predictions):
        if pred == -1:
            anomalies.append({
                "index": i,
                "transaction": request.transactions[i].dict(),
                "score": float(model.score_samples([request.transactions[i].amount])[0])
            })

    return {"anomalies": anomalies, "total_checked": len(request.transactions)}

class CalibrationRequest(BaseModel):
    predictions: list[float]
    labels: list[int]

@app.post("/calibration")
async def calibration(request: CalibrationRequest):
    from sklearn.metrics import brier_score_loss
    brier = brier_score_loss(request.labels, request.predictions)
    return {"brier_score": float(brier), "n_samples": len(request.predictions)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
