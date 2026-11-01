import React from 'react'
import { ShieldAlert } from 'lucide-react'

export const PrototypeStrip: React.FC = () => {
  return (
    <aside
      aria-label="Prototype environment notice"
      className="h-7 w-full bg-slate-950 text-slate-200 border-b border-slate-800 px-3 flex items-center justify-between text-xs select-none shrink-0 z-30"
    >
      <div className="flex items-center gap-2 truncate">
        <span className="bg-amber-400 text-slate-950 px-1 py-0.2 text-2xs font-mono font-bold rounded-sm tracking-wider uppercase shrink-0">
          Academic Prototype
        </span>
        <span className="font-mono text-amber-200/90 text-2xs font-medium">SYNTHETIC DATA ONLY</span>
        <span className="text-slate-500 hidden sm:inline">|</span>
        <span className="text-slate-400 truncate hidden sm:inline">
          No real PHI/PII is ingested or stored. All clinical records and verifications are synthetic.
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-2xs text-slate-400 font-mono shrink-0">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
        <span>VeriCare Governance v0.1</span>
      </div>
    </aside>
  )
}
