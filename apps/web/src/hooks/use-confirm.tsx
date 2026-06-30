'use client';
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function useConfirm() {
  const [state, setState] = useState<{
    message: string;
    title: string;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (message: string, title = 'Confirm'): Promise<boolean> =>
      new Promise((resolve) => setState({ message, title, resolve })),
    []
  );

  const handleClose = useCallback(
    (result: boolean) => {
      state?.resolve(result);
      setState(null);
    },
    [state]
  );

  const ConfirmDialog = state ? (
    <Dialog open onOpenChange={(open) => !open && handleClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription>{state.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => handleClose(true)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, ConfirmDialog };
}

export function usePrompt() {
  const [state, setState] = useState<{
    message: string;
    title: string;
    defaultValue: string;
    resolve: (v: string | null) => void;
  } | null>(null);
  const [inputValue, setInputValue] = useState('');

  const prompt = useCallback(
    (message: string, title = 'Input required', defaultValue = ''): Promise<string | null> =>
      new Promise((resolve) => {
        setInputValue(defaultValue);
        setState({ message, title, defaultValue, resolve });
      }),
    []
  );

  const handleClose = useCallback(
    (result: string | null) => {
      state?.resolve(result);
      setState(null);
      setInputValue('');
    },
    [state]
  );

  const PromptDialog = state ? (
    <Dialog open onOpenChange={(open) => !open && handleClose(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription>{state.message}</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleClose(inputValue || null)}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(null)}>Cancel</Button>
          <Button onClick={() => handleClose(inputValue || null)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { prompt, PromptDialog };
}
