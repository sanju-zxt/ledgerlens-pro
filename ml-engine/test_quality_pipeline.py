"""Isolated fixtures exercise workflow logic; no fixture is shipped as evidence."""
import tempfile
import unittest
import os
import asyncio
import sqlite3
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path

from quality_pipeline import add_label, dataset_report, experiment, forecast_report, label_history, record_forecast_snapshot, score_review_labels, mark_needs_investigation, triage_history
from main import require_durable_store, persistent_store_configured, health
from fastapi import HTTPException
from main import pipeline_add_label, pipeline_labels, pipeline_experiment, pipeline_review_status, require_internal_api_key, ReviewedLabelRequest, ReviewStatusRequest


class QualityPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / "quality.sqlite3"

    def tearDown(self):
        self.temp.cleanup()

    def label(self, tenant, index, value):
        dt = datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(days=index)
        amount = (20 + index % 9) if value == 0 else (500 + index % 11)
        return add_label({"transaction": {"id": f"txn-{index}", "date": dt.isoformat(), "amount": amount,
                        "currency": "USD", "category": "purchase" if value == 0 else "cash withdrawal",
                        "description": "source transaction", "status": "COMPLETED"},
                         "label": value, "rationale": "Reviewed source evidence and merchant context."},
                        tenant=tenant, reviewer="reviewer@example.test", path=self.db)

    def test_review_provenance_revisions_quality_and_tenant_scoping(self):
        first = self.label("tenant-a", 1, 0)
        self.label("tenant-a", 1, 1)
        self.label("tenant-b", 1, 0)
        self.assertTrue(first["evidence_ref"].startswith("sha256:"))
        events = label_history("tenant-a", self.db)
        self.assertEqual([row["revision"] for row in events], [2, 1])
        report = dataset_report("tenant-a", self.db)
        self.assertEqual(report["sample_size"], 1)
        self.assertEqual(report["class_distribution"], {"negative": 0, "positive": 1})
        self.assertEqual(dataset_report("tenant-b", self.db)["sample_size"], 1)

    def test_needs_investigation_is_audited_but_never_enters_training_labels(self):
        transaction = {"id": "uncertain-tx", "date": "2025-02-01T00:00:00Z", "amount": 99, "currency": "USD", "category": "purchase", "description": "uncertain merchant", "status": "COMPLETED"}
        first = mark_needs_investigation({"transaction": transaction, "status": "needs_investigation", "rationale": "Merchant context is not available yet."}, tenant="triage-a", reviewer="reviewer@example.test", path=self.db)
        self.assertFalse(first["included_in_training"])
        mark_needs_investigation({"transaction": transaction, "status": "needs_investigation", "rationale": "Receipt is still required to confirm context."}, tenant="triage-a", reviewer="reviewer@example.test", path=self.db)
        self.assertEqual(dataset_report("triage-a", self.db)["sample_size"], 0)
        self.assertEqual(len(triage_history("triage-a", self.db)), 2)
        self.assertEqual(len(triage_history("triage-b", self.db)), 0)
        add_label({"transaction": transaction, "label": 0, "rationale": "Receipt verified this was an expected purchase."}, tenant="triage-a", reviewer="reviewer@example.test", path=self.db)
        db = sqlite3.connect(self.db)
        try:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM review_triage WHERE tenant_id=?", ("triage-a",)).fetchone()[0], 0)
        finally:
            db.close()
        self.assertEqual(len(triage_history("triage-a", self.db)), 2)

    def test_model_experiment_uses_chronological_splits_and_saves_model_artifact(self):
        # Deterministic temporary unit fixture only; never included in the deployed evidence store.
        for index in range(200): self.label("model-tenant", index, int(index % 10 in (8, 9)))
        report = experiment("model-tenant", self.db)
        self.assertEqual(report["status"], "EVALUATED")
        self.assertEqual(report["split"]["method"], "chronological 55/15/15/15: train/calibration/validation/test")
        self.assertEqual(report["test_metrics"]["sample_size"], 30)
        self.assertIn("validation_candidates", report)
        self.assertTrue((self.db.parent / "models" / report["model_artifact"]).is_file())
        self.assertIn("untouched", report["selected_on"])
        self.assertIn("roc_auc", report["test_metrics"])
        self.assertIn("pr_auc", report["test_metrics"])
        self.assertIn("log_loss_skill_vs_training_prevalence", report["test_metrics"])
        prediction = score_review_labels("model-tenant", [{"id": "new-tx", "date": "2025-08-01T00:00:00+00:00", "amount": 900, "currency": "USD", "category": "purchase"}], self.db)
        self.assertIn("active", prediction)
        self.label("model-tenant", 201, 0)
        stale = score_review_labels("model-tenant", [], self.db)
        self.assertFalse(stale["active"])
        self.assertIn("dataset changed", stale["reason"])

    def test_small_or_single_class_dataset_is_not_evaluable(self):
        for index in range(15): self.label("sparse", index, 0)
        report = experiment("sparse", self.db)
        self.assertEqual(report["status"], "NOT EVALUABLE")

    def test_production_refuses_ephemeral_default_but_accepts_explicit_storage_path(self):
        with patch.dict(os.environ, {"NODE_ENV": "production"}, clear=True):
            with self.assertRaises(HTTPException) as failure: require_durable_store()
            self.assertEqual(failure.exception.status_code, 503)
        with patch.dict(os.environ, {"NODE_ENV": "production", "MODEL_DATA_PATH": str(self.db), "RENDER_EXTERNAL_HOSTNAME": ""}):
            require_durable_store()
        with patch.dict(os.environ, {"NODE_ENV": "production", "RENDER_EXTERNAL_HOSTNAME": "ledgerlens-ml.onrender.com", "MODEL_DATA_PATH": str(self.db)}):
            with self.assertRaises(HTTPException) as failure: require_durable_store()
            self.assertEqual(failure.exception.status_code, 503)
        with patch.dict(os.environ, {"NODE_ENV": "production", "RENDER_EXTERNAL_HOSTNAME": "ledgerlens-ml.onrender.com", "MODEL_DATA_PATH": "/var/data/model-quality.sqlite3"}), patch("main.os.path.ismount", return_value=True):
            with patch("main.db_session"):
                require_durable_store()

    def test_schema_migrations_are_recorded_and_sqlite_integrity_check_passes(self):
        db = sqlite3.connect(self.db)
        try:
            db.executescript("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);")
            db.close()
            # Use the production connection factory so migrations run exactly as they do at startup.
            from quality_pipeline import connect
            db = connect(self.db)
            versions = [row[0] for row in db.execute("SELECT version FROM schema_migrations ORDER BY version")]
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        finally:
            db.close()
        self.assertEqual(versions, [1, 2])

    def test_ml_health_reports_key_and_persistent_store_readiness_without_exposing_key(self):
        with patch.dict(os.environ, {"NODE_ENV": "production", "ML_ENGINE_API_KEY": "secret-test-key", "MODEL_DATA_PATH": "/tmp/model-quality.sqlite3", "RENDER_EXTERNAL_HOSTNAME": "ledgerlens-ml.onrender.com"}):
            status = asyncio.run(health())
        self.assertTrue(status["internal_auth_configured"])
        self.assertFalse(status["persistent_model_store_configured"])
        self.assertFalse(status["ready_for_model_data"])
        self.assertNotIn("secret-test-key", str(status))

    def test_authenticated_pipeline_api_stores_and_scopes_reviews(self):
        environment = {"NODE_ENV": "production", "MODEL_DATA_PATH": str(self.db), "RENDER_EXTERNAL_HOSTNAME": "", "ML_ENGINE_API_KEY": "test-internal-key"}
        with patch.dict(os.environ, environment):
            with self.assertRaises(HTTPException) as failure: require_internal_api_key(None)
            self.assertEqual(failure.exception.status_code, 401)
            require_internal_api_key("Bearer test-internal-key")
            payload = ReviewedLabelRequest(tenant="tenant-api", reviewer="reviewer@example.test", label=1,
                       rationale="Human reviewed the source transaction evidence.",
                       transaction={"id": "api-tx", "date": "2025-01-01T00:00:00Z", "amount": 999,
                                    "currency": "USD", "category": "purchase", "description": "source event", "status": "COMPLETED"})
            saved = asyncio.run(pipeline_add_label(payload))
            self.assertTrue(saved["saved"])
            self.assertIn("sha256:", saved["label"]["evidence_ref"])
            own = asyncio.run(pipeline_labels("tenant-api"))
            other = asyncio.run(pipeline_labels("other"))
            self.assertEqual(len(own["labels"]), 1)
            self.assertEqual(len(other["labels"]), 0)
            self.assertEqual(asyncio.run(pipeline_experiment("tenant-api"))["status"], "NOT EVALUABLE")
            pending = ReviewStatusRequest(tenant="tenant-api", reviewer="reviewer@example.test", status="needs_investigation", rationale="Transaction context requires more evidence.", transaction={"id": "api-triage", "date": "2025-01-02T00:00:00Z", "amount": 99, "currency": "USD", "category": "purchase", "description": "source event", "status": "COMPLETED"})
            saved_triage = asyncio.run(pipeline_review_status(pending))
            self.assertFalse(saved_triage["included_in_training"])
            self.assertEqual(len(asyncio.run(pipeline_labels("tenant-api"))["triage_queue"]), 1)

    def test_forecast_snapshots_match_later_outcomes_and_report_sample_gates(self):
        start = datetime(2025, 1, 1, tzinfo=timezone.utc)
        for day in range(70):
            observed = start + timedelta(days=day)
            forecast_time = observed.isoformat()
            chart = [{"day": horizon, "median": 1000 - day + horizon * 2,
                      "lower_bound": 990 - day + horizon, "upper_bound": 1010 - day + horizon,
                      "lower_bound_90": 980 - day + horizon, "upper_bound_90": 1020 - day + horizon} for horizon in range(1, 31)]
            payload = {"forecast_status": "available", "source_balance": {"amount": 1000 - day, "currency": "USD", "source": "PAYPAL_TRANSACTION_SEARCH", "observed_at": forecast_time},
                       "model_metadata": {"generated_at": forecast_time, "version": "test-model-v1"}, "chart_data": chart}
            self.assertTrue(record_forecast_snapshot(payload, tenant="tenant-forecast", path=self.db)["stored"])
        report = forecast_report("tenant-forecast", self.db)
        self.assertEqual([row["status"] for row in report["results"]], ["EVALUATED"] * 3)
        self.assertGreaterEqual(report["results"][0]["sample_size"], 30)
        self.assertEqual(report["results"][0]["model_versions"], ["test-model-v1"])
        self.assertIsNotNone(report["results"][0]["prediction_interval_coverage"]["90_percent"])
        self.assertGreater(report["results"][0]["typical_balance"], 0)
        self.assertGreaterEqual(report["results"][0]["normalized_mae"], 0)
        self.assertGreaterEqual(report["results"][0]["normalized_rmse"], 0)
        self.assertIn("mae_improvement_vs_baseline", report["results"][0])
        self.assertIn("rmse_improvement_vs_baseline", report["results"][0])


if __name__ == "__main__":
    unittest.main()
