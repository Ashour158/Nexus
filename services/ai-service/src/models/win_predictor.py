import os
import pickle
from typing import Any


class WinPredictor:
    """Random Forest win probability. Falls back to rules if model not trained."""

    MODEL_PATH = "models/win_predictor.pkl"

    def __init__(self) -> None:
        self.model = self._load_model()

    def _load_model(self) -> Any:
        if os.path.exists(self.MODEL_PATH):
            with open(self.MODEL_PATH, "rb") as f:
                return pickle.load(f)
        return None

    def predict(self, req: Any) -> tuple[float, list[str], list[str]]:
        if self.model:
            features = self._extract_features(req)
            prob = float(self.model.predict_proba([features])[0][1])
            return prob, self._risk_factors(req, prob), self._positive_factors(req)
        return self._rule_based_predict(req)

    def _rule_based_predict(self, req: Any) -> tuple[float, list[str], list[str]]:
        prob = 0.5
        risks: list[str] = []
        positives: list[str] = []

        stage_progress = req.stageIndex / max(req.totalStages - 1, 1)
        prob += stage_progress * 0.2
        if stage_progress > 0.7:
            positives.append("Advanced stage")

        if req.meddicicScore >= 70:
            prob += 0.15
            positives.append(f"Strong MEDDIC score ({req.meddicicScore})")
        elif req.meddicicScore < 40:
            prob -= 0.1
            risks.append(f"Weak MEDDIC score ({req.meddicicScore})")

        if req.lastActivityDaysAgo > 14:
            prob -= 0.15
            risks.append(f"No activity for {req.lastActivityDaysAgo} days")
        elif req.activitiesCount > 5:
            prob += 0.1
            positives.append(f"{req.activitiesCount} activities logged")

        if req.hasChampion:
            prob += 0.1
            positives.append("Internal champion identified")
        if req.hasEconomicBuyer:
            prob += 0.1
            positives.append("Economic buyer engaged")
        if req.competitorCount > 2:
            prob -= 0.1
            risks.append(f"Competing against {req.competitorCount} vendors")

        return round(max(0.0, min(1.0, prob)), 2), risks[:3], positives[:3]

    def _extract_features(self, req: Any) -> list[float]:
        return [
            float(req.amount),
            float(req.daysInPipeline),
            float(req.stageIndex / max(req.totalStages - 1, 1)),
            float(req.meddicicScore),
            float(req.activitiesCount),
            float(req.lastActivityDaysAgo),
            float(req.competitorCount),
            1.0 if req.hasChampion else 0.0,
            1.0 if req.hasEconomicBuyer else 0.0,
        ]

    def _risk_factors(self, req: Any, prob: float) -> list[str]:
        risks: list[str] = []
        if req.lastActivityDaysAgo > 14:
            risks.append(f"Stale — no activity {req.lastActivityDaysAgo} days")
        if req.competitorCount > 2:
            risks.append("High competitive pressure")
        if req.meddicicScore < 40:
            risks.append("MEDDIC gaps")
        return risks[:3]

    def _positive_factors(self, req: Any) -> list[str]:
        pos: list[str] = []
        if req.hasChampion:
            pos.append("Champion identified")
        if req.hasEconomicBuyer:
            pos.append("Economic buyer engaged")
        if req.meddicicScore >= 70:
            pos.append("Strong qualification")
        return pos[:3]
