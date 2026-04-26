'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Controller,
  useForm,
  type Resolver,
  type SubmitHandler,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Deal } from '@nexus/shared-types';
import {
  CreateDealSchema,
  UpdateDealSchema,
  type CreateDealInput,
  type UpdateDealInput,
} from '@nexus/validation';
import { useCreateDeal, useUpdateDeal } from '@/hooks/use-deals';
import { useAccounts } from '@/hooks/use-accounts';
import { useContacts } from '@/hooks/use-contacts';
import { usePipelines, useStages } from '@/hooks/use-pipelines';
import { useUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  type ComboboxOption,
} from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  MultiSelect,
  type MultiSelectOption,
} from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Textarea } from '@/components/ui/textarea';
import { QuickCreateContact } from '@/components/deals/QuickCreateContact';
import { UserPlus } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

/** What the form emits on submit. Matches `CreateDealInput` 1:1. */
export type DealFormValues = CreateDealInput;

export interface DealFormProps {
  mode: 'create' | 'edit';
  /** Deal id — required in edit mode for the update mutation. */
  dealId?: string;
  /**
   * Pre-filled values for edit mode (or partial prefill for create). The
   * parent page is responsible for extracting `contactIds` from the deal's
   * `DealContact` relations before passing them in.
   */
  initialValues?: Partial<DealFormValues>;
  onSuccess?: (deal: Deal) => void;
  onCancel?: () => void;
  /** Optional display title; defaults based on `mode`. */
  title?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'INR',
  'BRL',
  'MXN',
  'SGD',
  'AED',
  'SAR',
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function pickResolver(
  mode: 'create' | 'edit'
): Resolver<DealFormValues> {
  const schema = mode === 'create' ? CreateDealSchema : UpdateDealSchema;
  return zodResolver(schema) as unknown as Resolver<DealFormValues>;
}

function isoDateToInputValue(iso: string | undefined | null): string {
  if (!iso) return '';
  const asDate = new Date(iso);
  if (Number.isNaN(asDate.getTime())) return '';
  return asDate.toISOString().slice(0, 10);
}

function inputValueToIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function stringifyCustomFields(value: Record<string, unknown>): string {
  return Object.keys(value).length === 0 ? '' : JSON.stringify(value, null, 2);
}

function buildDefaultValues(
  seed: Partial<DealFormValues> | undefined
): DealFormValues {
  return {
    name: seed?.name ?? '',
    accountId: seed?.accountId ?? '',
    pipelineId: seed?.pipelineId ?? '',
    stageId: seed?.stageId ?? '',
    ownerId: seed?.ownerId ?? '',
    amount: seed?.amount ?? 0,
    currency: seed?.currency ?? 'USD',
    probability: seed?.probability,
    expectedCloseDate: seed?.expectedCloseDate,
    source: seed?.source,
    campaignId: seed?.campaignId,
    contactIds: seed?.contactIds ?? [],
    customFields: seed?.customFields ?? {},
    tags: seed?.tags ?? [],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Deal creation / edit form (Section 33 input schemas, Section 53 UI layer).
 *
 * Uses `react-hook-form` + `@hookform/resolvers/zod` with either
 * {@link CreateDealSchema} (create) or {@link UpdateDealSchema} (edit). All
 * reference data (accounts, pipelines, stages, users, contacts) is loaded
 * via dedicated TanStack Query hooks. When `pipelineId` changes, `stageId`
 * is cleared and the stage query automatically refetches the new pipeline's
 * stages.
 */
export function DealForm({
  mode,
  dealId,
  initialValues,
  onSuccess,
  onCancel,
  title,
}: DealFormProps): JSX.Element {
  const createMutation = useCreateDeal();
  const updateMutation = useUpdateDeal();
  const mutationPending =
    (mode === 'create' && createMutation.isPending) ||
    (mode === 'edit' && updateMutation.isPending);

  // ── Permission gate ──────────────────────────────────────────────────────
  const requiredPermission =
    mode === 'create' ? 'deals:create' : 'deals:update';
  const canSubmit = useAuthStore((s) => s.hasPermission(requiredPermission));

  // ── Reference-data queries ──────────────────────────────────────────────
  const [accountSearch, setAccountSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  const pipelinesQuery = usePipelines();
  const accountsQuery = useAccounts({ search: accountSearch, limit: 50 });
  const contactsQuery = useContacts({ search: contactSearch, limit: 100 });
  const usersQuery = useUsers({ search: userSearch, limit: 100 });

  // ── Form instance ───────────────────────────────────────────────────────
  const resolver = useMemo(() => pickResolver(mode), [mode]);

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DealFormValues>({
    resolver,
    defaultValues: buildDefaultValues(initialValues),
    mode: 'onBlur',
  });

  // Keep form in sync if `initialValues` changes after mount (e.g. async load).
  useEffect(() => {
    if (initialValues) {
      reset(buildDefaultValues(initialValues));
    }
  }, [initialValues, reset]);

  const pipelineId = watch('pipelineId');
  const stagesQuery = useStages(pipelineId || null);

  // ── Reset stageId when pipelineId changes ───────────────────────────────
  const previousPipelineIdRef = useMemo(() => ({ current: pipelineId }), []);
  useEffect(() => {
    if (
      previousPipelineIdRef.current !== pipelineId &&
      previousPipelineIdRef.current !== undefined
    ) {
      setValue('stageId', '', { shouldValidate: false, shouldDirty: true });
    }
    previousPipelineIdRef.current = pipelineId;
  }, [pipelineId, setValue, previousPipelineIdRef]);

  // ── Custom-fields JSON draft state ──────────────────────────────────────
  const initialCustomJson = stringifyCustomFields(
    (initialValues?.customFields ?? {}) as Record<string, unknown>
  );
  const [customFieldsDraft, setCustomFieldsDraft] =
    useState<string>(initialCustomJson);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(
    null
  );

  useEffect(() => {
    setCustomFieldsDraft(
      stringifyCustomFields(
        (initialValues?.customFields ?? {}) as Record<string, unknown>
      )
    );
    setCustomFieldsError(null);
  }, [initialValues]);

  // ── Derived option lists ────────────────────────────────────────────────
  const accountOptions: ComboboxOption[] = useMemo(
    () =>
      (accountsQuery.data?.data ?? []).map((a) => ({
        id: a.id,
        label: a.name,
        sublabel: a.industry ?? a.website ?? undefined,
      })),
    [accountsQuery.data]
  );

  const contactOptions: MultiSelectOption[] = useMemo(
    () =>
      (contactsQuery.data?.data ?? []).map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName}`.trim() || c.email || c.id,
        sublabel: c.email ?? c.jobTitle ?? undefined,
      })),
    [contactsQuery.data]
  );

  const userOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? []).map((u) => ({
        id: u.id,
        label: `${u.firstName} ${u.lastName}`.trim() || u.email,
        email: u.email,
      })),
    [usersQuery.data]
  );

  const stages = stagesQuery.data ?? [];
  const pipelines = pipelinesQuery.data ?? [];

  // ── Reference-data error surfacing ──────────────────────────────────────
  const referenceErrors: string[] = [];
  if (pipelinesQuery.isError) referenceErrors.push('pipelines');
  if (accountsQuery.isError) referenceErrors.push('accounts');
  if (usersQuery.isError) referenceErrors.push('users');
  if (contactsQuery.isError) referenceErrors.push('contacts');
  if (pipelineId && stagesQuery.isError) referenceErrors.push('stages');

  // ── Submit ──────────────────────────────────────────────────────────────
  const onSubmit: SubmitHandler<DealFormValues> = async (values) => {
    if (customFieldsError) return;

    try {
      if (mode === 'create') {
        const deal = await createMutation.mutateAsync(values);
        onSuccess?.(deal);
      } else {
        if (!dealId) {
          setError('root', {
            type: 'manual',
            message: 'Deal id is required for updates.',
          });
          return;
        }
        const payload: UpdateDealInput = values;
        const deal = await updateMutation.mutateAsync({
          id: dealId,
          data: payload,
        });
        onSuccess?.(deal);
      }
    } catch (err) {
      setError('root', {
        type: 'server',
        message: err instanceof Error ? err.message : 'Submission failed.',
      });
    }
  };

  // ── Custom fields blur handler ──────────────────────────────────────────
  const applyCustomFields = (raw: string): void => {
    if (raw.trim() === '') {
      setCustomFieldsError(null);
      setValue('customFields', {}, { shouldDirty: true });
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setCustomFieldsError('Custom fields must be a JSON object.');
        return;
      }
      setCustomFieldsError(null);
      setValue('customFields', parsed as Record<string, unknown>, {
        shouldDirty: true,
      });
    } catch {
      setCustomFieldsError('Invalid JSON.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const resolvedTitle = title ?? (mode === 'create' ? 'New Deal' : 'Edit Deal');
  const submitLabel = mode === 'create' ? 'Create Deal' : 'Save Changes';

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      data-testid="deal-form"
      className="flex flex-col gap-4"
    >
      <header className="mb-1">
        <h2 className="text-lg font-semibold text-foreground">
          {resolvedTitle}
        </h2>
      </header>

      {/* Root-level server error */}
      {errors.root && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {errors.root.message}
        </div>
      )}

      {/* Reference-data load errors — non-blocking but visible */}
      {referenceErrors.length > 0 && (
        <div
          role="alert"
          data-testid="deal-form-reference-error"
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          Failed to load: {referenceErrors.join(', ')}. Some fields may be
          empty — please retry or refresh.
        </div>
      )}

      {/* Permission notice */}
      {!canSubmit && (
        <div
          role="alert"
          data-testid="deal-form-permission-denied"
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          You don&apos;t have permission to {mode === 'create' ? 'create' : 'edit'}{' '}
          deals. Contact an administrator if you believe this is a mistake.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Name */}
        <FormField
          label="Deal name"
          required
          error={errors.name?.message}
          className="md:col-span-2"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.name)}
              placeholder="Acme Corp — Enterprise Plan"
              {...register('name')}
            />
          )}
        </FormField>

        {/* Account combobox */}
        <FormField
          label="Account"
          required
          error={errors.accountId?.message}
        >
          {({ id, describedBy }) => (
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <Combobox
                  id={id}
                  describedBy={describedBy}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                  options={accountOptions}
                  onSearchChange={setAccountSearch}
                  placeholder="Search accounts…"
                  invalid={Boolean(errors.accountId)}
                  isLoading={accountsQuery.isLoading}
                />
              )}
            />
          )}
        </FormField>

        {/* Owner */}
        <FormField label="Owner" required error={errors.ownerId?.message}>
          {({ id, describedBy }) => (
            <Controller
              control={control}
              name="ownerId"
              render={({ field }) => (
                <Combobox
                  id={id}
                  describedBy={describedBy}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                  options={userOptions.map((u) => ({
                    id: u.id,
                    label: u.label,
                    sublabel: u.email,
                  }))}
                  onSearchChange={setUserSearch}
                  placeholder="Search users…"
                  invalid={Boolean(errors.ownerId)}
                  isLoading={usersQuery.isLoading}
                />
              )}
            />
          )}
        </FormField>

        {/* Pipeline */}
        <FormField
          label="Pipeline"
          required
          error={errors.pipelineId?.message}
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.pipelineId)}
              {...register('pipelineId')}
            >
              <option value="">Select a pipeline…</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {/* Stage — filtered by pipeline */}
        <FormField label="Stage" required error={errors.stageId?.message}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.stageId)}
              disabled={!pipelineId || stagesQuery.isLoading}
              {...register('stageId')}
            >
              <option value="">
                {pipelineId
                  ? stagesQuery.isLoading
                    ? 'Loading stages…'
                    : 'Select a stage…'
                  : 'Select a pipeline first'}
              </option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {/* Amount */}
        <FormField label="Amount" required error={errors.amount?.message}>
          {({ id, describedBy }) => (
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-muted-foreground"
              >
                {watch('currency') || 'USD'}
              </span>
              <Input
                id={id}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                aria-describedby={describedBy}
                invalid={Boolean(errors.amount)}
                className="pl-12 tabular-nums"
                {...register('amount', { valueAsNumber: true })}
              />
            </div>
          )}
        </FormField>

        {/* Currency */}
        <FormField
          label="Currency"
          required
          error={errors.currency?.message}
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.currency)}
              {...register('currency')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {/* Probability */}
        <FormField
          label="Probability (%)"
          error={errors.probability?.message}
          hint="Optional override — usually derived from the stage."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={100}
              step="1"
              inputMode="numeric"
              aria-describedby={describedBy}
              invalid={Boolean(errors.probability)}
              {...register('probability', {
                setValueAs: (v: unknown) => {
                  if (v === '' || v === null || v === undefined) return undefined;
                  const n = typeof v === 'number' ? v : Number(v);
                  return Number.isFinite(n) ? n : undefined;
                },
              })}
            />
          )}
        </FormField>

        {/* Expected close date */}
        <FormField
          label="Expected close date"
          error={errors.expectedCloseDate?.message}
        >
          {({ id, describedBy }) => (
            <Controller
              control={control}
              name="expectedCloseDate"
              render={({ field }) => (
                <Input
                  id={id}
                  type="date"
                  aria-describedby={describedBy}
                  invalid={Boolean(errors.expectedCloseDate)}
                  value={isoDateToInputValue(field.value ?? null)}
                  onChange={(e) =>
                    field.onChange(inputValueToIsoDate(e.target.value))
                  }
                  onBlur={field.onBlur}
                />
              )}
            />
          )}
        </FormField>

        {/* Source */}
        <FormField label="Source" error={errors.source?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.source)}
              placeholder="Inbound, Referral, …"
              {...register('source', {
                setValueAs: (v: unknown) =>
                  typeof v === 'string' && v.trim() === '' ? undefined : v,
              })}
            />
          )}
        </FormField>

        {/* Contacts — multi-select */}
        <FormField
          label="Contacts"
          error={errors.contactIds?.message}
          className="md:col-span-2"
        >
          {({ id, describedBy }) => (
            <Controller
              control={control}
              name="contactIds"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Select one or more contacts</span>
                    <button
                      type="button"
                      onClick={() => setShowQuickCreate(true)}
                      className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      <UserPlus className="h-4 w-4" /> New contact
                    </button>
                  </div>
                  <MultiSelect
                    id={id}
                    describedBy={describedBy}
                    value={field.value ?? []}
                    onChange={(v) => field.onChange(v)}
                    options={contactOptions}
                    onSearchChange={setContactSearch}
                    isLoading={contactsQuery.isLoading}
                    placeholder="Select contacts…"
                    invalid={Boolean(errors.contactIds)}
                  />
                  {showQuickCreate ? (
                    <QuickCreateContact
                      onCreated={(contact) => {
                        field.onChange([...(field.value ?? []), contact.id]);
                        setShowQuickCreate(false);
                      }}
                      onCancel={() => setShowQuickCreate(false)}
                    />
                  ) : null}
                </div>
              )}
            />
          )}
        </FormField>

        {/* Tags */}
        <FormField
          label="Tags"
          error={errors.tags?.message}
          className="md:col-span-2"
          hint="Press Enter or comma to add a tag."
        >
          {({ id, describedBy }) => (
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TagInput
                  id={id}
                  describedBy={describedBy}
                  value={field.value ?? []}
                  onChange={(v) => field.onChange(v)}
                  invalid={Boolean(errors.tags)}
                />
              )}
            />
          )}
        </FormField>

        {/* Custom fields JSON */}
        <FormField
          label="Custom fields (JSON)"
          error={
            customFieldsError ??
            (typeof errors.customFields?.message === 'string'
              ? errors.customFields.message
              : undefined)
          }
          className="md:col-span-2"
          hint='Object, e.g. {"industry":"SaaS","renewalYear":2027}'
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(customFieldsError) || Boolean(errors.customFields)}
              value={customFieldsDraft}
              onChange={(e) => {
                setCustomFieldsDraft(e.target.value);
                if (customFieldsError) clearErrors('customFields');
              }}
              onBlur={(e) => applyCustomFields(e.target.value)}
              rows={4}
              placeholder="{}"
            />
          )}
        </FormField>
      </div>

      <footer className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={mutationPending || isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          isLoading={mutationPending || isSubmitting}
          disabled={Boolean(customFieldsError) || !canSubmit}
          title={
            !canSubmit
              ? `Requires permission: ${requiredPermission}`
              : undefined
          }
        >
          {submitLabel}
        </Button>
      </footer>
    </form>
  );
}
