import Link from "next/link";
import { Penguin } from "@/components/Penguin";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <Penguin avatar="navy" mood="sad" className="h-28 w-24" />
        <h1 className="mt-4 text-4xl font-bold">Nothing but open water</h1>
        <p className="mt-2 text-lg text-ink-soft">This page does not exist.</p>
        <Link href="/" className="mt-6 font-bold text-primary underline underline-offset-2">
          Back to the start
        </Link>
      </main>
    </>
  );
}
