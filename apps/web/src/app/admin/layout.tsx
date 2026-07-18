/**
 * The former standalone Admin panel has been folded into the unified Setup area
 * under `/settings`. Everything that used to live at `/admin/*` now redirects to
 * its new `/settings/*` home (see the redirect stubs in each subfolder), so this
 * layout is a thin pass-through kept only to serve those redirects.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
