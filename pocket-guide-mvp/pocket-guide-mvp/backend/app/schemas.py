from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TripConstraints(BaseModel):
    city: str = Field(min_length=1)
    startDate: str
    endDate: str
    days: int = Field(default=4, ge=1, le=7)
    partySize: int = Field(default=1, ge=1)
    groupBudgetCny: float = Field(gt=0)
    interests: list[str] = Field(default_factory=list)
    pace: str = "适中"
    transportModes: list[str] = Field(default_factory=lambda: ["公交", "地铁", "步行"])
    dailyWindow: str = "09:00–21:00"
    physicalConstraints: list[str] = Field(default_factory=list)
    freeText: str | None = None


class CreateTripRequest(BaseModel):
    constraints: TripConstraints


class ReplanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class AnonymousSessionRequest(BaseModel):
    device_id: str | None = None


class NodeStatusRequest(BaseModel):
    action: str = Field(pattern="^(COMPLETED|SKIPPED)$")


class CompleteTripRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class TripResponse(BaseModel):
    id: str
    state: str
    version: int
    title: str
    constraints: dict[str, Any]
    costSummary: dict[str, Any]
    days: list[dict[str, Any]]
    validationSummary: dict[str, Any]
    previousSnapshot: dict[str, Any] | None = None
    lastAdjustment: str | None = None
