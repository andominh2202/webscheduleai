'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      gap={8}
      visibleToasts={4}
      toastOptions={{
        duration: 3500,
        classNames: {
          toast:
            'group z-toast rounded-lg border border-border bg-card text-card-foreground shadow-elevated transition-all duration-200',
          title: 'text-sm font-medium text-foreground',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-md text-xs font-medium',
          cancelButton: 'bg-muted text-muted-foreground rounded-md text-xs font-medium',
          success: 'border-success/30',
          error: 'border-destructive/30',
          warning: 'border-warning/30',
          info: 'border-info/30',
        },
      }}
    />
  );
}

export { toast } from 'sonner';

