'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  UserCog,
  X,
  XCircle,
} from 'lucide-react';
import {
  useApprovalRequest,
  useApproveRequest,
  useCancelRequest,
  useDelegateRequest,
  useRejectRequest,
  type ApprovalStep,
  type StepStatus,
} from '@/hooks/use-approvals';
import { cn } from '@/lib/cn';

function stepTone(status: StepStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-success-container text-on-success-container ring-success/30';
    case 'REJECTED':
      return 'bg-error-container text-error ring-error/30';
    case 'DELEGATED':
      return 'bg-primary-container text-primary ring-primary/30';
    case 'SKIPPED':
      return 'bg-surface-container-high text-on-surface-variant ring-outline-variant';
    default:
      return 'bg-warning-container text-on-warning-container ring-warning/30';
  }
}

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

interface Props {
  requestId: string;
  onClose: () => void;
  currentUserId: string | null;
  isAdmin: boolean;
}

export function ApprovalDetailDrawer({ requestId, onClose, currentUserId, isAdmin }: Props) {
  const detail = useApprovalRequest(requestId);
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const delegate = useDelegateRequest();
  const cancel = useCancelRequest();

  const [comment, setComment] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const request = detail.data;
  const steps = request?.steps ?? [];
  const acting = approve.isPending || reject.isPending || delegate.isPending || cancel.isPending;

  const myPendingStep = steps.find(
    (s) => s.status === 'PENDING' && s.approverId === currentUserId
  );
  const canDecide = request?.status === 'PENDING' && Boolean(myPendingStep);
  const canCancel =
    (request?.status === 'PENDING' || request?.status === 'ESCALATED') &&
    (isAdmin || request?.requestedBy === currentUserId);

  // Group steps into levels by `order` for the quorum-aware timeline.
  const levels = Array.from(new Set(steps.map((s) => s.order))).sort((a, b) => a - b);

  const doApprove = () => {
    setError(null);
    approve.mutate({ id: requestId, comment: comment.trim() || undefined }, { onSuccess: () => setComment('') });
  };
  const doReject = () => {
    if (!comment.trim()) {
      setError('A comment is required to reject.');
      return;
    }
    setError(null);
    reject.mutate({ id: requestId, comment: comment.trim() }, { onSuccess: () => setComment('') });
  };
  const doDelegate = () => {
    if (!delegateTo.trim()) {
      setError('Enter a delegate (user id or email) first.');
      return;
    }
    setError(null);
    delegate.mutate(
      { id: requestId, delegateTo: delegateTo.trim(), comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setDelegateTo('');
          setComment('');
        },
      }
    );
  };
  const doCancel = () => {
    setError(null);
    cancel.mutate({ id: requestId }, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/40" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Approval detail"
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-outline-variant bg-surface px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-[#4f46e5]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">
                {request?.module ?? 'Approval'} request
              </h2>
              <p className="font-mono text-xs text-on-surface-variant">{request?.recordId ?? requestId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface-variant"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 px-5 py-5">
          {detail.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading request…
            </div>
          ) : detail.isError ? (
            <div className="flex items-start gap-2 rounded-lg bg-error-container p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Could not load this request. The approval service may be offline.
            </div>
          ) : request ? (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Meta label="Status" value={request.status} />
                <Meta label="Current level" value={`L${request.currentStep}`} />
                <Meta label="Requested by" value={request.requestedBy} />
                <Meta label="Opened" value={formatWhen(request.createdAt)} />
                {request.policy?.name ? <Meta label="Policy" value={request.policy.name} /> : null}
              </dl>

              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Approval steps
                </h3>
                <ol className="space-y-4">
                  {levels.map((order) => {
                    const levelSteps = steps.filter((s) => s.order === order);
                    const q = levelSteps[0];
                    const quorumLabel =
                      q?.quorumMode === 'ANY'
                        ? 'Any one approver'
                        : q?.quorumMode === 'N_OF_M'
                          ? `${q.quorumSize ?? 1} of ${levelSteps.length}`
                          : 'All approvers';
                    return (
                      <li key={order} className="rounded-lg border border-outline-variant p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-on-surface">Level {order}</span>
                          <span className="rounded bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                            {quorumLabel}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {levelSteps.map((step: ApprovalStep) => (
                            <div key={step.id} className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-on-surface">
                                  {step.approverId}
                                  {step.approverId === currentUserId ? (
                                    <span className="ml-1 text-[10px] font-bold text-[#4f46e5]">(you)</span>
                                  ) : null}
                                </p>
                                {step.comment ? (
                                  <p className="mt-0.5 text-xs text-on-surface-variant">“{step.comment}”</p>
                                ) : null}
                                {step.actionedAt ? (
                                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                                    {formatWhen(step.actionedAt)}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={cn(
                                  'shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ring-1',
                                  stepTone(step.status)
                                )}
                              >
                                {step.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                  {levels.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-outline-variant p-3 text-sm text-on-surface-variant">
                      No steps recorded for this request.
                    </li>
                  ) : null}
                </ol>
              </section>

              {(canDecide || canCancel) && (
                <section className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Take action
                  </h3>
                  {canDecide ? (
                    <>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={2}
                        placeholder="Comment (required to reject)"
                        className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={doApprove}
                          disabled={acting}
                          className="flex-1 rounded-lg bg-success px-3 py-2 text-sm font-bold text-white transition hover:bg-success disabled:opacity-50"
                        >
                          <CheckCircle2 className="mr-1 inline h-4 w-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={doReject}
                          disabled={acting}
                          className="flex-1 rounded-lg border border-error/30 bg-surface px-3 py-2 text-sm font-bold text-error transition hover:bg-error-container disabled:opacity-50"
                        >
                          <XCircle className="mr-1 inline h-4 w-4" /> Reject
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={delegateTo}
                          onChange={(e) => setDelegateTo(e.target.value)}
                          placeholder="Delegate to (user id / email)"
                          className="h-9 flex-1 rounded-lg border border-outline-variant px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                        <button
                          type="button"
                          onClick={doDelegate}
                          disabled={acting}
                          className="rounded-lg border border-primary/40 bg-surface px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary-container disabled:opacity-50"
                        >
                          <UserCog className="mr-1 inline h-4 w-4" /> Delegate
                        </button>
                      </div>
                    </>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      onClick={doCancel}
                      disabled={acting}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold text-on-surface-variant transition hover:bg-surface-container-high disabled:opacity-50"
                    >
                      Cancel request
                    </button>
                  ) : null}
                  {error ? <p className="text-xs font-semibold text-error">{error}</p> : null}
                  {acting ? (
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
                    </p>
                  ) : null}
                </section>
              )}

              {!canDecide && !canCancel ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant">
                  <Clock3 className="h-4 w-4" />
                  {request.status === 'PENDING'
                    ? 'This request is awaiting another approver.'
                    : `This request is ${request.status.toLowerCase()} — no actions available.`}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-on-surface">{value}</dd>
    </div>
  );
}
