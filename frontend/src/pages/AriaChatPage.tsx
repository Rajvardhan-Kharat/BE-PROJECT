import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  Send,
  PhoneCall,
  ExternalLink,
  Trash2,
  Share2,
  RefreshCw,
  Info,
  Sparkles,
  HeartHandshake,
} from 'lucide-react'
import { api } from '../services/api'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/ui/Banner'
import { EmptyState } from '../components/ui/EmptyState'
import { AriaNoticeModal } from '../components/aria/AriaNoticeModal'
import type {
  AriaSession,
  AriaMessage,
  AriaNoticeStatus,
  AriaCrisisResource,
  AriaSendMessageResponse,
} from '../types/aria'

export const AriaChatPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [notice, setNotice] = useState<AriaNoticeStatus | null>(null)
  const [showNoticeModal, setShowNoticeModal] = useState(false)
  const [sessions, setSessions] = useState<AriaSession[]>([])
  const [activeSession, setActiveSession] = useState<AriaSession | null>(null)
  const [messages, setMessages] = useState<AriaMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const [crisisAlert, setCrisisAlert] = useState<{
    triggered: boolean
    resources: AriaCrisisResource[]
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 1. Load Notice Status and Sessions on Mount
  useEffect(() => {
    fetchNoticeAndSessions()
  }, [])

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const fetchNoticeAndSessions = async () => {
    try {
      const noticeRes = await api.get<AriaNoticeStatus>('/aria/notice')
      setNotice(noticeRes)
      if (!noticeRes.acknowledged) {
        setShowNoticeModal(true)
      }

      const sessionsRes = await api.get<AriaSession[]>('/aria/sessions')
      setSessions(sessionsRes)

      if (sessionsRes.length > 0) {
        selectSession(sessionsRes[0])
      } else {
        // Create an initial session
        const newSession = await api.post<AriaSession>('/aria/sessions', {
          title: 'Daily Journal & Reflection',
        })
        setSessions([newSession])
        selectSession(newSession)
      }
    } catch (err: unknown) {
      console.error('Failed to initialize Aria session:', err)
      setErrorMessage('Could not connect to Aria companion service.')
    }
  }

  const selectSession = async (session: AriaSession) => {
    setActiveSession(session)
    setIsLoadingMessages(true)
    setErrorMessage(null)
    setCrisisAlert(null)
    try {
      const msgs = await api.get<AriaMessage[]>(`/aria/sessions/${session.session_ref}/messages`)
      setMessages(msgs)
    } catch (err: unknown) {
      console.error('Failed to load messages:', err)
      setErrorMessage('Failed to load conversation history.')
    } finally {
      setIsLoadingMessages(false)
    }
  }

  const handleAcknowledgeNotice = async () => {
    try {
      await api.post('/aria/notice/ack', { version: '2026.11-v1' })
      setShowNoticeModal(false)
      if (notice) {
        setNotice({ ...notice, acknowledged: true })
      }
    } catch (err: unknown) {
      console.error('Failed to acknowledge notice:', err)
    }
  }

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim()
    if (!text || !activeSession || isSending) return

    setIsSending(true)
    setErrorMessage(null)

    try {
      const res = await api.post<AriaSendMessageResponse>(
        `/aria/sessions/${activeSession.session_ref}/messages`,
        { text }
      )

      // Add messages to state
      setMessages((prev) => [...prev, res.user_message, res.reply_message])
      setInputText('')
      setLastFailedMessage(null)

      if (res.safety_event && res.crisis_resources && res.crisis_resources.length > 0) {
        setCrisisAlert({
          triggered: true,
          resources: res.crisis_resources,
        })
      }
    } catch (err: unknown) {
      console.error('Send message failed:', err)
      setErrorMessage(
        'The companion service is currently unavailable. Your reflection is preserved below.'
      )
      setLastFailedMessage(text)
    } finally {
      setIsSending(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!activeSession) return
    const confirmed = window.confirm(
      'Are you sure you want to delete this journal session? All messages in this session will be permanently deleted and cannot be recovered.'
    )
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await api.delete(`/aria/sessions/${activeSession.session_ref}`)
      const remaining = sessions.filter((s) => s.session_ref !== activeSession.session_ref)
      setSessions(remaining)
      if (remaining.length > 0) {
        selectSession(remaining[0])
      } else {
        const fresh = await api.post<AriaSession>('/aria/sessions', {
          title: 'Daily Journal & Reflection',
        })
        setSessions([fresh])
        selectSession(fresh)
      }
    } catch (err: unknown) {
      console.error('Failed to delete session:', err)
      setErrorMessage('Failed to delete session.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto px-4 py-2">
      {/* Notice Modal */}
      {showNoticeModal && notice && (
        <AriaNoticeModal notice={notice} onAcknowledge={handleAcknowledgeNotice} />
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-teal-50 p-2 text-teal-700">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900">Aria Companion Journal</h1>
              <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                Patient Private
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Private emotional wellness reflections • Pseudonymous server routing • Isolated from medical records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/aria/shares')}
            className="flex items-center gap-1.5 text-xs"
          >
            <Share2 className="h-3.5 w-3.5 text-slate-600" />
            Care Team Sharing
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSession}
            disabled={isDeleting || !activeSession}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
            title="Permanently delete this journal session"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mock Mode Placeholder Banner */}
      {notice?.mode === 'mock' && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              <strong>Demo / Placeholder Mode:</strong> Aria is running via{' '}
              <code className="bg-amber-100 px-1 py-0.2 rounded font-mono font-medium">
                MockAriaProvider
              </code>
              . Replies and draft summaries are gentle canned templates for integration testing.
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-800">ARIA_MODE=mock</span>
        </div>
      )}

      {/* Error / Provider Down Banner */}
      {errorMessage && (
        <div className="mb-2">
          <Banner
            variant="warning"
            title="Companion Notice"
            onDismiss={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Banner>
        </div>
      )}

      {/* DISTINCT CRISIS ALERT BOX (Prominent, not mixed in chat bubble stream) */}
      {crisisAlert?.triggered && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-3 rounded-md border-2 border-red-500 bg-red-50 p-4 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 p-2 text-red-700 shrink-0">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900">
                Support & Crisis Helplines Available Right Now
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-red-800">
                You are not alone, and help is free, confidential, and available 24/7. Please connect with human support immediately if you feel overwhelmed or in danger.
              </p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {crisisAlert.resources.map((res, i) => (
                  <div
                    key={i}
                    className="flex flex-col rounded border border-red-200 bg-white p-2.5 text-xs text-slate-800 shadow-xs"
                  >
                    <span className="font-semibold text-red-950">{res.name}</span>
                    <span className="font-mono font-bold text-sm text-red-700 mt-0.5">
                      {res.helpline}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5">{res.description}</span>
                    {res.url && (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline mt-1"
                      >
                        Visit Website <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-red-200 pt-2">
                <span className="text-[11px] text-red-700">
                  Dial <strong>911 / 112</strong> for immediate medical or psychiatric emergencies.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCrisisAlert(null)}
                  className="text-xs text-red-800 hover:bg-red-100"
                >
                  Dismiss box
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Journal Message History Container (Minimal, Calm Design) */}
      <div className="flex-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/50 p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="flex h-48 items-center justify-center text-xs text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading private journal reflections...
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6 text-slate-400" />}
            title="Private Companion Journal"
            description="Take a moment to reflect on how you're feeling, your symptoms, or personal thoughts. Nothing is shared with your clinical team unless you review and approve a summary."
          />
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user'
            const isCrisis = msg.safety_event

            return (
              <div
                key={msg.message_id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-500">
                  <span className="font-medium text-slate-700">
                    {isUser ? 'You' : 'Aria'}
                  </span>
                  {!isUser && msg.provider_name && (
                    <span className="rounded bg-slate-200/70 px-1 py-0.2 font-mono text-[9px] text-slate-600">
                      [{msg.provider_name}]
                    </span>
                  )}
                  <span>•</span>
                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div
                  className={`max-w-2xl rounded-md px-4 py-3 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-slate-800 text-white shadow-xs rounded-tr-none'
                      : isCrisis
                      ? 'bg-red-50 border border-red-300 text-red-950 shadow-xs rounded-tl-none font-medium'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-xs rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area / Journal Reflection Compose */}
      <div className="mt-3 border-t border-slate-200 pt-3">
        {lastFailedMessage && (
          <div className="mb-2 flex items-center justify-between rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-900 border border-amber-200">
            <span>Previous message failed to send. You can retry sending it:</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={isSending}
              onClick={() => handleSendMessage(lastFailedMessage)}
              className="text-xs py-0.5 h-6"
            >
              Retry Sending
            </Button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSendMessage()
          }}
          className="flex gap-2"
        >
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder="Write your private reflection or share how you are feeling... (Shift+Enter for newline)"
            rows={2}
            disabled={isSending}
            className="flex-1 resize-none rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 disabled:opacity-50"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={!inputText.trim() || isSending}
            className="self-end h-10 px-4 flex items-center gap-1.5 text-xs"
          >
            {isSending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>Send</span>
          </Button>
        </form>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <Info className="h-3 w-3" />
            <span>Encrypted & private. Not part of clinical records.</span>
          </div>
          <span>Shift+Enter to add a line</span>
        </div>
      </div>
    </div>
  )
}
