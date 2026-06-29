'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { dealKeys } from '@/hooks/use-deals';
import { accountKeys } from '@/hooks/use-accounts';
import { contactKeys } from '@/hooks/use-contacts';
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
    socket.on('deal:commercial_updated', invalidate);
    socket.on('deal:drq_created', invalidate);
    socket.on('deal:rfq_created', invalidate);
    socket.on('deal:rfq_updated', invalidate);
    socket.on('deal:rfq_converted', invalidate);
    socket.on('deal:order_created', invalidate);
    socket.on('deal:quote_document_rendered', invalidate);
    socket.on('deal:quote_esign_updated', invalidate);
    return () => {
      socket.emit('deal:unsubscribe', dealId);
      socket.off('deal:updated', invalidate);
      socket.off('deal:stage_changed', invalidate);
      socket.off('deal:status_changed', invalidate);
      socket.off('deal:commercial_updated', invalidate);
      socket.off('deal:drq_created', invalidate);
      socket.off('deal:rfq_created', invalidate);
      socket.off('deal:rfq_updated', invalidate);
      socket.off('deal:rfq_converted', invalidate);
      socket.off('deal:order_created', invalidate);
      socket.off('deal:quote_document_rendered', invalidate);
      socket.off('deal:quote_esign_updated', invalidate);
    };
  }, [dealId, qc]);
}

export function useRealtimeContact(contactId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!contactId) return;
    const socket = getSocket();
    socket.emit('contact:subscribe', contactId);
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
      qc.invalidateQueries({ queryKey: ['contacts', contactId] });
      qc.invalidateQueries({ queryKey: ['contacts', contactId, 'quotes'] });
      qc.invalidateQueries({ queryKey: ['contacts', contactId, 'timeline'] });
      qc.invalidateQueries({ queryKey: ['contacts', contactId, 'activities'] });
      qc.invalidateQueries({ queryKey: ['contacts', contactId, 'audit'] });
      qc.invalidateQueries({ queryKey: ['contacts', contactId, 'outbox'] });
      qc.invalidateQueries({ queryKey: ['activities', 'list'] });
    };
    socket.on('contact:updated', invalidate);
    socket.on('contact:quote_created', invalidate);
    socket.on('contact:quote_updated', invalidate);
    socket.on('contact:commercial_updated', invalidate);
    socket.on('contact:drq_created', invalidate);
    socket.on('contact:rfq_created', invalidate);
    socket.on('contact:rfq_updated', invalidate);
    socket.on('contact:rfq_converted', invalidate);
    socket.on('contact:order_created', invalidate);
    socket.on('contact:quote_document_rendered', invalidate);
    socket.on('contact:quote_esign_updated', invalidate);
    socket.on('contact:activity_created', invalidate);
    socket.on('contact:activity_updated', invalidate);
    return () => {
      socket.emit('contact:unsubscribe', contactId);
      socket.off('contact:updated', invalidate);
      socket.off('contact:quote_created', invalidate);
      socket.off('contact:quote_updated', invalidate);
      socket.off('contact:commercial_updated', invalidate);
      socket.off('contact:drq_created', invalidate);
      socket.off('contact:rfq_created', invalidate);
      socket.off('contact:rfq_updated', invalidate);
      socket.off('contact:rfq_converted', invalidate);
      socket.off('contact:order_created', invalidate);
      socket.off('contact:quote_document_rendered', invalidate);
      socket.off('contact:quote_esign_updated', invalidate);
      socket.off('contact:activity_created', invalidate);
      socket.off('contact:activity_updated', invalidate);
    };
  }, [contactId, qc]);
}

export function useRealtimeAccount(accountId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!accountId) return;
    const socket = getSocket();
    socket.emit('account:subscribe', accountId);
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
      qc.invalidateQueries({ queryKey: accountKeys.contacts(accountId) });
      qc.invalidateQueries({ queryKey: accountKeys.deals(accountId) });
      qc.invalidateQueries({ queryKey: accountKeys.quotes(accountId) });
      qc.invalidateQueries({ queryKey: accountKeys.orders(accountId) });
      qc.invalidateQueries({ queryKey: accountKeys.health(accountId) });
      qc.invalidateQueries({ queryKey: ['accounts', accountId] });
    };
    socket.on('account:updated', invalidate);
    socket.on('account:commercial_updated', invalidate);
    socket.on('account:drq_created', invalidate);
    socket.on('account:rfq_created', invalidate);
    socket.on('account:rfq_updated', invalidate);
    socket.on('account:rfq_converted', invalidate);
    socket.on('account:quote_created', invalidate);
    socket.on('account:quote_updated', invalidate);
    socket.on('account:order_created', invalidate);
    socket.on('account:order_updated', invalidate);
    socket.on('account:quote_document_rendered', invalidate);
    socket.on('account:quote_esign_updated', invalidate);
    return () => {
      socket.emit('account:unsubscribe', accountId);
      socket.off('account:updated', invalidate);
      socket.off('account:commercial_updated', invalidate);
      socket.off('account:drq_created', invalidate);
      socket.off('account:rfq_created', invalidate);
      socket.off('account:rfq_updated', invalidate);
      socket.off('account:rfq_converted', invalidate);
      socket.off('account:quote_created', invalidate);
      socket.off('account:quote_updated', invalidate);
      socket.off('account:order_created', invalidate);
      socket.off('account:order_updated', invalidate);
      socket.off('account:quote_document_rendered', invalidate);
      socket.off('account:quote_esign_updated', invalidate);
    };
  }, [accountId, qc]);
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
