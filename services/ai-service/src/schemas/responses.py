from pydantic import BaseModel


class LeadScoringResponse(BaseModel):
    leadId: str
    score: float
    probability: float
    grade: str
    topFactors: list[str]
    recommendation: str


class DealScoringResponse(BaseModel):
    dealId: str
    winProbability: float
    riskFactors: list[str]
    positiveFactors: list[str]
    suggestedNextAction: str


class TranscriptionResponse(BaseModel):
    activityId: str
    transcript: str
    duration: float
    language: str


class DealInsightsResponse(BaseModel):
    dealId: str
    summary: str
    risks: list[str]
    opportunities: list[str]
    nextBestActions: list[str]
