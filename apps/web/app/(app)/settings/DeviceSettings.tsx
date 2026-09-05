'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Permission, type BiometricDevice } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField } from '@/components/ui/Field';

export function DeviceFormDialog({ branchId }: { branchId?: string }) {
  const { can, branches } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const activeBranches = branches.filter((branch) => branch.status === 'ACTIVE');

  if (!can(Permission.BIOMETRIC_MANAGE)) return null;

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

    try {
      const result = await api.post('/biometric/devices', {
        branch_id: String(form.get('branch_id') ?? '') || undefined,
        name: String(form.get('name') ?? '').trim(),
        device_identifier: String(form.get('device_identifier') ?? '').trim(),
        ip_address: optional('ip_address'),
        api_endpoint: optional('api_endpoint'),
      });

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
      <Button size="sm" onClick={() => setOpen(true)}>
        Register device
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Register a biometric device"
        description="A device belongs to exactly one branch, and can only map students from that branch."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" form="device-form" loading={loading}>
              Register device
            </Button>
          </>
        }
      >
        <form id="device-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </div>
          )}

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

          <InputField
            label="Device name"
            name="name"
            required
            placeholder="Main entrance"
            error={fieldErrors.name}
          />

          <InputField
            label="Device identifier"
            name="device_identifier"
            required
            placeholder="Serial number from the machine"
            error={fieldErrors.device_identifier}
            hint="Must be unique across the franchise."
          />

          <InputField
            label="IP address"
            name="ip_address"
            placeholder="192.168.1.50"
            error={fieldErrors.ip_address}
          />

          <InputField
            label="API endpoint"
            name="api_endpoint"
            type="url"
            placeholder="https://…"
            error={fieldErrors.api_endpoint}
            hint="Only used when BIOMETRIC_PROVIDER is set to an HTTP provider."
          />
        </form>
      </Modal>
    </>
  );
}

export function DeviceRowActions({ device }: { device: BiometricDevice }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'test' | 'sync' | null>(null);

  if (!can(Permission.BIOMETRIC_MANAGE)) return null;

  async function test() {
    setBusy('test');

    try {
      const result = await api.post<{ reachable: boolean; message: string }>(
        `/biometric/devices/${device.id}/test`,
      );
      if (result.data.reachable) toast.success(result.message);
      else toast.error(`${result.message}: ${result.data.message}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not test the device.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');

    try {
      const result = await api.post(`/biometric/devices/${device.id}/sync`, { hours: 24 });
      toast.success(result.message);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not sync the device.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="ghost" size="sm" loading={busy === 'test'} onClick={test}>
        Test
      </Button>
      <Button variant="ghost" size="sm" loading={busy === 'sync'} onClick={sync}>
        Sync
      </Button>
    </div>
  );
}
