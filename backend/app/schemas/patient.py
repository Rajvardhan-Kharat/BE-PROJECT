from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class PatientSummary(BaseModel):
    patient_id: str
    mrn: str
    name: str
    date_of_birth: str
    gender: str
    hospital_ids: List[str]
    care_team_ids: List[str]
    allergies: List[str]
    active_consent: bool


class EncounterResponse(BaseModel):
    encounter_id: str
    patient_id: str
    hospital_id: str
    hospital_name: Optional[str] = None
    department: str
    attending_doctor_id: Optional[str] = None
    attending_doctor_name: Optional[str] = None
    encounter_type: str
    admission_date: str
    discharge_date: Optional[str] = None
    status: str
    chief_complaint: str
    diagnosis_codes: List[str] = []


class PatientOverview(BaseModel):
    patient_id: str
    mrn: str
    name: str
    date_of_birth: str
    gender: str
    blood_type: str
    allergies: List[str]
    hospital_ids: List[str]
    hospitals: List[Dict[str, Any]] = []
    care_team_ids: List[str]
    care_teams: List[Dict[str, Any]] = []
    active_consent: bool
    encounters_count: int = 0
    verified_records_count: int = 0
    pending_records_count: int = 0
    created_at: Optional[datetime] = None


class TimelineEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: str
    title: str
    department: str
    hospital_name: str
    status: str
    details: Dict[str, Any] = {}


class PatientTimelineResponse(BaseModel):
    patient_id: str
    mrn: str
    total_events: int
    events: List[TimelineEvent]
