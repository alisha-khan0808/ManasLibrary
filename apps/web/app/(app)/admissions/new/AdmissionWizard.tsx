'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { MembershipPlan, Student } from '@manas/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';
import { formatDate, formatMoney, formatTime, todayIso } from '@/lib/format';

/**
 * Guided admission form (PRD §38).
 *
 * The fee summary is a *preview*: it comes from POST /admissions/quote, and the
 * final amounts are recalculated server-side when the admission is submitted.
 * Nothing on this screen is trusted as an input to the money.
 */

const STEPS = [
  'Student',
  'Membership',
  'Batch',
  'Seat',
  'Fee summary',
  'Payment',
  'Confirm',
] as const;

interface BatchOption {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  enrolled_count: number;
  available_slots: number;
  status: string;
}

interface SeatOption {
  id: string;
  seat_number: string;
  floor: string | null;
  status: string;
}

interface Quote {
  plan: MembershipPlan;
  startDate: string;
  endDate: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

export function AdmissionWizard({
  presetStudentId,
  presetBranchId,
}: {
  presetStudentId?: string;
  presetBranchId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { branches } = useSession();

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.status === 'ACTIVE'),
    [branches],
  );

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [branchId, setBranchId] = useState(
    presetBranchId ?? (activeBranches.length === 1 ? activeBranches[0]!.id : ''),
  );
  const [useExisting, setUseExisting] = useState(Boolean(presetStudentId));
  const [studentId, setStudentId] = useState(presetStudentId ?? '');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    mobile: '',
    email: '',
    date_of_birth: '',
    address: '',
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [seats, setSeats] = useState<SeatOption[]>([]);

  const [planId, setPlanId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [seatId, setSeatId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [discount, setDiscount] = useState('0.00');
  const [notes, setNotes] = useState('');

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [collectPayment, setCollectPayment] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');

  /* ------------------------------ data loading ------------------------- */

  useEffect(() => {
    api
      .get<MembershipPlan[]>('/memberships', { status: 'ACTIVE' })
      .then((response) => setPlans(response.data))
      .catch(() => setError('Could not load membership plans.'));
  }, []);

  useEffect(() => {
    if (!branchId) return;

    api
      .get<Student[]>('/students', { branchId, pageSize: 100 })
      .then((response) => setStudents(response.data))
      .catch(() => undefined);

    api
      .get<BatchOption[]>('/batches', { branchId, status: 'ACTIVE' })
      .then((response) => setBatches(response.data))
      .catch(() => undefined);

    api
      .get<SeatOption[]>('/seats', { branchId, availableOn: startDate })
      .then((response) => setSeats(response.data))
      .catch(() => undefined);
  }, [branchId, startDate]);

  const refreshQuote = useCallback(async () => {
    if (!branchId || !planId) return;

    setQuoteLoading(true);
    setError(null);

    try {
      const response = await api.post<Quote>('/admissions/quote', {
        branch_id: branchId,
        membership_plan_id: planId,
        start_date: startDate,
        discount: discount || '0.00',
      });
      setQuote(response.data);
      // Default to collecting the full amount, which is the common case.
      setPaymentAmount(response.data.total);
    } catch (caught) {
      setQuote(null);
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not calculate the fee.',
      );
    } finally {
      setQuoteLoading(false);
    }
  }, [branchId, planId, startDate, discount]);

  useEffect(() => {
    if (step === 4) void refreshQuote();
  }, [step, refreshQuote]);

  /* -------------------------------- validation ------------------------- */

  function stepError(index: number): string | null {
    switch (index) {
      case 0:
        if (!branchId) return 'Select a branch.';
        if (useExisting && !studentId) return 'Select a student.';
        if (!useExisting && newStudent.full_name.trim().length < 2)
          return 'Enter the student’s full name.';
        if (!useExisting && !/^\d{10,15}$/.test(newStudent.mobile.trim()))
          return 'Enter a valid mobile number (10–15 digits).';
        return null;
      case 1:
        return planId ? null : 'Select a membership plan.';
      default:
        return null;
    }
  }

  function next() {
    const problem = stepError(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  /* --------------------------------- submit ---------------------------- */

  async function submit() {
    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      branch_id: branchId,
      membership_plan_id: planId,
      batch_id: batchId || null,
      seat_id: seatId || null,
      start_date: startDate,
      discount: discount || '0.00',
      notes: notes || null,
    };

    if (useExisting) {
      payload.student_id = studentId;
    } else {
      payload.student = {
        full_name: newStudent.full_name.trim(),
        mobile: newStudent.mobile.trim(),
        email: newStudent.email.trim() || null,
        date_of_birth: newStudent.date_of_birth || null,
        address: newStudent.address.trim() || null,
      };
    }

    if (collectPayment && paymentAmount && Number(paymentAmount) > 0) {
      payload.payment = {
        amount: paymentAmount,
        payment_method: paymentMethod,
        transaction_reference: paymentReference || null,
      };
    }

    try {
      const result = await api.post<{ admission: { id: string }; student: { id: string } }>(
        '/admissions',
        payload,
      );
      toast.success(result.message);
      router.push(`/students/${result.data.student.id}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Could not reach the server. Please try again.',
      );
      setSubmitting(false);
    }
  }

  const selectedStudent = students.find((candidate) => candidate.id === studentId);
  const selectedPlan = plans.find((candidate) => candidate.id === planId);
  const selectedBatch = batches.find((candidate) => candidate.id === batchId);
  const selectedSeat = seats.find((candidate) => candidate.id === seatId);

  return (
    <div className="max-w-4xl">
      <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Admission steps">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              // Steps already completed can be revisited; the ones ahead cannot
              // be jumped to until their prerequisites validate.
              onClick={() => index <= step && setStep(index)}
              disabled={index > step}
              aria-current={index === step ? 'step' : undefined}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                index === step
                  ? 'bg-brand text-white'
                  : index < step
                    ? 'bg-brand-subtle text-brand hover:bg-brand/20'
                    : 'bg-surface-sunken text-content-subtle',
              )}
            >
              <span className="tabular-nums opacity-70">{index + 1}.</span> {label}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {step === 0 && (
        <Card title="Student information">
          <div className="space-y-4">
            <SelectField
              label="Branch"
              required
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setStudentId('');
                setBatchId('');
                setSeatId('');
              }}
              placeholder="Select a branch"
              options={activeBranches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
              hint="Only active branches can take new admissions."
            />

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-content">Student</legend>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={useExisting ? 'primary' : 'secondary'}
                  onClick={() => setUseExisting(true)}
                >
                  Existing student
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!useExisting ? 'primary' : 'secondary'}
                  onClick={() => setUseExisting(false)}
                >
                  New student
                </Button>
              </div>
            </fieldset>

            {useExisting ? (
              <SelectField
                label="Select student"
                required
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                placeholder={
                  !branchId
                    ? 'Choose a branch first'
                    : students.length === 0
                      ? 'No students in this branch yet'
                      : 'Select a student'
                }
                options={students.map((student) => ({
                  value: student.id,
                  label: `${student.full_name} · ${student.student_code} · ${student.mobile}`,
                }))}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Full name"
                  required
                  value={newStudent.full_name}
                  onChange={(event) =>
                    setNewStudent({ ...newStudent, full_name: event.target.value })
                  }
                  containerClassName="sm:col-span-2"
                />
                <InputField
                  label="Mobile"
                  required
                  inputMode="numeric"
                  value={newStudent.mobile}
                  onChange={(event) =>
                    setNewStudent({ ...newStudent, mobile: event.target.value })
                  }
                />
                <InputField
                  label="Email"
                  type="email"
                  value={newStudent.email}
                  onChange={(event) =>
                    setNewStudent({ ...newStudent, email: event.target.value })
                  }
                />
                <InputField
                  label="Date of birth"
                  type="date"
                  value={newStudent.date_of_birth}
                  onChange={(event) =>
                    setNewStudent({ ...newStudent, date_of_birth: event.target.value })
                  }
                />
                <TextareaField
                  label="Address"
                  value={newStudent.address}
                  onChange={(event) =>
                    setNewStudent({ ...newStudent, address: event.target.value })
                  }
                  containerClassName="sm:col-span-2"
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Membership plan" description="Pricing comes from the configured plan.">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  aria-pressed={planId === plan.id}
                  className={clsx(
                    'rounded-lg border p-4 text-left transition-colors',
                    planId === plan.id
                      ? 'border-brand bg-brand-subtle'
                      : 'border-border hover:border-brand/40 hover:bg-surface-sunken',
                  )}
                >
                  <p className="font-medium text-content">{plan.name}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-brand">
                    {formatMoney(plan.price)}
                  </p>
                  <p className="text-xs text-content-muted">{plan.duration_days} days</p>
                </button>
              ))}
              {plans.length === 0 && (
                <p className="text-sm text-content-muted">
                  No active membership plans. A Super Admin must create one first.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Start date"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
              <InputField
                label="Discount"
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                hint="Applied to the plan price. The server re-checks this."
              />
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Batch" description="Optional. Capacity is enforced at submission.">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setBatchId('')}
              aria-pressed={batchId === ''}
              className={clsx(
                'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                batchId === ''
                  ? 'border-brand bg-brand-subtle'
                  : 'border-border hover:bg-surface-sunken',
              )}
            >
              No batch for now
            </button>

            {batches.map((batch) => {
              const full = batch.available_slots <= 0;

              return (
                <button
                  key={batch.id}
                  type="button"
                  disabled={full}
                  onClick={() => setBatchId(batch.id)}
                  aria-pressed={batchId === batch.id}
                  className={clsx(
                    'flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition-colors',
                    batchId === batch.id
                      ? 'border-brand bg-brand-subtle'
                      : 'border-border hover:bg-surface-sunken',
                    full && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium text-content">{batch.name}</span>
                    <span className="block text-xs text-content-muted">
                      {formatTime(batch.start_time)} – {formatTime(batch.end_time)}
                    </span>
                  </span>
                  <span
                    className={clsx(
                      'text-xs tabular-nums',
                      full ? 'text-danger' : 'text-content-muted',
                    )}
                  >
                    {full
                      ? 'Full'
                      : `${batch.available_slots} of ${batch.capacity} free`}
                  </span>
                </button>
              );
            })}

            {batches.length === 0 && (
              <p className="text-sm text-content-muted">
                No active batches in this branch.
              </p>
            )}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card
          title="Seat"
          description={`Optional. Showing seats free on ${formatDate(startDate)}.`}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSeatId('')}
              aria-pressed={seatId === ''}
              className={clsx(
                'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                seatId === ''
                  ? 'border-brand bg-brand-subtle'
                  : 'border-border hover:bg-surface-sunken',
              )}
            >
              No seat for now
            </button>

            {seats.length === 0 ? (
              <p className="text-sm text-content-muted">
                No seats are free on this date in this branch.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
                {seats.map((seat) => (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => setSeatId(seat.id)}
                    aria-pressed={seatId === seat.id}
                    className={clsx(
                      'rounded-lg border px-2 py-2.5 text-center transition-colors',
                      seatId === seat.id
                        ? 'border-brand bg-brand-subtle text-brand'
                        : 'border-border hover:bg-surface-sunken',
                    )}
                  >
                    <span className="block text-sm font-semibold tabular-nums">
                      {seat.seat_number}
                    </span>
                    <span className="block text-[10px] text-content-subtle">
                      {seat.floor ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="Fee summary" description="Calculated by the server from the selected plan.">
          {quoteLoading ? (
            <div className="h-32 animate-pulse rounded-lg bg-surface-sunken" />
          ) : quote ? (
            <dl className="space-y-2.5 text-sm">
              <SummaryRow label="Plan" value={quote.plan.name} />
              <SummaryRow
                label="Membership period"
                value={`${formatDate(quote.startDate)} – ${formatDate(quote.endDate)}`}
              />
              <SummaryRow label="Subtotal" value={formatMoney(quote.subtotal)} />
              <SummaryRow label="Discount" value={`− ${formatMoney(quote.discount)}`} />
              <SummaryRow label="Tax" value={formatMoney(quote.tax)} />
              <div className="flex items-center justify-between border-t border-border pt-2.5 text-base">
                <dt className="font-medium text-content">Total payable</dt>
                <dd className="font-semibold tabular-nums text-brand">
                  {formatMoney(quote.total)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-content-muted">
              Select a membership plan to see the fee summary.
            </p>
          )}
        </Card>
      )}

      {step === 5 && (
        <Card title="Payment" description="Record what the student is paying today.">
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={collectPayment}
                onChange={(event) => setCollectPayment(event.target.checked)}
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              Collect a payment now
            </label>

            {collectPayment && (
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Amount"
                  inputMode="decimal"
                  required
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  hint={quote ? `Balance due: ${formatMoney(quote.total)}` : undefined}
                />
                <SelectField
                  label="Method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'UPI', label: 'UPI' },
                    { value: 'BANK_TRANSFER', label: 'Bank transfer' },
                    { value: 'CARD', label: 'Card' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
                <InputField
                  label="Transaction reference"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  containerClassName="sm:col-span-2"
                  hint="UPI reference, cheque number, or similar. Optional."
                />
              </div>
            )}

            <TextareaField
              label="Notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </Card>
      )}

      {step === 6 && (
        <Card title="Confirm admission" description="Review before submitting.">
          <dl className="space-y-2.5 text-sm">
            <SummaryRow
              label="Branch"
              value={activeBranches.find((b) => b.id === branchId)?.name ?? '—'}
            />
            <SummaryRow
              label="Student"
              value={
                useExisting
                  ? (selectedStudent
                      ? `${selectedStudent.full_name} · ${selectedStudent.student_code}`
                      : '—')
                  : `${newStudent.full_name} (new) · ${newStudent.mobile}`
              }
            />
            <SummaryRow label="Plan" value={selectedPlan?.name ?? '—'} />
            <SummaryRow
              label="Period"
              value={quote ? `${formatDate(quote.startDate)} – ${formatDate(quote.endDate)}` : '—'}
            />
            <SummaryRow label="Batch" value={selectedBatch?.name ?? 'None'} />
            <SummaryRow label="Seat" value={selectedSeat?.seat_number ?? 'None'} />
            <SummaryRow label="Total" value={quote ? formatMoney(quote.total) : '—'} />
            <SummaryRow
              label="Paying now"
              value={
                collectPayment && paymentAmount
                  ? `${formatMoney(paymentAmount)} · ${paymentMethod.replace('_', ' ').toLowerCase()}`
                  : 'Nothing collected'
              }
            />
          </dl>

          <p className="mt-4 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-content-muted">
            Submitting creates the admission, invoice, seat allocation and batch enrolment
            together. If any part fails, none of it is saved.
          </p>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}>
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Continue</Button>
        ) : (
          <Button onClick={submit} loading={submitting} disabled={!quote}>
            Confirm admission
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-content-muted">{label}</dt>
      <dd className="text-right tabular-nums text-content">{value}</dd>
    </div>
  );
}
