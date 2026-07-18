'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateLead } from '@/hooks/use-leads';
import { useCreateContact } from '@/hooks/use-contacts';
import { useCreateAccount } from '@/hooks/use-accounts';
import { useCreateDeal } from '@/hooks/use-deals';
import { useAuthStore } from '@/stores/auth.store';
import { contactSchema, dealSchema, leadSchema } from '@/lib/schemas';
import { notify } from '@/lib/toast';

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

  useEffect(() => {
    if (!modal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setModal(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  return (
    <>
      <div className="fixed bottom-6 end-6 z-40">
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
          className="h-12 w-12 rounded-full bg-primary text-2xl text-on-primary shadow-modal"
        >
          +
        </button>
      </div>

      {modal === 'lead' ? (
        <SimpleModal title="Create Lead" onClose={() => setModal(null)} onSubmit={async (v) => {
          const parsed = leadSchema.safeParse({
            firstName: v.name,
            lastName: 'Lead',
            email: '',
            company: '',
            source: 'MANUAL',
          });
          if (!parsed.success) {
            notify.error('Validation error', parsed.error.errors[0]?.message);
            return;
          }
          await createLead.mutateAsync({
            firstName: parsed.data.firstName,
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
          const parsed = contactSchema.safeParse({
            firstName: v.name,
            lastName: 'Contact',
            email: '',
            phone: '',
            jobTitle: '',
          });
          if (!parsed.success) {
            notify.error('Validation error', parsed.error.errors[0]?.message);
            return;
          }
          await createContact.mutateAsync({
            firstName: parsed.data.firstName,
            lastName: 'Contact',
            accountId: v.idOrRef || 'acct-preview',
            ownerId: userId,
            customFields: {},
            tags: [],
          });
          await qc.invalidateQueries({ queryKey: ['contacts'] });
          setModal(null);
        }} includeRefs />
      ) : null}

      {modal === 'account' ? (
        <SimpleModal title="Create Account" onClose={() => setModal(null)} onSubmit={async (v) => {
          await createAccount.mutateAsync({
            name: v.name,
            ownerId: userId,
            type: 'PROSPECT',
            tier: 'SMB',
            status: 'ACTIVE',
            currency: 'USD',
            customFields: {},
            tags: [],
          });
          await qc.invalidateQueries({ queryKey: ['accounts'] });
          setModal(null);
        }} />
      ) : null}

      {modal === 'deal' ? (
        <SimpleModal title="Create Deal" onClose={() => setModal(null)} onSubmit={async (v) => {
          const parsed = dealSchema.safeParse({
            name: v.name,
            amount: 0,
            expectedCloseDate: new Date().toISOString().slice(0, 10),
            stageId: v.thirdRef,
            pipelineId: v.secondRef,
          });
          if (!parsed.success) {
            notify.error('Validation error', parsed.error.errors[0]?.message);
            return;
          }
          await createDeal.mutateAsync({
            name: parsed.data.name,
            ownerId: userId,
            accountId: v.idOrRef,
            pipelineId: parsed.data.pipelineId,
            stageId: parsed.data.stageId,
            currency: 'USD',
            amount: parsed.data.amount,
            expectedCloseDate: `${parsed.data.expectedCloseDate}T00:00:00.000Z`,
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
      className="rounded-full border border-outline-variant bg-surface px-3 py-1 text-sm shadow"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-on-surface/40 p-0 md:items-center md:p-4">
      <form
        className="max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-surface p-4 md:max-w-md md:rounded-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ name, idOrRef, secondRef, thirdRef });
        }}
      >
        <div className="flex justify-center pb-1 pt-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-outline-variant" />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        {includeRefs ? (
          <>
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={idOrRef} onChange={(e) => setIdOrRef(e.target.value)} placeholder="Account ID" />
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={secondRef} onChange={(e) => setSecondRef(e.target.value)} placeholder="Pipeline ID" />
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={thirdRef} onChange={(e) => setThirdRef(e.target.value)} placeholder="Stage ID" />
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-outline-variant px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary">Create</button>
        </div>
      </form>
    </div>
  );
}
