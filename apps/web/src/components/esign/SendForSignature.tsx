'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSignature, CheckCircle, Clock, AlertCircle, ExternalLink, X } from 'lucide-react';

interface Props {
  documentId?: string;
  contractId?: string;
  dealId?: string;
  documentName: string;
  onSent?: () => void;
}

type SignatureStatus = 'not_sent' | 'sent' | 'delivered' | 'completed' | 'declined' | 'voided';

const STATUS_CONFIG: Record<SignatureStatus, { label: string; color: string; icon: React.ReactNode }> = {
  not_sent: { label: 'Not Sent', color: 'text-gray-500', icon: <FileSignature className="h-4 w-4" /> },
  sent: { label: 'Sent', color: 'text-blue-600', icon: <Clock className="h-4 w-4" /> },
  delivered: { label: 'Delivered', color: 'text-amber-600', icon: <Clock className="h-4 w-4" /> },
  completed: { label: 'Signed', color: 'text-green-600', icon: <CheckCircle className="h-4 w-4" /> },
  declined: { label: 'Declined', color: 'text-red-600', icon: <AlertCircle className="h-4 w-4" /> },
  voided: { label: 'Voided', color: 'text-gray-400', icon: <X className="h-4 w-4" /> },
};

export default function SendForSignature({ documentId, contractId, dealId, documentName, onSent }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('Signer');
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);

  const { data: statusData } = useQuery({
    queryKey: ['esign-status', envelopeId],
    queryFn: () => fetch(`/api/esign/status/${envelopeId}`).then((r) => r.json()),
    enabled: Boolean(envelopeId),
    refetchInterval: 30000,
  });

  const status: SignatureStatus = statusData?.status ?? (envelopeId ? 'sent' : 'not_sent');
  const cfg = STATUS_CONFIG[status];

  const sendMutation = useMutation({
    mutationFn: () =>
      fetch('/api/esign/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, contractId, dealId, signerEmail, signerName, signerRole }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setEnvelopeId(data.envelopeId);
      setShowForm(false);
      onSent?.();
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${cfg.color}`}>{cfg.icon}<span className="text-sm font-medium">{cfg.label}</span></div>
          <span className="text-sm text-gray-500">- {documentName}</span>
        </div>
        <div className="flex items-center gap-2">
          {envelopeId ? <a href={`https://app.docusign.com/documents/details/${envelopeId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><ExternalLink className="h-3 w-3" />View in DocuSign</a> : null}
          {status === 'not_sent' ? <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><FileSignature className="h-3.5 w-3.5" />Send for Signature</button> : null}
        </div>
      </div>

      {showForm ? (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-700">Signer Details</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Signer name" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="Signer email" type="email" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <input value={signerRole} onChange={(e) => setSignerRole(e.target.value)} placeholder="Role" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={() => sendMutation.mutate()} disabled={!signerEmail || !signerName || sendMutation.isPending} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><FileSignature className="h-3.5 w-3.5" />{sendMutation.isPending ? 'Sending...' : 'Send Now'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
