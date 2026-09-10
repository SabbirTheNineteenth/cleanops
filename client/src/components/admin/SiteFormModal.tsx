"use client";
import { useEffect, useState } from "react";
import { postJSON, patchJSON } from "@/lib/api";
import { Button, Input, Label, Select } from "@/components/ui";
import { Modal } from "@/components/Modal";

export interface SiteRecord {
  id: number;
  name: string;
  code: string;
  location: string;
  status: "active" | "inactive";
}

const EMPTY = { name: "", code: "", location: "", status: "active" };

export function SiteFormModal({
  open,
  onClose,
  onSaved,
  site,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  site?: SiteRecord | null;
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = !!site;

  useEffect(() => {
    if (open) {
      setError("");
      setForm(
        site
          ? { name: site.name, code: site.code, location: site.location ?? "", status: site.status }
          : EMPTY,
      );
    }
  }, [open, site]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (editing && site) {
        await patchJSON(`/sites/${site.id}`, form);
      } else {
        await postJSON("/sites", form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit site" : "Add site"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <Label>Code</Label>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DT-01" required />
        </div>
        <div>
          <Label>Location</Label>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create"}</Button>
        </div>
      </form>
    </Modal>
  );
}
