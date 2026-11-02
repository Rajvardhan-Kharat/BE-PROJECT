export interface PatientSummary {
  patient_id: string
  mrn: string
  name: string
  date_of_birth: string
  gender: string
  hospital_ids: string[]
  care_team_ids: string[]
  allergies: string[]
  active_consent: boolean
}

export interface HospitalInfo {
  hospital_id: string
  name: string
  region: string
}

export interface CareTeamInfo {
  care_team_id: string
  care_team_name: string
  role: string
  hospital_id?: string
}

export interface PatientOverview {
  patient_id: string
  mrn: string
  name: string
  date_of_birth: string
  gender: string
  blood_type: string
  allergies: string[]
  hospital_ids: string[]
  hospitals: HospitalInfo[]
  care_team_ids: string[]
  care_teams: CareTeamInfo[]
  active_consent: boolean
  encounters_count: number
  verified_records_count: number
  pending_records_count: number
  created_at?: string
}

export interface TimelineEvent {
  event_id: string
  event_type: string
  timestamp: string
  title: string
  department: string
  hospital_name: string
  status: string
  details: {
    chief_complaint?: string
    attending_doctor_name?: string
    discharge_date?: string
    diagnosis_codes?: string[]
    version_number?: number
    record_type?: string
    reviewed_by?: string
    reviewed_at?: string
    data?: Record<string, any>
  }
}

export interface PatientTimelineResponse {
  patient_id: string
  mrn: string
  total_events: number
  events: TimelineEvent[]
}
