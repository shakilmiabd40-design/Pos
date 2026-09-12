"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => {
        setNeedsSetup(!!data.needsSetup);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Setup failed");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="text-sm text-ink/50">Checking setup status...</div>
      </main>
    );
  }

  if (!needsSetup && !done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-2xl font-serif text-ink mb-2">Already set up</div>
          <p className="text-sm text-ink/60 mb-4">An admin account already exists for this shop.</p>
          <a href="/login" className="btn-primary inline-block">
            Go to login
          </a>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-2xl font-serif text-ink mb-2">Admin account created</div>
          <p className="text-sm text-ink/60">Taking you to the login page...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-serif text-ink">Shoe Shop</div>
          <div className="text-sm text-ink/60 mt-1">First-time setup — create your admin account</div>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4">
          {error && (
            <div className="text-sm text-clay bg-clay/10 border border-clay/30 rounded-md px-3 py-2">{error}</div>
          )}
          <div>
            <label className="label">Your name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input className="input" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Creating..." : "Create admin account"}
          </button>
        </form>
      </div>
    </main>
  );
}
