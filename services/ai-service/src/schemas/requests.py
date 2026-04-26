from typing import Optional

from pydantic import BaseModel


class LeadScoringRequest(BaseModel):
    tenantId: str
    leadId: str
    source: str
    industry: Optional[str] = None
    employeeCount: Optional[int] = None
    annualRevenue: Optional[float] = None
    jobTitle: Optional[str] = None
    utmSource: Optional[str] = None
    utmMedium: Optional[str] = None
    emailOpened: bool = False
    websiteVisits: int = 0


class DealScoringRequest(BaseModel):
    tenantId: str
    dealId: str
    amount: float
    daysInPipeline: int
    stageIndex: int
    totalStages: int
    meddicicScore: int
    activitiesCount: int
    lastActivityDaysAgo: int
    competitorCount: int
    hasChampion: bool
    hasEconomicBuyer: bool


class TranscriptionRequest(BaseModel):
    tenantId: str
    activityId: str
    language: str = "en"


class DealInsightsRequest(BaseModel):
    tenantId: str
    dealId: str
    dealName: str
    amount: float
    meddicicScore: int
    daysInPipeline: int
    activitiesCount: int
    lastActivityDaysAgo: int
    stageHistory: list[dict]
