import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Lock,
  Search,
  Plus,
  Quote,
  CheckSquare,
  HelpCircle,
  Send,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import type {
  ClinicalNote,
  ClinicalTask,
  SpecialistQuery,
  CitedSummaryResponse,
  TaskPriority,
} from '../types/collaboration'

export const CollaborationWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id?: string }>()
  const patientId = id || 'PAT-SYN-001'
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'queries'>('notes')

  // Search & Filter State for Notes
  const [noteSearch, setNoteSearch] = useState<string>('')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all')

  // Modals
  const [createNoteModal, setCreateNoteModal] = useState<boolean>(false)
  const [newNoteTitle, setNewNoteTitle] = useState<string>('')
  const [newNoteContent, setNewNoteContent] = useState<string>('')
  const [newNotePrivate, setNewNotePrivate] = useState<boolean>(false)
  const [newNoteTags, setNewNoteTags] = useState<string>('')

  const [citedSummaryModal, setCitedSummaryModal] = useState<boolean>(false)
  const [summaryDateFrom, setSummaryDateFrom] = useState<string>('2026-10-01')
  const [summaryDateTo, setSummaryDateTo] = useState<string>('2026-11-05')
  const [summaryTopic, setSummaryTopic] = useState<string>('')
  const [generatedSummary, setGeneratedSummary] = useState<CitedSummaryResponse | null>(null)

  const [createTaskModal, setCreateTaskModal] = useState<boolean>(false)
  const [taskTitle, setTaskTitle] = useState<string>('')
  const [taskDesc, setTaskDesc] = useState<string>('')
  const [taskAssignee, setTaskAssignee] = useState<string>('USR-VERIFIER-001')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium')
  const [taskDueDate, setTaskDueDate] = useState<string>('2026-11-15')

  const [createQueryModal, setCreateQueryModal] = useState<boolean>(false)
  const [querySubject, setQuerySubject] = useState<string>('')
  const [queryQuestion, setQueryQuestion] = useState<string>('')
  const [querySpecialty, setQuerySpecialty] = useState<string>('Internal Medicine')
  const [queryRecipientId, setQueryRecipientId] = useState<string>('USR-VERIFIER-001')
  const [queryPriority, setQueryPriority] = useState<'routine' | 'urgent'>('routine')

  const [replyQueryId, setReplyQueryId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<string>('')

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const { data: notes = [], isLoading: notesLoading } = useQuery<ClinicalNote[]>({
    queryKey: ['clinical-notes', patientId, noteSearch, selectedTag, specialtyFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (noteSearch) params.append('q', noteSearch)
      if (selectedTag !== 'all') params.append('tag', selectedTag)
      if (specialtyFilter !== 'all') params.append('specialty', specialtyFilter)
      const q = params.toString() ? `?${params.toString()}` : ''
      const res = await api.get<any>(`/collaboration/notes/patient/${patientId}${q}`)
      return Array.isArray(res) ? res : res?.data || []
    },
  })

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ClinicalTask[]>({
    queryKey: ['clinical-tasks', patientId],
    queryFn: async () => {
      const res = await api.get<any>(`/collaboration/tasks/patient/${patientId}`)
      return Array.isArray(res) ? res : res?.data || []
    },
  })

  const { data: queries = [], isLoading: queriesLoading } = useQuery<SpecialistQuery[]>({
    queryKey: ['specialist-queries', patientId],
    queryFn: async () => {
      const res = await api.get<any>(`/collaboration/queries/patient/${patientId}`)
      return Array.isArray(res) ? res : res?.data || []
    },
  })

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const createNoteMutation = useMutation({
    mutationFn: async () => {
      const tagsList = newNoteTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await api.post<any>('/collaboration/notes', {
        patient_id: patientId,
        title: newNoteTitle,
        content: newNoteContent,
        is_private: newNotePrivate,
        tags: tagsList,
        citations: [],
      })
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-notes', patientId] })
      setCreateNoteModal(false)
      setNewNoteTitle('')
      setNewNoteContent('')
      setNewNotePrivate(false)
      setNewNoteTags('')
    },
  })

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>(`/collaboration/notes/patient/${patientId}/cited-summary`, {
        date_from: summaryDateFrom || undefined,
        date_to: summaryDateTo || undefined,
        topic: summaryTopic || undefined,
      })
      return res?.data || res
    },
    onSuccess: (data: any) => {
      setGeneratedSummary(data?.data || data)
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>('/collaboration/tasks', {
        patient_id: patientId,
        title: taskTitle,
        description: taskDesc || undefined,
        assigned_to: taskAssignee,
        priority: taskPriority,
        due_date: taskDueDate,
      })
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-tasks', patientId] })
      setCreateTaskModal(false)
      setTaskTitle('')
      setTaskDesc('')
    },
  })

  const updateTaskMutation = useMutation({
    mutationFn: async (payload: { taskId: string; status: string }) => {
      const res = await api.patch<any>(`/collaboration/tasks/${payload.taskId}`, {
        status: payload.status,
      })
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-tasks', patientId] })
    },
  })

  const createQueryMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>('/collaboration/queries', {
        patient_id: patientId,
        to_doctor_id: queryRecipientId || undefined,
        to_specialty: querySpecialty,
        subject: querySubject,
        question: queryQuestion,
        priority: queryPriority,
      })
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialist-queries', patientId] })
      setCreateQueryModal(false)
      setQuerySubject('')
      setQueryQuestion('')
    },
  })

  const replyQueryMutation = useMutation({
    mutationFn: async (queryId: string) => {
      const res = await api.post<any>(`/collaboration/queries/${queryId}/reply`, {
        answer: replyText,
      })
      return res?.data || res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialist-queries', patientId] })
      setReplyQueryId(null)
      setReplyText('')
    },
  })

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Care-Team Workspace & Second Memory
            </h1>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono text-2xs">
              Collaboration
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Inter-specialist inquiries, care team task scheduling, and cited clinical notes for Patient{' '}
            <span className="font-mono text-slate-700">{patientId}</span>.
          </p>
        </div>

        {/* Tab-Specific Main Action */}
        <div className="flex items-center gap-2">
          {activeTab === 'notes' && (
            <>
              <button
                onClick={() => setCitedSummaryModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-teal-700 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-medium transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                Cited Summary
              </button>
              <button
                onClick={() => setCreateNoteModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Draft Note
              </button>
            </>
          )}
          {activeTab === 'tasks' && (
            <button
              onClick={() => setCreateTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Assign Task
            </button>
          )}
          {activeTab === 'queries' && (
            <button
              onClick={() => setCreateQueryModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium shadow-xs transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Ask Specialist
            </button>
          )}
        </div>
      </div>

      {/* Workspace Tabs Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          Second Memory ({notes.length})
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'tasks'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Care-Team Tasks ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab('queries')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'queries'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Specialist Queries ({queries.length})
        </button>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: SECOND MEMORY (CLINICAL NOTES)                                 */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'notes' && (
        <div className="space-y-3">
          {/* Search & Filters */}
          <div className="p-3 bg-white rounded border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search notes, terms, or citations..."
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-slate-500">
                <span>Specialty:</span>
                <select
                  value={specialtyFilter}
                  onChange={(e) => setSpecialtyFilter(e.target.value)}
                  className="h-8 px-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                >
                  <option value="all">All Specialties</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Internal Medicine">Internal Medicine</option>
                  <option value="Neurology">Neurology</option>
                </select>
              </div>

              <div className="flex items-center gap-1 text-slate-500">
                <span>Tag:</span>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="h-8 px-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                >
                  <option value="all">All Tags</option>
                  <option value="Titration">Titration</option>
                  <option value="Beta-Blocker">Beta-Blocker</option>
                  <option value="Allergy">Allergy</option>
                  <option value="Sulfa">Sulfa</option>
                  <option value="Private">Private</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes List */}
          {notesLoading ? (
            <div className="p-8 text-center text-slate-400 bg-white border border-slate-200 rounded">
              Loading Second Memory clinical notes...
            </div>
          ) : notes.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white border border-slate-200 rounded">
              No clinical notes found matching current search and filter criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.note_id}
                  className={`p-4 bg-white border rounded transition-shadow ${
                    note.is_private ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-sm">{note.title}</h3>
                        {note.is_private && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                            <Lock className="w-3 h-3" />
                            Private (Author Only)
                          </span>
                        )}
                        <span className="text-2xs font-mono text-slate-400">{note.note_id}</span>
                      </div>
                      <div className="text-2xs text-slate-500 mt-1 flex items-center gap-2">
                        <span className="font-medium text-slate-700">{note.author_name}</span>
                        <span>•</span>
                        <span>{note.specialty}</span>
                        <span>•</span>
                        <span>{note.created_at.slice(0, 10)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Note Body */}
                  <div className="mt-2.5 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
                    {note.content}
                  </div>

                  {/* Citations and Tags */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {note.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-3xs font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>

                    {note.citations && note.citations.length > 0 && (
                      <div className="flex items-center gap-1.5 text-3xs text-slate-500">
                        <Quote className="w-3 h-3 text-slate-400" />
                        <span>Cited from: {note.citations.map((c) => c.record_id).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: CARE-TEAM TASKS                                                */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 text-2xs font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Task Details</th>
                  <th className="py-2.5 px-3">Assignee</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Target Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tasksLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Loading clinical tasks...
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No active clinical tasks scheduled for this patient.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => {
                    const isDone = task.status === 'completed'
                    return (
                      <tr key={task.task_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3">
                          <button
                            onClick={() =>
                              updateTaskMutation.mutate({
                                taskId: task.task_id,
                                status: isDone ? 'pending' : 'completed',
                              })
                            }
                            className={`p-1 rounded border transition-colors ${
                              isDone
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-white text-slate-400 border-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <div className={`font-semibold ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-2xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</div>
                          )}
                          <div className="text-3xs font-mono text-slate-400 mt-0.5">{task.task_id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-slate-800 font-medium">{task.assigned_to_name}</div>
                          <div className="text-3xs text-slate-400">By: {task.assigned_by_name}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-3xs font-semibold uppercase ${
                              task.priority === 'urgent'
                                ? 'bg-rose-100 text-rose-800'
                                : task.priority === 'high'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 text-2xs">{task.due_date}</td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-2xs font-medium capitalize ${
                              isDone
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {task.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 3: SPECIALIST QUERIES                                             */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'queries' && (
        <div className="space-y-3">
          {queriesLoading ? (
            <div className="p-8 text-center text-slate-400 bg-white border border-slate-200 rounded">
              Loading specialist query threads...
            </div>
          ) : queries.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white border border-slate-200 rounded">
              No specialist query threads recorded for this patient.
            </div>
          ) : (
            <div className="space-y-3">
              {queries.map((qry) => (
                <div key={qry.query_id} className="p-4 bg-white border border-slate-200 rounded space-y-3">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-sm">{qry.subject}</h3>
                        <span
                          className={`px-1.5 py-0.5 rounded text-3xs font-semibold capitalize ${
                            qry.status === 'answered'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {qry.status}
                        </span>
                        {qry.priority === 'urgent' && (
                          <span className="px-1.5 py-0.5 rounded text-3xs font-semibold bg-rose-100 text-rose-800">
                            Urgent
                          </span>
                        )}
                      </div>
                      <div className="text-2xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="font-medium text-slate-800">
                          {qry.from_doctor_name} ({qry.from_specialty})
                        </span>
                        <span>→</span>
                        <span className="font-medium text-slate-800">
                          {qry.to_doctor_name || qry.to_specialty}
                        </span>
                        <span>•</span>
                        <span>{qry.created_at.slice(0, 10)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Question Body */}
                  <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                    {qry.question}
                  </div>

                  {/* Existing Responses */}
                  {qry.responses && qry.responses.length > 0 && (
                    <div className="space-y-2 pl-3 border-l-2 border-teal-700">
                      {qry.responses.map((resp) => (
                        <div key={resp.response_id} className="text-xs space-y-1">
                          <div className="text-2xs text-slate-500 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{resp.doctor_name}</span>
                            <span>({resp.specialty})</span>
                            <span>•</span>
                            <span>{resp.created_at.slice(0, 10)}</span>
                          </div>
                          <div className="text-slate-800 bg-teal-50/50 p-2 rounded border border-teal-100">
                            {resp.answer}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply Form */}
                  {replyQueryId === qry.query_id ? (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type specialist response or clinical advice..."
                        className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setReplyQueryId(null)
                            setReplyText('')
                          }}
                          className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => replyQueryMutation.mutate(qry.query_id)}
                          disabled={!replyText.trim() || replyQueryMutation.isPending}
                          className="px-3 py-1 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium disabled:opacity-50"
                        >
                          Submit Answer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          setReplyQueryId(qry.query_id)
                          setReplyText('')
                        }}
                        className="inline-flex items-center gap-1 text-2xs font-semibold text-teal-700 hover:text-teal-900"
                      >
                        <Send className="w-3 h-3" />
                        Reply to Inquiry
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 1: DRAFT NOTE                                                   */}
      {/* --------------------------------------------------------------------- */}
      {createNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900">Draft Second Memory Clinical Note</div>
              <button onClick={() => setCreateNoteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Note Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Post-AFib Beta-Blocker Titration Plan"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Clinical Content</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Clinical observations, plans, titration logic, or specialist impressions..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden resize-none"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="Cardiology, Titration, Renal, Post-MI"
                  value={newNoteTags}
                  onChange={(e) => setNewNoteTags(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              {/* Private Note Toggle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="private-note-chk"
                  checked={newNotePrivate}
                  onChange={(e) => setNewNotePrivate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <label htmlFor="private-note-chk" className="text-2xs text-slate-700 cursor-pointer">
                  <span className="font-semibold text-slate-900 block">Mark Note as Private Scratchpad</span>
                  Private notes are strictly visible to you alone. They are cryptographically and logically isolated
                  from other care-team members, the patient, and external companion searches.
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateNoteModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createNoteMutation.mutate()}
                  disabled={!newNoteTitle.trim() || !newNoteContent.trim() || createNoteMutation.isPending}
                  className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50"
                >
                  {createNoteMutation.isPending ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2: CITED SUMMARY                                                */}
      {/* --------------------------------------------------------------------- */}
      {citedSummaryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <span className="font-semibold text-slate-900">Synthesize Cited Second Memory Summary</span>
              </div>
              <button
                onClick={() => {
                  setCitedSummaryModal(false)
                  setGeneratedSummary(null)
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">Date From</label>
                  <input
                    type="date"
                    value={summaryDateFrom}
                    onChange={(e) => setSummaryDateFrom(e.target.value)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">Date To</label>
                  <input
                    type="date"
                    value={summaryDateTo}
                    onChange={(e) => setSummaryDateTo(e.target.value)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Topic Filter (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Titration, Allergy, Blood Pressure"
                  value={summaryTopic}
                  onChange={(e) => setSummaryTopic(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => generateSummaryMutation.mutate()}
                  disabled={generateSummaryMutation.isPending}
                  className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50"
                >
                  {generateSummaryMutation.isPending ? 'Synthesizing...' : 'Generate Cited Summary'}
                </button>
              </div>

              {generatedSummary && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded space-y-2.5">
                  <div className="font-semibold text-slate-900 flex items-center justify-between text-2xs">
                    <span>Synthesized Notes: {generatedSummary.total_notes_analyzed} analyzed</span>
                    <span className="font-mono text-slate-400">
                      {generatedSummary.date_range.from} to {generatedSummary.date_range.to}
                    </span>
                  </div>
                  <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                    {generatedSummary.summary_text}
                  </div>

                  {generatedSummary.cited_records.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Exact Record Citations
                      </div>
                      <div className="space-y-1">
                        {generatedSummary.cited_records.map((c) => (
                          <div
                            key={c.note_id}
                            className="p-1.5 bg-white border border-slate-200 rounded text-3xs font-mono text-slate-600 flex items-center justify-between"
                          >
                            <span>
                              [{c.note_id}] {c.author_name} ({c.specialty}) • {c.date}
                            </span>
                            <span className="text-slate-400 italic font-sans max-w-[200px] truncate">
                              "{c.snippet}"
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 3: ASSIGN TASK                                                  */}
      {/* --------------------------------------------------------------------- */}
      {createTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-200 shadow-xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900">Assign Care-Team Task</div>
              <button onClick={() => setCreateTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule Repeat BMP"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Instructions for clinician..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                  >
                    <option value="USR-VERIFIER-001">Dr. Sarah Lin (Internal Med)</option>
                    <option value="USR-DOC-CARDIO-001">Dr. Marcus Vance (Cardio)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                  >
                    <option value="routine">Routine</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Target Due Date</label>
                <input
                  type="date"
                  required
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateTaskModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createTaskMutation.mutate()}
                  disabled={!taskTitle.trim() || createTaskMutation.isPending}
                  className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50"
                >
                  {createTaskMutation.isPending ? 'Creating...' : 'Assign Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 4: ASK SPECIALIST                                               */}
      {/* --------------------------------------------------------------------- */}
      {createQueryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-200 shadow-xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900">Inquire with Specialist Colleague</div>
              <button onClick={() => setCreateQueryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Target Specialty</label>
                <select
                  value={querySpecialty}
                  onChange={(e) => setQuerySpecialty(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                >
                  <option value="Internal Medicine">Internal Medicine</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Neurology">Neurology</option>
                  <option value="Nephrology">Nephrology</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Recipient Clinician ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. USR-VERIFIER-001"
                  value={queryRecipientId}
                  onChange={(e) => setQueryRecipientId(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Inquiry Subject</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ACE-I titration threshold with borderline creatinine"
                  value={querySubject}
                  onChange={(e) => setQuerySubject(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Specific Question</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ask your colleague for clinical guidance or contraindication check..."
                  value={queryQuestion}
                  onChange={(e) => setQueryQuestion(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden resize-none"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={queryPriority}
                  onChange={(e) => setQueryPriority(e.target.value as 'routine' | 'urgent')}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-700 focus:outline-hidden"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateQueryModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createQueryMutation.mutate()}
                  disabled={!querySubject.trim() || !queryQuestion.trim() || createQueryMutation.isPending}
                  className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50"
                >
                  {createQueryMutation.isPending ? 'Sending...' : 'Send Inquiry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
