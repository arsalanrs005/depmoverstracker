import { redirect } from 'next/navigation';

/** Import UI removed from production nav — use `npm run import:cdr` locally. */
export default function ImportPage() {
  redirect('/manager/dashboard');
}
