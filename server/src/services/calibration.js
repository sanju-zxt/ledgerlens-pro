import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const calibrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../evidence/calibration_data.csv");

export function parseCalibrationCsv(contents) {
  const lines = contents.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== "pred,label") throw new Error("Calibration evidence must have pred,label columns");
  const observations = lines.filter(line => line.trim()).map((line, index) => {
    const [predictionText, labelText, ...extra] = line.split(",").map(value => value.trim());
    if (predictionText === "" || labelText === "") throw new Error(`Missing calibration value on row ${index + 2}`);
    const prediction = Number(predictionText);
    const label = Number(labelText);
    if (extra.length || !Number.isFinite(prediction) || prediction < 0 || prediction > 1 || ![0, 1].includes(label)) {
      throw new Error(`Invalid calibration observation on row ${index + 2}`);
    }
    return { prediction, label };
  });
  if (!observations.length) throw new Error("Calibration evidence contains no observations");
  return observations;
}

export function calculateCalibration(observations, binCount = 10) {
  if (!Array.isArray(observations) || !observations.length) throw new Error("At least one calibration observation is required");
  if (!Number.isInteger(binCount) || binCount < 2 || binCount > 50) throw new Error("binCount must be an integer from 2 to 50");
  for (const { prediction, label } of observations) {
    if (!Number.isFinite(prediction) || prediction < 0 || prediction > 1 || ![0, 1].includes(label)) throw new Error("Predictions must be finite values in [0,1] and labels must be binary");
  }

  const n = observations.length;
  const positiveRate = observations.reduce((sum, item) => sum + item.label, 0) / n;
  const brierScore = observations.reduce((sum, item) => sum + (item.prediction - item.label) ** 2, 0) / n;
  const baselineBrierScore = observations.reduce((sum, item) => sum + (positiveRate - item.label) ** 2, 0) / n;
  const reliabilityBins = [];
  let expectedCalibrationError = 0;

  for (let index = 0; index < binCount; index++) {
    const lower = index / binCount;
    const upper = (index + 1) / binCount;
    const members = observations.filter(({ prediction }) => prediction >= lower && (index === binCount - 1 ? prediction <= upper : prediction < upper));
    const count = members.length;
    const meanPrediction = count ? members.reduce((sum, item) => sum + item.prediction, 0) / count : null;
    const observedRate = count ? members.reduce((sum, item) => sum + item.label, 0) / count : null;
    if (count) expectedCalibrationError += count / n * Math.abs(meanPrediction - observedRate);
    reliabilityBins.push({ lower, upper, count, mean_prediction: meanPrediction, observed_rate: observedRate });
  }

  return {
    brier_score: brierScore,
    baseline_brier_score: baselineBrierScore,
    brier_skill_score: baselineBrierScore > 0 ? 1 - brierScore / baselineBrierScore : null,
    expected_calibration_error: expectedCalibrationError,
    ece_method: "equal-width bins",
    n_samples: n,
    positive_rate: positiveRate,
    positive_count: observations.reduce((sum, item) => sum + item.label, 0),
    bins: binCount,
    reliability_bins: reliabilityBins,
    source: "evidence/calibration_data.csv",
    limitation: "This offline labeled calibration set does not establish the accuracy of the cash-flow forecast. Raw backtest outcome files are not included."
  };
}

export function readCalibrationEvidence() {
  return calculateCalibration(parseCalibrationCsv(fs.readFileSync(calibrationPath, "utf8")));
}
