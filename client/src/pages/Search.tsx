import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { CheckCircle2, ExternalLink, Filter, RefreshCw, Search as SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { searchAgencies, type Lead, type SearchAgenciesBody } from '../lib/api.ts'

type SearchFormValues = {
  keyword: string
  location: string
  country: string
  hasPhone: boolean
  hasWebsite: boolean
  minRating: string
}

type SearchSummary = {
  totalFound: number
  totalSaved: number
  duplicatesSkipped?: number
  filteredOut?: number
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: string; message?: string }
      | undefined
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error.trim()
    }
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message.trim()
    }
    if (error.message?.trim()) return error.message.trim()
  }
  if (error instanceof Error && error.message) return error.message
  return 'Request failed'
}

function websiteHref(uri: string): string {
  const t = uri.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function phoneDisplay(lead: Lead): string {
  return (
    lead.nationalPhoneNumber?.trim() ||
    lead.internationalPhoneNumber?.trim() ||
    '—'
  )
}

function ratingDisplay(lead: Lead): string {
  if (lead.rating == null) return '—'
  const reviews =
    lead.userRatingCount != null ? ` (${lead.userRatingCount})` : ''
  return `${lead.rating}${reviews}`
}

function statusBadgeClass(status: string): string {
  const base =
    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset'
  switch (status) {
    case 'NEW':
      return `${base} bg-[#FFC107]/15 text-gray-900 ring-[#FFC107]/35`
    case 'QUALIFIED':
      return `${base} bg-emerald-50 text-emerald-800 ring-emerald-600/15`
    case 'CONTACTED':
      return `${base} bg-blue-50 text-blue-800 ring-blue-600/15`
    case 'NOT_RELEVANT':
      return `${base} bg-gray-100 text-gray-700 ring-gray-500/15`
    default:
      return `${base} bg-gray-100 text-gray-800 ring-gray-500/15`
  }
}

function StatPill({
  label,
  value,
  Icon,
  tone = 'neutral',
}: {
  label: string
  value: number
  Icon: typeof SearchIcon
  tone?: 'success' | 'neutral' | 'muted'
}) {
  const toneClasses =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-900 ring-emerald-600/20'
      : tone === 'muted'
      ? 'bg-gray-50 text-gray-700 ring-gray-300/60'
      : 'bg-[#FFC107]/15 text-gray-900 ring-[#FFC107]/40'
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 ring-1 ring-inset ${toneClasses}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className="ml-1 text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export default function Search() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [summary, setSummary] = useState<SearchSummary | null>(null)

  const mutation = useMutation({
    mutationFn: (body: SearchAgenciesBody) => searchAgencies(body),
    onSuccess: (data) => {
      setLeads(data.leads)
      // Backend returns: totalFound, totalSaved, duplicatesSkipped, filteredOut
      const s: SearchSummary = {
        totalFound: data.totalFound ?? 0,
        totalSaved: data.totalSaved ?? 0,
        duplicatesSkipped:
          (data as { duplicatesSkipped?: number }).duplicatesSkipped,
        filteredOut: (data as { filteredOut?: number }).filteredOut,
      }
      setSummary(s)
      toast.success(
        s.totalSaved > 0
          ? `${s.totalSaved} new lead${s.totalSaved === 1 ? '' : 's'} saved`
          : 'No new leads — all results already in your database',
      )
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchFormValues>({
    defaultValues: {
      keyword: 'website agency',
      location: 'Amsterdam',
      country: '',
      hasPhone: true,
      hasWebsite: false,
      minRating: '',
    },
  })

  const onSubmit = (values: SearchFormValues) => {
    const country = values.country?.trim()
    const locationQuery = country
      ? `${values.location.trim()}, ${country}`
      : values.location.trim()

    let minRating: number | undefined
    const mr = values.minRating?.trim()
    if (mr) {
      const n = Number(mr)
      if (Number.isFinite(n)) minRating = n
    }

    mutation.mutate({
      keyword: values.keyword.trim(),
      location: locationQuery,
      hasPhone: values.hasPhone,
      hasWebsite: values.hasWebsite,
      ...(minRating !== undefined ? { minRating } : {}),
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Search</h1>
        <p className="mt-1 text-sm text-gray-600">
          Find businesses with Google Places (new) and save them as leads.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="keyword"
              className="block text-sm font-medium text-gray-700"
            >
              Keyword
            </label>
            <input
              id="keyword"
              type="text"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm outline-none ring-[#FFC107] focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              {...register('keyword', { required: 'Keyword is required' })}
            />
            {errors.keyword ? (
              <p className="mt-1 text-xs text-red-600">{errors.keyword.message}</p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-gray-700"
            >
              Location
            </label>
            <input
              id="location"
              type="text"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm outline-none ring-[#FFC107] focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              {...register('location', { required: 'Location is required' })}
            />
            {errors.location ? (
              <p className="mt-1 text-xs text-red-600">{errors.location.message}</p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="country"
              className="block text-sm font-medium text-gray-700"
            >
              Country <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input
              id="country"
              type="text"
              autoComplete="country-name"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm outline-none ring-[#FFC107] focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              {...register('country')}
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:gap-8">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="size-4 rounded border-gray-300 text-[#FFC107] accent-[#FFC107] focus:ring-[#FFC107]"
                {...register('hasPhone')}
              />
              Has phone
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="size-4 rounded border-gray-300 text-[#FFC107] accent-[#FFC107] focus:ring-[#FFC107]"
                {...register('hasWebsite')}
              />
              Has website
            </label>
          </div>

          <div className="sm:col-span-2 sm:max-w-xs">
            <label
              htmlFor="minRating"
              className="block text-sm font-medium text-gray-700"
            >
              Min rating <span className="font-normal text-gray-500">(0–5)</span>
            </label>
            <input
              id="minRating"
              type="number"
              min={0}
              max={5}
              step={0.5}
              placeholder="Optional"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm outline-none ring-[#FFC107] focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              {...register('minRating', {
                validate: (v) => {
                  const s = typeof v === 'string' ? v.trim() : ''
                  if (!s) return true
                  const n = Number(s)
                  return (
                    (Number.isFinite(n) && n >= 0 && n <= 5) ||
                    'Enter a rating between 0 and 5'
                  )
                },
              })}
            />
            {errors.minRating ? (
              <p className="mt-1 text-xs text-red-600">{errors.minRating.message}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex justify-center rounded-md bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-[#e6ac00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Run search
          </button>
          {mutation.isPending ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-[#FFC107]"
                aria-hidden
              />
              Searching Google Places...
            </div>
          ) : null}
        </div>
      </form>

      {summary && !mutation.isPending ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              Search summary
            </h2>
            <span className="text-xs text-gray-500">
              {leads.length} shown below
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatPill
              label="Found"
              value={summary.totalFound}
              Icon={SearchIcon}
              tone="muted"
            />
            {summary.filteredOut !== undefined && summary.filteredOut > 0 ? (
              <StatPill
                label="Filtered out"
                value={summary.filteredOut}
                Icon={Filter}
                tone="muted"
              />
            ) : null}
            {summary.duplicatesSkipped !== undefined &&
            summary.duplicatesSkipped > 0 ? (
              <StatPill
                label="Already in DB"
                value={summary.duplicatesSkipped}
                Icon={RefreshCw}
                tone="muted"
              />
            ) : null}
            <StatPill
              label="New saved"
              value={summary.totalSaved}
              Icon={CheckCircle2}
              tone="success"
            />
          </div>
          {summary.totalSaved === 0 ? (
            <p className="mt-3 text-xs text-gray-500">
              No new leads added. Try a different keyword, broader location, or
              loosen your filters.
            </p>
          ) : null}
        </div>
      ) : null}

      {(leads.length > 0 || (mutation.isSuccess && !mutation.isPending)) && (
        <div
          className={`space-y-3 ${mutation.isPending ? 'opacity-60' : ''}`}
          aria-busy={mutation.isPending}
        >
          <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">
                    Business
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Phone</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">
                    Website
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700">City</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Rating</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {lead.businessName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {phoneDisplay(lead)}
                    </td>
                    <td className="px-4 py-3">
                      {lead.websiteUri ? (
                        
                          href={websiteHref(lead.websiteUri)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#b38600] underline decoration-[#FFC107]/60 underline-offset-2 hover:text-gray-900"
                        >
                          <span className="max-w-[12rem] truncate sm:max-w-xs">
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
                      {ratingDisplay(lead)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadgeClass(lead.status)}>
                        {lead.status || 'NEW'}
                      </span>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-gray-500"
                    >
                      No leads matched your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="pt-2">
            <Link
              to="/leads"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFC107]"
            >
              View all leads
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
