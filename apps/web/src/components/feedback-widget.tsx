'use client';

import { useEffect, useState } from 'react';
import { EVENTS, trackEvent } from '@/lib/posthog';

type FeedbackType = 'bug' | 'feature' | 'general';

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setIsSubmitting(true);

    try {
      trackEvent(EVENTS.REPORT_VIEWED, { channel: 'feedback_widget_open' });
      trackEvent('feedback_submitted', { type, message: message.substring(0, 200) });

      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message }),
      }).catch(() => null);

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        setType('general');
        setIsOpen(false);
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-modal transition-colors hover:opacity-90"
        aria-label="Send feedback"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Feedback
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <div className="fixed inset-0 bg-on-surface/20" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-sm rounded-xl border border-outline-variant bg-surface p-5 shadow-xl">
            {submitted ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-container">
                  <svg className="h-6 w-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-on-surface">Thank you for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-on-surface">Send Feedback</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-on-surface-variant hover:text-on-surface-variant"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mb-3 flex gap-2">
                  {(['general', 'bug', 'feature'] as FeedbackType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                        type === t
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant bg-surface text-on-surface-variant hover:border-outline'
                      }`}
                    >
                      {t === 'bug' ? 'Bug' : t === 'feature' ? 'Feature' : 'General'}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what you think or describe a bug..."
                  rows={4}
                  required
                  className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                />

                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
