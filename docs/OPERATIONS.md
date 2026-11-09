# Operations and recovery notes

## PayPal Sandbox verification

The current PayPal integration uses the app owner's REST credentials and server-to-server OAuth. It is read-only Reporting API access for that Sandbox account. It is not merchant OAuth consent, a PayPal login flow, or a multi-merchant connection. Run `npm run paypal:verify:sandbox` locally to verify balance and Transaction Search calls; the output is sanitized and contains no transaction identifiers, amounts, descriptions, or secrets. Hosted verification must be run in the hosted environment after the service owner configures secrets.

## Render ML persistence

The blueprint intentionally avoids provisioning paid infrastructure. Before enabling label/evaluation collection on Render:

1. Attach a persistent disk to the `ledgerlens-ml` service and mount it at `/var/data`.
2. Set `MODEL_DATA_PATH=/var/data/model-quality.sqlite3` on that service.
3. Confirm `ML_ENGINE_API_KEY` is set and the API service's `ML_ENGINE_URL` points to the ML service.
4. Deploy, then check the ML service's `/health` response. For production, `ready_for_model_data` must be `true`; the health response exposes only whether internal authentication is configured, never the key itself.
5. Restart the service and verify a reviewed test record remains. Do not store real customer records during this operational check.

The ML service rejects model-data operations when Render is active and the database path is outside the mounted `/var/data` disk. A persistent disk is attached to one service instance; this SQLite configuration is not a horizontally scaled database architecture.

## SQLite backup and recovery

Back up while the service is stopped or use SQLite's online backup API so the WAL is included consistently. From a maintenance shell with the persistent disk mounted:

```python
import sqlite3
from pathlib import Path

Path("/var/data/backups").mkdir(parents=True, exist_ok=True)
source = sqlite3.connect("/var/data/model-quality.sqlite3")
backup = sqlite3.connect("/var/data/backups/model-quality-YYYYMMDD.sqlite3")
source.backup(backup)
backup.close()
source.close()
```

Validate the copy before relying on it:

```python
import sqlite3

db = sqlite3.connect("/var/data/backups/model-quality-YYYYMMDD.sqlite3")
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print(db.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall())
db.close()
```

Store a copy outside the service disk using an approved encrypted backup location and access policy. A backup on the same disk is not disaster recovery. Restore only with the service stopped, preserve the original file, run the integrity check, then start the service and confirm `/health`. No automated off-host backup is configured by this repository.

## Identity and tenant boundary

The current app is a single configured workspace/account. Internal pipeline routes use a shared service key and tenant-keyed storage, but the tenant identifier is supplied by the internal caller; there is no authenticated merchant identity-to-tenant authorization layer. Therefore tenant isolation remains NOT EVALUABLE and the service must not be exposed as a public multi-tenant product. Before that use, bind each tenant to a verified user/session server-side, derive tenant IDs from that identity, enforce ownership on every route and query, and add cross-user negative tests.

## Synthetic benchmark scope

`npm run quality:benchmark` regenerates `client/public/synthetic-benchmark.json` from a fixed seed. It has controlled injected anomaly patterns, chronological train/calibration/validation/test blocks, logistic regression and histogram gradient boosting candidates, Platt/isotonic calibration, validation-only selection, and a constant-prevalence baseline. It is explicitly separate from the real-data scorecard and is not evidence of real merchant performance. `npm run quality:report` runs it before producing the combined evidence report.
