export type ConsentStatus = 'granted' | 'revoked' | 'expired'
export type ConsentPurpose = 'treatment' | 'emergency' | 'research' | 'referral' | 'care_coordination' | '*'
export type ConsentCategory = 'allergies' | 'medications' | 'diagnoses' | 'vitals' | 'encounter_notes' | 'lab_results' | '*'

export interface PatientConsentResponse {
  consent_id: string
  patient_id: string
  purpose: string
  categories: string[]
  recipient: string
  text_version: string
  status: ConsentStatus
  effective_from: string
  expires_at?: string | null
  revoked_at?: string | null
  revocation_reason?: string | null
  granted_by?: string
  created_at: string
  updated_at?: string
}

export interface GrantConsentRequest {
  patient_id: string
  purpose: string
  categories: string[]
  recipient: string
  text_version?: string
  effective_from?: string
  expires_at?: string
}

export interface RevokeConsentRequest {
  reason: string
}
