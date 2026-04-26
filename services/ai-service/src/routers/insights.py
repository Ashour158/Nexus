import json
import os

from fastapi import APIRouter, Depends

from src.middleware.auth import verify_token
from src.schemas.requests import DealInsightsRequest
from src.schemas.responses import DealInsightsResponse

router = APIRouter(tags=["insights"])


@router.post("/insights/deal", response_model=DealInsightsResponse)
async def deal_insights(req: DealInsightsRequest, _token: str = Depends(verify_token)):
    try:
        import ollama  # type: ignore

        prompt = f"""Analyze this sales deal and provide actionable insights:
Deal: {req.dealName}
Amount: ${req.amount:,.0f}
MEDDIC Score: {req.meddicicScore}/100
Days in Pipeline: {req.daysInPipeline}
Activities: {req.activitiesCount} (last: {req.lastActivityDaysAgo} days ago)

Respond in JSON: {{"summary": "...", "risks": ["...", "..."], "opportunities": ["..."], "nextBestActions": ["...", "..."]}}"""

        response = ollama.chat(
            model=os.getenv("OLLAMA_MODEL", "llama3"),
            messages=[{"role": "user", "content": prompt}],
        )
        content = response["message"]["content"]
        data = json.loads(content)
        return DealInsightsResponse(
            dealId=req.dealId,
            summary=data["summary"],
            risks=data["risks"],
            opportunities=data.get("opportunities", []),
            nextBestActions=data["nextBestActions"],
        )
    except Exception:
        risks: list[str] = []
        if req.lastActivityDaysAgo > 14:
            risks.append(
                f"No activity in {req.lastActivityDaysAgo} days — deal may be going cold"
            )
        if req.meddicicScore < 50:
            risks.append("MEDDIC score below 50 — qualification gaps need addressing")

        actions = (
            ["Schedule a discovery call to re-engage"]
            if req.lastActivityDaysAgo > 7
            else ["Send a value-based follow-up email"]
        )
        if req.meddicicScore < 50:
            actions.append("Complete MEDDIC qualification — identify economic buyer")

        return DealInsightsResponse(
            dealId=req.dealId,
            summary=f"${req.amount:,.0f} deal with {req.meddicicScore}/100 MEDDIC score, {req.daysInPipeline} days in pipeline.",
            risks=risks or ["No critical risks identified"],
            opportunities=["Strong deal size indicates enterprise potential"]
            if req.amount > 50000
            else ["Opportunity to upsell to larger package"],
            nextBestActions=actions,
        )
