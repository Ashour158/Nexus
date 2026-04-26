import os
import pickle
from typing import Any


class LeadScorer:
    """XGBoost-based lead scoring. Falls back to rule-based scoring if model not trained yet."""

    MODEL_PATH = "models/lead_scorer.pkl"

    def __init__(self) -> None:
        self.model = self._load_model()

    def _load_model(self) -> Any:
        if os.path.exists(self.MODEL_PATH):
            with open(self.MODEL_PATH, "rb") as f:
                return pickle.load(f)
        return None

    def score(self, req: Any) -> tuple[float, list[str]]:
        if self.model:
            features = self._extract_features(req)
            prob = float(self.model.predict_proba([features])[0][1])
            score = prob * 100
            return score, self._explain(features, prob)
        return self._rule_based_score(req)

    def _rule_based_score(self, req: Any) -> tuple[float, list[str]]:
        score = 50.0
        factors: list[str] = []

        source_scores = {
            "INBOUND": 20,
            "REFERRAL": 25,
            "WEB_FORM": 15,
            "COLD_OUTBOUND": 5,
            "IMPORT": 0,
        }
        source_bonus = source_scores.get(req.source, 0)
        score += source_bonus
        if source_bonus > 10:
            factors.append(f"High-value source: {req.source}")

        if req.annualRevenue and req.annualRevenue > 1_000_000:
            score += 15
            factors.append("Annual revenue > $1M")

        if req.employeeCount and req.employeeCount > 100:
            score += 10
            factors.append("Company > 100 employees")

        if req.emailOpened:
            score += 8
            factors.append("Opened email")

        if req.websiteVisits > 3:
            score += 5 * min(req.websiteVisits, 5)
            factors.append(f"{req.websiteVisits} website visits")

        senior_titles = ["vp", "director", "chief", "head", "president", "ceo", "cto", "cfo"]
        if req.jobTitle and any(t in req.jobTitle.lower() for t in senior_titles):
            score += 12
            factors.append("Senior decision-maker title")

        return min(score, 100.0), factors[:3]

    def _extract_features(self, req: Any) -> list[float]:
        return [
            float(req.annualRevenue or 0),
            float(req.employeeCount or 0),
            1.0 if req.emailOpened else 0.0,
            float(req.websiteVisits),
            1.0
            if req.jobTitle
            and any(t in req.jobTitle.lower() for t in ["vp", "director", "chief", "ceo"])
            else 0.0,
        ]

    def _explain(self, features: list[float], prob: float) -> list[str]:
        explanations: list[str] = []
        if features[0] > 1_000_000:
            explanations.append("High annual revenue")
        if features[2]:
            explanations.append("Opened email")
        if features[4]:
            explanations.append("Senior title")
        return explanations or ["Model-based prediction"]

    def get_grade(self, score: float) -> str:
        if score >= 75:
            return "A"
        if score >= 50:
            return "B"
        if score >= 25:
            return "C"
        return "D"

    def get_recommendation(self, score: float) -> str:
        if score >= 70:
            return "CALL_NOW"
        if score >= 40:
            return "NURTURE"
        return "DISQUALIFY"
