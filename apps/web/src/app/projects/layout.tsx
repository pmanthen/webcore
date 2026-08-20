import { Sidebar } from "@/components/Sidebar";

export default function ProjectsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}
