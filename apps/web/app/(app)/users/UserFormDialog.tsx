'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission, UserRole, canAssignRole, type AppUser } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InputField, SelectField } from '@/components/ui/Field';

export function UserFormDialog({ user }: { user?: AppUser }) {
  const { can, branches, user: currentUser } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<UserRole>((user?.role as UserRole) ?? UserRole.STAFF);
  const [status, setStatus] = useState(user?.status ?? 'ACTIVE');
  const [branchIds, setBranchIds] = useState<string[]>(user?.branch_ids ?? []);

  if (!can(Permission.USER_MANAGE)) return null;

  // The API enforces this too; mirroring it here avoids offering a role the
  // request would only be rejected for.
  const assignableRoles = [UserRole.STAFF, UserRole.BRANCH_ADMIN, UserRole.SUPER_ADMIN].filter(
    (candidate) => canAssignRole(currentUser.role as UserRole, candidate),
  );

  function toggleBranch(branchId: string) {
    setBranchIds((current) =>
      current.includes(branchId)
        ? current.filter((id) => id !== branchId)
        : [...current, branchId],
    );
  }

  async function submit() {
    setLoading(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (user) {
        const result = await api.patch<AppUser>(`/users/${user.id}`, {
          full_name: fullName,
          phone: phone || null,
          role,
          status,
          branch_ids: role === UserRole.SUPER_ADMIN ? [] : branchIds,
        });
        toast.success(result.message);
      } else {
        const result = await api.post<AppUser>('/users', {
          email,
          full_name: fullName,
          phone: phone || null,
          role,
          branch_ids: role === UserRole.SUPER_ADMIN ? [] : branchIds,
        });
        toast.success(result.message);
      }

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
        variant={user ? 'ghost' : 'primary'}
        size={user ? 'sm' : 'md'}
        onClick={() => setOpen(true)}
      >
        {user ? 'Edit' : 'Add user'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={user ? `Edit ${user.full_name}` : 'Add a user'}
        description={
          user
            ? 'Role and branch changes take effect on their next request.'
            : 'The user receives a password-reset link to set their own password. No password is stored by this app.'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} loading={loading}>
              {user ? 'Save changes' : 'Create user'}
            </Button>
          </>
        }
      >
        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <InputField
            label="Full name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={fieldErrors.full_name}
          />

          {!user && (
            <InputField
              label="Email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
              hint="Used as their sign-in identity. It cannot be changed later."
            />
          )}

          <InputField
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={fieldErrors.phone}
          />

          <SelectField
            label="Role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            error={fieldErrors.role}
            options={assignableRoles.map((candidate) => ({
              value: candidate,
              label: candidate.replace('_', ' '),
            }))}
          />

          {user && (
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              error={fieldErrors.status}
              hint="An inactive account cannot sign in."
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
            />
          )}

          {role !== UserRole.SUPER_ADMIN && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-content">
                Branches
                <span className="ml-0.5 text-danger" aria-hidden>
                  *
                </span>
              </legend>
              <p className="text-xs text-content-subtle">
                This account can only see and act on the branches selected here.
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2 scrollbar-thin">
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={branchIds.includes(branch.id)}
                      onChange={() => toggleBranch(branch.id)}
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <span className="text-content">{branch.name}</span>
                    <span className="text-xs text-content-subtle">{branch.branch_code}</span>
                  </label>
                ))}
                {branches.length === 0 && (
                  <p className="px-2 py-3 text-sm text-content-muted">
                    No branches available to assign.
                  </p>
                )}
              </div>
              {fieldErrors.branch_ids && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.branch_ids}
                </p>
              )}
            </fieldset>
          )}
        </div>
      </Modal>
    </>
  );
}
