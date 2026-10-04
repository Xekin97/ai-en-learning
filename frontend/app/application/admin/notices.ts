import type { PageModel } from "@application/shared/models";
export interface Bilingual {
  zh: string | null;
  en: string | null;
}
export interface AdminNoticeInput {
  title: Bilingual;
  bodyMarkdown: Bilingual;
  visible: boolean;
  remind: boolean;
  remindOnce: boolean;
}
export interface AdminNoticeModel extends AdminNoticeInput {
  id: string;
  publishedAt: string;
  updatedAt: string;
  revision: string;
}
export interface AdminNoticesPort {
  listAdminNotices(cursor?: string): Promise<PageModel<AdminNoticeModel>>;
  getAdminNotice(id: string): Promise<AdminNoticeModel>;
  saveAdminNotice(
    id: string | null,
    input: AdminNoticeInput,
    revision: string | null,
  ): Promise<AdminNoticeModel>;
  previewNotice(markdown: string): Promise<string>;
}
