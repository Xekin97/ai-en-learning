import type { DisplaySegmentModel } from "@application/shared/models";
import type { OccurrenceDto, SpanDto } from "../schemas/generation";

export class ContractMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractMappingError";
  }
}

interface LocatedSpan extends SpanDto {
  surface?: string;
}

export function mapCodePointSpansToSegments(
  text: string,
  spans: readonly LocatedSpan[],
): DisplaySegmentModel[] {
  const points = Array.from(text);
  validateSpans(points, spans);
  const segments: DisplaySegmentModel[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor)
      segments.push({
        kind: "text",
        text: points.slice(cursor, span.start).join(""),
      });
    const target = points.slice(span.start, span.end).join("");
    if (
      "surface" in span &&
      span.surface !== undefined &&
      target !== span.surface
    ) {
      throw new ContractMappingError(
        "Occurrence surface does not match the source text",
      );
    }
    segments.push({ kind: "target", text: target });
    cursor = span.end;
  }
  if (cursor < points.length)
    segments.push({ kind: "text", text: points.slice(cursor).join("") });
  return segments;
}

export function mergePassageOccurrences(
  text: string,
  targetOccurrences: readonly (readonly OccurrenceDto[])[],
): DisplaySegmentModel[] {
  const merged = targetOccurrences.flatMap((occurrences) =>
    occurrences.map((occurrence) => ({ ...occurrence })),
  );
  merged.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  return mapCodePointSpansToSegments(text, merged);
}

function validateSpans(points: string[], spans: readonly LocatedSpan[]): void {
  if (spans.length === 0)
    throw new ContractMappingError("At least one span is required");
  let previousEnd = -1;
  for (const span of spans) {
    if (
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < 0 ||
      span.start >= span.end ||
      span.end > points.length
    ) {
      throw new ContractMappingError("Span is outside the source text");
    }
    if (span.start < previousEnd)
      throw new ContractMappingError("Spans overlap or are not ordered");
    previousEnd = span.end;
  }
}
