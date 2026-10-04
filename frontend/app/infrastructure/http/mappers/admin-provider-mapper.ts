import type { AdminProviderModel } from "@application/shared/models";
import type { AdminProviderDto } from "../schemas/admin";
import { mapAdminModelDto, mapModelConnectionDto } from "./index";
export function mapAdminProviderDto(
  dto: AdminProviderDto,
  revision: string,
): AdminProviderModel {
  return {
    connection: mapModelConnectionDto(dto.connection),
    models: dto.models.map((m) => mapAdminModelDto(m, revision)),
  };
}
