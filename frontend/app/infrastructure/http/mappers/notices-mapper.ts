import type { NoticeModel } from "@application/notices/models";
import type { NoticeDto } from "../schemas/notices";
export function mapNotice(dto: NoticeDto): NoticeModel {
  return {
    id: dto.id,
    title: dto.title,
    safeBody: dto.body_html,
    contentLocale: dto.content_locale,
    remind: dto.remind,
    remindOnce: dto.remind_once,
    publishedAt: dto.published_at,
    revision: dto.revision,
  };
}
