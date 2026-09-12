"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsSetup) {
          router.replace("/setup");
        } else {
          setCheckingSetup(false);
        }
      })
      .catch(() => setCheckingSetup(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed");
      return;
    }
    router.push(params.get("next") || "/");
    router.refresh();
  }

  if (checkingSetup) {
    return <div className="text-sm text-ink/50">Loading...</div>;
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="text-2xl font-serif text-ink">Shoe Shop</div>
        <div className="text-sm text-ink/60 mt-1">Sign in to the back office</div>
      </div>
      <form onSubmit={onSubmit} className="card space-y-4">
        {error && (
          <div className="text-sm text-clay bg-clay/10 border border-clay/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@shop.com"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
          />
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

