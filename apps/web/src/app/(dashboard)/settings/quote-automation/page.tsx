'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, GitBranch, UploadCloud, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';

type Rule = {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  conditions?: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
};

type Template = {
  id: string;
  name: string;
  version: number;
  status: string;
  contentType: string;
  isDefault: boolean;
  sourceFormat?: string;
};

const triggerOptions = [
  { value: 'deal_stage_changed', label: 'Deal stage changed' },
  { value: 'rfq_received', label: 'RFQ received' },
  { value: 'deal_created', label: 'Deal created' },
  { value: 'quote_expiring', label: 'Quote expiring' },
  { value: 'discount_requested', label: 'Discount requested' },
];

export default function QuoteAutomationPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [ruleForm, setRuleForm] = useState({
    name: '',
    trigger: 'deal_stage_changed',
    stage: 'Proposal',
    minAmount: '50000',
    actionType: 'create_quote',
    assignTo: 'deal_owner',
  });
  const [templateForm, setTemplateForm] = useState({
    name: '',
    version: '1',
    language: 'en',
    isDefault: false,
    body: '<h1>{{quoteNumber}}</h1><p>{{name}}</p><p>Total: {{total}}</p><p>Valid until: {{expiresAt}}</p>',
    fileName: '',
    contentBase64: '',
    contentType: 'text/html',
  });

  const rules = useQuery({
    queryKey: ['quote-automation-rules'],
    queryFn: async () => {
      const res = await fetch('/api/finance/quote-automation-rules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as Rule[];
    },
  });

  const templates = useQuery({
    queryKey: ['quote-templates-admin'],
    queryFn: async () => {
      const res = await fetch('/api/finance/quote-templates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as Template[];
    },
  });

  const createRule = useMutation({
    mutationFn: async () => {
      const conditions: Record<string, unknown> = {};
      if (ruleForm.trigger === 'deal_stage_changed') conditions.stage = ruleForm.stage;
      if (ruleForm.trigger === 'rfq_received') conditions.rfqStatus = 'REVIEWING';
      if (ruleForm.trigger === 'quote_expiring') conditions.daysBeforeExpiry = 7;
      if (ruleForm.minAmount) conditions.minAmount = Number(ruleForm.minAmount);

      const res = await fetch('/api/finance/quote-automation-rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleForm.name.trim(),
          trigger: ruleForm.trigger,
          isActive: true,
          conditions,
          actions: [{ type: ruleForm.actionType, assignTo: ruleForm.assignTo }],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? json.error ?? 'Create failed');
      return json.data as Rule;
    },
    onSuccess: () => {
      notify.success('Rule created');
      setRuleForm((s) => ({ ...s, name: '' }));
      qc.invalidateQueries({ queryKey: ['quote-automation-rules'] });
    },
    onError: (error) => notify.error('Rule validation failed', error.message),
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const isDocx = templateForm.contentType.includes('wordprocessingml');
      const res = await fetch('/api/finance/quote-templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name.trim(),
          version: Number(templateForm.version),
          language: templateForm.language,
          isDefault: templateForm.isDefault,
          status: isDocx ? 'DRAFT' : 'ACTIVE',
          contentType: templateForm.contentType,
          body: isDocx ? null : templateForm.body,
          contentBase64: templateForm.contentBase64 || undefined,
          variables: ['quoteNumber', 'name', 'total', 'expiresAt'],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Template validation failed');
      return json.data as Template;
    },
    onSuccess: () => {
      notify.success('Template saved');
      setTemplateForm((s) => ({ ...s, name: '', fileName: '', contentBase64: '', contentType: 'text/html' }));
      qc.invalidateQueries({ queryKey: ['quote-templates-admin'] });
    },
    onError: (error) => notify.error('Template rejected', error.message),
  });

  const toggle = useMutation({
    mutationFn: async (rule: Rule) => {
      const res = await fetch(`/api/finance/quote-automation-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-automation-rules'] }),
  });

  async function onTemplateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isHtml = file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');
    if (!isDocx && !isHtml) {
      notify.error('Template rejected', 'Upload an HTML or DOCX template.');
      return;
    }
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      notify.error('Template rejected', 'Uploaded template is empty.');
      return;
    }
    if (isDocx) {
      const signature = Array.from(new Uint8Array(buffer.slice(0, 4))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      if (signature !== '504B0304') {
        notify.error('Template rejected', 'DOCX file failed package validation.');
        return;
      }
      setTemplateForm((s) => ({
        ...s,
        fileName: file.name,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        contentBase64: btoa(String.fromCharCode(...new Uint8Array(buffer))),
      }));
      return;
    }
    const text = await file.text();
    setTemplateForm((s) => ({ ...s, fileName: file.name, contentType: 'text/html', body: text, contentBase64: '' }));
  }

  function submitRule(event: FormEvent) {
    event.preventDefault();
    createRule.mutate();
  }

  function submitTemplate(event: FormEvent) {
    event.preventDefault();
    createTemplate.mutate();
  }

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Quote Automation & Templates</h1>
        <p className="mt-1 text-sm text-slate-500">Rules and templates now require complete data before they can enter the CPQ engine.</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={submitRule} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">Create automation rule</h2>
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="Rule name">
              <input required minLength={3} value={ruleForm.name} onChange={(e) => setRuleForm((s) => ({ ...s, name: e.target.value }))} className="input" placeholder="Create enterprise quote at proposal" />
            </Field>
            <Field label="Trigger">
              <select value={ruleForm.trigger} onChange={(e) => setRuleForm((s) => ({ ...s, trigger: e.target.value }))} className="input">
                {triggerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Stage / gate">
                <input value={ruleForm.stage} onChange={(e) => setRuleForm((s) => ({ ...s, stage: e.target.value }))} className="input" />
              </Field>
              <Field label="Minimum amount">
                <input required type="number" min="0" value={ruleForm.minAmount} onChange={(e) => setRuleForm((s) => ({ ...s, minAmount: e.target.value }))} className="input" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Action">
                <select value={ruleForm.actionType} onChange={(e) => setRuleForm((s) => ({ ...s, actionType: e.target.value }))} className="input">
                  <option value="create_quote">Create quote</option>
                  <option value="request_approval">Request approval</option>
                  <option value="render_template">Render template</option>
                  <option value="send_notification">Send notification</option>
                </select>
              </Field>
              <Field label="Assign to">
                <select value={ruleForm.assignTo} onChange={(e) => setRuleForm((s) => ({ ...s, assignTo: e.target.value }))} className="input">
                  <option value="deal_owner">Deal owner</option>
                  <option value="quote_owner">Quote owner</option>
                  <option value="finance_queue">Finance queue</option>
                </select>
              </Field>
            </div>
            <Button type="submit" isLoading={createRule.isPending}>Validate & add rule</Button>
          </div>
        </form>

        <form onSubmit={submitTemplate} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <UploadCloud className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">Upload quote template</h2>
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="Template name">
              <input required minLength={3} value={templateForm.name} onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))} className="input" placeholder="Enterprise quote pack" />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Version"><input required type="number" min="1" value={templateForm.version} onChange={(e) => setTemplateForm((s) => ({ ...s, version: e.target.value }))} className="input" /></Field>
              <Field label="Language"><select value={templateForm.language} onChange={(e) => setTemplateForm((s) => ({ ...s, language: e.target.value }))} className="input"><option value="en">English</option><option value="ar">Arabic</option></select></Field>
              <label className="flex items-end gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={templateForm.isDefault} onChange={(e) => setTemplateForm((s) => ({ ...s, isDefault: e.target.checked }))} /> Default</label>
            </div>
            <input type="file" accept=".html,.htm,.docx" onChange={onTemplateFile} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm" />
            {templateForm.fileName ? <p className="text-xs font-semibold text-indigo-700">Validated file: {templateForm.fileName}</p> : null}
            <Field label="HTML body">
              <textarea disabled={templateForm.contentType.includes('wordprocessingml')} rows={5} value={templateForm.body} onChange={(e) => setTemplateForm((s) => ({ ...s, body: e.target.value }))} className="input min-h-28" />
            </Field>
            <Button type="submit" variant="secondary" isLoading={createTemplate.isPending}>Validate & save template</Button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ListPanel icon={GitBranch} title="Automation rules">
          {(rules.data ?? []).map((rule) => (
            <div key={rule.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{rule.name}</p>
                  <p className="text-xs text-slate-500">{rule.trigger} · {Object.keys(rule.conditions ?? {}).length} conditions · {rule.actions?.length ?? 0} actions</p>
                </div>
                <Button onClick={() => toggle.mutate(rule)} variant="secondary" className="h-8 px-2 text-xs">{rule.isActive ? 'Disable' : 'Enable'}</Button>
              </div>
            </div>
          ))}
        </ListPanel>
        <ListPanel icon={FileText} title="Quote templates">
          {(templates.data ?? []).map((template) => (
            <div key={template.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{template.name} v{template.version}</p>
                  <p className="text-xs text-slate-500">{template.contentType} · {template.status}</p>
                </div>
                {template.isDefault ? <span className="rounded bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">Default</span> : null}
              </div>
            </div>
          ))}
        </ListPanel>
      </section>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
        }
        .input:focus {
          border-color: rgb(59 130 246);
          box-shadow: 0 0 0 3px rgb(219 234 254);
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500"><span>{label}</span>{children}</label>;
}

function ListPanel({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
