// Reading forms: the values of the named controls with their types. Without other DOM than the
// form that it reads (it can be tested with a fake one).

/** The value of a control: checkbox → true/false, number → number, data-type="json" → its JSON,
 *  data-type="list" → the comma-separated items; the rest, its text */
function valueOf(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number") return el.value === "" ? null : Number(el.value);
  if (el.dataset?.type === "json") return JSON.parse(el.value);
  if (el.dataset?.type === "list") return el.value.split(",").map((x) => x.trim()).filter(Boolean);
  return el.value;
}

/** {name: value} of the enabled controls with a name (of a group of radios, the checked one).
 *  bySection: {section: {name: value}}, by their data-section (the others are left out). */
export function formValues(form, { bySection = false } = {}) {
  const values = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.disabled || (el.type === "radio" && !el.checked) || el.type === "file") continue;
    if (bySection) {
      const section = el.dataset?.section;
      if (section) (values[section] ??= {})[el.name] = valueOf(el);
    } else {
      values[el.name] = valueOf(el);
    }
  }
  return values;
}

/** What changed between two readings by section: {section: {name: new value}} */
export function changes(before, after) {
  const res = {};
  for (const [section, values] of Object.entries(after)) {
    for (const [name, value] of Object.entries(values)) {
      if (JSON.stringify(before[section]?.[name]) !== JSON.stringify(value)) (res[section] ??= {})[name] = value;
    }
  }
  return res;
}
