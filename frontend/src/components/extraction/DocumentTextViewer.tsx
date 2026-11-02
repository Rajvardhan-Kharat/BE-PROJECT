import React, { useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import type { ExtractedField, SourceSpan } from '../../types/document'

interface DocumentTextViewerProps {
  pageTexts: Record<number, string>
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  fields: ExtractedField[]
  selectedFieldName: string | null
  onSelectField: (fieldName: string) => void
  filename?: string
  className?: string
}

interface SpanItem {
  fieldName: string
  span: SourceSpan
  isActive: boolean
}

interface TextSegment {
  key: string
  text: string
  isHighlight: boolean
  fieldName?: string
  isActive?: boolean
}

export const DocumentTextViewer: React.FC<DocumentTextViewerProps> = ({
  pageTexts,
  currentPage,
  totalPages,
  onPageChange,
  fields,
  selectedFieldName,
  onSelectField,
  filename = 'clinical_discharge_summary.pdf',
  className,
}) => {
  const currentText = pageTexts[currentPage] || ''

  // Collect and sort valid spans on the current page
  const pageSpans = useMemo(() => {
    const list: SpanItem[] = []
    for (const f of fields) {
      if (
        f.source_span &&
        f.source_span.page === currentPage &&
        f.source_span.start >= 0 &&
        f.source_span.end <= currentText.length &&
        f.source_span.start < f.source_span.end
      ) {
        list.push({
          fieldName: f.field_name,
          span: f.source_span,
          isActive: f.field_name === selectedFieldName,
        })
      }
    }
    // Sort by start offset ascending
    return list.sort((a, b) => a.span.start - b.span.start)
  }, [fields, currentPage, currentText, selectedFieldName])

  // Segment text into plain pieces and highlighted spans
  const segments = useMemo(() => {
    const res: TextSegment[] = []
    if (!currentText) return res

    let cursor = 0
    pageSpans.forEach((item, idx) => {
      const { start, end } = item.span
      if (start > cursor) {
        // Plain text before the span
        res.push({
          key: `plain-${cursor}-${start}`,
          text: currentText.slice(cursor, start),
          isHighlight: false,
        })
      }

      if (end > cursor && start >= cursor) {
        // Highlighted span
        const slice = currentText.slice(start, end)
        res.push({
          key: `span-${item.fieldName}-${idx}`,
          text: slice,
          isHighlight: true,
          fieldName: item.fieldName,
          isActive: item.isActive,
        })
        cursor = end
      }
    })

    // Remaining text after last span
    if (cursor < currentText.length) {
      res.push({
        key: `plain-${cursor}-${currentText.length}`,
        text: currentText.slice(cursor),
        isHighlight: false,
      })
    }

    return res
  }, [currentText, pageSpans])

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white border border-slate-300 rounded overflow-hidden select-text',
        className
      )}
    >
      {/* Top Document Header & Pagination Toolbar */}
      <div className="h-9 px-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs select-none shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-semibold text-slate-800 truncate" title={filename}>
            {filename}
          </span>
          <span className="text-2xs font-mono text-slate-400 hidden sm:inline">
            ({currentText.length} chars)
          </span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="p-1 rounded text-slate-600 hover:bg-slate-200/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="text-xs font-mono font-medium text-slate-700 px-1">
            Page {currentPage} of {Math.max(1, totalPages)}
          </span>

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="p-1 rounded text-slate-600 hover:bg-slate-200/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grounding Info Subbar */}
      <div className="px-3 py-1 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-2xs text-slate-500 shrink-0">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-teal-700" />
          <span>
            {pageSpans.length} highlighted clinical source {pageSpans.length === 1 ? 'span' : 'spans'} on this page
          </span>
        </div>
        <span className="text-2xs font-mono text-slate-400">
          Click highlight to inspect field
        </span>
      </div>

      {/* Main Document Content Area */}
      <div className="flex-1 p-4 overflow-y-auto bg-slate-50/30">
        <div className="max-w-2xl mx-auto p-6 bg-white border border-slate-200 rounded shadow-sm min-h-[460px]">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
              <Search className="w-5 h-5 mb-2 opacity-50" />
              <span>No document text available on this page</span>
            </div>
          ) : (
            <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed break-words font-normal">
              {segments.map((seg) => {
                if (!seg.isHighlight) {
                  return <span key={seg.key}>{seg.text}</span>
                }

                return (
                  <mark
                    key={seg.key}
                    data-testid={`span-${seg.fieldName}`}
                    onClick={() => seg.fieldName && onSelectField(seg.fieldName)}
                    title={`Extracted field: ${seg.fieldName} (Click to select)`}
                    className={cn(
                      'cursor-pointer transition-all duration-150 inline rounded-sm',
                      seg.isActive
                        ? 'bg-teal-200 border-b-2 border-teal-800 text-teal-950 font-bold px-1 ring-2 ring-teal-600/30 shadow-xs'
                        : 'bg-amber-100 hover:bg-amber-200 border-b border-amber-400 text-amber-950 px-0.5'
                    )}
                  >
                    {seg.text}
                  </mark>
                )
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
