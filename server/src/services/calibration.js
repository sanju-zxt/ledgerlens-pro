import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
  const epsilon = Number.EPSILON;
  const logLoss = -observations.reduce((sum, item) => {
    const probability = Math.min(1 - epsilon, Math.max(epsilon, item.prediction));
    return sum + item.label * Math.log(probability) + (1 - item.label) * Math.log(1 - probability);
  }, 0) / n;
  const baselineBrierScore = observations.reduce((sum, item) => sum + (positiveRate - item.label) ** 2, 0) / n;
  const positiveCount = observations.reduce((sum, item) => sum + item.label, 0);
  const negativeCount = n - positiveCount;
  const threshold = 0.5;
  const confusion = { true_positive: 0, false_positive: 0, true_negative: 0, false_negative: 0 };
  for (const { prediction, label } of observations) {
    const predictedPositive = prediction >= threshold;
    if (predictedPositive && label === 1) confusion.true_positive++;
    else if (predictedPositive) confusion.false_positive++;
    else if (label === 1) confusion.false_negative++;
    else confusion.true_negative++;
  }
  const precision = confusion.true_positive + confusion.false_positive
    ? confusion.true_positive / (confusion.true_positive + confusion.false_positive) : null;
  const recall = positiveCount ? confusion.true_positive / positiveCount : null;
  const f1 = recall === null ? null : (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
  let rocAuc = null;
  let prAuc = null;
  if (positiveCount && negativeCount) {
    const sorted = [...observations].sort((a, b) => b.prediction - a.prediction);
    let tp = 0;
    let fp = 0;
    let previousTpr = 0;
    let previousFpr = 0;
    let previousRecall = 0;
    let rocArea = 0;
    let prArea = 0;
    for (let index = 0; index < sorted.length;) {
      let end = index;
      while (end < sorted.length && sorted[end].prediction === sorted[index].prediction) {
        if (sorted[end].label) tp++;
        else fp++;
        end++;
      }
      const tpr = tp / positiveCount;
      const fpr = fp / negativeCount;
      const currentPrecision = tp / (tp + fp);
      prArea += (tpr - previousRecall) * currentPrecision;
      rocArea += (fpr - previousFpr) * (tpr + previousTpr) / 2;
      previousRecall = tpr;
      previousTpr = tpr;
      previousFpr = fpr;
      index = end;
    }
    rocAuc = rocArea;
    prAuc = prArea;
  }
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
    log_loss: logLoss,
    baseline_brier_score: baselineBrierScore,
    brier_skill_score: baselineBrierScore > 0 ? 1 - brierScore / baselineBrierScore : null,
    expected_calibration_error: expectedCalibrationError,
    ece_method: "equal-width bins",
    n_samples: n,
    positive_rate: positiveRate,
    positive_count: positiveCount,
    negative_count: negativeCount,
    class_distribution_valid: positiveCount > 0 && negativeCount > 0,
    evaluation_status: positiveCount > 0 && negativeCount > 0 ? "two_class" : "single_class",
    class_distribution_warning: positiveCount === 0 ? "Positive-event performance cannot be validated because the evaluation dataset contains no positive labels." : negativeCount === 0 ? "Negative-event performance cannot be validated because the evaluation dataset contains no negative labels." : null,
    classification_threshold: threshold,
    confusion_matrix: confusion,
    precision,
    recall,
    f1_score: f1,
    roc_auc: rocAuc,
    pr_auc: prAuc,
    pr_auc_method: "stepwise average precision",
    bins: binCount,
    reliability_bins: reliabilityBins,
    source: "evidence/calibration_data.csv",
    holdout_validation: { status: "unavailable", reason: "The evidence contains no time/group key for an independent split, and its raw forecast outcome files are missing." },
    limitation: "This offline labeled calibration set does not establish the accuracy of the cash-flow forecast. Raw backtest outcome files are not included."
  };
}

export function readCalibrationEvidence() {
  const contents = fs.readFileSync(calibrationPath, "utf8");
  return {
    ...calculateCalibration(parseCalibrationCsv(contents)),
    dataset_version: createHash("sha256").update(contents).digest("hex"),
    evaluation_period: { start: null, end: null, reason: "Source file has no observation timestamp" },
    model_version: null,
    last_evaluated_at: new Date().toISOString()
  };
}
