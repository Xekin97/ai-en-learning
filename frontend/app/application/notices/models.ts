import type { PageModel, UiLocale } from "../shared/models";
export interface NoticeModel {
  id: string;
  title: string;
  safeBody: string;
  contentLocale: UiLocale;
  remind: boolean;
  remindOnce: boolean;
  publishedAt: string;
  revision: string;
}
export interface NoticesPort {
  listNotices(input: {
    remindersOnly: boolean;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<PageModel<NoticeModel>>;
  getNotice(id: string): Promise<NoticeModel>;
}
