import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Card';
import { StudentForm } from '../StudentForm';

export const metadata: Metadata = { title: 'New student' };

export default function NewStudentPage({
  searchParams,
}: {
  searchParams: { branchId?: string };
}) {
  return (
    <>
      <PageHeader
        title="Add student"
        description="Create a student record. Membership, seat and batch are assigned during admission."
      />
      <StudentForm defaultBranchId={searchParams.branchId} />
    </>
  );
}
