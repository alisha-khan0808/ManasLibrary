'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';

/**
 * Print controls for the invoice document.
 *
 * `?auto=1` opens the browser's print dialog as soon as the page has
 * rendered, so "Print" on the invoice screen goes straight to the dialog
 * rather than making the user click twice. The parameter is stripped
 * afterwards, otherwise a refresh or a back-navigation would re-open it.
 */
export function PrintButton({ invoiceNumber }: { invoiceNumber: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';

  useEffect(() => {
    if (!auto) return;

    // One frame so fonts and layout settle before the dialog snapshots it.
    const timer = window.setTimeout(() => {
      window.print();
      router.replace(window.location.pathname);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [auto, router]);

  return (
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-content-muted">
        Preview of {invoiceNumber}. Choose “Save as PDF” in the print dialog to download it.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Back
        </Button>
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
    </div>
  );
}
