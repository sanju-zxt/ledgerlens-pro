import test from "node:test";
import assert from "node:assert/strict";
import { calculateCalibration, parseCalibrationCsv, readCalibrationEvidence } from "./calibration.js";

test("calibration metrics use the documented equal-width convention and prevalence baseline", () => {
  const result = calculateCalibration([{ prediction: 0.1, label: 0 }, { prediction: 0.9, label: 1 }], 10);
  assert.ok(Math.abs(result.brier_score - 0.01) < 1e-12);
  assert.equal(result.baseline_brier_score, 0.25);
  assert.equal(result.brier_skill_score, 0.96);
  assert.ok(Math.abs(result.expected_calibration_error - 0.1) < 1e-12);
  assert.equal(result.reliability_bins.length, 10);
  assert.equal(result.reliability_bins.reduce((sum, bin) => sum + bin.count, 0), 2);
});

test("calibration parser accepts the final probability boundary and rejects malformed rows", () => {
  assert.deepEqual(parseCalibrationCsv("pred,label\n1,1\n0,0\n"), [{ prediction: 1, label: 1 }, { prediction: 0, label: 0 }]);
  assert.throws(() => parseCalibrationCsv("pred,label\n1.2,1"), /Invalid calibration observation/);
});

test("checked-in calibration metrics are computed from source rows", () => {
  const result = readCalibrationEvidence();
  assert.equal(result.n_samples, 646);
  assert.equal(result.source, "evidence/calibration_data.csv");
  assert.ok(result.brier_score >= 0 && result.brier_score <= 1);
  assert.ok(result.expected_calibration_error >= 0 && result.expected_calibration_error <= 1);
  assert.equal(result.positive_count, 0);
  assert.equal(result.class_distribution_valid, false);
  assert.equal(result.roc_auc, null);
  assert.equal(result.pr_auc, null);
  assert.equal(result.recall, null);
  assert.equal(result.brier_score > result.baseline_brier_score, true);
});

test("event metrics are defined on a two-class evaluation sample", () => {
  // Synthetic unit inputs verify metric math only; they are not product evidence.
  const result = calculateCalibration([
    { prediction: 0.9, label: 1 }, { prediction: 0.8, label: 0 },
    { prediction: 0.2, label: 1 }, { prediction: 0.1, label: 0 }
  ]);
  assert.deepEqual(result.confusion_matrix, { true_positive: 1, false_positive: 1, true_negative: 1, false_negative: 1 });
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.f1_score, 0.5);
  assert.equal(result.roc_auc, 0.75);
  assert.ok(Math.abs(result.pr_auc - 5 / 6) < 1e-12);
  assert.equal(result.holdout_validation.status, "unavailable");
});
