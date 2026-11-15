// Two drivers implement this interface. The live one uses the HTTP routes and
// Firebase. The demo one runs the whole game inside the browser and is used
// when no Firebase settings are present.

import type {
  ApiErrorCode,
  CardBody,
  CreateRoomBody,
  CreateRoomResponse,
  DraftResponse,
  GuessBody,
  HostAction,
  JoinBody,
  JoinResponse,
  MeResponse,
  PublicRoom,
  SettingsPatch,
  Truths,
} from "@/lib/types";

export class ApiFailure extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(code: ApiErrorCode, message: string, status = 400) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
  }
}

export interface GameApi {
  mode: "live" | "demo";
  createRoom(body: CreateRoomBody): Promise<CreateRoomResponse>;
  joinRoom(code: string, body: JoinBody): Promise<JoinResponse>;
  leave(code: string, token: string): Promise<void>;
  updateSettings(code: string, token: string, patch: SettingsPatch): Promise<void>;
  start(code: string, token: string): Promise<void>;
  draft(code: string, token: string, truths: Truths): Promise<DraftResponse>;
  submitCard(code: string, token: string, body: CardBody): Promise<void>;
  guess(code: string, token: string, body: GuessBody): Promise<void>;
  tick(code: string, token: string, seq: number): Promise<void>;
  host(code: string, token: string, action: HostAction): Promise<void>;
  me(code: string, token: string): Promise<MeResponse>;
  subscribe(
    code: string,
    onRoom: (room: PublicRoom | null) => void,
    onError: (error: Error) => void,
  ): () => void;
  now(): number;
}

export const IS_LIVE =
  Boolean(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL) &&
  process.env.NEXT_PUBLIC_MOCK !== "1";

let cached: Promise<GameApi> | null = null;

export function loadApi(): Promise<GameApi> {
  if (!cached) {
    cached = IS_LIVE
      ? import("./live").then((m) => m.liveApi)
      : import("./demo").then((m) => m.demoApi);
  }
  return cached;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiFailure) return error.message;
  if (error instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
