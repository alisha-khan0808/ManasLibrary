'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField } from '@/components/ui/Field';

/** Bulk seat creation — how a new branch gets its seat map in one step. */
export function SeatToolbar({ branchId }: { branchId?: string }) {
  const { can, branches } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeBranches = branches.filter((branch) => branch.status === 'ACTIVE');
  const [targetBranch, setTargetBranch] = useState(
    branchId ?? (activeBranches.length === 1 ? activeBranches[0]!.id : ''),
  );
  const [prefix, setPrefix] = useState('A');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('20');
  const [floor, setFloor] = useState('Ground');

  if (!can(Permission.SEAT_MANAGE)) return null;

  async function create() {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post<{ created: number; skipped: string[] }>('/seats/bulk', {
        branch_id: targetBranch || undefined,
        prefix,
        from: Number(from),
        to: Number(to),
        padding: 2,
        floor: floor || null,
        section: prefix,
      });

      toast.success(result.message);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Could not reach the server. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add seats
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add seats"
        description="Creates a numbered range. Seat numbers that already exist are skipped."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={create} loading={loading} disabled={!targetBranch}>
              Create seats
            </Button>
          </>
        }
      >
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <SelectField
            label="Branch"
            required
            value={targetBranch}
            onChange={(event) => setTargetBranch(event.target.value)}
            placeholder="Select a branch"
            options={activeBranches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />

          <div className="grid grid-cols-3 gap-3">
            <InputField
              label="Prefix"
              value={prefix}
              maxLength={10}
              onChange={(event) => setPrefix(event.target.value.toUpperCase())}
            />
            <InputField
              label="From"
              type="number"
              min={1}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <InputField
              label="To"
              type="number"
              min={1}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <InputField
            label="Floor"
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
            hint={`Will create ${prefix}${String(from).padStart(2, '0')} … ${prefix}${String(to).padStart(2, '0')}`}
          />
        </div>
      </Modal>
    </>
  );
}
