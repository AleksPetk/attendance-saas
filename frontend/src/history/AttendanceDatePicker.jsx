import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dateInputIssue, isValidIsoDate } from "./attendanceReportDateRange.js";
import {
  MAX_CALENDAR_YEAR,
  MIN_CALENDAR_YEAR,
  YEAR_PAGE_SIZE,
  calendarMonthCells,
  initialYearPageStart,
  isoDateFromParts,
  parseIsoDateParts,
  pickerPosition,
  shiftCalendarMonth,
  shiftYearPage,
  yearPageValues,
} from "./attendanceDatePickerModel.js";

function localTodayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function localizedMonthNames(locale, style = "short") {
  const formatter = new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, month) =>
    formatter.format(new Date(Date.UTC(2020, month, 1))),
  );
}

function localizedWeekdays(locale) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, day) =>
    formatter.format(new Date(Date.UTC(2023, 0, day + 1))),
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M5.5 2.8v2.3m9-2.3v2.3M3.3 7.2h13.4M4.7 4.1h10.6c.8 0 1.4.6 1.4 1.4v10c0 .8-.6 1.4-1.4 1.4H4.7c-.8 0-1.4-.6-1.4-1.4v-10c0-.8.6-1.4 1.4-1.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AttendanceDatePicker({
  id,
  label,
  value,
  fallbackValue,
  issue,
  rangeError,
  locale,
  t,
  onCommit,
  onIssue,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState("days");
  const [viewYear, setViewYear] = useState(localTodayParts().year);
  const [viewMonth, setViewMonth] = useState(localTodayParts().month);
  const [focusDay, setFocusDay] = useState(localTodayParts().day);
  const [yearPageStart, setYearPageStart] = useState(initialYearPageStart(viewYear));
  const [position, setPosition] = useState(null);

  const monthNames = useMemo(() => localizedMonthNames(locale, "short"), [locale]);
  const longMonthNames = useMemo(() => localizedMonthNames(locale, "long"), [locale]);
  const weekdays = useMemo(() => localizedWeekdays(locale), [locale]);
  const monthCells = useMemo(
    () => calendarMonthCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const selected = parseIsoDateParts(value);
  const today = localTodayParts();
  const visibleYears = yearPageValues(yearPageStart);
  const visibleError = issue
    ? t(`report.dateValidation.${issue}`)
    : rangeError || "";

  function syncPosition() {
    if (!rootRef.current) return;
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    setPosition(pickerPosition(rootRef.current.getBoundingClientRect(), viewportWidth, viewportHeight));
  }

  function openPicker() {
    const typed = inputRef.current?.value || "";
    const initial =
      parseIsoDateParts(typed) ||
      parseIsoDateParts(value) ||
      parseIsoDateParts(fallbackValue) ||
      localTodayParts();
    setViewYear(initial.year);
    setViewMonth(initial.month);
    setFocusDay(initial.day);
    setYearPageStart(initialYearPageStart(initial.year));
    setViewMode("days");
    setOpen(true);
  }

  function closePicker({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function selectDay(day) {
    const nextValue = isoDateFromParts(viewYear, viewMonth, day);
    if (inputRef.current) inputRef.current.value = nextValue;
    onIssue(null);
    onCommit(nextValue);
    closePicker({ restoreFocus: true });
  }

  function changeMonth(delta) {
    const next = shiftCalendarMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
    setFocusDay(1);
  }

  useEffect(() => {
    if (!open) return undefined;
    syncPosition();

    function onPointerDown(event) {
      if (rootRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      closePicker();
    }
    function onKeyDown(event) {
      if (event.key === "Escape") closePicker({ restoreFocus: true });
    }
    function onViewportChange() {
      syncPosition();
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("scroll", onViewportChange);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("scroll", onViewportChange);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !popupRef.current) return;
    const preferred = popupRef.current.querySelector("[data-datepicker-autofocus]");
    preferred?.focus();
  }, [open, viewMode, viewMonth, viewYear, yearPageStart]);

  const popup = open && position ? (
    <div
      ref={popupRef}
      className={`attendance-date-picker-popup${position.openAbove ? " opens-above" : ""}`}
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
      role="dialog"
      aria-modal="false"
      aria-label={t("report.datePicker.dialogLabel", { field: label })}
    >
      {viewMode === "days" ? (
        <>
          <div className="attendance-date-picker-header">
            <button
              type="button"
              className="attendance-date-picker-nav"
              onClick={() => changeMonth(-1)}
              disabled={viewYear === MIN_CALENDAR_YEAR && viewMonth === 0}
              aria-label={t("report.datePicker.previousMonth")}
            >
              ‹
            </button>
            <div className="attendance-date-picker-heading">
              <button
                type="button"
                className="attendance-date-picker-heading-button"
                onClick={() => setViewMode("months")}
                aria-label={t("report.datePicker.chooseMonth")}
              >
                {longMonthNames[viewMonth]}
              </button>
              <button
                type="button"
                className="attendance-date-picker-heading-button"
                onClick={() => {
                  setYearPageStart(initialYearPageStart(viewYear));
                  setViewMode("years");
                }}
                aria-label={t("report.datePicker.chooseYear")}
              >
                {viewYear}
              </button>
            </div>
            <button
              type="button"
              className="attendance-date-picker-nav"
              onClick={() => changeMonth(1)}
              disabled={viewYear === MAX_CALENDAR_YEAR && viewMonth === 11}
              aria-label={t("report.datePicker.nextMonth")}
            >
              ›
            </button>
          </div>
          <div className="attendance-date-picker-weekdays" aria-hidden="true">
            {weekdays.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>
          <div className="attendance-date-picker-days">
            {monthCells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
              const isSelected =
                selected?.year === viewYear && selected?.month === viewMonth && selected?.day === day;
              const isToday =
                today.year === viewYear && today.month === viewMonth && today.day === day;
              return (
                <button
                  type="button"
                  key={day}
                  className={`${isSelected ? "is-selected " : ""}${isToday ? "is-today" : ""}`.trim()}
                  onClick={() => selectDay(day)}
                  data-datepicker-autofocus={
                    isSelected || (!selected && day === focusDay) ? "true" : undefined
                  }
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  aria-label={t("report.datePicker.selectDate", {
                    date: new Intl.DateTimeFormat(locale, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format((() => {
                      const date = new Date(Date.UTC(2000, viewMonth, day));
                      date.setUTCFullYear(viewYear);
                      return date;
                    })()),
                  })}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {viewMode === "months" ? (
        <>
          <div className="attendance-date-picker-header is-selection-header">
            <span>{t("report.datePicker.selectMonth")}</span>
            <button
              type="button"
              className="attendance-date-picker-heading-button"
              onClick={() => {
                setYearPageStart(initialYearPageStart(viewYear));
                setViewMode("years");
              }}
            >
              {viewYear}
            </button>
          </div>
          <div className="attendance-date-picker-months">
            {monthNames.map((monthName, month) => (
              <button
                type="button"
                key={monthName}
                className={month === viewMonth ? "is-selected" : ""}
                onClick={() => {
                  setViewMonth(month);
                  setFocusDay(1);
                  setViewMode("days");
                }}
                data-datepicker-autofocus={month === viewMonth ? "true" : undefined}
              >
                {monthName}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {viewMode === "years" ? (
        <>
          <div className="attendance-date-picker-header">
            <button
              type="button"
              className="attendance-date-picker-nav"
              onClick={() => setYearPageStart((start) => shiftYearPage(start, -1))}
              disabled={yearPageStart === MIN_CALENDAR_YEAR}
              aria-label={t("report.datePicker.previousYears")}
            >
              ‹
            </button>
            <strong>
              {visibleYears[0]}–{visibleYears[visibleYears.length - 1]}
            </strong>
            <button
              type="button"
              className="attendance-date-picker-nav"
              onClick={() => setYearPageStart((start) => shiftYearPage(start, 1))}
              disabled={yearPageStart + YEAR_PAGE_SIZE - 1 >= MAX_CALENDAR_YEAR}
              aria-label={t("report.datePicker.nextYears")}
            >
              ›
            </button>
          </div>
          <div className="attendance-date-picker-years">
            {visibleYears.map((year) => (
              <button
                type="button"
                key={year}
                className={year === viewYear ? "is-selected" : ""}
                onClick={() => {
                  setViewYear(year);
                  setViewMode("months");
                }}
                data-datepicker-autofocus={year === viewYear ? "true" : undefined}
              >
                {year}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="field history-field attendance-date-picker-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="attendance-date-picker-control" ref={rootRef}>
        <input
          ref={inputRef}
          id={id}
          className="history-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={value || ""}
          placeholder="YYYY-MM-DD"
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            onIssue(null);
            onCommit(isValidIsoDate(nextValue) ? nextValue : "");
          }}
          onBlur={(event) => {
            if (event.relatedTarget === triggerRef.current) return;
            const nextValue = event.currentTarget.value;
            const nextIssue = dateInputIssue(nextValue, false);
            onIssue(nextIssue);
            onCommit(nextIssue ? "" : nextValue);
          }}
          aria-invalid={Boolean(visibleError)}
          aria-haspopup="dialog"
          aria-expanded={open}
        />
        <button
          ref={triggerRef}
          type="button"
          className="attendance-date-picker-trigger"
          onClick={() => (open ? closePicker() : openPicker())}
          aria-label={t("report.datePicker.open", { field: label })}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <CalendarIcon />
        </button>
      </div>
      {visibleError ? <span className="field-error">{visibleError}</span> : null}
      {popup ? createPortal(popup, document.body) : null}
    </div>
  );
}
