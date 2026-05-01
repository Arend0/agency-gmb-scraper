import axios, { type AxiosInstance } from 'axios'

/** Mirrors server `LeadStatus` */
export type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'CONTACTED'
  | 'NOT_RELEVANT'

/** Mirrors Prisma `Lead` JSON shape from the API */
export interface Lead {
  id: string
  placeId: string
  businessName: string
  formattedAddress: string | null
  city: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  googleMapsUri: string | null
  websiteUri: string | null
  nationalPhoneNumber: string | null
  internationalPhoneNumber: string | null
  rating: number | null
  userRatingCount: number | null
  businessStatus: string | null
  primaryType: string | null
  types: string[]
  searchKeyword: string | null
  searchLocation: string | null
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SearchAgenciesBody {
  keyword: string
  location: string
  hasPhone?: boolean
  hasWebsite?: boolean
  minRating?: number
}

export interface SearchAgenciesResponse {
  searchRunId: string
  totalFound: number
  totalSaved: number
  leads: Lead[]
}

export interface ListLeadsParams {
  status?: string
  city?: string
  country?: string
  hasPhone?: boolean
  hasWebsite?: boolean
  search?: string
  page?: number
  limit?: number
}

export interface ListLeadsResponse {
  leads: Lead[]
  total: number
  page: number
  limit: number
}

export interface UpdateLeadBody {
  status?: LeadStatus
  notes?: string
}

/** Same filter fields as POST /api/leads/export body */
export interface LeadExportFilters {
  status?: string
  city?: string
  country?: string
  hasPhone?: boolean
  hasWebsite?: boolean
  search?: string
}

const configured = import.meta.env.VITE_API_BASE_URL?.trim()
const baseURL =
  configured !== undefined && configured !== ''
    ? configured
    : import.meta.env.PROD
      ? ''
      : 'http://localhost:3001'

export const api: AxiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export async function searchAgencies(
  body: SearchAgenciesBody,
): Promise<SearchAgenciesResponse> {
  const { data } = await api.post<SearchAgenciesResponse>(
    '/api/searches',
    body,
  )
  return data
}

export async function listLeads(
  params?: ListLeadsParams,
): Promise<ListLeadsResponse> {
  const { data } = await api.get<ListLeadsResponse>('/api/leads', { params })
  return data
}

export async function getLead(id: string): Promise<Lead> {
  const { data } = await api.get<Lead>(`/api/leads/${encodeURIComponent(id)}`)
  return data
}

export async function updateLead(
  id: string,
  body: UpdateLeadBody,
): Promise<Lead> {
  const { data } = await api.patch<Lead>(
    `/api/leads/${encodeURIComponent(id)}`,
    body,
  )
  return data
}

export async function exportLeadsCsv(
  filters: LeadExportFilters,
): Promise<{ blob: Blob; filename: string }> {
  const res = await api.post<Blob>('/api/leads/export', filters, {
    responseType: 'blob',
    headers: { Accept: 'text/csv' },
  })

  const disposition = res.headers['content-disposition']
  const match =
    disposition && /filename="([^"]+)"/i.exec(disposition)
  const filename =
    match?.[1] ?? `leads-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`

  return { blob: res.data, filename }
}
