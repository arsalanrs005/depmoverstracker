import { NextResponse } from 'next/server';
import { parseCdrCsv } from '@/lib/cdr-parser';
import { importCdrRows } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function checkImportAuth(request: Request): boolean {
  const secret = process.env.IMPORT_API_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!checkImportAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';
    let csvText = '';
    let filename: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (file instanceof File) {
        csvText = await file.text();
        filename = file.name;
      } else {
        csvText = String(form.get('csv') ?? '');
      }
    } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      csvText = await request.text();
    } else {
      const body = await request.json();
      csvText = body.csv ?? body.content ?? '';
      filename = body.filename;
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
    }

    const parsed = parseCdrCsv(csvText);
    const result = await importCdrRows(parsed, filename);

    return NextResponse.json({
      ok: true,
      parsed: parsed.length,
      ...result,
    });
  } catch (err) {
    console.error('CDR import error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
