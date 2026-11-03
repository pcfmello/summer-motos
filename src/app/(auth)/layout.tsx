export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      {children}
    </main>
  );
}
