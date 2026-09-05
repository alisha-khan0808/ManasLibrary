'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Student } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';

interface Props {
  student?: Student;
  defaultBranchId?: string;
}

export function StudentForm({ student, defaultBranchId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { branches } = useSession();

  const activeBranches = branches.filter((branch) => branch.status === 'ACTIVE');

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(
    student?.branch_id ?? defaultBranchId ?? (activeBranches.length === 1 ? activeBranches[0]!.id : ''),
  );

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

    const payload = {
      full_name: String(form.get('full_name') ?? '').trim(),
      mobile: String(form.get('mobile') ?? '').trim(),
      email: optional('email'),
      date_of_birth: optional('date_of_birth'),
      address: optional('address'),
      emergency_contact_name: optional('emergency_contact_name'),
      emergency_contact_phone: optional('emergency_contact_phone'),
      ...(student ? { status: String(form.get('status')) } : { branch_id: branchId || undefined }),
    };

    try {
      const result = student
        ? await api.patch<Student>(`/students/${student.id}`, payload)
        : await api.post<Student>('/students', payload);

      toast.success(result.message);
      router.push(`/students/${result.data.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors);
        // Field-level messages are shown inline; only surface the summary when
        // there is nothing to attach it to.
        if (Object.keys(error.fieldErrors).length === 0) setFormError(error.message);
        else toast.error(error.message);
      } else {
        setFormError('Could not reach the server. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4" noValidate>
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger"
        >
          {formError}
        </div>
      )}

      <Card title="Personal information">
        <div className="grid gap-4 sm:grid-cols-2">
          {!student && (
            <SelectField
              label="Branch"
              required
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              placeholder={
                activeBranches.length === 0 ? 'No active branch available' : 'Select a branch'
              }
              error={fieldErrors.branch_id}
              hint="A student belongs to exactly one branch."
              options={activeBranches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
              containerClassName="sm:col-span-2"
            />
          )}

          <InputField
            label="Full name"
            name="full_name"
            required
            maxLength={120}
            defaultValue={student?.full_name}
            error={fieldErrors.full_name}
            containerClassName="sm:col-span-2"
          />

          <InputField
            label="Mobile"
            name="mobile"
            required
            inputMode="numeric"
            pattern="[0-9]{10,15}"
            placeholder="9876543210"
            defaultValue={student?.mobile}
            error={fieldErrors.mobile}
            hint="Digits only, 10–15 characters."
          />

          <InputField
            label="Email"
            name="email"
            type="email"
            defaultValue={student?.email ?? ''}
            error={fieldErrors.email}
          />

          <InputField
            label="Date of birth"
            name="date_of_birth"
            type="date"
            defaultValue={student?.date_of_birth ?? ''}
            error={fieldErrors.date_of_birth}
          />

          {student && (
            <SelectField
              label="Status"
              name="status"
              defaultValue={student.status}
              error={fieldErrors.status}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
            />
          )}

          <TextareaField
            label="Address"
            name="address"
            defaultValue={student?.address ?? ''}
            error={fieldErrors.address}
            containerClassName="sm:col-span-2"
          />
        </div>
      </Card>

      <Card title="Emergency contact" description="Optional, but strongly recommended.">
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Contact name"
            name="emergency_contact_name"
            defaultValue={student?.emergency_contact_name ?? ''}
            error={fieldErrors.emergency_contact_name}
          />
          <InputField
            label="Contact phone"
            name="emergency_contact_phone"
            inputMode="numeric"
            defaultValue={student?.emergency_contact_phone ?? ''}
            error={fieldErrors.emergency_contact_phone}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          {student ? 'Save changes' : 'Create student'}
        </Button>
      </div>
    </form>
  );
}
