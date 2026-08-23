import { Field } from "../components.jsx";

export function HistorySelect({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  className = "",
  children,
}) {
  const isPlaceholder = Boolean(placeholder) && !value;
  return (
    <Field label={label} className={`history-field ${className}`.trim()}>
      <div className="history-select-wrap">
        <select
          id={id}
          className={`history-select${isPlaceholder ? " is-placeholder" : ""}`}
          value={value}
          onChange={onChange}
          disabled={disabled}
        >
          {placeholder ? (
            <option value="" disabled={!isPlaceholder}>
              {placeholder}
            </option>
          ) : null}
          {children}
        </select>
      </div>
    </Field>
  );
}

export function HistoryInput({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}) {
  return (
    <Field label={label} className={`history-field ${className}`.trim()}>
      <input
        id={id}
        className="history-input"
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </Field>
  );
}
