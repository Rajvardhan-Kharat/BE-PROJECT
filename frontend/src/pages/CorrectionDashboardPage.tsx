import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  FileCheck2,
  Info,
} from 'lucide-react'
import { api } from '../services/api'
import type { CorrectionDashboardMetrics } from '../types/corrections'

export const CorrectionDashboardPage: React.FC = () => {
  const { data: metrics, isLoading, isError } = useQuery<CorrectionDashboardMetrics>({
    queryKey: ['correction-metrics'],
    queryFn: async () => {
      const res = await api.get<any>('/metrics/corrections')
      return res?.data || res
    },
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Human Correction & Review Analytics
            </h1>
            <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 font-mono text-2xs font-semibold uppercase">
              measured on synthetic data
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Empirical accuracy and clinician intervention rate across untrusted document extractions and verification queues.
          </p>
        </div>
      </div>

      {/* Prominent Mandatory Synthetic Benchmark Notice */}
      <div className="p-3 bg-slate-50 border-l-4 border-amber-600 rounded-r border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-slate-900 flex items-center gap-2">
            <span>Academic Benchmark: Measured on Synthetic Data</span>
            <span className="text-3xs font-mono font-normal text-slate-500">
              (Calculated: {metrics?.last_calculated_at ? new Date(metrics.last_calculated_at).toLocaleTimeString() : 'current'})
            </span>
          </div>
          <div className="text-2xs text-slate-600 mt-0.5 leading-relaxed">
            All rates, field distributions, and review durations are derived from controlled synthetic clinical encounters and
            untrusted PDFs. No protected health information (PHI) or real clinical workflows are represented.
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 bg-white border border-slate-200 rounded">
          Aggregating human correction metrics from verification logs...
        </div>
      ) : isError || !metrics ? (
        <div className="p-8 text-center text-rose-500 bg-rose-50 border border-rose-200 rounded">
          Failed to load correction metrics.
        </div>
      ) : (
        <>
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded">
              <div className="flex items-center justify-between text-2xs font-medium text-slate-500 uppercase tracking-wider">
                <span>Overall Correction Rate</span>
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {metrics.overall_correction_rate}%
              </div>
              <div className="text-3xs text-slate-400 mt-0.5">
                {metrics.total_corrections} corrections across {metrics.total_fields_reviewed} fields
              </div>
            </div>

            <div className="p-3 bg-white border border-emerald-200 rounded bg-emerald-50/20">
              <div className="flex items-center justify-between text-2xs font-medium text-emerald-700 uppercase tracking-wider">
                <span>Accepted Unchanged Share</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">
                {metrics.accepted_unchanged_share}%
              </div>
              <div className="text-3xs text-emerald-600 mt-0.5">
                AI extraction accepted without human edit
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded">
              <div className="flex items-center justify-between text-2xs font-medium text-slate-500 uppercase tracking-wider">
                <span>Average Review Duration</span>
                <Clock className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {metrics.avg_review_time_seconds}s
              </div>
              <div className="text-3xs text-slate-400 mt-0.5">
                Per clinical document inspection
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded">
              <div className="flex items-center justify-between text-2xs font-medium text-slate-500 uppercase tracking-wider">
                <span>Total Documents Reviewed</span>
                <FileCheck2 className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {metrics.total_documents_reviewed}
              </div>
              <div className="text-3xs text-slate-400 mt-0.5">
                Across synthetic inpatient & outpatient records
              </div>
            </div>
          </div>

          {/* Breakdown Table by Field Type */}
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-xs">
                  Human Correction Rate by Clinical Field Type
                </h3>
                <p className="text-3xs text-slate-500 mt-0.5">
                  Breakdown of where clinicians intervened to adjust AI-extracted values.
                </p>
              </div>
              <span className="text-3xs font-mono text-slate-500">
                Notice: {metrics.synthetic_benchmark_notice}
              </span>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 text-2xs font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Field Type</th>
                  <th className="py-2.5 px-3">Fields Reviewed</th>
                  <th className="py-2.5 px-3">Human Corrections</th>
                  <th className="py-2.5 px-3">Correction Rate</th>
                  <th className="py-2.5 px-3">Common Clinical Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {metrics.by_field_type.map((item) => (
                  <tr key={item.field_type} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800 capitalize">
                      {item.field_type.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{item.total_reviewed}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{item.corrections_count}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              item.correction_rate > 15
                                ? 'bg-amber-600'
                                : item.correction_rate > 8
                                ? 'bg-teal-700'
                                : 'bg-slate-400'
                            }`}
                            style={{ width: `${Math.min(item.correction_rate * 3, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono font-medium text-slate-900">{item.correction_rate}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-2xs text-slate-500">
                      {item.common_reasons && item.common_reasons.length > 0 ? (
                        <span className="line-clamp-1">{item.common_reasons.join('; ')}</span>
                      ) : (
                        <span className="text-slate-400 italic">No frequent corrections logged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Reviewer Correction Reasons */}
          <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
            <h3 className="font-semibold text-slate-900 text-xs">
              Frequent Human Correction Rationales (Synthetic Benchmark)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {metrics.top_reasons.map((r) => (
                <div
                  key={r.reason}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-xs"
                >
                  <span className="text-slate-700 font-medium">{r.reason}</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-3xs text-slate-600 font-semibold shrink-0">
                    {r.count}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
