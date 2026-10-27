export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Requested-With", "Lectory");
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({
        detail: "Не удалось связаться с сервером. Повторите запрос.",
      }));
    const message =
      typeof data.detail === "string"
        ? data.detail
        : "Проверьте заполнение полей. Пароль должен содержать не менее 10 символов.";
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const json = (data: unknown) => JSON.stringify(data);
export type User = {
  id: string;
  name: string;
  email: string;
  role: "viewer" | "teacher" | "admin";
  avatar: number;
  avatar_url: string | null;
};
export type Segment = {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
};
export type Lecture = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  course: string | null;
  course_id: string | null;
  author: string;
  author_avatar: number;
  author_avatar_url: string | null;
  source: string;
  source_url: string | null;
  external_id: string | null;
  cover: string;
  status: string;
  duration: number;
  error: string | null;
  is_demo: number;
  created_at: string;
  has_media?: boolean;
  summary?: string;
  summary_mode?: string;
  segments?: Segment[];
  outline?: { title: string; start_seconds: number; level: number }[];
  terms?: { term: string; start_seconds: number }[];
  job?: { stage: string; progress: number; status: string };
};
export type Hit = {
  id: string;
  lecture_id: string;
  title: string;
  cover: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  score: number;
};
export type SavedMoment = {
  id: string;
  lecture_id: string;
  seconds: number;
  title?: string;
  text?: string;
  lecture_title: string;
  cover: string;
};
export type Suggestion = {
  id: string;
  url: string;
  comment: string;
  status: string;
  reason: string;
  author?: string;
  lecture_id?: string;
};
export type Library = {
  bookmarks: SavedMoment[];
  notes: SavedMoment[];
  suggestions: Suggestion[];
};
export const timecode = (time: number) => {
  const n = Math.max(0, Math.floor(time));
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
export const duration = (time: number) =>
  time >= 60 ? `${Math.ceil(time / 60)} мин` : `${Math.ceil(time)} сек`;
export const roleLabel = {
  viewer: "Зритель",
  teacher: "Преподаватель",
  admin: "Администратор",
};
export const statusLabel: Record<string, string> = {
  ready: "Готова к просмотру",
  queued: "В очереди",
  processing: "Обрабатывается",
  failed: "Ошибка обработки",
  needs_transcript: "Нужны субтитры",
  pending: "На рассмотрении",
  approved: "Одобрено",
  rejected: "Отклонено",
};
