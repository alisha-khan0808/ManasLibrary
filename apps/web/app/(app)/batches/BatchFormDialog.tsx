'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@manas/shared';
import type { BatchWithLoad } from './page';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField } from '@/components/ui/Field';

export function BatchFormDialog({
  batch,
  branchId,
}: {
  batch?: BatchWithLoad;
  branchId?: string;
}) {
  const { can, branches } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const activeBranches = branches.filter((branch) => branch.status === 'ACTIVE');

  if (!can(Permission.BATCH_MANAGE)) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get('name') ?? '').trim(),
      start_time: String(form.get('start_time') ?? ''),
      end_time: String(form.get('end_time') ?? ''),
      capacity: Number(form.get('capacity')),
      status: String(form.get('status')),
    };

    if (!batch) payload.branch_id = String(form.get('branch_id') ?? '') || undefined;

    try {
      const result = batch
        ? await api.patch(`/batches/${batch.id}`, payload)
        : await api.post('/batches', payload);

      toast.success(result.message);
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) setFormError(error.message);
      } else {
        setFormError('Could not reach the server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant={batch ? 'secondary' : 'primary'}
        size={batch ? 'sm' : 'md'}
        onClick={() => setOpen(true)}
      >
        {batch ? 'Edit' : 'Add batch'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={batch ? `Edit ${batch.name}` : 'Add a batch'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" form="batch-form" loading={loading}>
              {batch ? 'Save changes' : 'Create batch'}
            </Button>
          </>
        }
      >
        <form id="batch-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </div>
          )}

          {!batch && (
            <SelectField
              label="Branch"
              name="branch_id"
              required
              defaultValue={branchId ?? (activeBranches.length === 1 ? activeBranches[0]!.id : '')}
              placeholder="Select a branch"
              error={fieldErrors.branch_id}
              options={activeBranches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
            />
          )}

          <InputField
            label="Name"
            name="name"
            required
            placeholder="Morning"
            defaultValue={batch?.name}
            error={fieldErrors.name}
          />

          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="Start time"
              name="start_time"
              type="time"
              required
              defaultValue={batch?.start_time ?? '06:00'}
              error={fieldErrors.start_time}
            />
            <InputField
              label="End time"
              name="end_time"
              type="time"
              required
              defaultValue={batch?.end_time ?? '10:00'}
              error={fieldErrors.end_time}
            />
          </div>

          <InputField
            label="Capacity"
            name="capacity"
            type="number"
            min={batch?.enrolled_count || 1}
            required
            defaultValue={batch?.capacity ?? 60}
            error={fieldErrors.capacity}
            hint={
              batch
                ? `Cannot go below the ${batch.enrolled_count} student(s) already enrolled.`
                : 'Maximum students that may be enrolled at once.'
            }
          />

          <SelectField
            label="Status"
            name="status"
            defaultValue={batch?.status ?? 'ACTIVE'}
            error={fieldErrors.status}
            hint="An inactive batch accepts no new students."
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />
        </form>
      </Modal>
    </>
  );
}
