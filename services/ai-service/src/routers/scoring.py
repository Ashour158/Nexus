from fastapi import APIRouter, Depends

from src.middleware.auth import verify_token
from src.models.lead_scorer import LeadScorer
from src.models.win_predictor import WinPredictor
from src.schemas.requests import DealScoringRequest, LeadScoringRequest
from src.schemas.responses import DealScoringResponse, LeadScoringResponse

router = APIRouter(tags=["scoring"])
lead_scorer = LeadScorer()
win_predictor = WinPredictor()


@router.post("/score/lead", response_model=LeadScoringResponse)
async def score_lead(req: LeadScoringRequest, _token: str = Depends(verify_token)):
    score, factors = lead_scorer.score(req)
    return LeadScoringResponse(
        leadId=req.leadId,
        score=round(score, 1),
        probability=round(score / 100, 2),
        grade=lead_scorer.get_grade(score),
        topFactors=factors,
        recommendation=lead_scorer.get_recommendation(score),
    )


@router.post("/score/deal", response_model=DealScoringResponse)
async def score_deal(req: DealScoringRequest, _token: str = Depends(verify_token)):
    prob, risks, positives = win_predictor.predict(req)
    action = "Schedule next meeting" if risks else "Push for close"
    if any("stale" in r.lower() for r in risks):
        action = "Urgently follow up — deal going cold"
    return DealScoringResponse(
        dealId=req.dealId,
        winProbability=prob,
        riskFactors=risks,
        positiveFactors=positives,
        suggestedNextAction=action,
    )
