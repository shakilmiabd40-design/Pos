"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { MODULES } from "@/lib/permissions";
import { EmptyRow } from "@/components/EmptyState";

type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  active: boolean;
  permissions: string[];
};

export default function UsersPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    try {
      setUsers(await api<User[]>("/api/users"));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function togglePermission(key: string) {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  function toggleEditPermission(key: string) {
    setEditPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({ name, email, password, role, permissions }) });
      setName("");
      setEmail("");
      setPassword("");
      setRole("STAFF");
      setPermissions([]);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleActive(u: User) {
    try {
      await api(`/api/users/${u.id}`, { method: "PUT", body: JSON.stringify({ active: !u.active }) });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  function startEditPermissions(u: User) {
    setEditingId(u.id);
    setEditPermissions(u.permissions || []);
  }

  async function savePermissions(u: User) {
    try {
      await api(`/api/users/${u.id}`, { method: "PUT", body: JSON.stringify({ permissions: editPermissions }) });
      setEditingId(null);
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this user?"))) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function resetPassword(id: string) {
    if (!newPassword || newPassword.length < 4) {
      setError("New password must be at least 4 characters");
      return;
    }
    setError("");
    try {
      await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ password: newPassword }) });
      setResetPasswordId(null);
      setNewPassword("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Users</h1>
      <p className="text-sm text-ink/60 mb-6">
        Staff accounts for the back office. Admin only. Give each staff member access to just the sections they need —
        changes apply next time that person logs in.
      </p>

      <form onSubmit={onSubmit} className="card mb-6 space-y-4">
        {error && <div className="text-sm text-clay">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>

        {role === "STAFF" && (
          <div>
            <label className="label">Sections this staff member can access</label>
            <div className="flex flex-wrap gap-3">
              {MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-1.5 text-sm text-ink/70 border border-line rounded-md px-2 py-1">
                  <input type="checkbox" checked={permissions.includes(m.key)} onChange={() => togglePermission(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary">Add user</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Access</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td className="max-w-xs">
                  {u.role === "ADMIN" ? (
                    <span className="text-xs text-ink/50">Full access</span>
                  ) : editingId === u.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {MODULES.map((m) => (
                          <label key={m.key} className="flex items-center gap-1 text-xs border border-line rounded px-1.5 py-0.5">
                            <input type="checkbox" checked={editPermissions.includes(m.key)} onChange={() => toggleEditPermission(m.key)} />
                            {m.label}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button className="text-moss text-xs hover:underline" onClick={() => savePermissions(u)}>
                          Save
                        </button>
                        <button className="text-ink/50 text-xs hover:underline" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink/60">
                        {u.permissions && u.permissions.length > 0
                          ? MODULES.filter((m) => u.permissions.includes(m.key))
                              .map((m) => m.label)
                              .join(", ")
                          : "No sections yet"}
                      </span>
                      <button className="text-moss text-xs hover:underline" onClick={() => startEditPermissions(u)}>
                        Edit
                      </button>
                    </div>
                  )}
                </td>
                <td>{u.active ? "Active" : "Disabled"}</td>
                <td className="whitespace-nowrap">
                  <button className="text-moss text-xs mr-3 hover:underline" onClick={() => toggleActive(u)}>
                    {u.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="text-moss text-xs mr-3 hover:underline"
                    onClick={() => {
                      setResetPasswordId(resetPasswordId === u.id ? null : u.id);
                      setNewPassword("");
                      setError("");
                    }}
                  >
                    Reset password
                  </button>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(u.id)}>
                    Delete
                  </button>
                  {resetPasswordId === u.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        className="input w-36"
                        type="password"
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button className="text-moss text-xs hover:underline" onClick={() => resetPassword(u.id)}>
                        Save
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <EmptyRow colSpan={6} icon="👤" title="No users yet." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
