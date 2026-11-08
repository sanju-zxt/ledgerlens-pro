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
});
