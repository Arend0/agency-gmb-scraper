import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ExternalLink, MapPin, Globe, Phone, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import axios from 'axios'
import type {
  Lead,
  LeadExportFilters,
  LeadStatus,
  UpdateLeadBody,
} from '../lib/api.ts'
import {
  exportLeadsCsv,
  listLeads,
  updateLead,
} from '../lib/api.ts'

const LEAD_STATUSES: LeadStatus[] = [
  'NEW',
  'QUALIFIED',
  'CONTACTED',
  'NOT_RELEVANT',
]

const QUERY_KEY_ROOT = ['leads'] as const

const PAGE_SIZE = 50

const NOTES_PREVIEW = 80

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function websiteHref(uri: string): string {
  const t = uri.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function telHref(lead: Lead): string | null {
  const raw =
    lead.internationalPhoneNumber?.trim() ||
    lead.nationalPhoneNumber?.trim() ||
    null
  if (!raw) return null
  const hrefDigits = raw.replace(/[^\d+]/g, '')
  if (!hrefDigits.replace(/\+/g, '').length) return null
  return `tel:${hrefDigits}`
}

function phoneLabel(lead: Lead): string {
  return (
    lead.internationalPhoneNumber?.trim() ||
    lead.nationalPhoneNumber?.trim() ||
    '—'
  )
}

function ratingLabel(lead: Lead): string {
  if (lead.rating == null) return '—'
  const c =
    lead.userRatingCount != null ? ` (${lead.userRatingCount})` : ''
  return `${lead.rating}${c}`
}

function truncateNotes(text: string, max = NOTES_PREVIEW): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function listErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined
    if (data?.error?.trim()) return data.error.trim()
    if (error.message?.trim()) return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong loading leads.'
}

function hasActiveFilters(filters: {
  status: string
  city: string
  search: string
  hasPhone: boolean | undefined
  hasWebsite: boolean | undefined
}): boolean {
  return !!(
    filters.status ||
    filters.city.trim() ||
    filters.search.trim() ||
    filters.hasPhone !== undefined ||
    filters.hasWebsite !== undefined
  )
}

function StatCard({
  label,
  value,
  Icon,
  loading,
}: {
  label: string
  value: number | string
  Icon: typeof Users
  loading?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex size-10 items-center justify-center rounded-md bg-[#FFC107]/15 text-[#b08300]">
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums text-gray-900">
          {loading ? (
            <span className="inline-block h-7 w-12 animate-pulse rounded bg-gray-200" />
          ) : (
            value
          )}
        </p>
      </div>
    </div>
  )
}

function SkeletonRows() {
  const row = (_i: number) => (
    <tr key={`sk-${String(_i)}`} className="animate-pulse">
      <td className="px-4 py-3">
        <div className="h-4 w-40 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-28 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-32 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-24 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-16 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-8 w-[8.5rem] rounded-md bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-10 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-7 w-16 rounded-md bg-gray-200" />
      </td>
    </tr>
  )
  return <>{Array.from({ length: 8 }, (_, i) => row(i))}</>
}

export default function Leads() {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)

  const [status, setStatus] = useState('')
  const [city, setCity] = useState('')
  const [search, setSearch] = useState('')
  const [hasPhone, setHasPhone] = useState<boolean | undefined>(undefined)
  const [hasWebsite, setHasWebsite] = useState<boolean | undefined>(undefined)

  const [debouncedCity, setDebouncedCity] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedCity(city), 350)
    return () => window.clearTimeout(id)
  }, [city])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 350)
    return () => window.clearTimeout(id)
  }, [search])

  const listParams = {
    ...(status ? { status } : {}),
    ...(debouncedCity.trim()
      ? { city: debouncedCity.trim() }
      : {}),
    ...(debouncedSearch.trim()
      ? { search: debouncedSearch.trim() }
      : {}),
    ...(hasPhone === true ? { hasPhone: true } : {}),
    ...(hasWebsite === true ? { hasWebsite: true } : {}),
    page,
    limit: PAGE_SIZE,
  }

  const {
    data,
    error,
    isPending,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: [...QUERY_KEY_ROOT, listParams],
    queryFn: () => listLeads(listParams),
    placeholderData: keepPreviousData,
  })

  const updateMutation = useMutation
    Awaited<ReturnType<typeof updateLead>>,
    Error,
    { id: string; body: UpdateLeadBody }
  >({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: UpdateLeadBody
    }) => updateLead(id, body),
    onSuccess: () => {
      toast.success('Updated')
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ROOT })
    },
    onError: () => {
      toast.error('Update failed — try again')
    },
  })

  const busyId =
    updateMutation.isPending &&
    typeof updateMutation.variables?.id === 'string'
      ? updateMutation.variables.id
      : null

  const exportMutation = useMutation({
    mutationFn: (filters: LeadExportFilters) => exportLeadsCsv(filters),
    onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    onError: () => toast.error('Export failed — try again'),
  })

  const buildExportFilters = useCallback(
    (): LeadExportFilters =>
      ({
        ...(status ? { status } : {}),
        ...(debouncedCity.trim()
          ? { city: debouncedCity.trim() }
          : {}),
        ...(debouncedSearch.trim()
          ? { search: debouncedSearch.trim() }
          : {}),
        ...(hasPhone === true ? { hasPhone: true } : {}),
        ...(hasWebsite === true ? { hasWebsite: true } : {}),
      }) satisfies LeadExportFilters,
    [
      debouncedCity,
      debouncedSearch,
      hasPhone,
      hasWebsite,
      status,
    ],
  )

  const handleExport = () =>
    exportMutation.mutate(buildExportFilters())

  const rows = data?.leads ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showSkeleton = isPending && !data && !error

  // Page-level counts (current page only — see file note)
  const pageStats = useMemo(() => {
    const withPhone = rows.filter(
      (l) =>
        (l.internationalPhoneNumber?.trim() ||
          l.nationalPhoneNumber?.trim() ||
          '').length > 0,
    ).length
    const withWebsite = rows.filter(
      (l) => (l.websiteUri?.trim() ?? '').length > 0,
    ).length
    return { withPhone, withWebsite }
  }, [rows])

  const filtersActive = hasActiveFilters({
    status,
    city: debouncedCity,
    search: debouncedSearch,
    hasPhone,
    hasWebsite,
  })

  const showEmptyOnboarding =
    !showSkeleton &&
    !error &&
    rows.length === 0 &&
    total === 0 &&
    page === 1 &&
    !filtersActive

  const showFilteredEmpty =
    !showSkeleton &&
    !error &&
    !showEmptyOnboarding &&
    rows.length === 0 &&
    data !== undefined

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
        <p className="mt-1 text-sm text-gray-600">
          Filter, update status and notes, then export when you&apos;re ready.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={filtersActive ? 'Filtered leads' : 'Total leads'}
          value={data !== undefined ? total.toLocaleString() : '—'}
          Icon={Users}
          loading={showSkeleton}
        />
        <StatCard
          label="With phone (page)"
          value={data !== undefined ? pageStats.withPhone : '—'}
          Icon={Phone}
          loading={showSkeleton}
        />
        <StatCard
          label="With website (page)"
          value={data !== undefined ? pageStats.withWebsite : '—'}
          Icon={Globe}
          loading={showSkeleton}
        />
      </div>
      {filtersActive && data !== undefined ? (
        <p className="-mt-3 text-xs text-gray-500">
          Filters active — showing {total.toLocaleString()} matching leads.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-1 flex-wrap items-end gap-4 gap-y-3 md:mr-4">
          <div>
            <label
              htmlFor="filter-status"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600"
            >
              Status
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="min-w-[10rem] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            >
              <option value="">All</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[8rem] flex-1">
            <label
              htmlFor="filter-city"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600"
            >
              City
            </label>
            <input
              id="filter-city"
              type="text"
              value={city}
              onChange={(e) => {
                setCity(e.target.value)
                setPage(1)
              }}
              placeholder="Any city"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
          </div>

          <div className="min-w-[12rem] flex-[2]">
            <label
              htmlFor="filter-search"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600"
            >
              Search
            </label>
            <input
              id="filter-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Business name"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="size-4 accent-[#FFC107]"
              checked={hasPhone === true}
              onChange={(e) => {
                setHasPhone(e.target.checked ? true : undefined)
                setPage(1)
              }}
            />
            Has phone
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="size-4 accent-[#FFC107]"
              checked={hasWebsite === true}
              onChange={(e) => {
                setHasWebsite(e.target.checked ? true : undefined)
                setPage(1)
              }}
            />
            Has website
          </label>
        </div>

        <button
          type="button"
          onClick={() => handleExport()}
          disabled={
            exportMutation.isPending || total === 0 || error !== null
          }
          className="shrink-0 rounded-md bg-[#FFC107] px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-[#e6ac00] disabled:cursor-not-allowed disabled:opacity-60 md:self-end"
        >
          {exportMutation.isPending ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="flex items-center justify-end">
        {isFetching && !showSkeleton ? (
          <span className="text-xs text-gray-500">Refreshing…</span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-6 text-center"
        >
          <p className="text-sm text-red-800">{listErrorMessage(error)}</p>
          <button
            type="button"
            className="mt-4 rounded-md bg-red-900 px-4 py-2 text-sm font-medium text-white hover:bg-red-950"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!error ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-[900px] w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  Business name
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  Phone
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  Website
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  City
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  Rating
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  Status
                </th>
                <th className="min-w-[8rem] px-4 py-3 font-semibold text-gray-700">
                  Notes
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                  Maps
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {showSkeleton ? <SkeletonRows /> : null}

              {!showSkeleton && showEmptyOnboarding ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <p className="text-sm text-gray-600">
                      No leads yet —{' '}
                      <Link
                        to="/"
                        className="font-medium text-[#b08300] underline decoration-[#FFC107]/70 hover:text-gray-900"
                      >
                        run a search
                      </Link>{' '}
                      to get started.
                    </p>
                  </td>
                </tr>
              ) : null}

              {!showSkeleton && showFilteredEmpty ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No leads match your filters.
                  </td>
                </tr>
              ) : null}

              {!showSkeleton &&
              !showEmptyOnboarding &&
              !showFilteredEmpty
                ? rows.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      busyRow={busyId === lead.id}
                      isStale={Boolean(isPlaceholderData)}
                      updateMutation={(id, body) =>
                        updateMutation.mutate({ id, body })
                      }
                    />
                  ))
                : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {!error && totalPages > 1 ? (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm disabled:opacity-40"
            disabled={page <= 1 || updateMutation.isPending}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm disabled:opacity-40"
            disabled={page >= totalPages || updateMutation.isPending}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

function LeadRow({
  lead,
  busyRow,
  isStale,
  updateMutation,
}: {
  lead: Lead
  busyRow: boolean
  isStale: boolean
  updateMutation: (id: string, body: UpdateLeadBody) => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const displayNotes = lead.notes ?? ''

  const openNotes = () => {
    setDraft(lead.notes ?? '')
    setNotesOpen(true)
  }

  const saveNotesBlur = () => {
    const next = draft ?? ''
    const prev = lead.notes ?? ''
    if (next === prev) {
      setNotesOpen(false)
      return
    }
    updateMutation(lead.id, { notes: next })
    setNotesOpen(false)
  }

  const tel = telHref(lead)
  const phone = phoneLabel(lead)

  return (
    <tr
      className={`hover:bg-gray-50/80 ${isStale ? 'opacity-70' : ''}`}
    >
      <td className="px-4 py-3 font-medium text-gray-900">
        {lead.businessName}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
        {tel ? (
          
            href={tel}
            className="font-medium text-[#b08300] underline decoration-[#FFC107]/50 hover:text-gray-900"
          >
            {phone}
          </a>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3">
        {lead.websiteUri ? (
          
            href={websiteHref(lead.websiteUri)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-[14rem] items-center gap-1 truncate font-medium text-[#b08300] underline decoration-[#FFC107]/50 hover:text-gray-900"
          >
            <span className="truncate">
              {lead.websiteUri.replace(/^https?:\/\//i, '')}
            </span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-700">
        {lead.city?.trim() || '—'}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
        {ratingLabel(lead)}
      </td>
      <td className="px-4 py-3">
        <select
          value={lead.status}
          disabled={busyRow}
          onChange={(e) => {
            const v = e.target.value as LeadStatus
            if (v === lead.status) return
            updateMutation(lead.id, { status: v })
          }}
          className="w-full max-w-[10.5rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium uppercase text-gray-900 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:opacity-60"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="max-w-xs px-4 py-3 text-gray-700">
        {!notesOpen ? (
          <button
            type="button"
            onClick={openNotes}
            disabled={busyRow}
            className={`w-full text-left text-xs ${displayNotes.trim() ? 'text-gray-800' : 'text-gray-400'}`}
          >
            {displayNotes.trim()
              ? truncateNotes(displayNotes)
              : 'Add notes…'}
          </button>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveNotesBlur}
            rows={3}
            className="w-full min-w-[12rem] rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            autoFocus
          />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {lead.googleMapsUri ? (
          
            href={lead.googleMapsUri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-800 hover:border-[#FFC107]/60 hover:bg-[#FFC107]/10"
          >
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            Maps
          </a>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
    </tr>
  )
}
