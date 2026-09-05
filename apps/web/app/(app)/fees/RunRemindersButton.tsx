'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';

interface ReminderRun {
  scanned: number;
  created: number;
  sent: number;
  failed: number;
}

/**
 * Runs the same reminder job the scheduler runs. Safe to press twice: the job
 * is idempotent for a given day, so nothing is sent to anyone a second time.
 */
export function RunRemindersButton() {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  if (!can(Permission.FEE_MANAGE)) return null;

  async function run() {
    setLoading(true);

    try {
      const result = await api.post<ReminderRun>('/fees/reminders/run');
      const { created, sent, failed } = result.data;

      toast.success(
        created === 0
          ? 'No new reminders were due.'
          : `${created} reminder(s) generated · ${sent} sent · ${failed} failed.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Could not run the reminder job.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={run} loading={loading}>
      Run reminders now
    </Button>
  );
}
