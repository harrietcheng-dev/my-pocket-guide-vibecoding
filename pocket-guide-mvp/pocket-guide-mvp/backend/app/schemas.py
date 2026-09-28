from __future__ import annotations

from datetime import date, time
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


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
    dailyStart: str = "09:00"
    dailyEnd: str = "21:00"
    dailyWindow: str = "09:00–21:00"
    startPoint: str = Field(default="酒店或住宿地", min_length=1)
    endPoint: str = Field(default="酒店或住宿地", min_length=1)
    physicalConstraints: list[str] = Field(default_factory=list)
    freeText: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_dates_and_time_window(self) -> "TripConstraints":
        try:
            start_date = date.fromisoformat(self.startDate)
            end_date = date.fromisoformat(self.endDate)
        except ValueError as error:
            raise ValueError("日期必须使用 YYYY-MM-DD 格式") from error
        actual_days = (end_date - start_date).days + 1
        if actual_days < 1:
            raise ValueError("结束日期不能早于开始日期")
        if actual_days > 7:
            raise ValueError("单次行程最多安排 7 天")
        try:
            start_time = time.fromisoformat(self.dailyStart)
            end_time = time.fromisoformat(self.dailyEnd)
        except ValueError as error:
            raise ValueError("每日时段必须使用 HH:MM 格式") from error
        if end_time <= start_time:
            raise ValueError("每日结束时间必须晚于开始时间")
        if not self.transportModes:
            raise ValueError("请至少选择一种交通方式")
        self.days = actual_days
        self.dailyWindow = f"{self.dailyStart}–{self.dailyEnd}"
        return self


class CreateTripRequest(BaseModel):
    constraints: TripConstraints


class ReplanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class TripEditNode(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: str = Field(default="景点", min_length=1, max_length=20)
    durationMin: int = Field(default=90, ge=15, le=480)
    costRange: list[float] = Field(default_factory=lambda: [0, 0], min_length=2, max_length=2)
    reason: str = Field(default="用户手动调整", max_length=200)
    latitude: float | None = None
    longitude: float | None = None


class TripEditOperation(BaseModel):
    action: Literal["add", "replace", "delete", "move"]
    dayIndex: int = Field(ge=1, le=7)
    nodeId: str | None = None
    targetIndex: int | None = Field(default=None, ge=0)
    node: TripEditNode | None = None


class TripEditRequest(BaseModel):
    operations: list[TripEditOperation] = Field(min_length=1, max_length=30)


class CheckInRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    manual: bool = True


class ConversationMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    node_id: str | None = None


class AnonymousSessionRequest(BaseModel):
    device_id: str | None = None


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
