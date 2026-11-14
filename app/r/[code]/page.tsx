import type { Metadata } from "next";
import { RoomScreen } from "@/components/room/RoomScreen";

export const metadata: Metadata = { title: "Room" };

export default async function RoomPage(props: PageProps<"/r/[code]">) {
  const { code } = await props.params;
  const upper = code.toUpperCase();
  return <RoomScreen key={upper} code={upper} />;
}
