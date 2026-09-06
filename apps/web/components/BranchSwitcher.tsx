'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from './SessionProvider';

/**
 * Selects the branch context for the current screen.
 *
 * The choice is a URL parameter, so it survives refresh and sharing — and,
 * critically, it is only a hint: the API independently rejects any branch the
 * user is not authorized for.
 */
export function BranchSwitcher() {
  const { branches, isSuperAdmin } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('branchId') ?? '';

  // Nothing to switch between when the user has exactly one branch.
  if (branches.length <= 1 && !isSuperAdmin) {
    return (
      <span className="truncate text-sm font-medium text-content">
        {branches[0]?.name ?? 'No branch assigned'}
      </span>
    );
  }

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('branchId', value);
    else params.delete('branchId');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="hidden text-xs font-medium uppercase tracking-wide text-content-subtle sm:inline">
        Branch
      </span>
      <select
        value={current}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Select branch"
        className="input-base h-9 w-auto max-w-[9rem] py-1 text-sm sm:max-w-[16rem]"
      >
        <option value="">
          {isSuperAdmin ? 'All branches' : 'All my branches'}
        </option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.status !== 'ACTIVE' ? ` (${branch.status.toLowerCase()})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
