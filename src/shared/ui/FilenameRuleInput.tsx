import Tagify from "@yaireo/tagify";
import "@yaireo/tagify/dist/tagify.css";
import { Button, Dropdown, Space, Tag } from "antd";
import { debounce } from "lodash-es";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stripInvisibleChars } from "../filename";
import {
  FILENAME_EXAMPLE_DATA,
  FILENAME_FIELDS,
  normalizeFilenameTemplate,
  renderFilenameTemplate,
  TEMPLATE_CLOSE,
  TEMPLATE_OPEN,
  type FilenameField,
  type FilenameTemplateData,
} from "../filename-template";
import { FILENAME_PRESETS } from "../settings";
import "./filename-rule-input.css";

export interface FilenameRuleInputProps {
  rule: string;
  onChange(rule: string): void;
  fields?: readonly FilenameField[];
  presets?: readonly string[];
  /** Extension shown in the example. */
  ext?: string;
  exampleData?: FilenameTemplateData;
  theme?: "light" | "dark";
}

/** Template text with its fields shown as chips, for the preset menu. */
function TemplatePreview({ template }: { template: string }) {
  const parts: ReactNode[] = [];
  template.split(TEMPLATE_OPEN).forEach((chunk, i) => {
    const [head = "", ...rest] = chunk.split(TEMPLATE_CLOSE);
    if (i === 0 || rest.length === 0) {
      parts.push(chunk);
      return;
    }
    parts.push(
      <Tag key={i} color="blue" style={{ marginInline: 2 }}>
        {normalizeFilenameTemplate(`${TEMPLATE_OPEN}${head}${TEMPLATE_CLOSE}`).slice(
          TEMPLATE_OPEN.length,
          -TEMPLATE_CLOSE.length,
        )}
      </Tag>,
      rest.join(TEMPLATE_CLOSE),
    );
  });
  return <span>{parts}</span>;
}

/** Field names currently used in a template. */
function usedFieldNames(rule: string): string[] {
  return normalizeFilenameTemplate(rule)
    .split(TEMPLATE_OPEN)
    .slice(1)
    .map((chunk) => chunk.split(TEMPLATE_CLOSE)[0] ?? "");
}

/**
 * Filename template editor: a Tagify "mix mode" input in which fields appear
 * as tags between free text. Tagify serialises tags with the same `-**…**-`
 * markers the template format uses.
 */
export function FilenameRuleInput({
  rule,
  onChange,
  fields = FILENAME_FIELDS,
  presets = FILENAME_PRESETS,
  ext = ".jpg",
  exampleData = FILENAME_EXAMPLE_DATA,
  theme = "light",
}: FilenameRuleInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tagifyRef = useRef<Tagify | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The last value this editor emitted, to tell external updates from echoes.
  const emittedRef = useRef(rule);
  const [initialRule] = useState(rule);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const tagify = new Tagify(textarea, {
      mode: "mix",
      pattern: /@/,
      placeholder: "Input naming rule",
      editTags: false,
      enforceWhitelist: true,
      whitelist: fields.map((field) => ({ value: field.value })),
      mixTagsInterpolator: [TEMPLATE_OPEN, TEMPLATE_CLOSE],
      duplicates: false,
      dropdown: { enabled: false },
    });
    tagifyRef.current = tagify;

    const emit = debounce(() => {
      let value = stripInvisibleChars(tagify.getMixedTagsAsString().trim());
      if (value.length === 0) {
        value = presets[0] ?? "";
        tagify.loadOriginalValues(value);
      }
      emittedRef.current = value;
      onChangeRef.current(value);
    }, 600);
    tagify.on("change", emit);

    return () => {
      emit.cancel();
      tagify.destroy();
      tagifyRef.current = null;
    };
    // Tagify owns the element after creation; settings changes need a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external changes (e.g. settings loaded from storage).
  useEffect(() => {
    const tagify = tagifyRef.current;
    if (tagify && rule !== emittedRef.current) {
      emittedRef.current = rule;
      tagify.loadOriginalValues(rule);
    }
  }, [rule]);

  const used = useMemo(() => usedFieldNames(rule), [rule]);

  const applyPreset = (preset: string) => {
    tagifyRef.current?.loadOriginalValues(preset);
    emittedRef.current = preset;
    onChange(preset);
  };

  const insertField = (field: string) => {
    tagifyRef.current?.addMixTags([{ value: field }]);
  };

  return (
    <Space direction="vertical" size={8} className={`tagify-wrapper ${theme}`}>
      <textarea ref={textareaRef} defaultValue={initialRule} />
      <div>
        <div className="bottom-bar">
          <Dropdown
            overlayClassName="tagify-dropdown"
            menu={{
              items: presets.map((preset) => ({ key: preset, label: <TemplatePreview template={preset} /> })),
              onClick: ({ key }) => applyPreset(key),
            }}
          >
            <Button size="small">Choose a preset</Button>
          </Dropdown>
          <Dropdown
            overlayClassName="tagify-dropdown"
            menu={{
              items: fields.map(({ value }) => ({ key: value, label: value, disabled: used.includes(value) })),
              onClick: ({ key }) => insertField(key),
            }}
          >
            <Button size="small">Insert a Field</Button>
          </Dropdown>
        </div>
        <div className="tagify-example">
          <span className="eg">example:</span>
          <span className="eg-txt">{renderFilenameTemplate({ rule, fields, data: exampleData, ext })}</span>
        </div>
      </div>
    </Space>
  );
}
