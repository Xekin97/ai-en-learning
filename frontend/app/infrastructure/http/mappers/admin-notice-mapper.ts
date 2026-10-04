import type { AdminNoticeDto } from "../schemas/admin-notices";
import type { AdminNoticeModel, Bilingual } from "@application/admin/notices";
export const bilingual = (input: {
  zh_CN: string | null;
  en_US: string | null;
}): Bilingual => ({ zh: input.zh_CN, en: input.en_US });
export const bilingualBody = (input: Bilingual) => ({
  zh_CN: input.zh,
  en_US: input.en,
});
export function mapAdminNotice(
  input: AdminNoticeDto,
  revision: string,
): AdminNoticeModel {
  return {
    id: input.id,
    title: bilingual(input.title),
    bodyMarkdown: bilingual(input.body_markdown),
    visible: input.visible,
    remind: input.remind,
    remindOnce: input.remind_once,
    publishedAt: input.published_at,
    updatedAt: input.updated_at,
    revision,
  };
}
