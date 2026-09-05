import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Student } from '@manas/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { PageHeader } from '@/components/ui/Card';
import { StudentForm } from '../../StudentForm';

export const metadata: Metadata = { title: 'Edit student' };

export default async function EditStudentPage({ params }: { params: { id: string } }) {
  let student: Student;

  try {
    const result = await apiFetch<Student>(`/students/${params.id}`);
    student = result.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader title={`Edit ${student.full_name}`} description={student.student_code} />
      <StudentForm student={student} />
    </>
  );
}
