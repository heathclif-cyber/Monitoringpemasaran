import { useEffect, useState } from 'react'
import { Pencil, Trash2, Plus, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { client } from '@/lib/client'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import type { User, UserRole } from '@/types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  tamu: 'Tamu',
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-primary/10 text-primary',
  staff: 'bg-green-500/10 text-green-600',
  tamu: 'bg-muted text-muted-foreground',
}

export default function UsersPage() {
  const addNotification = useAppStore((s) => s.addNotification)
  const currentUser = useAuthStore((s) => s.user)

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  // Form state
  const [form, setForm] = useState({ username: '', password: '', nama_lengkap: '', role: 'staff' as UserRole })
  const [editForm, setEditForm] = useState({ nama_lengkap: '', role: 'staff' as UserRole, is_active: true })
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchUsers = async () => {
    try {
      const data = await client.get<User[]>('/api/users')
      setUsers(data)
    } catch {
      addNotification('Gagal memuat data user', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.nama_lengkap) {
      addNotification('Semua field wajib diisi', 'error'); return
    }
    setSubmitting(true)
    try {
      await client.post('/api/users', form)
      addNotification('User berhasil dibuat', 'success')
      setCreateOpen(false)
      setForm({ username: '', password: '', nama_lengkap: '', role: 'staff' })
      fetchUsers()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal membuat user', 'error')
    } finally { setSubmitting(false) }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    setSubmitting(true)
    try {
      await client.put(`/api/users/${editTarget.id}`, editForm)
      addNotification('User berhasil diperbarui', 'success')
      setEditTarget(null)
      fetchUsers()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal memperbarui user', 'error')
    } finally { setSubmitting(false) }
  }

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) {
      addNotification('Password baru wajib diisi', 'error'); return
    }
    setSubmitting(true)
    try {
      await client.post(`/api/users/${resetTarget.id}/reset-password`, { new_password: newPassword })
      addNotification('Password berhasil direset', 'success')
      setResetTarget(null)
      setNewPassword('')
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal reset password', 'error')
    } finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSubmitting(true)
    try {
      await client.delete(`/api/users/${deleteTarget.id}`)
      addNotification('User berhasil dihapus', 'success')
      setDeleteTarget(null)
      fetchUsers()
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Gagal menghapus user', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Manajemen User</h2>
          <p className="text-sm text-muted-foreground">{users.length} user terdaftar</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> Tambah User
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Nama Lengkap</th>
              <th className="text-left px-4 py-2.5 font-medium">Username</th>
              <th className="text-left px-4 py-2.5 font-medium">Role</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Memuat...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada user</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{u.nama_lengkap}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.is_active ? 'default' : 'secondary'} className="text-xs">
                    {u.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      title="Edit user"
                      onClick={() => { setEditTarget(u); setEditForm({ nama_lengkap: u.nama_lengkap, role: u.role, is_active: u.is_active }) }}>
                      <Pencil size={13} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      title="Reset password"
                      onClick={() => { setResetTarget(u); setNewPassword('') }}>
                      <KeyRound size={13} />
                    </Button>
                    {u.id !== currentUser?.id && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Hapus user"
                        onClick={() => setDeleteTarget(u)}>
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog Tambah User */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Tambah User Baru</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nama Lengkap</Label>
              <Input value={form.nama_lengkap} onChange={(e) => setForm({ ...form, nama_lengkap: e.target.value })} placeholder="Nama lengkap" />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username untuk login" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password awal" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="tamu">Tamu</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Edit User */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit User — {editTarget?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nama Lengkap</Label>
              <Input value={editForm.nama_lengkap} onChange={(e) => setEditForm({ ...editForm, nama_lengkap: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="tamu">Tamu</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_active" className="cursor-pointer">Akun aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Batal</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Reset Password */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password — {resetTarget?.username}</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Password Baru</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Masukkan password baru" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Batal</Button>
            <Button onClick={handleResetPassword} disabled={submitting}>{submitting ? 'Memproses...' : 'Reset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Hapus User */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus User</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Yakin ingin menghapus user <strong>{deleteTarget?.username}</strong>? Tindakan ini tidak bisa dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
