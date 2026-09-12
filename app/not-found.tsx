import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-3">👟</div>
        <div className="font-serif text-2xl text-ink mb-2">Page not found</div>
        <p className="text-sm text-ink/60 mb-6">
          That page doesn&apos;t exist, or moved. Check the address, or head back to the dashboard.
        </p>
        <Link href="/" className="btn-primary inline-flex">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
