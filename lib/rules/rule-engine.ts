import type {
  ConditionGroup,
  ConditionLeaf,
  ConditionNode,
  DayOfWeek,
  DriveFileMetadata,
  EvaluationTrace,
  Pipeline,
  RoutingResult,
  TimeRange
} from "@/lib/domain/types";

export function evaluatePipelineRules(
  pipeline: Pipeline,
  file: DriveFileMetadata,
  timezone: string
): RoutingResult {
  const ruleTraces = pipeline.rules
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((rule) => {
      const trace = evaluateNode(rule.conditions, file, timezone);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        priority: rule.priority,
        matched: trace.matched,
        trace
      };
    });

  const matchedTrace = ruleTraces.find((trace) => trace.matched);
  const matchedRule = matchedTrace
    ? pipeline.rules.find((rule) => rule.id === matchedTrace.ruleId)
    : undefined;

  const playlist = matchedRule?.playlist;
  const titleTemplate = matchedRule?.titleTemplate || pipeline.defaultTitleTemplate;
  const descriptionTemplate =
    matchedRule?.descriptionTemplate || pipeline.defaultDescriptionTemplate;

  const templateContext = {
    filename: file.filename,
    filename_no_ext: filenameWithoutExtension(file.filename),
    date: formatDate(file.createdTime, timezone),
    time: formatTime(file.createdTime, timezone),
    rule_name: matchedRule?.name || "",
    playlist_name: playlist?.name || "",
    source_folder_name: pipeline.sourceFolderName
  };

  return {
    matchedRule,
    playlist,
    title: renderTemplate(titleTemplate, templateContext),
    description: renderTemplate(descriptionTemplate, templateContext),
    ruleTraces
  };
}

export function validateCondition(condition: ConditionLeaf): string | undefined {
  if (condition.field === "filename" && condition.operator === "matches_regex") {
    try {
      new RegExp(String(condition.value));
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid regular expression.";
    }
  }

  if (condition.field === "time_of_day") {
    if (condition.operator === "between") {
      const range = condition.value as TimeRange;
      if (!isTime(range.start) || !isTime(range.end)) {
        return "Use HH:mm for both start and end times.";
      }
    } else if (!isTime(String(condition.value))) {
      return "Use HH:mm for the time value.";
    }
  }

  return undefined;
}

function evaluateNode(
  node: ConditionNode,
  file: DriveFileMetadata,
  timezone: string
): EvaluationTrace {
  if (node.type === "group") {
    return evaluateGroup(node, file, timezone);
  }

  return evaluateCondition(node, file, timezone);
}

function evaluateGroup(
  group: ConditionGroup,
  file: DriveFileMetadata,
  timezone: string
): EvaluationTrace {
  const children = group.children.map((child) => evaluateNode(child, file, timezone));
  const matched =
    group.children.length > 0 &&
    (group.combinator === "AND"
      ? children.every((child) => child.matched)
      : children.some((child) => child.matched));

  return {
    nodeId: group.id,
    type: "group",
    combinator: group.combinator,
    matched,
    children
  };
}

function evaluateCondition(
  condition: ConditionLeaf,
  file: DriveFileMetadata,
  timezone: string
): EvaluationTrace {
  const validationMessage = validateCondition(condition);
  if (validationMessage) {
    return {
      nodeId: condition.id,
      type: "condition",
      field: condition.field,
      operator: condition.operator,
      matched: false,
      expected: condition.value,
      actual: actualForField(condition, file, timezone),
      message: validationMessage
    };
  }

  const actual = actualForField(condition, file, timezone);
  const matched = matchCondition(condition, actual);

  return {
    nodeId: condition.id,
    type: "condition",
    field: condition.field,
    operator: condition.operator,
    matched,
    expected: condition.value,
    actual
  };
}

function actualForField(condition: ConditionLeaf, file: DriveFileMetadata, timezone: string) {
  if (condition.field === "filename") {
    return file.filename;
  }

  if (condition.field === "file_type") {
    return file.extension || extensionFromFilename(file.filename) || file.mimeType;
  }

  if (condition.field === "day_of_week") {
    return dayOfWeek(file.createdTime, timezone);
  }

  return formatTime(file.createdTime, timezone);
}

function matchCondition(condition: ConditionLeaf, actual: unknown): boolean {
  if (condition.field === "filename") {
    const rawActual = String(actual);
    const rawExpected = String(condition.value);
    const actualValue = condition.caseSensitive ? rawActual : rawActual.toLowerCase();
    const expectedValue = condition.caseSensitive ? rawExpected : rawExpected.toLowerCase();

    switch (condition.operator) {
      case "contains":
        return actualValue.includes(expectedValue);
      case "starts_with":
        return actualValue.startsWith(expectedValue);
      case "ends_with":
        return actualValue.endsWith(expectedValue);
      case "equals":
        return actualValue === expectedValue;
      case "matches_wildcard":
        return wildcardToRegExp(rawExpected, condition.caseSensitive).test(rawActual);
      case "matches_regex": {
        // Bound the input length to keep a pathological user-supplied pattern
        // from spending unbounded CPU on a long filename and DoSing the
        // worker (ISSUE-015). A proper RE2 / worker-thread sandbox is the
        // right long-term fix; the cap is a pragmatic first line of defense.
        const MAX_REGEX_INPUT = 1024;
        const MAX_PATTERN = 256;
        if (rawActual.length > MAX_REGEX_INPUT || rawExpected.length > MAX_PATTERN) {
          return false;
        }
        return new RegExp(rawExpected, condition.caseSensitive ? "" : "i").test(rawActual);
      }
      default:
        return false;
    }
  }

  if (condition.field === "file_type") {
    if (condition.operator === "is_one_of") {
      return asArray(condition.value).includes(String(actual));
    }

    return String(actual) === String(condition.value);
  }

  if (condition.field === "day_of_week") {
    if (condition.operator === "is") {
      return actual === condition.value;
    }
    if (condition.operator === "is_not") {
      return actual !== condition.value;
    }
    if (condition.operator === "is_one_of") {
      return asArray(condition.value).includes(String(actual));
    }
  }

  if (condition.field === "time_of_day") {
    const actualMinutes = timeToMinutes(String(actual));
    if (condition.operator === "between") {
      const range = condition.value as TimeRange;
      const start = timeToMinutes(range.start);
      const end = timeToMinutes(range.end);
      return start <= end
        ? actualMinutes >= start && actualMinutes <= end
        : actualMinutes >= start || actualMinutes <= end;
    }
    if (condition.operator === "before") {
      return actualMinutes < timeToMinutes(String(condition.value));
    }
    if (condition.operator === "after") {
      return actualMinutes > timeToMinutes(String(condition.value));
    }
  }

  return false;
}

export function renderTemplate(
  template: string,
  context: Record<string, string | undefined>
): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => context[key] ?? "");
}

function wildcardToRegExp(pattern: string, caseSensitive = false): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, caseSensitive ? "" : "i");
}

function filenameWithoutExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(0, index) : filename;
}

function extensionFromFilename(filename: string): string | undefined {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(index + 1).toLowerCase() : undefined;
}

function formatDate(isoDate: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(isoDate));
}

function formatTime(isoDate: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(isoDate));

  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

function dayOfWeek(isoDate: string, timezone: string): DayOfWeek {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short"
  }).format(new Date(isoDate));
  return weekday as DayOfWeek;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
