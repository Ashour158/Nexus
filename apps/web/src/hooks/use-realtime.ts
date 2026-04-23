'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { dealKeys } from '@/hooks/use-deals';
import { notificationKeys } from '@/hooks/use-notifications';
import { useUiStore } from '@/stores/ui.store';

export function useRealtimeDeal(dealId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!dealId) return;
    const socket = getSocket();
    socket.emit('deal:subscribe', dealId);
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(dealId) });
      qc.invalidateQueries({ queryKey: [...dealKeys.detail(dealId), 'timeline'] });
    };
    socket.on('deal:updated', invalidate);
    socket.on('deal:stage_changed', invalidate);
    socket.on('deal:status_changed', invalidate);
    return () => {
      socket.emit('deal:unsubscribe', dealId);
      socket.off('deal:updated', invalidate);
      socket.off('deal:stage_changed', invalidate);
      socket.off('deal:status_changed', invalidate);
    };
  }, [dealId, qc]);
}

export function useRealtimeNotifications() {
  const qc = useQueryClient();
  const incrementUnread = useUiStore((s) => s.incrementUnreadNotifications);
  const setUnread = useUiStore((s) => s.setUnreadNotifications);

  useEffect(() => {
    const socket = getSocket();
    const onNew = () => {
      incrementUnread(1);
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    };
    const onUnread = (payload: { count?: number }) => {
      if (typeof payload.count === 'number') {
        setUnread(payload.count);
      } else {
        qc.invalidateQueries({ queryKey: notificationKeys.unread() });
      }
    };
    socket.on('notification:new', onNew);
    socket.on('notification:unread_count', onUnread);
    socket.emit('notification:subscribe');
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:unread_count', onUnread);
      socket.emit('notification:unsubscribe');
    };
  }, [incrementUnread, qc, setUnread]);
}

export function useRealtimePipeline(pipelineId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!pipelineId) return;
    const socket = getSocket();
    const invalidate = () => qc.invalidateQueries({ queryKey: dealKeys.pipeline(pipelineId) });
    socket.on('deal:stage_changed', invalidate);
    socket.on('deal:updated', invalidate);
    return () => {
      socket.off('deal:stage_changed', invalidate);
      socket.off('deal:updated', invalidate);
    };
  }, [pipelineId, qc]);
}
