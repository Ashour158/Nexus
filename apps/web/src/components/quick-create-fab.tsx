'use client';

import { useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateLead } from '@/hooks/use-leads';
import { useCreateContact } from '@/hooks/use-contacts';
import { useCreateAccount } from '@/hooks/use-accounts';
import { useCreateDeal } from '@/hooks/use-deals';
import { useAuthStore } from '@/stores/auth.store';

type ModalType = 'lead' | 'contact' | 'account' | 'deal' | null;

export function QuickCreateFab(): ReactElement {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const userId = useAuthStore((s) => s.userId) ?? '';
  const qc = useQueryClient();
  const createLead = useCreateLead();
  const createContact = useCreateContact();
  const createAccount = useCreateAccount();
  const createDeal = useCreateDeal();

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        {open ? (
          <div className="mb-2 flex flex-col items-end gap-2">
            <FabItem label="Lead" onClick={() => setModal('lead')} />
            <FabItem label="Contact" onClick={() => setModal('contact')} />
            <FabItem label="Account" onClick={() => setModal('account')} />
            <FabItem label="Deal" onClick={() => setModal('deal')} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="h-12 w-12 rounded-full bg-slate-900 text-2xl text-white shadow-lg"
        >
          +
        </button>
      </div>

      {modal === 'lead' ? (
        <SimpleModal title="Create Lead" onClose={() => setModal(null)} onSubmit={async (v) => {
          await createLead.mutateAsync({
            firstName: v.name,
            lastName: 'Lead',
            ownerId: userId,
            source: 'MANUAL',
            rating: 'COLD',
            customFields: {},
            tags: [],
          });
          await qc.invalidateQueries({ queryKey: ['leads'] });
          setModal(null);
        }} />
      ) : null}

      {modal === 'contact' ? (
        <SimpleModal title="Create Contact" onClose={() => setModal(null)} onSubmit={async (v) => {
          await createContact.mutateAsync({
            firstName: v.name,
            lastName: 'Contact',
            ownerId: userId,
            customFields: {},
            tags: [],
          });
          await qc.invalidateQueries({ queryKey: ['contacts'] });
          setModal(null);
        }} />
      ) : null}

      {modal === 'account' ? (
        <SimpleModal title="Create Account" onClose={() => setModal(null)} onSubmit={async (v) => {
          await createAccount.mutateAsync({
            name: v.name,
            ownerId: userId,
            type: 'PROSPECT',
            tier: 'SMB',
            status: 'ACTIVE',
            customFields: {},
            tags: [],
          });
          await qc.invalidateQueries({ queryKey: ['accounts'] });
          setModal(null);
        }} />
      ) : null}

      {modal === 'deal' ? (
        <SimpleModal title="Create Deal" onClose={() => setModal(null)} onSubmit={async (v) => {
          await createDeal.mutateAsync({
            name: v.name,
            ownerId: userId,
            accountId: v.idOrRef,
            pipelineId: v.secondRef,
            stageId: v.thirdRef,
            currency: 'USD',
            amount: 0,
            contactIds: [],
            customFields: {},
            tags: [],
          });
          await qc.invalidateQueries({ queryKey: ['deals'] });
          setModal(null);
        }} includeRefs />
      ) : null}
    </>
  );
}

function FabItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm shadow"
    >
      + {label}
    </button>
  );
}

function SimpleModal({
  title,
  onClose,
  onSubmit,
  includeRefs = false,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (values: { name: string; idOrRef: string; secondRef: string; thirdRef: string }) => Promise<void>;
  includeRefs?: boolean;
}) {
  const [name, setName] = useState('');
  const [idOrRef, setIdOrRef] = useState('');
  const [secondRef, setSecondRef] = useState('');
  const [thirdRef, setThirdRef] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        className="w-full max-w-md space-y-3 rounded-lg bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ name, idOrRef, secondRef, thirdRef });
        }}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        {includeRefs ? (
          <>
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={idOrRef} onChange={(e) => setIdOrRef(e.target.value)} placeholder="Account ID" />
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={secondRef} onChange={(e) => setSecondRef(e.target.value)} placeholder="Pipeline ID" />
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={thirdRef} onChange={(e) => setThirdRef(e.target.value)} placeholder="Stage ID" />
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Create</button>
        </div>
      </form>
    </div>
  );
}
