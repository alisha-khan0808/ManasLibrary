'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Permission, type MembershipPlan } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';

export function PlanFormDialog({ plan }: { plan?: MembershipPlan }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (!can(Permission.MEMBERSHIP_PLAN_MANAGE)) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      duration_days: Number(form.get('duration_days')),
      price: String(form.get('price') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || null,
      status: String(form.get('status')),
    };

    try {
      const result = plan
        ? await api.patch(`/memberships/${plan.id}`, payload)
        : await api.post('/memberships', payload);

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
        variant={plan ? 'ghost' : 'primary'}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {plan ? 'Edit' : 'Add plan'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={plan ? `Edit ${plan.name}` : 'Add a membership plan'}
        description="Prices are never hard-coded in the application — they come from here."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" form="plan-form" loading={loading}>
              {plan ? 'Save changes' : 'Create plan'}
            </Button>
          </>
        }
      >
        <form id="plan-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </div>
          )}

          <InputField
            label="Name"
            name="name"
            required
            placeholder="Quarterly"
            defaultValue={plan?.name}
            error={fieldErrors.name}
          />

          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="Duration (days)"
              name="duration_days"
              type="number"
              min={1}
              required
              defaultValue={plan?.duration_days ?? 30}
              error={fieldErrors.duration_days}
            />
            <InputField
              label="Price"
              name="price"
              inputMode="decimal"
              required
              placeholder="1200.00"
              defaultValue={plan?.price}
              error={fieldErrors.price}
            />
          </div>

          <SelectField
            label="Status"
            name="status"
            defaultValue={plan?.status ?? 'ACTIVE'}
            error={fieldErrors.status}
            hint="An inactive plan cannot be sold in new admissions."
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />

          <TextareaField
            label="Description"
            name="description"
            defaultValue={plan?.description ?? ''}
            error={fieldErrors.description}
          />
        </form>
      </Modal>
    </>
  );
}
