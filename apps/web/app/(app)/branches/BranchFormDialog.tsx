'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Permission, type Branch } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';

export function BranchFormDialog({ branch }: { branch?: Branch }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (!can(Permission.BRANCH_MANAGE)) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const optional = (key: string) => {
      const value = String(form.get(key) ?? '').trim();
      return value === '' ? null : value;
    };

    const payload: Record<string, unknown> = {
      name: String(form.get('name') ?? '').trim(),
      address: optional('address'),
      city: optional('city'),
      state: optional('state'),
      phone: optional('phone'),
      email: optional('email'),
      opening_time: optional('opening_time'),
      closing_time: optional('closing_time'),
      status: String(form.get('status')),
    };

    // branch_code is immutable once set — it appears in every document number.
    if (!branch) payload.branch_code = String(form.get('branch_code') ?? '').trim();

    try {
      const result = branch
        ? await api.patch<Branch>(`/branches/${branch.id}`, payload)
        : await api.post<Branch>('/branches', payload);

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
      <Button variant={branch ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
        {branch ? 'Edit branch' : 'Add branch'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={branch ? `Edit ${branch.name}` : 'Add a branch'}
        description={
          branch
            ? 'Changes take effect immediately for everyone assigned to this branch.'
            : 'The branch code prefixes admission and invoice numbers and cannot be changed later.'
        }
      >
        <form id="branch-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {!branch && (
              <InputField
                label="Branch code"
                name="branch_code"
                required
                maxLength={20}
                placeholder="MLB02"
                error={fieldErrors.branch_code}
                hint="2–20 letters, digits, hyphen or underscore."
              />
            )}

            <InputField
              label="Name"
              name="name"
              required
              defaultValue={branch?.name}
              error={fieldErrors.name}
              containerClassName={branch ? 'sm:col-span-2' : undefined}
            />

            <InputField
              label="City"
              name="city"
              defaultValue={branch?.city ?? ''}
              error={fieldErrors.city}
            />
            <InputField
              label="State"
              name="state"
              defaultValue={branch?.state ?? ''}
              error={fieldErrors.state}
            />

            <InputField
              label="Phone"
              name="phone"
              defaultValue={branch?.phone ?? ''}
              error={fieldErrors.phone}
            />
            <InputField
              label="Email"
              name="email"
              type="email"
              defaultValue={branch?.email ?? ''}
              error={fieldErrors.email}
            />

            <InputField
              label="Opening time"
              name="opening_time"
              type="time"
              defaultValue={branch?.opening_time ?? '06:00'}
              error={fieldErrors.opening_time}
            />
            <InputField
              label="Closing time"
              name="closing_time"
              type="time"
              defaultValue={branch?.closing_time ?? '22:00'}
              error={fieldErrors.closing_time}
            />

            <SelectField
              label="Status"
              name="status"
              defaultValue={branch?.status ?? 'ACTIVE'}
              error={fieldErrors.status}
              hint="Inactive and suspended branches cannot take new admissions."
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
            />

            <TextareaField
              label="Address"
              name="address"
              defaultValue={branch?.address ?? ''}
              error={fieldErrors.address}
              containerClassName="sm:col-span-2"
            />
          </div>
        </form>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="branch-form" loading={loading}>
            {branch ? 'Save changes' : 'Create branch'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
