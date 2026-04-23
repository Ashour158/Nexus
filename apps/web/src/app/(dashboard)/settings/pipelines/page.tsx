'use client';

import { useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useArchivePipeline,
  useCreatePipeline,
  useCreateStage,
  usePipelines,
  useStages,
  useUpdatePipeline,
  useUpdateStage,
  useDeleteStage,
} from '@/hooks/use-pipelines';

type DraftStage = {
  id: string;
  name: string;
  order: number;
  probability: number;
  rottenDays: number;
  isNew?: boolean;
};

export default function SettingsPipelinesPage(): JSX.Element {
  const pipelinesQuery = usePipelines();
  const pipelines = pipelinesQuery.data ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const selectedPipelineId = expandedId ?? pipelines[0]?.id ?? null;
  const stagesQuery = useStages(selectedPipelineId);

  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const archivePipeline = useArchivePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();

  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineCurrency, setNewPipelineCurrency] = useState('USD');
  const [draftStages, setDraftStages] = useState<DraftStage[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeStages = useMemo(() => {
    if (draftStages.length > 0) return draftStages;
    return (stagesQuery.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      probability: s.probability,
      rottenDays: s.rottenDays,
      isNew: false,
    }));
  }, [draftStages, stagesQuery.data]);

  async function onSaveChanges() {
    if (!selectedPipelineId) return;
    const sorted = [...activeStages].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i += 1) {
      const s = sorted[i];
      const payload = {
        name: s.name,
        order: i + 1,
        probability: Math.max(0, Math.min(100, s.probability)),
        rottenDays: Math.max(1, s.rottenDays),
      };
      if (s.isNew) {
        await createStage.mutateAsync({ pipelineId: selectedPipelineId, data: payload });
      } else {
        await updateStage.mutateAsync({ pipelineId: selectedPipelineId, stageId: s.id, data: payload });
      }
    }
    setDraftStages([]);
  }

  return (
    <main className="space-y-4 px-6 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Settings</h1>
        <p className="text-sm text-slate-600">Configure pipelines and stage progression.</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">New Pipeline</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <Input
            placeholder="Pipeline name"
            value={newPipelineName}
            onChange={(e) => setNewPipelineName(e.target.value)}
          />
          <Input
            placeholder="USD"
            value={newPipelineCurrency}
            onChange={(e) => setNewPipelineCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
          <Button
            type="button"
            onClick={async () => {
              if (!newPipelineName.trim()) return;
              await createPipeline.mutateAsync({
                name: newPipelineName.trim(),
                currency: newPipelineCurrency.trim() || 'USD',
              });
              setNewPipelineName('');
            }}
            isLoading={createPipeline.isPending}
          >
            + New Pipeline
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {pipelinesQuery.isLoading ? (
          <Skeleton className="h-36 rounded-md" />
        ) : (
          pipelines.map((pipeline) => (
            <div key={pipeline.id} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{pipeline.name}</h3>
                  <p className="text-xs text-slate-500">
                    Currency {pipeline.currency} • {pipeline.isDefault ? 'Default pipeline' : 'Non-default'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pipeline.isDefault ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Default
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setExpandedId((v) => (v === pipeline.id ? null : pipeline.id))}
                  >
                    {expandedId === pipeline.id ? 'Hide stages' : 'Edit stages'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      updatePipeline.mutate({
                        id: pipeline.id,
                        data: { isDefault: !pipeline.isDefault },
                      })
                    }
                  >
                    {pipeline.isDefault ? 'Unset default' : 'Set default'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => archivePipeline.mutate(pipeline.id)}
                  >
                    Archive
                  </Button>
                </div>
              </div>

              {expandedId === pipeline.id ? (
                <div className="border-t border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Stages</h4>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const nextOrder = activeStages.length + 1;
                          setDraftStages((prev) => [
                            ...(prev.length > 0 ? prev : activeStages),
                            {
                              id: `new-${Date.now()}-${nextOrder}`,
                              name: 'New stage',
                              order: nextOrder,
                              probability: 10,
                              rottenDays: 14,
                              isNew: true,
                            },
                          ]);
                        }}
                      >
                        + Add Stage
                      </Button>
                      <Button type="button" onClick={onSaveChanges}>
                        Save Changes
                      </Button>
                    </div>
                  </div>

                  {stagesQuery.isLoading ? (
                    <Skeleton className="h-40 rounded-md" />
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        const current = activeStages;
                        const oldIndex = current.findIndex((s) => s.id === active.id);
                        const newIndex = current.findIndex((s) => s.id === over.id);
                        if (oldIndex < 0 || newIndex < 0) return;
                        const moved = arrayMove(current, oldIndex, newIndex).map((s, idx) => ({
                          ...s,
                          order: idx + 1,
                        }));
                        setDraftStages(moved);
                      }}
                    >
                      <SortableContext items={activeStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {activeStages.map((stage) => (
                            <SortableStageRow
                              key={stage.id}
                              stage={stage}
                              onChange={(patch) =>
                                setDraftStages((prev) =>
                                  (prev.length > 0 ? prev : activeStages).map((s) =>
                                    s.id === stage.id ? { ...s, ...patch } : s
                                  )
                                )
                              }
                              onDelete={async () => {
                                if (stage.isNew) {
                                  setDraftStages((prev) => prev.filter((s) => s.id !== stage.id));
                                  return;
                                }
                                if (!selectedPipelineId) return;
                                await deleteStage.mutateAsync({
                                  pipelineId: selectedPipelineId,
                                  stageId: stage.id,
                                });
                              }}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </main>
  );
}

function SortableStageRow({
  stage,
  onChange,
  onDelete,
}: {
  stage: DraftStage;
  onChange: (patch: Partial<DraftStage>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: stage.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[28px_1fr_120px_140px_auto]"
    >
      <button
        type="button"
        className="cursor-grab rounded border border-slate-300 text-xs text-slate-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Reorder stage"
      >
        ::
      </button>
      <Input value={stage.name} onChange={(e) => onChange({ name: e.target.value })} />
      <div>
        <label className="mb-1 block text-xs text-slate-500">Probability</label>
        <input
          type="range"
          min={0}
          max={100}
          value={stage.probability}
          onChange={(e) => onChange({ probability: Number(e.target.value) })}
          className="w-full accent-brand-600"
        />
        <div className="text-right text-xs text-slate-600">{stage.probability}%</div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Rotten days</label>
        <Input
          type="number"
          min={1}
          value={stage.rottenDays}
          onChange={(e) => onChange({ rottenDays: Number(e.target.value) || 1 })}
        />
      </div>
      <div className="flex items-end justify-end">
        <Button type="button" variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
