import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Card';
import { AdmissionWizard } from './AdmissionWizard';

export const metadata: Metadata = { title: 'New admission' };

export default function NewAdmissionPage({
  searchParams,
}: {
  searchParams: { studentId?: string; branchId?: string };
}) {
  return (
    <>
      <PageHeader
        title="New admission"
        description="Student, membership, batch, seat, fees and payment — completed as one transaction."
      />
      <AdmissionWizard
        presetStudentId={searchParams.studentId}
        presetBranchId={searchParams.branchId}
      />
    </>
  );
}
